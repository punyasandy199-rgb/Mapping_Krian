import React, { useState, useEffect, useMemo } from 'react';
import {
  PalletRowInput,
  PalletQcStatus,
  PALLET_QC_STATUSES,
  MasterItem,
  MasterWarehouse,
  COMMON_UNITS,
  getWarehouseRackSlots,
  deriveAsalPacking
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
  AlertCircle,
  ChevronDown,
  MessageSquareWarning
} from 'lucide-react';

interface PalletInputFormProps {
  masterItems: MasterItem[];
  activeWarehouse?: MasterWarehouse | null;
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
  statusQc: 'OK', // Default status pallet selalu 'OK'
  kodeItem: inheritFrom?.kodeItem || '',
  namaBarang: inheritFrom?.namaBarang || '', // saat penambahan baris mengikuti history 1 item diatasnya
  qtyPallet: '',
  unit: inheritFrom?.unit || 'Box', // default satuan ke 'Box'
  noBatch: inheritFrom?.noBatch || '', // mewarisi batch diatasnya jika ada
  boxAwal: '', // No. Box Awal kosong
  boxAkhir: '', // No. Box Akhir kosong
  batchAwal: '',
  batchAkhir: '',
  extraBatches: [],
  keterangan: ''
});

function computeCombinedBoxesFromRow(row: PalletRowInput): number | null {
  const firstCalc = calculateBatchBoxCount(
    row.boxAwal || row.batchAwal || '',
    row.boxAkhir || row.batchAkhir || ''
  );
  const extraCalcs = (row.extraBatches || []).map((eb) =>
    calculateBatchBoxCount(eb.boxAwal, eb.boxAkhir)
  );
  const allCalcs = [firstCalc, ...extraCalcs];
  if (allCalcs.some((c) => c && !c.isValid)) {
    return null;
  }
  const total = allCalcs.reduce((sum, c) => sum + (c && c.isValid ? c.totalBox : 0), 0);
  return total > 0 ? total : null;
}

