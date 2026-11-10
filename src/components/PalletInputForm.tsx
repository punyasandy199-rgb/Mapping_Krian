import React, { useState } from 'react';
import {
  PalletRowInput,
  MasterItem,
  COMMON_UNITS,
  GUDANG5_SLOTS_A,
  GUDANG5_SLOTS_B
} from '../types/warehouse';
import { calculateBatchBoxCount } from '../utils/batchCalculator';
import { QrCodeRenderer } from './QrCodeRenderer';
import {
  Plus,
  Trash2,
  Sparkles,
  RotateCcw,
  Barcode,
  MapPin,
  Layers,
  Database,
  QrCode,
  Box,
  AlertCircle
} from 'lucide-react';

interface PalletInputFormProps {
  masterItems: MasterItem[];
  onOpenMasterDatabase: () => void;
  onOpenBinDetail: (binCode: string) => void;
  onSubmit: (
    rows: PalletRowInput[],
    lokasiBin: string
  ) => void;
}

const createEmptyRow = (index: number, inheritFrom?: PalletRowInput): PalletRowInput => ({
  id: `row-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`,
  nomorPallet: '', // Kondisikan saat awal selalu kosong
  kodeItem: inheritFrom?.kodeItem || '',
  namaBarang: inheritFrom?.namaBarang || '', // saat penambahan baris mengikuti history 1 item diatasnya
  qtyPallet: inheritFrom ? inheritFrom.qtyPallet : '',
  unit: inheritFrom?.unit || 'Box', // default satuan ke 'Box'
  noBatch: inheritFrom?.noBatch || '', // mewarisi batch diatasnya jika ada
  boxAwal: '', // No. Box Awal kosong
  boxAkhir: '', // No. Box Akhir kosong
  batchAwal: '',
  batchAkhir: '',
  keterangan: inheritFrom?.keterangan || ''
});

