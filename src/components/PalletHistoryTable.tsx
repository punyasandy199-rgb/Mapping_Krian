import React, { useState, useMemo } from 'react';
import { PalletRecord } from '../types/warehouse';
import { exportPalletsToCsv } from '../utils/exporter';
import { ThermalLabelCard } from './ThermalLabelCard';
import {
  Search,
  Filter,
  FileSpreadsheet,
  Printer,
  Trash2,
  Barcode,
  Layers,
  MapPin,
  CheckSquare,
  Square,
  Box,
  Tag
} from 'lucide-react';

interface PalletHistoryTableProps {
  records: PalletRecord[];
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onNewInput: () => void;
}

export const PalletHistoryTable: React.FC<PalletHistoryTableProps> = ({
  records,
  onDeleteRecord,
  onClearAll,
  onNewInput
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activePrintRecord, setActivePrintRecord] = useState<PalletRecord | null>(null);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        item.namaBarang.toLowerCase().includes(q) ||
        (item.kodeItem && item.kodeItem.toLowerCase().includes(q)) ||
        (item.nomorPallet && item.nomorPallet.toLowerCase().includes(q)) ||
        item.barcodeNumber.toLowerCase().includes(q) ||
        item.lokasiBin.toLowerCase().includes(q) ||
        item.batchAwal.toLowerCase().includes(q) ||
        item.batchAkhir.toLowerCase().includes(q);

      const matchZone =
        selectedZone === 'ALL' ||
        item.lokasiBin.toUpperCase().startsWith(selectedZone);

      return matchSearch && matchZone;
    });
  }, [records, searchTerm, selectedZone]);

  // Statistics
  const totalQty = useMemo(() => {
    return records.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0);
  }, [records]);

  const uniqueBins = useMemo(() => {
    return new Set(records.map((r) => r.lokasiBin)).size;
  }, [records]);

  const uniquePallets = useMemo(() => {
    return new Set(records.map((r) => r.nomorPallet || r.id)).size;
  }, [records]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const handleExportFiltered = () => {
    const dataToExport =
      selectedIds.size > 0
        ? records.filter((r) => selectedIds.has(r.id))
        : filteredRecords;
    exportPalletsToCsv(dataToExport, 'riwayat_pallet_inbound');
  };

  const handlePrintRecord = (record: PalletRecord) => {
    setActivePrintRecord(record);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handlePrintSelected = () => {
    if (selectedIds.size === 0) return;
    setActivePrintRecord(null);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Screen Interactive UI */}
      <div className="no-print space-y-5">
        {/* Metric Cards Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Box className="w-3.5 h-3.5 text-blue-600" /> Total Fisik Pallet
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {uniquePallets} <span className="text-xs font-normal text-slate-500">Pallet</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Barcode className="w-3.5 h-3.5 text-purple-600" /> Barcode Diterbitkan
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {records.length} <span className="text-xs font-normal text-slate-500">Item</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-600" /> Total Qty Inbound
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {totalQty.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-amber-600" /> Lokasi Bin Aktif
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
              {uniqueBins} <span className="text-xs font-normal text-slate-500">Bin</span>
            </div>
          </div>
        </div>

        {/* Search, Filter & Action Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari no pallet, kode item, nama barang, bin..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">Semua Lokasi Bin</option>
                <option value="5A">Gudang 5 Sisi A (5A.*)</option>
                <option value="5B">Gudang 5 Sisi B (5B.*)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={handlePrintSelected}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak ({selectedIds.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportFiltered}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor Excel</span>
            </button>

            {records.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Yakin ingin mengosongkan semua riwayat pallet tersimpan?')) {
                    onClearAll();
                  }
                }}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                title="Kosongkan riwayat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        {filteredRecords.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <Barcode className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Belum ada data pallet tersimpan
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Silakan input nomor pallet, lokasi Bin (cth: 5A.1), dan hingga 8 data barang untuk menerbitkan barcode pertama.
            </p>
            <button
              type="button"
              onClick={onNewInput}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              + Input Pallet Sekarang
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-slate-500 hover:text-slate-900"
                    >
                      {selectedIds.size > 0 && selectedIds.size === filteredRecords.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">No Pallet</th>
                  <th className="py-3 px-3">Lokasi Bin</th>
                  <th className="py-3 px-3">Kode Item</th>
                  <th className="py-3 px-3">Nama Barang</th>
                  <th className="py-3 px-3">No Barcode</th>
                  <th className="py-3 px-3 text-right">Qty</th>
                  <th className="py-3 px-3">Rentang Batch</th>
                  <th className="py-3 px-3">Waktu Input</th>
                  <th className="py-3 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecords.map((item) => {
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(item.id)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded font-bold border border-amber-300 dark:border-amber-900">
                          {item.nomorPallet || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                          {item.lokasiBin}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {item.kodeItem || '-'}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {item.namaBarang}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {item.barcodeNumber}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {item.qtyPallet}{' '}
                        <span className="text-[11px] font-normal text-slate-500">{item.unit}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {item.batchAwal} → {item.batchAkhir}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {new Date(item.submittedAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePrintRecord(item)}
                            className="p-1 text-slate-600 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            title="Cetak label thermal"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(item.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
                            title="Hapus baris ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Print-Only Container */}
      <div className="print-only">
        {activePrintRecord ? (
          <div className="p-4 flex items-center justify-center">
            <ThermalLabelCard record={activePrintRecord} isPrintView={true} />
          </div>
        ) : (
          <div>
            {records
              .filter((r) => selectedIds.has(r.id))
              .map((item, idx, arr) => (
                <div
                  key={item.id}
                  className={`p-4 flex items-center justify-center ${
                    idx < arr.length - 1 ? 'print-page-break' : ''
                  }`}
                >
                  <ThermalLabelCard record={item} isPrintView={true} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
