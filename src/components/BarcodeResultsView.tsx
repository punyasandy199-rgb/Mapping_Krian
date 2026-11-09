import React, { useState } from 'react';
import { PalletRecord, BatchSubmission } from '../types/warehouse';
import { ThermalLabelCard } from './ThermalLabelCard';
import { exportPalletsToCsv } from '../utils/exporter';
import {
  Printer,
  FileSpreadsheet,
  ArrowLeft,
  CheckCircle,
  Layers,
  MapPin,
  Calendar,
  Tag
} from 'lucide-react';

interface BarcodeResultsViewProps {
  batch: BatchSubmission;
  onBackToInput: () => void;
  onViewHistory: () => void;
}

export const BarcodeResultsView: React.FC<BarcodeResultsViewProps> = ({
  batch,
  onBackToInput,
  onViewHistory
}) => {
  const [selectedItemForPrint, setSelectedItemForPrint] = useState<PalletRecord | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const handlePrintAll = () => {
    setSelectedItemForPrint(null);
    window.print();
  };

  const handlePrintSingle = (record: PalletRecord) => {
    setSelectedItemForPrint(record);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleExportCsv = () => {
    exportPalletsToCsv(batch.items, `pallet_batch_${batch.batchId}`);
  };

  const formattedDate = new Date(batch.submittedAt).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const uniquePalletNames = Array.from(
    new Set(batch.items.map((i) => i.nomorPallet).filter(Boolean))
  ).join(', ');

  return (
    <div>
      {/* Screen Interactive UI (Hidden on Print) */}
      <div className="no-print space-y-6">
        {/* Success Banner */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl p-5 md:p-6 text-emerald-900 dark:text-emerald-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">
                  {batch.items.length} Barcode Pallet ({uniquePalletNames}) Berhasil Diterbitkan!
                </h2>
                <span className="text-xs font-mono bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-300 dark:border-blue-900 font-bold flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> BIN: {batch.lokasiBin}
                </span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-300/80 mt-1">
                Lokasi Bin <strong className="font-mono">{batch.lokasiBin}</strong> telah dialokasikan untuk Pallet {uniquePalletNames}. Label siap dicetak ke printer thermal/dokumen.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-emerald-800 dark:text-emerald-200 font-medium">
                <span className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Total Qty: {batch.totalQty.toLocaleString('id-ID')} unit
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {formattedDate}
                </span>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={handlePrintAll}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Semua Label ({batch.items.length})</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Ekspor Excel</span>
            </button>
          </div>
        </div>

        {/* Navigation & Display Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between pb-2 gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToInput}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Input Pallet Baru</span>
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              onClick={onViewHistory}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Buka Riwayat Pallet Gudang
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Tampilan:</span>
            <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Kartu Label
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Tabel Ringkasan
              </button>
            </div>
          </div>
        </div>

        {/* View Mode: Cards */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {batch.items.map((item) => (
              <ThermalLabelCard
                key={item.id}
                record={item}
                onPrintSingle={handlePrintSingle}
              />
            ))}
          </div>
        ) : (
          /* View Mode: Table */
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                  <th className="py-3 px-3">No</th>
                  <th className="py-3 px-3">No Pallet</th>
                  <th className="py-3 px-3">Lokasi Bin</th>
                  <th className="py-3 px-3">Kode Item</th>
                  <th className="py-3 px-3">Nama Barang</th>
                  <th className="py-3 px-3">No Barcode</th>
                  <th className="py-3 px-3 text-right">Qty</th>
                  <th className="py-3 px-3">Batch</th>
                  <th className="py-3 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {batch.items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-3 text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                      {item.nomorPallet}
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold border border-blue-200 dark:border-blue-900">
                        {item.lokasiBin}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">
                      {item.kodeItem || '-'}
                    </td>
                    <td className="py-3 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                      {item.namaBarang}
                    </td>
                    <td className="py-3 px-3 text-slate-900 dark:text-slate-100 font-bold">
                      {item.barcodeNumber}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                      {item.qtyPallet} {item.unit}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                      {item.batchAwal} → {item.batchAkhir}
                    </td>
                    <td className="py-3 px-3 text-center font-sans">
                      <button
                        type="button"
                        onClick={() => handlePrintSingle(item)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center gap-1 mx-auto"
                      >
                        <Printer className="w-3 h-3" /> Cetak
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print-Only Container */}
      <div className="print-only">
        {selectedItemForPrint ? (
          <div className="p-4 flex items-center justify-center">
            <ThermalLabelCard record={selectedItemForPrint} isPrintView={true} />
          </div>
        ) : (
          <div>
            {batch.items.map((item, idx) => (
              <div
                key={item.id}
                className={`p-4 flex items-center justify-center ${
                  idx < batch.items.length - 1 ? 'print-page-break' : ''
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
