/**
 * Code 128 (Subset B) Barcode Encoder & SVG Renderer
 * Standard 1D symbology widely used in warehouse, logistics, and supply chain.
 */

// Patterns for Code 128 (index 0 to 106)
// Each 6-character string represents the widths of alternating bars and spaces (3 bars, 3 spaces).
// Stop symbol has 7 characters (4 bars, 3 spaces).
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (104=StartB, 106=Stop)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Calculates Code 128 Subset B barcode modules and checksum
 */
export function encodeCode128B(text: string): {
  valid: boolean;
  modules: boolean[]; // true = black bar, false = white space
  checksum: number;
  encodedValues: number[];
  error?: string;
} {
  // Sanitize text - Code 128B supports ASCII 32 to 126
  if (!text || text.length === 0) {
    return { valid: false, modules: [], checksum: 0, encodedValues: [], error: 'Teks barcode kosong' };
  }

  const values: number[] = [START_CODE_B];
  let checksumSum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode < 32 || charCode > 126) {
      return {
        valid: false,
        modules: [],
        checksum: 0,
        encodedValues: [],
        error: `Karakter '${text[i]}' (ASCII ${charCode}) di luar rentang Code 128B`
      };
    }
    const val = charCode - 32;
    values.push(val);
    checksumSum += val * (i + 1);
  }

  const checksum = checksumSum % 103;
  values.push(checksum);
  values.push(STOP_CODE);

  // Convert pattern codes to boolean modules array
  const modules: boolean[] = [];

  // Quiet zone at start (10 modules)
  for (let q = 0; q < 10; q++) modules.push(false);

  for (const code of values) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;

    let isBar = true;
    for (let p = 0; p < pattern.length; p++) {
      const width = parseInt(pattern[p], 10);
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  }

  // Quiet zone at end (10 modules)
  for (let q = 0; q < 10; q++) modules.push(false);

  return {
    valid: true,
    modules,
    checksum,
    encodedValues: values
  };
}

/**
 * Generates an SVG path string or SVG elements for the barcode
 */
export function generateBarcodeSvgElements(
  text: string,
  options: {
    height?: number;
    moduleWidth?: number;
    barColor?: string;
  } = {}
): {
  viewBox: string;
  rects: { x: number; y: number; width: number; height: number }[];
  totalWidth: number;
  totalHeight: number;
} {
  const height = options.height || 60;
  const moduleWidth = options.moduleWidth || 2;
  const { valid, modules } = encodeCode128B(text);

  if (!valid || modules.length === 0) {
    return {
      viewBox: "0 0 100 60",
      rects: [],
      totalWidth: 100,
      totalHeight: height
    };
  }

  const rects: { x: number; y: number; width: number; height: number }[] = [];
  let currentBarStart: number | null = null;

  for (let i = 0; i < modules.length; i++) {
    if (modules[i]) {
      if (currentBarStart === null) {
        currentBarStart = i;
      }
    } else {
      if (currentBarStart !== null) {
        const width = (i - currentBarStart) * moduleWidth;
        rects.push({
          x: currentBarStart * moduleWidth,
          y: 0,
          width,
          height
        });
        currentBarStart = null;
      }
    }
  }

  if (currentBarStart !== null) {
    const width = (modules.length - currentBarStart) * moduleWidth;
    rects.push({
      x: currentBarStart * moduleWidth,
      y: 0,
      width,
      height
    });
  }

  const totalWidth = modules.length * moduleWidth;

  return {
    viewBox: `0 0 ${totalWidth} ${height}`,
    rects,
    totalWidth,
    totalHeight: height
  };
}

/**
 * Standard warehouse barcode number generator
 * Format: PLT-[YYMMDD]-[RANDOM 4 ALPHANUMERIC]
 */
export function generatePalletBarcode(prefix = "PLT"): string {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  
  // 4 random characters (numbers & uppercase letters excluding confusing 0/O, 1/I)
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let randomPart = "";
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${prefix}-${year}${month}${date}-${randomPart}`;
}
