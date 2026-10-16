import { Prisma, LocationType as PrismaLocationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../shared/AppError';
import { AuthenticatedUser } from '../../middleware/auth';
import {
  CreateLocationInput,
  UpdateLocationInput,
  UpdateLocationStatusInput,
  QueryLocationsInput,
  QueryLocationTreeInput,
  LocationResponse,
  LocationTreeResponse,
  PaginationMeta,
  UserRole,
  LocationType,
  LocationSortField,
  SortOrder,
  buildLocationTree,
  isDescendantLocation,
} from '@acm/shared';

/**
 * Transforms raw database location record into LocationResponse DTO
 */
export function formatLocationResponse(
  location: any,
  counts?: { childrenCount?: number; itemsCount?: number }
): LocationResponse {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type as LocationType,
    parentId: location.parentId,
    isActive: location.isActive,
    parent: location.parent
      ? {
          id: location.parent.id,
          code: location.parent.code,
          name: location.parent.name,
          type: location.parent.type as LocationType,
        }
      : null,
    childrenCount: counts?.childrenCount ?? location._count?.children ?? 0,
    itemsCount: counts?.itemsCount ?? location._count?.stockBalances ?? 0,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  };
}

/**
 * Validates permissible hierarchical parent-child relationships:
 * - WAREHOUSE is strictly the root node (must not have parent)
 * - RACK must be under WAREHOUSE
 * - SHELF must be under RACK
 * - BIN can be under SHELF or RACK (supports both WAREHOUSE -> RACK -> BIN and WAREHOUSE -> RACK -> SHELF -> BIN)
 */
export function validateHierarchyLevels(
  childType: LocationType,
  parentType?: LocationType | null
): void {
  if (childType === LocationType.WAREHOUSE) {
    if (parentType) {
      throw new AppError(
        'Vị trí Kho tổng (WAREHOUSE) là vị trí gốc cao nhất, không thể trực thuộc vị trí khác',
        400
      );
    }
    return;
  }

  if (!parentType) {
    throw new AppError(
      `Vị trí loại '${childType}' bắt buộc phải có vị trí cha`,
      400
    );
  }

  if (childType === LocationType.RACK) {
    if (parentType !== LocationType.WAREHOUSE) {
      throw new AppError(
        `Vị trí Kệ (RACK) phải nằm dưới Kho tổng (WAREHOUSE)`,
        400
      );
    }
  } else if (childType === LocationType.SHELF) {
    if (parentType !== LocationType.RACK) {
      throw new AppError(
        `Vị trí Tầng kệ (SHELF) phải nằm dưới Kệ (RACK)`,
        400
      );
    }
  } else if (childType === LocationType.BIN) {
    // Both WAREHOUSE -> RACK -> BIN and WAREHOUSE -> RACK -> SHELF -> BIN are supported!
    if (parentType !== LocationType.SHELF && parentType !== LocationType.RACK) {
      throw new AppError(
        `Vị trí Khay/Hộp (BIN) phải nằm dưới Tầng kệ (SHELF) hoặc Kệ (RACK)`,
        400
      );
    }
  }
}

