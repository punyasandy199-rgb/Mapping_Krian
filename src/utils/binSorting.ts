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
 * Sorts pallet records within a Bin according to the warehouse loading rule:
 * - "item pertama yang diinput di 1 Bin adalah urutan paling terakhir" (posisi paling bawah / slot terbesar)
 * - "apabila ada penambahan pallet akan mengisi posisi urutan sebelumnya" (nomor urut 1, dan pallet sebelumnya mundur)
 * 
 * Consequently:
 * - Latest/newest pallet added to the bin is ALWAYS at index 0 (Row No. 1).
 * - Previously added pallets shift down to row No. 2, 3, etc.
 * - The very first pallet ever inputted into the bin is at the very last index (Row No. N).
 */
export function sortBinRecordsByLoadingOrder(records: PalletRecord[]): PalletRecord[] {
  if (!records || records.length <= 1) return records ? [...records] : [];

  return [...records].sort((a, b) => {
    const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;

    // 1. If timestamps differ noticeably (e.g. entered in different batches/times):
    // Newer timestamp comes FIRST (b - a).
    if (Math.abs(timeB - timeA) > 500) {
      return timeB - timeA;
    }

    // 2. If entered in the same batch (or identical timestamps):
    // In PalletInputForm, rows are listed from top (idx 0, "penginputan paling atas", entered first)
    // to bottom (idx N-1, entered last in that batch).
    // The higher itemIndex/idx was added later, so it comes FIRST.
    // The first row entered (itemIndex: 1, idx: 0) comes LAST.
    const idxA = a.itemIndex ?? extractIndexFromId(a.id);
    const idxB = b.itemIndex ?? extractIndexFromId(b.id);
    if (idxB !== idxA) {
      return idxB - idxA;
    }

    // 3. Fallback deterministic sort by id
    return (b.id || '').localeCompare(a.id || '');
  });
}
