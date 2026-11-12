import React, { useState, useMemo } from 'react';
import { PalletRecord, GUDANG5_QUICK_BINS } from '../types/warehouse';
import { exportPalletsToCsv } from '../utils/exporter';
import { sortBinRecordsByLoadingOrder } from '../utils/binSorting';
import {
  downloadPalletLabelPdf,
  downloadPalletHistoryReportPdf,
  downloadBinManifestPdf
} from '../utils/pdfGenerator';
import { ThermalLabelCard } from './ThermalLabelCard';
import { PrintLabelModal } from './PrintLabelModal';
import { PrintBinManifestModal } from './PrintBinManifestModal';
import { QrCodeRenderer } from './QrCodeRenderer';
import {
  Search,
  Filter,
  FileSpreadsheet,
  Printer,
  FileDown,
  Trash2,
  Barcode,
  Layers,
  MapPin,
  CheckSquare,
  Square,
  Box,
  Tag,
  LayoutGrid,
  Table as TableIcon,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';

interface PalletHistoryTableProps {
  records: PalletRecord[];
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onNewInput: () => void;
  onProcessOutbound?: (palletIds: string[], destination: string, petugas?: string) => Promise<void> | void;
  onRestoreOutbound?: (palletIds: string[]) => Promise<void> | void;
}

export const PalletHistoryTable: React.FC<PalletHistoryTableProps> = ({
  records,
  onDeleteRecord,
  onClearAll,
  onNewInput,
  onProcessOutbound,
  onRestoreOutbound
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBinFilter, setSelectedBinFilter] = useState<string>('ALL');
  const [displayMode, setDisplayMode] = useState<'per_bin' | 'flat'>('per_bin');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activePrintRecord, setActivePrintRecord] = useState<PalletRecord | null>(null);

  // Per-Bin Accordion state: by default collapsed ("list per bin tidak perlu dilihatkan")
  const [expandedBinCodes, setExpandedBinCodes] = useState<Set<string>>(new Set());

  const toggleExpandBin = (binCode: string) => {
    setExpandedBinCodes((prev) => {
      const next = new Set(prev);
      if (next.has(binCode)) {
        next.delete(binCode);
      } else {
        next.add(binCode);
      }
      return next;
    });
  };

  const handleToggleAllBins = () => {
    if (expandedBinCodes.size === groupedBins.length) {
      setExpandedBinCodes(new Set());
    } else {
      setExpandedBinCodes(new Set(groupedBins.map((g) => g.binCode)));
    }
  };

  // Modal Cetak Label Thermal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [modalRecords, setModalRecords] = useState<PalletRecord[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Modal Cetak Manifest Lembar Bin
  const [binManifestTarget, setBinManifestTarget] = useState<{
    binCode: string;
    records: PalletRecord[];
  } | null>(null);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        item.namaBarang.toLowerCase().includes(q) ||
        (item.kodeItem && item.kodeItem.toLowerCase().includes(q)) ||
        (item.nomorPallet && item.nomorPallet.toLowerCase().includes(q)) ||
        (item.noBatch && item.noBatch.toLowerCase().includes(q)) ||
        item.barcodeNumber.toLowerCase().includes(q) ||
        item.lokasiBin.toLowerCase().includes(q) ||
        (item.boxAwal && item.boxAwal.toLowerCase().includes(q)) ||
        (item.boxAkhir && item.boxAkhir.toLowerCase().includes(q)) ||
        (item.batchAwal && item.batchAwal.toLowerCase().includes(q)) ||
        (item.batchAkhir && item.batchAkhir.toLowerCase().includes(q));

      // Filter by Bin or Zone
      let matchBin = true;
      if (selectedBinFilter === 'ALL') {
        matchBin = true;
      } else if (selectedBinFilter === '5A') {
        matchBin = item.lokasiBin.toUpperCase().startsWith('5A');
      } else if (selectedBinFilter === '5B') {
        matchBin = item.lokasiBin.toUpperCase().startsWith('5B');
      } else {
        matchBin = item.lokasiBin.toUpperCase() === selectedBinFilter.toUpperCase();
      }

      return matchSearch && matchBin;
    });
  }, [records, searchTerm, selectedBinFilter]);

  // Group filtered records by Bin (Auto-aggregating per Bin when new pallets are added)
  const groupedBins = useMemo(() => {
    const map: Record<string, PalletRecord[]> = {};
    filteredRecords.forEach((item) => {
      const bin = (item.lokasiBin || 'UNKNOWN').toUpperCase();
      if (!map[bin]) {
        map[bin] = [];
      }
      map[bin].push(item);
    });

    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((binCode) => {
        const rawItems = map[binCode];
        // Sort according to warehouse loading rule:
        // Item entered first is at the very end; newly added pallets fill previous numbers (No. 1).
        const items = sortBinRecordsByLoadingOrder(rawItems);
        const uniquePallets = new Set(items.map((r) => r.nomorPallet || r.id)).size;
        const totalQty = items.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0);
        return {
          binCode,
          items,
          uniquePallets,
          totalQty
        };
      });
  }, [filteredRecords]);

  // Dynamic available bins in dropdown
  const allAvailableBins = useMemo(() => {
    const activeBins = Array.from(new Set(records.map((r) => r.lokasiBin.toUpperCase())));
    const set = new Set([...GUDANG5_QUICK_BINS, ...activeBins]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [records]);

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

  const handleOpenPrintModal = (recordsToPrint: PalletRecord[]) => {
    if (!recordsToPrint || recordsToPrint.length === 0) return;
    setModalRecords(recordsToPrint);
    setActivePrintRecord(recordsToPrint.length === 1 ? recordsToPrint[0] : null);
    setIsPrintModalOpen(true);
  };

  const handleQuickDownloadPdf = async (record: PalletRecord) => {
    try {
      setIsExportingPdf(true);
      await downloadPalletLabelPdf([record]);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunduh PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleQuickDownloadSelectedPdf = async () => {
    const selectedRecords = records.filter((r) => selectedIds.has(r.id));
    if (selectedRecords.length === 0) return;
    try {
      setIsExportingPdf(true);
      await downloadPalletLabelPdf(selectedRecords);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunduh PDF label terpilih');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadA4Report = async () => {
    const target = selectedIds.size > 0 ? records.filter((r) => selectedIds.has(r.id)) : filteredRecords;
    if (target.length === 0) return;
    try {
      setIsExportingPdf(true);
      await downloadPalletHistoryReportPdf(target);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunduh laporan PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintRecord = (record: PalletRecord) => {
    handleOpenPrintModal([record]);
  };

  const handlePrintSelected = () => {
    const selectedRecords = records.filter((r) => selectedIds.has(r.id));
    if (selectedRecords.length === 0) return;
    handleOpenPrintModal(selectedRecords);
  };

  const handleOpenBinManifestModal = (binCode: string, items: PalletRecord[]) => {
    setBinManifestTarget({ binCode, records: items });
  };

  const handleDownloadBinManifest = async (binCode: string, items: PalletRecord[]) => {
    try {
      setIsExportingPdf(true);
      await downloadBinManifestPdf(binCode, items);
    } catch (err) {
      console.error(err);
      alert('Gagal mengunduh PDF kartu bin');
    } finally {
      setIsExportingPdf(false);
    }
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
              {totalQty.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-500">Box</span>
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
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari no pallet, kode item, nama barang, batch, bin..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter Per Bin Specific */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedBinFilter}
                onChange={(e) => setSelectedBinFilter(e.target.value)}
                className="text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">Semua Bin (Gudang 5)</option>
                <optgroup label="Kelompok Sisi">
                  <option value="5A">Gudang 5 Sisi A (5A.*)</option>
                  <option value="5B">Gudang 5 Sisi B (5B.*)</option>
                </optgroup>
                <optgroup label="Pilih Per Bin Saja">
                  {allAvailableBins.map((bin) => (
                    <option key={bin} value={bin}>
                      Bin {bin}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Display Mode Switch: Per Bin vs Flat Table */}
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setDisplayMode('per_bin')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
                  displayMode === 'per_bin'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Kelompokkan data per lokasi Bin (memudahkan cek muatan per bin)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Per Bin ({groupedBins.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('flat')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
                  displayMode === 'flat'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilkan semua baris pallet dalam satu tabel datar"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Semua Baris ({filteredRecords.length})</span>
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 ? (
              <>
                <button
                  type="button"
                  onClick={handlePrintSelected}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
                  title="Buka dialog cetak ke printer / PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Label ({selectedIds.size})</span>
                </button>

                <button
                  type="button"
                  onClick={handleQuickDownloadSelectedPdf}
                  disabled={isExportingPdf}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
                  title="Unduh file PDF label pallet terpilih"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Unduh PDF ({selectedIds.size})</span>
                </button>
              </>
            ) : (
              filteredRecords.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadA4Report}
                  disabled={isExportingPdf}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                  title="Unduh laporan riwayat pallet format tabel A4 (PDF)"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>Laporan PDF</span>
                </button>
              )
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

        {/* Content Render: Empty vs Per Bin vs Flat Table */}
        {filteredRecords.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
            <Barcode className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              {selectedBinFilter !== 'ALL'
                ? `Belum ada muatan di Bin ${selectedBinFilter}`
                : 'Belum ada data pallet tersimpan'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              {selectedBinFilter !== 'ALL'
                ? `Bin ${selectedBinFilter} masih kosong. Silakan input pallet dan alokasikan ke bin ini.`
                : 'Silakan input nomor pallet, lokasi Bin (cth: 5A.1), dan data barang untuk menerbitkan barcode pertama.'}
            </p>
            <button
              type="button"
              onClick={onNewInput}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
            >
              + Input Pallet Sekarang
            </button>
          </div>
        ) : displayMode === 'per_bin' ? (
          /* ============================================================ */
          /* MODE 1: RIWAYAT PER LOKASI BIN (GROUPED BY BIN)               */
          /* ============================================================ */
          <div className="space-y-4">
            {/* Quick Helper Bar */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <span>
                Menampilkan <strong>{groupedBins.length}</strong> Bin di Gudang 5 · Klik tombol ikon{' '}
                <strong>mata</strong> untuk melihat rincian muatan tiap bin.
              </span>
              <button
                type="button"
                onClick={handleToggleAllBins}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1"
              >
                {expandedBinCodes.size === groupedBins.length ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Sembunyikan Semua
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Buka Semua Detail
                  </>
                )}
              </button>
            </div>

            {groupedBins.map((binGroup) => {
              const isExpanded = expandedBinCodes.has(binGroup.binCode);
              const scanUrl =
                typeof window !== 'undefined'
                  ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(
                      binGroup.binCode
                    )}`
                  : `?bin=${binGroup.binCode}`;

              // Dominant item names for compact preview
              const distinctItems = Array.from(
                new Set(binGroup.items.map((r) => r.namaBarang).filter(Boolean))
              );

              // Items are already sorted by loading order: row 1 is latest added pallet, bottom row is first entered
              const sortedItems = binGroup.items;

              return (
                <div
                  key={binGroup.binCode}
                  className="bg-white dark:bg-slate-900 rounded-xl border-2 border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-all"
                >
                  {/* Bin Header Card Banner */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black font-mono text-slate-900 dark:text-white">
                            LOKASI BIN: {binGroup.binCode}
                          </h3>
                          <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                            Gudang 5
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-slate-600 dark:text-slate-300 font-mono">
                          <span className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                            <Box className="w-3.5 h-3.5 text-blue-600" /> {binGroup.uniquePallets} Pallet
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                            <Layers className="w-3.5 h-3.5 text-emerald-600" /> {binGroup.totalQty.toLocaleString('id-ID')} Box
                          </span>
                          <span>•</span>
                          <span className="text-slate-500 font-sans">
                            {binGroup.items.length} Baris Muatan
                          </span>
                          {distinctItems.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="font-sans font-bold text-slate-800 dark:text-slate-200 truncate max-w-[240px]">
                                {distinctItems.join(' / ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bin Actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="shrink-0 bg-white p-1 rounded border border-slate-200 dark:border-slate-700 hidden sm:block">
                        <QrCodeRenderer
                          value={scanUrl}
                          size={46}
                          showLabel={false}
                          className="p-0 border-0 shadow-none"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Eye Toggle Button (Icon only) */}
                        <button
                          type="button"
                          onClick={() => toggleExpandBin(binGroup.binCode)}
                          className={`p-2 rounded-lg border transition-all ${
                            isExpanded
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={isExpanded ? 'Sembunyikan daftar muatan bin ini' : 'Buka & lihat detail muatan bin ini'}
                        >
                          {isExpanded ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </button>

                        {/* PDF Download Button (Icon only) */}
                        <button
                          type="button"
                          onClick={() => handleDownloadBinManifest(binGroup.binCode, binGroup.items)}
                          disabled={isExportingPdf}
                          className="p-2 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg border border-emerald-300 dark:border-emerald-800 transition-colors disabled:opacity-50"
                          title="Unduh PDF Lembar Bin"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>

                        {/* Print Button (Icon only) */}
                        <button
                          type="button"
                          onClick={() => handleOpenBinManifestModal(binGroup.binCode, binGroup.items)}
                          className="p-2 text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
                          title="Cetak Lembar Bin"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Table of items in this specific bin (Only shown when expanded via Eye button) */}
                  {isExpanded && (
                    <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                            <th className="py-2.5 px-3 w-10 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const allInBinSelected = sortedItems.every((i) => selectedIds.has(i.id));
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    sortedItems.forEach((i) => {
                                      if (allInBinSelected) next.delete(i.id);
                                      else next.add(i.id);
                                    });
                                    return next;
                                  });
                                }}
                                className="text-slate-400 hover:text-slate-700"
                              >
                                {sortedItems.every((i) => selectedIds.has(i.id)) ? (
                                  <CheckSquare className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </th>
                            <th className="py-2.5 px-3 w-10 text-center">No</th>
                            <th className="py-2.5 px-3">No Pallet</th>
                            <th className="py-2.5 px-3">Kode Item</th>
                            <th className="py-2.5 px-3">Nama Barang</th>
                            <th className="py-2.5 px-3 text-right">Qty</th>
                            <th className="py-2.5 px-3">No. Batch</th>
                            <th className="py-2.5 px-3">Rentang No. Box</th>
                            <th className="py-2.5 px-3">No Barcode</th>
                            <th className="py-2.5 px-3">Waktu Inbound</th>
                            <th className="py-2.5 px-3 text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                          {sortedItems.map((item, rowIdx) => {
                            const isSelected = selectedIds.has(item.id);

                            return (
                              <tr
                                key={item.id}
                                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                                  isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 text-center">
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
                                <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono">
                                  {rowIdx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`px-2 py-0.5 rounded border text-xs ${
                                        item.status === 'OUT'
                                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 line-through'
                                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-900'
                                      }`}
                                    >
                                      {item.nomorPallet || '-'}
                                    </span>
                                    {item.status === 'OUT' && (
                                      <span className="text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                        OUT: {item.tujuanPengambilan || 'Diambil'}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-bold text-blue-600 dark:text-blue-400">
                                  {item.kodeItem || '-'}
                                </td>
                                <td className="py-2.5 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                                  {item.namaBarang}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                                  {item.qtyPallet}{' '}
                                  <span className="text-[11px] font-normal text-slate-500 font-sans">
                                    {item.unit}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-bold text-blue-700 dark:text-blue-400">
                                  {item.noBatch || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                                  {item.boxAwal || item.batchAwal || '-'} - {item.boxAkhir || item.batchAkhir || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-800 dark:text-slate-200 font-bold">
                                  {item.barcodeNumber}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 text-[11px] font-sans">
                                  {new Date(item.submittedAt).toLocaleDateString('id-ID', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </td>
                                <td className="py-2.5 px-3 text-center font-sans">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handlePrintRecord(item)}
                                      className="p-1.5 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors"
                                      title="Cetak label pallet thermal (100x150 mm)"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickDownloadPdf(item)}
                                      disabled={isExportingPdf}
                                      className="p-1.5 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors disabled:opacity-40"
                                      title="Unduh file PDF label pallet thermal"
                                    >
                                      <FileDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDeleteRecord(item.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
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
              );
            })}
          </div>
        ) : (
          /* ============================================================ */
          /* MODE 2: TABEL FLAT SEMUA BARIS                                */
          /* ============================================================ */
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
                  <th className="py-3 px-3">No. Batch</th>
                  <th className="py-3 px-3">Rentang No. Box</th>
                  <th className="py-3 px-3">Waktu Input</th>
                  <th className="py-3 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
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
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded font-bold border text-xs ${
                              item.status === 'OUT'
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 line-through'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-900'
                            }`}
                          >
                            {item.nomorPallet || '-'}
                          </span>
                          {item.status === 'OUT' && (
                            <span className="text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              OUT: {item.tujuanPengambilan || 'Diambil'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                          {item.lokasiBin}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400">
                        {item.kodeItem || '-'}
                      </td>
                      <td className="py-3 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                        {item.namaBarang}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {item.barcodeNumber}
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                        {item.qtyPallet}{' '}
                        <span className="text-[11px] font-normal text-slate-500 font-sans">{item.unit}</span>
                      </td>
                      <td className="py-3 px-3 font-bold text-blue-700 dark:text-blue-400">
                        {item.noBatch || '-'}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                        {item.boxAwal || item.batchAwal || '-'} - {item.boxAkhir || item.batchAkhir || '-'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px] font-sans">
                        {new Date(item.submittedAt).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-3 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePrintRecord(item)}
                            className="p-1.5 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors"
                            title="Buka dialog Cetak ke Printer / Unduh PDF"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickDownloadPdf(item)}
                            disabled={isExportingPdf}
                            className="p-1.5 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors disabled:opacity-40"
                            title="Unduh langsung file PDF label thermal (100x150 mm)"
                          >
                            <FileDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                            title="Hapus baris ini"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Print & PDF Modal for Pallet Thermal Labels */}
      <PrintLabelModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        records={modalRecords}
      />

      {/* Print Bin Manifest Modal for Bin Card */}
      {binManifestTarget && (
        <PrintBinManifestModal
          isOpen={true}
          onClose={() => setBinManifestTarget(null)}
          binCode={binManifestTarget.binCode}
          records={binManifestTarget.records}
          onProcessOutbound={onProcessOutbound}
          onRestoreOutbound={onRestoreOutbound}
        />
      )}

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
