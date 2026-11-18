import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { auth } from './firebase';
import {
  PalletRecord,
  PalletQcStatus,
  SuratJalanRecord,
  MasterItem,
  MasterWarehouse,
  DEFAULT_MASTER_WAREHOUSES,
  resolvePalletWarehouseLocation,
  computePalletStockStatus,
  resolvePalletQcStatus,
  deriveAsalPacking
} from '../types/warehouse';
import {
  calculateBatchBoxCount,
  getPalletBatches
} from '../utils/batchCalculator';

export const DEFAULT_SPREADSHEET_ID = '1FOwFPgZA8VCPY4yqrHQb6bRRsSCjRWAgM8Wl02PblDE';
export const DEFAULT_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1FOwFPgZA8VCPY4yqrHQb6bRRsSCjRWAgM8Wl02PblDE/edit?gid=0#gid=0';
export const DEFAULT_SPREADSHEET_NAME = 'Data GBJ (new)';

export const DEFAULT_PALLET_TAB_TITLE = 'Data GBJ';
export const SURAT_JALAN_TAB_TITLE = 'Surat Jalan';
export const SURAT_JALAN_MANUAL_TAB_TITLE = 'Surat Jalan Manual';
export const REKAP_STOK_TAB_TITLE = 'Rekap Stok Gudang';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Configure GoogleAuthProvider reusing the existing Firebase Auth instance
const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

// STRICT IN-MEMORY ONLY OAUTH ACCESS TOKEN CACHE (Never persisted to localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initGoogleSheetsAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure(null);
    }
  });
};

export const signInWithGoogleSheets = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Token akses Google Sheets tidak diperoleh. Pastikan izin akses Google Sheets disetujui saat login.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    const errObj = error as { code?: string; message?: string };
    if (errObj?.code === 'auth/popup-closed-by-user') {
      throw new Error('Jendela login Google ditutup sebelum selesai.');
    }
    if (errObj?.code === 'auth/popup-blocked') {
      throw new Error('Popup login Google diblokir oleh browser. Izinkan popup untuk situs ini lalu coba lagi.');
    }
    throw new Error(errObj?.message || 'Gagal login dengan akun Google.');
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleSheetsAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const clearGoogleSheetsToken = () => {
  cachedAccessToken = null;
};

export const signOutGoogleSheets = async (): Promise<void> => {
  cachedAccessToken = null;
  await auth.signOut();
};

export function extractSpreadsheetId(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return DEFAULT_SPREADSHEET_ID;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return trimmed;
}

export interface SheetProtectedRangeInfo {
  protectedRangeId: number;
  description?: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
  protectedRanges?: SheetProtectedRangeInfo[];
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: SheetTabInfo[];
  bridgeVersion?: number;
}

async function sheetsFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = getGoogleSheetsAccessToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED: Silakan login dengan akun Google terlebih dahulu.');
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('TOKEN_EXPIRED: Sesi akses Google Sheets berakhir. Silakan Sign in with Google kembali.');
  }

  if (!res.ok) {
    let apiMessage = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      apiMessage = errBody?.error?.message || apiMessage;
    } catch {
      // ignore JSON parse failure
    }

    if (res.status === 403) {
      throw new Error(
        `AKSES DITOLAK (403): Akun Google Anda belum memiliki izin Editor pada spreadsheet ini. Buka spreadsheet "Data GBJ (new)" -> klik Bagikan (Share) -> berikan akses Editor ke akun Google yang digunakan login. (${apiMessage})`
      );
    }
    if (res.status === 404) {
      throw new Error(
        `SPREADSHEET TIDAK DITEMUKAN (404): Periksa kembali alamat URL atau ID Spreadsheet yang dimasukkan.`
      );
    }
    throw new Error(`Gagal mengakses Google Sheets API: ${apiMessage}`);
  }

  if (res.status === 204) return {};
  return res.json();
}

/**
 * Fetch spreadsheet title & all actual sheet tab names dynamically (never hardcode Sheet1)
 */
export async function fetchSpreadsheetMetadata(
  spreadsheetIdInput: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdInput);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=spreadsheetId,properties.title,sheets(properties(sheetId,title,index,gridProperties),protectedRanges(protectedRangeId,description))`;

  const data = await sheetsFetch(url, { method: 'GET' });
  const sheets: SheetTabInfo[] = Array.isArray(data?.sheets)
    ? data.sheets.map((s: any) => ({
        sheetId: Number(s?.properties?.sheetId ?? 0),
        title: String(s?.properties?.title ?? 'Sheet1'),
        index: Number(s?.properties?.index ?? 0),
        rowCount: Number(s?.properties?.gridProperties?.rowCount ?? 1000),
        columnCount: Number(s?.properties?.gridProperties?.columnCount ?? 26),
        protectedRanges: Array.isArray(s?.protectedRanges)
          ? s.protectedRanges.map((pr: any) => ({
              protectedRangeId: Number(pr?.protectedRangeId ?? 0),
              description: pr?.description ? String(pr.description) : ''
            }))
          : []
      }))
    : [];

  return {
    spreadsheetId: String(data?.spreadsheetId || spreadsheetId),
    title: String(data?.properties?.title || DEFAULT_SPREADSHEET_NAME),
    sheets: sheets.sort((a, b) => a.index - b.index)
  };
}

function escapeSheetNameForA1(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/**
 * Read values from a specific tab in the spreadsheet
 */
export async function readSheetValues(
  spreadsheetIdInput: string,
  sheetTitle: string,
  range = 'A1:AZ5000'
): Promise<string[][]> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdInput);
  const fullRange = `${escapeSheetNameForA1(sheetTitle)}!${range}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(fullRange)}?majorDimension=ROWS`;

  const data = await sheetsFetch(url, { method: 'GET' });
  return Array.isArray(data?.values) ? data.values : [];
}

/**
 * Ensure a sheet tab exists in the spreadsheet; create it if missing
 */
async function ensureTabsExist(
  spreadsheetId: string,
  metadata: SpreadsheetMetadata,
  requiredTitles: string[]
): Promise<SpreadsheetMetadata> {
  const existingTitles = new Set(metadata.sheets.map((s) => s.title));
  const missing = requiredTitles.filter((t) => !existingTitles.has(t));

  if (missing.length === 0) return metadata;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}:batchUpdate`;

  await sheetsFetch(url, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({
        addSheet: {
          properties: {
            title,
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      }))
    })
  });

  return fetchSpreadsheetMetadata(spreadsheetId);
}

