import React, { useState, useMemo } from 'react';
import { PalletRecord, OUTBOUND_DESTINATIONS, OutboundDestination } from '../types/warehouse';
import { QrCodeRenderer } from './QrCodeRenderer';
import { downloadBinManifestPdf, openBinManifestPdfInNewTab } from '../utils/pdfGenerator';
import { exportPalletsToCsv } from '../utils/exporter';
import { sortBinRecordsByLoadingOrder } from '../utils/binSorting';
import {
  Printer,
  FileDown,
  X,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  CheckSquare,
  Square,
  Truck,
  Clock,
  MapPin,
  Check
} from 'lucide-react';

interface PrintBinManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  binCode: string;
  records: PalletRecord[];
  onProcessOutbound?: (palletIds: string[], destination: string, petugas?: string) => Promise<void> | void;
  onRestoreOutbound?: (palletIds: string[]) => Promise<void> | void;
}

export const PrintBinManifestModal: React.FC<PrintBinManifestModalProps> = ({
  isOpen,
  onClose,
  binCode,
  records,
  onProcessOutbound,
  onRestoreOutbound
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Outbound / Pengambilan Produk states
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(new Set());
  const [isPickingModalOpen, setIsPickingModalOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<OutboundDestination>('SJA Sepanjang');
  const [petugasName, setPetugasName] = useState('Petugas Lapangan');
  const [isSubmittingOutbound, setIsSubmittingOutbound] = useState(false);

  // Split records into Active (Remaining in Bin) vs Picked (OUT)
  const { activeRecords, pickedRecords } = useMemo(() => {
    const active: PalletRecord[] = [];
    const picked: PalletRecord[] = [];

    records.forEach((r) => {
      if (r.status === 'OUT') {
        picked.push(r);
      } else {
        active.push(r);
      }
    });

    // Picked records sorted newest pick first
    picked.sort((a, b) => {
      const timeA = a.tanggalPengambilan ? new Date(a.tanggalPengambilan).getTime() : 0;
      const timeB = b.tanggalPengambilan ? new Date(b.tanggalPengambilan).getTime() : 0;
      return timeB - timeA;
    });

    return { activeRecords: active, pickedRecords: picked };
  }, [records]);

  // Sorting rule for active records:
  // First item entered in this Bin is at the bottom; newly added pallets fill previous numbers (No. 1).
  const sortedActiveRecords = useMemo(() => {
    return sortBinRecordsByLoadingOrder(activeRecords);
  }, [activeRecords]);

  // Dominant item name (from active items, or fallback to all)
  const dominantItemName = useMemo(() => {
    const source = activeRecords.length > 0 ? activeRecords : records;
    const names = Array.from(new Set(source.map((r) => r.namaBarang).filter(Boolean)));
    return names.length > 0 ? names.join(' / ') : '-';
  }, [activeRecords, records]);

  const uniqueActivePallets = new Set(activeRecords.map((r) => r.nomorPallet || r.id)).size;
  const totalActiveQty = activeRecords.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0);

  const scanUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(binCode)}`
      : `?bin=${binCode}`;

  if (!isOpen || !binCode) return null;

  // Toggle selection for a pallet
  const handleToggleSelectPallet = (id: string) => {
    setSelectedPalletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle select all active pallets
  const handleToggleSelectAll = () => {
    if (selectedPalletIds.size === sortedActiveRecords.length) {
      setSelectedPalletIds(new Set());
    } else {
      setSelectedPalletIds(new Set(sortedActiveRecords.map((r) => r.id)));
    }
  };

  // Open the Outbound destination dialog
  const handleOpenPickingModal = () => {
    if (selectedPalletIds.size === 0) return;
    setIsPickingModalOpen(true);
  };

  // Confirm Outbound
  const handleConfirmOutbound = async () => {
    if (selectedPalletIds.size === 0) return;
    try {
      setIsSubmittingOutbound(true);
      const palletIdsArray = Array.from(selectedPalletIds);

      if (onProcessOutbound) {
        await onProcessOutbound(palletIdsArray, selectedDestination, petugasName);
      }

      setSuccessMessage(
        `${palletIdsArray.length} Pallet berhasil diproses OUT ke tujuan ${selectedDestination}!`
      );
      setSelectedPalletIds(new Set());
      setIsPickingModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 4500);
    } catch (err) {
      console.error('Failed to process outbound:', err);
      alert('Gagal memproses pengambilan produk');
    } finally {
      setIsSubmittingOutbound(false);
    }
  };

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

  const handleOpenPdfInNewTab = async () => {
    try {
      setIsExportingPdf(true);
      await openBinManifestPdfInNewTab(binCode, records);
    } catch (err) {
      console.error(err);
      alert('Gagal membuka PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    exportPalletsToCsv(records, `muatan_bin_${binCode.replace('.', '_')}`);
  };

  // Format date helper
  const formatPickedTime = (timestamp?: string) => {
    if (!timestamp) return '-';
    try {
      return new Date(timestamp).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs print:p-0 print:m-0 print:bg-white print:fixed print:inset-0 print:z-[99999] print:block">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none print:rounded-none">
        
        {/* Modal Top Header (Interactive Navigation - hidden on print) */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Lembar Muatan &amp; Pengambilan Bin: {binCode}
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-900">
                  GUDANG 5
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Petugas dapat mencentang pallet lalu klik &quot;Pengambilan Produk&quot; untuk proses OUT
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

        {/* Modal Content - Document Preview & Interactive Picking Section */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 print:p-0 print:overflow-visible">
          
          {/* Success Banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 print:hidden animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Interactive Outbound Action Bar (Visible on screen, hidden on print) */}
          <div className="print:hidden bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800/90 border-2 border-amber-300 dark:border-amber-900/60 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500 text-white rounded-lg shadow-xs shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Operasional Petugas: Pengambilan Pallet (Outbound)</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  Centang pallet yang diambil dari rak, lalu tentukan lokasi tujuan pengiriman.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {sortedActiveRecords.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {selectedPalletIds.size === sortedActiveRecords.length ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      <span>Batal Pilih</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                      <span>Pilih Semua Sisa</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenPickingModal}
                disabled={selectedPalletIds.size === 0}
                className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-black rounded-lg transition-all shadow-sm ${
                  selectedPalletIds.size > 0
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20 animate-pulse'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>
                  Pengambilan Produk{' '}
                  {selectedPalletIds.size > 0 ? `(${selectedPalletIds.size} Pallet)` : ''}
                </span>
              </button>
            </div>
          </div>

          {/* Sheet Document - Designed for clean ink-friendly printing (Portrait 1/2 A4) */}
          <div className="bg-white text-slate-900 border-2 border-slate-900 rounded-xl p-5 sm:p-6 shadow-md print:border-none print:shadow-none print:p-0 print:rounded-none">
            
            {/* Top Row: Clean White Header Banner with crisp border - NO BLACK BLOCKING */}
            <div className="bg-white border-2 border-slate-900 rounded-xl p-4 sm:p-6 mb-3 flex items-start justify-between gap-4">
              {/* Left Column: LOKASI BIN & DIRECT NAMA BARANG in Extra Large Bold Black */}
              <div className="flex-1 pr-2">
                <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight text-slate-950 leading-none">
                  LOKASI BIN: {binCode.toUpperCase()}
                </div>

                {/* Direct Nama Barang: extra large bold black text, no "Barang:" prefix */}
                <div className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-normal text-slate-900 mt-3 uppercase leading-tight">
                  {dominantItemName}
                </div>
              </div>

              {/* Right Column: "Gudang 5" badge & Centered QR Code */}
              <div className="shrink-0 flex flex-col items-center gap-2.5">
                <div className="text-sm sm:text-base font-black uppercase tracking-wider bg-white border-2 border-slate-900 text-slate-950 px-4 py-1.5 rounded-lg shadow-xs text-center w-full">
                  GUDANG 5
                </div>

                <div className="p-2.5 bg-white border border-slate-400 rounded-xl shadow-xs flex items-center justify-center">
                  <QrCodeRenderer
                    value={scanUrl}
                    size={100}
                    showLabel={false}
                    className="p-0 border-0 shadow-none"
                  />
                </div>
              </div>
            </div>

            {/* Metrics Bar (Enlarged white background with crisp border) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white border border-slate-400 p-3 rounded-lg mb-3 font-mono">
              <div>
                <span className="text-xs text-slate-500 block uppercase font-sans font-bold">Pallet Sisa di Bin</span>
                <strong className="text-base sm:text-lg font-black text-slate-950">
                  {uniqueActivePallets} Pallet
                </strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block uppercase font-sans font-bold">Total Muatan Sisa</span>
                <strong className="text-base sm:text-lg font-black text-slate-950">
                  {totalActiveQty.toLocaleString('id-ID')} Box
                </strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block uppercase font-sans font-bold">Baris Item Aktif</span>
                <strong className="text-base sm:text-lg font-black text-slate-950">
                  {sortedActiveRecords.length} Baris
                </strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block uppercase font-sans font-bold">Waktu Update</span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {new Date().toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Table of Active Items (Remaining in Bin) */}
            <div className="border border-slate-300 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 border-y-2 border-slate-900 text-slate-950 font-black text-xs sm:text-sm">
                  <tr>
                    {/* Checkbox column (hidden on print) */}
                    <th className="py-3 px-2.5 w-10 text-center border-r border-slate-300 print:hidden">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-slate-700 hover:text-blue-600 transition-colors"
                        title="Pilih semua / Batalkan"
                      >
                        {selectedPalletIds.size > 0 &&
                        selectedPalletIds.size === sortedActiveRecords.length ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-2.5 w-12 text-center border-r border-slate-300">No</th>
                    <th className="py-3 px-3 w-28 border-r border-slate-300">No Pallet</th>
                    <th className="py-3 px-3.5 w-44 border-r border-slate-300">Kode Item</th>
                    <th className="py-3 px-4 border-r border-slate-300">Nama Barang</th>
                    <th className="py-3 px-3 w-24 text-right border-r border-slate-300">Qty</th>
                    <th className="py-3 px-3 w-28 border-r border-slate-300">No. Batch</th>
                    <th className="py-3 px-4 min-w-[170px] text-center">No. Box (Awal - Akhir)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-xs sm:text-sm">
                  {sortedActiveRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-10 text-center text-slate-500 italic font-sans text-sm bg-slate-50"
                      >
                        {records.length > 0 ? (
                          <div className="space-y-1">
                            <span className="font-bold text-amber-700 block">
                              Semua pallet di Bin {binCode} telah selesai diambil (Outbound).
                            </span>
                            <span className="text-xs text-slate-500">
                              Lihat daftar riwayat pallet yang telah diambil pada tabel di bawah.
                            </span>
                          </div>
                        ) : (
                          `Belum ada muatan pallet di Bin ${binCode}`
                        )}
                      </td>
                    </tr>
                  ) : (
                    sortedActiveRecords.map((r, idx) => {
                      const isSelected = selectedPalletIds.has(r.id);

                      return (
                        <tr
                          key={r.id}
                          onClick={() => handleToggleSelectPallet(r.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-100/70 font-semibold'
                              : idx % 2 === 0
                              ? 'bg-white hover:bg-slate-50'
                              : 'bg-slate-50/70 hover:bg-slate-100'
                          }`}
                        >
                          {/* Interactive Checkbox (Hidden on Print) */}
                          <td
                            className="py-3 px-2.5 text-center border-r border-slate-200 print:hidden cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectPallet(r.id);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleSelectPallet(r.id);
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-slate-400 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          <td className="py-3 px-2.5 text-center font-bold text-slate-500 border-r border-slate-200">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-3 font-black text-slate-900 border-r border-slate-200">
                            <span className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded border border-amber-300 font-black text-xs sm:text-sm">
                              {r.nomorPallet || '-'}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 font-bold text-blue-700 whitespace-nowrap border-r border-slate-200">
                            {r.kodeItem || '-'}
                          </td>

                          <td className="py-3 px-4 font-sans font-bold text-slate-900 border-r border-slate-200">
                            {r.namaBarang}
                          </td>

                          <td className="py-3 px-3 text-right font-black text-slate-900 border-r border-slate-200">
                            {r.qtyPallet}{' '}
                            <span className="font-normal text-slate-600 font-sans text-xs">{r.unit}</span>
                          </td>

                          <td className="py-3 px-3 font-bold text-blue-700 border-r border-slate-200">
                            {r.noBatch || '-'}
                          </td>

                          <td className="py-3 px-4 text-center font-bold text-slate-900">
                            {r.boxAwal || r.batchAwal
                              ? `${r.boxAwal || r.batchAwal} - ${r.boxAkhir || r.batchAkhir}`
                              : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Riwayat Pengambilan Produk Section (Visible on screen and on print) */}
            {pickedRecords.length > 0 && (
              <div className="mt-6 pt-5 border-t-2 border-dashed border-slate-300 print:mt-4 print:pt-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-800 text-white rounded-lg">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-black text-slate-950 uppercase tracking-tight">
                        Riwayat Pallet yang Diambil dari Bin {binCode}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-sans">
                        Daftar pallet yang telah diproses keluar (Outbound) beserta tanggal &amp; tujuan pengambilan
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-lg text-slate-700">
                    {pickedRecords.length} Pallet Diambil
                  </span>
                </div>

                <div className="border border-slate-300 rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase">
                      <tr>
                        <th className="py-2.5 px-2.5 w-10 text-center border-r border-slate-200">No</th>
                        <th className="py-2.5 px-3 w-28 border-r border-slate-200">No Pallet</th>
                        <th className="py-2.5 px-3 border-r border-slate-200">Kode &amp; Nama Barang</th>
                        <th className="py-2.5 px-3 w-20 text-right border-r border-slate-200">Qty</th>
                        <th className="py-2.5 px-3 w-36 border-r border-slate-200">No. Batch / Box</th>
                        <th className="py-2.5 px-3 w-40 border-r border-slate-200">Tujuan Pengambilan</th>
                        <th className="py-2.5 px-3 w-44">Tanggal Pengambilan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono">
                      {pickedRecords.map((r, idx) => (
                        <tr key={r.id} className="bg-slate-50/50 hover:bg-slate-100/80 transition-colors">
                          <td className="py-2.5 px-2.5 text-center text-slate-500 font-bold border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 border-r border-slate-200">
                            <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                              {r.nomorPallet || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200">
                            <span className="font-bold text-blue-700 block">{r.kodeItem || '-'}</span>
                            <span className="font-sans font-medium text-slate-700 text-[11px]">
                              {r.namaBarang}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 border-r border-slate-200">
                            {r.qtyPallet} <span className="font-sans font-normal text-slate-500">{r.unit}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 border-r border-slate-200">
                            <div>Batch: <strong className="text-blue-700">{r.noBatch || '-'}</strong></div>
                            <div className="text-[10px] text-slate-500">
                              Box: {r.boxAwal || r.batchAwal || '-'} - {r.boxAkhir || r.batchAkhir || '-'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 font-sans">
                            <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs">
                              <MapPin className="w-3 h-3 text-emerald-700" />
                              {r.tujuanPengambilan || 'Tujuan Gudang'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-sans text-xs">
                            <div className="font-bold text-slate-900">
                              {formatPickedTime(r.tanggalPengambilan)}
                            </div>
                            {r.petugasPengambilan && (
                              <div className="text-[10px] text-slate-500">
                                Oleh: {r.petugasPengambilan}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPdfInNewTab}
              disabled={isExportingPdf || sortedActiveRecords.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-300 dark:border-blue-800 rounded-lg shadow-xs transition-all disabled:opacity-50"
              title="Buka file PDF langsung di penampil browser / tab baru"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Buka File PDF Asli</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf || sortedActiveRecords.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-all disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Unduh PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak ke Printer</span>
            </button>
          </div>
        </div>
      </div>

      {/* POPUP MODAL PILIH TUJUAN PENGAMBILAN (OUTBOUND SELECTION) */}
      {isPickingModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Konfirmasi Pengambilan Produk
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bin {binCode} · {selectedPalletIds.size} Pallet akan dikeluarkan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPickingModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Pallets Preview */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1.5">
                Pallet yang Dipilih ({selectedPalletIds.size} Pallet):
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {sortedActiveRecords
                  .filter((r) => selectedPalletIds.has(r.id))
                  .map((r) => (
                    <span
                      key={r.id}
                      className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono font-bold text-xs"
                    >
                      #{r.nomorPallet} ({r.qtyPallet} {r.unit})
                    </span>
                  ))}
              </div>
            </div>

            {/* Fixed Choices of Destination (Pilihan: "SJA Sepanjang", "SJA Karawang", "SJA Sukodono", "SJA Semarang") */}
            <div>
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-2">
                Pilih Lokasi Tujuan Pengambilan Produk:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {OUTBOUND_DESTINATIONS.map((dest) => {
                  const isChecked = selectedDestination === dest;
                  return (
                    <button
                      type="button"
                      key={dest}
                      onClick={() => setSelectedDestination(dest)}
                      className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                        isChecked
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 shadow-xs ring-2 ring-blue-500'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <MapPin
                          className={`w-4 h-4 ${isChecked ? 'text-blue-600' : 'text-slate-400'}`}
                        />
                        <span className="text-xs sm:text-sm font-bold">{dest}</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isChecked
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Operator info and timestamp preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                  Nama Petugas Pengambil:
                </label>
                <input
                  type="text"
                  value={petugasName}
                  onChange={(e) => setPetugasName(e.target.value)}
                  placeholder="Nama petugas"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                  Waktu Tercatat:
                </label>
                <div className="px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-mono font-semibold">
                  {new Date().toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPickingModalOpen(false)}
                disabled={isSubmittingOutbound}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleConfirmOutbound}
                disabled={isSubmittingOutbound}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-md transition-all disabled:opacity-50"
              >
                <Truck className="w-4 h-4" />
                <span>
                  {isSubmittingOutbound
                    ? 'Memproses...'
                    : `Konfirmasi Pengambilan (${selectedPalletIds.size} Pallet)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
