import { PalletRecord } from '../types/warehouse';

/**
 * Extracts a numeric index from record id (format: plt-<timestamp>-<idx>-<random>)
 * as a fallback if itemIndex is missing.
 */
function extractIndexFromId(id: string): number {
  if (!id) return 0;
  const parts = id.split('-');
  if (parts.length >= 3) {
    const parsed = parseInt(parts[2], 10);
    if (!isNaN(parsed)) {
      return parsed + 1;
    }
  }
  return 0;
}

/**
 * Computes numeric loading-order rank for a pallet within a Bin.
 * Higher rank appears earlier in the list (Row No. 1).
 * Uses explicit `binOrder` if set via drag-and-drop, otherwise falls back
 * to submission timestamp + itemIndex so newly added pallets appear at No. 1.
 */
export function getRecordOrderRank(record: PalletRecord): number {
  if (typeof record.binOrder === 'number' && Number.isFinite(record.binOrder)) {
    return record.binOrder;
  }
  const parsedTime = record.submittedAt ? new Date(record.submittedAt).getTime() : 0;
  const safeTime = Number.isFinite(parsedTime) ? parsedTime : 0;
  const idx = record.itemIndex ?? extractIndexFromId(record.id);
  return safeTime * 1000 + idx;
}

/**
 * Sorts pallet records within a Bin according to the warehouse loading rule:
 * - "item pertama yang diinput di 1 Bin adalah urutan paling terakhir" (posisi paling bawah / slot terbesar)
 * - "apabila ada penambahan pallet akan mengisi posisi urutan sebelumnya" (nomor urut 1, dan pallet sebelumnya mundur)
 * - Operators can also drag-and-drop reorder pallets physically (`binOrder`), which overrides timestamp order.
 */
export function sortBinRecordsByLoadingOrder(records: PalletRecord[]): PalletRecord[] {
  if (!records || records.length <= 1) return records ? [...records] : [];

  return [...records].sort((a, b) => {
    // If neither record has a custom binOrder, preserve legacy 500ms batch grouping behavior
    const hasCustomA = typeof a.binOrder === 'number' && Number.isFinite(a.binOrder);
    const hasCustomB = typeof b.binOrder === 'number' && Number.isFinite(b.binOrder);

    if (!hasCustomA && !hasCustomB) {
      const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;

      if (Math.abs(timeB - timeA) > 500) {
        return timeB - timeA;
      }

      const idxA = a.itemIndex ?? extractIndexFromId(a.id);
      const idxB = b.itemIndex ?? extractIndexFromId(b.id);
      if (idxB !== idxA) {
        return idxB - idxA;
      }

      return (b.id || '').localeCompare(a.id || '');
    }

    const rankA = getRecordOrderRank(a);
    const rankB = getRecordOrderRank(b);
    if (rankB !== rankA) {
      return rankB - rankA;
    }

    return (b.id || '').localeCompare(a.id || '');
  });
}

/**
 * Computes strictly decreasing `binOrder` values for an ordered array of pallets
 * (index 0 = Row No. 1 gets `topRank`, index N-1 gets `topRank - (N - 1)`).
 * Anchor `topRank` at the current maximum rank in the list so future newly inputted pallets
 * (`Date.now() * 1000`) still naturally land at Row No. 1.
 */
export function computeReorderedBinEntries(
  orderedPallets: PalletRecord[]
): { id: string; binOrder: number }[] {
  if (!orderedPallets || orderedPallets.length === 0) return [];
  const topRank = Math.max(...orderedPallets.map(getRecordOrderRank));
  return orderedPallets.map((p, idx) => ({
    id: p.id,
    binOrder: topRank - idx
  }));
}