async function clearAndWriteSheetTab(
  spreadsheetId: string,
  sheetTitle: string,
  sheetId: number | undefined,
  rows: (string | number)[][]
): Promise<void> {
  const escaped = escapeSheetNameForA1(sheetTitle);
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(`${escaped}!A1:AZ10000`)}:clear`;

  await sheetsFetch(clearUrl, {
    method: 'POST',
    body: JSON.stringify({})
  });

  if (rows.length === 0) return;

  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(`${escaped}!A1`)}?valueInputOption=USER_ENTERED`;

  await sheetsFetch(updateUrl, {
    method: 'PUT',
    body: JSON.stringify({
      range: `${escaped}!A1`,
      majorDimension: 'ROWS',
      values: rows
    })
  });

  // Reset old header formatting across A..AZ first so shrinking columns leave no stale blue cells
  if (sheetId !== undefined) {
    const colCount = rows[0]?.length || 10;
    const formatUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`;

    await sheetsFetch(formatUrl, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 52
              },
              cell: {
                userEnteredFormat: {}
              },
              fields: 'userEnteredFormat'
            }
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 }
              },
              fields: 'gridProperties.frozenRowCount'
            }
          },
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: colCount
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.08, green: 0.24, blue: 0.48 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                    fontSize: 10
                  },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields:
                'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: colCount
              }
            }
          }
        ]
      })
    }).catch(() => {
      // Non-critical styling failure should not fail data sync
    });
  }
}

export function getPalletSheetHeaders(includeKeterangan: boolean): string[] {
  const headers = [
    'ID Sistem',
    'Status In/Out',
    'Asal Packing',
    'Status',
    'Status Stok',
    'No. Pallet',
    'Kode Barcode',
    'Kode Item',
    'Nama Barang',
    'Qty (Box)',
    'Satuan',
    'No. Batch',
    'Box Awal',
    'Box Akhir',
    'Lokasi Bin',
    'Lokasi Gudang',
    'Gudang Asal',
    'Oper Gudang 1 (Dari → Ke)',
    'Tgl Oper Gudang 1',
    'Oper Gudang 2 (Dari → Ke)',
    'Tgl Oper Gudang 2'
  ];
  if (includeKeterangan) {
    headers.push('Keterangan / Problem');
  }
  headers.push(
    'Tanggal Input',
    'Terakhir Update',
    'Aksi Update Terakhir',
    'Tujuan Pengambilan',
    'Tanggal Pengambilan',
    'Petugas Pengambilan',
    'No. Surat Jalan',
    'Tanggal SJ',
    'No. SPP',
    'No. PO',
    'No. Polisi',
    'Vendor Armada',
    'Nama Driver',
    'Tujuan SJ'
  );
  return headers;
}

export const PALLET_SHEET_HEADERS = getPalletSheetHeaders(true);

function formatDateTimeId(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function isManualSuratJalan(sj: SuratJalanRecord): boolean {
  return !sj.palletIds || sj.palletIds.length === 0;
}

function buildSuratJalanLookup(suratJalanHistory: SuratJalanRecord[]) {
  const sjById = new Map<string, SuratJalanRecord>();
  const sjByNo = new Map<string, SuratJalanRecord>();
  const sjByPalletId = new Map<string, SuratJalanRecord>();

  const ordered = [...suratJalanHistory].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  ordered.forEach((sj) => {
    if (sj.id) sjById.set(sj.id, sj);
    if (sj.noSuratJalan) {
      sjByNo.set(sj.noSuratJalan.trim().toUpperCase(), sj);
    }
    (sj.palletIds || []).forEach((pid) => {
      if (pid) sjByPalletId.set(pid, sj);
    });
  });

  return (r: PalletRecord): SuratJalanRecord | null => {
    if (r.suratJalanId && sjById.has(r.suratJalanId)) {
      return sjById.get(r.suratJalanId) || null;
    }
    if (sjByPalletId.has(r.id)) {
      return sjByPalletId.get(r.id) || null;
    }
    if (r.noSuratJalan) {
      const key = r.noSuratJalan.trim().toUpperCase();
      if (sjByNo.has(key)) return sjByNo.get(key) || null;
    }
    return null;
  };
}

export function computeBatchRowEntries(r: PalletRecord): {
  noBatch: string;
  boxAwal: string;
  boxAkhir: string;
  qtyBox: number;
}[] {
  const batches = getPalletBatches(r);
  const totalRecordQty = Number(r.qtyPallet) || 0;

  if (batches.length <= 1) {
    const b = batches[0];
    return [
      {
        noBatch: (b?.noBatch || r.noBatch || '-').trim() || '-',
        boxAwal: (b?.boxAwal || r.boxAwal || r.batchAwal || '-').trim() || '-',
        boxAkhir: (b?.boxAkhir || r.boxAkhir || r.batchAkhir || '-').trim() || '-',
        qtyBox: totalRecordQty
      }
    ];
  }

  const rawQtys = batches.map((b) => {
    if (b.qtyBox !== undefined && b.qtyBox !== null && !isNaN(Number(b.qtyBox))) {
      return Number(b.qtyBox);
    }
    const calc = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
    return calc?.isValid ? calc.totalBox : null;
  });

  const knownSum = rawQtys.reduce<number>((sum, q) => sum + (q ?? 0), 0);
  const missingCount = rawQtys.filter((q) => q === null).length;

  return batches.map((b, idx) => {
    let q = rawQtys[idx];
    if (q === null) {
      const remaining = Math.max(0, totalRecordQty - knownSum);
      q = missingCount === 1 ? remaining : 0;
    }
    return {
      noBatch: (b.noBatch || '-').trim() || '-',
      boxAwal: (b.boxAwal || '-').trim() || '-',
      boxAkhir: (b.boxAkhir || '-').trim() || '-',
      qtyBox: q
    };
  });
}

export function buildPalletSheetRows(
  records: PalletRecord[],
  suratJalanHistory: SuratJalanRecord[] = [],
  masterWarehouses: MasterWarehouse[] = DEFAULT_MASTER_WAREHOUSES
): (string | number)[][] {
  const sorted = [...records].sort((a, b) => {
    const statusA = a.status === 'OUT' ? 1 : 0;
    const statusB = b.status === 'OUT' ? 1 : 0;
    if (statusA !== statusB) return statusA - statusB;

    if (statusA === 0) {
      const binCmp = (a.lokasiBin || '').localeCompare(b.lokasiBin || '', undefined, {
        numeric: true
      });
      if (binCmp !== 0) return binCmp;
      return (b.binOrder ?? 0) - (a.binOrder ?? 0);
    }
    return new Date(b.updatedAt || b.submittedAt).getTime() -
      new Date(a.updatedAt || a.submittedAt).getTime();
  });

  const hasAnyKeterangan = sorted.some((r) => (r.keterangan || '').trim().length > 0);
  const resolveSj = buildSuratJalanLookup(suratJalanHistory);

  const rows: (string | number)[][] = [getPalletSheetHeaders(hasAnyKeterangan)];

  sorted.forEach((r) => {
    const batchEntries = computeBatchRowEntries(r);
    const sj = resolveSj(r);
    const stockStatus = computePalletStockStatus(r, sj);
    const lokasiGudang = resolvePalletWarehouseLocation(r, masterWarehouses);
    const op1 = r.operHistory?.[0];
    const op2 = r.operHistory?.[1];
    const gudangAsal = r.gudangAsal || op1?.dariGudang || '';
    const op1Text = op1
      ? `${op1.dariGudang} → ${op1.keGudang}${op1.binBaru ? ` (Bin ${op1.binBaru})` : ''}`
      : '';
    const op1Date = op1?.tanggalOper ? formatDateTimeId(op1.tanggalOper) : '';
    const op2Text = op2
      ? `${op2.dariGudang} → ${op2.keGudang}${op2.binBaru ? ` (Bin ${op2.binBaru})` : ''}`
      : '';
    const op2Date = op2?.tanggalOper ? formatDateTimeId(op2.tanggalOper) : '';

    const qcStatus = resolvePalletQcStatus(r);

    batchEntries.forEach((entry) => {
      const asalPacking = deriveAsalPacking(entry.noBatch || r.noBatch);
      const row: (string | number)[] = [
        r.id,
        r.status === 'OUT' ? 'OUT' : 'IN',
        asalPacking,
        qcStatus,
        stockStatus,
        r.nomorPallet || '-',
        r.barcodeNumber || '-',
        r.kodeItem || '-',
        r.namaBarang || '-',
        entry.qtyBox,
        r.unit || 'Box',
        entry.noBatch,
        entry.boxAwal,
        entry.boxAkhir,
        r.lokasiBin || '-',
        lokasiGudang,
        gudangAsal,
        op1Text,
        op1Date,
        op2Text,
        op2Date
      ];

      if (hasAnyKeterangan) {
        row.push(r.keterangan || '');
      }

      row.push(
        formatDateTimeId(r.submittedAt),
        formatDateTimeId(r.updatedAt || r.submittedAt),
        r.lastUpdateAction || (r.updatedAt ? 'Diperbarui' : 'Input Baru'),
        r.tujuanPengambilan || '',
        r.tanggalPengambilan ? formatDateTimeId(r.tanggalPengambilan) : '',
        r.petugasPengambilan || '',
        sj?.noSuratJalan || r.noSuratJalan || '',
        sj ? sj.tanggalPengambilanFormatted || sj.tanggal || '' : '',
        sj?.noSpp || '',
        sj?.noPo || '',
        sj?.noPolisi || '',
        sj?.namaVendorArmada || '',
        sj?.namaDriver || '',
        sj ? sj.ruteTujuanNama || sj.ruteTujuanKode || '' : ''
      );

      rows.push(row);
    });
  });

  return rows;
}

export function buildSuratJalanSheetRows(
  suratList: SuratJalanRecord[]
): (string | number)[][] {
  const headers = [
    'ID SJ',
    'No. Surat Jalan',
    'Tanggal SJ',
    'Waktu Cetak',
    'No. SPP',
    'No. PO',
    'No. Kontainer',
    'No. Faktur',
    'No. Invoice',
    'No. Polisi',
    'Vendor Armada',
    'Nama Driver',
    'HP Driver',
    'Total Box',
    'Total Kg',
    'Ringkasan Barang',
    'Daftar No. Pallet',
    'Rute Dari',
    'Rute Tujuan',
    'Tarif (Rp)',
    'PPN (%)',
    'Total Tarif (Rp)',
    'Catatan',
    'Dibuat Pada'
  ];

  // Hanya Surat Jalan yang mengambil data pallet (palletIds > 0)
  const palletBackedList = suratList
    .filter((sj) => !isManualSuratJalan(sj))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rows: (string | number)[][] = [headers];
  palletBackedList.forEach((sj) => {
    const barangStr = (sj.itemsSummary || [])
      .map((i) => `${i.kodeItem || '-'} · ${i.namaBarang} (${i.qtyBox} Box / ${i.totalKg} Kg)`)
      .join(' | ');
    const palletSet = Array.from(
      new Set((sj.itemsSummary || []).flatMap((i) => i.nomorPalletList || []))
    ).join(', ');

    rows.push([
      sj.id,
      sj.noSuratJalan,
      sj.tanggalPengambilanFormatted || sj.tanggal,
      sj.waktuCetakFormatted || sj.tglJamCetakCustom || '-',
      sj.noSpp || '-',
      sj.noPo || '-',
      sj.noKontainer || '-',
      sj.noFaktur || '-',
      sj.noInvoice || '-',
      sj.noPolisi || '-',
      sj.namaVendorArmada || '-',
      sj.namaDriver || '-',
      sj.noHpDriver || '-',
      Number(sj.grandTotalBox) || 0,
      Number(sj.grandTotalKg) || 0,
      barangStr || '-',
      palletSet || '-',
      sj.ruteDariNama || '-',
      sj.ruteTujuanNama || sj.ruteTujuanKode || '-',
      Number(sj.tarif) || 0,
      Number(sj.ppnPersen) || 0,
      Number(sj.tarifTotal) || 0,
      sj.note || '',
      formatDateTimeId(sj.createdAt)
    ]);
  });

  return rows;
}

export function buildManualSuratJalanSheetRows(
  suratList: SuratJalanRecord[]
): (string | number)[][] {
  const headers = [
    'ID SJ',
    'No. Surat Jalan',
    'Tanggal SJ',
    'Waktu Cetak',
    'No. SPP',
    'No. PO',
    'No. Kontainer',
    'No. Faktur',
    'No. Invoice',
    'No. Polisi',
    'Vendor Armada',
    'Nama Driver',
    'HP Driver',
    'Total Box SJ',
    'Total Kg SJ',
    'Kode Item',
    'Nama Barang (Manual)',
    'Qty (Box)',
    'Berat/Box (Kg)',
    'Total Berat (Kg)',
    'Rute Dari',
    'Rute Tujuan',
    'Tarif (Rp)',
    'PPN (%)',
    'Total Tarif (Rp)',
    'Catatan',
    'Dibuat Pada'
  ];

  // Hanya Surat Jalan yang dibuat tanpa mengambil list pallet (input barang manual)
  const manualList = suratList
    .filter((sj) => isManualSuratJalan(sj))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rows: (string | number)[][] = [headers];
  manualList.forEach((sj) => {
    const items = sj.itemsSummary && sj.itemsSummary.length > 0 ? sj.itemsSummary : [null];
    items.forEach((item) => {
      rows.push([
        sj.id,
        sj.noSuratJalan,
        sj.tanggalPengambilanFormatted || sj.tanggal,
        sj.waktuCetakFormatted || sj.tglJamCetakCustom || '-',
        sj.noSpp || '-',
        sj.noPo || '-',
        sj.noKontainer || '-',
        sj.noFaktur || '-',
        sj.noInvoice || '-',
        sj.noPolisi || '-',
        sj.namaVendorArmada || '-',
        sj.namaDriver || '-',
        sj.noHpDriver || '-',
        Number(sj.grandTotalBox) || 0,
        Number(sj.grandTotalKg) || 0,
        item?.kodeItem || '-',
        item?.namaBarang || '-',
        item ? Number(item.qtyBox) || 0 : Number(sj.grandTotalBox) || 0,
        item ? Number(item.beratPerBoxKg) || 0 : 0,
        item ? Number(item.totalKg) || 0 : Number(sj.grandTotalKg) || 0,
        sj.ruteDariNama || '-',
        sj.ruteTujuanNama || sj.ruteTujuanKode || '-',
        Number(sj.tarif) || 0,
        Number(sj.ppnPersen) || 0,
        Number(sj.tarifTotal) || 0,
        sj.note || '',
        formatDateTimeId(sj.createdAt)
      ]);
    });
  });

  return rows;
}

export function buildRekapStokSheetRows(
  records: PalletRecord[],
  masterItems: MasterItem[]
): (string | number)[][] {
  const headers = [
    'Kode Item',
    'Nama Barang',
    'Total Pallet Aktif (IN)',
    'Total Qty Aktif (Box)',
    'Estimasi Berat Aktif (Kg)',
    'Lokasi Bin Aktif',
    'Total Pallet Keluar (OUT)',
    'Total Qty Keluar (Box)',
    'Waktu Sinkronisasi'
  ];

  const weightLookup = new Map<string, number>();
  masterItems.forEach((m) => {
    weightLookup.set((m.kodeItem || '').trim().toUpperCase(), Number(m.beratPerBoxKg) || 30);
    weightLookup.set((m.namaBarang || '').trim().toUpperCase(), Number(m.beratPerBoxKg) || 30);
  });

  interface Agg {
    kodeItem: string;
    namaBarang: string;
    inPallets: number;
    inBox: number;
    inKg: number;
    bins: Set<string>;
    outPallets: number;
    outBox: number;
  }

  const map = new Map<string, Agg>();
  records.forEach((r) => {
    const kode = (r.kodeItem || '-').trim().toUpperCase();
    const nama = (r.namaBarang || '-').trim();
    const key = `${kode}__${nama.toUpperCase()}`;
    const existing = map.get(key) || {
      kodeItem: kode,
      namaBarang: nama,
      inPallets: 0,
      inBox: 0,
      inKg: 0,
      bins: new Set<string>(),
      outPallets: 0,
      outBox: 0
    };

    const qty = Number(r.qtyPallet) || 0;
    const perBox = weightLookup.get(kode) || weightLookup.get(nama.toUpperCase()) || 30;
    if (r.status === 'OUT') {
      existing.outPallets += 1;
      existing.outBox += qty;
    } else {
      existing.inPallets += 1;
      existing.inBox += qty;
      existing.inKg += qty * perBox;
      if (r.lokasiBin) existing.bins.add(r.lokasiBin.trim().toUpperCase());
    }
    map.set(key, existing);
  });

  const nowStr = formatDateTimeId(new Date().toISOString());
  const rows: (string | number)[][] = [headers];
  Array.from(map.values())
    .sort((a, b) => a.namaBarang.localeCompare(b.namaBarang))
    .forEach((agg) => {
      rows.push([
        agg.kodeItem,
        agg.namaBarang,
        agg.inPallets,
        agg.inBox,
        agg.inKg,
        Array.from(agg.bins)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .join(', ') || '-',
        agg.outPallets,
        agg.outBox,
        nowStr
      ]);
    });

  return rows;
}

export interface SyncAllOptions {
  spreadsheetId: string;
  palletTabTitle: string;
  records: PalletRecord[];
  suratJalanHistory: SuratJalanRecord[];
  masterItems: MasterItem[];
  masterWarehouses?: MasterWarehouse[];
  syncSuratJalanTab?: boolean;
  syncManualSjTab?: boolean;
  manualSjSpreadsheetId?: string;
  syncRekapTab?: boolean;
  lockSheetReadOnly?: boolean;
}

export interface SyncAllResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  palletTabTitle: string;
  palletRowsCount: number;
  suratJalanRowsCount: number;
  manualSuratJalanRowsCount: number;
  rekapRowsCount: number;
  bridgeVersion?: number;
  syncedAt: string;
}

const READ_ONLY_LOCK_DESC = 'PalletTrack Read-Only Lock';

async function applySheetProtectionsViaApi(
  spreadsheetId: string,
  meta: SpreadsheetMetadata,
  targetTitles: string[],
  shouldLock: boolean
): Promise<void> {
  const targetSet = new Set(targetTitles);
  const requests: any[] = [];

  meta.sheets.forEach((sheet) => {
    if (!targetSet.has(sheet.title)) return;
    const existingLocks = (sheet.protectedRanges || []).filter(
      (pr) => pr.description === READ_ONLY_LOCK_DESC && pr.protectedRangeId
    );
    if (shouldLock) {
      if (existingLocks.length === 0) {
        requests.push({
          addProtectedRange: {
            protectedRange: {
              range: { sheetId: sheet.sheetId },
              description: READ_ONLY_LOCK_DESC,
              warningOnly: false,
              editors: {
                domainUsersCanEdit: false
              }
            }
          }
        });
      }
    } else {
      existingLocks.forEach((pr) => {
        requests.push({
          deleteProtectedRange: {
            protectedRangeId: pr.protectedRangeId
          }
        });
      });
    }
  });

  if (requests.length === 0) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}:batchUpdate`;

  await sheetsFetch(url, {
    method: 'POST',
    body: JSON.stringify({ requests })
  }).catch(() => {
    // Best-effort sheet lock so permission edge cases never fail data sync
  });
}

