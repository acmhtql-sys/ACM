import { describe, it, expect } from 'vitest';
import {
  createItemSchema,
  updateItemSchema,
  updateItemStatusSchema,
  queryItemsSchema,
  createLocationSchema,
  updateLocationSchema,
  updateLocationStatusSchema,
  queryLocationsSchema,
  queryLocationTreeSchema,
  importStockSchema,
  exportStockSchema,
  transferStockSchema,
  adjustStockSchema,
  queryStockBalancesSchema,
  queryStockTransactionsSchema,
  queryStockMovementsSchema,
} from './validators';
import {
  ItemType,
  ItemSortField,
  SortOrder,
  LocationType,
  LocationSortField,
  StockTransactionType,
  TransactionStatus,
  StockTransactionSortField,
  StockMovementSortField,
  StockBalanceSortField,
} from './types';

describe('Shared Validators Tests', () => {
  const validUUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  const validUUID2 = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';

  describe('createItemSchema', () => {
    it('validates a correct item input', () => {
      const data = {
        code: 'STM32-F401',
        name: 'STM32F401 Black Pill',
        description: 'ARM Cortex-M4 development board',
        unit: 'cái',
        type: ItemType.TRACKED_ASSET,
        categoryId: validUUID,
        minStockAlert: 10,
        imageUrl: 'https://example.com/stm32.jpg',
      };
      const parsed = createItemSchema.parse(data);
      expect(parsed.code).toBe('STM32-F401');
      expect(parsed.type).toBe(ItemType.TRACKED_ASSET);
      expect(parsed.minStockAlert).toBe(10);
    });

    it('applies default values for type and minStockAlert', () => {
      const data = {
        code: 'RES-10K',
        name: 'Điện trở 10k Ohm',
        unit: 'chiếc',
        categoryId: validUUID,
      };
      const parsed = createItemSchema.parse(data);
      expect(parsed.type).toBe(ItemType.CONSUMABLE);
      expect(parsed.minStockAlert).toBe(5);
    });

    it('rejects short code or name and invalid categoryId', () => {
      expect(() =>
        createItemSchema.parse({
          code: 'A',
          name: 'B',
          unit: 'cái',
          categoryId: 'invalid-uuid',
        })
      ).toThrow();
    });

    it('rejects code or name containing only whitespace', () => {
      expect(() =>
        createItemSchema.parse({
          code: '   ',
          name: 'Valid Name',
          unit: 'cái',
          categoryId: validUUID,
        })
      ).toThrow();

      expect(() =>
        createItemSchema.parse({
          code: 'VALID-CODE',
          name: '    ',
          unit: 'cái',
          categoryId: validUUID,
        })
      ).toThrow();
    });

    it('rejects unexpected / disallowed keys including stock quantities (strict)', () => {
      expect(() =>
        createItemSchema.parse({
          code: 'VALID-CODE',
          name: 'Valid Name',
          unit: 'cái',
          categoryId: validUUID,
          onHand: 100, // Disallowed field!
        })
      ).toThrow();

      expect(() =>
        createItemSchema.parse({
          code: 'VALID-CODE',
          name: 'Valid Name',
          unit: 'cái',
          categoryId: validUUID,
          reserved: 5, // Disallowed field!
        })
      ).toThrow();
    });

    it('allows empty string or null for optional imageUrl', () => {
      const parsedNull = createItemSchema.parse({
        code: 'CAP-100UF',
        name: 'Tụ 100uF',
        unit: 'cái',
        categoryId: validUUID,
        imageUrl: null,
      });
      expect(parsedNull.imageUrl).toBeNull();

      const parsedEmpty = createItemSchema.parse({
        code: 'CAP-100UF',
        name: 'Tụ 100uF',
        unit: 'cái',
        categoryId: validUUID,
        imageUrl: '',
      });
      expect(parsedEmpty.imageUrl).toBe('');
    });
  });

  describe('updateItemSchema', () => {
    it('allows partial update of descriptive attributes', () => {
      const data = {
        name: 'STM32F401 Updated Name',
        minStockAlert: 15,
      };
      const parsed = updateItemSchema.parse(data);
      expect(parsed.name).toBe('STM32F401 Updated Name');
      expect(parsed.minStockAlert).toBe(15);
      expect(parsed.description).toBeUndefined();
    });

    it('rejects empty object update', () => {
      expect(() => updateItemSchema.parse({})).toThrow(/Dữ liệu cập nhật không được để trống/);
    });

    it('rejects negative minStockAlert', () => {
      expect(() =>
        updateItemSchema.parse({
          minStockAlert: -1,
        })
      ).toThrow();
    });

    it('rejects whitespace-only code or name', () => {
      expect(() =>
        updateItemSchema.parse({
          name: '   ',
        })
      ).toThrow();

      expect(() =>
        updateItemSchema.parse({
          code: '   ',
        })
      ).toThrow();
    });

    it('strictly rejects stock quantities in schema (strict mode)', () => {
      expect(() =>
        updateItemSchema.parse({
          name: 'Valid Name',
          onHand: 9999,
        })
      ).toThrow();

      expect(() =>
        updateItemSchema.parse({
          reserved: 10,
        })
      ).toThrow();
    });
  });

  describe('updateItemStatusSchema', () => {
    it('validates active flag and optional reason', () => {
      const deactivate = updateItemStatusSchema.parse({
        isActive: false,
        reason: 'Hết hàng tạm thời / ngưng bảo dưỡng',
      });
      expect(deactivate.isActive).toBe(false);
      expect(deactivate.reason).toBe('Hết hàng tạm thời / ngưng bảo dưỡng');

      const reactivate = updateItemStatusSchema.parse({
        isActive: true,
      });
      expect(reactivate.isActive).toBe(true);
      expect(reactivate.reason).toBeUndefined();
    });

    it('rejects missing or non-boolean isActive', () => {
      expect(() => updateItemStatusSchema.parse({})).toThrow();
      expect(() => updateItemStatusSchema.parse({ isActive: 'yes' })).toThrow();
    });

    it('rejects unknown fields in status update', () => {
      expect(() =>
        updateItemStatusSchema.parse({
          isActive: true,
          extraField: 'not allowed',
        })
      ).toThrow();
    });
  });

  describe('queryItemsSchema', () => {
    it('provides sensible defaults for pagination and sorting', () => {
      const query = queryItemsSchema.parse({});
      expect(query.page).toBe(1);
      expect(query.limit).toBe(20);
      expect(query.sortBy).toBe(ItemSortField.CREATED_AT);
      expect(query.sortOrder).toBe(SortOrder.DESC);
      expect(query.isActive).toBeUndefined();
      expect(query.isLowStock).toBeUndefined();
    });

    it('parses string query params correctly from URL query strings', () => {
      const query = queryItemsSchema.parse({
        search: '  stm32  ',
        isActive: 'true',
        isLowStock: 'false',
        page: '2',
        limit: '50',
        sortBy: 'name',
        sortOrder: 'asc',
      });
      expect(query.search).toBe('stm32');
      expect(query.isActive).toBe(true);
      expect(query.isLowStock).toBe(false);
      expect(query.page).toBe(2);
      expect(query.limit).toBe(50);
      expect(query.sortBy).toBe(ItemSortField.NAME);
      expect(query.sortOrder).toBe(SortOrder.ASC);
    });

    it('rejects invalid boolean query parameter values instead of silently ignoring them', () => {
      expect(() =>
        queryItemsSchema.parse({
          isActive: 'not_a_boolean',
        })
      ).toThrow(/Giá trị lọc phải là true hoặc false/);

      expect(() =>
        queryItemsSchema.parse({
          isLowStock: 'invalid',
        })
      ).toThrow(/Giá trị lọc phải là true hoặc false/);
    });

    it('enforces limit constraints between 1 and 100', () => {
      expect(() => queryItemsSchema.parse({ limit: '0' })).toThrow();
      expect(() => queryItemsSchema.parse({ limit: '101' })).toThrow();
    });
  });

  // ==========================================
  // LOCATION VALIDATION SUITES
  // ==========================================

  describe('createLocationSchema', () => {
    it('validates a correct warehouse location with default type', () => {
      const parsed = createLocationSchema.parse({
        code: 'WH-MAIN',
        name: 'Kho Tổng Phòng Lab',
      });
      expect(parsed.code).toBe('WH-MAIN');
      expect(parsed.type).toBe(LocationType.WAREHOUSE);
      expect(parsed.parentId).toBeUndefined();
    });

    it('validates child location types (RACK, SHELF, BIN) with parentId', () => {
      const rack = createLocationSchema.parse({
        code: 'RACK-A',
        name: 'Kệ A',
        type: LocationType.RACK,
        parentId: validUUID,
      });
      expect(rack.type).toBe(LocationType.RACK);
      expect(rack.parentId).toBe(validUUID);

      const shelf = createLocationSchema.parse({
        code: 'SHELF-A1',
        name: 'Tầng A1',
        type: LocationType.SHELF,
        parentId: validUUID,
      });
      expect(shelf.type).toBe(LocationType.SHELF);

      const bin = createLocationSchema.parse({
        code: 'BIN-A1-01',
        name: 'Khay 01',
        type: LocationType.BIN,
        parentId: validUUID,
      });
      expect(bin.type).toBe(LocationType.BIN);
    });

    it('rejects invalid code with special characters or spaces', () => {
      expect(() =>
        createLocationSchema.parse({
          code: 'WH MAIN', // Space not allowed
          name: 'Kho Lab',
        })
      ).toThrow(/chữ cái, số, dấu gạch ngang/);

      expect(() =>
        createLocationSchema.parse({
          code: 'WH@#01', // Special chars not allowed
          name: 'Kho Lab',
        })
      ).toThrow(/chữ cái, số, dấu gạch ngang/);
    });

    it('rejects whitespace-only code or name', () => {
      expect(() =>
        createLocationSchema.parse({
          code: '   ',
          name: 'Kho Lab',
        })
      ).toThrow();

      expect(() =>
        createLocationSchema.parse({
          code: 'WH-01',
          name: '   ',
        })
      ).toThrow();
    });

    it('strictly rejects injected stock fields', () => {
      expect(() =>
        createLocationSchema.parse({
          code: 'WH-01',
          name: 'Kho Lab',
          onHand: 100, // Disallowed!
        })
      ).toThrow();
    });
  });

  describe('updateLocationSchema', () => {
    it('validates partial update of location name and type', () => {
      const parsed = updateLocationSchema.parse({
        name: 'Kệ A Cập Nhật',
        type: LocationType.RACK,
      });
      expect(parsed.name).toBe('Kệ A Cập Nhật');
      expect(parsed.type).toBe(LocationType.RACK);
    });

    it('rejects empty object update', () => {
      expect(() => updateLocationSchema.parse({})).toThrow(/Dữ liệu cập nhật không được để trống/);
    });

    it('strictly rejects unexpected fields', () => {
      expect(() =>
        updateLocationSchema.parse({
          name: 'Kệ B',
          totalOnHand: 50,
        })
      ).toThrow();
    });
  });

  describe('updateLocationStatusSchema', () => {
    it('validates status change with reason', () => {
      const deactivate = updateLocationStatusSchema.parse({
        isActive: false,
        reason: 'Bảo trì giá đỡ kho',
      });
      expect(deactivate.isActive).toBe(false);
      expect(deactivate.reason).toBe('Bảo trì giá đỡ kho');
    });

    it('rejects missing or invalid isActive', () => {
      expect(() => updateLocationStatusSchema.parse({})).toThrow();
      expect(() => updateLocationStatusSchema.parse({ isActive: 'false' })).toThrow();
    });
  });

  describe('queryLocationsSchema & queryLocationTreeSchema', () => {
    it('provides defaults for query locations', () => {
      const query = queryLocationsSchema.parse({});
      expect(query.page).toBe(1);
      expect(query.limit).toBe(20);
      expect(query.sortBy).toBe(LocationSortField.CODE);
      expect(query.sortOrder).toBe(SortOrder.ASC);
    });

    it('parses type, search and parentId correctly', () => {
      const query = queryLocationsSchema.parse({
        search: 'RACK',
        type: LocationType.RACK,
        parentId: validUUID,
        isActive: 'true',
      });
      expect(query.search).toBe('RACK');
      expect(query.type).toBe(LocationType.RACK);
      expect(query.parentId).toBe(validUUID);
      expect(query.isActive).toBe(true);
    });

    it('parses queryLocationTreeSchema', () => {
      const treeQuery = queryLocationTreeSchema.parse({
        includeInactive: 'true',
      });
      expect(treeQuery.includeInactive).toBe(true);
    });
  });

  // ==========================================
  // STOCK TRANSACTION VALIDATION SUITES
  // ==========================================

  describe('importStockSchema', () => {
    it('validates a valid stock import batch with unitCost and notes', () => {
      const parsed = importStockSchema.parse({
        notes: 'Nhập lô vi điều khiển đầu kỳ',
        idempotencyKey: 'tx-import-001',
        items: [
          {
            itemId: validUUID,
            locationId: validUUID2,
            quantity: 50,
            unitCost: 120000,
            notes: 'Hàng mới 100%',
          },
        ],
      });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].quantity).toBe(50);
      expect(parsed.items[0].unitCost).toBe(120000);
      expect(parsed.idempotencyKey).toBe('tx-import-001');
    });

    it('rejects duplicate (itemId, locationId) pairs in the same batch', () => {
      expect(() =>
        importStockSchema.parse({
          items: [
            { itemId: validUUID, locationId: validUUID2, quantity: 10 },
            { itemId: validUUID, locationId: validUUID2, quantity: 20 }, // Duplicate!
          ],
        })
      ).toThrow(/Không được trùng lặp linh kiện tại cùng một vị trí/);
    });

    it('allows same itemId at different locations in the same batch', () => {
      const thirdUUID = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
      const parsed = importStockSchema.parse({
        items: [
          { itemId: validUUID, locationId: validUUID2, quantity: 10 },
          { itemId: validUUID, locationId: thirdUUID, quantity: 20 },
        ],
      });
      expect(parsed.items).toHaveLength(2);
    });

    it('rejects zero, negative, or decimal quantity in import', () => {
      expect(() =>
        importStockSchema.parse({
          items: [{ itemId: validUUID, locationId: validUUID2, quantity: 0 }],
        })
      ).toThrow(/phải lớn hơn 0/);

      expect(() =>
        importStockSchema.parse({
          items: [{ itemId: validUUID, locationId: validUUID2, quantity: -5 }],
        })
      ).toThrow(/phải lớn hơn 0/);

      expect(() =>
        importStockSchema.parse({
          items: [{ itemId: validUUID, locationId: validUUID2, quantity: 10.5 }],
        })
      ).toThrow(/phải là số nguyên/);
    });

    it('strictly rejects any attempts to inject direct stock fields', () => {
      expect(() =>
        importStockSchema.parse({
          items: [
            {
              itemId: validUUID,
              locationId: validUUID2,
              quantity: 10,
              onHand: 100, // Disallowed!
            },
          ],
        })
      ).toThrow();
    });
  });

  describe('exportStockSchema', () => {
    it('validates a valid export batch with required reason', () => {
      const parsed = exportStockSchema.parse({
        notes: 'Xuất cấp phát sinh viên lớp Robotics',
        items: [
          {
            itemId: validUUID,
            locationId: validUUID2,
            quantity: 5,
            reason: 'Thực hành môn Vi điều khiển',
          },
        ],
      });
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].reason).toBe('Thực hành môn Vi điều khiển');
    });

    it('rejects missing or too short reason (< 3 chars)', () => {
      expect(() =>
        exportStockSchema.parse({
          items: [
            {
              itemId: validUUID,
              locationId: validUUID2,
              quantity: 5,
              reason: 'AB', // < 3 chars
            },
          ],
        })
      ).toThrow(/Lý do xuất kho phải có ít nhất 3 ký tự/);
    });

    it('rejects duplicate (itemId, locationId) pairs in export batch', () => {
      expect(() =>
        exportStockSchema.parse({
          items: [
            { itemId: validUUID, locationId: validUUID2, quantity: 5, reason: 'Lý do 1' },
            { itemId: validUUID, locationId: validUUID2, quantity: 3, reason: 'Lý do 2' },
          ],
        })
      ).toThrow(/Không được trùng lặp linh kiện tại cùng một vị trí/);
    });

    it('strictly rejects direct balance manipulation fields', () => {
      expect(() =>
        exportStockSchema.parse({
          items: [
            {
              itemId: validUUID,
              locationId: validUUID2,
              quantity: 5,
              reason: 'Thực hành',
              reserved: 10,
            },
          ],
        })
      ).toThrow();
    });
  });

  describe('transferStockSchema', () => {
    it('validates a valid transfer between two different locations', () => {
      const parsed = transferStockSchema.parse({
        fromLocationId: validUUID,
        toLocationId: validUUID2,
        notes: 'Chuyển linh kiện từ Kho tổng sang Khay thực hành',
        items: [
          {
            itemId: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
            quantity: 15,
          },
        ],
      });
      expect(parsed.fromLocationId).toBe(validUUID);
      expect(parsed.toLocationId).toBe(validUUID2);
      expect(parsed.items[0].quantity).toBe(15);
    });

    it('rejects transfer when fromLocationId is identical to toLocationId', () => {
      expect(() =>
        transferStockSchema.parse({
          fromLocationId: validUUID,
          toLocationId: validUUID, // Same location!
          items: [
            {
              itemId: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
              quantity: 10,
            },
          ],
        })
      ).toThrow(/Vị trí nguồn và vị trí đích không được trùng nhau/);
    });

    it('rejects duplicate items within the same transfer payload', () => {
      const itemId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
      expect(() =>
        transferStockSchema.parse({
          fromLocationId: validUUID,
          toLocationId: validUUID2,
          items: [
            { itemId, quantity: 10 },
            { itemId, quantity: 5 }, // Duplicate itemId!
          ],
        })
      ).toThrow(/Không được trùng lặp mặt hàng trong cùng một phiếu điều chuyển/);
    });

    it('strictly rejects direct stock balance parameters', () => {
      expect(() =>
        transferStockSchema.parse({
          fromLocationId: validUUID,
          toLocationId: validUUID2,
          items: [
            {
              itemId: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
              quantity: 10,
              onHandBefore: 20, // Disallowed!
            },
          ],
        })
      ).toThrow();
    });
  });

  describe('adjustStockSchema', () => {
    it('validates a valid inventory stock count adjustment with required reason', () => {
      const parsed = adjustStockSchema.parse({
        locationId: validUUID,
        notes: 'Kiểm kê kho tháng 10',
        items: [
          {
            itemId: validUUID2,
            actualOnHand: 35,
            reason: 'Kiểm kê định kỳ phát hiện thừa 2 chiếc',
          },
        ],
      });
      expect(parsed.locationId).toBe(validUUID);
      expect(parsed.items[0].actualOnHand).toBe(35);
      expect(parsed.items[0].reason).toBe('Kiểm kê định kỳ phát hiện thừa 2 chiếc');
    });

    it('allows actualOnHand = 0 (out of stock adjustment)', () => {
      const parsed = adjustStockSchema.parse({
        locationId: validUUID,
        items: [
          {
            itemId: validUUID2,
            actualOnHand: 0,
            reason: 'Đã dùng hết phục vụ dự án capstone',
          },
        ],
      });
      expect(parsed.items[0].actualOnHand).toBe(0);
    });

    it('rejects negative actualOnHand', () => {
      expect(() =>
        adjustStockSchema.parse({
          locationId: validUUID,
          items: [
            {
              itemId: validUUID2,
              actualOnHand: -1,
              reason: 'Kiểm kê định kỳ',
            },
          ],
        })
      ).toThrow(/không được âm/);
    });

    it('rejects adjustment reason shorter than 5 characters', () => {
      expect(() =>
        adjustStockSchema.parse({
          locationId: validUUID,
          items: [
            {
              itemId: validUUID2,
              actualOnHand: 10,
              reason: 'Sai', // < 5 chars
            },
          ],
        })
      ).toThrow(/ít nhất 5 ký tự/);
    });

    it('rejects duplicate items within the same adjustment payload', () => {
      expect(() =>
        adjustStockSchema.parse({
          locationId: validUUID,
          items: [
            { itemId: validUUID2, actualOnHand: 10, reason: 'Lý do 1 kiểm kê' },
            { itemId: validUUID2, actualOnHand: 12, reason: 'Lý do 2 kiểm kê' },
          ],
        })
      ).toThrow(/Không được trùng lặp mặt hàng trong cùng một phiếu điều chỉnh tồn kho/);
    });

    it('strictly rejects direct delta or balance overrides', () => {
      expect(() =>
        adjustStockSchema.parse({
          locationId: validUUID,
          items: [
            {
              itemId: validUUID2,
              actualOnHand: 10,
              reason: 'Kiểm kê',
              quantityDelta: 2, // Disallowed!
            },
          ],
        })
      ).toThrow();
    });
  });

  // ==========================================
  // INVENTORY QUERY VALIDATION SUITES
  // ==========================================

  describe('queryStockBalancesSchema', () => {
    it('provides sensible defaults and parses boolean filters', () => {
      const query = queryStockBalancesSchema.parse({
        isLowStock: 'true',
        sortBy: StockBalanceSortField.AVAILABLE,
        sortOrder: SortOrder.ASC,
      });
      expect(query.isLowStock).toBe(true);
      expect(query.sortBy).toBe(StockBalanceSortField.AVAILABLE);
      expect(query.sortOrder).toBe(SortOrder.ASC);
      expect(query.page).toBe(1);
      expect(query.limit).toBe(20);
    });
  });

  describe('queryStockTransactionsSchema & queryStockMovementsSchema', () => {
    it('validates query params for stock transactions', () => {
      const query = queryStockTransactionsSchema.parse({
        type: StockTransactionType.IMPORT,
        status: TransactionStatus.COMPLETED,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        sortBy: StockTransactionSortField.CREATED_AT,
        sortOrder: SortOrder.DESC,
      });
      expect(query.type).toBe(StockTransactionType.IMPORT);
      expect(query.status).toBe(TransactionStatus.COMPLETED);
      expect(query.startDate).toBe('2026-10-01');
    });

    it('validates query params for stock movements', () => {
      const query = queryStockMovementsSchema.parse({
        itemId: validUUID,
        type: StockTransactionType.TRANSFER,
        sortBy: StockMovementSortField.QUANTITY_DELTA,
      });
      expect(query.itemId).toBe(validUUID);
      expect(query.type).toBe(StockTransactionType.TRANSFER);
      expect(query.sortBy).toBe(StockMovementSortField.QUANTITY_DELTA);
    });
  });
});
