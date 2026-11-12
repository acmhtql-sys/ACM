// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ItemResponse, ItemType, LocationResponse, LocationType, StockStatus, UserRole } from '@acm/shared';
import { StockImportModal } from './StockImportModal';
import {
  buildBulkImportLines,
  getShortageItems,
  getSuggestedReplenishQty,
  mergeMissingItemsIntoLines,
} from './stockImportHelpers';
import { stockTransactionsService } from '../../services/stock-transactions.service';
import * as features from '../../config/features';

vi.mock('../../services/stock-transactions.service', () => ({
  stockTransactionsService: {
    importStock: vi.fn(),
    queryIdempotencyRecord: vi.fn(),
  },
}));

const LOC_BIN = 'b2010000-0000-4000-8000-000000000201';
const ITEM_EMPTY = 'a1010000-0000-4000-8000-000000000101';
const ITEM_LOW = 'a1020000-0000-4000-8000-000000000102';
const ITEM_HEALTHY = 'a1030000-0000-4000-8000-000000000103';

const mockLocations: LocationResponse[] = [
  {
    id: LOC_BIN,
    code: 'BIN-A1',
    name: 'Khay linh kiện A1',
    type: LocationType.BIN,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
];

const mockItems: ItemResponse[] = [
  {
    id: ITEM_EMPTY,
    code: 'MCU-ESP32',
    name: 'ESP32 DevKit',
    unit: 'Cái',
    type: ItemType.TRACKED_ASSET,
    categoryId: 'c1010000-0000-4000-8000-000000000001',
    minStockAlert: 10,
    isActive: true,
    totalOnHand: 0,
    totalReserved: 0,
    totalQuarantined: 0,
    totalKitAllocated: 0,
    totalBorrowed: 0,
    available: 0,
    isLowStock: true,
    stockStatus: StockStatus.OUT_OF_STOCK,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: ITEM_LOW,
    code: 'RES-10K',
    name: 'Điện trở 10k',
    unit: 'Chiếc',
    type: ItemType.CONSUMABLE,
    categoryId: 'c1010000-0000-4000-8000-000000000001',
    minStockAlert: 20,
    isActive: true,
    totalOnHand: 6,
    totalReserved: 0,
    totalQuarantined: 0,
    totalKitAllocated: 0,
    totalBorrowed: 0,
    available: 6,
    isLowStock: true,
    stockStatus: StockStatus.LOW_STOCK,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: ITEM_HEALTHY,
    code: 'LED-RED',
    name: 'LED Đỏ 5mm',
    unit: 'Chiếc',
    type: ItemType.CONSUMABLE,
    categoryId: 'c1010000-0000-4000-8000-000000000001',
    minStockAlert: 10,
    isActive: true,
    totalOnHand: 50,
    totalReserved: 0,
    totalQuarantined: 0,
    totalKitAllocated: 0,
    totalBorrowed: 0,
    available: 50,
    isLowStock: false,
    stockStatus: StockStatus.IN_STOCK,
    createdAt: '',
    updatedAt: '',
  },
];

describe('StockImportModal 2-part flow (Bulk All vs Individual/Shortage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.spyOn(features, 'isStockTransactionWriteEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('identifies shortage items sorted by severity and computes replenish quantities', () => {
    const shortages = getShortageItems(mockItems);
    expect(shortages.map((i) => i.code)).toEqual(['MCU-ESP32', 'RES-10K']);
    expect(getSuggestedReplenishQty(mockItems[0])).toBe(10);
    expect(getSuggestedReplenishQty(mockItems[1])).toBe(14);
  });

  it('builds bulk lines and merges missing items without duplicating existing lines', () => {
    const bulk = buildBulkImportLines({
      items: mockItems,
      defaultLocationId: LOC_BIN,
      fixedQuantity: 15,
    });
    expect(bulk).toHaveLength(3);
    expect(bulk.every((line) => line.locationId === LOC_BIN && line.quantity === 15)).toBe(true);

    const merged = mergeMissingItemsIntoLines({
      itemsToAdd: [mockItems[0], mockItems[1]],
      existingLines: [{ itemId: ITEM_EMPTY, locationId: LOC_BIN, quantity: 3, unitCost: null, notes: '' }],
      defaultLocationId: LOC_BIN,
    });
    expect(merged.addedCount).toBe(1);
    expect(merged.nextLines).toHaveLength(2);
    expect(merged.nextLines[1]).toMatchObject({ itemId: ITEM_LOW, quantity: 14, locationId: LOC_BIN });
  });

  it('Mode 1 (Bulk All): loads all active items at once and allows batch quantity update & review', async () => {
    const onSuccess = vi.fn();
    (stockTransactionsService.importStock as any).mockResolvedValue({
      id: 'tx-bulk-1',
      transactionNumber: 'IMP-BULK-001',
    });

    render(
      <StockImportModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        locations={mockLocations}
        userId="admin-1"
        userRole={UserRole.ADMIN}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByTestId('mode-tab-bulk-all'));

    await waitFor(() => {
      expect(screen.getByTestId('bulk-import-toolbar')).toBeDefined();
      expect(screen.getByTestId('line-row-2')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-bulk-default-qty'), { target: { value: '25' } });
    fireEvent.click(screen.getByTestId('btn-apply-bulk-qty'));

    expect((screen.getByTestId('input-qty-0') as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('input-qty-1') as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('input-qty-2') as HTMLInputElement).value).toBe('25');

    fireEvent.click(screen.getByTestId('btn-review-import'));
    await waitFor(() => {
      expect(screen.getByTestId('import-confirmation-step')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-confirm-submit-import'));
    await waitFor(() => {
      expect(stockTransactionsService.importStock).toHaveBeenCalledTimes(1);
      const [payload] = (stockTransactionsService.importStock as any).mock.calls[0];
      expect(payload.items).toHaveLength(3);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('Mode 2 (Individual / Shortage): loads only missing/low-stock items with suggested quantities', async () => {
    render(
      <StockImportModal
        isOpen={true}
        onClose={vi.fn()}
        items={mockItems}
        locations={mockLocations}
        userId="admin-1"
        userRole={UserRole.ADMIN}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByTestId('shortage-quick-panel')).toBeDefined();
    fireEvent.click(screen.getByTestId('btn-load-shortage-items'));

    await waitFor(() => {
      expect((screen.getByTestId('select-item-0') as HTMLSelectElement).value).toBe(ITEM_EMPTY);
      expect((screen.getByTestId('input-qty-0') as HTMLInputElement).value).toBe('10');
      expect((screen.getByTestId('select-item-1') as HTMLSelectElement).value).toBe(ITEM_LOW);
      expect((screen.getByTestId('input-qty-1') as HTMLInputElement).value).toBe('14');
    });

    expect(screen.queryByTestId('line-row-2')).toBeNull();
  });
});