export const PalletInputForm: React.FC<PalletInputFormProps> = ({
  masterItems,
  activeWarehouse,
  onOpenMasterDatabase,
  onOpenBinDetail,
  onSubmit
}) => {
  const rackConfig = useMemo(() => getWarehouseRackSlots(activeWarehouse), [activeWarehouse]);
  const warehouseTitle = activeWarehouse?.namaGudang || 'Gudang 05';
  const defaultBinCode = `${rackConfig.leftPrefix}.1`;

  // Lokasi Bin diisi 1x saja di bagian atas (sesuai gudang aktif, mis. 5A.1 / 6A.1)
  const [lokasiBin, setLokasiBin] = useState(defaultBinCode);

  useEffect(() => {
    setLokasiBin(`${rackConfig.leftPrefix}.1`);
  }, [rackConfig.leftPrefix]);

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

        // Jika mengubah rentang No. Box, otomatis sinkronkan qtyPallet ke jumlah box terinput
        if (
          field === 'boxAwal' ||
          field === 'boxAkhir' ||
          field === 'batchAwal' ||
          field === 'batchAkhir'
        ) {
          const autoBoxes = computeCombinedBoxesFromRow(updated);
          if (autoBoxes !== null) {
            updated.qtyPallet = autoBoxes;
          }
        }
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

  const handleAddExtraBatch = (rowId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const currentExtra = row.extraBatches || [];
        return {
          ...row,
          extraBatches: [...currentExtra, { noBatch: '', boxAwal: '', boxAkhir: '' }]
        };
      })
    );
  };

  const handleRemoveExtraBatch = (rowId: string, batchIndex: number) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const currentExtra = row.extraBatches || [];
        const updated: PalletRowInput = {
          ...row,
          extraBatches: currentExtra.filter((_, idx) => idx !== batchIndex)
        };
        const autoBoxes = computeCombinedBoxesFromRow(updated);
        if (autoBoxes !== null) {
          updated.qtyPallet = autoBoxes;
        }
        return updated;
      })
    );
  };

  const handleExtraBatchChange = (
    rowId: string,
    batchIndex: number,
    field: 'noBatch' | 'boxAwal' | 'boxAkhir',
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const currentExtra = row.extraBatches || [];
        const updatedExtra = currentExtra.map((eb, idx) =>
          idx === batchIndex ? { ...eb, [field]: value } : eb
        );
        const updated: PalletRowInput = { ...row, extraBatches: updatedExtra };
        if (field === 'boxAwal' || field === 'boxAkhir') {
          const autoBoxes = computeCombinedBoxesFromRow(updated);
          if (autoBoxes !== null) {
            updated.qtyPallet = autoBoxes;
          }
        }
        return updated;
      })
    );
    if (errors[rowId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
  };

  const handleSelectMasterItem = (rowId: string, item: MasterItem) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const calculatedBoxes = computeCombinedBoxesFromRow(row);
        return {
          ...row,
          namaBarang: item.namaBarang,
          kodeItem: item.kodeItem,
          unit: item.satuan || 'Box',
          // Jangan timpa qtyPallet dengan std 15; gunakan box terhitung bila ada atau biarkan sesuai input user
          qtyPallet: calculatedBoxes ?? row.qtyPallet
        };
      })
    );
    setActiveDropdownRowId(null);
  };

  const handleFillSample = () => {
    setLokasiBin(defaultBinCode);
    const sampleItems = masterItems.slice(0, 3);
    const newRows: PalletRowInput[] = sampleItems.map((item, idx) => ({
      id: `row-sample-${idx}-${Date.now()}`,
      nomorPallet: `PLT-0${idx + 1}`,
      statusQc: 'OK',
      kodeItem: item.kodeItem,
      namaBarang: item.namaBarang,
      qtyPallet: 50,
      unit: item.satuan || 'Box',
      noBatch: idx === 0 ? 'A260101' : `B26010${idx + 1}`,
      boxAwal: `001`,
      boxAkhir: `050`,
      batchAwal: `001`,
      batchAkhir: `050`,
      extraBatches: [],
      keterangan: ''
    }));
    setRows(newRows);
    setErrors({});
  };

  const handleReset = () => {
    setRows([createEmptyRow(1)]);
    setLokasiBin(defaultBinCode);
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
      } else if (row.extraBatches && row.extraBatches.length > 0) {
        for (let bIdx = 0; bIdx < row.extraBatches.length; bIdx++) {
          const eb = row.extraBatches[bIdx];
          if (!eb.noBatch.trim()) {
            newErrors[row.id] = `Baris #${idx + 1} Batch #${bIdx + 2}: No. Batch wajib diisi`;
            break;
          }
          if (!eb.boxAwal.trim() || !eb.boxAkhir.trim()) {
            newErrors[row.id] = `Baris #${idx + 1} Batch #${bIdx + 2}: No. Box Awal & Akhir wajib diisi`;
            break;
          }
        }
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
          lokasiBin || defaultBinCode
        )}`
      : `?bin=${lokasiBin || defaultBinCode}`;

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
        {/* SECTION 1: LOKASI BIN GUDANG AKTIF (DIISI 1X SAJA) & LIVE QR CODE */}
        <div className="bg-slate-50/90 dark:bg-slate-800/40 p-4 md:p-5 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-600" />
                Lokasi Bin {warehouseTitle} (Diinput 1x Saja)
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Sisi Kiri: {rackConfig.leftCount} Slot ({rackConfig.leftPrefix}.1–{rackConfig.leftPrefix}.{rackConfig.leftCount}) &middot; Sisi Kanan: {rackConfig.rightCount} Slot ({rackConfig.primaryCount} Utama: {rackConfig.rightPrefix}.1–{rackConfig.rightPrefix}.{rackConfig.primaryCount})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Input Lokasi Bin & Quick Select */}
            <div className="md:col-span-8 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Lokasi Bin Penyimpanan <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    required
                    value={lokasiBin}
                    onChange={(e) => setLokasiBin(e.target.value.toUpperCase())}
                    placeholder={`Contoh: ${rackConfig.leftPrefix}.1, ${rackConfig.rightPrefix}.1`}
                    className={`max-w-xs w-full text-base font-mono font-extrabold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 border rounded-lg px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors['lokasiBin']
                        ? 'border-red-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  <span className="text-xs text-slate-500 font-medium">
                    (Berlaku untuk seluruh muatan di rak bin ini)
                  </span>
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="space-y-2 pt-1">
                {/* Sisi Kiri */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded">
                    Kiri ({rackConfig.leftPrefix}.1–{rackConfig.leftPrefix}.{rackConfig.leftCount}):
                  </span>
                  {rackConfig.slotsA.slice(0, 8).map((code) => (
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
                  <select
                    value={lokasiBin.startsWith(`${rackConfig.leftPrefix}.`) ? lokasiBin : ''}
                    onChange={(e) => {
                      if (e.target.value) setLokasiBin(e.target.value);
                    }}
                    className="text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-slate-700 dark:text-slate-300 focus:outline-none"
                  >
                    <option value="">Pilih {rackConfig.leftPrefix} (1-{rackConfig.leftCount})...</option>
                    {rackConfig.slotsA.map((code) => (
                      <option key={code} value={code}>
                        Bin {code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sisi Kanan */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                    Kanan ({rackConfig.rightPrefix} - {rackConfig.primaryCount} Slot Utama):
                  </span>
                  {rackConfig.slotsBPrimary.map((code) => (
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
                  <select
                    value={lokasiBin.startsWith(`${rackConfig.rightPrefix}.`) ? lokasiBin : ''}
                    onChange={(e) => {
                      if (e.target.value) setLokasiBin(e.target.value);
                    }}
                    className="text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-slate-700 dark:text-slate-300 focus:outline-none"
                  >
                    <option value="">Pilih {rackConfig.rightPrefix} (1-{rackConfig.rightCount})...</option>
                    {rackConfig.slotsB.map((code) => (
                      <option key={code} value={code}>
                        Bin {code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* LIVE QR CODE FOR BIN GUDANG */}
            <div className="md:col-span-4 flex flex-col items-center justify-center p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 gap-2">
              <div className="text-center">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1 uppercase tracking-wider">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" /> QR Code Bin {warehouseTitle}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Scan kamera HP untuk buka list muatan bin ini
                </div>
              </div>

              <div
                onClick={() => onOpenBinDetail(lokasiBin || defaultBinCode)}
                className="cursor-pointer group flex flex-col items-center hover:opacity-95 transition-opacity"
                title={`Klik untuk lihat list data muatan di Bin ${lokasiBin || defaultBinCode}`}
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
                    onOpenBinDetail(lokasiBin || defaultBinCode);
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
              const extraBatches = row.extraBatches || [];
              const boxCalc = calculateBatchBoxCount(
                row.boxAwal || row.batchAwal || '',
                row.boxAkhir || row.batchAkhir || ''
              );
              const extraCalcs = extraBatches.map((eb) =>
                calculateBatchBoxCount(eb.boxAwal, eb.boxAkhir)
              );
              const allCalcs = [boxCalc, ...extraCalcs];
              const hasAnyInvalidCalc = allCalcs.some((c) => c && !c.isValid);
              const firstInvalidMsg = allCalcs.find((c) => c && !c.isValid)?.message;
              const validBatchCounts = allCalcs
                .map((c, bIdx) => (c && c.isValid ? { batchNo: bIdx + 1, count: c.totalBox, calc: c } : null))
                .filter((v): v is NonNullable<typeof v> => v !== null);
              const combinedTotalBoxes = validBatchCounts.reduce((sum, v) => sum + v.count, 0);

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
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-bold font-mono flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Item #{index + 1}
                      </span>
                      {extraBatches.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                          {extraBatches.length + 1} Batch dalam 1 Pallet
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddExtraBatch(row.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold transition-colors cursor-pointer"
                        title="Tambahkan batch lain (beserta no box awal & akhir) di dalam 1 pallet yang sama"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Batch di Pallet Ini</span>
                      </button>

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
                    {/* 1. NOMOR PALLET & STATUS PALLET (OK / BO / HOLD) */}
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
                      <div className="mt-1.5 flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-500 mr-0.5 shrink-0">
                          Status:
                        </span>
                        <div className="grid grid-cols-3 gap-1 flex-1">
                          {PALLET_QC_STATUSES.map((st: PalletQcStatus) => {
                            const activeStatus = row.statusQc || 'OK';
                            const isSelected = activeStatus === st;
                            const activeCls =
                              st === 'OK'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : st === 'BO'
                                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                                : 'bg-rose-600 text-white border-rose-600 shadow-xs';
                            const idleCls =
                              'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800';
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleRowChange(row.id, 'statusQc', st)}
                                className={`px-1 py-0.5 rounded border text-[10px] font-extrabold transition-colors cursor-pointer ${
                                  isSelected ? activeCls : idleCls
                                }`}
                                title={`Set status pallet menjadi ${st}`}
                              >
                                {st}
                              </button>
                            );
                          })}
                        </div>
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
                            setActiveDropdownRowId(row.id);
                            const matched = masterItems.find(
                              (m) => m.namaBarang.toLowerCase() === val.toLowerCase()
                            );
                            if (matched) {
                              handleRowChange(row.id, 'kodeItem', matched.kodeItem);
                              handleRowChange(row.id, 'unit', matched.satuan || 'Box');
                            }
                          }}
                          onClick={() => {
                            // User requirement: tap to show, tap again to hide
                            setActiveDropdownRowId((prev) => (prev === row.id ? null : row.id));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setActiveDropdownRowId(null);
                            }
                          }}
                          placeholder="Pilih atau ketik nama barang..."
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        {/* Chevron button to toggle dropdown on click/tap */}
                        <button
                          type="button"
                          onClick={() => setActiveDropdownRowId((prev) => (prev === row.id ? null : row.id))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          title="Buka / tutup daftar master barang"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-200 ${
                              activeDropdownRowId === row.id ? 'rotate-180 text-blue-600' : ''
                            }`}
                          />
                        </button>

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
                                    <span>{m.satuan || 'Box'} &middot; {m.beratPerBoxKg ?? 30} Kg/Box</span>
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

                    {/* 3. QTY & SATUAN (BOX TERINPUT) */}
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
                          placeholder="Qty Box"
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
                        Sesuai box terinput
                      </div>
                    </div>

                    {/* 4. NO. BATCH 1 & LIVE ASAL PACKING */}
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {extraBatches.length > 0 ? 'No. Batch #1' : 'No. Batch'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={row.noBatch || ''}
                        onChange={(e) =>
                          handleRowChange(row.id, 'noBatch', e.target.value.toUpperCase())
                        }
                        placeholder="A260101 / B260101"
                        className="w-full text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {(() => {
                        const detectedPacking = deriveAsalPacking(row.noBatch);
                        if (detectedPacking === 'Packing 1') {
                          return (
                            <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold">
                              Asal: Packing 1
                            </div>
                          );
                        }
                        if (detectedPacking === 'Packing 2') {
                          return (
                            <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-bold">
                              Asal: Packing 2
                            </div>
                          );
                        }
                        return (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Awali A (Packing 1) / B (Packing 2)
                          </div>
                        );
                      })()}
                    </div>

                    {/* 5. NO. BOX AWAL & NO. BOX AKHIR (BATCH 1) */}
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

                  {/* BATCH TAMBAHAN (BATCH #2, #3, DST) DI DALAM 1 PALLET YANG SAMA */}
                  {extraBatches.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-blue-200 dark:border-blue-900/60 space-y-2.5">
                      {extraBatches.map((eb, bIdx) => {
                        const ebCalc = extraCalcs[bIdx];
                        return (
                          <div
                            key={bIdx}
                            className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                          >
                            <div className="sm:col-span-2 flex items-center gap-2 self-center">
                              <span className="px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-bold font-mono">
                                Batch #{bIdx + 2}
                              </span>
                              {ebCalc?.isValid && (
                                <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                                  ({ebCalc.totalBox} Box)
                                </span>
                              )}
                            </div>

                            <div className="sm:col-span-3">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                  No. Batch #{bIdx + 2} <span className="text-red-500">*</span>
                                </label>
                                {deriveAsalPacking(eb.noBatch) !== '-' && (
                                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                                    {deriveAsalPacking(eb.noBatch)}
                                  </span>
                                )}
                              </div>
                              <input
                                type="text"
                                required
                                value={eb.noBatch}
                                onChange={(e) =>
                                  handleExtraBatchChange(
                                    row.id,
                                    bIdx,
                                    'noBatch',
                                    e.target.value.toUpperCase()
                                  )
                                }
                                placeholder="B260102"
                                className="w-full text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                No. Box Awal <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={eb.boxAwal}
                                onChange={(e) =>
                                  handleExtraBatchChange(
                                    row.id,
                                    bIdx,
                                    'boxAwal',
                                    e.target.value.toUpperCase()
                                  )
                                }
                                placeholder="051"
                                className="w-full text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                No. Box Akhir <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={eb.boxAkhir}
                                onChange={(e) =>
                                  handleExtraBatchChange(
                                    row.id,
                                    bIdx,
                                    'boxAkhir',
                                    e.target.value.toUpperCase()
                                  )
                                }
                                placeholder="070"
                                className="w-full text-sm font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveExtraBatch(row.id, bIdx)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                                title={`Hapus Batch #${bIdx + 2}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Petunjuk Total Box Otomatis dari Rentang No. Box */}
                  {(validBatchCounts.length > 0 || hasAnyInvalidCalc) && (
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {!hasAnyInvalidCalc && validBatchCounts.length > 0 ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2 text-emerald-800 dark:text-emerald-300">
                            <span className="font-bold flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              Petunjuk Rentang Box:
                            </span>
                            <span className="font-extrabold font-mono text-xs sm:text-sm bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                              {combinedTotalBoxes} Box
                            </span>
                            {validBatchCounts.length === 1 ? (
                              <span className="text-[11px] text-slate-500 font-mono">
                                (No. #{validBatchCounts[0].calc.startNum} s/d #{validBatchCounts[0].calc.endNum})
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-mono">
                                (
                                {validBatchCounts
                                  .map((v) => `Batch #${v.batchNo}: ${v.count} Box`)
                                  .join(' + ')}
                                )
                              </span>
                            )}
                          </div>

                          {String(row.qtyPallet) !== String(combinedTotalBoxes) && (
                            <button
                              type="button"
                              onClick={() => handleRowChange(row.id, 'qtyPallet', combinedTotalBoxes)}
                              className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1 rounded border border-blue-200 dark:border-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Terapkan hasil hitungan box ke Qty / Pallet"
                            >
                              <span>← Terapkan ke Qty ({combinedTotalBoxes} Box)</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium text-xs">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{firstInvalidMsg}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Keterangan / Catatan per Pallet (Opsional - masuk daftar Tasklist Pallet Problem bila diisi) */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                      <MessageSquareWarning className="w-3.5 h-3.5 text-amber-500" />
                      <span>Keterangan / Catatan (Opsional):</span>
                    </label>
                    <input
                      type="text"
                      value={row.keterangan || ''}
                      onChange={(e) => handleRowChange(row.id, 'keterangan', e.target.value)}
                      placeholder="Isi jika ada selisih box, box rusak, perlu cek ulang QC/operator..."
                      className="flex-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

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
