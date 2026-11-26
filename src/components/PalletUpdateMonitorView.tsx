import React, { useState, useMemo } from 'react';
import {
  PalletRecord,
  PalletBatchEntry,
  PalletQcStatus,
  MasterItem,
  MasterWarehouse,
  SuratJalanRecord,
  COMMON_UNITS,
  CANONICAL_WAREHOUSE_LOCATIONS,
  resolvePalletWarehouseLocation,
  resolvePalletQcStatus,
  deriveAsalPacking
} from '../types/warehouse';
import { calculateBatchBoxCount, getPalletBatches } from '../utils/batchCalculator';
import { exportPalletsToCsv } from '../utils/exporter';
import {
  CalendarClock,
  Calendar,
  Search,
  MapPin,
  FileSpreadsheet,
  Clock,
  RefreshCw,
  ArrowUpDown,
  PackageCheck,
  FileText,
  Truck,
  Pencil,
  Plus,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface PalletUpdateMonitorViewProps {
  records: PalletRecord[];
  suratJalanHistory?: SuratJalanRecord[];
  activeWarehouse?: MasterWarehouse | null;
  masterItems?: MasterItem[];
  masterWarehouses?: MasterWarehouse[];
  onUpdateRecord?: (updated: PalletRecord) => Promise<void> | void;
  onOpenHistory?: () => void;
}

function toLocalDateKey(input?: string | Date | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateReadable(dateKey: string): string {
  if (!dateKey) return '-';
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function formatShortDate(dateKey: string): string {
  if (!dateKey) return '-';
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short'
  });
}

function formatTimeOnly(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatFullDateTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getEffectiveUpdateIso(record: PalletRecord): string | null {
  if (record.updatedAt) return record.updatedAt;
  if (record.tanggalPengambilan) return record.tanggalPengambilan;
  return null;
}

export const PalletUpdateMonitorView: React.FC<PalletUpdateMonitorViewProps> = ({
  records,
  suratJalanHistory = [],
  activeWarehouse,
  masterItems = [],
  masterWarehouses = [],
  onUpdateRecord
}) => {
  const todayKey = useMemo(() => toLocalDateKey(new Date()), []);
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateKey(d);
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [activityMode, setActivityMode] = useState<'updated' | 'created' | 'all'>('updated');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyCurrentWarehouse, setOnlyCurrentWarehouse] = useState(false);

  // State modal Update Data Pallet langsung dari halaman Monitoring Update
  const [editingRecord, setEditingRecord] = useState<PalletRecord | null>(null);
  const [editBatches, setEditBatches] = useState<PalletBatchEntry[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleOpenEdit = (record: PalletRecord) => {
    const existingBatches = getPalletBatches(record);
    const initialBatches: PalletBatchEntry[] =
      existingBatches.length > 0
        ? existingBatches.map((b) => ({
            noBatch: b.noBatch || '',
            boxAwal: b.boxAwal || '',
            boxAkhir: b.boxAkhir || '',
            qtyBox: b.qtyBox
          }))
        : [
            {
              noBatch: record.noBatch || '',
              boxAwal: record.boxAwal || '',
              boxAkhir: record.boxAkhir || ''
            }
          ];
    const computedBoxSum = initialBatches.reduce((sum, b) => {
      const c = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
      return sum + (c?.isValid ? c.totalBox : 0);
    }, 0);
    const resolvedWh = resolvePalletWarehouseLocation(record, masterWarehouses);
    setEditingRecord({
      ...record,
      qtyPallet: computedBoxSum > 0 ? computedBoxSum : record.qtyPallet,
      statusQc: resolvePalletQcStatus(record),
      lokasiGudang: record.lokasiGudang || resolvedWh
    });
    setEditBatches(initialBatches);
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !onUpdateRecord) return;
    setEditError(null);

    const noPalletClean = (editingRecord.nomorPallet || '').trim().toUpperCase();
    const binClean = (editingRecord.lokasiBin || '').trim().toUpperCase();
    const namaClean = (editingRecord.namaBarang || '').trim();
    const kodeClean = (editingRecord.kodeItem || '').trim().toUpperCase();
    const qtyNum = Number(editingRecord.qtyPallet);

    if (!noPalletClean) {
      setEditError('Nomor Pallet wajib diisi.');
      return;
    }
    if (!binClean) {
      setEditError('Lokasi Bin wajib diisi.');
      return;
    }
    if (!namaClean) {
      setEditError('Nama Barang wajib diisi.');
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setEditError('Qty / Pallet harus lebih dari 0.');
      return;
    }
    if (editBatches.length === 0) {
      setEditError('Minimal harus ada 1 Batch pada pallet ini.');
      return;
    }

    const cleanedBatches: PalletBatchEntry[] = [];
    for (let i = 0; i < editBatches.length; i++) {
      const b = editBatches[i];
      const nb = (b.noBatch || '').trim().toUpperCase();
      const ba = (b.boxAwal || '').trim().toUpperCase();
      const bk = (b.boxAkhir || '').trim().toUpperCase();
      if (!nb) {
        setEditError(`Batch #${i + 1}: No. Batch wajib diisi.`);
        return;
      }
      if (!ba || !bk) {
        setEditError(`Batch #${i + 1}: No. Box Awal & No. Box Akhir wajib diisi.`);
        return;
      }
      const calc = calculateBatchBoxCount(ba, bk);
      cleanedBatches.push({
        noBatch: nb,
        boxAwal: ba,
        boxAkhir: bk,
        ...(calc?.isValid ? { qtyBox: calc.totalBox } : {})
      });
    }

    const combinedNoBatch = cleanedBatches.map((b) => b.noBatch).join(', ');
    const firstBatch = cleanedBatches[0];
    const originalRecord = records.find((r) => r.id === editingRecord.id);
    const binChanged =
      originalRecord && originalRecord.lokasiBin.toUpperCase() !== binClean;

    const resolvedGudang =
      (editingRecord.lokasiGudang || '').trim() ||
      resolvePalletWarehouseLocation(
        { lokasiBin: binClean, lokasiGudang: '' },
        masterWarehouses
      );

    const changedFields: string[] = [];
    if (originalRecord) {
      if ((originalRecord.nomorPallet || '').toUpperCase() !== noPalletClean) changedFields.push('No. Pallet');
      if (resolvePalletQcStatus(originalRecord) !== resolvePalletQcStatus(editingRecord)) changedFields.push('Status');
      if ((originalRecord.lokasiGudang || '') !== resolvedGudang) changedFields.push('Gudang');
      if ((originalRecord.lokasiBin || '').toUpperCase() !== binClean) changedFields.push('Bin');
      if ((originalRecord.namaBarang || '') !== namaClean || (originalRecord.kodeItem || '').toUpperCase() !== kodeClean) {
        changedFields.push('Barang');
      }
      if (Number(originalRecord.qtyPallet) !== qtyNum) changedFields.push('Qty');
      if (
        (originalRecord.noBatch || '').toUpperCase() !== combinedNoBatch.toUpperCase() ||
        (originalRecord.boxAwal || '').toUpperCase() !== firstBatch.boxAwal ||
        (originalRecord.boxAkhir || '').toUpperCase() !== firstBatch.boxAkhir
      ) {
        changedFields.push('Batch/Box');
      }
      if ((originalRecord.keterangan || '').trim() !== (editingRecord.keterangan?.trim() || '')) {
        changedFields.push('Keterangan');
      }
    }

    const updated: PalletRecord = {
      ...editingRecord,
      nomorPallet: noPalletClean,
      statusQc: resolvePalletQcStatus(editingRecord),
      lokasiBin: binClean,
      lokasiGudang: resolvedGudang,
      kodeItem: kodeClean,
      namaBarang: namaClean,
      qtyPallet: qtyNum,
      unit: editingRecord.unit || 'Box',
      noBatch: combinedNoBatch,
      boxAwal: firstBatch.boxAwal,
      boxAkhir: firstBatch.boxAkhir,
      batchAwal: firstBatch.boxAwal,
      batchAkhir: firstBatch.boxAkhir,
      batches: cleanedBatches,
      keterangan: editingRecord.keterangan?.trim() || '',
      updatedAt: new Date().toISOString(),
      lastUpdateAction:
        changedFields.length > 0
          ? `Update Monitoring (${changedFields.join(', ')})`
          : 'Update Data Pallet',
      ...(binChanged ? { binOrder: undefined } : {})
    };

    try {
      setIsSavingEdit(true);
      await onUpdateRecord(updated);
      setEditingRecord(null);
      setToastMessage(
        `Data Pallet ${updated.nomorPallet} (Bin ${updated.lokasiBin}) berhasil diupdate!`
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error('Gagal menyimpan update pallet:', err);
      setEditError('Gagal menyimpan perubahan ke database. Silakan coba lagi.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter opsional berdasarkan gudang aktif
  const scopedRecords = useMemo(() => {
    if (!onlyCurrentWarehouse || !activeWarehouse) return records;
    const left = (activeWarehouse.rackLeftPrefix || '').trim().toUpperCase();
    const right = (activeWarehouse.rackRightPrefix || '').trim().toUpperCase();
    return records.filter((r) => {
      const prefix = (r.lokasiBin || '').trim().toUpperCase().split('.')[0];
      return prefix === left || prefix === right;
    });
  }, [records, onlyCurrentWarehouse, activeWarehouse]);

  // Hitung tanggal-tanggal terbaru yang memiliki update pallet atau surat jalan agar cepat dipilih petugas
  const recentUpdateDates = useMemo(() => {
    const counts = new Map<string, number>();
    scopedRecords.forEach((r) => {
      const updIso = getEffectiveUpdateIso(r);
      if (!updIso) return;
      const key = toLocalDateKey(updIso);
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    suratJalanHistory.forEach((sj) => {
      const updIso = sj.updatedAt || sj.createdAt;
      if (!updIso) return;
      const key = toLocalDateKey(updIso);
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [scopedRecords, suratJalanHistory]);

  // Records yang diupdate vs diinput pada tanggal terpilih
  const datePartition = useMemo(() => {
    const updatedOnDate: PalletRecord[] = [];
    const createdOnDate: PalletRecord[] = [];
    const allOnDate: PalletRecord[] = [];
    const seenAll = new Set<string>();

    scopedRecords.forEach((r) => {
      const updIso = getEffectiveUpdateIso(r);
      const updKey = updIso ? toLocalDateKey(updIso) : '';
      const subKey = toLocalDateKey(r.submittedAt);

      const isUpdatedOnSelected = updKey === selectedDate;
      const isCreatedOnSelected = subKey === selectedDate;

      if (isUpdatedOnSelected) {
        updatedOnDate.push(r);
      }
      if (isCreatedOnSelected) {
        createdOnDate.push(r);
      }
      if (isUpdatedOnSelected || isCreatedOnSelected) {
        if (!seenAll.has(r.id)) {
          seenAll.add(r.id);
          allOnDate.push(r);
        }
      }
    });

    return { updatedOnDate, createdOnDate, allOnDate };
  }, [scopedRecords, selectedDate]);

  // Surat Jalan yang dibuat / diupdate pada tanggal terpilih
  const sjOnSelectedDate = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return suratJalanHistory
      .filter((sj) => {
        const effIso = sj.updatedAt || sj.createdAt;
        const dateKey = toLocalDateKey(effIso);
        if (dateKey !== selectedDate) return false;
        if (!q) return true;
        return (
          (sj.noSuratJalan || '').toLowerCase().includes(q) ||
          (sj.noPolisi || '').toLowerCase().includes(q) ||
          (sj.ruteTujuanKode || '').toLowerCase().includes(q) ||
          (sj.ruteTujuanNama || '').toLowerCase().includes(q) ||
          (sj.namaVendorArmada || '').toLowerCase().includes(q) ||
          (sj.namaDriver || '').toLowerCase().includes(q) ||
          (sj.noSpp || '').toLowerCase().includes(q) ||
          (sj.noPo || '').toLowerCase().includes(q) ||
          (sj.lastUpdateAction || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tB - tA;
      });
  }, [suratJalanHistory, selectedDate, searchTerm]);

  const modeRecords = useMemo(() => {
    const base =
      activityMode === 'updated'
        ? datePartition.updatedOnDate
        : activityMode === 'created'
        ? datePartition.createdOnDate
        : datePartition.allOnDate;

    const q = searchTerm.toLowerCase().trim();
    return base
      .filter((item) => {
        const st = item.status === 'OUT' ? 'OUT' : 'IN';
        if (statusFilter !== 'ALL' && st !== statusFilter) return false;
        if (!q) return true;
        return (
          (item.nomorPallet || '').toLowerCase().includes(q) ||
          (item.namaBarang || '').toLowerCase().includes(q) ||
          (item.kodeItem || '').toLowerCase().includes(q) ||
          (item.lokasiBin || '').toLowerCase().includes(q) ||
          (item.noBatch || '').toLowerCase().includes(q) ||
          (item.lastUpdateAction || '').toLowerCase().includes(q) ||
          (item.keterangan || '').toLowerCase().includes(q) ||
          (item.noSuratJalan || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const timeA = new Date(getEffectiveUpdateIso(a) || a.submittedAt).getTime();
        const timeB = new Date(getEffectiveUpdateIso(b) || b.submittedAt).getTime();
        return timeB - timeA;
      });
  }, [datePartition, activityMode, statusFilter, searchTerm]);

  // Statistik utama berdasar tanggal terpilih
  const kpiStats = useMemo(() => {
    const updatedList = datePartition.updatedOnDate;
    const totalBoxUpdated = updatedList.reduce(
      (sum, r) => sum + (Number(r.qtyPallet) || 0),
      0
    );
    const affectedBins = new Set(
      updatedList.map((r) => (r.lokasiBin || '').toUpperCase()).filter(Boolean)
    ).size;

    const statusChangeCount = updatedList.filter((r) => {
      const act = (r.lastUpdateAction || '').toLowerCase();
      return act.includes('outbound') || act.includes('kembalikan');
    }).length;
    const editCount = updatedList.length - statusChangeCount;

    return {
      updatedCount: updatedList.length,
      createdCount: datePartition.createdOnDate.length,
      totalBoxUpdated,
      affectedBins,
      editCount,
      statusChangeCount
    };
  }, [datePartition]);

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Date Filter & Quick Picks Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Monitoring Update Data Harian</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau seluruh data pallet maupun Surat Jalan yang mengalami perubahan, edit data, oper gudang, urutan Bin, maupun pengambilan pada tanggal yang dipilih.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="bg-transparent text-xs font-bold font-mono text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(todayKey)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                selectedDate === todayKey
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Hari Ini
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayKey)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                selectedDate === yesterdayKey
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Kemarin
            </button>

            {activeWarehouse && (
              <button
                type="button"
                onClick={() => setOnlyCurrentWarehouse(!onlyCurrentWarehouse)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                  onlyCurrentWarehouse
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {onlyCurrentWarehouse
                  ? `Hanya ${activeWarehouse.namaGudang}`
                  : 'Semua Gudang'}
              </button>
            )}
          </div>
        </div>

        {/* Riwayat Tanggal yang Ada Aktivitas Update */}
        {recentUpdateDates.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Tanggal dengan riwayat aktivitas:</span>
            {recentUpdateDates.map(([dateKey, count]) => (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                  selectedDate === dateKey
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                }`}
              >
                <span>{formatShortDate(dateKey)}</span>
                <span className="opacity-80">({count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-300 dark:border-blue-800/70 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Pallet Diupdate ({formatShortDate(selectedDate)})</span>
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {kpiStats.updatedCount}{' '}
            <span className="text-xs font-normal text-slate-500">Pallet</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">
            Total Box Terupdate
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {kpiStats.totalBoxUpdated.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-500">Box</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">
            Bin Terdampak Update
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {kpiStats.affectedBins}{' '}
            <span className="text-xs font-normal text-slate-500">Bin</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">
            Input Baru / Surat Jalan
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1">
            {kpiStats.createdCount}{' '}
            <span className="text-xs font-normal text-slate-500">Pallet</span>
            <span className="text-xs font-normal text-slate-400 mx-1.5">·</span>
            <span className="text-blue-600 dark:text-blue-400">{sjOnSelectedDate.length}</span>{' '}
            <span className="text-xs font-normal text-slate-500">SJ</span>
          </div>
        </div>
      </div>

      {/* Main Monitoring Table Card: Pallet */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {formatDateReadable(selectedDate)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
              <span>
                Menampilkan <strong>{modeRecords.length}</strong> pallet
              </span>
              <span aria-hidden="true">·</span>
              <span>Edit Data/Bin/SJ: {kpiStats.editCount}</span>
              <span aria-hidden="true">·</span>
              <span>Outbound/Status: {kpiStats.statusChangeCount}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Mode Selector */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActivityMode('updated')}
                className={`px-3 py-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activityMode === 'updated'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Diupdate ({datePartition.updatedOnDate.length})
              </button>
              <button
                type="button"
                onClick={() => setActivityMode('created')}
                className={`px-3 py-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activityMode === 'created'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Input Baru ({datePartition.createdOnDate.length})
              </button>
              <button
                type="button"
                onClick={() => setActivityMode('all')}
                className={`px-3 py-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activityMode === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Semua ({datePartition.allOnDate.length})
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari pallet, bin, SJ, aksi..."
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-56"
              />
            </div>

            {/* Status Filter */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-semibold">
              {(['ALL', 'IN', 'OUT'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-2 transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-slate-800 dark:bg-slate-700 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {st === 'ALL' ? 'Semua' : st}
                </button>
              ))}
            </div>

            {/* Export CSV */}
            <button
              type="button"
              disabled={modeRecords.length === 0}
              onClick={() =>
                exportPalletsToCsv(modeRecords, `monitoring_update_pallet_${selectedDate}`)
              }
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Table / Empty State */}
        {modeRecords.length === 0 ? (
          <div className="p-12 text-center">
            <PackageCheck className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-80" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Belum Ada Pallet yang{' '}
              {activityMode === 'updated'
                ? 'Diupdate'
                : activityMode === 'created'
                ? 'Diinput Baru'
                : 'Beraktivitas'}{' '}
              pada {formatDateReadable(selectedDate)}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Setiap perubahan data pallet (edit jumlah box, status QC, pindah Bin, oper gudang, perubahan batch, urutan Bin, outbound, Surat Jalan, atau penyelesaian Tasklist Pallet Problem) akan tercatat otomatis di sini beserta tanggal dan jam updatenya.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-3 text-center w-10">No</th>
                  <th className="py-3 px-3">Waktu Update</th>
                  <th className="py-3 px-3">Aktivitas / Aksi</th>
                  <th className="py-3 px-3">No. Pallet &amp; Status</th>
                  <th className="py-3 px-3">Lokasi Bin</th>
                  <th className="py-3 px-3">Barang</th>
                  <th className="py-3 px-3 text-right">Qty Box</th>
                  <th className="py-3 px-3">Batch &amp; No. Box</th>
                  <th className="py-3 px-3">Keterangan</th>
                  {onUpdateRecord && <th className="py-3 px-3 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {modeRecords.map((item, idx) => {
                  const batches = getPalletBatches(item);
                  const isOut = item.status === 'OUT';
                  const updIso = getEffectiveUpdateIso(item);
                  const updDateKey = updIso ? toLocalDateKey(updIso) : '';
                  const showUpdateTime = updIso && updDateKey === selectedDate;
                  const actionLabel = showUpdateTime
                    ? item.lastUpdateAction ||
                      (isOut
                        ? `Outbound (${item.tujuanPengambilan || '-'})`
                        : 'Update Data Pallet')
                    : 'Input Pallet Baru';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
                    >
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>
                            {formatTimeOnly(showUpdateTime ? updIso! : item.submittedAt)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          Masuk: {formatFullDateTime(item.submittedAt)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{actionLabel}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700">
                            {item.nomorPallet || '-'}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isOut
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {isOut ? `OUT (${item.tujuanPengambilan || '-'})` : 'IN (Aktif)'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900">
                          <MapPin className="w-3 h-3" />
                          {item.lokasiBin}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {item.namaBarang}
                        </div>
                        <div className="font-mono text-[11px] text-blue-600 dark:text-blue-400">
                          {item.kodeItem || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                        {item.qtyPallet}{' '}
                        <span className="font-sans font-normal text-slate-500">
                          {item.unit}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {batches.length > 0 ? (
                          <div className="space-y-0.5">
                            {batches.map((b, bIdx) => (
                              <div key={bIdx}>
                                <strong className="text-blue-700 dark:text-blue-400">
                                  {b.noBatch || '-'}
                                </strong>{' '}
                                <span className="text-slate-500">
                                  ({b.boxAwal || '-'}-{b.boxAkhir || '-'})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-[200px]">
                        {item.keterangan ? (
                          <span className="text-amber-700 dark:text-amber-300 font-medium">
                            {item.keterangan}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      {onUpdateRecord && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="inline-flex items-center justify-center p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                            title={`Update data pallet ${item.nomorPallet}`}
                            aria-label={`Update data pallet ${item.nomorPallet}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aktivitas Surat Jalan (Pembuatan / Edit / Update SPP & PO) pada Tanggal Terpilih */}
      {sjOnSelectedDate.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Aktivitas Surat Jalan ({formatShortDate(selectedDate)})
                </h3>
                <p className="text-xs text-slate-500">
                  Pembuatan baru, edit data, maupun pembaruan No. SPP / No. PO Surat Jalan pada tanggal ini
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {sjOnSelectedDate.length} Surat Jalan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 text-center w-10">No</th>
                  <th className="py-2.5 px-3">Waktu Update</th>
                  <th className="py-2.5 px-3">Aktivitas</th>
                  <th className="py-2.5 px-3">No. Surat Jalan</th>
                  <th className="py-2.5 px-3">No. SPP &amp; PO</th>
                  <th className="py-2.5 px-3">Rute Tujuan</th>
                  <th className="py-2.5 px-3">Nopol &amp; Driver</th>
                  <th className="py-2.5 px-3 text-right">Muatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sjOnSelectedDate.map((sj, idx) => {
                  const effIso = sj.updatedAt || sj.createdAt;
                  const isManual = !sj.palletIds || sj.palletIds.length === 0;
                  const actLabel =
                    sj.lastUpdateAction ||
                    (isManual ? 'Surat Jalan Manual' : 'Buat Surat Jalan');
                  return (
                    <tr
                      key={sj.id}
                      className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
                    >
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>{formatTimeOnly(effIso)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {actLabel}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {sj.noSuratJalan}
                        {isManual && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-sans">
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        <div>SPP: {sj.noSpp && sj.noSpp !== '-' ? sj.noSpp : '-'}</div>
                        <div>PO: {sj.noPo && sj.noPo !== '-' ? sj.noPo : '-'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {sj.ruteTujuanKode || sj.ruteTujuanNama}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="inline-flex items-center gap-1 font-mono font-bold text-slate-900 dark:text-white">
                          <Truck className="w-3 h-3 text-slate-400" />
                          <span>{sj.noPolisi}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {sj.namaDriver || '-'} · {sj.namaVendorArmada}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {sj.grandTotalBox} Box
                        </div>
                        <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          {sj.grandTotalKg.toLocaleString('id-ID')} Kg
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Update Data Pallet dari Halaman Monitoring Update */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 my-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Update Data Pallet ({editingRecord.nomorPallet || editingRecord.barcodeNumber})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Perbarui jumlah box, batch, lokasi bin, atau catatan langsung dari Monitoring Update
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Pallet *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRecord.nomorPallet}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        nomorPallet: e.target.value.toUpperCase()
                      })
                    }
                    className="w-full font-mono font-bold bg-amber-50/70 dark:bg-slate-800 border border-amber-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status Pallet *
                  </label>
                  <select
                    value={resolvePalletQcStatus(editingRecord)}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        statusQc: e.target.value as PalletQcStatus
                      })
                    }
                    className="w-full font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                  >
                    <option value="OK">OK</option>
                    <option value="HOLD">HOLD</option>
                    <option value="PROBLEM">PROBLEM</option>
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lokasi Bin *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRecord.lokasiBin}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        lokasiBin: e.target.value.toUpperCase()
                      })
                    }
                    className="w-full font-mono font-bold text-blue-600 dark:text-blue-400 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lokasi Gudang *
                  </label>
                  <select
                    value={editingRecord.lokasiGudang || 'Gd Krian'}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        lokasiGudang: e.target.value
                      })
                    }
                    className="w-full font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                  >
                    {CANONICAL_WAREHOUSE_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>

                {masterItems.length > 0 && (
                  <div className="sm:col-span-12">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pilih dari Master Barang (Opsional)
                    </label>
                    <select
                      value={
                        masterItems.find(
                          (m) =>
                            m.kodeItem === editingRecord.kodeItem &&
                            m.namaBarang === editingRecord.namaBarang
                        )?.id || ''
                      }
                      onChange={(e) => {
                        const found = masterItems.find((m) => m.id === e.target.value);
                        if (found) {
                          setEditingRecord({
                            ...editingRecord,
                            kodeItem: found.kodeItem,
                            namaBarang: found.namaBarang,
                            unit: found.satuan || editingRecord.unit || 'Box'
                          });
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">-- Pertahankan / Isi Manual di Bawah --</option>
                      {masterItems.map((m) => (
                        <option key={m.id} value={m.id}>
                          [{m.kodeItem}] {m.namaBarang}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kode Item
                  </label>
                  <input
                    type="text"
                    value={editingRecord.kodeItem}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        kodeItem: e.target.value.toUpperCase()
                      })
                    }
                    className="w-full font-mono font-bold text-blue-700 dark:text-blue-300 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Barang *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRecord.namaBarang}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        namaBarang: e.target.value
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-medium"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Qty / Pallet *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={1}
                      required
                      value={editingRecord.qtyPallet}
                      onChange={(e) =>
                        setEditingRecord({
                          ...editingRecord,
                          qtyPallet: Number(e.target.value) || 0
                        })
                      }
                      className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                    />
                    <select
                      value={editingRecord.unit || 'Box'}
                      onChange={(e) =>
                        setEditingRecord({
                          ...editingRecord,
                          unit: e.target.value
                        })
                      }
                      className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-2 text-slate-800 dark:text-slate-200"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Batches & Box Ranges */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Daftar Batch &amp; Nomor Box ({editBatches.length} Batch)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Qty / Pallet otomatis tersinkron dengan total hitungan rentang No. Box
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditBatches((prev) => [
                        ...prev,
                        { noBatch: '', boxAwal: '', boxAkhir: '' }
                      ])
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Batch</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {editBatches.map((eb, bIdx) => {
                    const bCalc = calculateBatchBoxCount(eb.boxAwal, eb.boxAkhir);
                    return (
                      <div
                        key={bIdx}
                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                      >
                        <div className="sm:col-span-2 flex items-center gap-1.5 self-center">
                          <span className="px-2 py-0.5 rounded bg-slate-800 dark:bg-blue-600 text-white font-mono font-bold text-[11px]">
                            Batch #{bIdx + 1}
                          </span>
                          {bCalc?.isValid && (
                            <span className="text-[10px] font-mono font-bold text-emerald-600">
                              ({bCalc.totalBox} Box)
                            </span>
                          )}
                        </div>

                        <div className="sm:col-span-3">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                              No. Batch *
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
                              setEditBatches((prev) =>
                                prev.map((item, idx) =>
                                  idx === bIdx
                                    ? { ...item, noBatch: e.target.value.toUpperCase() }
                                    : item
                                )
                              )
                            }
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                            No. Box Awal *
                          </label>
                          <input
                            type="text"
                            required
                            value={eb.boxAwal}
                            onChange={(e) => {
                              const nextVal = e.target.value.toUpperCase();
                              const nextBatches = editBatches.map((item, idx) =>
                                idx === bIdx ? { ...item, boxAwal: nextVal } : item
                              );
                              setEditBatches(nextBatches);
                              const nextTotal = nextBatches.reduce((sum, b) => {
                                const c = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
                                return sum + (c?.isValid ? c.totalBox : 0);
                              }, 0);
                              if (nextTotal > 0) {
                                setEditingRecord({ ...editingRecord, qtyPallet: nextTotal });
                              }
                            }}
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                            No. Box Akhir *
                          </label>
                          <input
                            type="text"
                            required
                            value={eb.boxAkhir}
                            onChange={(e) => {
                              const nextVal = e.target.value.toUpperCase();
                              const nextBatches = editBatches.map((item, idx) =>
                                idx === bIdx ? { ...item, boxAkhir: nextVal } : item
                              );
                              setEditBatches(nextBatches);
                              const nextTotal = nextBatches.reduce((sum, b) => {
                                const c = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
                                return sum + (c?.isValid ? c.totalBox : 0);
                              }, 0);
                              if (nextTotal > 0) {
                                setEditingRecord({ ...editingRecord, qtyPallet: nextTotal });
                              }
                            }}
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          {editBatches.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextBatches = editBatches.filter((_, idx) => idx !== bIdx);
                                setEditBatches(nextBatches);
                                const nextTotal = nextBatches.reduce((sum, b) => {
                                  const c = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
                                  return sum + (c?.isValid ? c.totalBox : 0);
                                }, 0);
                                if (nextTotal > 0) {
                                  setEditingRecord({ ...editingRecord, qtyPallet: nextTotal });
                                }
                              }}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                              title={`Hapus Batch #${bIdx + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const totalBoxSum = editBatches.reduce((sum, b) => {
                    const c = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
                    return sum + (c?.isValid ? c.totalBox : 0);
                  }, 0);
                  if (totalBoxSum <= 0) return null;
                  const isSynced = totalBoxSum === Number(editingRecord.qtyPallet);
                  return (
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400">
                        Total hitungan rentang No. Box:{' '}
                        <strong className="text-emerald-700 dark:text-emerald-300">
                          {totalBoxSum} Box
                        </strong>
                        {isSynced && (
                          <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                            (Otomatis sinkron ke Qty)
                          </span>
                        )}
                      </span>
                      {!isSynced && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingRecord({ ...editingRecord, qtyPallet: totalBoxSum })
                          }
                          className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold cursor-pointer"
                        >
                          ← Terapkan Total ({totalBoxSum} Box) ke Qty
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Keterangan / Catatan
                </label>
                <input
                  type="text"
                  value={editingRecord.keterangan || ''}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, keterangan: e.target.value })
                  }
                  placeholder="Catatan tambahan (opsional)..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                />
              </div>

              {editError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingEdit ? 'Menyimpan...' : 'Simpan Update'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
