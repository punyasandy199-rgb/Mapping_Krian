import React, { useState, useMemo } from 'react';
import { PalletRecord, MasterWarehouse } from '../types/warehouse';
import { getPalletBatches } from '../utils/batchCalculator';
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
  PackageCheck
} from 'lucide-react';

interface PalletUpdateMonitorViewProps {
  records: PalletRecord[];
  activeWarehouse?: MasterWarehouse | null;
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
  activeWarehouse
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

  // Hitung tanggal-tanggal terbaru yang memiliki update pallet agar cepat dipilih petugas
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
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [scopedRecords]);

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
          (item.keterangan || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const timeA = new Date(getEffectiveUpdateIso(a) || a.submittedAt).getTime();
        const timeB = new Date(getEffectiveUpdateIso(b) || b.submittedAt).getTime();
        return timeB - timeA;
      });
  }, [datePartition, activityMode, statusFilter, searchTerm]);

  // Statistik utama berdasar tanggal terpilih (fokus pada pallet yang diupdate tanggal tersebut)
  const kpiStats = useMemo(() => {
    const updatedList = datePartition.updatedOnDate;
    const totalBoxUpdated = updatedList.reduce(
      (sum, r) => sum + (Number(r.qtyPallet) || 0),
      0
    );
    const affectedBins = new Set(
      updatedList.map((r) => (r.lokasiBin || '').toUpperCase()).filter(Boolean)
    ).size;

    const editCount = updatedList.filter((r) => {
      const act = (r.lastUpdateAction || '').toLowerCase();
      return (
        !act.includes('outbound') &&
        !act.includes('kembalikan') &&
        r.status !== 'OUT'
      );
    }).length;
    const statusChangeCount = updatedList.length - editCount;

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
      {/* Date Filter & Quick Picks Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Monitoring Update Pallet Harian</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau jumlah dan daftar pallet yang mengalami pembaruan data, perubahan urutan Bin, maupun pengambilan pada tanggal tertentu.
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
            <span className="text-slate-500 font-medium">Tanggal dengan riwayat update:</span>
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
            Input Baru ({formatShortDate(selectedDate)})
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1">
            {kpiStats.createdCount}{' '}
            <span className="text-xs font-normal text-slate-500">Pallet</span>
          </div>
        </div>
      </div>

      {/* Main Monitoring Table Card */}
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
              <span>Edit Data/Bin: {kpiStats.editCount}</span>
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
                placeholder="Cari pallet, bin, aksi..."
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
              Setiap perubahan data pallet (edit jumlah box, pindah Bin, perubahan batch, urutan Bin, outbound, atau penyelesaian Tasklist Pallet Problem) akan tercatat otomatis di sini beserta tanggal dan jam updatenya.
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