export class LocationsService {
  /**
   * Retrieves full hierarchical location tree
   * RBAC: STUDENT can only view active locations.
   */
  async getLocationTree(
    query: QueryLocationTreeInput,
    user?: AuthenticatedUser
  ): Promise<LocationTreeResponse> {
    const isPrivileged =
      user?.role === UserRole.ADMIN ||
      user?.role === UserRole.LAB_MANAGER ||
      user?.role === UserRole.TECHNICIAN;

    const where: Prisma.LocationWhereInput = {};
    if (!isPrivileged || !query.includeInactive) {
      where.isActive = true;
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    const formattedLocations: LocationResponse[] = locations.map((loc) =>
      formatLocationResponse(loc)
    );

    return buildLocationTree(formattedLocations);
  }

  /**
   * Retrieves flat paginated list of locations with filters and sorting
   * RBAC: STUDENT can only view active locations.
   */
  async listLocations(
    query: QueryLocationsInput,
    user?: AuthenticatedUser
  ): Promise<{ locations: LocationResponse[]; meta: PaginationMeta }> {
    let effectiveIsActive = query.isActive;
    if (user?.role === UserRole.STUDENT || !user) {
      effectiveIsActive = true;
    }

    const where: Prisma.LocationWhereInput = {};

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.type) {
      where.type = query.type as PrismaLocationType;
    }

    if (effectiveIsActive !== undefined) {
      where.isActive = effectiveIsActive;
    }

    if (query.parentId !== undefined) {
      if (query.parentId === 'null' || query.parentId === null) {
        where.parentId = null;
      } else {
        where.parentId = query.parentId;
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || LocationSortField.CODE;
    const sortOrder = query.sortOrder || SortOrder.ASC;
    const orderBy: Prisma.LocationOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [totalItems, locations] = await Promise.all([
      prisma.location.count({ where }),
      prisma.location.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          parent: { select: { id: true, code: true, name: true, type: true } },
          _count: {
            select: {
              children: true,
              stockBalances: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      locations: locations.map((loc) => formatLocationResponse(loc)),
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
   * Retrieves single location details by ID
   * RBAC: STUDENT cannot access inactive location directly.
   */
  async getLocationById(id: string, user?: AuthenticatedUser): Promise<any> {
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true, type: true } },
        children: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            isActive: true,
          },
          orderBy: { code: 'asc' },
        },
        stockBalances: {
          include: {
            item: {
              select: {
                id: true,
                code: true,
                name: true,
                unit: true,
                type: true,
                minStockAlert: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            children: true,
            stockBalances: true,
          },
        },
      },
    });

    if (!location) {
      throw new AppError('Không tìm thấy vị trí kho yêu cầu', 404);
    }

    // RBAC: Student cannot access inactive location directly
    if (!location.isActive && (user?.role === UserRole.STUDENT || !user)) {
      throw new AppError('Bạn không có quyền truy cập vị trí kho đã ngưng hoạt động', 403);
    }

    const baseFormatted = formatLocationResponse(location);

    const stockBalances = location.stockBalances.map((sb) => {
      const available = Math.max(
        0,
        sb.onHand - sb.reserved - sb.quarantined - sb.kitAllocated
      );
      return {
        id: sb.id,
        itemId: sb.itemId,
        item: sb.item,
        onHand: sb.onHand,
        reserved: sb.reserved,
        quarantined: sb.quarantined,
        kitAllocated: sb.kitAllocated,
        borrowed: sb.borrowed,
        available,
        isLowStock: available < sb.item.minStockAlert,
      };
    });

    return {
      ...baseFormatted,
      children: location.children,
      stockBalances,
    };
  }

  /**
   * Creates a new location and writes AuditLog inside a transaction
   * RBAC: ADMIN, LAB_MANAGER only.
   */
  async createLocation(
    data: CreateLocationInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LocationResponse> {
    const trimmedCode = data.code.trim().toUpperCase();

    // 1. Check duplicate code (case-insensitive)
    const existingCode = await prisma.location.findFirst({
      where: {
        code: { equals: trimmedCode, mode: 'insensitive' },
      },
    });
    if (existingCode) {
      throw new AppError(
        `Mã vị trí kho '${trimmedCode}' đã tồn tại trong hệ thống`,
        409
      );
    }

    // 2. If parentId provided, validate parent existence and active status
    let parentLocation = null;
    if (data.parentId) {
      parentLocation = await prisma.location.findUnique({
        where: { id: data.parentId },
      });
      if (!parentLocation) {
        throw new AppError(`Vị trí cha với ID '${data.parentId}' không tồn tại`, 404);
      }
      if (!parentLocation.isActive) {
        throw new AppError(
          'Không thể tạo vị trí con dưới một vị trí cha đang bị vô hiệu hóa',
          400
        );
      }
    }

    // 3. Hierarchy level check
    validateHierarchyLevels(data.type, parentLocation?.type as LocationType);

    // 4. Prisma transaction with AuditLog
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.location.create({
          data: {
            code: trimmedCode,
            name: data.name.trim(),
            type: data.type as PrismaLocationType,
            parentId: data.parentId || null,
          },
          include: {
            parent: { select: { id: true, code: true, name: true, type: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CREATE_LOCATION',
            entity: 'Location',
            entityId: created.id,
            oldValue: Prisma.DbNull,
            newValue: {
              code: created.code,
              name: created.name,
              type: created.type,
              parentId: created.parentId,
              isActive: created.isActive,
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });

        return formatLocationResponse(created, { childrenCount: 0, itemsCount: 0 });
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new AppError(`Mã vị trí kho '${trimmedCode}' đã tồn tại trong hệ thống`, 409);
      }
      throw err;
    }
  }

  /**
   * Updates location attributes with anti-loop and hierarchy level checks
   * RBAC: ADMIN, LAB_MANAGER only.
   */
  async updateLocation(
    id: string,
    data: UpdateLocationInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LocationResponse> {
    const existing = await prisma.location.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true, type: true } },
      },
    });
    if (!existing) {
      throw new AppError('Không tìm thấy vị trí kho cần cập nhật', 404);
    }

    // 1. If updating code, check duplicate (case-insensitive)
    const trimmedCode = data.code ? data.code.trim().toUpperCase() : undefined;
    if (trimmedCode && trimmedCode !== existing.code.toUpperCase()) {
      const duplicate = await prisma.location.findFirst({
        where: {
          code: { equals: trimmedCode, mode: 'insensitive' },
        },
      });
      if (duplicate && duplicate.id !== id) {
        throw new AppError(`Mã vị trí kho '${trimmedCode}' đã tồn tại trong hệ thống`, 409);
      }
    }

    // 2. Target type
    const targetType = (data.type || existing.type) as LocationType;

    // 3. If updating parentId
    let targetParentId = existing.parentId;
    let targetParentType: LocationType | null = existing.parent?.type as LocationType | null;

    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        throw new AppError('Vị trí cha không thể là chính nó', 400);
      }

      if (data.parentId) {
        const parent = await prisma.location.findUnique({
          where: { id: data.parentId },
        });
        if (!parent) {
          throw new AppError(`Vị trí cha với ID '${data.parentId}' không tồn tại`, 404);
        }
        if (!parent.isActive) {
          throw new AppError('Không thể chuyển vị trí sang một vị trí cha đang bị vô hiệu hóa', 400);
        }

        // Check circular reference!
        const allLocations = await prisma.location.findMany({
          select: { id: true, parentId: true },
        });
        if (isDescendantLocation(allLocations, id, data.parentId)) {
          throw new AppError(
            'Không thể chọn vị trí con/cháu làm vị trí cha (phát hiện vòng lặp phân cấp)',
            400
          );
        }

        targetParentId = data.parentId;
        targetParentType = parent.type as LocationType;
      } else {
        targetParentId = null;
        targetParentType = null;
      }
    }

