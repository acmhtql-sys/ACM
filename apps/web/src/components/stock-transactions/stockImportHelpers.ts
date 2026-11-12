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
    return {
      itemId: item.id,
      locationId: options.defaultLocationId,
      quantity: qty,
      unitCost: null,
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
    nextLines.push({
      itemId: item.id,
      locationId: options.defaultLocationId,
      quantity: getSuggestedReplenishQty(item, 5),
      unitCost: null,
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

