import { ItemResponse, LocationResponse, LocationType } from '@acm/shared';

export const MAX_IMPORT_LINES_PER_VOUCHER = 100;

export type ImportMode = 'INDIVIDUAL' | 'BULK_ALL';
export type BulkSourceFilter = 'ALL' | 'ZERO_STOCK';

export interface ImportItemDraftLine {
  itemId: string;
  locationId: string;
  quantity: number | '';
  unitCost?: number | null;
  notes?: string | null;
}

export function createEmptyImportLine(defaultLocationId = ''): ImportItemDraftLine {
  return {
    itemId: '',
    locationId: defaultLocationId,
    quantity: 1,
    unitCost: null,
    notes: '',
  };
}

export function getItemAvailableStock(item: ItemResponse): number {
  const raw = item as unknown as { available?: unknown; currentStock?: unknown };
  if (typeof raw.available === 'number' && Number.isFinite(raw.available)) return raw.available;
  if (typeof raw.currentStock === 'number' && Number.isFinite(raw.currentStock)) return raw.currentStock;
  return 0;
}

export function getItemMinStockAlert(item: ItemResponse): number {
  const raw = item as unknown as { minStockAlert?: unknown; minimumStock?: unknown };
  if (typeof raw.minStockAlert === 'number' && Number.isFinite(raw.minStockAlert)) return raw.minStockAlert;
  if (typeof raw.minimumStock === 'number' && Number.isFinite(raw.minimumStock)) return raw.minimumStock;
  return 0;
}

export function isShortageItem(item: ItemResponse): boolean {
  if (!item.isActive) return false;
  const available = getItemAvailableStock(item);
  const minAlert = getItemMinStockAlert(item);
  return Boolean(item.isLowStock) || available <= 0 || (minAlert > 0 && available < minAlert);
}

export function getSuggestedReplenishQty(item: ItemResponse, fallbackQty = 5): number {
  const available = getItemAvailableStock(item);
  const minAlert = getItemMinStockAlert(item);
  if (minAlert > available) {
    return Math.max(1, minAlert - available);
  }
  return Math.max(1, minAlert || fallbackQty);
}

export function getShortageItems(items: ItemResponse[]): ItemResponse[] {
  return items
    .filter(isShortageItem)
    .sort((a, b) => {
      const aAvail = getItemAvailableStock(a);
      const bAvail = getItemAvailableStock(b);
      if ((aAvail <= 0) !== (bAvail <= 0)) return aAvail <= 0 ? -1 : 1;
      const aDeficit = getItemMinStockAlert(a) - aAvail;
      const bDeficit = getItemMinStockAlert(b) - bAvail;
      if (aDeficit !== bDeficit) return bDeficit - aDeficit;
      return a.code.localeCompare(b.code);
    });
}

export function getDefaultLocationId(locations: LocationResponse[]): string {
  const active = locations.filter((l) => l.isActive);
  if (active.length === 0) return '';
  const preferred =
    active.find((l) => l.type === LocationType.BIN) ||
    active.find((l) => l.type === LocationType.SHELF) ||
    active.find((l) => l.type === LocationType.WAREHOUSE) ||
    active[0];
  return preferred.id;
}

export function getDistributableBins(locations: LocationResponse[]): LocationResponse[] {
  const active = locations
    .filter((l) => l.isActive)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

  const bins = active.filter((l) => l.type === LocationType.BIN);
  if (bins.length > 0) return bins;

  const shelves = active.filter((l) => l.type === LocationType.SHELF);
  if (shelves.length > 0) return shelves;

  return active;
}

export function distributeLinesAcrossBins(
  lines: ImportItemDraftLine[],
  binIds: string[]
): ImportItemDraftLine[] {
  if (binIds.length === 0 || lines.length === 0) return lines;

  const usedBinsByItem = new Map<string, Set<string>>();

  return lines.map((line, index) => {
    const preferredIdx =
      lines.length <= binIds.length
        ? index
        : Math.min(binIds.length - 1, Math.floor((index * binIds.length) / lines.length));

    let chosenBinId = binIds[preferredIdx];
    if (line.itemId) {
      const used = usedBinsByItem.get(line.itemId) ?? new Set<string>();
      if (used.has(chosenBinId)) {
        for (let offset = 1; offset < binIds.length; offset += 1) {
          const candidate = binIds[(preferredIdx + offset) % binIds.length];
          if (!used.has(candidate)) {
            chosenBinId = candidate;
            break;
          }
        }
      }
      used.add(chosenBinId);
      usedBinsByItem.set(line.itemId, used);
    }

    return {
      ...line,
      locationId: chosenBinId,
    };
  });
}

