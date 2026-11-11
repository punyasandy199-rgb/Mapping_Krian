import React, { useState } from 'react';
import { PalletRecord } from '../types/warehouse';
import { QrCodeRenderer } from './QrCodeRenderer';
import { BarcodeRenderer } from './BarcodeRenderer';
import { exportPalletsToCsv } from '../utils/exporter';
import { downloadBinManifestPdf } from '../utils/pdfGenerator';
import { sortBinRecordsByLoadingOrder } from '../utils/binSorting';
import { PrintBinManifestModal } from './PrintBinManifestModal';
import {
  MapPin,
  X,
  FileSpreadsheet,
  Printer,
  Box,
  Layers,
  Calendar,
  Barcode,
  Tag,
  FileDown
} from 'lucide-react';

interface BinDetailModalProps {
  binCode: string | null;
  records: PalletRecord[];
  isOpen: boolean;
  onClose: () => void;
  onPrintPallet?: (record: PalletRecord) => void;
}

export const BinDetailModal: React.FC<BinDetailModalProps> = ({
  binCode,
  records,
  isOpen,
  onClose,
  onPrintPallet
}) => {
  const [isPrintManifestOpen, setIsPrintManifestOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  if (!isOpen || !binCode) return null;

  // Filter and sort all items stored in this Bin:
  // Item entered first is at the very end; newly added pallets fill previous numbers (No. 1).
  const itemsInBin = sortBinRecordsByLoadingOrder(
    records.filter((r) => r.lokasiBin.toUpperCase() === binCode.toUpperCase())
  );

  const totalQty = itemsInBin.reduce((sum, item) => sum + (Number(item.qtyPallet) || 0), 0);
  const uniquePallets = new Set(itemsInBin.map((item) => item.nomorPallet || item.id)).size;

  const handleExportBin = () => {
    exportPalletsToCsv(itemsInBin, `muatan_bin_${binCode.replace('.', '_')}`);
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      await downloadBinManifestPdf(binCode, itemsInBin);
    } catch (e) {
      console.error(e);
      alert('Gagal mengunduh PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Build the direct web scan URL for this bin
  const scanUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(binCode)}`
    : `?bin=${binCode}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col max-h-[90vh] text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold font-mono">
                  Detail Muatan Bin: {binCode}
                </h3>
                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-900">
                  GUDANG 5
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar seluruh pallet dan barang yang tersimpan di lokasi rak ini
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 my-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Box className="w-3.5 h-3.5 text-blue-600" /> Jumlah Pallet
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
              {uniquePallets} Pallet
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-600" /> Total Qty
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
              {totalQty.toLocaleString('id-ID')} Box
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-purple-600" /> Total Item / SKU
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
              {itemsInBin.length} Item
            </div>
          </div>

          <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div className="text-[10px] text-slate-500">
              <span className="font-bold block text-slate-800 dark:text-slate-200">QR Scan Link:</span>
              Kamera HP langsung buka list ini
            </div>
            <QrCodeRenderer
              value={scanUrl}
              size={54}
              showLabel={false}
              className="p-1 border-0 shadow-none shrink-0"
            />
          </div>
        </div>

        {/* Pallet Items List */}
        <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl mb-4">
          {itemsInBin.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <Box className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Belum ada data muatan di Bin {binCode}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Lokasi ini masih kosong dan siap diinput pada batch pallet berikutnya.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">No</th>
                  <th className="py-2.5 px-3">No Pallet</th>
                  <th className="py-2.5 px-3">Kode Item</th>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3">No. Batch</th>
                  <th className="py-2.5 px-3">Rentang No. Box</th>
                  <th className="py-2.5 px-3">Barcode</th>
                  <th className="py-2.5 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {itemsInBin.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                      <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-900">
                        {item.nomorPallet || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.kodeItem || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {item.namaBarang}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {item.qtyPallet} <span className="font-normal text-slate-500">{item.unit}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                      {item.noBatch || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {item.boxAwal || item.batchAwal || '-'} → {item.boxAkhir || item.batchAkhir || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                      {item.barcodeNumber}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {onPrintPallet && (
                        <button
                          type="button"
                          onClick={() => onPrintPallet(item)}
                          className="p-1 text-slate-600 hover:text-blue-600 rounded"
                          title="Cetak label thermal pallet ini"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportBin}
              disabled={itemsInBin.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor Excel (.csv)</span>
            </button>

            {itemsInBin.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg border border-emerald-300 dark:border-emerald-800 transition-colors disabled:opacity-50"
                  title="Unduh dokumen PDF kartu kendali muatan Bin ini"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Unduh PDF Bin</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPrintManifestOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm"
                  title="Buka dialog cetak lembar manifest kendali Bin (QR Code & Daftar Barang)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Lembar Bin (QR)</span>
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg"
          >
            Tutup
          </button>
        </div>

        {/* Print Bin Manifest Modal */}
        <PrintBinManifestModal
          isOpen={isPrintManifestOpen}
          onClose={() => setIsPrintManifestOpen(false)}
          binCode={binCode}
          records={itemsInBin}
        />
      </div>
    </div>
  );
};
