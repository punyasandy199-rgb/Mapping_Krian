import React, { useState, useRef } from 'react';
import { MasterItem, PalletRecord } from '../types/warehouse';
import {
  Download,
  Upload,
  X,
  Database,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Info,
  Layers,
  Box
} from 'lucide-react';

interface BackupDataStructure {
  appName: string;
  version: string;
  exportedAt: string;
  masterItems: MasterItem[];
  records: PalletRecord[];
}

interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterItems: MasterItem[];
  records: PalletRecord[];
  onImportData: (
    newMaster: MasterItem[],
    newRecords: PalletRecord[],
    mode: 'merge' | 'replace'
  ) => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  isOpen,
  onClose,
  masterItems,
  records,
  onImportData
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<BackupDataStructure | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle Export to JSON file
  const handleExportJson = () => {
    const backup: BackupDataStructure = {
      appName: 'PalletTrack Gudang 5',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      masterItems,
      records
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `wh_backup_gudang5_${dateStr}.json`;

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setSuccessMessage(`File cadangan ${filename} berhasil diunduh!`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Handle File Input Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setParsedData(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Validate structure
        const items = Array.isArray(parsed.masterItems) ? parsed.masterItems : [];
        const recs = Array.isArray(parsed.records) ? parsed.records : [];

        if (items.length === 0 && recs.length === 0) {
          setParseError('File JSON tidak berisi data master barang atau riwayat pallet yang valid.');
          return;
        }

        setParsedData({
          appName: parsed.appName || 'PalletTrack',
          version: parsed.version || '1.0',
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          masterItems: items,
          records: recs
        });
      } catch (err) {
        setParseError('Format file tidak valid. Pastikan file berupa JSON cadangan.');
      }
    };
    reader.onerror = () => {
      setParseError('Gagal membaca file dari perangkat.');
    };
    reader.readAsText(file);
  };

  // Execute Import
  const handleExecuteImport = () => {
    if (!parsedData) return;

    onImportData(parsedData.masterItems, parsedData.records, importMode);
    setSuccessMessage(
      `Berhasil memulihkan ${parsedData.masterItems.length} Master Barang & ${parsedData.records.length} Riwayat Pallet!`
    );
    setSelectedFile(null);
    setParsedData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs no-print">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Sinkronisasi & Cadangan Data JSON
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sinkronkan data antara AI Studio dan domain GitHub Pages
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

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Success Banner */}
          {successMessage && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Explanation Banner */}
          <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-3.5 text-xs text-blue-900 dark:text-blue-200 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-blue-800 dark:text-blue-300">
              <Info className="w-4 h-4 shrink-0 text-blue-600" />
              Mengapa data di GitHub Pages berbeda dengan di sini?
            </div>
            <p className="text-[11px] leading-relaxed text-blue-800/90 dark:text-blue-300/90">
              Browser mengunci penyimpanan data (<em>localStorage</em>) per alamat web untuk keamanan.
              Gunakan file cadangan JSON ini untuk memindahkan semua data master barang & riwayat pallet dari sini ke web GitHub Pages Anda dengan 1x klik.
            </p>
          </div>

          {/* Section 1: Ekspor Cadangan */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-600" />
                  1. Unduh Cadangan Data (.json)
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Simpan {masterItems.length} Master Barang & {records.length} Riwayat Pallet saat ini ke file JSON.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh JSON</span>
              </button>
            </div>
          </div>

          {/* Section 2: Impor Cadangan */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-600" />
                2. Impor / Pulihkan Data (.json)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Unggah file cadangan JSON untuk disinkronkan ke halaman web ini.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 dark:file:bg-slate-700 dark:file:text-slate-200 cursor-pointer border border-slate-300 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-900"
              />
            </div>

            {parseError && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Preview of Parsed File */}
            {parsedData && (
              <div className="p-3 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-lg space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                    <FileJson className="w-4 h-4 text-emerald-600" />
                    Data Siap Dipulihkan:
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Dibuat: {new Date(parsedData.exportedAt).toLocaleDateString('id-ID')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 block text-[10px]">Master Barang</span>
                    <strong className="text-slate-900 dark:text-white font-mono text-sm">
                      {parsedData.masterItems.length} Item
                    </strong>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 block text-[10px]">Riwayat Pallet</span>
                    <strong className="text-slate-900 dark:text-white font-mono text-sm">
                      {parsedData.records.length} Transaksi
                    </strong>
                  </div>
                </div>

                {/* Import Mode Radio */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Metode Pemulihan:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        importMode === 'merge'
                          ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          Gabungkan Data
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight block">
                          Menambahkan data baru tanpa menghapus data yang sudah ada.
                        </span>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        importMode === 'replace'
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-amber-700 dark:text-amber-400 block">
                          Timpa Bersih
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight block">
                          Mengganti total seluruh data saat ini dengan file cadangan.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExecuteImport}
                  className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Pulihkan Data Sekarang ({importMode === 'merge' ? 'Gabung' : 'Timpa Bersih'})</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Total aktif: {masterItems.length} Master · {records.length} Riwayat Pallet
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
