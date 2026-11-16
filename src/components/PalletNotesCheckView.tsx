import React, { useState, useMemo } from 'react';
import {
  PalletRecord,
  PalletBatchEntry,
  MasterItem,
  COMMON_UNITS
} from '../types/warehouse';
import { calculateBatchBoxCount, getPalletBatches } from '../utils/batchCalculator';
import {
  ClipboardCheck,
  Search,
  Edit3,
  CheckCircle2,
  MapPin,
  Box,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  X,
  AlertCircle,
  MessageSquareWarning
} from 'lucide-react';

interface PalletNotesCheckViewProps {
  records: PalletRecord[];
  masterItems: MasterItem[];
  onUpdateRecord: (updated: PalletRecord) => Promise<void> | void;
}

export const PalletNotesCheckView: React.FC<PalletNotesCheckViewProps> = ({
  records,
  masterItems,
  onUpdateRecord
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [editingRecord, setEditingRecord] = useState<PalletRecord | null>(null);
  const [editBatches, setEditBatches] = useState<PalletBatchEntry[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Filter strictly pallets that have non-empty "keterangan" (Keterangan / Catatan)
  const flaggedRecords = useMemo(() => {
    return records
      .filter((r) => (r.keterangan || '').trim().length > 0)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return flaggedRecords.filter((item) => {
      const status = item.status === 'OUT' ? 'OUT' : 'IN';
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!q) return true;
      return (
        (item.nomorPallet || '').toLowerCase().includes(q) ||
        (item.namaBarang || '').toLowerCase().includes(q) ||
        (item.kodeItem || '').toLowerCase().includes(q) ||
        (item.lokasiBin || '').toLowerCase().includes(q) ||
        (item.noBatch || '').toLowerCase().includes(q) ||
        (item.keterangan || '').toLowerCase().includes(q)
      );
    });
  }, [flaggedRecords, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const inCount = flaggedRecords.filter((r) => r.status !== 'OUT').length;
    const outCount = flaggedRecords.filter((r) => r.status === 'OUT').length;
    const affectedBins = new Set(flaggedRecords.map((r) => (r.lokasiBin || '').toUpperCase())).size;
    return { total: flaggedRecords.length, inCount, outCount, affectedBins };
  }, [flaggedRecords]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenEdit = (record: PalletRecord) => {
    const existingBatches = getPalletBatches(record);
    setEditingRecord({ ...record });
    setEditBatches(
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
          ]
    );
    setEditError(null);
  };

  const handleClearNote = async (record: PalletRecord) => {
    try {
      setResolvingId(record.id);
      await onUpdateRecord({
        ...record,
        keterangan: '',
        updatedAt: new Date().toISOString(),
        lastUpdateAction: 'Selesai Tasklist Problem'
      });
      showToast(`Tasklist problem pada Pallet ${record.nomorPallet} (Bin ${record.lokasiBin}) telah diselesaikan & dibersihkan.`);
    } catch (err) {
      console.error('Gagal menyelesaikan catatan pallet:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
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

    const updated: PalletRecord = {
      ...editingRecord,
      nomorPallet: noPalletClean,
      lokasiBin: binClean,
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
      keterangan: (editingRecord.keterangan || '').trim(),
      updatedAt: new Date().toISOString(),
      lastUpdateAction: 'Edit Tasklist Problem',
      ...(binChanged ? { binOrder: undefined } : {})
    };

    try {
      setIsSaving(true);
      await onUpdateRecord(updated);
      setEditingRecord(null);
      showToast(`Perubahan data Pallet ${updated.nomorPallet} (Bin ${updated.lokasiBin}) berhasil disimpan!`);
    } catch (err) {
      console.error('Gagal memperbarui pallet:', err);
      setEditError('Gagal menyimpan perubahan ke database.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-300 dark:border-amber-800/70 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <MessageSquareWarning className="w-4 h-4" />
            <span>Total Pallet Problem</span>
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {stats.total} <span className="text-xs font-normal text-slate-500">Pallet</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">Status di Rak (IN)</div>
          <div className="text-2xl font-black font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1">
            {stats.inCount} <span className="text-xs font-normal text-slate-500">Pallet</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">Sudah Diambil (OUT)</div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-1">
            {stats.outCount} <span className="text-xs font-normal text-slate-500">Pallet</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase text-slate-500">Bin Terdampak</div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {stats.affectedBins} <span className="text-xs font-normal text-slate-500">Bin</span>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-600" />
              <span>Tasklist Pallet Problem</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik <strong>Edit Data</strong> untuk memperbarui No. Pallet, Bin, Qty Box, Batch, maupun catatan problem, atau klik <strong>Selesai</strong> bila kendala sudah beres.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari pallet, bin, batch, catatan..."
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 sm:w-64"
              />
            </div>

            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-semibold">
              {(['ALL', 'IN', 'OUT'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-2 transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {st === 'ALL' ? 'Semua' : st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table / Empty State */}
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {flaggedRecords.length === 0
                ? 'Tidak Ada Tasklist Pallet Problem'
                : 'Tidak ada pallet problem yang cocok dengan pencarian'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {flaggedRecords.length === 0
                ? 'Semua data pallet saat ini bersih tanpa catatan kendala. Pallet akan masuk ke Tasklist Pallet Problem secara otomatis bila field "Keterangan / Catatan" diisi.'
                : 'Coba ubah kata kunci pencarian atau filter status di atas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-3 text-center w-10">No</th>
                  <th className="py-3 px-3">No. Pallet &amp; Status</th>
                  <th className="py-3 px-3">Lokasi Bin</th>
                  <th className="py-3 px-3">Barang</th>
                  <th className="py-3 px-3 text-right">Qty Box</th>
                  <th className="py-3 px-3">Batch &amp; No. Box</th>
                  <th className="py-3 px-3 min-w-[230px]">Keterangan / Catatan</th>
                  <th className="py-3 px-3 text-center w-44">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecords.map((item, idx) => {
                  const batches = getPalletBatches(item);
                  const isOut = item.status === 'OUT';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-amber-50/40 dark:hover:bg-amber-950/10 transition-colors"
                    >
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
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
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
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
                      <td className="py-3 px-3">
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-950 dark:text-amber-200 font-medium flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>{item.keterangan}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                            title="Edit langsung data pallet & catatan ini"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Data</span>
                          </button>
                          <button
                            type="button"
                            disabled={resolvingId === item.id}
                            onClick={() => handleClearNote(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                            title="Tandai sudah dicek dan bersihkan catatan"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Selesai</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DIRECT EDIT MODAL FOR FLAGGED PALLET */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Edit Langsung Data Pallet: {editingRecord.nomorPallet}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ubah No. Pallet, Lokasi Bin, Qty Box, Batch, maupun Keterangan/Catatan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full font-mono font-bold text-blue-700 dark:text-blue-400 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Qty / Pallet *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min="1"
                      required
                      value={editingRecord.qtyPallet}
                      onChange={(e) =>
                        setEditingRecord({
                          ...editingRecord,
                          qtyPallet: Number(e.target.value)
                        })
                      }
                      className="w-full font-mono font-bold tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={editingRecord.unit || 'Box'}
                      onChange={(e) =>
                        setEditingRecord({ ...editingRecord, unit: e.target.value })
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Barang *
                  </label>
                  <input
                    type="text"
                    required
                    list="notes-check-master-items"
                    value={editingRecord.namaBarang}
                    onChange={(e) => {
                      const val = e.target.value;
                      const match = masterItems.find(
                        (m) => m.namaBarang.toLowerCase() === val.toLowerCase()
                      );
                      setEditingRecord({
                        ...editingRecord,
                        namaBarang: val,
                        ...(match
                          ? { kodeItem: match.kodeItem, unit: match.satuan || editingRecord.unit }
                          : {})
                      });
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="notes-check-master-items">
                    {masterItems.map((m) => (
                      <option key={m.id} value={m.namaBarang} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full font-mono font-bold text-blue-700 dark:text-blue-400 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Batches */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Daftar Batch &amp; No. Box
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditBatches((prev) => [
                        ...prev,
                        { noBatch: '', boxAwal: '', boxAkhir: '' }
                      ])
                    }
                    className="flex items-center gap-1 px-2 py-1 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah Batch
                  </button>
                </div>

                {editBatches.map((eb, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={eb.noBatch}
                        onChange={(e) =>
                          setEditBatches((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, noBatch: e.target.value.toUpperCase() } : x
                            )
                          )
                        }
                        placeholder="No. Batch"
                        className="w-full font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={eb.boxAwal}
                        onChange={(e) =>
                          setEditBatches((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, boxAwal: e.target.value.toUpperCase() } : x
                            )
                          )
                        }
                        placeholder="Box Awal"
                        className="w-full font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={eb.boxAkhir}
                        onChange={(e) =>
                          setEditBatches((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, boxAkhir: e.target.value.toUpperCase() } : x
                            )
                          )
                        }
                        placeholder="Box Akhir"
                        className="w-full font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      {editBatches.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditBatches((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Keterangan / Catatan */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Keterangan / Catatan (Kosongkan jika sudah selesai dicek)
                  </label>
                  {editingRecord.keterangan && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingRecord({ ...editingRecord, keterangan: '' })
                      }
                      className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
                    >
                      Kosongkan Catatan
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={editingRecord.keterangan || ''}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, keterangan: e.target.value })
                  }
                  placeholder="Isi catatan pengecekan atau kosongkan untuk menandai selesai..."
                  className="w-full bg-amber-50/50 dark:bg-slate-950 border border-amber-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