    // 4. Validate hierarchy levels
    validateHierarchyLevels(targetType, targetParentType);

    // 5. Prisma Transaction with AuditLog
    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.location.update({
          where: { id },
          data: {
            code: trimmedCode,
            name: data.name ? data.name.trim() : undefined,
            type: data.type ? (data.type as PrismaLocationType) : undefined,
            parentId: data.parentId !== undefined ? data.parentId : undefined,
          },
          include: {
            parent: { select: { id: true, code: true, name: true, type: true } },
            _count: {
              select: {
                children: true,
                stockBalances: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'UPDATE_LOCATION',
            entity: 'Location',
            entityId: updated.id,
            oldValue: {
              code: existing.code,
              name: existing.name,
              type: existing.type,
              parentId: existing.parentId,
            },
            newValue: {
              code: updated.code,
              name: updated.name,
              type: updated.type,
              parentId: updated.parentId,
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
          },
        });

        return formatLocationResponse(updated);
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new AppError(`Mã vị trí kho '${trimmedCode}' đã tồn tại trong hệ thống`, 409);
      }
      throw err;
    }
  }

  /**
   * Safely updates location status (Active/Inactive) with safety guards
   * RBAC: ADMIN, LAB_MANAGER only.
   */
  async updateLocationStatus(
    id: string,
    data: UpdateLocationStatusInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LocationResponse> {
    const existing = await prisma.location.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true, type: true, isActive: true } },
      },
    });
    if (!existing) {
      throw new AppError('Không tìm thấy vị trí kho cần thay đổi trạng thái', 404);
    }

    if (existing.isActive === data.isActive) {
      return formatLocationResponse(existing);
    }

    // Comprehensive Safe Deactivation Checks
    if (!data.isActive) {
      // 1. Cannot deactivate if active child locations exist
      const activeChildrenCount = await prisma.location.count({
        where: { parentId: id, isActive: true },
      });
      if (activeChildrenCount > 0) {
        throw new AppError(
          `Không thể vô hiệu hóa vị trí này vì vẫn còn ${activeChildrenCount} vị trí con đang hoạt động. Vui lòng vô hiệu hóa các vị trí con trước.`,
          400
        );
      }

      // 2. Cannot deactivate if physical on-hand or allocated stock balances exist
      const activeStockBalances = await prisma.stockBalance.findMany({
        where: {
          locationId: id,
          OR: [
            { onHand: { gt: 0 } },
            { reserved: { gt: 0 } },
            { quarantined: { gt: 0 } },
            { kitAllocated: { gt: 0 } },
            { borrowed: { gt: 0 } },
          ],
        },
      });

      if (activeStockBalances.length > 0) {
        const totalOnHand = activeStockBalances.reduce((sum, s) => sum + s.onHand, 0);
        const totalAllocated = activeStockBalances.reduce(
          (sum, s) => sum + s.reserved + s.quarantined + s.kitAllocated + s.borrowed,
          0
        );
        throw new AppError(
          `Không thể vô hiệu hóa vị trí kho này vì vẫn còn tồn kho vật lý (${totalOnHand} sản phẩm) hoặc số lượng đang phân bổ (${totalAllocated}). Vui lòng điều chuyển hoặc xuất kho trước khi vô hiệu hóa.`,
          400
        );
      }

      // 3. Cannot deactivate if active Tracked Assets are located here
      const activeAssetsCount = await prisma.asset.count({
        where: {
          locationId: id,
          status: { not: 'RETIRED' },
        },
      });
      if (activeAssetsCount > 0) {
        throw new AppError(
          `Không thể vô hiệu hóa vị trí này vì vẫn còn ${activeAssetsCount} tài sản/thiết bị đang lưu trữ tại đây. Vui lòng điều chuyển thiết bị trước khi vô hiệu hóa.`,
          400
        );
      }

      // 4. Cannot deactivate if active Stock Reservations exist
      const activeReservationsCount = await prisma.stockReservation.count({
        where: {
          locationId: id,
          status: 'ACTIVE',
        },
      });
      if (activeReservationsCount > 0) {
        throw new AppError(
          `Không thể vô hiệu hóa vị trí này vì vẫn còn ${activeReservationsCount} phiếu giữ chỗ linh kiện (Stock Reservation) đang hoạt động.`,
          400
        );
      }
    } else {
      // Reactivation check: Parent must be active
      if (existing.parentId && existing.parent && !existing.parent.isActive) {
        throw new AppError(
          `Không thể kích hoạt vị trí con '${existing.code}' khi vị trí cha '${existing.parent.code}' đang bị vô hiệu hóa. Vui lòng kích hoạt vị trí cha trước.`,
          400
        );
      }
    }

    const action = data.isActive ? 'REACTIVATE_LOCATION' : 'DEACTIVATE_LOCATION';

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.location.update({
        where: { id },
        data: { isActive: data.isActive },
        include: {
          parent: { select: { id: true, code: true, name: true, type: true } },
          _count: {
            select: {
              children: true,
              stockBalances: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action,
          entity: 'Location',
          entityId: updated.id,
          oldValue: { isActive: existing.isActive },
          newValue: { isActive: updated.isActive, reason: data.reason || null },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });

      return formatLocationResponse(updated);
    });
  }
}

export const locationsService = new LocationsService();
