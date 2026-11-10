# Rencana Implementasi: Kalkulasi Total Box Rentang Batch & Sinkronisasi Cadangan JSON

Menjawab kebutuhan pengguna:
1. Memberikan petunjuk visual & kalkulasi otomatis berapa total box dari rentang Batch Awal dan Batch Akhir dengan mengambil angka di akhir kode batch.
2. Menyediakan mekanisme sinkronisasi data riil antara AI Studio dan domain GitHub Pages (`punyasandy199-rgb.github.io`) melalui fitur Ekspor & Impor Cadangan Data JSON.

---

## 1. Kalkulasi Otomatis Total Box dari Rentang Batch

### Analisis & Logika
- Kode batch sering kali diawali dengan kode tahun/bulan atau alfabet lalu diakhiri angka urut, contoh:
  - `B260101` s/d `B260150` -> Angka akhir `101` s/d `150` -> Total = $150 - 101 + 1 = 50$ Box.
  - `001` s/d `015` -> Total = $15 - 1 + 1 = 15$ Box.
  - `LOT-A-10` s/d `LOT-A-25` -> Total = $25 - 10 + 1 = 16$ Box.
- Kita buat fungsi utilitas ekstraksi angka akhir: `extractTrailingNumber(batchStr: string)`.
- Jika kedua angka valid dan `akhir >= awal`, sistem menghitung:
  $$\text{Total Box} = (\text{angkaAkhir} - \text{angkaAwal} + 1)$$
- Menampilkan petunjuk badge hijau/biru interaktif di bawah input Batch:
  - *"Terdeteksi: 50 Box (101 → 150)"*
  - Tombol pintas kecil: *"Gunakan sebagai Qty"* untuk otomatis mengisi kolom `Qty / Pallet` jika pengguna menginginkan.
  - Jika angka akhir < angka awal, muncul peringatan ramah: *"Batch akhir lebih kecil dari batch awal"*.

---

## 2. Fitur Ekspor & Impor Data Cadangan JSON (Sinkronisasi GitHub Pages)

### Mengapa Sebelumnya Tidak Sinkron?
- Aplikasi web berjalan di sisi klien (Client-side / Browser Storage `localStorage`).
- Kebijakan keamanan browser (*Same-Origin Policy*) melarang browser membagikan `localStorage` antara domain `*.asia-east1.run.app` (AI Studio) dengan domain `*.github.io` (GitHub Pages) secara otomatis.
- Oleh karena itu, data yang diinput di AI Studio tersimpan di browser untuk domain AI Studio.

### Solusi Sinkronisasi: Cadangan & Pemulihan JSON
1. **Fitur Ekspor Cadangan Data (`wh_backup_[tanggal].json`)**:
   - Mengekstrak semua data tersimpan:
     - Master Database Barang (Nama & Kode Item, Satuan, Qty default).
     - Riwayat Pallet Inbound lengkap (Barcode, Bin, Batch, No Pallet).
   - Mengunduh 1 file JSON ringkas dan aman.
2. **Fitur Impor Cadangan Data**:
   - Tersedia di Top Bar / Pengaturan Aplikasi (baik di AI Studio maupun di GitHub Pages).
   - Pengguna memilih file JSON yang diekspor dari AI Studio, dan klik *"Pulihkan Data"*.
   - Aplikasi di GitHub Pages langsung memuat 100% data riil yang sama secara instan tanpa perlu input ulang manual.
3. **Penggabungan / Penimpaan Fleksibel**:
   - Pilihan: *"Gabungkan dengan Data yang Ada"* atau *"Timpa Bersih"*.

---

## 3. Rencana Perubahan Berkas

1. **`src/utils/batchCalculator.ts` (Berkas Baru)**:
   - Logika ekstraksi nomor urut akhir dari string batch.
   - Perhitungan total box $(akhir - awal + 1)$.
2. **`src/components/PalletInputForm.tsx`**:
   - Menambahkan petunjuk visual live badge total box di bawah baris input Batch Awal & Batch Akhir.
   - Tombol klik untuk menyamakan dengan `Qty / Pallet`.
3. **`src/components/DataBackupModal.tsx` (Berkas Baru)**:
   - Antarmuka visual untuk Ekspor JSON dan Impor/Unggah file JSON cadangan.
   - Menampilkan status keberhasilan impor, jumlah item master, dan jumlah transaksi yang berhasil dipulihkan.
4. **`src/App.tsx`**:
   - Menambahkan tombol *"Sinkron / Cadangkan Data"* di Header bar navigasi atas.
   - Integrasi state pemulihan data secara reaktif ke seluruh komponen.
5. **Kompilasi & Pembaruan Build**:
   - Eksekusi `npm run build` untuk memperbarui folder `dist/` dan `docs/` untuk GitHub Pages.
