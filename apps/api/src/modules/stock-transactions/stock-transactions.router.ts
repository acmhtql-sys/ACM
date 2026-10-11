import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../shared/response';

export const stockTransactionsRouter = Router();

stockTransactionsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const txs = await prisma.stockTransaction.findMany({
      include: {
        createdBy: { select: { fullName: true } },
        details: {
          include: {
            item: { select: { code: true, name: true } },
            location: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = txs.map((t) => ({
      id: t.id,
      transactionNumber: t.transactionNumber,
      type: t.type,
      notes: t.notes,
      creatorName: t.createdBy.fullName,
      createdAt: t.createdAt.toISOString(),
      itemCount: t.details.length,
      totalQuantity: t.details.reduce((s, d) => s + d.quantity, 0),
      details: t.details,
    }));

    return sendSuccess(res, mapped, 'Danh sách giao dịch kho từ Database');
  } catch (err) {
    next(err);
  }
});
