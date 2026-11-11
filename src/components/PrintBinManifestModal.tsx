import React, { useState, useMemo } from 'react';
import { PalletRecord } from '../types/warehouse';
import { QrCodeRenderer } from './QrCodeRenderer';
import { downloadBinManifestPdf } from '../utils/pdfGenerator';
import { exportPalletsToCsv } from '../utils/exporter';
import { sortBinRecordsByLoadingOrder } from '../utils/binSorting';
import {
  Printer,
  FileDown,
  X,
  MapPin,
  Box,
  Layers,
  Calendar,
  FileSpreadsheet,
  CheckCircle2,
  Tag
} from 'lucide-react';

interface PrintBinManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  binCode: string;
  records: PalletRecord[];
}

export const PrintBinManifestModal: React.FC<PrintBinManifestModalProps> = ({
  isOpen,
  onClose,
  binCode,
  records
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !binCode) return null;

  // Sorting rule:
  // "item pertama yang diinput di 1 Bin adalah urutan paling terakhir,
  // sehingga apabila ada penambahan pallet akan mengisi posisi urutan sebelumnya"
  // (Newest pallet is Row No. 1, first pallet ever entered in this bin is at the bottom).
  const sortedRecords = useMemo(() => {
    return sortBinRecordsByLoadingOrder(records);
  }, [records]);

  // Extract unique item names (Dominant item name in bold large font)
  const dominantItemName = useMemo(() => {
    const names = Array.from(new Set(records.map((r) => r.namaBarang).filter(Boolean)));
    return names.length > 0 ? names.join(' / ') : '-';
  }, [records]);

  const uniquePallets = new Set(records.map((r) => r.nomorPallet || r.id)).size;
  const totalQty = records.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0);

  const scanUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(binCode)}`
      : `?bin=${binCode}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true);
      await downloadBinManifestPdf(binCode, records);
      setSuccessMessage(`Dokumen PDF Kartu Bin ${binCode} berhasil diunduh!`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunduh PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    exportPalletsToCsv(records, `muatan_bin_${binCode.replace('.', '_')}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs print:p-0 print:m-0 print:bg-white print:fixed print:inset-0 print:z-[99999] print:block">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none print:rounded-none">
        {/* Modal Top Header (Interactive Dialog Navigation - hidden on print) */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Cetak Lembar Muatan Bin: {binCode}
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Format resmi rak gudang (tercetak di 1/2 lembar A4 portrait bagian atas)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content - Document Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 print:p-0 print:overflow-visible">
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Sheet Document - Designed exactly to user screenshot (Portrait 1/2 A4) */}
          <div className="bg-white text-slate-900 border-2 border-slate-900 rounded-xl p-5 sm:p-6 shadow-md print:border-none print:shadow-none print:p-0 print:rounded-none">
            {/* Top Row: Dark Header Banner matching exact screenshot layout */}
            <div className="bg-slate-900 text-white rounded-lg p-4 sm:p-5 mb-3 flex items-start justify-between gap-4">
              {/* Left Column: LOKASI BIN in Yellow & DIRECT NAMA BARANG in White */}
              <div className="flex-1 pr-2">
                <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-amber-200 leading-none">
                  LOKASI BIN: {binCode.toUpperCase()}
                </div>

                {/* Direct Nama Barang: large white text, no "Barang:" prefix */}
                <div className="text-xl sm:text-2xl font-black tracking-normal text-white mt-2.5 uppercase leading-tight">
                  {dominantItemName}
                </div>
              </div>

              {/* Right Column: "Gudang 5" badge & Larger QR Code */}
              <div className="shrink-0 flex flex-col items-end gap-2">
                <div className="text-xs sm:text-sm font-black uppercase tracking-wider bg-amber-200 text-slate-950 px-3 py-1 rounded shadow-xs">
                  GUDANG 5
                </div>

                <div className="p-2 bg-white rounded-lg shadow-xs flex flex-col items-center">
                  <QrCodeRenderer
                    value={scanUrl}
                    size={96}
                    showLabel={false}
                    className="p-0 border-0 shadow-none"
                  />
                  <span className="text-[9px] font-bold font-mono text-slate-900 mt-1 uppercase tracking-wider">
                    SCAN BIN {binCode}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100 border border-slate-300 p-2.5 rounded-lg mb-3 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Total Pallet</span>
                <strong className="text-sm sm:text-base text-slate-950">{uniquePallets} Pallet</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Total Muatan</span>
                <strong className="text-sm sm:text-base text-slate-950">{totalQty.toLocaleString('id-ID')} Box</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Jumlah Item</span>
                <strong className="text-sm sm:text-base text-slate-950">{records.length} Baris</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Waktu Cetak</span>
                <span className="text-xs font-bold text-slate-800">
                  {new Date().toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Table of items (Barcode column removed per instruction!) */}
            <div className="border border-slate-300 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white font-semibold">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3">No Pallet</th>
                    <th className="py-2.5 px-3">Kode Item</th>
                    <th className="py-2.5 px-3">Nama Barang</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3">No. Batch</th>
                    <th className="py-2.5 px-3">No. Box (Awal - Akhir)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-xs">
                  {sortedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 italic font-sans">
                        Belum ada muatan pallet di Bin {binCode}
                      </td>
                    </tr>
                  ) : (
                    sortedRecords.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-bold">
                            {r.nomorPallet || '-'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-blue-700">{r.kodeItem || '-'}</td>
                        <td className="py-2.5 px-3 font-sans font-bold text-slate-900">{r.namaBarang}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {r.qtyPallet} <span className="font-normal text-slate-600 font-sans">{r.unit}</span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-blue-700">{r.noBatch || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {r.boxAwal || r.batchAwal || '-'} → {r.boxAkhir || r.batchAkhir || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Note: NO SPV/Petugas signature per instruction! */}
          </div>
        </div>

        {/* Modal Actions Footer - hidden on print */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ekspor Excel (.csv)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              <span>Unduh Dokumen PDF Bin</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak ke Printer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
