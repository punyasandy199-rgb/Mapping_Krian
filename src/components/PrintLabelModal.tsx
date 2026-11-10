import React, { useState } from 'react';
import { PalletRecord } from '../types/warehouse';
import { ThermalLabelCard } from './ThermalLabelCard';
import { downloadPalletLabelPdf, downloadPalletHistoryReportPdf } from '../utils/pdfGenerator';
import {
  Printer,
  FileDown,
  X,
  FileSpreadsheet,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface PrintLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: PalletRecord[];
}

export const PrintLabelModal: React.FC<PrintLabelModalProps> = ({
  isOpen,
  onClose,
  records
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen || records.length === 0) return null;

  const currentRecord = records[Math.min(currentIndex, records.length - 1)];

  const handlePrintPrinter = () => {
    // Triggers native printer dialog
    window.print();
  };

  const handleDownloadSinglePdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await downloadPalletLabelPdf([currentRecord]);
      setDownloadSuccess(`PDF Label ${currentRecord.nomorPallet || 'Pallet'} berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(null), 3500);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat PDF. Silakan coba lagi.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadAllPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await downloadPalletLabelPdf(records);
      setDownloadSuccess(`PDF ${records.length} label pallet berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(null), 3500);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat PDF multi-label. Silakan coba lagi.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadReportPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await downloadPalletHistoryReportPdf(records);
      setDownloadSuccess(`Laporan Riwayat Pallet (A4) berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(null), 3500);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat laporan PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs no-print">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                <Printer className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Cetak Label & Unduh PDF Pallet
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Siap dicetak langsung ke printer fisik (Thermal/A4) atau simpan sebagai dokumen PDF
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Multi-item pagination selector if multiple items selected */}
          {records.length > 1 && (
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Menampilkan Item {currentIndex + 1} dari {records.length} Pallet Terpilih
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentIndex === records.length - 1}
                  onClick={() => setCurrentIndex((prev) => Math.min(records.length - 1, prev + 1))}
                  className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {downloadSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{downloadSuccess}</span>
            </div>
          )}

          {/* Label Thermal Preview Card */}
          <div className="flex justify-center bg-slate-100 dark:bg-slate-950/70 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 overflow-x-auto">
            <div className="scale-95 sm:scale-100 origin-top">
              <ThermalLabelCard record={currentRecord} isPrintView={false} />
            </div>
          </div>

          {/* Format specifications info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
              <div className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Cetak ke Printer Fisik
              </div>
              <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-1">
                Kompatibel dengan printer thermal roll (100x150 mm), Xprinter, TSC, Zebra, atau printer kertas HVS/A4 biasa.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                <FileDown className="w-3.5 h-3.5" /> Unduh Dokumen PDF
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                Menghasilkan file PDF vektor beresolusi tinggi, barcode terbaca tajam oleh scanner, siap diarsipkan atau dikirim.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadReportPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Unduh tabel ringkasan format A4"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>Laporan A4 (PDF)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {records.length > 1 ? (
              <button
                type="button"
                onClick={handleDownloadAllPdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>Unduh Semua PDF ({records.length})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownloadSinglePdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>Unduh PDF Label (.pdf)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintPrinter}
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
