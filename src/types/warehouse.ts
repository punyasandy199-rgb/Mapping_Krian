export interface MasterItem {
  id: string;
  kodeItem: string;
  namaBarang: string;
  satuan: string;
  defaultQty?: number;
  beratPerBoxKg?: number; // Default 30 Kg per box
  kategori?: string;
}

export interface MasterRoute {
  id: string;
  kodeLokasi: string; // e.g. 'SJA Semarang', 'SJA Sukodono', 'SJA Sepanjang', 'SJA Karawang'
  namaLokasi: string; // e.g. 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEMARANG'
  alamat: string;
  tipe?: 'DARI' | 'TUJUAN' | 'KEDUA';
  tarifDefault?: number; // Tarif pengiriman standar untuk rute ini (Rp)
  ppnPersen?: number; // PPN standar untuk rute ini (default: 11%)
}

export interface MasterVendor {
  id: string;
  namaVendor: string;
  kontak?: string;
  tarifDefault?: number;
  ppnPersen?: number;
  keterangan?: string;
}

// Model Tujuan & Tarif (Multi-Vendor & Asal-Tujuan Bolak-Balik Fleksibel)
export interface MasterRouteTariff {
  id: string;
  ruteAwal: string; // Lokasi Asal
  ruteTujuan: string; // Lokasi Tujuan
  alamatTujuan?: string;
  vendor: string; // Nama Vendor Armada
  tarif: number; // Tarif Pengiriman (Rp)
  ppnPersen: number; // PPN % (default: 11)
  keterangan?: string;
}

// Master Blacklist (Nopol, Driver, Vendor, atau Pallet bermasalah)
export interface BlacklistRecord {
  id: string;
  tipe: 'NOPOL' | 'DRIVER' | 'VENDOR' | 'PALLET';
  identifier: string; // Contoh: Nopol B 9999 XYZ atau Nama Driver
  alasan: string;
  tanggal: string;
  status: 'ACTIVE' | 'RESOLVED';
}

// User Management (Pengguna & Hak Akses Gudang)
export interface WarehouseUser {
  id: string;
  nama: string;
  username: string;
  role: 'Super Admin' | 'Warehouse Admin' | 'Operator Lapangan' | 'Supervisor';
  status: 'Aktif' | 'Nonaktif';
}

// Master Gudang & Sub-Location (User Management -> Tab Gudang)
export type WarehouseLocationGroup = 'SJA 3' | 'Gd. 137' | 'Gd. KRIAN';

export const WAREHOUSE_LOCATION_GROUPS: WarehouseLocationGroup[] = [
  'SJA 3',
  'Gd. 137',
  'Gd. KRIAN'
];

export interface MasterWarehouse {
  id: string;
  locationGroup: WarehouseLocationGroup;
  kodeGudang: string; // e.g. 'GD-05', 'GD-06'
  namaGudang: string; // Sub Location, e.g. 'Gudang 05', 'Gudang 06'
  subtitle?: string;
  status: 'ACTIVE' | 'MAINTENANCE';
  rackLeftPrefix?: string; // e.g. '5A', '6A'
  rackRightPrefix?: string; // e.g. '5B', '6B'
  leftSlotCount?: number; // default 50
  rightSlotCount?: number; // default 50
  rightPrimaryCount?: number; // default 6
  keterangan?: string;
}

export interface SuratJalanItemLine {
  kodeItem: string;
  namaBarang: string;
  detailBarang: string;
  qtyBox: number;
  beratPerBoxKg: number;
  totalKg: number;
  nomorPalletList?: string[];
  noBatchList?: string[];
}

export interface SuratJalanRecord {
  id: string;
  noSuratJalan: string; // e.g. 'FGW/26/XI/032'
  noDokumen: string; // 'F/SCM/01.08'
  revNo: string; // '05'
  halaman: string; // '1/1'
  berlakuTanggal: string; // '10/10/2026'
  tanggal: string; // 'YYYY-MM-DD'
  tanggalPengambilanFormatted: string; // e.g. '11/11/2026'
  tglJamCetakCustom?: string; // Input khusus tanggal & jam cetak (opsional)
  waktuCetakFormatted?: string; // Timestamp cetak yang dicetak di surat jalan
  noPolisi: string;
  noSpp?: string; // No. Surat Perintah Pengiriman
  noPo: string; // default '-'
  noKontainer?: string; // No. Kontainer armada/pengiriman
  noFaktur?: string; // No. Faktur pajak/penjualan
  noInvoice?: string; // No. Invoice tagihan
  ruteDariId: string;
  ruteDariNama: string;
  ruteDariAlamat?: string;
  ruteTujuanId: string;
  ruteTujuanKode: string; // matches pallet destination e.g. 'SJA Semarang'
  ruteTujuanNama: string;
  ruteTujuanAlamat?: string;
  vendorId?: string;
  namaVendorArmada: string;
  tarif?: number;
  ppnPersen?: number;
  tarifTotal?: number;
  namaDriver: string;
  noHpDriver: string;
  palletIds: string[];
  itemsSummary: SuratJalanItemLine[];
  grandTotalBox: number;
  grandTotalKg: number;
  note?: string;
  createdAt: string;
}

