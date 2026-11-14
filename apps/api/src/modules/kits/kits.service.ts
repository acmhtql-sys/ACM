import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../shared/AppError';
import { AuthenticatedUser } from '../../middleware/auth';
import {
  UserRole,
  KitStatus,
  KitSortField,
  SortOrder,
  KitResponse,
  PaginatedResponse,
  CreateKitInput,
  UpdateKitInput,
  UpdateKitStatusInput,
  QueryKitsInput,
} from '@acm/shared';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export function formatKitResponse(k: any): KitResponse {
  return {
    id: k.id,
    code: k.code,
    name: k.name,
    description: k.description ?? null,
    status: k.status,
    locationId: k.locationId ?? null,
    location: k.location
      ? {
          id: k.location.id,
          code: k.location.code,
          name: k.location.name,
        }
      : null,
    createdById: k.createdById ?? null,
    createdBy: k.createdBy
      ? {
          id: k.createdBy.id,
          fullName: k.createdBy.fullName,
          email: k.createdBy.email,
        }
      : null,
    items: (k.items || []).map((ki: any) => {
      const locMatch = ki.notes?.match(/\[LOC:([0-9a-fA-F-]+)\]/);
      const sourceLocationId = locMatch ? locMatch[1] : (k.locationId ?? null);
      const cleanNotes = ki.notes ? ki.notes.replace(/\[LOC:[0-9a-fA-F-]+\]\s*/g, '').trim() || null : null;
      return {
        id: ki.id,
        kitId: ki.kitId,
        itemId: ki.itemId,
        sourceLocationId,
        item: ki.item
          ? {
              id: ki.item.id,
              code: ki.item.code,
              name: ki.item.name,
              unit: ki.item.unit,
              type: ki.item.type,
            }
          : undefined,
        quantity: ki.quantity,
        notes: cleanNotes,
        createdAt: ki.createdAt,
      };
    }),
    totalItems: (k.items || []).reduce((acc: number, cur: any) => acc + (cur.quantity || 0), 0),
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}

/**
 * Executes a database operation within a Serializable transaction with bounded retry
 * on Prisma serialization failures (P2034) or PostgreSQL 40001 serialization errors.
 */
async function withSerializableRetry<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      });
    } catch (error: any) {
      attempt++;
      const isSerializationFailure =
        error?.code === 'P2034' ||
        (typeof error?.message === 'string' &&
          (error.message.includes('could not serialize access') ||
            error.message.includes('P2034')));

      if (attempt < maxRetries && isSerializationFailure) {
        // Exponential backoff with small random jitter
        const delay = 20 * Math.pow(2, attempt) + Math.floor(Math.random() * 20);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

export class KitsService {
  /**
   * Retrieves paginated list of kits with search, status, and location filtering.
   * RBAC: Accessible by all authenticated users.
   */
  async listKits(
    query: QueryKitsInput,
    _currentUser: AuthenticatedUser
  ): Promise<PaginatedResponse<KitResponse>> {
    const where: Prisma.KitWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.locationId) {
      where.locationId = query.locationId;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const sortByField = query.sortBy || KitSortField.CREATED_AT;
    const sortOrderVal = query.sortOrder || SortOrder.DESC;

    const [totalItems, kits] = await Promise.all([
      prisma.kit.count({ where }),
      prisma.kit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortByField]: sortOrderVal },
        include: {
          location: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          items: {
            include: {
              item: { select: { id: true, code: true, name: true, unit: true, type: true } },
            },
          },
        },
      }),
    ]);

    const items = kits.map((k) => formatKitResponse(k));
    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves a single kit with component items and location details.
   */
  async getKitById(id: string, _currentUser: AuthenticatedUser): Promise<KitResponse> {
    const kit = await prisma.kit.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
        items: {
          include: {
            item: { select: { id: true, code: true, name: true, unit: true, type: true } },
          },
        },
      },
    });

    if (!kit) {
      throw new AppError('Hộp kit không tồn tại trong hệ thống', 404);
    }

    return formatKitResponse(kit);
  }

  /**
   * Creates a new kit, validates available stock for component items inside Serializable transaction,
   * locks kitAllocated, and writes AuditLog in the exact same business transaction.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN.
   */
  async createKit(
    input: CreateKitInput,
    currentUser: AuthenticatedUser,
    meta?: RequestMetadata
  ): Promise<KitResponse> {
    if (currentUser.role === UserRole.STUDENT) {
      throw new AppError('Sinh viên không có quyền tạo hộp kit thực hành', 403);
    }

    // Service-level Guard: Kit AVAILABLE with items must strictly have a valid location
    if (!input.locationId) {
      throw new AppError('Vị trí lưu kho cho hộp kit (locationId) là bắt buộc', 400);
    }

    const normalizedCode = input.code.trim().toUpperCase();

    // Check code uniqueness
    const existing = await prisma.kit.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new AppError(`Mã hộp kit '${normalizedCode}' đã tồn tại trong hệ thống`, 409);
    }

    const loc = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true, isActive: true },
    });
    if (!loc) {
      throw new AppError('Vị trí lưu trữ hộp kit không tồn tại', 404);
    }
    if (!loc.isActive) {
      throw new AppError('Vị trí lưu trữ hộp kit đã bị vô hiệu hóa', 400);
    }

    // Verify all component items exist and are active
    const itemMap = new Map<string, { code: string; name: string }>();
    for (const kitItem of input.items) {
      const itemRecord = await prisma.item.findUnique({
        where: { id: kitItem.itemId },
        select: { id: true, code: true, name: true, isActive: true },
      });

      if (!itemRecord) {
        throw new AppError(`Linh kiện với ID '${kitItem.itemId}' không tồn tại`, 404);
      }
      if (!itemRecord.isActive) {
        throw new AppError(`Linh kiện '${itemRecord.name}' đã bị ngừng hoạt động`, 400);
      }
      itemMap.set(kitItem.itemId, { code: itemRecord.code, name: itemRecord.name });
    }

    // Serializable atomic transaction for stock validation + kit creation + kitAllocated CAS update + audit log
    return await withSerializableRetry(async (tx) => {
      // Validate available inventory inside the serializable transaction to eliminate TOCTOU races
      const allocatedItemsMeta: Array<{ itemId: string; locationId: string; quantity: number }> = [];

      if (input.locationId) {
        for (const kitItem of input.items) {
          // Effective source location: explicitly chosen locationId, or default to input.locationId
          let sourceLocId = kitItem.locationId || null;

          // If no locationId specified on item, check if input.locationId has stock
          if (!sourceLocId) {
            const locBal = await tx.stockBalance.findUnique({
              where: {
                itemId_locationId: {
                  itemId: kitItem.itemId,
                  locationId: input.locationId,
                },
              },
            });
            const locAvail = locBal
              ? Math.max(0, (locBal.onHand ?? 0) - (locBal.reserved ?? 0) - (locBal.quarantined ?? 0) - (locBal.kitAllocated ?? 0))
              : 0;

            if (locAvail >= kitItem.quantity) {
              sourceLocId = input.locationId;
            } else {
              // Automatically look up active location with enough available stock
              const allBals = await tx.stockBalance.findMany({
                where: { itemId: kitItem.itemId },
                include: { location: true },
              });
              const candidate = allBals.find((b) => {
                const a = Math.max(0, (b.onHand ?? 0) - (b.reserved ?? 0) - (b.quarantined ?? 0) - (b.kitAllocated ?? 0));
                return a >= kitItem.quantity;
              });
              sourceLocId = candidate ? candidate.locationId : input.locationId;
            }
          }

          const bal = await tx.stockBalance.findUnique({
            where: {
              itemId_locationId: {
                itemId: kitItem.itemId,
                locationId: sourceLocId,
              },
            },
            include: { item: { select: { code: true, name: true } }, location: { select: { code: true, name: true } } },
          });

          const itmInfo = itemMap.get(kitItem.itemId);
          const itemLabel = itmInfo ? `"${itmInfo.name}" (${itmInfo.code})` : `'${kitItem.itemId}'`;
          const locLabel = bal?.location ? `"${bal.location.name}" (${bal.location.code})` : `'${sourceLocId}'`;

          if (!bal) {
            throw new AppError(
              `Không tìm thấy thông tin tồn kho cho linh kiện ${itemLabel} tại vị trí ${locLabel}. Vui lòng nhập kho hoặc chọn khay/thùng chứa linh kiện này trước khi đóng hộp kit.`,
              400
            );
          }

          const onHand = bal.onHand ?? 0;
          const reserved = bal.reserved ?? 0;
          const quarantined = bal.quarantined ?? 0;
          const currentKitAllocated = bal.kitAllocated ?? 0;
          const available = Math.max(0, onHand - reserved - quarantined - currentKitAllocated);

          if (available < kitItem.quantity) {
            const shortName = itmInfo ? itmInfo.name : (bal.item?.name || kitItem.itemId);
            throw new AppError(
              `Không đủ tồn kho khả dụng cho linh kiện '${shortName}' tại vị trí ${locLabel} (cần: ${kitItem.quantity}, khả dụng: ${available})`,
              400
            );
          }

          // Atomic CAS update: only increment if current kitAllocated matches read value
          const updateResult = await tx.stockBalance.updateMany({
            where: {
              itemId: kitItem.itemId,
              locationId: sourceLocId,
              kitAllocated: currentKitAllocated,
            },
            data: {
              kitAllocated: { increment: kitItem.quantity },
            },
          });

          if (updateResult.count === 0) {
            throw new AppError(
              `Xung đột đồng thời khi cập nhật tồn kho linh kiện '${bal.item?.name || kitItem.itemId}'. Vui lòng thử lại.`,
              409
            );
          }

          allocatedItemsMeta.push({
            itemId: kitItem.itemId,
            locationId: sourceLocId,
            quantity: kitItem.quantity,
          });
        }
      }

      const createdKit = await tx.kit.create({
        data: {
          code: normalizedCode,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          status: KitStatus.AVAILABLE,
          locationId: input.locationId || null,
          createdById: currentUser.id,
        },
      });

      for (const item of input.items) {
        const allocMeta = allocatedItemsMeta.find((m) => m.itemId === item.itemId);
        const sourceLocId = allocMeta?.locationId || item.locationId || input.locationId;
        const cleanNotes = item.notes?.replace(/\[LOC:[0-9a-fA-F-]+\]\s*/g, '').trim() || null;
        const finalNotes = sourceLocId && sourceLocId !== input.locationId
          ? `[LOC:${sourceLocId}]${cleanNotes ? ' ' + cleanNotes : ''}`
          : cleanNotes;

        await tx.kitItem.create({
          data: {
            kitId: createdKit.id,
            itemId: item.itemId,
            quantity: item.quantity,
            notes: finalNotes,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: currentUser.id,
          action: 'CREATE_KIT',
          entity: 'Kit',
          entityId: createdKit.id,
          oldValue: Prisma.DbNull,
          newValue: {
            code: createdKit.code,
            name: createdKit.name,
            status: createdKit.status,
            locationId: createdKit.locationId,
            items: input.items,
          },
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
        },
      });

      const fullKit = await tx.kit.findUnique({
        where: { id: createdKit.id },
        include: {
          location: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          items: {
            include: {
              item: { select: { id: true, code: true, name: true, unit: true, type: true } },
            },
          },
        },
      });

      return formatKitResponse(fullKit!);
    });
  }

  /**
   * Updates kit details, component items, or location with inventory reconciliation.
   * RBAC: ADMIN, LAB_MANAGER, TECHNICIAN.
   */
  async updateKit(
    id: string,
    input: UpdateKitInput,
    currentUser: AuthenticatedUser,
    meta?: RequestMetadata
  ): Promise<KitResponse> {
    if (currentUser.role === UserRole.STUDENT) {
      throw new AppError('Sinh viên không có quyền chỉnh sửa hộp kit', 403);
    }

    const kit = await prisma.kit.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!kit) {
      throw new AppError('Hộp kit không tồn tại trong hệ thống', 404);
    }

    if (kit.status === KitStatus.ALLOCATED && input.items !== undefined) {
      throw new AppError('Không thể chỉnh sửa danh sách linh kiện khi hộp kit đang được phân bổ', 400);
    }

    // Service-level Guard: Do not allow removing location from active kit containing items
    if (input.locationId === null || (input.locationId === undefined && !kit.locationId && ((input.items && input.items.length > 0) || kit.items.length > 0))) {
      throw new AppError('Không thể gỡ bỏ vị trí kho khi hộp kit đang chứa linh kiện thành phần', 400);
    }

    const targetLocationId = input.locationId !== undefined ? input.locationId : kit.locationId;
    const currentLocationId = kit.locationId;
    const isKitActive = kit.status === KitStatus.AVAILABLE || kit.status === KitStatus.MAINTENANCE;

    // Check location if changed
    if (input.locationId && input.locationId !== kit.locationId) {
      const loc = await prisma.location.findUnique({
        where: { id: input.locationId },
        select: { id: true, isActive: true },
      });
      if (!loc || !loc.isActive) {
        throw new AppError('Vị trí mới cho hộp kit không hợp lệ hoặc đã bị vô hiệu hóa', 400);
      }
    }

    const hasItemsChanged = input.items !== undefined;
    const hasLocationChanged =
      input.locationId !== undefined && input.locationId !== kit.locationId;

    return await withSerializableRetry(async (tx) => {
      // If active and items or location is changing, reconcile stock allocation
      if (isKitActive && (hasItemsChanged || hasLocationChanged)) {
        // 1. Release previous allocation from old location
        if (currentLocationId) {
          for (const oldItem of kit.items) {
            const releaseResult = await tx.stockBalance.updateMany({
              where: {
                itemId: oldItem.itemId,
                locationId: currentLocationId,
                kitAllocated: { gte: oldItem.quantity },
              },
              data: {
                kitAllocated: { decrement: oldItem.quantity },
              },
            });

            if (releaseResult.count === 0) {
              throw new AppError(
                'Không thể giải phóng linh kiện do số lượng kitAllocated không đủ hoặc xung đột đồng thời',
                409
              );
            }
          }
        }

        // 2. Determine new items list
        const newItemsList = input.items !== undefined ? input.items : kit.items;

        // 3. Verify availability & allocate at target location inside transaction
        if (targetLocationId) {
          for (const item of newItemsList) {
            const bal = await tx.stockBalance.findUnique({
              where: {
                itemId_locationId: {
                  itemId: item.itemId,
                  locationId: targetLocationId,
                },
              },
              include: { item: { select: { name: true } } },
            });

            if (!bal) {
              throw new AppError(
                `Không tìm thấy thông tin tồn kho cho linh kiện '${item.itemId}' tại vị trí đích`,
                400
              );
            }

            const onHand = bal.onHand ?? 0;
            const reserved = bal.reserved ?? 0;
            const quarantined = bal.quarantined ?? 0;
            const currentKitAllocated = bal.kitAllocated ?? 0;
            const available = Math.max(0, onHand - reserved - quarantined - currentKitAllocated);

            if (available < item.quantity) {
              throw new AppError(
                `Không đủ tồn kho khả dụng cho linh kiện '${bal.item?.name || item.itemId}' (cần: ${item.quantity}, khả dụng: ${available})`,
                400
              );
            }

            const allocateResult = await tx.stockBalance.updateMany({
              where: {
                itemId: item.itemId,
                locationId: targetLocationId,
                kitAllocated: currentKitAllocated,
              },
              data: {
                kitAllocated: { increment: item.quantity },
              },
            });

            if (allocateResult.count === 0) {
              throw new AppError(
                `Xung đột đồng thời khi cập nhật tồn kho linh kiện '${bal.item?.name || item.itemId}'. Vui lòng thử lại.`,
                409
              );
            }
          }
        }
      }

      // Update Kit record
      await tx.kit.update({
        where: { id },
        data: {
          name: input.name !== undefined ? input.name.trim() : undefined,
          description: input.description !== undefined ? input.description?.trim() || null : undefined,
          locationId: input.locationId !== undefined ? input.locationId : undefined,
        },
      });

      // Update Kit items if provided
      if (input.items !== undefined) {
        await tx.kitItem.deleteMany({ where: { kitId: id } });
        for (const item of input.items) {
          await tx.kitItem.create({
            data: {
              kitId: id,
              itemId: item.itemId,
              quantity: item.quantity,
              notes: item.notes?.trim() || null,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: currentUser.id,
          action: 'UPDATE_KIT',
          entity: 'Kit',
          entityId: id,
          oldValue: {
            name: kit.name,
            locationId: kit.locationId,
            itemCount: kit.items.length,
          },
          newValue: {
            name: input.name !== undefined ? input.name : kit.name,
            locationId: targetLocationId,
            items: input.items || kit.items,
          },
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
        },
      });

      const updatedKit = await tx.kit.findUnique({
        where: { id },
        include: {
          location: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          items: {
            include: {
              item: { select: { id: true, code: true, name: true, unit: true, type: true } },
            },
          },
        },
      });

      return formatKitResponse(updatedKit!);
    });
  }

  /**
   * Updates kit status with FSM transition rules and stock release / re-allocation.
   * - AVAILABLE -> ALLOCATED: Kit assigned/in use.
   * - ALLOCATED -> AVAILABLE / MAINTENANCE: Kit returned from assignment.
   * - AVAILABLE / MAINTENANCE -> RETIRED: Kit disassembled, components released back to stock.
   * - RETIRED -> AVAILABLE: Re-commission kit, re-allocating components with availability check.
   */
  async updateKitStatus(
    id: string,
    input: UpdateKitStatusInput,
    currentUser: AuthenticatedUser,
    meta?: RequestMetadata
  ): Promise<KitResponse> {
    if (currentUser.role === UserRole.STUDENT) {
      throw new AppError('Sinh viên không có quyền cập nhật trạng thái hộp kit', 403);
    }

    const kit = await prisma.kit.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!kit) {
      throw new AppError('Hộp kit không tồn tại trong hệ thống', 404);
    }

    const currentStatus = kit.status;
    const targetStatus = input.status;

    // Idempotent: If target status matches current status, return without re-allocating or re-releasing
    if (currentStatus === targetStatus) {
      return this.getKitById(id, currentUser);
    }

    // Allowed FSM transitions
    const validTransitions: Record<KitStatus, KitStatus[]> = {
      [KitStatus.AVAILABLE]: [KitStatus.ALLOCATED, KitStatus.MAINTENANCE, KitStatus.RETIRED],
      [KitStatus.ALLOCATED]: [KitStatus.AVAILABLE, KitStatus.MAINTENANCE],
      [KitStatus.MAINTENANCE]: [KitStatus.AVAILABLE, KitStatus.RETIRED],
      [KitStatus.RETIRED]: [KitStatus.AVAILABLE],
    };

    if (!validTransitions[currentStatus]?.includes(targetStatus)) {
      throw new AppError(
        `Không thể chuyển trạng thái hộp kit từ '${currentStatus}' sang '${targetStatus}'`,
        400
      );
    }

    // Service-level Guard: Cannot transition to AVAILABLE if kit has items but no location
    if (targetStatus === KitStatus.AVAILABLE && !kit.locationId && kit.items.length > 0) {
      throw new AppError('Không thể chuyển trạng thái hộp kit sang AVAILABLE khi chưa có vị trí kho lưu trữ', 400);
    }

    return await withSerializableRetry(async (tx) => {
      // 1. If retiring kit: release component allocations back to inventory
      if (targetStatus === KitStatus.RETIRED && kit.locationId) {
        for (const item of kit.items) {
          const locMatch = item.notes?.match(/\[LOC:([0-9a-fA-F-]+)\]/);
          const sourceLocId: string | null = (locMatch ? locMatch[1] : kit.locationId) ?? null;

          if (!sourceLocId) continue;

          let releaseResult = await tx.stockBalance.updateMany({
            where: {
              itemId: item.itemId,
              locationId: sourceLocId,
              kitAllocated: { gte: item.quantity },
            },
            data: {
              kitAllocated: { decrement: item.quantity },
            },
          });

          if (releaseResult.count === 0 && sourceLocId !== kit.locationId) {
            releaseResult = await tx.stockBalance.updateMany({
              where: {
                itemId: item.itemId,
                locationId: kit.locationId,
                kitAllocated: { gte: item.quantity },
              },
              data: {
                kitAllocated: { decrement: item.quantity },
              },
            });
          }

          if (releaseResult.count === 0) {
            throw new AppError(
              'Không thể giải phóng linh kiện do số lượng kitAllocated không đủ hoặc đã được giải phóng',
              409
            );
          }
        }
      }

      // 2. If re-commissioning kit from RETIRED to AVAILABLE: check stock availability and re-allocate
      if (currentStatus === KitStatus.RETIRED && targetStatus === KitStatus.AVAILABLE && kit.locationId) {
        for (const item of kit.items) {
          const bal = await tx.stockBalance.findUnique({
            where: {
              itemId_locationId: {
                itemId: item.itemId,
                locationId: kit.locationId,
              },
            },
            include: { item: { select: { name: true } } },
          });

          if (!bal) {
            throw new AppError(
              `Không tìm thấy thông tin tồn kho cho linh kiện '${item.itemId}' tại vị trí hộp kit`,
              400
            );
          }

          const onHand = bal.onHand ?? 0;
          const reserved = bal.reserved ?? 0;
          const quarantined = bal.quarantined ?? 0;
          const currentKitAllocated = bal.kitAllocated ?? 0;
          const available = Math.max(0, onHand - reserved - quarantined - currentKitAllocated);

          if (available < item.quantity) {
            throw new AppError(
              `Không đủ tồn kho khả dụng để tái lắp ráp hộp kit cho linh kiện '${bal.item?.name || item.itemId}' (cần: ${item.quantity}, khả dụng: ${available})`,
              400
            );
          }

          const allocateResult = await tx.stockBalance.updateMany({
            where: {
              itemId: item.itemId,
              locationId: kit.locationId,
              kitAllocated: currentKitAllocated,
            },
            data: {
              kitAllocated: { increment: item.quantity },
            },
          });

          if (allocateResult.count === 0) {
            throw new AppError(
              `Xung đột đồng thời khi tái cấp phát linh kiện '${bal.item?.name || item.itemId}'. Vui lòng thử lại.`,
              409
            );
          }
        }
      }

      // Update status
      await tx.kit.update({
        where: { id },
        data: { status: targetStatus },
      });

      await tx.auditLog.create({
        data: {
          userId: currentUser.id,
          action: 'UPDATE_KIT_STATUS',
          entity: 'Kit',
          entityId: id,
          oldValue: { status: currentStatus },
          newValue: { status: targetStatus, notes: input.notes || null },
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
        },
      });

      const updated = await tx.kit.findUnique({
        where: { id },
        include: {
          location: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          items: {
            include: {
              item: { select: { id: true, code: true, name: true, unit: true, type: true } },
            },
          },
        },
      });

      return formatKitResponse(updated!);
    });
  }

  /**
   * Safely deletes a kit, releasing component allocations if kit is not already retired.
   * Rejects if kit is currently ALLOCATED.
   * RBAC: ADMIN, LAB_MANAGER.
   */
  async deleteKit(
    id: string,
    currentUser: AuthenticatedUser,
    meta?: RequestMetadata
  ): Promise<{ success: boolean; message: string }> {
    if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.LAB_MANAGER) {
      throw new AppError('Chỉ Quản trị viên hoặc Quản lý phòng Lab mới có quyền xóa hộp kit', 403);
    }

    const kit = await prisma.kit.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!kit) {
      throw new AppError('Hộp kit không tồn tại trong hệ thống', 404);
    }

    if (kit.status === KitStatus.ALLOCATED) {
      throw new AppError('Không thể xóa hộp kit đang được phân bổ / bàn giao cho người dùng', 400);
    }

    await withSerializableRetry(async (tx) => {
      // If kit was active (AVAILABLE or MAINTENANCE), release kitAllocated back to inventory
      if (kit.status !== KitStatus.RETIRED && kit.locationId) {
        for (const item of kit.items) {
          const locMatch = item.notes?.match(/\[LOC:([0-9a-fA-F-]+)\]/);
          const sourceLocId: string | null = (locMatch ? locMatch[1] : kit.locationId) ?? null;

          if (!sourceLocId) continue;

          let releaseResult = await tx.stockBalance.updateMany({
            where: {
              itemId: item.itemId,
              locationId: sourceLocId,
              kitAllocated: { gte: item.quantity },
            },
            data: {
              kitAllocated: { decrement: item.quantity },
            },
          });

          if (releaseResult.count === 0 && sourceLocId !== kit.locationId) {
            releaseResult = await tx.stockBalance.updateMany({
              where: {
                itemId: item.itemId,
                locationId: kit.locationId,
                kitAllocated: { gte: item.quantity },
              },
              data: {
                kitAllocated: { decrement: item.quantity },
              },
            });
          }

          if (releaseResult.count === 0) {
            throw new AppError(
              'Không thể giải phóng linh kiện do số lượng kitAllocated không đủ hoặc xung đột đồng thời',
              409
            );
          }
        }
      }

      // Delete kit items
      await tx.kitItem.deleteMany({ where: { kitId: id } });
      // Delete kit
      await tx.kit.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: currentUser.id,
          action: 'DELETE_KIT',
          entity: 'Kit',
          entityId: id,
          oldValue: {
            code: kit.code,
            name: kit.name,
            status: kit.status,
            locationId: kit.locationId,
            itemCount: kit.items.length,
          },
          newValue: Prisma.DbNull,
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
        },
      });
    });

    return { success: true, message: `Hộp kit '${kit.code}' đã được xóa an toàn` };
  }
}

export const kitsService = new KitsService();