/**
 * Push all current system data (Data Pallet, Surat Jalan, Surat Jalan Manual, Rekap Stok Gudang) into Google Sheets
 */
export async function syncAllDataToSpreadsheet(
  opts: SyncAllOptions
): Promise<SyncAllResult> {
  const spreadsheetId = extractSpreadsheetId(opts.spreadsheetId);
  let meta = await fetchSpreadsheetMetadata(spreadsheetId);

  const hasDataGbjTab = meta.sheets.some((s) => s.title === DEFAULT_PALLET_TAB_TITLE);
  const hasExplicitNonSheet1 =
    Boolean(opts.palletTabTitle) &&
    !/^sheet\s*1$/i.test(opts.palletTabTitle.trim()) &&
    meta.sheets.some((s) => s.title === opts.palletTabTitle);

  let chosenPalletTab: string;
  if (hasExplicitNonSheet1) {
    chosenPalletTab = opts.palletTabTitle;
  } else if (hasDataGbjTab) {
    chosenPalletTab = DEFAULT_PALLET_TAB_TITLE;
  } else {
    const sheet1Candidate =
      meta.sheets.find((s) => /^sheet\s*1$/i.test(s.title.trim())) || meta.sheets[0];
    if (sheet1Candidate && /^sheet\s*1$/i.test(sheet1Candidate.title.trim())) {
      const renameUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`;
      await sheetsFetch(renameUrl, {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheet1Candidate.sheetId,
                  title: DEFAULT_PALLET_TAB_TITLE
                },
                fields: 'title'
              }
            }
          ]
        })
      });
      meta = await fetchSpreadsheetMetadata(spreadsheetId);
      chosenPalletTab = DEFAULT_PALLET_TAB_TITLE;
    } else {
      chosenPalletTab = sheet1Candidate?.title || DEFAULT_PALLET_TAB_TITLE;
    }
  }

  const manualTargetId = opts.manualSjSpreadsheetId?.trim()
    ? extractSpreadsheetId(opts.manualSjSpreadsheetId)
    : '';
  const useSeparateManualFile = Boolean(manualTargetId && manualTargetId !== spreadsheetId);

  const requiredTabs = [chosenPalletTab];
  if (opts.syncSuratJalanTab !== false) requiredTabs.push(SURAT_JALAN_TAB_TITLE);
  if (opts.syncManualSjTab !== false && !useSeparateManualFile) {
    requiredTabs.push(SURAT_JALAN_MANUAL_TAB_TITLE);
  }
  if (opts.syncRekapTab !== false) requiredTabs.push(REKAP_STOK_TAB_TITLE);

  meta = await ensureTabsExist(spreadsheetId, meta, requiredTabs);

  const tabIdMap = new Map<string, number>();
  meta.sheets.forEach((s) => tabIdMap.set(s.title, s.sheetId));

  const palletRows = buildPalletSheetRows(
    opts.records,
    opts.suratJalanHistory,
    opts.masterWarehouses
  );
  await clearAndWriteSheetTab(
    spreadsheetId,
    chosenPalletTab,
    tabIdMap.get(chosenPalletTab),
    palletRows
  );

  let sjCount = 0;
  if (opts.syncSuratJalanTab !== false) {
    const sjRows = buildSuratJalanSheetRows(opts.suratJalanHistory);
    sjCount = sjRows.length - 1;
    await clearAndWriteSheetTab(
      spreadsheetId,
      SURAT_JALAN_TAB_TITLE,
      tabIdMap.get(SURAT_JALAN_TAB_TITLE),
      sjRows
    );
  }

  let manualSjCount = 0;
  let manualMetaForLock: SpreadsheetMetadata | null = null;
  if (opts.syncManualSjTab !== false) {
    const manualRows = buildManualSuratJalanSheetRows(opts.suratJalanHistory);
    manualSjCount = manualRows.length - 1;

    if (useSeparateManualFile) {
      let manualMeta = await fetchSpreadsheetMetadata(manualTargetId);
      manualMeta = await ensureTabsExist(manualTargetId, manualMeta, [
        SURAT_JALAN_MANUAL_TAB_TITLE
      ]);
      manualMetaForLock = manualMeta;
      const manualSheetId = manualMeta.sheets.find(
        (s) => s.title === SURAT_JALAN_MANUAL_TAB_TITLE
      )?.sheetId;
      await clearAndWriteSheetTab(
        manualTargetId,
        SURAT_JALAN_MANUAL_TAB_TITLE,
        manualSheetId,
        manualRows
      );
    } else {
      await clearAndWriteSheetTab(
        spreadsheetId,
        SURAT_JALAN_MANUAL_TAB_TITLE,
        tabIdMap.get(SURAT_JALAN_MANUAL_TAB_TITLE),
        manualRows
      );
    }
  }

  let rekapCount = 0;
  if (opts.syncRekapTab !== false) {
    const rekapRows = buildRekapStokSheetRows(opts.records, opts.masterItems);
    rekapCount = rekapRows.length - 1;
    await clearAndWriteSheetTab(
      spreadsheetId,
      REKAP_STOK_TAB_TITLE,
      tabIdMap.get(REKAP_STOK_TAB_TITLE),
      rekapRows
    );
  }

  const shouldLock = opts.lockSheetReadOnly !== false;
  await applySheetProtectionsViaApi(spreadsheetId, meta, requiredTabs, shouldLock);
  if (useSeparateManualFile && manualMetaForLock) {
    await applySheetProtectionsViaApi(
      manualTargetId,
      manualMetaForLock,
      [SURAT_JALAN_MANUAL_TAB_TITLE],
      shouldLock
    );
  }

  return {
    spreadsheetId,
    spreadsheetTitle: meta.title,
    palletTabTitle: chosenPalletTab,
    palletRowsCount: palletRows.length - 1,
    suratJalanRowsCount: sjCount,
    manualSuratJalanRowsCount: manualSjCount,
    rekapRowsCount: rekapCount,
    syncedAt: new Date().toISOString()
  };
}

// =========================================================================
// MODE B: GOOGLE APPS SCRIPT WEB APP BRIDGE (24/7 MULTI-USER WITHOUT LOGIN)
// =========================================================================

export const DEFAULT_APPS_SCRIPT_SECRET = 'SJA-GBJ-2026';

export function normalizeAppsScriptUrl(url: string): string {
  return (url || '').trim();
}

export function isValidAppsScriptUrl(url: string): boolean {
  const cleaned = normalizeAppsScriptUrl(url);
  return (
    /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec(\?.*)?$/i.test(cleaned) ||
    /^https:\/\/script\.googleusercontent\.com\/macros\/.+/i.test(cleaned)
  );
}

/**
 * Generates ready-to-paste Google Apps Script (Code.gs) to be deployed inside "Data GBJ (new)"
 * as "Execute as: Me" and "Who has access: Anyone".
 */
export function generateAppsScriptCode(secretToken: string): string {
  const safeSecret = (secretToken || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `// ============================================================================
// PALLETTRACK SJA <-> GOOGLE SHEETS "Data GBJ (new)" BRIDGE v4 (AUTO-SYNC + READ-ONLY LOCK)
// Cara Pasang / Update: Ekstensi -> Apps Script -> Tempel kode ini -> Simpan
// Deployment: Terapkan -> Kelola deployment -> Edit -> Versi baru -> Terapkan
// ============================================================================

var BRIDGE_VERSION = 4;
var SECRET_TOKEN = '${safeSecret}';
var TAB_DATA_GBJ = '${DEFAULT_PALLET_TAB_TITLE}';
var TAB_SURAT_JALAN = '${SURAT_JALAN_TAB_TITLE}';
var TAB_SURAT_JALAN_MANUAL = '${SURAT_JALAN_MANUAL_TAB_TITLE}';
var TAB_REKAP_STOK = '${REKAP_STOK_TAB_TITLE}';
var READ_ONLY_LOCK_DESC = '${READ_ONLY_LOCK_DESC}';

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action || 'ping';
  var token = params.token || '';
  var tabTitle = params.tab || '';
  return handleBridgeRequest({ action: action, token: token, palletTabTitle: tabTitle });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);
    return handleBridgeRequest(payload);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Payload JSON tidak valid: ' + err.message });
  }
}

