import React, { useState, useMemo } from 'react';
import { PalletRecord } from '../types/warehouse';
import { QrCodeRenderer } from './QrCodeRenderer';
import { downloadBinManifestPdf } from '../utils/pdfGenerator';
import { exportPalletsToCsv } from '../utils/exporter';
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

  // Sorting requirement:
  // "penginputan paling atas apabila lembar nya dicetak selalu di posisi pallet paling bawah (nomor 8),
  // apabila ada penambahan inputan, maka penambahan di nomor kecilnya, semisal data ada 6 palet,
  // dan dilain waktu ada penambahan 1 pallet, maka pada lembar cetak tertampilnya di nomor urut 1,
  // dan 6 pallet sebelumnya mundur (menjadi nomor 2-7)."
  // => Newest added pallet is No. 1, oldest/earliest added pallet is at the bottom (largest number).
  const sortedRecords = useMemo(() => {
    return [...records].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
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
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Cetak Lembar Muatan Bin: {binCode}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pratinjau lembar cetak rak fisik gudang (A4 / Thermal)
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
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 print:p-2 print:overflow-visible">
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Sheet Document - Designed exactly to user instructions */}
          <div className="bg-white text-slate-900 border-2 border-slate-900 rounded-xl p-6 shadow-md">
            {/* Top Row: Gudang 5 at top right */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-5 mb-4 gap-4">
              {/* Left Column: LOKASI BIN & DIRECT NAMA BARANG in Extra Large Bold font */}
              <div className="flex-1 pr-2">
                {/* LOKASI BIN: Extra Large Bold */}
                <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight text-slate-950 leading-none">
                  LOKASI BIN: {binCode.toUpperCase()}
                </div>

                {/* NAMA BARANG: Langsung nama barang tanpa kata 'Barang:', dibuat sangat besar dan tebal */}
                <div className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-normal text-slate-900 mt-3 uppercase leading-tight">
                  {dominantItemName}
                </div>
              </div>

              {/* Right Column: "Gudang 5" text & Larger QR Code */}
              <div className="shrink-0 flex flex-col items-end gap-2.5">
                {/* User instruction: "lembar kendali muatan Bin gudang 5" dibuat dibagian kanan atas "Gudang 5" */}
                <div className="text-base font-black uppercase tracking-wider bg-slate-900 text-white px-3.5 py-1.5 rounded shadow-xs">
                  GUDANG 5
                </div>

                {/* User instruction: "QR Code bisa dibuat lebih besar lagi" */}
                <div className="p-2.5 bg-white border-2 border-slate-900 rounded-xl shadow-xs flex flex-col items-center">
                  <QrCodeRenderer
                    value={scanUrl}
                    size={120}
                    showLabel={false}
                    className="p-0 border-0 shadow-none"
                  />
                  <span className="text-[10px] font-bold font-mono text-slate-800 mt-1 uppercase tracking-wider">
                    SCAN BIN {binCode}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100 border border-slate-300 p-2.5 rounded-lg mb-4 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Total Pallet</span>
                <strong className="text-base text-slate-950">{uniquePallets} Pallet</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Total Qty</span>
                <strong className="text-base text-slate-950">{totalQty.toLocaleString('id-ID')} Box</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Total Item / Baris</span>
                <strong className="text-base text-slate-950">{records.length} Item</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-sans">Waktu Cetak</span>
                <span className="text-xs font-bold text-slate-800">
                  {new Date().toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
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
