import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../shared/AppError';
import {
  StockBalanceValues,
  calculateAvailableStock,
  validateStockInvariant,
  StockTransactionType,
} from '@acm/shared';

// Re-export core math helpers from shared
export { calculateAvailableStock, validateStockInvariant };

/**
 * Validates that an Item and a Location exist and are active in the database.
 * Optional transaction client can be passed for transactional consistency.
 */
export async function validateActiveItemAndLocation(
  itemId: string,
  locationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<{
  item: { id: string; code: string; name: string; unit: string; type: string; isActive: boolean };
  location: { id: string; code: string; name: string; type: string; isActive: boolean };
}> {
  const [item, location] = await Promise.all([
    tx.item.findUnique({
      where: { id: itemId },
      select: { id: true, code: true, name: true, unit: true, type: true, isActive: true },
    }),
    tx.location.findUnique({
      where: { id: locationId },
      select: { id: true, code: true, name: true, type: true, isActive: true },
    }),
  ]);

  if (!item) {
    throw new AppError(`Linh kiện với ID '${itemId}' không tồn tại trong hệ thống`, 404);
  }
  if (!item.isActive) {
    throw new AppError(
      `Linh kiện '${item.code} - ${item.name}' đã bị vô hiệu hóa, không thể thực hiện giao dịch kho`,
      400
    );
  }

  if (!location) {
    throw new AppError(`Vị trí kho với ID '${locationId}' không tồn tại trong hệ thống`, 404);
  }
  if (!location.isActive) {
    throw new AppError(
      `Vị trí kho '${location.code} - ${location.name}' đã bị vô hiệu hóa, không thể thực hiện giao dịch kho`,
      400
    );
  }

  return { item, location };
}

/**
 * Sorts an array of items deterministically by (itemId ASC, locationId ASC).
 * Prevents PostgreSQL deadlock when locking rows across multi-line transactions.
 */
export function sortLockOrder<T extends { itemId: string; locationId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const itemCmp = a.itemId.localeCompare(b.itemId);
    if (itemCmp !== 0) return itemCmp;
    return a.locationId.localeCompare(b.locationId);
  });
}

/**
 * Validates StockMovement ledger consistency rules:
 * - OnHandAfter must equal OnHandBefore + QuantityDelta
 * - OnHandAfter cannot be negative
 * - Movement type rules:
 *   - IMPORT: quantityDelta must be strictly positive (> 0)
 *   - EXPORT: quantityDelta must be strictly negative (< 0)
 *   - ADJUSTMENT: quantityDelta can be non-zero (+ or -)
 *   - TRANSFER: quantityDelta can be negative (from) or positive (to)
 */
export function validateMovementLedgerConsistency(movement: {
  type: StockTransactionType;
  quantityDelta: number;
  onHandBefore: number;
  onHandAfter: number;
}): void {
  const { type, quantityDelta, onHandBefore, onHandAfter } = movement;

  if (onHandBefore < 0) {
    throw new AppError('Số lượng trước giao dịch (onHandBefore) không được âm', 400);
  }
  if (onHandAfter < 0) {
    throw new AppError('Số lượng sau giao dịch (onHandAfter) không thể âm', 400);
  }

  if (onHandAfter !== onHandBefore + quantityDelta) {
    throw new AppError(
      `Lệch số liệu sổ cái biến động kho: onHandAfter (${onHandAfter}) != onHandBefore (${onHandBefore}) + quantityDelta (${quantityDelta})`,
      400
    );
  }

  switch (type) {
    case StockTransactionType.IMPORT:
      if (quantityDelta <= 0) {
        throw new AppError('Giao dịch Nhập kho (IMPORT) bắt buộc quantityDelta phải là số dương (> 0)', 400);
      }
      break;
    case StockTransactionType.EXPORT:
      if (quantityDelta >= 0) {
        throw new AppError('Giao dịch Xuất kho (EXPORT) bắt buộc quantityDelta phải là số âm (< 0)', 400);
      }
      break;
    case StockTransactionType.ADJUSTMENT:
    case StockTransactionType.TRANSFER:
      // Delta cannot be 0 (no change needed)
      if (quantityDelta === 0) {
        throw new AppError('Giao dịch kho phải có biến động số lượng khác 0', 400);
      }
      break;
  }
}

/**
 * Executes an async operation with bounded exponential backoff and jitter.
 * Retries on transient PostgreSQL concurrency errors:
 * - 40P01: deadlock detected
 * - P2034: transaction write conflict / deadlock
 * - 40001: serialization failure
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 50
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await operation(attempt);
    } catch (err: any) {
      const isTransactionNumberCollision =
        err?.code === 'P2002' &&
        (err?.meta?.target?.includes('transactionNumber') ||
          err?.meta?.target?.includes('transaction_number') ||
          err?.message?.includes('transactionNumber') ||
          err?.message?.includes('stock_transactions_transactionNumber_key'));

      const isRetryable =
        err?.code === 'P2034' ||
        err?.code === '40P01' ||
        err?.code === '40001' ||
        isTransactionNumberCollision ||
        err?.message?.includes('deadlock detected') ||
        err?.message?.includes('could not serialize access');

      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }

      // Exponential backoff with random jitter: baseDelay * 2^(attempt - 1) + [0, 50ms)
      const delay = Math.pow(2, attempt - 1) * baseDelayMs + Math.floor(Math.random() * 50);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Generates unique transaction number according to business type:
 * - IMPORT: IMP-YYYYMMDD-XXXX
 * - EXPORT: EXP-YYYYMMDD-XXXX
 * - TRANSFER: TRF-YYYYMMDD-XXXX
 * - ADJUSTMENT: ADJ-YYYYMMDD-XXXX
 * Includes collision check with deterministic retry and cryptographic randomness.
 */
export async function generateTransactionNumber(
  type?: StockTransactionType,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  let prefix = 'TX';
  if (type === StockTransactionType.IMPORT) prefix = 'IMP';
  else if (type === StockTransactionType.EXPORT) prefix = 'EXP';
  else if (type === StockTransactionType.TRANSFER) prefix = 'TRF';
  else if (type === StockTransactionType.ADJUSTMENT) prefix = 'ADJ';

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 10; i++) {
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
    const candidate = `${prefix}-${dateStr}-${randomSuffix}`;
    const existing = await tx.stockTransaction.findUnique({
      where: { transactionNumber: candidate },
    });
    if (!existing) {
      return candidate;
    }
  }
  return `${prefix}-${dateStr}-${Date.now().toString().slice(-4)}`;
}