export interface PalletBatchEntry {
  noBatch: string;
  boxAwal: string;
  boxAkhir: string;
  qtyBox?: number;
}

export const PALLET_QC_STATUSES = ['OK', 'BO', 'HOLD'] as const;

export type PalletQcStatus = typeof PALLET_QC_STATUSES[number];

export interface PalletRowInput {
  id: string;
  nomorPallet: string; // Nomor pallet di setiap item (selalu kosong di awal)
  statusQc?: PalletQcStatus; // Status kondisi pallet: default 'OK', pilihan 'OK' | 'BO' | 'HOLD'
  kodeItem: string;
  namaBarang: string;
  qtyPallet: string | number;
  unit: string;
  noBatch: string; // Kolom utama: No. Batch 1
  boxAwal: string; // No. Box Awal Batch 1
  boxAkhir: string; // No. Box Akhir Batch 1
  batchAwal?: string; // kompatibilitas
  batchAkhir?: string; // kompatibilitas
  extraBatches?: PalletBatchEntry[]; // Batch tambahan (Batch ke-2, ke-3, dst) dalam 1 pallet
  keterangan?: string;
}

export interface WarehouseTransferEntry {
  dariGudang: string;
  keGudang: string;
  tanggalOper: string;
  binBaru?: string;
  petugas?: string;
  catatan?: string;
}

export const CANONICAL_WAREHOUSE_LOCATIONS = [
  'Gd Krian',
  'SJA 3 (SJA Sukodono)',
  'Gd 137'
] as const;

export type CanonicalWarehouseLocation = typeof CANONICAL_WAREHOUSE_LOCATIONS[number];

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
  noBatch: string; // No. Batch (atau gabungan jika multi-batch)
  boxAwal: string; // No. Box Awal
  boxAkhir: string; // No. Box Akhir
  batchAwal?: string; // kompatibilitas
  batchAkhir?: string; // kompatibilitas
  batches?: PalletBatchEntry[]; // Daftar seluruh batch & no box dalam 1 pallet (jika >= 1 batch)
  lokasiBin: string; // 1x input applied to all rows in pallet
  lokasiGudang?: string; // 'Gd Krian' | 'SJA 3 (SJA Sukodono)' | 'Gd 137'
  gudangAsal?: string; // Asal awal stock (mis: 'SJA 3 (SJA Sukodono)')
  operHistory?: WarehouseTransferEntry[]; // Riwayat oper gudang (maks. 2x: SJA 3 -> Gd 137/Krian -> SJA 3)
  statusQc?: PalletQcStatus; // Status pallet (OK | BO | HOLD), data lama otomatis dianggap 'OK'
  keterangan?: string;
  submittedAt: string;
  updatedAt?: string; // Timestamp terakhir kali data pallet ini diupdate
  lastUpdateAction?: string; // Keterangan aksi update terakhir (Edit Data, Outbound, Re-order, dll)
  // Outbound / Pengambilan Produk tracking
  status?: 'IN' | 'OUT'; // Defaults to 'IN'
  tujuanPengambilan?: string; // 'SJA Sepanjang' | 'SJA Karawang' | 'SJA Sukodono' | 'SJA Semarang'
  tanggalPengambilan?: string; // ISO string / formatted date timestamp
  petugasPengambilan?: string;
  suratJalanId?: string; // ID Surat Jalan jika sudah dimuat
  noSuratJalan?: string;
  binOrder?: number; // Custom physical stack/order rank within a Bin (higher comes first at Row No. 1)
}

export const OUTBOUND_DESTINATIONS = [
  'SJA Sepanjang',
  'SJA Karawang',
  'SJA Sukodono',
  'SJA Semarang'
] as const;

export type OutboundDestination = typeof OUTBOUND_DESTINATIONS[number];

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