function handleBridgeRequest(req) {
  try {
    if (SECRET_TOKEN && String(req.token || '') !== SECRET_TOKEN) {
      return jsonResponse({ ok: false, error: 'TOKEN_INVALID: Kode Keamanan Bridge tidak cocok.' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = req.action || 'ping';

    if (action === 'ping') {
      var sheetsInfo = ss.getSheets().map(function (s, idx) {
        return {
          sheetId: s.getSheetId(),
          title: s.getName(),
          index: idx,
          rowCount: s.getMaxRows(),
          columnCount: s.getMaxColumns()
        };
      });
      return jsonResponse({
        ok: true,
        bridgeVersion: BRIDGE_VERSION,
        spreadsheetId: ss.getId(),
        spreadsheetTitle: ss.getName(),
        sheets: sheetsInfo
      });
    }

    if (action === 'read_pallet') {
      var targetSheet = getTargetPalletSheet(ss, req.palletTabTitle);
      var lastRow = targetSheet.getLastRow();
      var lastCol = targetSheet.getLastColumn();
      var values = (lastRow > 0 && lastCol > 0)
        ? targetSheet.getRange(1, 1, lastRow, lastCol).getDisplayValues()
        : [];
      return jsonResponse({
        ok: true,
        bridgeVersion: BRIDGE_VERSION,
        tabTitle: targetSheet.getName(),
        values: values
      });
    }

    if (action === 'sync_all') {
      var lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try {
        var shouldLock = req.lockSheetReadOnly !== false;
        var palletSheet = getTargetPalletSheet(ss, req.palletTabTitle);
        var palletRows = req.palletRows || [];
        writeFormattedRows(palletSheet, palletRows);
        applySheetLock(palletSheet, shouldLock);

        var sjCount = 0;
        if (req.includeSuratJalanTab && req.suratJalanRows && req.suratJalanRows.length > 0) {
          var sjSheet = getOrCreateSheet(ss, TAB_SURAT_JALAN);
          writeFormattedRows(sjSheet, req.suratJalanRows);
          applySheetLock(sjSheet, shouldLock);
          sjCount = Math.max(0, req.suratJalanRows.length - 1);
        }

        var manualSjCount = 0;
        if (req.includeManualSjTab && req.manualSuratJalanRows && req.manualSuratJalanRows.length > 0) {
          var manualTargetId = req.manualSjSpreadsheetId ? String(req.manualSjSpreadsheetId).trim() : '';
          var manualTargetSs = (manualTargetId && manualTargetId !== ss.getId())
            ? SpreadsheetApp.openById(manualTargetId)
            : ss;
          var manualSjSheet = getOrCreateSheet(manualTargetSs, TAB_SURAT_JALAN_MANUAL);
          writeFormattedRows(manualSjSheet, req.manualSuratJalanRows);
          applySheetLock(manualSjSheet, shouldLock);
          manualSjCount = Math.max(0, req.manualSuratJalanRows.length - 1);
        }

        var rekapCount = 0;
        if (req.includeRekapTab && req.rekapRows && req.rekapRows.length > 0) {
          var rekapSheet = getOrCreateSheet(ss, TAB_REKAP_STOK);
          writeFormattedRows(rekapSheet, req.rekapRows);
          applySheetLock(rekapSheet, shouldLock);
          rekapCount = Math.max(0, req.rekapRows.length - 1);
        }

        SpreadsheetApp.flush();

        return jsonResponse({
          ok: true,
          bridgeVersion: BRIDGE_VERSION,
          spreadsheetId: ss.getId(),
          spreadsheetTitle: ss.getName(),
          palletTabTitle: palletSheet.getName(),
          palletRowsCount: Math.max(0, palletRows.length - 1),
          suratJalanRowsCount: sjCount,
          manualSuratJalanRowsCount: manualSjCount,
          rekapRowsCount: rekapCount,
          syncedAt: new Date().toISOString()
        });
      } finally {
        lock.releaseLock();
      }
    }

    return jsonResponse({ ok: false, error: 'Aksi tidak dikenal: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function getTargetPalletSheet(ss, preferredTitle) {
  var trimmedPref = preferredTitle ? String(preferredTitle).trim() : '';
  if (trimmedPref && !/^sheet\\s*1$/i.test(trimmedPref)) {
    var exact = ss.getSheetByName(trimmedPref);
    if (exact) return exact;
  }
  var gbj = ss.getSheetByName(TAB_DATA_GBJ);
  if (gbj) return gbj;

  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (/^sheet\\s*1$/i.test(all[i].getName().trim())) {
      all[i].setName(TAB_DATA_GBJ);
      return all[i];
    }
  }
  return all.length > 0 ? all[0] : ss.insertSheet(TAB_DATA_GBJ);
}

function getOrCreateSheet(ss, title) {
  return ss.getSheetByName(title) || ss.insertSheet(title);
}

function applySheetLock(sheet, shouldLock) {
  if (!sheet) return;
  try {
    var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var existingLocks = [];
    for (var i = 0; i < protections.length; i++) {
      if (protections[i].getDescription() === READ_ONLY_LOCK_DESC) {
        existingLocks.push(protections[i]);
      }
    }

    if (shouldLock) {
      if (existingLocks.length === 0) {
        var p = sheet.protect().setDescription(READ_ONLY_LOCK_DESC);
        p.setWarningOnly(false);
        var me = Session.getEffectiveUser();
        var meEmail = me ? String(me.getEmail() || '').toLowerCase() : '';
        var editors = p.getEditors();
        var toRemove = [];
        for (var j = 0; j < editors.length; j++) {
          var edEmail = String(editors[j].getEmail() || '').toLowerCase();
          if (edEmail && edEmail !== meEmail) {
            toRemove.push(editors[j]);
          }
        }
        if (toRemove.length > 0) {
          p.removeEditors(toRemove);
        }
        if (p.canDomainEdit()) {
          p.setDomainEdit(false);
        }
      }
    } else {
      for (var k = 0; k < existingLocks.length; k++) {
        existingLocks[k].remove();
      }
    }
  } catch (lockErr) {
    // Proteksi sheet bersifat opsional agar tidak menggagalkan sinkronisasi data
  }
}

function writeFormattedRows(sheet, rows) {
  // sheet.clear() membersihkan isi + warna header lama agar kolom yg hilang (Urutan Bin / Keterangan) ikut bersih
  sheet.clear();
  if (!rows || rows.length === 0) return;
  var numRows = rows.length;
  var numCols = rows[0].length || 1;
  var normalized = rows.map(function (row) {
    var out = [];
    for (var i = 0; i < numCols; i++) {
      out.push(row[i] !== undefined && row[i] !== null ? row[i] : '');
    }
    return out;
  });

  sheet.getRange(1, 1, numRows, numCols).setValues(normalized);
  sheet.setFrozenRows(1);

  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange
    .setBackground('#143d7a')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  for (var c = 1; c <= numCols; c++) {
    sheet.autoResizeColumn(c);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

async function parseAppsScriptJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.includes('ServiceLogin') || text.includes('accounts.google.com')) {
      throw new Error(
        'AKSES BRIDGE TERTUTUP: Pastikan saat Deploy Apps Script bagian "Yang memiliki akses (Who has access)" dipilih "Siapa saja (Anyone)", bukan "Hanya saya".'
      );
    }
    throw new Error(
      'Respon Apps Script tidak berbentuk JSON. Pastikan URL berakhir "/exec" dari Deployment Web App terbaru.'
    );
  }
}

export async function pingAppsScriptBridge(
  scriptUrl: string,
  secret: string
): Promise<SpreadsheetMetadata> {
  const cleaned = normalizeAppsScriptUrl(scriptUrl);
  if (!isValidAppsScriptUrl(cleaned)) {
    throw new Error(
      'Format URL Apps Script tidak valid. Gunakan URL Web App yang berakhiran "/exec".'
    );
  }

  const sep = cleaned.includes('?') ? '&' : '?';
  const url = `${cleaned}${sep}action=ping&token=${encodeURIComponent(secret || '')}`;
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Bridge Apps Script gagal merespon (HTTP ${res.status}).`);
  }
  const data = await parseAppsScriptJsonResponse(res);
  if (!data?.ok) {
    throw new Error(data?.error || 'Gagal memeriksa koneksi Bridge Apps Script.');
  }
  return {
    spreadsheetId: String(data.spreadsheetId || DEFAULT_SPREADSHEET_ID),
    title: String(data.spreadsheetTitle || DEFAULT_SPREADSHEET_NAME),
    sheets: Array.isArray(data.sheets) ? data.sheets : [],
    bridgeVersion: data.bridgeVersion !== undefined ? Number(data.bridgeVersion) : 1
  };
}

export async function readSheetValuesViaAppsScript(
  scriptUrl: string,
  secret: string,
  sheetTitle: string
): Promise<{ tabTitle: string; values: string[][] }> {
  const cleaned = normalizeAppsScriptUrl(scriptUrl);
  if (!isValidAppsScriptUrl(cleaned)) {
    throw new Error(
      'URL Apps Script belum diisi atau tidak valid (harus berakhiran "/exec").'
    );
  }

  const sep = cleaned.includes('?') ? '&' : '?';
  const url = `${cleaned}${sep}action=read_pallet&token=${encodeURIComponent(
    secret || ''
  )}&tab=${encodeURIComponent(sheetTitle || '')}`;
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Gagal membaca spreadsheet melalui Bridge (HTTP ${res.status}).`);
  }
  const data = await parseAppsScriptJsonResponse(res);
  if (!data?.ok) {
    throw new Error(data?.error || 'Gagal membaca data Google Sheets via Bridge.');
  }
  return {
    tabTitle: String(data.tabTitle || sheetTitle || 'Sheet1'),
    values: Array.isArray(data.values) ? data.values : []
  };
}

export async function syncAllDataViaAppsScript(
  opts: SyncAllOptions & { scriptUrl: string; secret: string }
): Promise<SyncAllResult> {
  const cleaned = normalizeAppsScriptUrl(opts.scriptUrl);
  if (!isValidAppsScriptUrl(cleaned)) {
    throw new Error(
      'URL Apps Script Bridge belum diatur atau tidak valid (harus berakhiran "/exec").'
    );
  }

  const palletRows = buildPalletSheetRows(
    opts.records,
    opts.suratJalanHistory,
    opts.masterWarehouses
  );
  const includeSj = opts.syncSuratJalanTab !== false;
  const includeManualSj = opts.syncManualSjTab !== false;
  const includeRekap = opts.syncRekapTab !== false;
  const sjRows = includeSj ? buildSuratJalanSheetRows(opts.suratJalanHistory) : [];
  const manualSjRows = includeManualSj
    ? buildManualSuratJalanSheetRows(opts.suratJalanHistory)
    : [];
  const rekapRows = includeRekap
    ? buildRekapStokSheetRows(opts.records, opts.masterItems)
    : [];
  const manualTargetId = opts.manualSjSpreadsheetId?.trim()
    ? extractSpreadsheetId(opts.manualSjSpreadsheetId)
    : '';

  // text/plain avoids CORS OPTIONS preflight against Google Apps Script Web App
  const res = await fetch(cleaned, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'sync_all',
      token: opts.secret || '',
      palletTabTitle: opts.palletTabTitle || '',
      includeSuratJalanTab: includeSj,
      includeManualSjTab: includeManualSj,
      manualSjSpreadsheetId: manualTargetId,
      includeRekapTab: includeRekap,
      lockSheetReadOnly: opts.lockSheetReadOnly !== false,
      palletRows,
      suratJalanRows: sjRows,
      manualSuratJalanRows: manualSjRows,
      rekapRows
    })
  });

  if (!res.ok) {
    throw new Error(`Bridge Apps Script mengembalikan HTTP ${res.status}.`);
  }

  const data = await parseAppsScriptJsonResponse(res);
  if (!data?.ok) {
    throw new Error(data?.error || 'Gagal menyinkronkan data melalui Bridge Apps Script.');
  }

  return {
    spreadsheetId: String(data.spreadsheetId || extractSpreadsheetId(opts.spreadsheetId)),
    spreadsheetTitle: String(data.spreadsheetTitle || DEFAULT_SPREADSHEET_NAME),
    palletTabTitle: String(data.palletTabTitle || opts.palletTabTitle || DEFAULT_PALLET_TAB_TITLE),
    palletRowsCount: Number(data.palletRowsCount ?? palletRows.length - 1),
    suratJalanRowsCount: Number(data.suratJalanRowsCount ?? Math.max(0, sjRows.length - 1)),
    manualSuratJalanRowsCount: Number(
      data.manualSuratJalanRowsCount ?? Math.max(0, manualSjRows.length - 1)
    ),
    rekapRowsCount: Number(data.rekapRowsCount ?? Math.max(0, rekapRows.length - 1)),
    bridgeVersion: data.bridgeVersion !== undefined ? Number(data.bridgeVersion) : 1,
    syncedAt: String(data.syncedAt || new Date().toISOString())
  };
}


