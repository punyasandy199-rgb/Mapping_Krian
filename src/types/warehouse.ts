export interface MasterItem {
  id: string;
  kodeItem: string;
  namaBarang: string;
  satuan: string;
  defaultQty?: number;
  kategori?: string;
}

export interface PalletRowInput {
  id: string;
  nomorPallet: string; // Nomor pallet di setiap item (selalu kosong di awal)
  kodeItem: string;
  namaBarang: string;
  qtyPallet: string | number;
  unit: string;
  noBatch: string; // Kolom baru: No. Batch
  boxAwal: string; // No. Box Awal (sebelumnya Batch Awal)
  boxAkhir: string; // No. Box Akhir (sebelumnya Batch Akhir)
  batchAwal?: string; // kompatibilitas
  batchAkhir?: string; // kompatibilitas
  keterangan?: string;
}

export interface PalletRecord {
  id: string;
  nomorPallet: string;
  barcodeNumber: string;
  batchId: string;
  itemIndex: number;
  kodeItem: string;
  namaBarang: string;
  qtyPallet: number;
  unit: string;
  noBatch: string; // No. Batch
  boxAwal: string; // No. Box Awal
  boxAkhir: string; // No. Box Akhir
  batchAwal?: string; // kompatibilitas
  batchAkhir?: string; // kompatibilitas
  lokasiBin: string; // 1x input applied to all rows in pallet
  keterangan?: string;
  submittedAt: string;
}

export interface BatchSubmission {
  batchId: string;
  nomorPallet?: string;
  nomorPalletList?: string[];
  lokasiBin: string;
  submittedAt: string;
  items: PalletRecord[];
  totalQty: number;
  itemCount: number;
}

// Satuan default di posisi pertama: 'Box'
export const COMMON_UNITS = [
  'Box',
  'Karton',
  'Pcs',
  'Pallet',
  'Zak',
  'Drum',
  'Roll',
  'Pack',
  'Bal'
];

// Master database barang awal dengan default satuan 'Box'
export const DEFAULT_MASTER_ITEMS: MasterItem[] = [
  { id: 'itm-sic-1', kodeItem: '00J.KPI18.K030706', namaBarang: 'SIC 25 BR (1 X 30 KG)', satuan: 'Box', defaultQty: 15, kategori: 'Bahan Baku' },
  { id: 'itm-sic-2', kodeItem: '00J.KPI18.K030707', namaBarang: 'SIC 8590 SD (1 X 30 KG)', satuan: 'Box', defaultQty: 15, kategori: 'Bahan Baku' },
  { id: 'itm-sic-3', kodeItem: '00J.KPI18.K030708', namaBarang: 'SIC 8590 HD (1 X 30 KG)', satuan: 'Box', defaultQty: 15, kategori: 'Bahan Baku' },
  { id: 'itm-sic-4', kodeItem: '00J.KPI18.K030709', namaBarang: 'SIC 30 BR (1 X 25 KG)', satuan: 'Box', defaultQty: 20, kategori: 'Bahan Baku' },
  { id: 'itm-1', kodeItem: 'KDK-UHT100', namaBarang: 'Susu UHT Full Cream 1000ml', satuan: 'Box', defaultQty: 120, kategori: 'Minuman' },
  { id: 'itm-2', kodeItem: 'KDK-UHT250', namaBarang: 'Susu UHT Cokelat 250ml', satuan: 'Box', defaultQty: 160, kategori: 'Minuman' },
  { id: 'itm-3', kodeItem: 'KDK-MGS002', namaBarang: 'Minyak Goreng Sawit Pouch 2L', satuan: 'Box', defaultQty: 80, kategori: 'Sembako' },
  { id: 'itm-4', kodeItem: 'KDK-MGB001', namaBarang: 'Minyak Goreng Botol 1L', satuan: 'Box', defaultQty: 96, kategori: 'Sembako' },
  { id: 'itm-5', kodeItem: 'KDK-TPG001', namaBarang: 'Tepung Terigu Serbaguna 1kg', satuan: 'Box', defaultQty: 100, kategori: 'Bahan Baku' },
  { id: 'itm-6', kodeItem: 'KDK-GLA001', namaBarang: 'Gula Pasir Kristal Putih 1kg', satuan: 'Box', defaultQty: 150, kategori: 'Sembako' }
];

// Layout Gudang 5:
// Sisi Kiri (A): 8 slot pallet urut ke bawah (5A.1 s/d 5A.8)
export const GUDANG5_SLOTS_A = [
  '5A.1', '5A.2', '5A.3', '5A.4', '5A.5', '5A.6', '5A.7', '5A.8'
];

// Sisi Kanan (B): 4 slot pallet urut ke bawah (5B.1 s/d 5B.4)
export const GUDANG5_SLOTS_B = [
  '5B.1', '5B.2', '5B.3', '5B.4'
];

export const GUDANG5_QUICK_BINS = [...GUDANG5_SLOTS_A, ...GUDANG5_SLOTS_B];