// Master database barang awal dengan default satuan 'Box' dan berat per box 30 Kg
export const DEFAULT_MASTER_ITEMS: MasterItem[] = [
  { id: 'itm-sic-1', kodeItem: '00J.KPI18.K030706', namaBarang: 'SIC 25 BR (1 X 30 KG)', satuan: 'Box', defaultQty: 15, beratPerBoxKg: 30, kategori: 'Bahan Baku' },
  { id: 'itm-sic-2', kodeItem: '00J.KPI18.K030707', namaBarang: 'SIC 8590 SD (1 X 30 KG)', satuan: 'Box', defaultQty: 15, beratPerBoxKg: 30, kategori: 'Bahan Baku' },
  { id: 'itm-sic-3', kodeItem: '00J.KPI18.K030708', namaBarang: 'SIC 8590 HD (1 X 30 KG)', satuan: 'Box', defaultQty: 15, beratPerBoxKg: 30, kategori: 'Bahan Baku' },
  { id: 'itm-sic-4', kodeItem: '00J.KPI18.K030709', namaBarang: 'SIC 30 BR (1 X 25 KG)', satuan: 'Box', defaultQty: 20, beratPerBoxKg: 25, kategori: 'Bahan Baku' },
  { id: 'itm-sic-5', kodeItem: '00J.KPI10.K0307001XX', namaBarang: 'SIC 01 PC (1 X 30 KG)', satuan: 'Box', defaultQty: 15, beratPerBoxKg: 30, kategori: 'Bahan Baku' },
  { id: 'itm-sic-6', kodeItem: '00J.KPI09.K0307001XX', namaBarang: 'SIC 18 C1 (1 X 30 KG)', satuan: 'Box', defaultQty: 15, beratPerBoxKg: 30, kategori: 'Bahan Baku' },
  { id: 'itm-1', kodeItem: 'KDK-UHT100', namaBarang: 'Susu UHT Full Cream 1000ml', satuan: 'Box', defaultQty: 120, beratPerBoxKg: 12, kategori: 'Minuman' },
  { id: 'itm-2', kodeItem: 'KDK-UHT250', namaBarang: 'Susu UHT Cokelat 250ml', satuan: 'Box', defaultQty: 160, beratPerBoxKg: 10, kategori: 'Minuman' },
  { id: 'itm-3', kodeItem: 'KDK-MGS002', namaBarang: 'Minyak Goreng Sawit Pouch 2L', satuan: 'Box', defaultQty: 80, beratPerBoxKg: 16, kategori: 'Sembako' },
  { id: 'itm-4', kodeItem: 'KDK-MGB001', namaBarang: 'Minyak Goreng Botol 1L', satuan: 'Box', defaultQty: 96, beratPerBoxKg: 12, kategori: 'Sembako' },
  { id: 'itm-5', kodeItem: 'KDK-TPG001', namaBarang: 'Tepung Terigu Serbaguna 1kg', satuan: 'Box', defaultQty: 100, beratPerBoxKg: 25, kategori: 'Bahan Baku' },
  { id: 'itm-6', kodeItem: 'KDK-GLA001', namaBarang: 'Gula Pasir Kristal Putih 1kg', satuan: 'Box', defaultQty: 150, beratPerBoxKg: 30, kategori: 'Sembako' }
];

// Master Database Rute Dari & Tujuan (lengkap dengan alamat, tarif default, dan PPN)
export const DEFAULT_MASTER_ROUTES: MasterRoute[] = [
  {
    id: 'route-sukodono-origin',
    kodeLokasi: 'SJA Sukodono',
    namaLokasi: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    alamat: 'Jl. Raya Panjunan No.KM 3, Babatan, Panjunan, Kec. Sukodono, Kabupaten Sidoarjo, Jawa Timur 61258',
    tipe: 'KEDUA',
    tarifDefault: 0,
    ppnPersen: 0
  },
  {
    id: 'route-semarang',
    kodeLokasi: 'SJA Semarang',
    namaLokasi: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEMARANG',
    alamat: 'Kawasan Industri Wijayakusuma Blok B-12, Tugu, Semarang, Jawa Tengah 50153',
    tipe: 'TUJUAN',
    tarifDefault: 3500000,
    ppnPersen: 0
  },
  {
    id: 'route-sepanjang',
    kodeLokasi: 'SJA Sepanjang',
    namaLokasi: 'PT. SANTOS JAYA ABADI - SEPANJANG',
    alamat: 'Jl. Raya Sepanjang KM 18, Taman, Sidoarjo, Jawa Timur 61257',
    tipe: 'TUJUAN',
    tarifDefault: 1200000,
    ppnPersen: 0
  },
  {
    id: 'route-karawang',
    kodeLokasi: 'SJA Karawang',
    namaLokasi: 'PT. SANTOS JAYA ABADI - KARAWANG',
    alamat: 'Kawasan Industri Surya Cipta, Jl. Surya Lestari Kav. 1-2C, Telukjambe Timur, Karawang 41361',
    tipe: 'TUJUAN',
    tarifDefault: 4500000,
    ppnPersen: 0
  }
];