export interface SheetDiffEntry {
  kind: 'missing_in_sheet' | 'mismatch' | 'extra_in_sheet';
  keyLabel: string;
  nomorPallet: string;
  namaBarang: string;
  lokasiBin: string;
  systemSummary: string;
  sheetSummary: string;
  differences: string[];
  rowNumber?: number;
  parsedExtraRecord?: PalletRecord;
}

export interface SheetAuditReport {
  checkedAt: string;
  sheetTitle: string;
  totalSystem: number;
  totalSheetRows: number;
  isSheetEmpty: boolean;
  matchedCount: number;
  missingInSheetCount: number;
  mismatchedCount: number;
  extraInSheetCount: number;
  diffs: SheetDiffEntry[];
  extraRecordsForImport: PalletRecord[];
}

function normVal(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function findColIdx(headers: string[], candidates: string[], fallbackIndex: number): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  // Exact match pass first (prevents 'status' from matching 'status stok' or 'lokasi bin' matching 'lokasi gudang')
  for (const c of candidates) {
    const idx = normalized.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }
  // Substring match pass
  for (const c of candidates) {
    const idx = normalized.findIndex((h) => h.includes(c));
    if (idx >= 0) return idx;
  }
  return fallbackIndex;
}

/**
 * Audit & compare System PalletRecords vs Google Sheets rows (read-only)
 */