export const PalletInputForm: React.FC<PalletInputFormProps> = ({
  masterItems,
  onOpenMasterDatabase,
  onOpenBinDetail,
  onSubmit
}) => {
  // Lokasi Bin diisi 1x saja di bagian atas (Gudang 5: 5A.1 dst)
  const [lokasiBin, setLokasiBin] = useState('5A.1');

  // Mulai dengan 1 baris input kosong (No Pallet selalu kosong)
  const [rows, setRows] = useState<PalletRowInput[]>([
    createEmptyRow(1)
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);

  const MAX_ROWS = 8;

  const handleAddRow = () => {
    if (rows.length < MAX_ROWS) {
      const nextIndex = rows.length + 1;
      const previousRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
      // Saat penambahan baris barang nama barang mengikuti history yang diisi 1 item diatasnya
      setRows((prev) => [...prev, createEmptyRow(nextIndex, previousRow)]);
    }
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length > 1) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleRowChange = (id: string, field: keyof PalletRowInput, value: string | number) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        if (field === 'boxAwal') updated.batchAwal = String(value);
        if (field === 'boxAkhir') updated.batchAkhir = String(value);
        if (field === 'batchAwal') updated.boxAwal = String(value);
        if (field === 'batchAkhir') updated.boxAkhir = String(value);
        return updated;
      })
    );

    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleSelectMasterItem = (rowId: string, item: MasterItem) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        return {
          ...row,
          namaBarang: item.namaBarang,
          kodeItem: item.kodeItem,
          unit: item.satuan || 'Box',
          qtyPallet: item.defaultQty || row.qtyPallet
        };
      })
    );
    setActiveDropdownRowId(null);
  };

  const handleFillSample = () => {
    setLokasiBin('5A.1');
    const sampleItems = masterItems.slice(0, 3);
    const newRows: PalletRowInput[] = sampleItems.map((item, idx) => ({
      id: `row-sample-${idx}-${Date.now()}`,
      nomorPallet: `PLT-0${idx + 1}`,
      kodeItem: item.kodeItem,
      namaBarang: item.namaBarang,
      qtyPallet: item.defaultQty || 50,
      unit: item.satuan || 'Box',
      noBatch: `B26010${idx + 1}`,
      boxAwal: `001`,
      boxAkhir: `050`,
      batchAwal: `001`,
      batchAkhir: `050`,
      keterangan: 'Pemeriksaan inbound OK'
    }));
    setRows(newRows);
    setErrors({});
  };

  const handleReset = () => {
    setRows([createEmptyRow(1)]);
    setLokasiBin('5A.1');
    setErrors({});
  };

  const validateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!lokasiBin.trim()) {
      newErrors['lokasiBin'] = 'Lokasi Bin wajib diisi (contoh: 5A.1)';
    }

    rows.forEach((row, idx) => {
      const boxAwalVal = (row.boxAwal || row.batchAwal || '').trim();
      const boxAkhirVal = (row.boxAkhir || row.batchAkhir || '').trim();

      if (!row.nomorPallet.trim()) {
        newErrors[row.id] = `Baris #${idx + 1}: Nomor Pallet wajib diisi`;
      } else if (!row.namaBarang.trim()) {
        newErrors[row.id] = `Baris #${idx + 1}: Nama Barang wajib diisi`;
      } else if (!row.noBatch?.trim()) {
        newErrors[row.id] = `Baris #${idx + 1}: No. Batch wajib diisi`;
      } else if (!row.qtyPallet || Number(row.qtyPallet) <= 0) {
        newErrors[row.id] = `Baris #${idx + 1}: Qty harus lebih dari 0`;
      } else if (!boxAwalVal || !boxAkhirVal) {
        newErrors[row.id] = `Baris #${idx + 1}: No. Box Awal & No. Box Akhir wajib diisi`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit(rows, lokasiBin.trim().toUpperCase());
  };

  // Build the QR Scan URL for the bin
  const binScanUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(
          lokasiBin || '5A.1'
        )}`
      : `?bin=${lokasiBin || '5A.1'}`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 md:p-7">
      {/* Header Form */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-xs">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Input Pallet & Registrasi Barcode Inbound
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Lokasi Bin diinput 1x di atas · Nomor Pallet diinput di setiap item barang (hingga 8 data)
              </p>
            </div>
          </div>
        </div>

        {/* Master Database & Sample Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenMasterDatabase}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-900 transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Master Barang ({masterItems.length})</span>
          </button>

          <button
            type="button"
            onClick={handleFillSample}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Isi Contoh Data</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <form onSubmit={validateAndSubmit} className="space-y-6 mt-5">
        {/* SECTION 1: LOKASI BIN GUDANG 5 (DIISI 1X SAJA) & LIVE QR CODE DENGAN LINK LIST MUATAN */}
        <div className="bg-slate-50/90 dark:bg-slate-800/40 p-4 md:p-5 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/80 pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                Lokasi Bin Gudang 5 (Diinput 1x Saja)
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Sisi Kiri: 8 Slot (5A.1–5A.8) · Sisi Kanan: 4 Slot (5B.1–5B.4)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Input Lokasi Bin & Quick Buttons (Left 8 slots, Right 4 slots) */}
            <div className="md:col-span-8 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Lokasi Bin Penyimpanan <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={lokasiBin}
                    onChange={(e) => setLokasiBin(e.target.value.toUpperCase())}
                    placeholder="Contoh: 5A.1, 5A.2, 5B.1"
                    className={`max-w-xs w-full text-base font-mono font-extrabold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 border rounded-lg px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors['lokasiBin']
                        ? 'border-red-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  <span className="text-xs text-slate-500 font-medium">
                    (Berlaku untuk seluruh muatan barang di bawah)
                  </span>
                </div>
              </div>

              {/* Quick Select Buttons grouped by Left (5A) and Right (5B) */}
              <div className="space-y-2 pt-1">
                {/* Sisi Kiri (5A) - 8 Slot */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded">
                    Kiri (5A - 8 Slot):
                  </span>
                  {GUDANG5_SLOTS_A.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLokasiBin(code)}
                      className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                        lokasiBin === code
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>

                {/* Sisi Kanan (5B) - 4 Slot */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Kanan (5B - 4 Slot):
                  </span>
                  {GUDANG5_SLOTS_B.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLokasiBin(code)}
                      className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                        lokasiBin === code
                          ? 'bg-slate-900 text-white font-bold shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* LIVE QR CODE FOR BIN GUDANG (ENCODES LINK TO SHOW LIST DATA) */}
            <div className="md:col-span-4 flex flex-col items-center justify-center p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 gap-2">
              <div className="text-center">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1 uppercase tracking-wider">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" /> QR Code Bin Gudang
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Scan kamera HP untuk buka list muatan
                </div>
              </div>

              <div
                onClick={() => onOpenBinDetail(lokasiBin || '5A.1')}
                className="cursor-pointer group flex flex-col items-center hover:opacity-95 transition-opacity"
                title={`Klik untuk lihat list data muatan di Bin ${lokasiBin || '5A.1'}`}
              >
                <QrCodeRenderer
                  value={binScanUrl}
                  size={84}
                  showLabel={true}
                  className="border border-slate-200 dark:border-slate-700 shadow-none p-1.5"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenBinDetail(lokasiBin || '5A.1');
                  }}
                  className="mt-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  Lihat List Data di Bin Ini →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: DAFTAR BARANG DALAM PALLET (1 - 8 DATA) - NOMOR PALLET DI SETIAP ITEM */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-600" />
                Data Muatan Barang (Nomor Pallet di Setiap Item)
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {rows.length} dari maks {MAX_ROWS} data
            </span>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const hasError = !!errors[row.id];
              const boxCalc = calculateBatchBoxCount(
                row.boxAwal || row.batchAwal || '',
                row.boxAkhir || row.batchAkhir || ''
              );

              return (
                <div
                  key={row.id}
                  className={`p-4 rounded-xl border transition-all ${
                    hasError
                      ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* Row Header */}
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-bold font-mono flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Item #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Input Fields Grid: NOMOR PALLET DI SETIAP ITEM */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                    {/* 1. NOMOR PALLET DI SETIAP ITEM */}
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                        No Pallet <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={row.nomorPallet}
                        onChange={(e) =>
                          handleRowChange(row.id, 'nomorPallet', e.target.value.toUpperCase())
                        }
                        placeholder="PLT-01"
                        className="w-full text-sm font-mono font-bold bg-amber-50/60 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="text-[10px] text-slate-400 mt-1">
                        Fisik pallet item ini
                      </div>
                    </div>

                    {/* 2. NAMA BARANG WITH KODE ITEM DISPLAYED DIRECTLY BELOW */}
                    <div className="lg:col-span-3 relative">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nama Barang <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={row.namaBarang}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleRowChange(row.id, 'namaBarang', val);
                            const matched = masterItems.find(
                              (m) => m.namaBarang.toLowerCase() === val.toLowerCase()
                            );
                            if (matched) {
                              handleRowChange(row.id, 'kodeItem', matched.kodeItem);
                              handleRowChange(row.id, 'unit', matched.satuan || 'Box');
                              if (matched.defaultQty) {
                                handleRowChange(row.id, 'qtyPallet', matched.defaultQty);
                              }
                            }
                          }}
                          onFocus={() => setActiveDropdownRowId(row.id)}
                          placeholder="Pilih atau ketik nama barang..."
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        {/* Autocomplete Dropdown from Master Items */}
                        {activeDropdownRowId === row.id && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl text-xs">
                            <div className="p-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-500 flex justify-between">
                              <span>Pilih Dari Master Barang ({masterItems.length})</span>
                              <button
                                type="button"
                                onClick={() => setActiveDropdownRowId(null)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                Tutup
                              </button>
                            </div>
                            {masterItems
                              .filter(
                                (m) =>
                                  m.namaBarang
                                    .toLowerCase()
                                    .includes(row.namaBarang.toLowerCase()) ||
                                  m.kodeItem.toLowerCase().includes(row.namaBarang.toLowerCase())
                              )
                              .slice(0, 8)
                              .map((m) => (
                                <div
                                  key={m.id}
                                  onClick={() => handleSelectMasterItem(row.id, m)}
                                  className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0"
                                >
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {m.namaBarang}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center justify-between">
                                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                                      Kode: {m.kodeItem}
                                    </span>
                                    <span>Std: {m.defaultQty} {m.satuan || 'Box'}</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* MANDATORY REQUIREMENT: KODE ITEM TERTAMPIL DI BAGIAN BAWAH SAAT INPUT NAMA BARANG */}
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500 text-[11px] font-medium">Kode Item:</span>
                        <input
                          type="text"
                          value={row.kodeItem}
                          onChange={(e) =>
                            handleRowChange(row.id, 'kodeItem', e.target.value.toUpperCase())
                          }
                          placeholder="Kode Item"
                          className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded px-2 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {!row.kodeItem && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                            (Belum ada kode)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 3. QTY & SATUAN (DEFAULT 'BOX') */}
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Qty / Pallet <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={row.qtyPallet}
                          onChange={(e) => handleRowChange(row.id, 'qtyPallet', e.target.value)}
                          placeholder="100"
                          className="w-full text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={row.unit}
                          onChange={(e) => handleRowChange(row.id, 'unit', e.target.value)}
                          className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
                        >
                          {COMMON_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Default: Box
                      </div>
                    </div>

                    {/* 4. NO. BATCH (KOLOM BARU) */}
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        No. Batch <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={row.noBatch || ''}
                        onChange={(e) =>
                          handleRowChange(row.id, 'noBatch', e.target.value.toUpperCase())
                        }
                        placeholder="B260101"
                        className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="text-[10px] text-slate-400 mt-1">
                        Kode nomor batch
                      </div>
                    </div>

                    {/* 5. NO. BOX AWAL & NO. BOX AKHIR */}
                    <div className="lg:col-span-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            No. Box Awal <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={row.boxAwal || row.batchAwal || ''}
                            onChange={(e) =>
                              handleRowChange(row.id, 'boxAwal', e.target.value.toUpperCase())
                            }
                            placeholder="001"
                            className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            No. Box Akhir <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={row.boxAkhir || row.batchAkhir || ''}
                            onChange={(e) =>
                              handleRowChange(row.id, 'boxAkhir', e.target.value.toUpperCase())
                            }
                            placeholder="050"
                            className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Rentang urutan box
                      </div>
                    </div>
                  </div>

                  {/* Petunjuk Total Box Otomatis dari Rentang No. Box */}
                  {boxCalc && (
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {boxCalc.isValid ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2 text-emerald-800 dark:text-emerald-300">
                            <span className="font-bold flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              Petunjuk Rentang Box:
                            </span>
                            <span className="font-extrabold font-mono text-xs sm:text-sm bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                              {boxCalc.totalBox} Box
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              (No. #{boxCalc.startNum} s/d #{boxCalc.endNum})
                            </span>
                          </div>

                          {String(row.qtyPallet) !== String(boxCalc.totalBox) && (
                            <button
                              type="button"
                              onClick={() => handleRowChange(row.id, 'qtyPallet', boxCalc.totalBox)}
                              className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1 rounded border border-blue-200 dark:border-blue-800 transition-colors flex items-center gap-1"
                              title="Terapkan hasil hitungan box ke Qty / Pallet"
                            >
                              <span>← Terapkan ke Qty ({boxCalc.totalBox} Box)</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium text-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{boxCalc.message}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {hasError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors[row.id]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM SECTION: TAMBAH BARIS & SUBMIT (NOMOR PALLET TIDAK LAGI DI BAWAH) */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 gap-3">
          <button
            type="button"
            onClick={handleAddRow}
            disabled={rows.length >= MAX_ROWS}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              rows.length >= MAX_ROWS
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Baris Barang ({rows.length}/{MAX_ROWS})</span>
          </button>

          <button
            type="submit"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all"
          >
            <Barcode className="w-4 h-4" />
            <span>Submit {rows.length} Pallet & Generate Barcode Code 128</span>
          </button>
        </div>
      </form>
    </div>
  );
};
