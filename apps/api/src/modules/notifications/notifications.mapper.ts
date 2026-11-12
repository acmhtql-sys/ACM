import { deepRedactSensitiveData } from '../audit-logs/audit-logs.security';

export type NotificationSeverity = 'info' | 'success' | 'warning';

export interface SystemNotificationDto {
  id: string;
  type: NotificationSeverity;
  title: string;
  message: string;
  link: string;
  categoryLabel: string;
  entity: string;
  action: string;
  actorName: string;
  createdAt: string;
}

export interface AuditLogNotificationSource {
  id: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  newValue?: unknown;
  createdAt: Date | string;
  user?: { fullName: string } | null;
}

interface EntityDescriptor {
  link: string;
  categoryLabel: string;
  entityLabel: string;
}

const ENTITY_META: Record<string, EntityDescriptor> = {
  Item: { link: '/items', categoryLabel: 'Linh kiện', entityLabel: 'linh kiện' },
  Category: { link: '/categories', categoryLabel: 'Danh mục', entityLabel: 'danh mục' },
  Kit: { link: '/kits', categoryLabel: 'Hộp Kit', entityLabel: 'hộp kit' },
  Location: { link: '/inventory', categoryLabel: 'Vị trí kho', entityLabel: 'vị trí kho' },
  StockTransaction: { link: '/transactions', categoryLabel: 'Giao dịch kho', entityLabel: 'giao dịch kho' },
  BorrowRequest: { link: '/borrow-return', categoryLabel: 'Mượn & Trả', entityLabel: 'phiếu mượn' },
  BorrowReturnOperation: { link: '/borrow-return', categoryLabel: 'Mượn & Trả', entityLabel: 'thao tác hoàn trả' },
  User: { link: '/users', categoryLabel: 'Người dùng', entityLabel: 'tài khoản' },
};

const ACTION_RULE_MAP: Record<string, { verb: string; type: NotificationSeverity }> = {
  CREATE: { verb: 'Tạo mới', type: 'success' },
  CREATE_ITEM: { verb: 'Thêm mới', type: 'success' },
  CREATE_KIT: { verb: 'Tạo mới', type: 'success' },
  CREATE_LOCATION: { verb: 'Thêm mới', type: 'success' },
  UPDATE: { verb: 'Cập nhật', type: 'info' },
  UPDATE_ITEM: { verb: 'Cập nhật', type: 'info' },
  UPDATE_KIT: { verb: 'Cập nhật', type: 'info' },
  UPDATE_LOCATION: { verb: 'Cập nhật', type: 'info' },
  UPDATE_ITEM_IMAGE: { verb: 'Cập nhật ảnh', type: 'info' },
  UPDATE_ITEM_STATUS: { verb: 'Đổi trạng thái', type: 'warning' },
  UPDATE_KIT_STATUS: { verb: 'Đổi trạng thái', type: 'info' },
  UPDATE_LOCATION_STATUS: { verb: 'Đổi trạng thái', type: 'warning' },
  UPDATE_STATUS: { verb: 'Đổi trạng thái', type: 'warning' },
  ACTIVATE_ITEM: { verb: 'Kích hoạt lại', type: 'success' },
  DEACTIVATE_ITEM: { verb: 'Ngưng hoạt động', type: 'warning' },
  ACTIVATE_LOCATION: { verb: 'Kích hoạt lại', type: 'success' },
  DEACTIVATE_LOCATION: { verb: 'Tạm khóa', type: 'warning' },
  DELETE: { verb: 'Xóa', type: 'warning' },
  DELETE_ITEM: { verb: 'Xóa', type: 'warning' },
  DELETE_KIT: { verb: 'Xóa', type: 'warning' },
  APPROVE: { verb: 'Phê duyệt', type: 'success' },
  REJECT: { verb: 'Từ chối', type: 'warning' },
  CANCEL: { verb: 'Hủy', type: 'warning' },
  HANDOVER: { verb: 'Bàn giao thiết bị', type: 'success' },
  RETURN: { verb: 'Hoàn trả thiết bị', type: 'success' },
  STAGE4C_RETURN_COMMIT: { verb: 'Ghi nhận hoàn trả', type: 'success' },
  IMPORT_STOCK: { verb: 'Nhập kho', type: 'success' },
  EXPORT_STOCK: { verb: 'Xuất kho', type: 'warning' },
  STOCK_TRANSFER: { verb: 'Chuyển kho', type: 'info' },
  STOCK_ADJUSTMENT: { verb: 'Kiểm kê điều chỉnh', type: 'warning' },
  RESET_PASSWORD: { verb: 'Đặt lại mật khẩu', type: 'warning' },
};