// Master Database Vendor Armada (lengkap dengan tarif default dan PPN)
export const DEFAULT_MASTER_VENDORS: MasterVendor[] = [
  {
    id: 'vendor-1',
    namaVendor: 'PT. Trans Sidoarjo Logistik',
    kontak: '0812-3456-7890 (Pak Bambang)',
    tarifDefault: 3500000,
    ppnPersen: 11,
    keterangan: 'Armada Wingbox & Fuso CDD'
  },
  {
    id: 'vendor-2',
    namaVendor: 'CV. Armada Jaya Mandiri',
    kontak: '0813-9876-5432 (Ibu Dewi)',
    tarifDefault: 2800000,
    ppnPersen: 11,
    keterangan: 'Armada CDD & Tronton'
  },
  {
    id: 'vendor-3',
    namaVendor: 'PT. Ekspedisi Nusantara Sentosa',
    kontak: '0821-4455-6677 (Bpk. Hadi)',
    tarifDefault: 4200000,
    ppnPersen: 11,
    keterangan: 'Spesialis Antar-Pulau & Rute Pantura'
  }
];

// Layout Gudang 5:
// Sisi Kiri (A): hingga 50 slot (5A.1 s/d 5A.50)
export const GUDANG5_SLOTS_A: string[] = Array.from(
  { length: 50 },
  (_, i) => `5A.${i + 1}`
);

// Sisi Kanan (B): hingga 50 slot (5B.1 s/d 5B.50) dengan 6 slot utama
export const GUDANG5_SLOTS_B: string[] = Array.from(
  { length: 50 },
  (_, i) => `5B.${i + 1}`
);

// 6 slot standar utama di lokasi B (5B.1 s/d 5B.6)
export const GUDANG5_SLOTS_B_PRIMARY: string[] = [
  '5B.1', '5B.2', '5B.3', '5B.4', '5B.5', '5B.6'
];

export const GUDANG5_QUICK_BINS = [...GUDANG5_SLOTS_A, ...GUDANG5_SLOTS_B];

// Master Database Rute & Tarif (Persis seperti attachment image_5ce49fe3.png)
export const DEFAULT_MASTER_ROUTE_TARIFFS: MasterRouteTariff[] = [
  {
    id: 'tariff-1',
    ruteAwal: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    ruteTujuan: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - KARAWANG',
    alamatTujuan: 'Jl. Surya Madya Kav. I-18 Ds. Kuta Mekar Kec. Ciampel Karawang 41361',
    vendor: 'CTL',
    tarif: 4675000,
    ppnPersen: 11
  },
  {
    id: 'tariff-2',
    ruteAwal: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    ruteTujuan: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - KARAWANG',
    alamatTujuan: 'Jl. Surya Madya Kav. I-18 Ds. Kuta Mekar Kec. Ciampel Karawang 41361',
    vendor: 'DUTA LINTAS',
    tarif: 5000000,
    ppnPersen: 11
  },
  {
    id: 'tariff-3',
    ruteAwal: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    ruteTujuan: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEMARANG',
    alamatTujuan: 'Jl. Gatot Subroto Kawasan Industri Candi Blok G-H Ngaliyan Semarang',
    vendor: 'FLI',
    tarif: 4500000,
    ppnPersen: 11
  },
  {
    id: 'tariff-4',
    ruteAwal: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    ruteTujuan: 'AGEL LANGGENG BEKASI',
    alamatTujuan: 'Kawasan Industri MM2100 Cikarang Barat Bekasi',
    vendor: 'LOGISTIK CANGGIH',
    tarif: 3600000,
    ppnPersen: 1.1
  },
  {
    id: 'tariff-5',
    ruteAwal: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - KARAWANG',
    ruteTujuan: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    alamatTujuan: 'Jl. Raya Panjunan No.KM 3, Babatan, Panjunan, Kec. Sukodono, Kabupaten Sidoarjo, Jawa Timur 61258',
    vendor: 'CTL',
    tarif: 4800000,
    ppnPersen: 0,
    keterangan: 'Rute Balik Karawang -> Sukodono'
  },
  {
    id: 'tariff-6',
    ruteAwal: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    ruteTujuan: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEPANJANG',
    alamatTujuan: 'Jl Raya Gilang no 159 Sepanjang Sidoarjo',
    vendor: 'PT. Trans Sidoarjo Logistik',
    tarif: 1200000,
    ppnPersen: 11
  }
];

