# Sistem Input Pallet Inbound & Generator Barcode Bin Gudang

Aplikasi web manajemen inbound gudang dan pergudangan logistik untuk menginput data penerimaan pallet (hingga 8 baris item sekaligus) berisikan Nama Barang, Qty per Pallet, Nomor Batch Awal & Batch Akhir, serta Lokasi Bin, yang secara otomatis menerbitkan nomor barcode unik, merender barcode Code 128 siap cetak, menyimpan riwayat penerimaan, dan mendukung ekspor data ke Excel/CSV.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan jawaban klarifikasi yang telah Anda tentukan:

- **Format Barcode**: Barcode visual Code 128 SVG dengan garis tajam yang siap dicetak langsung ke printer label thermal maupun printer dokumen standar.
- **Pengisian Lokasi Bin**: Input manual terpandu dengan format standar penamaan Bin pergudangan (contoh format: `[Zona]-[Lorong]-[Rak]-[Tingkat]`, misal `A-02-04-B`) disertai opsi quick-presets dan validasi format.
- **Penyimpanan & Ekspor**: Data disimpan secara lokal di peramban (persistent *LocalStorage*), dilengkapi fitur unduh data Excel (.csv / spreadsheet) dan fitur Cetak Label Thermal terpisah (ukuran label standar 100×150 mm / A6).
- **Kapasitas Batch**: Form fleksibel yang mendukung 1 hingga maksimal 8 baris data barang sekaligus dalam satu transaksi pallet inbound, dengan opsi *Tambah Baris*, *Hapus Baris*, serta *Isi Data Sampel* untuk pengujian cepat.

---

### 1. Overview & Core Concept

- **Apa yang Dilakukan**: Menyediakan antarmuka entri data cepat bagi operator gudang/checker inbound untuk mencatat muatan pallet. Setiap batch input (maksimal 8 item) langsung divalidasi, diberikan nomor identifikasi barcode pallet terstandar (misal: `PLT-YYYYMMDD-XXXX`), dan dihubungkan ke lokasi Bin penyimpanan awal.
- **Pengguna Sasaran**: Petugas Gudang (Warehouse Checker / Admin Inbound), Supervisor Logistik, dan Operator Forklift Putaway.
- **Nilai Utama**: Mempercepat proses registrasi barang masuk, mencegah kesalahan manual penulisan batch dan lokasi Bin, serta langsung memproduksi barcode yang siap ditempelkan pada fisik pallet.

---

### 2. User Experience & Visual Design

#### A. Alur Kerja Pengguna
1. **Layar Input Pallet**:
   - Header aplikasi dengan identitas sistem (*Inbound Pallet & Bin Management*).
   - Form dinamis tabel grid (1–8 item): Kolom *Nama Barang*, *Qty per Pallet*, *Batch Awal*, *Batch Akhir*, *Lokasi Bin*.
   - Tool bar ringkas: Tombol *"Tambah Baris"* (nonaktif jika sudah 8 baris), *"Hapus Baris"*, dan *"Isi Contoh Data"*.
   - Tombol utama: *"Submit & Generate Barcode"*.
2. **Hasil Submit & Barcode Display**:
   - Panel ringkasan batch yang berhasil diproses.
   - Kartu label barcode Code 128 beresolusi tajam untuk setiap item, mencantumkan: Nomor Barcode, Nama Barang, Total Qty, Rentang Batch (Awal s/d Akhir), Lokasi Bin, dan Waktu Input.
   - Tombol aksi: *"Cetak Semua Label (Print)"*, *"Cetak Label Terpilih"*, dan *"Input Batch Baru"*.
3. **Riwayat Penerimaan (History Log)**:
   - Tabel riwayat semua pallet yang telah di-submit.
   - Filter pencarian berdasarkan Nama Barang, Lokasi Bin, atau Nomor Barcode.
   - Tombol *"Ekspor Excel (CSV)"* untuk laporan penerimaan gudang.

#### B. Visual Identity & Tema
- **Aesthetic Direction**: Antarmuka industri modern, bersih, fungsional (*clean operational dashboard*) dengan kontras tinggi untuk kenyamanan kerja di area gudang.
- **Color Palette (60-30-10)**:
  - *Canvas (60%)*: Slate ultra-light (`#F8FAFC`) / Dark slate (`#0F172A`) pada dark mode.
  - *Surfaces & Cards (30%)*: Pure white (`#FFFFFF`) / Card slate (`#1E293B`) dengan hairline border `border-slate-200 dark:border-slate-800`.
  - *Accents (10%)*: Deep Cobalt Blue (`#2563EB`) untuk tombol aksi utama dan Emerald (`#059669`) untuk status alokasi sukses.
