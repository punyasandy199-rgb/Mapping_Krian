import React, { useState, useEffect } from 'react';
import {
  PalletRowInput,
  PalletRecord,
  BatchSubmission,
  MasterItem,
  DEFAULT_MASTER_ITEMS
} from './types/warehouse';
import { generatePalletBarcode } from './utils/code128';
import { PalletInputForm } from './components/PalletInputForm';
import { BarcodeResultsView } from './components/BarcodeResultsView';
import { PalletHistoryTable } from './components/PalletHistoryTable';
import { WarehouseBinViewer } from './components/WarehouseBinViewer';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { MasterItemModal } from './components/MasterItemModal';
import { BinDetailModal } from './components/BinDetailModal';
import { DataBackupModal } from './components/DataBackupModal';
import {
  subscribeToPalletRecords,
  savePalletRecordsBatch,
  deletePalletRecord,
  clearAllPalletRecords,
  subscribeToMasterItems,
  saveMasterItem,
  deleteMasterItem,
  seedMasterItems
} from './services/firebase';
import {
  Boxes,
  Barcode,
  History,
  MapPin,
  Moon,
  Sun,
  Search,
  PlusCircle,
  ShieldCheck,
  Database,
  RefreshCw,
  Cloud,
  CheckCircle2
} from 'lucide-react';

// Persistent storage keys with multi-version fallback to prevent data loss
const MASTER_STORAGE_KEYS = [
  'wh_master_items_stable',
  'wh_master_items_v1',
  'wh_master_items_v2',
  'wh_master_items'
];

const RECORD_STORAGE_KEYS = [
  'wh_pallet_inbound_records_stable',
  'wh_pallet_inbound_records_v1',
  'wh_pallet_inbound_records_v2',
  'wh_pallet_inbound_records_v3'
];

