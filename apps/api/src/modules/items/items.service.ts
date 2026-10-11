import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../shared/AppError';
import { AuthenticatedUser } from '../../middleware/auth';
import {
  CreateItemInput,
  UpdateItemInput,
  UpdateItemStatusInput,
  QueryItemsInput,
  ItemResponse,
  PaginationMeta,
  UserRole,
  ItemSortField,
  SortOrder,
  calculateAvailableStock,
  isLowStock,
} from '@acm/shared';

export interface FormattedItemWithCompat extends ItemResponse {
  categoryName?: string;
}

/**
 * Transforms raw database item record into ItemResponse DTO
 */
export function formatItemResponse(item: any): FormattedItemWithCompat {
  const stockBalances = item.stockBalances || [];
  const totalOnHand = stockBalances.reduce((sum: number, b: any) => sum + (b.onHand || 0), 0);
  const totalReserved = stockBalances.reduce((sum: number, b: any) => sum + (b.reserved || 0), 0);
  const totalQuarantined = stockBalances.reduce((sum: number, b: any) => sum + (b.quarantined || 0), 0);
  const totalKitAllocated = stockBalances.reduce((sum: number, b: any) => sum + (b.kitAllocated || 0), 0);
  const totalBorrowed = stockBalances.reduce((sum: number, b: any) => sum + (b.borrowed || 0), 0);

  const available = calculateAvailableStock({
    onHand: totalOnHand,
    reserved: totalReserved,
    quarantined: totalQuarantined,
    kitAllocated: totalKitAllocated,
    borrowed: totalBorrowed,
  });

  const lowStock = isLowStock(available, item.minStockAlert);

  const formattedBalances = stockBalances.map((b: any) => ({
    id: b.id,
    locationId: b.locationId,
    location: b.location
      ? { code: b.location.code, name: b.location.name }
      : { code: '', name: '' },
    onHand: b.onHand,
    reserved: b.reserved,
    quarantined: b.quarantined,
    kitAllocated: b.kitAllocated,
    borrowed: b.borrowed,
    available: Math.max(0, b.onHand - b.reserved - b.quarantined - b.kitAllocated),
  }));

  return {
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    unit: item.unit,
    type: item.type,
    categoryId: item.categoryId,
    category: item.category
      ? {
          id: item.category.id,
          code: item.category.code,
          name: item.category.name,
        }
      : undefined,
    categoryName: item.category?.name || '',
    minStockAlert: item.minStockAlert,
    imageUrl: item.imageUrl,
    isActive: item.isActive,
    totalOnHand,
    totalReserved,
    totalQuarantined,
    totalKitAllocated,
    totalBorrowed,
    available,
    isLowStock: lowStock,
    stockBalances: formattedBalances,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export class ItemsService {
  /**
   * Retrieves paginated items with filtering, search, and role-based active status restriction
   */
  async listItems(
    query: QueryItemsInput,
    user?: AuthenticatedUser
  ): Promise<{ items: FormattedItemWithCompat[]; meta: PaginationMeta }> {
    // RBAC: Student can ONLY see active items
    let effectiveIsActive: boolean | undefined = query.isActive;
    if (user?.role === UserRole.STUDENT || !user) {
      effectiveIsActive = true;
    }

    const where: Prisma.ItemWhereInput = {
      AND: [
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { code: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
        query.categoryId ? { categoryId: query.categoryId } : {},
        query.type ? { type: query.type } : {},
        effectiveIsActive !== undefined ? { isActive: effectiveIsActive } : {},
      ],
    };

    // Sort order
    const sortField = query.sortBy || ItemSortField.CREATED_AT;
    const sortDirection = query.sortOrder || SortOrder.DESC;

    let orderBy: Prisma.ItemOrderByWithRelationInput = { createdAt: 'desc' };
    if (sortField === ItemSortField.NAME) {
      orderBy = { name: sortDirection };
    } else if (sortField === ItemSortField.CODE) {
      orderBy = { code: sortDirection };
    } else if (sortField === ItemSortField.CREATED_AT) {
      orderBy = { createdAt: sortDirection };
    } else if (sortField === ItemSortField.UPDATED_AT) {
      orderBy = { updatedAt: sortDirection };
    } else if (sortField === ItemSortField.MIN_STOCK_ALERT) {
      orderBy = { minStockAlert: sortDirection };
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    // When filtering by computed low stock, fetch all matching criteria and filter in memory
    if (query.isLowStock !== undefined) {
      const allMatching = await prisma.item.findMany({
        where,
        orderBy,
        include: {
          category: { select: { id: true, code: true, name: true } },
          stockBalances: {
            include: {
              location: { select: { code: true, name: true } },
            },
          },
        },
      });

      const formatted = allMatching.map(formatItemResponse);
      const filtered = formatted.filter((item) => item.isLowStock === query.isLowStock);
      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / limit) || 1;
      const paginatedItems = filtered.slice((page - 1) * limit, page * limit);

      return {
        items: paginatedItems,
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

    // Standard database pagination
    const [totalItems, items] = await Promise.all([
      prisma.item.count({ where }),
      prisma.item.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, code: true, name: true } },
          stockBalances: {
            include: {
              location: { select: { code: true, name: true } },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;
    const formatted = items.map(formatItemResponse);

    return {
      items: formatted,
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
   * Retrieves single item details with RBAC check
   */
  async getItemById(id: string, user?: AuthenticatedUser): Promise<FormattedItemWithCompat> {
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, code: true, name: true } },
        stockBalances: {
          include: {
            location: { select: { code: true, name: true } },
          },
        },
      },
    });

    if (!item) {
      throw new AppError('Không tìm thấy linh kiện yêu cầu', 404);
    }

    // RBAC: Student cannot access inactive item directly
    if (!item.isActive && (user?.role === UserRole.STUDENT || !user)) {
      throw new AppError('Bạn không có quyền truy cập linh kiện đã ngưng hoạt động', 403);
    }

    return formatItemResponse(item);
  }

  /**
   * Creates new item and writes audit log in transaction
   */
  async createItem(
    data: CreateItemInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<FormattedItemWithCompat> {
    // Check duplicate SKU
    const existing = await prisma.item.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      throw new AppError(
        `Mã linh kiện/thiết bị '${data.code}' đã tồn tại trong hệ thống`,
        409
      );
    }

    // Check category existence
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new AppError(`Danh mục với ID '${data.categoryId}' không tồn tại`, 404);
    }

    return await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          code: data.code,
          name: data.name,
          description: data.description || null,
          unit: data.unit,
          type: data.type,
          categoryId: data.categoryId,
          minStockAlert: data.minStockAlert,
          imageUrl: data.imageUrl || null,
        },
        include: {
          category: { select: { id: true, code: true, name: true } },
          stockBalances: {
            include: {
              location: { select: { code: true, name: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE_ITEM',
          entity: 'Item',
          entityId: created.id,
          oldValue: Prisma.DbNull,
          newValue: {
            code: created.code,
            name: created.name,
            unit: created.unit,
            type: created.type,
            categoryId: created.categoryId,
            minStockAlert: created.minStockAlert,
            isActive: created.isActive,
          },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      return formatItemResponse(created);
    });
  }

  /**
   * Updates descriptive item attributes and writes audit log in transaction
   */
  async updateItem(
    id: string,
    data: UpdateItemInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<FormattedItemWithCompat> {
    const existing = await prisma.item.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError('Không tìm thấy linh kiện cần cập nhật', 404);
    }

    // Check SKU conflict if updating code
    if (data.code && data.code !== existing.code) {
      const codeConflict = await prisma.item.findFirst({
        where: { code: data.code, NOT: { id } },
      });
      if (codeConflict) {
        throw new AppError(
          `Mã linh kiện/thiết bị '${data.code}' đã tồn tại trong hệ thống`,
          409
        );
      }
    }

    // Check category existence if updating categoryId
    if (data.categoryId && data.categoryId !== existing.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new AppError(`Danh mục với ID '${data.categoryId}' không tồn tại`, 404);
      }
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id },
        data: {
          code: data.code,
          name: data.name,
          description: data.description !== undefined ? data.description : undefined,
          unit: data.unit,
          type: data.type,
          categoryId: data.categoryId,
          minStockAlert: data.minStockAlert,
          imageUrl: data.imageUrl !== undefined ? data.imageUrl : undefined,
        },
        include: {
          category: { select: { id: true, code: true, name: true } },
          stockBalances: {
            include: {
              location: { select: { code: true, name: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE_ITEM',
          entity: 'Item',
          entityId: updated.id,
          oldValue: {
            code: existing.code,
            name: existing.name,
            description: existing.description,
            unit: existing.unit,
            type: existing.type,
            categoryId: existing.categoryId,
            minStockAlert: existing.minStockAlert,
            imageUrl: existing.imageUrl,
          },
          newValue: {
            code: updated.code,
            name: updated.name,
            description: updated.description,
            unit: updated.unit,
            type: updated.type,
            categoryId: updated.categoryId,
            minStockAlert: updated.minStockAlert,
            imageUrl: updated.imageUrl,
          },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      return formatItemResponse(updated);
    });
  }

  /**
   * Updates item status (Active/Inactive) and writes audit log in transaction
   */
  async updateItemStatus(
    id: string,
    data: UpdateItemStatusInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<FormattedItemWithCompat> {
    const existing = await prisma.item.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError('Không tìm thấy linh kiện cần thay đổi trạng thái', 404);
    }

    const action = data.isActive ? 'REACTIVATE_ITEM' : 'DEACTIVATE_ITEM';

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id },
        data: { isActive: data.isActive },
        include: {
          category: { select: { id: true, code: true, name: true } },
          stockBalances: {
            include: {
              location: { select: { code: true, name: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action,
          entity: 'Item',
          entityId: updated.id,
          oldValue: { isActive: existing.isActive },
          newValue: { isActive: updated.isActive, reason: data.reason || null },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      return formatItemResponse(updated);
    });
  }
}

export const itemsService = new ItemsService();
