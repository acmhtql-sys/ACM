import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../shared/response';
import { computeStockBreakdown } from '@acm/shared';

export const inventoryRouter = Router();

/**
 * GET /api/v1/inventory/balance
 * Returns real-time stock balances from Database
 */
inventoryRouter.get('/balance', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const balances = await prisma.stockBalance.findMany({
      include: {
        item: { select: { id: true, code: true, name: true, unit: true, type: true } },
        location: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = balances.map((b) => {
      const breakdown = computeStockBreakdown({
        onHand: b.onHand,
        reserved: b.reserved,
        quarantined: b.quarantined,
        kitAllocated: b.kitAllocated,
        borrowed: b.borrowed,
      });

      return {
        id: b.id,
        itemId: b.itemId,
        itemCode: b.item.code,
        itemName: b.item.name,
        itemUnit: b.item.unit,
        itemType: b.item.type,
        locationId: b.locationId,
        locationCode: b.location.code,
        locationName: b.location.name,
        ...breakdown,
      };
    });

    return sendSuccess(res, enriched, 'Dữ liệu số dư tồn kho từ Database');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/inventory/calculate
 * Direct calculation endpoint validating ACM Inventory rules:
 * Available = OnHand - Reserved - Quarantined - KitAllocated
 */
inventoryRouter.post('/calculate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { onHand, reserved, quarantined, kitAllocated, borrowed } = req.body;
    const balance = {
      onHand: Number(onHand) || 0,
      reserved: Number(reserved) || 0,
      quarantined: Number(quarantined) || 0,
      kitAllocated: Number(kitAllocated) || 0,
      borrowed: Number(borrowed) || 0,
    };

    const breakdown = computeStockBreakdown(balance);
    return sendSuccess(res, breakdown, 'Tính toán tồn kho thành công theo quy tắc ACM');
  } catch (err) {
    next(err);
  }
});