function loadSavedMasterItems(): MasterItem[] {
  try {
    for (const key of MASTER_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error('Failed to load master items from storage:', e);
  }
  return DEFAULT_MASTER_ITEMS;
}

function loadSavedRecords(): PalletRecord[] {
  try {
    for (const key of RECORD_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Filter out demo data to keep history completely clean
          const cleaned = parsed.filter(
            (r) => r && r.id && !String(r.id).startsWith('demo-')
          );
          if (cleaned.length !== parsed.length) {
            localStorage.setItem(key, JSON.stringify(cleaned));
          }
          return cleaned;
        }
      }
    }
  } catch (e) {
    console.error('Failed to load pallet records from storage:', e);
  }
  return []; // Default kosong (riwayat pallet diawali bersih)
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'input' | 'results' | 'history' | 'bin_map'>('input');
  
  // Master Items State with full persistence recovery
  const [masterItems, setMasterItems] = useState<MasterItem[]>(loadSavedMasterItems);

  // Pallet Records State with full persistence recovery
  const [records, setRecords] = useState<PalletRecord[]>(loadSavedRecords);

  const [currentBatch, setCurrentBatch] = useState<BatchSubmission | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Bin detail viewer state (opened via QR scan or click)
  const [selectedBinForModal, setSelectedBinForModal] = useState<string | null>(null);
  const [isBinModalOpen, setIsBinModalOpen] = useState(false);

  // Check URL query params on load: if user scanned a QR code like ?bin=5A.1
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const binParam = searchParams.get('bin');
      if (binParam) {
        setSelectedBinForModal(binParam.toUpperCase());
        setIsBinModalOpen(true);
      }
    } catch (e) {
      console.error('Failed to parse URL query:', e);
    }
  }, []);

  // Sync dark class on document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Real-time synchronization with Cloud Firestore across multiple devices
  useEffect(() => {
    // 1. Subscribe to Pallet Records in real-time
    const unsubscribeRecords = subscribeToPalletRecords(
      (cloudRecords) => {
        // Filter out demo data
        const cleanRecords = cloudRecords.filter(
          (r) => r && r.id && !String(r.id).startsWith('demo-')
        );
        setRecords(cleanRecords);
        setIsCloudConnected(true);
      },
      (error) => {
        console.warn('Real-time listener notice:', error);
      }
    );

    // 2. Subscribe to Master Items in real-time
    const unsubscribeMaster = subscribeToMasterItems((cloudMaster) => {
      if (cloudMaster && cloudMaster.length > 0) {
        setMasterItems(cloudMaster);
      }
    });

    return () => {
      unsubscribeRecords();
      unsubscribeMaster();
    };
  }, []);

  // Persist records across all storage keys as local cache
  useEffect(() => {
    try {
      const dataStr = JSON.stringify(records);
      RECORD_STORAGE_KEYS.forEach((key) => {
        localStorage.setItem(key, dataStr);
      });
    } catch (e) {
      console.error('Failed to save records to localStorage', e);
    }
  }, [records]);

  // Persist master items across all storage keys
  useEffect(() => {
    try {
      const dataStr = JSON.stringify(masterItems);
      MASTER_STORAGE_KEYS.forEach((key) => {
        localStorage.setItem(key, dataStr);
      });
    } catch (e) {
      console.error('Failed to save master items to localStorage', e);
    }
  }, [masterItems]);

  // Add Master Item (saves locally & syncs to cloud)
  const handleAddMasterItem = (newItem: Omit<MasterItem, 'id'>) => {
    const item: MasterItem = {
      ...newItem,
      id: `itm-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterItems((prev) => [item, ...prev]);
    saveMasterItem(item).catch((err) => console.error('Cloud save item error:', err));
  };

  // Update Master Item (Edit existing item)
  const handleUpdateMasterItem = (updatedItem: MasterItem) => {
    setMasterItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    saveMasterItem(updatedItem).catch((err) => console.error('Cloud update item error:', err));
  };

  // Delete Master Item
  const handleDeleteMasterItem = (id: string) => {
    setMasterItems((prev) => prev.filter((item) => item.id !== id));
    deleteMasterItem(id).catch((err) => console.error('Cloud delete item error:', err));
  };

  // Open Bin Details Modal (for QR scan or direct click)
  const handleOpenBinDetail = (binCode: string) => {
    setSelectedBinForModal(binCode.toUpperCase());
    setIsBinModalOpen(true);
  };

  // Form Submission Handler: Single Lokasi Bin at top, Nomor Pallet di setiap item
  const handleFormSubmit = (
    rows: PalletRowInput[],
    lokasiBin: string
  ) => {
    const now = new Date();
    const batchId = `BCH-${now.getFullYear().toString().slice(-2)}${String(
      now.getMonth() + 1
    ).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const nowMs = Date.now();
    const newPalletRecords: PalletRecord[] = rows.map((row, idx) => {
      const boxAwalVal = (row.boxAwal || row.batchAwal || '').trim().toUpperCase();
      const boxAkhirVal = (row.boxAkhir || row.batchAkhir || '').trim().toUpperCase();
      const noBatchVal = (row.noBatch || '').trim().toUpperCase();

      // Row idx 0 is the first item entered ("penginputan paling atas").
      // Assign incremental timestamps so earlier rows in the form are chronologically
      // earlier (older) and later rows or subsequent pallet additions are newer.
      const rowTimestamp = new Date(nowMs + idx * 1000).toISOString();

      return {
        id: `plt-${nowMs}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        nomorPallet: row.nomorPallet.trim().toUpperCase(), // Selalu sesuai input user
        barcodeNumber: generatePalletBarcode('PLT'),
        batchId,
        itemIndex: idx + 1,
        kodeItem: row.kodeItem.trim().toUpperCase(),
        namaBarang: row.namaBarang.trim(),
        qtyPallet: Number(row.qtyPallet),
        unit: row.unit || 'Box',
        noBatch: noBatchVal,
        boxAwal: boxAwalVal,
        boxAkhir: boxAkhirVal,
        batchAwal: boxAwalVal, // kompatibilitas
        batchAkhir: boxAkhirVal, // kompatibilitas
        lokasiBin: lokasiBin.trim().toUpperCase(),
        keterangan: row.keterangan?.trim() || '',
        submittedAt: rowTimestamp
      };
    });

    const totalQty = newPalletRecords.reduce((sum, item) => sum + item.qtyPallet, 0);
    const palletList = Array.from(new Set(newPalletRecords.map((r) => r.nomorPallet)));

    const newBatch: BatchSubmission = {
      batchId,
      nomorPallet: palletList[0] || 'PLT-01',
      nomorPalletList: palletList,
      lokasiBin: lokasiBin.trim().toUpperCase(),
      submittedAt: now.toISOString(),
      items: newPalletRecords,
      totalQty,
      itemCount: newPalletRecords.length
    };

    setRecords((prev) => [...newPalletRecords, ...prev]);
    setCurrentBatch(newBatch);
    setActiveTab('results');

    // SYNC TO CLOUD DATABASE (Updates all connected phones, tablets, and PCs in real-time)
    savePalletRecordsBatch(newPalletRecords).catch((err) => {
      console.error('Failed to sync new pallet records to cloud:', err);
    });
  };

  const handleDeleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    deletePalletRecord(id).catch((err) => {
      console.error('Failed to delete pallet record from cloud:', err);
    });
  };

  const handleClearAllRecords = () => {
    RECORD_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });
    setRecords([]);
    clearAllPalletRecords().catch((err) => {
      console.error('Failed to clear cloud pallet records:', err);
    });
  };

  const handleImportBackupData = (
    newMaster: MasterItem[],
    newRecords: PalletRecord[],
    mode: 'merge' | 'replace'
  ) => {
    if (mode === 'replace') {
      if (newMaster && newMaster.length > 0) {
        setMasterItems(newMaster);
        seedMasterItems(newMaster).catch(() => {});
      }
      if (newRecords) {
        setRecords(newRecords);
        savePalletRecordsBatch(newRecords).catch(() => {});
      }
    } else {
      // Merge unique
      if (newMaster && newMaster.length > 0) {
        setMasterItems((prev) => {
          const existingCodes = new Set(prev.map((i) => i.kodeItem.toUpperCase()));
          const combined = [...prev];
          newMaster.forEach((item) => {
            if (!existingCodes.has(item.kodeItem.toUpperCase())) {
              combined.push(item);
              existingCodes.add(item.kodeItem.toUpperCase());
            }
          });
          return combined;
        });
        seedMasterItems(newMaster).catch(() => {});
      }

      if (newRecords && newRecords.length > 0) {
        setRecords((prev) => {
          const existingBarcodes = new Set(prev.map((r) => r.barcodeNumber));
          const combined = [...prev];
          newRecords.forEach((rec) => {
            if (!existingBarcodes.has(rec.barcodeNumber)) {
              combined.push(rec);
              existingBarcodes.add(rec.barcodeNumber);
            }
          });
          return combined;
        });
        savePalletRecordsBatch(newRecords).catch(() => {});
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Bar Contract (Strict 3-zone contract) */}
      <header className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand wordmark & Realtime Cloud Status */}
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <span className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white block leading-none">
                  PalletTrack Gudang 5
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Code 128 · QR Bin 5A.1
                </span>
              </div>
            </div>

            {/* Realtime Cloud Sync Badge */}
            <div
              className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                isCloudConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              }`}
              title="Data tersinkronisasi otomatis real-time lintas seluruh perangkat operator gudang via Cloud Firestore"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isCloudConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              <Cloud className="w-3 h-3" />
              <span>Realtime Cloud {isCloudConnected ? 'Aktif' : 'Menyambungkan...'}</span>
            </div>
          </div>

          {/* Zone 2: Navigation Links / Workspace Tabs */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('input')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'input'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Input Pallet (1-8 Data)</span>
            </button>

            {currentBatch && (
              <button
                type="button"
                onClick={() => setActiveTab('results')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'results'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Barcode className="w-4 h-4" />
                <span>Hasil Barcode Pallet ({currentBatch.items.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'history'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Riwayat Pallet ({records.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bin_map')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'bin_map'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Denah Bin Gudang 5</span>
            </button>
          </nav>

          {/* Zone 3: Actions (Master Database + Scan + Dark Mode) */}
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <button
              type="button"
              onClick={() => setIsBackupModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg border border-emerald-200 dark:border-emerald-900 transition-colors"
              title="Sinkronkan data dengan GitHub Pages via File Cadangan JSON"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Sinkron Data JSON</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMasterModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg border border-blue-200 dark:border-blue-900 transition-colors"
              title="Kelola Master Database Barang & Kode Item"
            >
              <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Master Barang ({masterItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Cek / scan barcode pallet atau QR Bin"
            >
              <Search className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Cek Barcode / QR Bin</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-200 dark:border-slate-800 px-2 py-2 overflow-x-auto text-[11px] font-semibold bg-slate-50 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab('input')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded ${
              activeTab === 'input'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Input</span>
          </button>
          {currentBatch && (
            <button
              type="button"
              onClick={() => setActiveTab('results')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded ${
                activeTab === 'results'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Barcode className="w-3.5 h-3.5" />
              <span>Barcode</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bin_map')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded ${
              activeTab === 'bin_map'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Denah Bin</span>
          </button>
          <button
            type="button"
            onClick={() => setIsBackupModalOpen(true)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-emerald-600 dark:text-emerald-400"
            title="Sinkron Data JSON"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sinkron</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'input' && (
          <div className="space-y-6">
            <PalletInputForm
              masterItems={masterItems}
              onOpenMasterDatabase={() => setIsMasterModalOpen(true)}
              onOpenBinDetail={handleOpenBinDetail}
              onSubmit={handleFormSubmit}
            />
          </div>
        )}

        {activeTab === 'results' && currentBatch && (
          <BarcodeResultsView
            batch={currentBatch}
            onBackToInput={() => setActiveTab('input')}
            onViewHistory={() => setActiveTab('history')}
          />
        )}

        {activeTab === 'history' && (
          <PalletHistoryTable
            records={records}
            onDeleteRecord={handleDeleteRecord}
            onClearAll={handleClearAllRecords}
            onNewInput={() => setActiveTab('input')}
          />
        )}

        {activeTab === 'bin_map' && (
          <WarehouseBinViewer
            records={records}
            onSelectBin={(binCode) => {
              handleOpenBinDetail(binCode);
            }}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="no-print mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Sistem Inbound Pallet Gudang 5 · Alokasi Bin 5A.1 & Barcode Code 128</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Scan QR Code Bin untuk melihat seluruh daftar muatan di rak tersebut
          </div>
        </div>
      </footer>

      {/* Master Item Database Modal (Supports Add, Edit, Delete) */}
      <MasterItemModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        masterItems={masterItems}
        onAddMasterItem={handleAddMasterItem}
        onUpdateMasterItem={handleUpdateMasterItem}
        onDeleteMasterItem={handleDeleteMasterItem}
      />

      {/* Barcode Lookup & Scan Modal */}
      <BarcodeScannerModal
        records={records}
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onOpenBinDetail={handleOpenBinDetail}
      />

      {/* Bin Detail List Modal (Opened when QR code is scanned or clicked) */}
      <BinDetailModal
        binCode={selectedBinForModal}
        records={records}
        isOpen={isBinModalOpen}
        onClose={() => setIsBinModalOpen(false)}
      />

      {/* JSON Backup & Cross-Domain Sync Modal */}
      <DataBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        masterItems={masterItems}
        records={records}
        onImportData={handleImportBackupData}
      />
    </div>
  );
}