const STUDENT_ALLOWED_PUBLIC_ENTITIES = new Set(['Item', 'Category', 'Kit']);
const OPERATOR_ALLOWED_ENTITIES = new Set([
  'Item',
  'Category',
  'Kit',
  'Location',
  'StockTransaction',
  'BorrowRequest',
  'BorrowReturnOperation',
]);

export function parseSafeAuditPayload(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  let candidate: unknown = raw;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }
  const redacted = deepRedactSensitiveData(candidate);
  if (redacted && typeof redacted === 'object' && !Array.isArray(redacted)) {
    return redacted as Record<string, unknown>;
  }
  return {};
}

function pickSubjectLabel(payload: Record<string, unknown>, entityId: string): string {
  const code = typeof payload.code === 'string' && payload.code.trim() ? payload.code.trim() : null;
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  const fullName =
    typeof payload.fullName === 'string' && payload.fullName.trim() ? payload.fullName.trim() : null;
  const reqNum =
    typeof payload.requestNumber === 'string' && payload.requestNumber.trim()
      ? payload.requestNumber.trim()
      : null;
  const txNum =
    typeof payload.transactionNumber === 'string' && payload.transactionNumber.trim()
      ? payload.transactionNumber.trim()
      : null;

  if (code && name) return `${code} (${name})`;
  if (code) return code;
  if (name) return name;
  if (fullName) return fullName;
  if (reqNum) return reqNum;
  if (txNum) return txNum;
  if (entityId) return `#${entityId.slice(0, 8)}`;
  return '';
}

/**
 * Enforces RBAC visibility on notifications derived from AuditLog entries.
 * Students only receive public catalog changes (Item/Category/Kit) and their own borrow events.
 */
export function canUserReceiveAuditNotification(
  role: string | undefined,
  userId: string | undefined,
  log: Pick<AuditLogNotificationSource, 'entity' | 'userId' | 'newValue'>
): boolean {
  if (!role || !userId) return false;
  if (role === 'ADMIN') return true;
  if (role === 'LAB_MANAGER' || role === 'TECHNICIAN') {
    return OPERATOR_ALLOWED_ENTITIES.has(log.entity);
  }
  if (role === 'STUDENT') {
    if (STUDENT_ALLOWED_PUBLIC_ENTITIES.has(log.entity)) return true;
    if (log.entity === 'BorrowRequest' || log.entity === 'BorrowReturnOperation') {
      if (log.userId === userId) return true;
      const payload = parseSafeAuditPayload(log.newValue);
      return payload.borrowerId === userId;
    }
    return false;
  }
  return false;
}

export function mapAuditLogToNotification(
  log: AuditLogNotificationSource,
  viewerRole?: string
): SystemNotificationDto {
  const payload = parseSafeAuditPayload(log.newValue);
  const meta = ENTITY_META[log.entity] || {
    link: viewerRole === 'ADMIN' ? '/audit-logs' : '/dashboard',
    categoryLabel: 'Hệ thống',
    entityLabel: log.entity.toLowerCase(),
  };

  const rule = ACTION_RULE_MAP[log.action] || {
    verb: log.action.replace(/_/g, ' ').toLowerCase(),
    type: 'info' as NotificationSeverity,
  };

  const actorName = log.user?.fullName || 'Hệ thống';
  const subject = pickSubjectLabel(payload, log.entityId);
  const title = subject
    ? `${rule.verb} ${meta.entityLabel}: ${subject}`
    : `${rule.verb} ${meta.entityLabel}`;

  const detailReason =
    typeof payload.reason === 'string' && payload.reason.trim()
      ? ` — Lý do: ${payload.reason.trim()}`
      : typeof payload.rejectionReason === 'string' && payload.rejectionReason.trim()
      ? ` — Lý do: ${payload.rejectionReason.trim()}`
      : '';

  const message = `${actorName} đã thực hiện "${rule.verb.toLowerCase()}" trên ${meta.entityLabel}${subject ? ` ${subject}` : ''}${detailReason}.`;

  const createdAt =
    log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt);

  return {
    id: log.id,
    type: rule.type,
    title,
    message,
    link: meta.link,
    categoryLabel: meta.categoryLabel,
    entity: log.entity,
    action: log.action,
    actorName,
    createdAt,
  };
}
