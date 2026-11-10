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