// Master Database Blacklist
export const DEFAULT_BLACKLIST_RECORDS: BlacklistRecord[] = [
  {
    id: 'bl-1',
    tipe: 'NOPOL',
    identifier: 'B 9482 KDA',
    alasan: 'Kondisi bak bocor saat hujan / tidak standar SOP',
    tanggal: '05/11/2026',
    status: 'ACTIVE'
  },
  {
    id: 'bl-2',
    tipe: 'DRIVER',
    identifier: 'Herman (PT. Ekspedisi X)',
    alasan: 'Terlambat melebihi toleransi waktu 6 jam tanpa konfirmasi',
    tanggal: '01/11/2026',
    status: 'ACTIVE'
  }
];

// Master Database Warehouse Users (User Management)
export const DEFAULT_WAREHOUSE_USERS: WarehouseUser[] = [
  {
    id: 'usr-1',
    nama: 'Sandy Pradana',
    username: 'sandy.admin',
    role: 'Super Admin',
    status: 'Aktif'
  },
  {
    id: 'usr-2',
    nama: 'Agus Santoso',
    username: 'agus.wh',
    role: 'Warehouse Admin',
    status: 'Aktif'
  },
  {
    id: 'usr-3',
    nama: 'Budi Raharjo',
    username: 'budi.spv',
    role: 'Supervisor',
    status: 'Aktif'
  },
  {
    id: 'usr-4',
    nama: 'Rian Pratama',
    username: 'rian.opt',
    role: 'Operator Lapangan',
    status: 'Aktif'
  }
];

// Master Database Gudang & Sub-Location
export const DEFAULT_MASTER_WAREHOUSES: MasterWarehouse[] = [
  {
    id: 'wh-krian-05',
    locationGroup: 'Gd. KRIAN',
    kodeGudang: 'GD-05',
    namaGudang: 'Gudang 05',
    subtitle: 'Denah Rak 5A & 5B · Area Utama Krian',
    status: 'ACTIVE',
    rackLeftPrefix: '5A',
    rackRightPrefix: '5B',
    leftSlotCount: 50,
    rightSlotCount: 50,
    rightPrimaryCount: 6,
    keterangan: 'Denah Gudang 5 (50 Slot 5A & 5B)'
  },
  {
    id: 'wh-krian-06',
    locationGroup: 'Gd. KRIAN',
    kodeGudang: 'GD-06',
    namaGudang: 'Gudang 06',
    subtitle: 'Peta Rak 6A & 6B · Area Gudang 6 Krian',
    status: 'ACTIVE',
    rackLeftPrefix: '6A',
    rackRightPrefix: '6B',
    leftSlotCount: 50,
    rightSlotCount: 50,
    rightPrimaryCount: 6,
    keterangan: 'Peta Gudang 6 (50 Slot 6A & 6B)'
  }
];

export interface WarehouseRackConfig {
  leftPrefix: string;
  rightPrefix: string;
  leftCount: number;
  rightCount: number;
  primaryCount: number;
  slotsA: string[];
  slotsB: string[];
  slotsBPrimary: string[];
  allSlots: string[];
}

export function getWarehouseRackSlots(warehouse?: MasterWarehouse | null): WarehouseRackConfig {
  const leftPrefix = (warehouse?.rackLeftPrefix || '5A').trim().toUpperCase();
  const rightPrefix = (warehouse?.rackRightPrefix || '5B').trim().toUpperCase();
  const leftCount = Math.max(1, Math.min(200, Number(warehouse?.leftSlotCount) || 50));
  const rightCount = Math.max(1, Math.min(200, Number(warehouse?.rightSlotCount) || 50));
  const primaryCount = Math.max(1, Math.min(rightCount, Number(warehouse?.rightPrimaryCount) || 6));

  const slotsA = Array.from({ length: leftCount }, (_, i) => `${leftPrefix}.${i + 1}`);
  const slotsB = Array.from({ length: rightCount }, (_, i) => `${rightPrefix}.${i + 1}`);
  const slotsBPrimary = slotsB.slice(0, primaryCount);

  return {
    leftPrefix,
    rightPrefix,
    leftCount,
    rightCount,
    primaryCount,
    slotsA,
    slotsB,
    slotsBPrimary,
    allSlots: [...slotsA, ...slotsB]
  };
}