export function summarizeBinDistribution(
  lines: ImportItemDraftLine[],
  locations: LocationResponse[]
): { locationId: string; code: string; name: string; count: number }[] {
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const counts = new Map<string, number>();

  for (const line of lines) {
    if (line.locationId) {
      counts.set(line.locationId, (counts.get(line.locationId) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([locationId, count]) => {
      const loc = locMap.get(locationId);
      return {
        locationId,
        code: loc?.code || 'N/A',
        name: loc?.name || '',
        count,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
}

export const STANDARD_ROBOT_ITEM_PRICES: Record<string, number> = {
  // 1. Bo mạch điều khiển & Công tắc (CAT-ROBOT-MAIN)
  'MAIN-01': 350000,
  'MAIN-02': 450000,
  'SW-MAIN-01': 25000,
  'SW-MAIN-02': 25000,

  // 2. Cảm biến Robot & Đo lường (CAT-ROBOT-SENSOR)
  'SEN-US-01': 50000,
  'SEN-IR-01': 35000,
  'SEN-LIGHT-01': 25000,
  'SEN-SOUND-01': 30000,
  'SEN-DHT-01': 45000,
  'SEN-TOUCH-01': 20000,

  // 3. Động cơ & Cơ cấu Chấp hành (CAT-ROBOT-ACTUATOR)
  'MOT-SERVO-01': 85000,
  'MOT-DC-01': 65000,
  'ACT-SPK-BT': 75000,
  'ACT-LED': 15000,
  'ACT-LED-01': 15000,

  // 4. Bánh xe & Cơ cấu Chuyển động (CAT-ROBOT-WHEEL)
  'WHL-OMNI-01': 55000,
  'WHL-OMNI-02': 55000,
  'WHL-TIRE-01': 15000,
  'WHL-HUB-01': 20000,
  'WHL-CONN-01': 25000,
  'WHL-CONN': 25000,
  'WHL-TURN-BRICK': 35000,

  // 5. Dây cáp Tín hiệu & Nguồn (CAT-ROBOT-CABLE)
  'CAB-SRV-BLU': 12000,
  'CAB-SRV-GRY': 12000,
  'CAB-SRV-SHT': 10000,
  'CAB-SW-M1': 15000,
  'CAB-SW-M2': 15000,

  // 6. Tấm ốp, Thảm đế & Kẹp gá Servo (CAT-ROBOT-PANEL)
  'PNL-BASEBOARD': 65000,
  'PNL-FRAME-SQR': 25000,
  'PNL-BASE-BRICK': 25000,
  'PNL-MAT-5X5-RUB': 20000,
  'PNL-MAT-3X3': 15000,
  'PNL-SQR-WHT': 18000,
  'PNL-CRV-LG-WHT': 22000,
  'PNL-CRV-SM': 15000,
  'ARM-FINGER-LNG': 20000,
  'ARM-FINGER-SHT': 18000,
  'CLIP-SRV-45L': 15000,
  'CLIP-SRV-45R': 15000,
  'CLIP-SRV-DUAL': 18000,
  'CLIP-SRV-SQR': 16000,
  'BLADE-LG-L': 18000,
  'BLADE-LG-R': 18000,
  'BLADE-LONG-L': 18000,
  'BLADE-LONG-R': 18000,
  'BLADE-SM-L': 15000,
  'BLADE-SM-R': 15000,
  'SLIDE-2H-L': 15000,
  'SLIDE-2H-R': 15000,

  // 7. Thanh nối & Khung đục lỗ (CAT-ROBOT-BEAM)
  'BEAM-03H': 8000,
  'BEAM-05H': 10000,
  'BEAM-07H-BLU': 12000,
  'BEAM-07H-WHT': 12000,
  'BEAM-09H': 14000,
  'BEAM-11H': 16000,
  'BEAM-13H': 18000,
  'BEAM-15H': 20000,
  'BEAM-C3X5-BLU': 12000,
  'BEAM-C3X5-YEL': 12000,
  'BEAM-C3X7': 14000,
  'BEAM-DC3X7-BLU': 16000,
  'BEAM-DC3X7-GRY': 16000,
  'BEAM-C4X4-BLU': 14000,
  'BEAM-C4X4-GRY': 14000,
  'BEAM-C4X6-BLU': 16000,
  'BEAM-C4X6-GRY': 16000,
  'BEAM-CRV-SLICE': 10000,

  // 8. Khớp nối, Chốt gài & Trục xoay (CAT-ROBOT-JOINT)
  'JNT-1X2-DUAL': 10000,
  'JNT-1X3-DUAL': 12000,
  'JNT-2X2-DUAL': 12000,
  'JNT-2X3-RA': 14000,
  'JNT-2X4-RA': 15000,
  'JNT-3X3-BRICK': 15000,
  'JNT-5X5-BRICK': 20000,
  'JNT-PART-LNG': 14000,
  'JNT-PART-SHT': 12000,
  'JNT-DECK-BLU': 15000,
  'JNT-DECK-YEL': 15000,
  'JNT-I-BRICK': 12000,
  'JNT-BRICK-STD': 12000,
  'JNT-RND-BRICK': 14000,
  'JNT-SGL-BLU': 10000,
  'JNT-SGL-YEL': 10000,
  'SHAFT-FLAT-01': 8000,
  'PLUG-SHT-BLU': 3000,
  'PLUG-SHT-GRN': 3000,
  'PLUG-RED': 3000,
  'PLUG-LNG-YEL': 4000,
  'BUSH-01': 2000,

  // 9. Điện tử phổ biến khác
  'RES-10K': 1000,
  'CAP-100UF': 2000,
  'LED-RED': 2000,
  'MCU-ESP32': 95000,
};

export function getDefaultItemUnitCost(item: ItemResponse | undefined | null): number {
  if (!item) return 0;
  const code = (item.code || '').trim().toUpperCase();
  if (STANDARD_ROBOT_ITEM_PRICES[code] !== undefined) {
    return STANDARD_ROBOT_ITEM_PRICES[code];
  }

  // Prefix matching
  if (code.startsWith('MAIN-')) return 350000;
  if (code.startsWith('SW-MAIN')) return 25000;
  if (code.startsWith('SEN-US')) return 50000;
  if (code.startsWith('SEN-')) return 35000;
  if (code.startsWith('MOT-SERVO')) return 85000;
  if (code.startsWith('MOT-')) return 65000;
  if (code.startsWith('ACT-SPK')) return 75000;
  if (code.startsWith('ACT-LED')) return 15000;
  if (code.startsWith('ACT-')) return 30000;
  if (code.startsWith('WHL-OMNI')) return 55000;
  if (code.startsWith('WHL-TIRE')) return 15000;
  if (code.startsWith('WHL-')) return 25000;
  if (code.startsWith('CAB-')) return 12000;
  if (code.startsWith('PNL-BASEBOARD')) return 65000;
  if (
    code.startsWith('PNL-') ||
    code.startsWith('ARM-') ||
    code.startsWith('CLIP-') ||
    code.startsWith('BLADE-') ||
    code.startsWith('SLIDE-')
  ) {
    return 18000;
  }
  if (code.startsWith('BEAM-')) return 14000;
  if (code.startsWith('JNT-')) return 12000;
  if (code.startsWith('PLUG-')) return 3000;
  if (code.startsWith('BUSH-')) return 2000;
  if (code.startsWith('SHAFT-')) return 8000;
  if (code.startsWith('RES-')) return 1000;
  if (code.startsWith('CAP-')) return 2000;
  if (code.startsWith('LED-')) return 2000;

  return 10000;
}

export function isPlaceholderLine(line: ImportItemDraftLine): boolean {
  return !line.itemId;
}

export function buildBulkImportLines(options: {
  items: ItemResponse[];
  defaultLocationId: string;
  distributeLocationIds?: string[];
  fixedQuantity: number;
  useMinStockThreshold?: boolean;
}): ImportItemDraftLine[] {
  const safeQty = Number.isInteger(options.fixedQuantity) && options.fixedQuantity > 0
    ? options.fixedQuantity
    : 1;

  const baseLines = options.items.slice(0, MAX_IMPORT_LINES_PER_VOUCHER).map((item) => {
    const qty = options.useMinStockThreshold
      ? getSuggestedReplenishQty(item, safeQty)
      : safeQty;
    const defaultCost = getDefaultItemUnitCost(item);
    return {
      itemId: item.id,
      locationId: options.defaultLocationId,
      quantity: qty,
      unitCost: defaultCost > 0 ? defaultCost : null,
      notes: '',
    };
  });

  if (options.distributeLocationIds && options.distributeLocationIds.length > 1) {
    return distributeLinesAcrossBins(baseLines, options.distributeLocationIds);
  }

  return baseLines;
}

export function mergeMissingItemsIntoLines(options: {
  itemsToAdd: ItemResponse[];
  existingLines: ImportItemDraftLine[];
  defaultLocationId: string;
}): { nextLines: ImportItemDraftLine[]; addedCount: number; skippedCapCount: number } {
  const meaningfulExisting = options.existingLines.filter((l) => !isPlaceholderLine(l));
  const seenItemIds = new Set(meaningfulExisting.map((l) => l.itemId));
  const nextLines = [...meaningfulExisting];
  let addedCount = 0;
  let skippedCapCount = 0;

  for (const item of options.itemsToAdd) {
    if (seenItemIds.has(item.id)) continue;
    if (nextLines.length >= MAX_IMPORT_LINES_PER_VOUCHER) {
      skippedCapCount += 1;
      continue;
    }
    const defaultCost = getDefaultItemUnitCost(item);
    nextLines.push({
      itemId: item.id,
      locationId: options.defaultLocationId,
      quantity: getSuggestedReplenishQty(item, 5),
      unitCost: defaultCost > 0 ? defaultCost : null,
      notes: '',
    });
    seenItemIds.add(item.id);
    addedCount += 1;
  }

  return {
    nextLines: nextLines.length > 0 ? nextLines : [createEmptyImportLine(options.defaultLocationId)],
    addedCount,
    skippedCapCount,
  };
}

export function applyDefaultUnitCostsToLines(
  lines: ImportItemDraftLine[],
  items: ItemResponse[]
): ImportItemDraftLine[] {
  const itemMap = new Map(items.map((it) => [it.id, it]));
  return lines.map((line) => {
    if (!line.itemId) return line;
    const it = itemMap.get(line.itemId);
    const cost = getDefaultItemUnitCost(it);
    return {
      ...line,
      unitCost: cost > 0 ? cost : line.unitCost,
    };
  });
}