export function compareSystemWithSheetRows(
  records: PalletRecord[],
  sheetValues: string[][],
  sheetTitle: string,
  suratJalanHistory: SuratJalanRecord[] = [],
  masterWarehouses: MasterWarehouse[] = DEFAULT_MASTER_WAREHOUSES
): SheetAuditReport {
  const checkedAt = new Date().toISOString();

  if (!sheetValues || sheetValues.length === 0) {
    const diffs: SheetDiffEntry[] = records.map((r) => ({
      kind: 'missing_in_sheet',
      keyLabel: r.id,
      nomorPallet: r.nomorPallet,
      namaBarang: r.namaBarang,
      lokasiBin: r.lokasiBin,
      systemSummary: `${r.status === 'OUT' ? 'OUT' : 'IN'} · ${r.qtyPallet} ${r.unit || 'Box'} · Bin ${r.lokasiBin}`,
      sheetSummary: '(Spreadsheet kosong)',
      differences: ['Belum ada di Google Sheets']
    }));

    return {
      checkedAt,
      sheetTitle,
      totalSystem: records.length,
      totalSheetRows: 0,
      isSheetEmpty: true,
      matchedCount: 0,
      missingInSheetCount: records.length,
      mismatchedCount: 0,
      extraInSheetCount: 0,
      diffs,
      extraRecordsForImport: []
    };
  }

  const firstRow = sheetValues[0] || [];
  const looksLikeHeader = firstRow.some((cell) =>
    ['id sistem', 'no. pallet', 'nomor pallet', 'nama barang', 'lokasi bin'].some((k) =>
      String(cell || '').toLowerCase().includes(k)
    )
  );

  const headerRow = looksLikeHeader ? firstRow : getPalletSheetHeaders(false);
  const dataRows = looksLikeHeader ? sheetValues.slice(1) : sheetValues;

  const nonEmptyRows = dataRows
    .map((row, idx) => ({ row, rowNumber: (looksLikeHeader ? 2 : 1) + idx }))
    .filter(({ row }) => row.some((c) => String(c || '').trim() !== ''));

  if (nonEmptyRows.length === 0) {
    const diffs: SheetDiffEntry[] = records.map((r) => ({
      kind: 'missing_in_sheet',
      keyLabel: r.id,
      nomorPallet: r.nomorPallet,
      namaBarang: r.namaBarang,
      lokasiBin: r.lokasiBin,
      systemSummary: `${r.status === 'OUT' ? 'OUT' : 'IN'} · ${r.qtyPallet} ${r.unit || 'Box'} · Bin ${r.lokasiBin}`,
      sheetSummary: '(Hanya header, belum ada baris data)',
      differences: ['Belum ada di Google Sheets']
    }));

    return {
      checkedAt,
      sheetTitle,
      totalSystem: records.length,
      totalSheetRows: 0,
      isSheetEmpty: true,
      matchedCount: 0,
      missingInSheetCount: records.length,
      mismatchedCount: 0,
      extraInSheetCount: 0,
      diffs,
      extraRecordsForImport: []
    };
  }

  const idxId = findColIdx(headerRow, ['id sistem', 'id'], 0);
  const idxStatusInOutExplicit = findColIdx(headerRow, ['status in/out', 'status rak'], -1);
  const idxStatusInOut =
    idxStatusInOutExplicit >= 0
      ? idxStatusInOutExplicit
      : findColIdx(headerRow, ['status'], 1);
  const idxAsalPacking = findColIdx(headerRow, ['asal packing'], -1);
  const idxStatusQc =
    idxStatusInOutExplicit >= 0
      ? findColIdx(headerRow, ['status'], -1)
      : findColIdx(headerRow, ['status qc', 'status pallet'], -1);
  const idxStockStatus = findColIdx(headerRow, ['status stok'], -1);
  const idxPallet = findColIdx(headerRow, ['no. pallet', 'nomor pallet', 'pallet'], 5);
  const idxBarcode = findColIdx(headerRow, ['kode barcode', 'barcode'], 6);
  const idxKode = findColIdx(headerRow, ['kode item', 'kode barang'], 7);
  const idxNama = findColIdx(headerRow, ['nama barang', 'item'], 8);
  const idxQty = findColIdx(headerRow, ['qty (box)', 'qty', 'jumlah'], 9);
  const idxUnit = findColIdx(headerRow, ['satuan', 'unit'], 10);
  const idxBatch = findColIdx(headerRow, ['no. batch', 'batch'], 11);
  const idxBoxAwal = findColIdx(headerRow, ['box awal'], 12);
  const idxBoxAkhir = findColIdx(headerRow, ['box akhir'], 13);
  const idxBin = findColIdx(headerRow, ['lokasi bin', 'bin'], 14);
  const idxLokasiGudang = findColIdx(headerRow, ['lokasi gudang'], -1);
  const idxKet = findColIdx(headerRow, ['keterangan / problem', 'keterangan', 'catatan', 'problem'], -1);
  const idxSj = findColIdx(headerRow, ['no. surat jalan', 'surat jalan'], -1);
  const idxSpp = findColIdx(headerRow, ['no. spp'], -1);
  const idxPo = findColIdx(headerRow, ['no. po'], -1);

  const resolveSj = buildSuratJalanLookup(suratJalanHistory);

  const sysById = new Map<string, PalletRecord>();
  const sysByBarcode = new Map<string, PalletRecord>();
  const sysByComposite = new Map<string, PalletRecord>();

  records.forEach((r) => {
    sysById.set(r.id, r);
    if (r.barcodeNumber) sysByBarcode.set(normVal(r.barcodeNumber), r);
    const comp = `${normVal(r.nomorPallet)}|${normVal(r.kodeItem)}|${normVal(r.lokasiBin)}`;
    if (!sysByComposite.has(comp)) sysByComposite.set(comp, r);
  });

  interface ParsedSheetRow {
    rowNumber: number;
    sStatus: 'IN' | 'OUT';
    sAsalPacking: string;
    sStatusQc: string;
    sStockStatus: string;
    sPallet: string;
    sNama: string;
    sQty: number;
    sUnit: string;
    sBatch: string;
    sBoxAwal: string;
    sBoxAkhir: string;
    sBin: string;
    sLokasiGudang: string;
    sKet: string;
    sSj: string;
    sSpp: string;
    sPo: string;
  }

  const matchedGroups = new Map<string, { sys: PalletRecord; rows: ParsedSheetRow[] }>();
  const diffs: SheetDiffEntry[] = [];
  const extraRecordsForImport: PalletRecord[] = [];
  let matchedCount = 0;
  let mismatchedCount = 0;

  nonEmptyRows.forEach(({ row, rowNumber }) => {
    const get = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
    const sId = get(idxId);
    const sStatus: 'IN' | 'OUT' = normVal(get(idxStatusInOut)) === 'OUT' ? 'OUT' : 'IN';
    const sAsalPacking = get(idxAsalPacking);
    const sStatusQcRaw = get(idxStatusQc).toUpperCase();
    const parsedQc: PalletQcStatus =
      sStatusQcRaw === 'BO' || sStatusQcRaw === 'HOLD' ? sStatusQcRaw : 'OK';
    const sStockStatus = get(idxStockStatus);
    const sPallet = get(idxPallet);
    const sBarcode = get(idxBarcode);
    const sKode = get(idxKode);
    const sNama = get(idxNama);
    const sQty = Number(String(get(idxQty)).replace(/[^\d.-]/g, '')) || 0;
    const sUnit = get(idxUnit) || 'Box';
    const sBatch = get(idxBatch);
    const sBoxAwal = get(idxBoxAwal);
    const sBoxAkhir = get(idxBoxAkhir);
    const sBin = get(idxBin).toUpperCase();
    const sLokasiGudang = get(idxLokasiGudang);
    const sKet = get(idxKet);
    const sSj = get(idxSj);
    const sSpp = get(idxSpp);
    const sPo = get(idxPo);

    const comp = `${normVal(sPallet)}|${normVal(sKode)}|${normVal(sBin)}`;
    const matchedSys =
      (sId && sysById.get(sId)) ||
      (sBarcode && sysByBarcode.get(normVal(sBarcode))) ||
      sysByComposite.get(comp);

    if (!matchedSys) {
      const nowIso = new Date().toISOString();
      const newRec: PalletRecord = {
        id: sId || `plt-gs-${Date.now()}-${rowNumber}`,
        nomorPallet: (sPallet || `PLT-${rowNumber}`).toUpperCase(),
        barcodeNumber: sBarcode || `PLT-GS-${Date.now().toString().slice(-6)}-${rowNumber}`,
        batchId: `BCH-GS-${rowNumber}`,
        itemIndex: rowNumber,
        kodeItem: (sKode || '-').toUpperCase(),
        namaBarang: sNama || 'Item dari Spreadsheet',
        qtyPallet: sQty,
        unit: sUnit || 'Box',
        noBatch: sBatch || '-',
        boxAwal: sBoxAwal || '',
        boxAkhir: sBoxAkhir || '',
        lokasiBin: sBin || '5A.1',
        ...(sLokasiGudang ? { lokasiGudang: sLokasiGudang } : {}),
        statusQc: parsedQc,
        keterangan: sKet,
        status: sStatus,
        noSuratJalan: sSj || undefined,
        submittedAt: nowIso,
        updatedAt: nowIso,
        lastUpdateAction: 'Impor dari Google Sheets'
      };
      extraRecordsForImport.push(newRec);
      diffs.push({
        kind: 'extra_in_sheet',
        keyLabel: newRec.id,
        nomorPallet: newRec.nomorPallet,
        namaBarang: newRec.namaBarang,
        lokasiBin: newRec.lokasiBin,
        systemSummary: '(Tidak ada di Sistem)',
        sheetSummary: `Baris #${rowNumber}: ${sStatus} (${parsedQc}) · ${sQty} ${sUnit} · Bin ${sBin}`,
        differences: ['Hanya ada di Google Sheets (bisa ditarik masuk ke sistem)'],
        rowNumber,
        parsedExtraRecord: newRec
      });
      return;
    }

    const existing = matchedGroups.get(matchedSys.id) || { sys: matchedSys, rows: [] };
    existing.rows.push({
      rowNumber,
      sStatus,
      sAsalPacking,
      sStatusQc: sStatusQcRaw,
      sStockStatus,
      sPallet,
      sNama,
      sQty,
      sUnit,
      sBatch,
      sBoxAwal,
      sBoxAkhir,
      sBin,
      sLokasiGudang,
      sKet,
      sSj,
      sSpp,
      sPo
    });
    matchedGroups.set(matchedSys.id, existing);
  });

  const matchedSystemIds = new Set<string>(matchedGroups.keys());

  matchedGroups.forEach(({ sys: matchedSys, rows: sheetGroup }) => {
    const expectedEntries = computeBatchRowEntries(matchedSys);
    const sysStatus = matchedSys.status === 'OUT' ? 'OUT' : 'IN';
    const expectedQc = resolvePalletQcStatus(matchedSys);
    const linkedSj = resolveSj(matchedSys);
    const expectedStockStatus = computePalletStockStatus(matchedSys, linkedSj);
    const expectedLokasiGudang = resolvePalletWarehouseLocation(matchedSys, masterWarehouses);
    const expectedSjNo = linkedSj?.noSuratJalan || matchedSys.noSuratJalan || '';
    const expectedSpp = linkedSj?.noSpp || '';
    const expectedPo = linkedSj?.noPo || '';
    const rowDiffs: string[] = [];

    const totalSheetQty = sheetGroup.reduce((sum, item) => sum + item.sQty, 0);
    if (Number(matchedSys.qtyPallet) !== totalSheetQty) {
      rowDiffs.push(`Total Qty: Sistem ${matchedSys.qtyPallet} ≠ Sheet ${totalSheetQty}`);
    }

    if (expectedEntries.length !== sheetGroup.length) {
      rowDiffs.push(
        `Baris Batch: Sistem ${expectedEntries.length} batch ≠ Sheet ${sheetGroup.length} baris`
      );
    } else {
      expectedEntries.forEach((exp, idx) => {
        const sr = sheetGroup[idx];
        if (normVal(exp.noBatch) !== normVal(sr.sBatch)) {
          rowDiffs.push(`Batch #${idx + 1}: Sistem ${exp.noBatch} ≠ Sheet ${sr.sBatch}`);
        }
        if (exp.qtyBox !== sr.sQty) {
          rowDiffs.push(`Qty Batch #${idx + 1}: Sistem ${exp.qtyBox} ≠ Sheet ${sr.sQty}`);
        }
        if (idxAsalPacking >= 0) {
          const expectedPacking = deriveAsalPacking(exp.noBatch);
          if (normVal(expectedPacking) !== normVal(sr.sAsalPacking)) {
            rowDiffs.push(
              `Asal Packing #${idx + 1}: Sistem ${expectedPacking} ≠ Sheet ${sr.sAsalPacking || '-'}`
            );
          }
        }
      });
    }

    const firstSheet = sheetGroup[0];
    if (sheetGroup.some((sr) => sr.sStatus !== sysStatus)) {
      rowDiffs.push(`Status In/Out: Sistem ${sysStatus} ≠ Sheet ${firstSheet.sStatus}`);
    }
    if (
      idxStatusQc >= 0 &&
      sheetGroup.some((sr) => normVal(sr.sStatusQc) !== normVal(expectedQc))
    ) {
      rowDiffs.push(
        `Status Pallet: Sistem ${expectedQc} ≠ Sheet ${firstSheet.sStatusQc || '-'}`
      );
    }
    if (
      idxStockStatus >= 0 &&
      sheetGroup.some((sr) => normVal(sr.sStockStatus) !== normVal(expectedStockStatus))
    ) {
      rowDiffs.push(
        `Status Stok: Sistem ${expectedStockStatus} ≠ Sheet ${firstSheet.sStockStatus || '-'}`
      );
    }
    if (sheetGroup.some((sr) => normVal(sr.sBin) !== normVal(matchedSys.lokasiBin))) {
      rowDiffs.push(`Bin: Sistem ${matchedSys.lokasiBin} ≠ Sheet ${firstSheet.sBin}`);
    }
    if (
      idxLokasiGudang >= 0 &&
      sheetGroup.some((sr) => normVal(sr.sLokasiGudang) !== normVal(expectedLokasiGudang))
    ) {
      rowDiffs.push(
        `Lokasi Gudang: Sistem ${expectedLokasiGudang} ≠ Sheet ${firstSheet.sLokasiGudang || '-'}`
      );
    }
    if (sheetGroup.some((sr) => normVal(sr.sPallet) !== normVal(matchedSys.nomorPallet))) {
      rowDiffs.push(`No. Pallet: Sistem ${matchedSys.nomorPallet} ≠ Sheet ${firstSheet.sPallet}`);
    }
    if (sheetGroup.some((sr) => normVal(sr.sNama) !== normVal(matchedSys.namaBarang))) {
      rowDiffs.push(`Barang: Sistem ${matchedSys.namaBarang} ≠ Sheet ${firstSheet.sNama}`);
    }
    if (sheetGroup.some((sr) => normVal(sr.sKet) !== normVal(matchedSys.keterangan || ''))) {
      rowDiffs.push(`Keterangan/Problem berbeda`);
    }
    if (
      idxSj >= 0 &&
      sheetGroup.some((sr) => normVal(sr.sSj) !== normVal(expectedSjNo))
    ) {
      rowDiffs.push(
        `No. SJ: Sistem ${expectedSjNo || '-'} ≠ Sheet ${firstSheet.sSj || '-'}`
      );
    }
    if (
      idxSpp >= 0 &&
      sheetGroup.some((sr) => normVal(sr.sSpp) !== normVal(expectedSpp))
    ) {
      rowDiffs.push(
        `No. SPP: Sistem ${expectedSpp || '-'} ≠ Sheet ${firstSheet.sSpp || '-'}`
      );
    }
    if (
      idxPo >= 0 &&
      sheetGroup.some((sr) => normVal(sr.sPo) !== normVal(expectedPo))
    ) {
      rowDiffs.push(
        `No. PO: Sistem ${expectedPo || '-'} ≠ Sheet ${firstSheet.sPo || '-'}`
      );
    }

    if (rowDiffs.length > 0) {
      mismatchedCount += 1;
      diffs.push({
        kind: 'mismatch',
        keyLabel: matchedSys.id,
        nomorPallet: matchedSys.nomorPallet,
        namaBarang: matchedSys.namaBarang,
        lokasiBin: matchedSys.lokasiBin,
        systemSummary: `${sysStatus} (${expectedQc}) · ${matchedSys.qtyPallet} ${matchedSys.unit} (${expectedEntries.length} batch) · Bin ${matchedSys.lokasiBin}`,
        sheetSummary:
          sheetGroup.length > 1
            ? `${sheetGroup.length} baris (#${sheetGroup.map((x) => x.rowNumber).join(', ')}) · Total ${totalSheetQty} ${firstSheet.sUnit}`
            : `Baris #${firstSheet.rowNumber}: ${firstSheet.sStatus} · ${firstSheet.sQty} ${firstSheet.sUnit} · Bin ${firstSheet.sBin}`,
        differences: rowDiffs,
        rowNumber: firstSheet.rowNumber
      });
    } else {
      matchedCount += 1;
    }
  });

  let missingInSheetCount = 0;
  records.forEach((r) => {
    if (!matchedSystemIds.has(r.id)) {
      missingInSheetCount += 1;
      diffs.push({
        kind: 'missing_in_sheet',
        keyLabel: r.id,
        nomorPallet: r.nomorPallet,
        namaBarang: r.namaBarang,
        lokasiBin: r.lokasiBin,
        systemSummary: `${r.status === 'OUT' ? 'OUT' : 'IN'} · ${r.qtyPallet} ${r.unit || 'Box'} · Bin ${r.lokasiBin}`,
        sheetSummary: '(Belum ada di Spreadsheet)',
        differences: ['Data sistem belum masuk / terhapus di Google Sheets']
      });
    }
  });

  return {
    checkedAt,
    sheetTitle,
    totalSystem: records.length,
    totalSheetRows: nonEmptyRows.length,
    isSheetEmpty: false,
    matchedCount,
    missingInSheetCount,
    mismatchedCount,
    extraInSheetCount: extraRecordsForImport.length,
    diffs,
    extraRecordsForImport
  };
}
