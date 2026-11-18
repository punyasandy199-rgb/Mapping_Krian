import React, { useState, useMemo } from 'react';
import {
  PalletRecord,
  PalletQcStatus,
  PALLET_QC_STATUSES,
  PalletBatchEntry,
  WarehouseTransferEntry,
  MasterItem,
  MasterWarehouse,
  SuratJalanRecord,
  DEFAULT_MASTER_WAREHOUSES,
  CANONICAL_WAREHOUSE_LOCATIONS,
  COMMON_UNITS,
  GUDANG5_QUICK_BINS,
  GUDANG5_SLOTS_A,
  GUDANG5_SLOTS_B,
  resolveWarehouseForBin,
  resolvePalletWarehouseLocation,
  computePalletStockStatus,
  resolvePalletQcStatus,
  deriveAsalPacking
} from '../types/warehouse';
import { exportPalletsToCsv } from '../utils/exporter';
import { sortBinRecordsByLoadingOrder } from '../utils/binSorting';
import { calculateBatchBoxCount, getPalletBatches } from '../utils/batchCalculator';
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
  EyeOff,
  Edit3,
  Plus,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  Warehouse
} from 'lucide-react';

interface PalletHistoryTableProps {
  records: PalletRecord[];
  masterItems?: MasterItem[];
  masterWarehouses?: MasterWarehouse[];
  suratJalanHistory?: SuratJalanRecord[];
  onUpdateRecord?: (updated: PalletRecord) => Promise<void> | void;
  onReorderPallets?: (orderedRecords: PalletRecord[]) => Promise<void> | void;
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onNewInput: () => void;
  onProcessOutbound?: (palletIds: string[], destination: string, petugas?: string) => Promise<void> | void;
  onRestoreOutbound?: (palletIds: string[]) => Promise<void> | void;
}

function toDatetimeLocalValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export const PalletHistoryTable: React.FC<PalletHistoryTableProps> = ({
  records,
  masterItems = [],
  masterWarehouses = DEFAULT_MASTER_WAREHOUSES,
  suratJalanHistory = [],
  onUpdateRecord,
  onReorderPallets,
  onDeleteRecord,
  onClearAll,
  onNewInput,
  onProcessOutbound,
  onRestoreOutbound
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBinFilter, setSelectedBinFilter] = useState<string>('ALL');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('ALL');
  const [selectedStockFilter, setSelectedStockFilter] = useState<'ALL' | 'Ada' | 'Habis'>('ALL');
  const [selectedQcStatusFilter, setSelectedQcStatusFilter] = useState<'ALL' | PalletQcStatus>('ALL');
  const [selectedPackingFilter, setSelectedPackingFilter] = useState<'ALL' | 'Packing 1' | 'Packing 2'>('ALL');
  const [displayMode, setDisplayMode] = useState<'per_bin' | 'flat'>('per_bin');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activePrintRecord, setActivePrintRecord] = useState<PalletRecord | null>(null);

  // Per-Bin Accordion state: by default collapsed ("list per bin tidak perlu dilihatkan")
  const [expandedBinCodes, setExpandedBinCodes] = useState<Set<string>>(new Set());

  // Drag-and-drop reorder state (scoped per Bin)
  const [draggedItem, setDraggedItem] = useState<{ id: string; binCode: string } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ id: string; binCode: string } | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  // Edit Pallet Modal state
  const [editingRecord, setEditingRecord] = useState<PalletRecord | null>(null);
  const [editBatches, setEditBatches] = useState<PalletBatchEntry[]>([]);
  const [editOperHistory, setEditOperHistory] = useState<WarehouseTransferEntry[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Quick Oper Gudang Modal state
  const [transferRecord, setTransferRecord] = useState<PalletRecord | null>(null);
  const [transferGudangAsal, setTransferGudangAsal] = useState<string>('SJA 3 (SJA Sukodono)');
  const [transferDari, setTransferDari] = useState<string>('SJA 3 (SJA Sukodono)');
  const [transferKe, setTransferKe] = useState<string>('Gd 137');
  const [transferTanggal, setTransferTanggal] = useState<string>('');
  const [transferBinBaru, setTransferBinBaru] = useState<string>('');
  const [transferPetugas, setTransferPetugas] = useState<string>('');
  const [transferCatatan, setTransferCatatan] = useState<string>('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  const findLinkedSj = (item: PalletRecord) =>
    suratJalanHistory.find(
      (sj) =>
        sj.id === item.suratJalanId ||
        sj.palletIds?.includes(item.id) ||
        (item.noSuratJalan &&
          sj.noSuratJalan?.toUpperCase() === item.noSuratJalan.toUpperCase())
    ) || null;

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

  // Open Edit Modal
  const handleStartEditRecord = (record: PalletRecord) => {
    const existingBatches = getPalletBatches(record);
    const resolvedWh = resolvePalletWarehouseLocation(record, masterWarehouses);
    setEditingRecord({
      ...record,
      statusQc: resolvePalletQcStatus(record),
      lokasiGudang: record.lokasiGudang || resolvedWh,
      gudangAsal: record.gudangAsal || record.operHistory?.[0]?.dariGudang || ''
    });
    setEditBatches(
      existingBatches.length > 0
        ? existingBatches.map((b) => ({
            noBatch: b.noBatch || '',
            boxAwal: b.boxAwal || '',
            boxAkhir: b.boxAkhir || '',
            qtyBox: b.qtyBox
          }))
        : [{ noBatch: record.noBatch || '', boxAwal: record.boxAwal || '', boxAkhir: record.boxAkhir || '' }]
    );
    setEditOperHistory(
      (record.operHistory || []).map((op) => ({
        dariGudang: op.dariGudang || '',
        keGudang: op.keGudang || '',
        tanggalOper: op.tanggalOper || '',
        ...(op.binBaru ? { binBaru: op.binBaru } : {}),
        ...(op.petugas ? { petugas: op.petugas } : {}),
        ...(op.catatan ? { catatan: op.catatan } : {})
      }))
    );
    setEditError(null);
  };

  // Open Quick Oper Gudang Modal
  const handleOpenTransferModal = (record: PalletRecord) => {
    const currentWh = resolvePalletWarehouseLocation(record, masterWarehouses);
    const existingCount = (record.operHistory || []).length;
    const defaultOrigin =
      record.gudangAsal || record.operHistory?.[0]?.dariGudang || 'SJA 3 (SJA Sukodono)';

    // Smart default destination:
    // Oper 1: SJA 3 -> Gd 137 (or Gd Krian)
    // Oper 2: Gd 137 / Gd Krian -> SJA 3 (SJA Sukodono)
    let defaultDest = 'SJA 3 (SJA Sukodono)';
    if (currentWh === 'SJA 3 (SJA Sukodono)') {
      defaultDest = 'Gd 137';
    } else if (existingCount >= 1) {
      defaultDest = 'SJA 3 (SJA Sukodono)';
    }

    setTransferRecord(record);
    setTransferGudangAsal(defaultOrigin);
    setTransferDari(currentWh);
    setTransferKe(defaultDest);
    setTransferTanggal(toDatetimeLocalValue());
    setTransferBinBaru(record.lokasiBin || '');
    setTransferPetugas('');
    setTransferCatatan('');
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferRecord || !onUpdateRecord) return;
    const isoDate = transferTanggal
      ? new Date(transferTanggal).toISOString()
      : new Date().toISOString();
    const binClean = (transferBinBaru || transferRecord.lokasiBin || '').trim().toUpperCase();
    const existingHistory = transferRecord.operHistory || [];
    const newEntry: WarehouseTransferEntry = {
      dariGudang: transferDari,
      keGudang: transferKe,
      tanggalOper: isoDate,
      ...(binClean ? { binBaru: binClean } : {}),
      ...(transferPetugas.trim() ? { petugas: transferPetugas.trim() } : {}),
      ...(transferCatatan.trim() ? { catatan: transferCatatan.trim() } : {})
    };
    const nextHistory = [...existingHistory, newEntry];
    const operStepNum = nextHistory.length;
    const binChanged = binClean !== (transferRecord.lokasiBin || '').toUpperCase();

    const updated: PalletRecord = {
      ...transferRecord,
      lokasiGudang: transferKe,
      gudangAsal: transferGudangAsal || transferRecord.gudangAsal || transferDari,
      lokasiBin: binClean || transferRecord.lokasiBin,
      operHistory: nextHistory,
      ...(binChanged ? { binOrder: undefined } : {}),
      updatedAt: new Date().toISOString(),
      lastUpdateAction: `Oper Gudang ke-${operStepNum}: ${transferDari} → ${transferKe}`
    };

    try {
      setIsSavingTransfer(true);
      await onUpdateRecord(updated);
      setTransferRecord(null);
      setEditSuccessMsg(
        `Oper Gudang ke-${operStepNum} untuk Pallet ${updated.nomorPallet} (${transferDari} → ${transferKe}) berhasil dicatat!`
      );
      setTimeout(() => setEditSuccessMsg(null), 4500);
    } catch (err) {
      console.error('Gagal menyimpan oper gudang:', err);
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const handleSaveEditRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !onUpdateRecord) return;
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
    if (editBatches.length === 0) {
      setEditError('Minimal harus ada 1 Batch pada pallet ini.');
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

    const cleanedOperHistory: WarehouseTransferEntry[] = editOperHistory
      .filter((op) => (op.dariGudang || '').trim() || (op.keGudang || '').trim())
      .map((op) => ({
        dariGudang: (op.dariGudang || '').trim() || 'SJA 3 (SJA Sukodono)',
        keGudang: (op.keGudang || '').trim() || 'Gd Krian',
        tanggalOper: op.tanggalOper || new Date().toISOString(),
        ...(op.binBaru?.trim() ? { binBaru: op.binBaru.trim().toUpperCase() } : {}),
        ...(op.petugas?.trim() ? { petugas: op.petugas.trim() } : {}),
        ...(op.catatan?.trim() ? { catatan: op.catatan.trim() } : {})
      }));

    const resolvedGudang =
      (editingRecord.lokasiGudang || '').trim() ||
      resolvePalletWarehouseLocation(
        { lokasiBin: binClean, lokasiGudang: '' },
        masterWarehouses
      );

    const changedFields: string[] = [];
    if (originalRecord) {
      if ((originalRecord.nomorPallet || '').toUpperCase() !== noPalletClean) changedFields.push('No. Pallet');
      if (resolvePalletQcStatus(originalRecord) !== resolvePalletQcStatus(editingRecord)) changedFields.push('Status');
      if ((originalRecord.lokasiGudang || '') !== resolvedGudang) changedFields.push('Gudang');
      if ((originalRecord.lokasiBin || '').toUpperCase() !== binClean) changedFields.push('Bin');
      if ((originalRecord.namaBarang || '') !== namaClean || (originalRecord.kodeItem || '').toUpperCase() !== kodeClean) {
        changedFields.push('Barang');
      }
      if (Number(originalRecord.qtyPallet) !== qtyNum) changedFields.push('Qty');
      if ((originalRecord.noBatch || '').toUpperCase() !== combinedNoBatch.toUpperCase() ||
          (originalRecord.boxAwal || '').toUpperCase() !== firstBatch.boxAwal ||
          (originalRecord.boxAkhir || '').toUpperCase() !== firstBatch.boxAkhir) {
        changedFields.push('Batch/Box');
      }
      if ((originalRecord.operHistory || []).length !== cleanedOperHistory.length) {
        changedFields.push('Oper Gudang');
      }
      if ((originalRecord.keterangan || '').trim() !== (editingRecord.keterangan?.trim() || '')) {
        changedFields.push('Keterangan');
      }
    }

    const updated: PalletRecord = {
      ...editingRecord,
      nomorPallet: noPalletClean,
      statusQc: resolvePalletQcStatus(editingRecord),
      lokasiBin: binClean,
      lokasiGudang: resolvedGudang,
      ...(editingRecord.gudangAsal?.trim()
        ? { gudangAsal: editingRecord.gudangAsal.trim() }
        : { gudangAsal: '' }),
      operHistory: cleanedOperHistory,
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
      keterangan: editingRecord.keterangan?.trim() || '',
      updatedAt: new Date().toISOString(),
      lastUpdateAction:
        changedFields.length > 0
          ? `Edit Data (${changedFields.join(', ')})`
          : 'Edit Data Pallet',
      ...(binChanged ? { binOrder: undefined } : {})
    };

    try {
      setIsSavingEdit(true);
      await onUpdateRecord(updated);
      setEditingRecord(null);
      setEditSuccessMsg(
        `Data Pallet ${updated.nomorPallet} (${updated.lokasiGudang} · Bin ${updated.lokasiBin}) berhasil diperbarui!`
      );
      setTimeout(() => setEditSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Gagal menyimpan perubahan pallet:', err);
      setEditError('Gagal menyimpan perubahan ke database. Silakan coba lagi.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const q = searchTerm.toLowerCase();
      const whLoc = resolvePalletWarehouseLocation(item, masterWarehouses);
      const linkedSj = findLinkedSj(item);
      const stockStatus = computePalletStockStatus(item, linkedSj);
      const qcStatus = resolvePalletQcStatus(item);
      const packingLabel = deriveAsalPacking(item.noBatch);

      const matchSearch =
        item.namaBarang.toLowerCase().includes(q) ||
        (item.kodeItem && item.kodeItem.toLowerCase().includes(q)) ||
        (item.nomorPallet && item.nomorPallet.toLowerCase().includes(q)) ||
        (item.noBatch && item.noBatch.toLowerCase().includes(q)) ||
        qcStatus.toLowerCase().includes(q) ||
        packingLabel.toLowerCase().includes(q) ||
        item.barcodeNumber.toLowerCase().includes(q) ||
        item.lokasiBin.toLowerCase().includes(q) ||
        whLoc.toLowerCase().includes(q) ||
        (item.gudangAsal && item.gudangAsal.toLowerCase().includes(q)) ||
        (item.boxAwal && item.boxAwal.toLowerCase().includes(q)) ||
        (item.boxAkhir && item.boxAkhir.toLowerCase().includes(q)) ||
        (item.batchAwal && item.batchAwal.toLowerCase().includes(q)) ||
        (item.batchAkhir && item.batchAkhir.toLowerCase().includes(q)) ||
        (item.batches &&
          item.batches.some(
            (b) =>
              b.noBatch.toLowerCase().includes(q) ||
              b.boxAwal.toLowerCase().includes(q) ||
              b.boxAkhir.toLowerCase().includes(q) ||
              deriveAsalPacking(b.noBatch).toLowerCase().includes(q)
          ));

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

      const matchWh =
        selectedWarehouseFilter === 'ALL' || whLoc === selectedWarehouseFilter;
      const matchStock =
        selectedStockFilter === 'ALL' || stockStatus === selectedStockFilter;
      const matchQc =
        selectedQcStatusFilter === 'ALL' || qcStatus === selectedQcStatusFilter;
      const matchPacking =
        selectedPackingFilter === 'ALL' ||
        packingLabel.includes(selectedPackingFilter) ||
        (item.batches || []).some((b) => deriveAsalPacking(b.noBatch) === selectedPackingFilter);

      return matchSearch && matchBin && matchWh && matchStock && matchQc && matchPacking;
    });
  }, [
    records,
    searchTerm,
    selectedBinFilter,
    selectedWarehouseFilter,
    selectedStockFilter,
    selectedQcStatusFilter,
    selectedPackingFilter,
    masterWarehouses,
    suratJalanHistory
  ]);

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

  // Reorder pallets inside a specific Bin (used by drag-and-drop and Up/Down buttons)
  const applyReorderInBin = async (
    binCode: string,
    sortedList: PalletRecord[],
    fromIdx: number,
    toIdx: number
  ) => {
    if (!onReorderPallets || isReordering) return;
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= sortedList.length ||
      toIdx >= sortedList.length
    ) {
      return;
    }
    const nextList = [...sortedList];
    const [moved] = nextList.splice(fromIdx, 1);
    nextList.splice(toIdx, 0, moved);

    try {
      setIsReordering(true);
      await onReorderPallets(nextList);
      setEditSuccessMsg(
        `Urutan fisik pallet di Bin ${binCode} berhasil diperbarui (${moved.nomorPallet || moved.barcodeNumber} → posisi #${toIdx + 1})!`
      );
      setTimeout(() => setEditSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Gagal menyimpan urutan pallet:', err);
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Interactive UI */}
      <div className="no-print space-y-5">
        {editSuccessMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{editSuccessMsg}</span>
          </div>
        )}

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
                <option value="ALL">Semua Bin</option>
                <optgroup label="Kelompok Sisi">
                  <option value="5A">Sisi A (5A.*)</option>
                  <option value="5B">Sisi B (5B.*)</option>
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

            {/* Filter Lokasi Gudang */}
            <select
              value={selectedWarehouseFilter}
              onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              className="text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
              title="Filter berdasarkan Lokasi Gudang"
            >
              <option value="ALL">Semua Lokasi Gudang</option>
              {CANONICAL_WAREHOUSE_LOCATIONS.map((whName) => (
                <option key={whName} value={whName}>
                  {whName}
                </option>
              ))}
            </select>

            {/* Filter Status Stok (Ada / Habis) */}
            <select
              value={selectedStockFilter}
              onChange={(e) =>
                setSelectedStockFilter(e.target.value as 'ALL' | 'Ada' | 'Habis')
              }
              className="text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
              title="Filter berdasarkan Status Stok Produk"
            >
              <option value="ALL">Semua Status Stok</option>
              <option value="Ada">Stok: Ada</option>
              <option value="Habis">Stok: Habis</option>
            </select>

            {/* Filter Status Pallet (OK / BO / HOLD) */}
            <select
              value={selectedQcStatusFilter}
              onChange={(e) =>
                setSelectedQcStatusFilter(e.target.value as 'ALL' | PalletQcStatus)
              }
              className="text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
              title="Filter berdasarkan Status Pallet (OK / BO / HOLD)"
            >
              <option value="ALL">Semua Status</option>
              {PALLET_QC_STATUSES.map((st) => (
                <option key={st} value={st}>
                  Status: {st}
                </option>
              ))}
            </select>

            {/* Filter Asal Packing (Packing 1 / Packing 2) */}
            <select
              value={selectedPackingFilter}
              onChange={(e) =>
                setSelectedPackingFilter(
                  e.target.value as 'ALL' | 'Packing 1' | 'Packing 2'
                )
              }
              className="text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none"
              title="Filter berdasarkan Asal Packing (dari awalan No. Batch A/B)"
            >
              <option value="ALL">Semua Asal Packing</option>
              <option value="Packing 1">Packing 1 (Batch A...)</option>
              <option value="Packing 2">Packing 2 (Batch B...)</option>
            </select>

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
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-black font-mono text-slate-900 dark:text-white">
                            LOKASI BIN: {binGroup.binCode}
                          </h3>
                          {(() => {
                            const sampleItem = binGroup.items[0];
                            const resolvedWh = sampleItem
                              ? resolvePalletWarehouseLocation(sampleItem, masterWarehouses)
                              : 'Gd Krian';
                            const subWh = resolveWarehouseForBin(binGroup.binCode, masterWarehouses, null);
                            return (
                              <>
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                                  {resolvedWh}
                                </span>
                                {subWh && (
                                  <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                                    {subWh.namaGudang}
                                  </span>
                                )}
                              </>
                            );
                          })()}
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
                      {onReorderPallets && sortedItems.length > 1 && (
                        <div className="px-3.5 py-2 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/50 text-[11px] text-blue-800 dark:text-blue-200 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-medium">
                            <GripVertical className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>
                              Sesuaikan urutan fisik di lapangan: <strong>seret baris pallet (⋮⋮)</strong> atau gunakan tombol <strong>▲ / ▼</strong> di sisi kiri.
                            </span>
                          </span>
                          {isReordering && (
                            <span className="text-[10px] font-bold text-blue-600 animate-pulse">
                              Menyimpan urutan...
                            </span>
                          )}
                        </div>
                      )}
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
                            {onReorderPallets && (
                              <th className="py-2.5 px-2 w-20 text-center" title="Seret baris atau klik panah untuk mengubah urutan fisik">
                                Urut
                              </th>
                            )}
                            <th className="py-2.5 px-3 w-10 text-center">No</th>
                            <th className="py-2.5 px-3">No Pallet &amp; Status Stok</th>
                            <th className="py-2.5 px-3">Lokasi Gudang &amp; Oper</th>
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
                            const canReorder = Boolean(onReorderPallets) && sortedItems.length > 1;
                            const isDraggingThis =
                              draggedItem?.id === item.id && draggedItem?.binCode === binGroup.binCode;
                            const isDropTarget =
                              dragOverItem?.id === item.id &&
                              dragOverItem?.binCode === binGroup.binCode &&
                              draggedItem?.id !== item.id &&
                              draggedItem?.binCode === binGroup.binCode;

                            return (
                              <tr
                                key={item.id}
                                draggable={canReorder}
                                onDragStart={(e) => {
                                  if (!canReorder) return;
                                  setDraggedItem({ id: item.id, binCode: binGroup.binCode });
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', item.id);
                                }}
                                onDragOver={(e) => {
                                  if (!canReorder || !draggedItem || draggedItem.binCode !== binGroup.binCode) {
                                    return;
                                  }
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (dragOverItem?.id !== item.id || dragOverItem?.binCode !== binGroup.binCode) {
                                    setDragOverItem({ id: item.id, binCode: binGroup.binCode });
                                  }
                                }}
                                onDragLeave={() => {
                                  if (dragOverItem?.id === item.id && dragOverItem?.binCode === binGroup.binCode) {
                                    setDragOverItem(null);
                                  }
                                }}
                                onDrop={async (e) => {
                                  e.preventDefault();
                                  const activeDrag = draggedItem;
                                  setDraggedItem(null);
                                  setDragOverItem(null);
                                  if (!activeDrag || activeDrag.binCode !== binGroup.binCode) return;
                                  const fromIdx = sortedItems.findIndex((x) => x.id === activeDrag.id);
                                  if (fromIdx !== -1 && fromIdx !== rowIdx) {
                                    await applyReorderInBin(binGroup.binCode, sortedItems, fromIdx, rowIdx);
                                  }
                                }}
                                onDragEnd={() => {
                                  setDraggedItem(null);
                                  setDragOverItem(null);
                                }}
                                className={`transition-colors ${
                                  isDraggingThis
                                    ? 'opacity-45 bg-blue-50/70 dark:bg-blue-950/30'
                                    : isDropTarget
                                    ? 'bg-blue-50 dark:bg-blue-950/50 ring-2 ring-inset ring-blue-500'
                                    : isSelected
                                    ? 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50/80'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
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
                                {onReorderPallets && (
                                  <td className="py-2 px-2 text-center font-sans">
                                    <div className="inline-flex items-center gap-0.5">
                                      <span
                                        className={`p-1 rounded ${
                                          canReorder
                                            ? 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                                            : 'text-slate-200 dark:text-slate-700'
                                        }`}
                                        title={canReorder ? 'Seret untuk pindah urutan pallet' : 'Hanya 1 pallet di bin'}
                                      >
                                        <GripVertical className="w-4 h-4" />
                                      </span>
                                      <button
                                        type="button"
                                        disabled={!canReorder || rowIdx === 0 || isReordering}
                                        onClick={() =>
                                          applyReorderInBin(binGroup.binCode, sortedItems, rowIdx, rowIdx - 1)
                                        }
                                        className="p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                                        title="Naikkan 1 posisi"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          !canReorder || rowIdx === sortedItems.length - 1 || isReordering
                                        }
                                        onClick={() =>
                                          applyReorderInBin(binGroup.binCode, sortedItems, rowIdx, rowIdx + 1)
                                        }
                                        className="p-0.5 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                                        title="Turunkan 1 posisi"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                )}
                                <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono">
                                  {rowIdx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                                  {(() => {
                                    const stockStatus = computePalletStockStatus(
                                      item,
                                      findLinkedSj(item)
                                    );
                                    const qcStatus = resolvePalletQcStatus(item);
                                    const qcClass =
                                      qcStatus === 'OK'
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : qcStatus === 'BO'
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-rose-600 text-white border-rose-600';
                                    return (
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
                                        <span
                                          className={`text-[10px] font-sans font-extrabold px-1.5 py-0.5 rounded border ${qcClass}`}
                                          title={`Status Pallet: ${qcStatus}`}
                                        >
                                          {qcStatus}
                                        </span>
                                        <span
                                          className={`text-[10px] font-sans font-bold px-1.5 py-0.5 rounded border ${
                                            stockStatus === 'Ada'
                                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                          }`}
                                          title={
                                            stockStatus === 'Ada'
                                              ? 'Stok masih tersedia atau dioper ke SJA Sukodono'
                                              : `Stok habis (dikirim ke ${item.tujuanPengambilan || 'tujuan lain'})`
                                          }
                                        >
                                          Stok: {stockStatus}
                                        </span>
                                        {item.status === 'OUT' && (
                                          <span className="text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                            OUT: {item.tujuanPengambilan || 'Diambil'}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="py-2.5 px-3 font-sans text-[11px]">
                                  {(() => {
                                    const whLoc = resolvePalletWarehouseLocation(
                                      item,
                                      masterWarehouses
                                    );
                                    const ops = item.operHistory || [];
                                    return (
                                      <div className="space-y-1">
                                        <span className="inline-block px-2 py-0.5 rounded font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                          {whLoc}
                                        </span>
                                        {ops.length > 0 && (
                                          <div className="space-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                            {ops.slice(0, 2).map((op, opIdx) => (
                                              <div key={opIdx} className="whitespace-nowrap">
                                                <strong>Oper #{opIdx + 1}:</strong> {op.dariGudang} →{' '}
                                                {op.keGudang}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
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
                                  {(() => {
                                    const batches = getPalletBatches(item);
                                    if (batches.length > 1) {
                                      return (
                                        <div className="space-y-0.5">
                                          {batches.map((b, bIdx) => {
                                            const pk = deriveAsalPacking(b.noBatch);
                                            return (
                                              <div key={bIdx} className="whitespace-nowrap flex items-center gap-1">
                                                <span className="text-[10px] text-slate-400">#{bIdx + 1}</span>
                                                <span>{b.noBatch || '-'}</span>
                                                {pk !== '-' && (
                                                  <span className="text-[9px] font-sans font-bold px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                                    {pk}
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    }
                                    const pk = deriveAsalPacking(item.noBatch);
                                    return (
                                      <div className="space-y-0.5">
                                        <div>{item.noBatch || '-'}</div>
                                        {pk !== '-' && (
                                          <span className="inline-block text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                            {pk}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                                  {(() => {
                                    const batches = getPalletBatches(item);
                                    if (batches.length > 1) {
                                      return (
                                        <div className="space-y-0.5">
                                          {batches.map((b, bIdx) => (
                                            <div key={bIdx} className="whitespace-nowrap">
                                              {b.boxAwal || '-'} - {b.boxAkhir || '-'}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return `${item.boxAwal || item.batchAwal || '-'} - ${item.boxAkhir || item.batchAkhir || '-'}`;
                                  })()}
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
                                    {onUpdateRecord && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenTransferModal(item)}
                                          className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer"
                                          title="Catat Oper Gudang (SJA 3 ↔ Gd 137 / Gd Krian)"
                                        >
                                          <ArrowRightLeft className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditRecord(item)}
                                          className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                                          title="Edit data pallet (No. Box, Lokasi Bin, Lokasi Gudang, Batch, Oper Gudang)"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
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
                  <th className="py-3 px-3">No Pallet &amp; Status Stok</th>
                  <th className="py-3 px-3">Lokasi Bin</th>
                  <th className="py-3 px-3">Lokasi Gudang</th>
                  <th className="py-3 px-3">History Oper Gudang</th>
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
                  const stockStatus = computePalletStockStatus(item, findLinkedSj(item));
                  const whLoc = resolvePalletWarehouseLocation(item, masterWarehouses);
                  const ops = item.operHistory || [];

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
                        {(() => {
                          const qcStatus = resolvePalletQcStatus(item);
                          const qcClass =
                            qcStatus === 'OK'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : qcStatus === 'BO'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-rose-600 text-white border-rose-600';
                          return (
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
                              <span
                                className={`text-[10px] font-sans font-extrabold px-1.5 py-0.5 rounded border ${qcClass}`}
                                title={`Status Pallet: ${qcStatus}`}
                              >
                                {qcStatus}
                              </span>
                              <span
                                className={`text-[10px] font-sans font-bold px-1.5 py-0.5 rounded border ${
                                  stockStatus === 'Ada'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                }`}
                              >
                                Stok: {stockStatus}
                              </span>
                              {item.status === 'OUT' && (
                                <span className="text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                  OUT: {item.tujuanPengambilan || 'Diambil'}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                          {item.lokasiBin}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                          {whLoc}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-sans text-[11px] text-slate-600 dark:text-slate-300">
                        {ops.length === 0 ? (
                          <span className="text-slate-400">
                            {item.gudangAsal ? `Asal: ${item.gudangAsal}` : '-'}
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {ops.slice(0, 2).map((op, opIdx) => (
                              <div key={opIdx} className="whitespace-nowrap">
                                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                                  Oper #{opIdx + 1}:
                                </span>{' '}
                                {op.dariGudang} → {op.keGudang}
                              </div>
                            ))}
                          </div>
                        )}
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
                        {(() => {
                          const batches = getPalletBatches(item);
                          if (batches.length > 1) {
                            return (
                              <div className="space-y-0.5">
                                {batches.map((b, bIdx) => {
                                  const pk = deriveAsalPacking(b.noBatch);
                                  return (
                                    <div key={bIdx} className="whitespace-nowrap flex items-center gap-1">
                                      <span className="text-[10px] text-slate-400">#{bIdx + 1}</span>
                                      <span>{b.noBatch || '-'}</span>
                                      {pk !== '-' && (
                                        <span className="text-[9px] font-sans font-bold px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                          {pk}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          const pk = deriveAsalPacking(item.noBatch);
                          return (
                            <div className="space-y-0.5">
                              <div>{item.noBatch || '-'}</div>
                              {pk !== '-' && (
                                <span className="inline-block text-[10px] font-sans font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {pk}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                        {(() => {
                          const batches = getPalletBatches(item);
                          if (batches.length > 1) {
                            return (
                              <div className="space-y-0.5">
                                {batches.map((b, bIdx) => (
                                  <div key={bIdx} className="whitespace-nowrap">
                                    {b.boxAwal || '-'} - {b.boxAkhir || '-'}
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return `${item.boxAwal || item.batchAwal || '-'} - ${item.boxAkhir || item.batchAkhir || '-'}`;
                        })()}
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
                          {onUpdateRecord && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenTransferModal(item)}
                                className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer"
                                title="Catat Oper Gudang (SJA 3 ↔ Gd 137 / Gd Krian)"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEditRecord(item)}
                                className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                                title="Edit data pallet (No. Box, Lokasi Bin, Lokasi Gudang, Batch)"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </>
                          )}
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

      {/* Edit Data Pallet Modal */}
      {editingRecord && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 my-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Edit Data Pallet ({editingRecord.nomorPallet || editingRecord.barcodeNumber})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ubah Nomor Box, Lokasi Bin, Qty, atau tambahkan hingga 2+ Batch dalam 1 Pallet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditRecord} className="space-y-4 text-xs">
              {editError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No Pallet *
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
                    className="w-full font-mono font-bold bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Pallet *
                  </label>
                  <select
                    value={resolvePalletQcStatus(editingRecord)}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        statusQc: e.target.value as PalletQcStatus
                      })
                    }
                    className="w-full font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    {PALLET_QC_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
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
                    placeholder="Contoh: 5A.1"
                    className="w-full font-mono font-extrabold text-blue-700 dark:text-blue-300 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Pilih Cepat Lokasi Bin
                  </label>
                  <select
                    value={
                      GUDANG5_SLOTS_A.includes(editingRecord.lokasiBin) ||
                      GUDANG5_SLOTS_B.includes(editingRecord.lokasiBin)
                        ? editingRecord.lokasiBin
                        : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        setEditingRecord({
                          ...editingRecord,
                          lokasiBin: e.target.value
                        });
                      }
                    }}
                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Pilih Bin Gudang 5 --</option>
                    <optgroup label="Sisi Kiri (5A.1 - 5A.50)">
                      {GUDANG5_SLOTS_A.map((b) => (
                        <option key={b} value={b}>
                          Bin {b}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Sisi Kanan (5B.1 - 5B.50)">
                      {GUDANG5_SLOTS_B.map((b) => (
                        <option key={b} value={b}>
                          Bin {b}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="sm:col-span-6">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lokasi Gudang *
                  </label>
                  <select
                    value={editingRecord.lokasiGudang || 'Gd Krian'}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        lokasiGudang: e.target.value
                      })
                    }
                    className="w-full font-semibold bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                      <option key={wh} value={wh}>
                        {wh}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-6">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Gudang Asal Stock IC (Opsional)
                  </label>
                  <select
                    value={editingRecord.gudangAsal || ''}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        gudangAsal: e.target.value
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">-- Belum Ditentukan --</option>
                    {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                      <option key={wh} value={wh}>
                        {wh}
                      </option>
                    ))}
                  </select>
                </div>

                {masterItems.length > 0 && (
                  <div className="sm:col-span-12">
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pilih dari Master Barang (Opsional)
                    </label>
                    <select
                      value={
                        masterItems.find(
                          (m) =>
                            m.kodeItem === editingRecord.kodeItem &&
                            m.namaBarang === editingRecord.namaBarang
                        )?.id || ''
                      }
                      onChange={(e) => {
                        const found = masterItems.find((m) => m.id === e.target.value);
                        if (found) {
                          setEditingRecord({
                            ...editingRecord,
                            kodeItem: found.kodeItem,
                            namaBarang: found.namaBarang,
                            unit: found.satuan || editingRecord.unit || 'Box'
                          });
                        }
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">-- Pertahankan / Isi Manual di Bawah --</option>
                      {masterItems.map((m) => (
                        <option key={m.id} value={m.id}>
                          [{m.kodeItem}] {m.namaBarang}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full font-mono font-bold text-blue-700 dark:text-blue-300 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Barang *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRecord.namaBarang}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        namaBarang: e.target.value
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-medium"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Qty / Pallet *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={1}
                      required
                      value={editingRecord.qtyPallet}
                      onChange={(e) =>
                        setEditingRecord({
                          ...editingRecord,
                          qtyPallet: Number(e.target.value) || 0
                        })
                      }
                      className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                    />
                    <select
                      value={editingRecord.unit || 'Box'}
                      onChange={(e) =>
                        setEditingRecord({
                          ...editingRecord,
                          unit: e.target.value
                        })
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

              {/* Batches & Box Ranges Section */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Daftar Batch &amp; Nomor Box dalam Pallet Ini ({editBatches.length} Batch)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Edit No. Batch / No. Box Awal &amp; Akhir, atau tambah batch ke-2 dalam 1 pallet
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditBatches((prev) => [
                        ...prev,
                        { noBatch: '', boxAwal: '', boxAkhir: '' }
                      ])
                    }
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Batch</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {editBatches.map((eb, bIdx) => {
                    const bCalc = calculateBatchBoxCount(eb.boxAwal, eb.boxAkhir);
                    return (
                      <div
                        key={bIdx}
                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                      >
                        <div className="sm:col-span-2 flex items-center gap-1.5 self-center">
                          <span className="px-2 py-0.5 rounded bg-slate-800 dark:bg-blue-600 text-white font-mono font-bold text-[11px]">
                            Batch #{bIdx + 1}
                          </span>
                          {bCalc?.isValid && (
                            <span className="text-[10px] font-mono font-bold text-emerald-600">
                              ({bCalc.totalBox} Box)
                            </span>
                          )}
                        </div>

                        <div className="sm:col-span-3">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                              No. Batch *
                            </label>
                            {deriveAsalPacking(eb.noBatch) !== '-' && (
                              <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                                {deriveAsalPacking(eb.noBatch)}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            required
                            value={eb.noBatch}
                            onChange={(e) =>
                              setEditBatches((prev) =>
                                prev.map((item, idx) =>
                                  idx === bIdx
                                    ? { ...item, noBatch: e.target.value.toUpperCase() }
                                    : item
                                )
                              )
                            }
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                            No. Box Awal *
                          </label>
                          <input
                            type="text"
                            required
                            value={eb.boxAwal}
                            onChange={(e) =>
                              setEditBatches((prev) =>
                                prev.map((item, idx) =>
                                  idx === bIdx
                                    ? { ...item, boxAwal: e.target.value.toUpperCase() }
                                    : item
                                )
                              )
                            }
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                            No. Box Akhir *
                          </label>
                          <input
                            type="text"
                            required
                            value={eb.boxAkhir}
                            onChange={(e) =>
                              setEditBatches((prev) =>
                                prev.map((item, idx) =>
                                  idx === bIdx
                                    ? { ...item, boxAkhir: e.target.value.toUpperCase() }
                                    : item
                                )
                              )
                            }
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          {editBatches.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditBatches((prev) => prev.filter((_, idx) => idx !== bIdx))
                              }
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                              title={`Hapus Batch #${bIdx + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const totalBoxSum = editBatches.reduce((sum, b) => {
                    const c = calculateBatchBoxCount(b.boxAwal, b.boxAkhir);
                    return sum + (c?.isValid ? c.totalBox : 0);
                  }, 0);
                  if (totalBoxSum > 0 && totalBoxSum !== Number(editingRecord.qtyPallet)) {
                    return (
                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-600 dark:text-slate-400">
                          Total hitungan rentang No. Box: <strong className="text-emerald-700 dark:text-emerald-300">{totalBoxSum} Box</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingRecord({ ...editingRecord, qtyPallet: totalBoxSum })
                          }
                          className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold cursor-pointer"
                        >
                          ← Terapkan Total ({totalBoxSum} Box) ke Qty
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* 2-Stage Oper Gudang History Editor */}
              <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                      <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        Riwayat Oper Gudang ({editOperHistory.length}/2 Kali)
                      </span>
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Alur IC: SJA 3 → Gd 137 / Gd Krian (Oper 1) → kembali ke SJA 3 (Oper 2)
                    </p>
                  </div>
                  {editOperHistory.length < 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const isSecond = editOperHistory.length === 1;
                        const prevKe = editOperHistory[0]?.keGudang || editingRecord.lokasiGudang || 'Gd 137';
                        setEditOperHistory((prev) => [
                          ...prev,
                          {
                            dariGudang: isSecond ? prevKe : editingRecord.gudangAsal || 'SJA 3 (SJA Sukodono)',
                            keGudang: isSecond ? 'SJA 3 (SJA Sukodono)' : 'Gd 137',
                            tanggalOper: new Date().toISOString(),
                            binBaru: editingRecord.lokasiBin || ''
                          }
                        ]);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Oper Gudang #{editOperHistory.length + 1}</span>
                    </button>
                  )}
                </div>

                {editOperHistory.length > 0 && (
                  <div className="space-y-2">
                    {editOperHistory.map((op, opIdx) => (
                      <div
                        key={opIdx}
                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                      >
                        <div className="sm:col-span-2 self-center">
                          <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono font-bold text-[11px]">
                            Oper #{opIdx + 1}
                          </span>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Dari Gudang
                          </label>
                          <select
                            value={op.dariGudang}
                            onChange={(e) =>
                              setEditOperHistory((prev) =>
                                prev.map((x, idx) =>
                                  idx === opIdx ? { ...x, dariGudang: e.target.value } : x
                                )
                              )
                            }
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[11px]"
                          >
                            {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                              <option key={wh} value={wh}>
                                {wh}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Ke Gudang
                          </label>
                          <select
                            value={op.keGudang}
                            onChange={(e) =>
                              setEditOperHistory((prev) =>
                                prev.map((x, idx) =>
                                  idx === opIdx ? { ...x, keGudang: e.target.value } : x
                                )
                              )
                            }
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[11px]"
                          >
                            {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                              <option key={wh} value={wh}>
                                {wh}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                            Tgl Oper Gudang
                          </label>
                          <input
                            type="datetime-local"
                            value={toDatetimeLocalValue(op.tanggalOper)}
                            onChange={(e) =>
                              setEditOperHistory((prev) =>
                                prev.map((x, idx) =>
                                  idx === opIdx
                                    ? {
                                        ...x,
                                        tanggalOper: e.target.value
                                          ? new Date(e.target.value).toISOString()
                                          : new Date().toISOString()
                                      }
                                    : x
                                )
                              )
                            }
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-[11px]"
                          />
                        </div>
                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setEditOperHistory((prev) => prev.filter((_, idx) => idx !== opIdx))
                            }
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            title={`Hapus Oper #${opIdx + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Keterangan / Catatan
                </label>
                <input
                  type="text"
                  value={editingRecord.keterangan || ''}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, keterangan: e.target.value })
                  }
                  placeholder="Catatan opsional"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Oper Gudang Modal */}
      {transferRecord && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 my-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-xl">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Catat Oper Gudang ke-{(transferRecord.operHistory?.length || 0) + 1}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pallet {transferRecord.nomorPallet || transferRecord.barcodeNumber} &middot;{' '}
                    {transferRecord.namaBarang}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(transferRecord.operHistory || []).length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                <div className="font-bold text-slate-700 dark:text-slate-300">
                  Riwayat Oper Sebelumnya:
                </div>
                {(transferRecord.operHistory || []).map((op, i) => (
                  <div key={i} className="text-[11px] text-slate-600 dark:text-slate-300">
                    <strong>Oper #{i + 1}:</strong> {op.dariGudang} → {op.keGudang} (
                    {new Date(op.tanggalOper).toLocaleString('id-ID')})
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleConfirmTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Gudang Asal Stock IC
                </label>
                <select
                  value={transferGudangAsal}
                  onChange={(e) => setTransferGudangAsal(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                    <option key={wh} value={wh}>
                      {wh}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dari Gudang Saat Ini *
                  </label>
                  <select
                    value={transferDari}
                    onChange={(e) => setTransferDari(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-semibold"
                  >
                    {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                      <option key={wh} value={wh}>
                        {wh}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-indigo-700 dark:text-indigo-300 mb-1">
                    Oper Ke Gudang Tujuan *
                  </label>
                  <select
                    value={transferKe}
                    onChange={(e) => setTransferKe(e.target.value)}
                    className="w-full bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-bold"
                  >
                    {CANONICAL_WAREHOUSE_LOCATIONS.map((wh) => (
                      <option key={wh} value={wh}>
                        {wh}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal &amp; Jam Oper
                  </label>
                  <input
                    type="datetime-local"
                    value={transferTanggal}
                    onChange={(e) => setTransferTanggal(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lokasi Bin Baru (Opsional)
                  </label>
                  <input
                    type="text"
                    value={transferBinBaru}
                    onChange={(e) => setTransferBinBaru(e.target.value.toUpperCase())}
                    placeholder="Contoh: 5A.1"
                    className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Petugas (Opsional)
                  </label>
                  <input
                    type="text"
                    value={transferPetugas}
                    onChange={(e) => setTransferPetugas(e.target.value)}
                    placeholder="Nama petugas lapangan"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Catatan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={transferCatatan}
                    onChange={(e) => setTransferCatatan(e.target.value)}
                    placeholder="Keterangan perpindahan"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTransferRecord(null)}
                  disabled={isSavingTransfer}
                  className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingTransfer}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{isSavingTransfer ? 'Menyimpan...' : 'Simpan Oper Gudang'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          records={
            groupedBins.find((g) => g.binCode === binManifestTarget.binCode)?.items ??
            binManifestTarget.records
          }
          onReorderPallets={onReorderPallets}
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
