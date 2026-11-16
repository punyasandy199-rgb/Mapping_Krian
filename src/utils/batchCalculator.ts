import { PalletBatchEntry } from '../types/warehouse';

/**
 * Utility to calculate total boxes from trailing numbers in Batch Awal & Batch Akhir.
 * Handles formats like:
 * - B260101 to B260150 -> 101 to 150 = 50 box
 * - 001 to 020 -> 1 to 20 = 20 box
 * - LOT-A-10 to LOT-A-25 -> 10 to 25 = 16 box
 */

export interface BatchCalculationResult {
  totalBox: number;
  startNum: number;
  endNum: number;
  prefixAwal: string;
  prefixAkhir: string;
  isValid: boolean;
  message: string;
}

/**
 * Extracts the trailing numeric part of a batch string
 */
export function extractTrailingNumber(batchStr: string): {
  prefix: string;
  number: number;
  numStr: string;
} | null {
  if (!batchStr) return null;
  const trimmed = batchStr.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
    numStr: match[2]
  };
}

/**
 * Calculates the box count from No. Box range (inclusive: end - start + 1)
 */
export function calculateBatchBoxCount(
  boxAwal: string,
  boxAkhir: string
): BatchCalculationResult | null {
  if (!boxAwal || !boxAkhir) return null;

  const startParsed = extractTrailingNumber(boxAwal);
  const endParsed = extractTrailingNumber(boxAkhir);

  if (!startParsed || !endParsed) {
    return null;
  }

  const startNum = startParsed.number;
  const endNum = endParsed.number;

  if (endNum < startNum) {
    return {
      totalBox: 0,
      startNum,
      endNum,
      prefixAwal: startParsed.prefix,
      prefixAkhir: endParsed.prefix,
      isValid: false,
      message: 'No. Box akhir lebih kecil dari No. Box awal'
    };
  }

  const totalBox = endNum - startNum + 1;

  return {
    totalBox,
    startNum,
    endNum,
    prefixAwal: startParsed.prefix,
    prefixAkhir: endParsed.prefix,
    isValid: true,
    message: `${totalBox} Box (No. ${startParsed.numStr} → ${endParsed.numStr})`
  };
}

export const calculateBoxRangeCount = calculateBatchBoxCount;

export function getPalletBatches(record: {
  noBatch?: string;
  boxAwal?: string;
  boxAkhir?: string;
  batchAwal?: string;
  batchAkhir?: string;
  batches?: PalletBatchEntry[];
}): PalletBatchEntry[] {
  if (record.batches && record.batches.length > 0) {
    return record.batches.filter(
      (b) => b && (b.noBatch?.trim() || b.boxAwal?.trim() || b.boxAkhir?.trim())
    );
  }
  const noBatch = (record.noBatch || '').trim();
  const boxAwal = (record.boxAwal || record.batchAwal || '').trim();
  const boxAkhir = (record.boxAkhir || record.batchAkhir || '').trim();
  if (!noBatch && !boxAwal && !boxAkhir) {
    return [];
  }
  const calc = calculateBatchBoxCount(boxAwal, boxAkhir);
  return [
    {
      noBatch,
      boxAwal,
      boxAkhir,
      qtyBox: calc?.isValid ? calc.totalBox : undefined
    }
  ];
}

export function formatPalletBatchNumbers(record: {
  noBatch?: string;
  boxAwal?: string;
  boxAkhir?: string;
  batchAwal?: string;
  batchAkhir?: string;
  batches?: PalletBatchEntry[];
}): string {
  const list = getPalletBatches(record);
  if (list.length === 0) return record.noBatch || '-';
  return list.map((b) => b.noBatch || '-').join(' / ');
}

export function formatPalletBoxRanges(record: {
  noBatch?: string;
  boxAwal?: string;
  boxAkhir?: string;
  batchAwal?: string;
  batchAkhir?: string;
  batches?: PalletBatchEntry[];
}): string {
  const list = getPalletBatches(record);
  if (list.length === 0) {
    const start = (record.boxAwal || record.batchAwal || '').trim();
    const end = (record.boxAkhir || record.batchAkhir || '').trim();
    if (start && end) return `${start} - ${end}`;
    return start || end || '-';
  }
  return list
    .map((b) => {
      const s = (b.boxAwal || '').trim();
      const e = (b.boxAkhir || '').trim();
      if (s && e) return `${s} - ${e}`;
      return s || e || '-';
    })
    .join(' / ');
}