export function resolveWarehouseForBin(
  binCode: string,
  warehouses: MasterWarehouse[],
  fallback?: MasterWarehouse | null
): MasterWarehouse | null {
  const upperBin = (binCode || '').trim().toUpperCase();
  const prefix = upperBin.split('.')[0];
  if (prefix) {
    const matched = warehouses.find((w) => {
      const l = (w.rackLeftPrefix || '').trim().toUpperCase();
      const r = (w.rackRightPrefix || '').trim().toUpperCase();
      return l === prefix || r === prefix;
    });
    if (matched) return matched;
  }
  return fallback || warehouses[0] || DEFAULT_MASTER_WAREHOUSES[0];
}

export function mapGroupToCanonicalWarehouse(group?: string): string {
  const val = (group || '').trim();
  if (!val) return 'Gd Krian';
  if (/137/i.test(val)) return 'Gd 137';
  if (/sukodono|sja\s*3/i.test(val)) return 'SJA 3 (SJA Sukodono)';
  if (/krian/i.test(val)) return 'Gd Krian';
  return val;
}

export function resolvePalletWarehouseLocation(
  record: Pick<PalletRecord, 'lokasiBin' | 'lokasiGudang'>,
  warehouses: MasterWarehouse[] = DEFAULT_MASTER_WAREHOUSES
): string {
  if (record.lokasiGudang && record.lokasiGudang.trim()) {
    return mapGroupToCanonicalWarehouse(record.lokasiGudang);
  }
  const upperBin = (record.lokasiBin || '').trim().toUpperCase();
  if (/^(SJA3|SUKODONO)/.test(upperBin)) return 'SJA 3 (SJA Sukodono)';
  if (/^(137|GD\.?\s*137)/.test(upperBin)) return 'Gd 137';

  const prefix = upperBin.split('.')[0];
  if (prefix && warehouses.length > 0) {
    const matched = warehouses.find((w) => {
      const l = (w.rackLeftPrefix || '').trim().toUpperCase();
      const r = (w.rackRightPrefix || '').trim().toUpperCase();
      return l === prefix || r === prefix;
    });
    if (matched) {
      return mapGroupToCanonicalWarehouse(matched.locationGroup);
    }
  }
  return 'Gd Krian';
}

export function isSukodonoDestination(destination?: string): boolean {
  return /sukodono|sja\s*3/i.test((destination || '').trim());
}

export function computePalletStockStatus(
  record: Pick<PalletRecord, 'status' | 'tujuanPengambilan'>,
  sj?: { ruteTujuanKode?: string; ruteTujuanNama?: string } | null
): 'Ada' | 'Habis' {
  const dest = (
    sj?.ruteTujuanKode ||
    sj?.ruteTujuanNama ||
    record.tujuanPengambilan ||
    ''
  ).trim();

  if (record.status !== 'OUT' && !sj) {
    return 'Ada';
  }
  if (dest && isSukodonoDestination(dest)) {
    return 'Ada';
  }
  return 'Habis';
}

export function resolvePalletQcStatus(
  record?: Pick<PalletRecord, 'statusQc'> | null
): PalletQcStatus {
  const val = String(record?.statusQc || '')
    .trim()
    .toUpperCase();
  if (val === 'BO' || val === 'HOLD' || val === 'OK') {
    return val;
  }
  return 'OK';
}

export function deriveAsalPacking(noBatch?: string): string {
  const raw = (noBatch || '').trim().toUpperCase();
  if (!raw || raw === '-') return '-';

  const segments = raw
    .split(/\s*[,;|]\s*|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    const labels = Array.from(
      new Set(
        segments
          .map((seg) =>
            seg.startsWith('A') ? 'Packing 1' : seg.startsWith('B') ? 'Packing 2' : ''
          )
          .filter(Boolean)
      )
    );
    if (labels.length > 0) return labels.join(' / ');
  }

  if (raw.startsWith('A')) return 'Packing 1';
  if (raw.startsWith('B')) return 'Packing 2';
  return '-';
}



