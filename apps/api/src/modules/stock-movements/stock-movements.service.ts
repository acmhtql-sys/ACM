import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import {
  QueryStockMovementsInput,
  PaginationMeta,
  StockMovementSortField,
  SortOrder,
} from '@acm/shared';

export class StockMovementsService {
  /**
   * Retrieves paginated list of stock movements (audit ledger of all inventory fluctuations).
   */
  async listMovements(
    query: QueryStockMovementsInput
  ): Promise<{ movements: any[]; meta: PaginationMeta }> {
    const where: Prisma.StockMovementWhereInput = {};

    if (query.itemId) {
      where.itemId = query.itemId;
    }

    if (query.locationId) {
      where.locationId = query.locationId;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.referenceType) {
      where.referenceType = query.referenceType;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { reason: { contains: search, mode: 'insensitive' } },
        { referenceType: { contains: search, mode: 'insensitive' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy || StockMovementSortField.CREATED_AT;
    const sortOrder = query.sortOrder || SortOrder.DESC;

    const [totalItems, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          item: {
            select: { id: true, code: true, name: true, unit: true, type: true },
          },
          location: {
            select: { id: true, code: true, name: true, type: true },
          },
          createdBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
    ]);

    const mapped = movements.map((m) => ({
      id: m.id,
      itemId: m.itemId,
      locationId: m.locationId,
      type: m.type,
      quantityDelta: m.quantityDelta,
      onHandBefore: m.onHandBefore,
      onHandAfter: m.onHandAfter,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      reason: m.reason,
      createdById: m.createdById,
      creatorName: m.createdBy?.fullName || '',
      createdBy: m.createdBy,
      item: m.item,
      location: m.location,
      createdAt: m.createdAt.toISOString(),
    }));

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      movements: mapped,
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
}

export const stockMovementsService = new StockMovementsService();