- **Typography & Tabular Data**:
  - Headings & Navigation: `Plus Jakarta Sans` berbobot tegas.
  - Form & Data Tables: `DM Sans` dengan angka tabular monospaced (`font-mono tabular-nums`) untuk nomor batch, barcode, qty, dan kode Bin.
- **Cetak Khusus Thermal / Paper**:
  - Desain CSS `@media print` terisolasi yang hanya menampilkan kartu label barcode dengan ukuran rasio 4:6 / 100x150mm tanpa tombol navigasi atau elemen antarmuka lainnya.

---

### 3. Key Product Decisions & Trade-Offs

- **Engine Barcode Code 128**:
  - *Pilihan*: Generator Code 128 berbasis SVG native client-side yang menghasilkan barcode linier dengan presisi pixel tanpa bergantung pada API server pihak ketiga.
  - *Alasan*: Bekerja 100% offline di lingkungan intranet gudang, tidak ada latensi jaringan, dan vector SVG menghasilkan cetakan barcode yang terbaca sempurna oleh scanner barcode laser maupun kamera 2D.
- **Validasi Format Bin**:
  - *Pilihan*: Input manual fleksibel dengan indikator format rekomendasi (misal: `A-01-02-B` untuk Zona A, Lorong 01, Rak 02, Level B) beserta tombol saran cepat format (*helper chips*).
  - *Alasan*: Setiap gudang memiliki konvensi penomoran Bin yang sedikit berbeda, sehingga fleksibilitas input manual dengan panduan format memberikan fleksibilitas operasional maksimal tanpa membatasi pengguna.
- **Penyimpanan Data Lokal**:
  - *Pilihan*: Menggunakan browser *LocalStorage* yang reaktif dengan opsi backup ekspor Excel/CSV.
  - *Alasan*: Respon instan tanpa setup database eksternal rumit, data tetap tersimpan saat halaman di-refresh, dan mudah diekspor untuk integrasi ke SAP/WMS/Excel manual.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App Root (App.tsx)                              │
│       - State Tab (Input Form / Riwayat / Pratinjau Cetak)             │
│       - Theme Provider (Dark / Light Mode)                             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     PalletInputForm.tsx         │       │     PalletHistoryTable.tsx      │
│  - Multi-row inputs (1-8 rows)  │       │  - Search & filter by Bin/SKU   │
│  - Field validation & helpers   │       │  - Export to Excel (CSV)        │
│  - Preset template filler       │       │  - Batch selection & deletion   │
└────────────────┬────────────────┘       └─────────────────┬───────────────┘
                 │                                          │
                 ▼                                          │
┌─────────────────────────────────┐                         │
│     BarcodeGeneratorModal.tsx   │                         │
│  - Code 128 SVG Barcode Engine  │◄────────────────────────┘
│  - Thermal Label Layout Preview │
│  - Print Handler (@media print) │
└─────────────────────────────────┘
```

#### Struktur Data (PalletItem & BatchRecord)
```typescript
interface PalletItem {
  id: string;
  namaBarang: string;
  qtyPallet: number;
  batchAwal: string;
  batchAkhir: string;
  lokasiBin: string;
  barcodeNumber: string;
  createdAt: string;
}

interface BatchSubmission {
  batchId: string;
  submittedAt: string;
  items: PalletItem[];
  totalQty: number;
}
```

#### Komponen Utama
1. `src/components/PalletInputForm.tsx`: Komponen tabel form dinamis 1–8 baris, validasi angka positif, auto-capitalize kode batch dan lokasi Bin.
2. `src/components/BarcodeRenderer.tsx`: Generator barcode Code 128 berbasis SVG murni yang menghitung start code, encoded pattern bars, dan modulo 103 checksum otomatis.
3. `src/components/BarcodeLabelModal.tsx`: Tampilan kartu label thermal siap cetak lengkap dengan informasi barang, batch, barcode, dan lokasi Bin.
4. `src/components/PalletHistoryTable.tsx`: Tabel data riwayat pallet dengan pencarian, filter, seleksi baris, cetak ulang, dan ekspor file spreadsheet (.csv).
5. `src/utils/code128.ts`: Modul algoritma pengkodean Code 128 (Subset B) murni tanpa dependensi eksternal yang rentan.
6. `src/utils/exporter.ts`: Modul pembentuk file Excel/CSV dengan format encoding UTF-8 BOM untuk kompatibilitas Microsoft Excel bahasa Indonesia.
