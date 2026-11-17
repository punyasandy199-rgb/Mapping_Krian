import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  PalletRecord,
  PalletBatchEntry,
  BatchSubmission,
  PalletRowInput,
  MasterItem,
  MasterRoute,
  MasterVendor,
  MasterRouteTariff,
  BlacklistRecord,
  WarehouseUser,
  MasterWarehouse,
  WarehouseLocationGroup,
  SuratJalanRecord,
  DEFAULT_MASTER_ITEMS,
  DEFAULT_MASTER_ROUTES,
  DEFAULT_MASTER_VENDORS,
  DEFAULT_MASTER_ROUTE_TARIFFS,
  DEFAULT_BLACKLIST_RECORDS,
  DEFAULT_WAREHOUSE_USERS,
  DEFAULT_MASTER_WAREHOUSES,
  getWarehouseRackSlots,
  resolveWarehouseForBin,
  mapGroupToCanonicalWarehouse,
  resolvePalletQcStatus
} from './types/warehouse';
import { PalletInputForm } from './components/PalletInputForm';
import { BarcodeResultsView } from './components/BarcodeResultsView';
import { PalletHistoryTable } from './components/PalletHistoryTable';
import { WarehouseBinViewer } from './components/WarehouseBinViewer';
import { PalletNotesCheckView } from './components/PalletNotesCheckView';
import { PalletUpdateMonitorView } from './components/PalletUpdateMonitorView';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { MasterItemModal, MasterModalTabKey } from './components/MasterItemModal';
import { BinDetailModal } from './components/BinDetailModal';
import { PrintBinManifestModal } from './components/PrintBinManifestModal';
import { DataBackupModal } from './components/DataBackupModal';
import { SuratJalanView } from './components/SuratJalanView';
import { LocationPortalView } from './components/LocationPortalView';
import {
  GoogleSheetsSyncView,
  SyncActivityLogItem
} from './components/GoogleSheetsSyncView';
import {
  DEFAULT_SPREADSHEET_URL,
  DEFAULT_APPS_SCRIPT_SECRET,
  SyncAllResult,
  initGoogleSheetsAuth,
  signInWithGoogleSheets,
  signOutGoogleSheets,
  getGoogleSheetsAccessToken,
  syncAllDataToSpreadsheet,
  syncAllDataViaAppsScript,
  isValidAppsScriptUrl,
  extractSpreadsheetId
} from './services/googleSheets';
import { generatePalletBarcode } from './utils/code128';
import { calculateBatchBoxCount } from './utils/batchCalculator';
import { computeReorderedBinEntries } from './utils/binSorting';
import {
  subscribeToPalletRecords,
  savePalletRecordsBatch,
  updatePalletRecord,
  updatePalletsBinOrder,
  deletePalletRecord,
  clearAllPalletRecords,
  updatePalletsOutbound,
  restorePalletsToBin,
  subscribeToMasterItems,
  saveMasterItem,
  deleteMasterItem,
  seedMasterItems,
  subscribeToMasterRoutes,
  saveMasterRoute,
  deleteMasterRoute,
  subscribeToMasterVendors,
  saveMasterVendor,
  deleteMasterVendor,
  subscribeToMasterTariffs,
  saveMasterTariff,
  deleteMasterTariff,
  subscribeToMasterWarehouses,
  saveMasterWarehouse,
  deleteMasterWarehouse,
  subscribeToBlacklist,
  saveBlacklistRecord,
  deleteBlacklistRecord,
  subscribeToWarehouseUsers,
  saveWarehouseUser,
  deleteWarehouseUser,
  subscribeToSuratJalanRecords,
  saveSuratJalanRecord,
  updateSuratJalanRecord,
  SheetsSyncMode,
  SheetsBridgeConfig,
  subscribeToSheetsBridgeConfig,
  saveSheetsBridgeConfig
} from './services/firebase';
import {
  Boxes,
  PlusCircle,
  Barcode,
  History,
  MapPin,
  Database,
  RefreshCw,
  Sun,
  Moon,
  Search,
  Cloud,
  ShieldCheck,
  Truck,
  Users,
  ChevronRight,
  Menu,
  X,
  UserCheck,
  ArrowLeft,
  ClipboardCheck,
  Building2,
  CalendarClock,
  FileSpreadsheet
} from 'lucide-react';

// Storage Keys
const RECORD_STORAGE_KEYS = ['wh_pallet_records_v1', 'warehouse_pallet_records'];
const MASTER_STORAGE_KEYS = ['wh_master_items_v1', 'wh_master_items'];
const ROUTE_STORAGE_KEYS = ['wh_master_routes_v1', 'wh_master_routes'];
const VENDOR_STORAGE_KEYS = ['wh_master_vendors_v1', 'wh_master_vendors'];
const TARIFF_STORAGE_KEYS = ['wh_master_tariffs_v1', 'wh_master_tariffs'];
const WAREHOUSE_STORAGE_KEYS = ['wh_master_warehouses_v1'];
const BLACKLIST_STORAGE_KEYS = ['wh_master_blacklist_v1'];
const USER_STORAGE_KEYS = ['wh_warehouse_users_v1'];
const SURAT_STORAGE_KEYS = ['wh_surat_jalan_records_v1', 'wh_surat_jalan_records'];

// Tracking Deleted Entity IDs to prevent deleted items from resurrecting
const DELETED_ITEMS_KEY = 'pallettrack_deleted_master_items_v1';
const DELETED_ROUTES_KEY = 'pallettrack_deleted_master_routes_v1';
const DELETED_VENDORS_KEY = 'pallettrack_deleted_master_vendors_v1';
const DELETED_TARIFFS_KEY = 'pallettrack_deleted_master_tariffs_v1';
const DELETED_WAREHOUSES_KEY = 'pallettrack_deleted_warehouses_v1';
const DELETED_BLACKLIST_KEY = 'pallettrack_deleted_blacklist_v1';
const DELETED_USERS_KEY = 'pallettrack_deleted_users_v1';

function getDeletedIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function recordDeletedId(key: string, id: string) {
  const set = getDeletedIds(key);
  set.add(id);
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
}

// Initial Data Loaders
function loadSavedMasterItems(): MasterItem[] {
  const deleted = getDeletedIds(DELETED_ITEMS_KEY);
  try {
    for (const key of MASTER_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, MasterItem>();
          DEFAULT_MASTER_ITEMS.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
          parsed.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
          return Array.from(map.values());
        }
      }
    }
  } catch (e) {
    console.error('Failed to load master items:', e);
  }
  return DEFAULT_MASTER_ITEMS.filter((i) => !deleted.has(i.id));
}

function normalizeRouteKey(val: string | undefined): string {
  return (val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function deduplicateMasterRoutes(routes: MasterRoute[]): MasterRoute[] {
  const result: MasterRoute[] = [];
  const byId = new Map<string, number>();
  const byKode = new Map<string, number>();
  const byNama = new Map<string, number>();

  for (const route of routes) {
    if (!route) continue;
    const idKey = route.id;
    const kodeKey = normalizeRouteKey(route.kodeLokasi);
    const namaKey = normalizeRouteKey(route.namaLokasi);

    const existingIdx =
      (idKey && byId.has(idKey) ? byId.get(idKey) : undefined) ??
      (kodeKey && byKode.has(kodeKey) ? byKode.get(kodeKey) : undefined) ??
      (namaKey && byNama.has(namaKey) ? byNama.get(namaKey) : undefined);

    if (existingIdx !== undefined) {
      const existing = result[existingIdx];
      const isSukodono = kodeKey === 'sja sukodono' || namaKey.includes('sukodono');
      const preferPanjunan =
        isSukodono &&
        route.alamat &&
        route.alamat.toLowerCase().includes('gilang') &&
        existing.alamat &&
        existing.alamat.toLowerCase().includes('panjunan')
          ? existing.alamat
          : route.alamat || existing.alamat;

      result[existingIdx] = {
        ...existing,
        ...route,
        alamat: preferPanjunan
      };
    } else {
      const newIdx = result.length;
      result.push(route);
      if (idKey) byId.set(idKey, newIdx);
      if (kodeKey) byKode.set(kodeKey, newIdx);
      if (namaKey) byNama.set(namaKey, newIdx);
    }
  }
  return result;
}

function loadSavedMasterRoutes(): MasterRoute[] {
  const deleted = getDeletedIds(DELETED_ROUTES_KEY);
  try {
    for (const key of ROUTE_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return deduplicateMasterRoutes([
            ...DEFAULT_MASTER_ROUTES.filter((r) => !deleted.has(r.id)),
            ...parsed.filter((r) => !deleted.has(r.id))
          ]);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load master routes:', e);
  }
  return deduplicateMasterRoutes(DEFAULT_MASTER_ROUTES.filter((r) => !deleted.has(r.id)));
}

function loadSavedMasterVendors(): MasterVendor[] {
  const deleted = getDeletedIds(DELETED_VENDORS_KEY);
  try {
    for (const key of VENDOR_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((v) => v && !deleted.has(v.id));
        }
      }
    }
  } catch (e) {
    console.error('Failed to load master vendors:', e);
  }
  return DEFAULT_MASTER_VENDORS.filter((v) => !deleted.has(v.id));
}

function loadSavedMasterTariffs(): MasterRouteTariff[] {
  const deleted = getDeletedIds(DELETED_TARIFFS_KEY);
  try {
    for (const key of TARIFF_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((t) => t && !deleted.has(t.id));
        }
      }
    }
  } catch (e) {
    console.error('Failed to load master tariffs:', e);
  }
  return DEFAULT_MASTER_ROUTE_TARIFFS.filter((t) => !deleted.has(t.id));
}

function loadSavedBlacklist(): BlacklistRecord[] {
  const deleted = getDeletedIds(DELETED_BLACKLIST_KEY);
  try {
    for (const key of BLACKLIST_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((b) => !deleted.has(b.id));
        }
      }
    }
  } catch (e) {
    console.error('Failed to load blacklist:', e);
  }
  return DEFAULT_BLACKLIST_RECORDS.filter((b) => !deleted.has(b.id));
}

function loadSavedWarehouseUsers(): WarehouseUser[] {
  const deleted = getDeletedIds(DELETED_USERS_KEY);
  try {
    for (const key of USER_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((u) => !deleted.has(u.id));
        }
      }
    }
  } catch (e) {
    console.error('Failed to load warehouse users:', e);
  }
  return DEFAULT_WAREHOUSE_USERS.filter((u) => !deleted.has(u.id));
}

function loadSavedSuratJalan(): SuratJalanRecord[] {
  try {
    for (const key of SURAT_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error('Failed to load surat jalan:', e);
  }
  return [];
}

function loadSavedRecords(): PalletRecord[] {
  try {
    for (const key of RECORD_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
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
    console.error('Failed to load pallet records:', e);
  }
  return [];
}

function loadSavedMasterWarehouses(): MasterWarehouse[] {
  const deleted = getDeletedIds(DELETED_WAREHOUSES_KEY);
  try {
    for (const key of WAREHOUSE_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const map = new Map<string, MasterWarehouse>();
          DEFAULT_MASTER_WAREHOUSES.filter((w) => !deleted.has(w.id)).forEach((w) =>
            map.set(w.id, w)
          );
          parsed.filter((w) => w && !deleted.has(w.id)).forEach((w) => map.set(w.id, w));
          return Array.from(map.values());
        }
      }
    }
  } catch (e) {
    console.error('Failed to load master warehouses:', e);
  }
  return DEFAULT_MASTER_WAREHOUSES.filter((w) => !deleted.has(w.id));
}

export default function App() {
  // Scan-Only Isolated Bin Mode saat URL berisi ?bin=5A.1
  const [scanOnlyBin, setScanOnlyBin] = useState<string | null>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const binParam = searchParams.get('bin');
      return binParam ? binParam.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });

  // 2-Level Portal Navigation State
  const [portalLocationGroup, setPortalLocationGroup] =
    useState<WarehouseLocationGroup | null>(null);
  const [activeWarehouseId, setActiveWarehouseId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    | 'input'
    | 'results'
    | 'history'
    | 'bin_map'
    | 'notes_check'
    | 'update_monitor'
    | 'surat_jalan'
    | 'google_sheets'
  >('input');

  // Master Data & User Management State
  const [masterItems, setMasterItems] = useState<MasterItem[]>(loadSavedMasterItems);
  const [masterRoutes, setMasterRoutes] = useState<MasterRoute[]>(loadSavedMasterRoutes);
  const [masterVendors, setMasterVendors] = useState<MasterVendor[]>(loadSavedMasterVendors);
  const [masterTariffs, setMasterTariffs] = useState<MasterRouteTariff[]>(loadSavedMasterTariffs);
  const [masterWarehouses, setMasterWarehouses] = useState<MasterWarehouse[]>(
    loadSavedMasterWarehouses
  );
  const [blacklistRecords, setBlacklistRecords] = useState<BlacklistRecord[]>(loadSavedBlacklist);
  const [warehouseUsers, setWarehouseUsers] = useState<WarehouseUser[]>(loadSavedWarehouseUsers);

  // Operational State
  const [suratJalanHistory, setSuratJalanHistory] = useState<SuratJalanRecord[]>(loadSavedSuratJalan);
  const [records, setRecords] = useState<PalletRecord[]>(loadSavedRecords);
  const [currentBatch, setCurrentBatch] = useState<BatchSubmission | null>(null);

  // Modals & Controls
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [masterModalInitialTab, setMasterModalInitialTab] =
    useState<MasterModalTabKey>('tujuan_tarif');
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Bin detail viewer state
  const [selectedBinForModal, setSelectedBinForModal] = useState<string | null>(null);
  const [isBinModalOpen, setIsBinModalOpen] = useState(false);
  const [isPrintManifestOpen, setIsPrintManifestOpen] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Google Sheets Integration State (Cara B: Shared Apps Script Bridge 24/7 + Cara A: OAuth Token in memory)
  const [syncMode, setSyncMode] = useState<SheetsSyncMode>('apps_script');
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>('');
  const [appsScriptSecret, setAppsScriptSecret] = useState<string>(DEFAULT_APPS_SCRIPT_SECRET);
  const [isBridgeSavedInCloud, setIsBridgeSavedInCloud] = useState<boolean>(false);
  const [cloudBridgeLastSyncedAt, setCloudBridgeLastSyncedAt] = useState<string | null>(null);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState<boolean>(true);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState<boolean>(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState<string>(() => {
    try {
      return localStorage.getItem('pallettrack_gsheets_url_v1') || DEFAULT_SPREADSHEET_URL;
    } catch {
      return DEFAULT_SPREADSHEET_URL;
    }
  });
  const [selectedSheetTab, setSelectedSheetTab] = useState<string>(() => {
    try {
      return localStorage.getItem('pallettrack_gsheets_tab_v1') || '';
    } catch {
      return '';
    }
  });
  const [includeSuratJalanTab, setIncludeSuratJalanTab] = useState<boolean>(true);
  const [includeManualSjTab, setIncludeManualSjTab] = useState<boolean>(true);
  const [manualSjSpreadsheetInput, setManualSjSpreadsheetInput] = useState<string>(() => {
    try {
      return localStorage.getItem('pallettrack_gsheets_manual_sj_url_v1') || '';
    } catch {
      return '';
    }
  });
  const [includeRekapTab, setIncludeRekapTab] = useState<boolean>(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [isSheetsBannerDismissed, setIsSheetsBannerDismissed] = useState<boolean>(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncAllResult | null>(null);
  const [sheetsSyncError, setSheetsSyncError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [syncActivityLogs, setSyncActivityLogs] = useState<SyncActivityLogItem[]>([]);
  const [localMutationVersion, setLocalMutationVersion] = useState<number>(0);
  const lastSyncedDigestRef = useRef<string>('');
  const lastSyncedLocalVersionRef = useRef<number>(0);

  // Sync dark class on document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Real-time synchronization with Cloud Firestore
  useEffect(() => {
    // 1. Subscribe to Pallet Records
    const unsubscribeRecords = subscribeToPalletRecords(
      (cloudRecords) => {
        const cleanRecords = cloudRecords.filter(
          (r) => r && r.id && !String(r.id).startsWith('demo-')
        );
        setRecords(cleanRecords);
        setIsCloudConnected(true);
      },
      (error) => console.warn('Real-time pallet listener:', error)
    );

    // 2. Subscribe to Master Items (with deletion protection)
    const unsubscribeMaster = subscribeToMasterItems((cloudMaster) => {
      const deleted = getDeletedIds(DELETED_ITEMS_KEY);
      if (cloudMaster && cloudMaster.length > 0) {
        setMasterItems((prev) => {
          const map = new Map<string, MasterItem>();
          DEFAULT_MASTER_ITEMS.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
          prev.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
          cloudMaster.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
          return Array.from(map.values());
        });
      }
    });

    // 3. Subscribe to Master Routes
    const unsubscribeRoutes = subscribeToMasterRoutes((cloudRoutes) => {
      const deleted = getDeletedIds(DELETED_ROUTES_KEY);
      if (cloudRoutes && cloudRoutes.length > 0) {
        setMasterRoutes((prev) =>
          deduplicateMasterRoutes([
            ...DEFAULT_MASTER_ROUTES.filter((r) => !deleted.has(r.id)),
            ...prev.filter((r) => !deleted.has(r.id)),
            ...cloudRoutes.filter((r) => !deleted.has(r.id))
          ])
        );
      }
    });

    // 4. Subscribe to Master Vendors (use Firestore cloud data directly when present)
    const unsubscribeVendors = subscribeToMasterVendors((cloudVendors) => {
      const deleted = getDeletedIds(DELETED_VENDORS_KEY);
      if (cloudVendors && cloudVendors.length > 0) {
        setMasterVendors(cloudVendors.filter((v) => !deleted.has(v.id)));
      }
    });

    // 5. Subscribe to Master Tariffs (Tujuan & Tarif)
    const unsubscribeTariffs = subscribeToMasterTariffs((cloudTariffs) => {
      const deleted = getDeletedIds(DELETED_TARIFFS_KEY);
      if (cloudTariffs && cloudTariffs.length > 0) {
        setMasterTariffs(cloudTariffs.filter((t) => !deleted.has(t.id)));
      }
    });

    // 6. Subscribe to Blacklist
    const unsubscribeBlacklist = subscribeToBlacklist((cloudBlacklist) => {
      const deleted = getDeletedIds(DELETED_BLACKLIST_KEY);
      if (cloudBlacklist && cloudBlacklist.length > 0) {
        setBlacklistRecords(cloudBlacklist.filter((b) => !deleted.has(b.id)));
      }
    });

    // 7. Subscribe to Warehouse Users
    const unsubscribeUsers = subscribeToWarehouseUsers((cloudUsers) => {
      const deleted = getDeletedIds(DELETED_USERS_KEY);
      if (cloudUsers && cloudUsers.length > 0) {
        setWarehouseUsers(cloudUsers.filter((u) => !deleted.has(u.id)));
      }
    });

    // 8. Subscribe to Surat Jalan Records
    const unsubscribeSuratJalan = subscribeToSuratJalanRecords((cloudSurat) => {
      if (cloudSurat && cloudSurat.length > 0) {
        setSuratJalanHistory(cloudSurat);
      }
    });

    // 9. Subscribe to Master Warehouses (Lokasi & Sub-Lokasi Gudang)
    const unsubscribeWarehouses = subscribeToMasterWarehouses((cloudWarehouses) => {
      const deleted = getDeletedIds(DELETED_WAREHOUSES_KEY);
      if (cloudWarehouses && cloudWarehouses.length > 0) {
        setMasterWarehouses((prev) => {
          const map = new Map<string, MasterWarehouse>();
          DEFAULT_MASTER_WAREHOUSES.filter((w) => !deleted.has(w.id)).forEach((w) =>
            map.set(w.id, w)
          );
          prev.filter((w) => !deleted.has(w.id)).forEach((w) => map.set(w.id, w));
          cloudWarehouses.filter((w) => !deleted.has(w.id)).forEach((w) => map.set(w.id, w));
          return Array.from(map.values());
        });
      }
    });

    // 10. Subscribe to Shared Google Sheets Bridge Settings (for 24/7 no-login operator sync)
    const unsubscribeBridge = subscribeToSheetsBridgeConfig((cfg) => {
      if (!cfg) return;
      setSyncMode(cfg.syncMode || 'apps_script');
      setAppsScriptUrl(cfg.appsScriptUrl || '');
      setAppsScriptSecret(cfg.appsScriptSecret || DEFAULT_APPS_SCRIPT_SECRET);
      if (cfg.spreadsheetUrl) setSpreadsheetInput(cfg.spreadsheetUrl);
      if (cfg.palletTabTitle !== undefined) setSelectedSheetTab(cfg.palletTabTitle);
      if (cfg.includeSuratJalanTab !== undefined) {
        setIncludeSuratJalanTab(cfg.includeSuratJalanTab);
      }
      if (cfg.includeManualSjTab !== undefined) {
        setIncludeManualSjTab(cfg.includeManualSjTab);
      }
      if (cfg.manualSjSpreadsheetUrl !== undefined) {
        setManualSjSpreadsheetInput(cfg.manualSjSpreadsheetUrl);
      }
      if (cfg.includeRekapTab !== undefined) {
        setIncludeRekapTab(cfg.includeRekapTab);
      }
      setIsBridgeSavedInCloud(Boolean(cfg.appsScriptUrl && isValidAppsScriptUrl(cfg.appsScriptUrl)));
      setCloudBridgeLastSyncedAt(cfg.lastSyncedAt || null);
      if ((cfg.syncMode || 'apps_script') === 'apps_script') {
        setAutoSyncEnabled(Boolean(cfg.autoSync24x7Enabled));
      }
    });

    return () => {
      unsubscribeRecords();
      unsubscribeMaster();
      unsubscribeRoutes();
      unsubscribeVendors();
      unsubscribeTariffs();
      unsubscribeBlacklist();
      unsubscribeUsers();
      unsubscribeSuratJalan();
      unsubscribeWarehouses();
      unsubscribeBridge();
    };
  }, []);

  // Persist local caches
  useEffect(() => {
    try {
      localStorage.setItem(RECORD_STORAGE_KEYS[0], JSON.stringify(records));
    } catch (e) {}
  }, [records]);

  useEffect(() => {
    try {
      localStorage.setItem(MASTER_STORAGE_KEYS[0], JSON.stringify(masterItems));
    } catch (e) {}
  }, [masterItems]);

  useEffect(() => {
    try {
      localStorage.setItem(ROUTE_STORAGE_KEYS[0], JSON.stringify(masterRoutes));
    } catch (e) {}
  }, [masterRoutes]);

  useEffect(() => {
    try {
      localStorage.setItem(VENDOR_STORAGE_KEYS[0], JSON.stringify(masterVendors));
    } catch (e) {}
  }, [masterVendors]);

  useEffect(() => {
    try {
      localStorage.setItem(TARIFF_STORAGE_KEYS[0], JSON.stringify(masterTariffs));
    } catch (e) {}
  }, [masterTariffs]);

  useEffect(() => {
    try {
      localStorage.setItem(SURAT_STORAGE_KEYS[0], JSON.stringify(suratJalanHistory));
    } catch (e) {}
  }, [suratJalanHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(WAREHOUSE_STORAGE_KEYS[0], JSON.stringify(masterWarehouses));
    } catch (e) {}
  }, [masterWarehouses]);

  useEffect(() => {
    try {
      localStorage.setItem('pallettrack_gsheets_url_v1', spreadsheetInput);
    } catch (e) {}
  }, [spreadsheetInput]);

  useEffect(() => {
    try {
      localStorage.setItem('pallettrack_gsheets_tab_v1', selectedSheetTab);
    } catch (e) {}
  }, [selectedSheetTab]);

  useEffect(() => {
    try {
      localStorage.setItem('pallettrack_gsheets_manual_sj_url_v1', manualSjSpreadsheetInput);
    } catch (e) {}
  }, [manualSjSpreadsheetInput]);

  // Initialize Google Sheets OAuth listener
  useEffect(() => {
    const unsub = initGoogleSheetsAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsGoogleAuth(false);
      },
      (user) => {
        setGoogleUser(user);
        setNeedsGoogleAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const computeDataDigest = useCallback(() => {
    const recSig = records
      .map(
        (r) =>
          `${r.id}:${r.updatedAt || r.submittedAt}:${r.qtyPallet}:${r.noBatch || ''}:${resolvePalletQcStatus(
            r
          )}:${r.status || 'IN'}:${
            r.tujuanPengambilan || ''
          }:${r.lokasiBin}:${r.lokasiGudang || ''}:${r.gudangAsal || ''}:${(r.operHistory || [])
            .map((o) => `${o.dariGudang}>${o.keGudang}@${o.tanggalOper}`)
            .join(';')}:${r.binOrder ?? ''}:${r.keterangan || ''}:${r.noSuratJalan || ''}`
      )
      .sort()
      .join('|');
    const sjSig = suratJalanHistory
      .map(
        (s) =>
          `${s.id}:${s.noSuratJalan}:${s.noSpp || ''}:${s.noPo || ''}:${s.noPolisi || ''}:${
            s.namaVendorArmada || ''
          }:${s.namaDriver || ''}:${s.noKontainer || ''}:${s.noFaktur || ''}:${
            s.noInvoice || ''
          }:${s.ruteTujuanNama || ''}:${s.tarifTotal ?? ''}:${s.grandTotalBox}:${
            (s.itemsSummary || []).length
          }:${s.createdAt}`
      )
      .sort()
      .join('|');
    return `${recSig}##${sjSig}`;
  }, [records, suratJalanHistory]);

  const appendSyncLog = useCallback(
    (mode: 'Manual' | 'Otomatis' | 'Audit', summary: string, status: 'success' | 'error') => {
      setSyncActivityLogs((prev) =>
        [
          {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            time: new Date().toISOString(),
            mode,
            summary,
            status
          },
          ...prev
        ].slice(0, 30)
      );
    },
    []
  );

  const persistBridgeConfigToCloud = useCallback(
    async (overrides: Partial<SheetsBridgeConfig> = {}) => {
      const config: SheetsBridgeConfig = {
        syncMode: overrides.syncMode ?? syncMode,
        appsScriptUrl: (overrides.appsScriptUrl ?? appsScriptUrl).trim(),
        appsScriptSecret: overrides.appsScriptSecret ?? appsScriptSecret,
        spreadsheetUrl: overrides.spreadsheetUrl ?? spreadsheetInput,
        palletTabTitle: overrides.palletTabTitle ?? selectedSheetTab,
        includeSuratJalanTab: overrides.includeSuratJalanTab ?? includeSuratJalanTab,
        includeManualSjTab: overrides.includeManualSjTab ?? includeManualSjTab,
        manualSjSpreadsheetUrl: (
          overrides.manualSjSpreadsheetUrl ?? manualSjSpreadsheetInput
        ).trim(),
        includeRekapTab: overrides.includeRekapTab ?? includeRekapTab,
        autoSync24x7Enabled: overrides.autoSync24x7Enabled ?? autoSyncEnabled,
        lastSyncedAt: overrides.lastSyncedAt ?? cloudBridgeLastSyncedAt ?? undefined,
        updatedAt: new Date().toISOString()
      };
      await saveSheetsBridgeConfig(config);
      setIsBridgeSavedInCloud(Boolean(config.appsScriptUrl && isValidAppsScriptUrl(config.appsScriptUrl)));
    },
    [
      syncMode,
      appsScriptUrl,
      appsScriptSecret,
      spreadsheetInput,
      selectedSheetTab,
      includeSuratJalanTab,
      includeManualSjTab,
      manualSjSpreadsheetInput,
      includeRekapTab,
      autoSyncEnabled,
      cloudBridgeLastSyncedAt
    ]
  );

  const executeSheetsSync = useCallback(
    async (mode: 'Manual' | 'Otomatis'): Promise<SyncAllResult> => {
      setIsSyncingSheets(true);
      setSheetsSyncError(null);
      try {
        const manualTargetId = manualSjSpreadsheetInput.trim()
          ? extractSpreadsheetId(manualSjSpreadsheetInput)
          : '';
        const result =
          syncMode === 'apps_script'
            ? await syncAllDataViaAppsScript({
                scriptUrl: appsScriptUrl,
                secret: appsScriptSecret,
                spreadsheetId: extractSpreadsheetId(spreadsheetInput),
                palletTabTitle: selectedSheetTab,
                records,
                suratJalanHistory,
                masterItems,
                masterWarehouses,
                syncSuratJalanTab: includeSuratJalanTab,
                syncManualSjTab: includeManualSjTab,
                manualSjSpreadsheetId: manualTargetId,
                syncRekapTab: includeRekapTab
              })
            : await syncAllDataToSpreadsheet({
                spreadsheetId: extractSpreadsheetId(spreadsheetInput),
                palletTabTitle: selectedSheetTab,
                records,
                suratJalanHistory,
                masterItems,
                masterWarehouses,
                syncSuratJalanTab: includeSuratJalanTab,
                syncManualSjTab: includeManualSjTab,
                manualSjSpreadsheetId: manualTargetId,
                syncRekapTab: includeRekapTab
              });
        setLastSyncResult(result);
        setCloudBridgeLastSyncedAt(result.syncedAt);
        if (
          result.palletTabTitle &&
          (!selectedSheetTab ||
            /^sheet\s*1$/i.test(selectedSheetTab.trim()) ||
            selectedSheetTab !== result.palletTabTitle)
        ) {
          setSelectedSheetTab(result.palletTabTitle);
        }
        lastSyncedDigestRef.current = computeDataDigest();
        setPendingSyncCount(0);
        appendSyncLog(
          mode,
          `Tersinkron ${result.palletRowsCount} baris Pallet ke tab "${result.palletTabTitle}"${
            includeSuratJalanTab ? ` · ${result.suratJalanRowsCount} SJ Pallet` : ''
          }${
            includeManualSjTab ? ` · ${result.manualSuratJalanRowsCount ?? 0} Baris SJ Manual` : ''
          }.`,
          'success'
        );
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan ke Google Sheets.';
        setSheetsSyncError(msg);
        if (
          syncMode === 'oauth' &&
          (msg.startsWith('AUTH_REQUIRED') || msg.startsWith('TOKEN_EXPIRED'))
        ) {
          setNeedsGoogleAuth(true);
        }
        appendSyncLog(mode, msg, 'error');
        throw err;
      } finally {
        setIsSyncingSheets(false);
      }
    },
    [
      syncMode,
      appsScriptUrl,
      appsScriptSecret,
      spreadsheetInput,
      selectedSheetTab,
      records,
      suratJalanHistory,
      masterItems,
      masterWarehouses,
      includeSuratJalanTab,
      includeManualSjTab,
      manualSjSpreadsheetInput,
      includeRekapTab,
      computeDataDigest,
      appendSyncLog
    ]
  );

  const handleGoogleSignIn = async () => {
    setIsGoogleLoggingIn(true);
    setSheetsSyncError(null);
    try {
      const { user } = await signInWithGoogleSheets();
      setGoogleUser(user);
      setNeedsGoogleAuth(false);
    } catch (err: unknown) {
      setSheetsSyncError(
        err instanceof Error ? err.message : 'Gagal masuk dengan akun Google.'
      );
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleSheets();
    setGoogleUser(null);
    setNeedsGoogleAuth(true);
    if (syncMode === 'oauth') {
      setAutoSyncEnabled(false);
    }
  };

  const handleEnableAutoSync = async () => {
    const res = await executeSheetsSync('Otomatis');
    setAutoSyncEnabled(true);
    if (syncMode === 'apps_script' && isValidAppsScriptUrl(appsScriptUrl)) {
      await persistBridgeConfigToCloud({
        autoSync24x7Enabled: true,
        palletTabTitle: res.palletTabTitle || selectedSheetTab,
        lastSyncedAt: res.syncedAt
      });
    }
  };

  const handleDisableAutoSync = async () => {
    setAutoSyncEnabled(false);
    if (syncMode === 'apps_script' && isBridgeSavedInCloud) {
      await persistBridgeConfigToCloud({ autoSync24x7Enabled: false }).catch(() => {});
    }
  };

  const handleImportFromGoogleSheet = async (extraRecords: PalletRecord[]) => {
    if (!extraRecords || extraRecords.length === 0) return;
    setRecords((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const newItems = extraRecords.filter((r) => !existingIds.has(r.id));
      return [...newItems, ...prev];
    });
    await savePalletRecordsBatch(extraRecords);
    setLocalMutationVersion((v) => v + 1);
  };

  // Auto-sync debounced effect:
  // - Cara B (apps_script): runs on ANY operator's device whenever this device performs a mutation (24/7, no Google login needed!)
  // - Cara A (oauth): runs on the signed-in owner's browser whenever any data digest changes
  useEffect(() => {
    if (!autoSyncEnabled) return;

    if (syncMode === 'apps_script') {
      if (!isValidAppsScriptUrl(appsScriptUrl)) return;
      if (
        localMutationVersion === 0 ||
        localMutationVersion === lastSyncedLocalVersionRef.current
      ) {
        return;
      }

      const timer = window.setTimeout(() => {
        lastSyncedLocalVersionRef.current = localMutationVersion;
        executeSheetsSync('Otomatis').catch(() => {});
      }, 1200);

      return () => window.clearTimeout(timer);
    }

    const digest = computeDataDigest();
    if (digest === lastSyncedDigestRef.current) return;

    if (needsGoogleAuth || !getGoogleSheetsAccessToken()) {
      setPendingSyncCount((c) => c + 1);
      return;
    }

    const timer = window.setTimeout(() => {
      executeSheetsSync('Otomatis').catch(() => {});
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [
    autoSyncEnabled,
    syncMode,
    appsScriptUrl,
    localMutationVersion,
    computeDataDigest,
    needsGoogleAuth,
    executeSheetsSync
  ]);

  // Master Items Handlers
  const handleAddMasterItem = (newItem: Omit<MasterItem, 'id'>) => {
    const item: MasterItem = {
      ...newItem,
      id: `itm-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterItems((prev) => [item, ...prev]);
    saveMasterItem(item).catch((err) => console.error('Cloud save item error:', err));
  };

  const handleUpdateMasterItem = (updatedItem: MasterItem) => {
    setMasterItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    saveMasterItem(updatedItem).catch((err) => console.error('Cloud update item error:', err));
  };

  const handleDeleteMasterItem = (id: string) => {
    recordDeletedId(DELETED_ITEMS_KEY, id);
    setMasterItems((prev) => prev.filter((i) => i.id !== id));
    deleteMasterItem(id).catch((err) => console.error('Cloud delete item error:', err));
  };

  // Route Handlers
  const handleAddMasterRoute = (newRoute: Omit<MasterRoute, 'id'>) => {
    const route: MasterRoute = {
      ...newRoute,
      id: `route-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterRoutes((prev) => deduplicateMasterRoutes([...prev, route]));
    saveMasterRoute(route).catch((err) => console.error('Cloud save route error:', err));
  };

  const handleUpdateMasterRoute = (updatedRoute: MasterRoute) => {
    setMasterRoutes((prev) =>
      prev.map((r) => (r.id === updatedRoute.id ? updatedRoute : r))
    );
    saveMasterRoute(updatedRoute).catch((err) => console.error('Cloud update route error:', err));
  };

  const handleDeleteMasterRoute = (id: string) => {
    recordDeletedId(DELETED_ROUTES_KEY, id);
    setMasterRoutes((prev) => prev.filter((r) => r.id !== id));
    deleteMasterRoute(id).catch((err) => console.error('Cloud delete route error:', err));
  };

  // Vendor Handlers
  const handleAddMasterVendor = (newVendor: Omit<MasterVendor, 'id'>) => {
    const vendor: MasterVendor = {
      ...newVendor,
      id: `vendor-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterVendors((prev) => [...prev, vendor]);
    saveMasterVendor(vendor).catch((err) => console.error('Cloud save vendor error:', err));
  };

  const handleUpdateMasterVendor = (updatedVendor: MasterVendor) => {
    setMasterVendors((prev) =>
      prev.map((v) => (v.id === updatedVendor.id ? updatedVendor : v))
    );
    saveMasterVendor(updatedVendor).catch((err) => console.error('Cloud update vendor error:', err));
  };

  const handleDeleteMasterVendor = (id: string) => {
    recordDeletedId(DELETED_VENDORS_KEY, id);
    setMasterVendors((prev) => prev.filter((v) => v.id !== id));
    deleteMasterVendor(id).catch((err) => console.error('Cloud delete vendor error:', err));
  };

  // Tujuan & Tarif Handlers
  const handleAddMasterTariff = (newTariff: Omit<MasterRouteTariff, 'id'>) => {
    const tariff: MasterRouteTariff = {
      ...newTariff,
      id: `trf-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterTariffs((prev) => [tariff, ...prev]);
    saveMasterTariff(tariff).catch((err) => console.error('Cloud save tariff error:', err));
  };

  const handleUpdateMasterTariff = (updatedTariff: MasterRouteTariff) => {
    setMasterTariffs((prev) =>
      prev.map((t) => (t.id === updatedTariff.id ? updatedTariff : t))
    );
    saveMasterTariff(updatedTariff).catch((err) => console.error('Cloud update tariff error:', err));
  };

  const handleDeleteMasterTariff = (id: string) => {
    recordDeletedId(DELETED_TARIFFS_KEY, id);
    setMasterTariffs((prev) => prev.filter((t) => t.id !== id));
    deleteMasterTariff(id).catch((err) => console.error('Cloud delete tariff error:', err));
  };

  // Blacklist Handlers
  const handleAddBlacklist = (newBl: Omit<BlacklistRecord, 'id'>) => {
    const bl: BlacklistRecord = {
      ...newBl,
      id: `bl-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setBlacklistRecords((prev) => [bl, ...prev]);
    saveBlacklistRecord(bl).catch((err) => console.error('Cloud save blacklist error:', err));
  };

  const handleDeleteBlacklist = (id: string) => {
    recordDeletedId(DELETED_BLACKLIST_KEY, id);
    setBlacklistRecords((prev) => prev.filter((b) => b.id !== id));
    deleteBlacklistRecord(id).catch((err) => console.error('Cloud delete blacklist error:', err));
  };

  // Warehouse Users Handlers
  const handleAddWarehouseUser = (newUser: Omit<WarehouseUser, 'id'>) => {
    const usr: WarehouseUser = {
      ...newUser,
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setWarehouseUsers((prev) => [...prev, usr]);
    saveWarehouseUser(usr).catch((err) => console.error('Cloud save user error:', err));
  };

  const handleDeleteWarehouseUser = (id: string) => {
    recordDeletedId(DELETED_USERS_KEY, id);
    setWarehouseUsers((prev) => prev.filter((u) => u.id !== id));
    deleteWarehouseUser(id).catch((err) => console.error('Cloud delete user error:', err));
  };

  // Master Warehouses Handlers
  const handleAddMasterWarehouse = (newWarehouse: Omit<MasterWarehouse, 'id'>) => {
    const wh: MasterWarehouse = {
      ...newWarehouse,
      id: `wh-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterWarehouses((prev) => [...prev, wh]);
    saveMasterWarehouse(wh).catch((err) => console.error('Cloud save warehouse error:', err));
  };

  const handleUpdateMasterWarehouse = (updatedWarehouse: MasterWarehouse) => {
    setMasterWarehouses((prev) =>
      prev.map((w) => (w.id === updatedWarehouse.id ? updatedWarehouse : w))
    );
    saveMasterWarehouse(updatedWarehouse).catch((err) =>
      console.error('Cloud update warehouse error:', err)
    );
  };

  const handleDeleteMasterWarehouse = (id: string) => {
    recordDeletedId(DELETED_WAREHOUSES_KEY, id);
    setMasterWarehouses((prev) => prev.filter((w) => w.id !== id));
    if (activeWarehouseId === id) {
      setActiveWarehouseId(null);
    }
    deleteMasterWarehouse(id).catch((err) => console.error('Cloud delete warehouse error:', err));
  };

  // Surat Jalan Save / Update Handler
  const handleSaveSuratJalan = async (newSurat: SuratJalanRecord) => {
    const isExisting = suratJalanHistory.some((s) => s.id === newSurat.id);
    const nowIso = new Date().toISOString();

    if (isExisting) {
      setSuratJalanHistory((prev) =>
        prev.map((s) => (s.id === newSurat.id ? newSurat : s))
      );
      setRecords((prev) =>
        prev.map((r) => {
          if (r.suratJalanId === newSurat.id || newSurat.palletIds.includes(r.id)) {
            return {
              ...r,
              suratJalanId: newSurat.id,
              noSuratJalan: newSurat.noSuratJalan,
              updatedAt: nowIso,
              lastUpdateAction: `Surat Jalan ${newSurat.noSuratJalan}`
            };
          }
          return r;
        })
      );
      await updateSuratJalanRecord(newSurat);
    } else {
      setSuratJalanHistory((prev) => [newSurat, ...prev]);
      setRecords((prev) =>
        prev.map((r) => {
          if (newSurat.palletIds.includes(r.id)) {
            return {
              ...r,
              suratJalanId: newSurat.id,
              noSuratJalan: newSurat.noSuratJalan,
              updatedAt: nowIso,
              lastUpdateAction: `Surat Jalan ${newSurat.noSuratJalan}`
            };
          }
          return r;
        })
      );
      await saveSuratJalanRecord(newSurat);
    }
    setLocalMutationVersion((v) => v + 1);
  };

  const handleOpenBinDetail = (binCode: string) => {
    setSelectedBinForModal(binCode.toUpperCase());
    setIsBinModalOpen(true);
  };

  const handleFormSubmit = (rows: PalletRowInput[], lokasiBin: string) => {
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
      const firstCalc = calculateBatchBoxCount(boxAwalVal, boxAkhirVal);

      const allBatches: PalletBatchEntry[] = [
        {
          noBatch: noBatchVal,
          boxAwal: boxAwalVal,
          boxAkhir: boxAkhirVal,
          ...(firstCalc?.isValid ? { qtyBox: firstCalc.totalBox } : {})
        }
      ];

      if (row.extraBatches && row.extraBatches.length > 0) {
        row.extraBatches.forEach((eb) => {
          const ebBatch = (eb.noBatch || '').trim().toUpperCase();
          const ebAwal = (eb.boxAwal || '').trim().toUpperCase();
          const ebAkhir = (eb.boxAkhir || '').trim().toUpperCase();
          if (ebBatch || ebAwal || ebAkhir) {
            const ebCalc = calculateBatchBoxCount(ebAwal, ebAkhir);
            allBatches.push({
              noBatch: ebBatch,
              boxAwal: ebAwal,
              boxAkhir: ebAkhir,
              ...(ebCalc?.isValid ? { qtyBox: ebCalc.totalBox } : {})
            });
          }
        });
      }

      const combinedBatchLabel = allBatches
        .map((b) => b.noBatch)
        .filter(Boolean)
        .join(', ');
      const rowTimestamp = new Date(nowMs + idx * 1000).toISOString();
      const currentWhForBin = resolveWarehouseForBin(
        lokasiBin,
        masterWarehouses,
        activeWarehouse
      );
      const canonicalWarehouse = mapGroupToCanonicalWarehouse(
        currentWhForBin?.locationGroup || activeWarehouse?.locationGroup
      );

      return {
        id: `plt-${nowMs}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        nomorPallet: row.nomorPallet.trim().toUpperCase(),
        statusQc: row.statusQc || 'OK',
        barcodeNumber: generatePalletBarcode('PLT'),
        batchId,
        itemIndex: idx + 1,
        kodeItem: row.kodeItem.trim().toUpperCase(),
        namaBarang: row.namaBarang.trim(),
        qtyPallet: Number(row.qtyPallet),
        unit: row.unit || 'Box',
        noBatch: combinedBatchLabel || noBatchVal,
        boxAwal: boxAwalVal,
        boxAkhir: boxAkhirVal,
        batchAwal: boxAwalVal,
        batchAkhir: boxAkhirVal,
        batches: allBatches,
        lokasiBin: lokasiBin.trim().toUpperCase(),
        lokasiGudang: canonicalWarehouse,
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
    savePalletRecordsBatch(newPalletRecords).catch((err) =>
      console.error('Failed to sync new pallet records to cloud:', err)
    );
    setLocalMutationVersion((v) => v + 1);
  };

  const handleUpdateRecord = async (updatedRecord: PalletRecord) => {
    const stampedRecord: PalletRecord = {
      ...updatedRecord,
      updatedAt: updatedRecord.updatedAt || new Date().toISOString(),
      lastUpdateAction: updatedRecord.lastUpdateAction || 'Edit Data Pallet'
    };

    setRecords((prev) =>
      prev.map((r) => (r.id === stampedRecord.id ? stampedRecord : r))
    );
    setCurrentBatch((prev) => {
      if (!prev) return prev;
      const hasMatch = prev.items.some((i) => i.id === stampedRecord.id);
      if (!hasMatch) return prev;
      const nextItems = prev.items.map((i) =>
        i.id === stampedRecord.id ? stampedRecord : i
      );
      return {
        ...prev,
        items: nextItems,
        totalQty: nextItems.reduce((sum, i) => sum + (Number(i.qtyPallet) || 0), 0)
      };
    });
    await updatePalletRecord(stampedRecord);
    setLocalMutationVersion((v) => v + 1);
  };

  const handleReorderPallets = async (orderedPallets: PalletRecord[]) => {
    const updates = computeReorderedBinEntries(orderedPallets);
    if (updates.length === 0) return;

    const nowIso = new Date().toISOString();
    const orderMap = new Map(updates.map((u) => [u.id, u.binOrder]));
    setRecords((prev) =>
      prev.map((r) => {
        const nextOrder = orderMap.get(r.id);
        return nextOrder !== undefined
          ? {
              ...r,
              binOrder: nextOrder,
              updatedAt: nowIso,
              lastUpdateAction: 'Urutan Rak Bin'
            }
          : r;
      })
    );

    await updatePalletsBinOrder(updates);
    setLocalMutationVersion((v) => v + 1);
  };

  const handleDeleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    deletePalletRecord(id).catch((err) =>
      console.error('Failed to delete pallet record from cloud:', err)
    );
    setLocalMutationVersion((v) => v + 1);
  };

  const handleClearAllRecords = () => {
    RECORD_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    });
    setRecords([]);
    clearAllPalletRecords().catch((err) =>
      console.error('Failed to clear cloud pallet records:', err)
    );
    setLocalMutationVersion((v) => v + 1);
  };

  const handleProcessOutbound = async (
    palletIds: string[],
    destination: string,
    petugas?: string
  ) => {
    const nowIso = new Date().toISOString();
    setRecords((prev) =>
      prev.map((r) => {
        if (palletIds.includes(r.id)) {
          return {
            ...r,
            status: 'OUT',
            tujuanPengambilan: destination,
            tanggalPengambilan: nowIso,
            petugasPengambilan: petugas || 'Petugas Lapangan',
            updatedAt: nowIso,
            lastUpdateAction: `Outbound (${destination})`
          };
        }
        return r;
      })
    );

    try {
      await updatePalletsOutbound(palletIds, destination, petugas);
      setLocalMutationVersion((v) => v + 1);
    } catch (err) {
      console.error('Failed to update outbound in Firestore:', err);
    }
  };

  const handleRestoreOutbound = async (palletIds: string[]) => {
    const nowIso = new Date().toISOString();
    setRecords((prev) =>
      prev.map((r) => {
        if (palletIds.includes(r.id)) {
          return {
            ...r,
            status: 'IN',
            tujuanPengambilan: undefined,
            tanggalPengambilan: undefined,
            petugasPengambilan: undefined,
            updatedAt: nowIso,
            lastUpdateAction: 'Kembalikan ke Bin'
          };
        }
        return r;
      })
    );

    try {
      await restorePalletsToBin(palletIds);
      setLocalMutationVersion((v) => v + 1);
    } catch (err) {
      console.error('Failed to restore outbound pallets in Firestore:', err);
    }
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
    if (newRecords && newRecords.length > 0) {
      setLocalMutationVersion((v) => v + 1);
    }
  };

  const activeWarehouse =
    masterWarehouses.find((w) => w.id === activeWarehouseId) || null;
  const activeRackConfig = getWarehouseRackSlots(activeWarehouse);
  const isGudang6Active = Boolean(
    activeWarehouse &&
      (activeWarehouse.namaGudang.toLowerCase().includes('6') ||
        activeRackConfig.leftPrefix.startsWith('6'))
  );

  // Daftar gudang dalam lokasi aktif (mis. Gd. KRIAN -> Gudang 05, Gudang 06, Gudang 07...)
  const locationGroupWarehouses = activeWarehouse
    ? masterWarehouses
        .filter((w) => w.locationGroup === activeWarehouse.locationGroup)
        .sort((a, b) =>
          (a.namaGudang || a.kodeGudang).localeCompare(b.namaGudang || b.kodeGudang, undefined, {
            numeric: true
          })
        )
    : [];

  const notesCheckCount = records.filter(
    (r) => (r.keterangan || '').trim().length > 0
  ).length;

  const todayUpdatedCount = (() => {
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth();
    const todayD = now.getDate();
    return records.filter((r) => {
      const iso = r.updatedAt || r.tanggalPengambilan;
      if (!iso) return false;
      const d = new Date(iso);
      return (
        !isNaN(d.getTime()) &&
        d.getFullYear() === todayY &&
        d.getMonth() === todayM &&
        d.getDate() === todayD
      );
    }).length;
  })();

  const openMasterModal = (tab: MasterModalTabKey = 'tujuan_tarif') => {
    setMasterModalInitialTab(tab);
    setIsMasterModalOpen(true);
    setIsMobileMenuOpen(false);
  };

  const sharedMasterModal = (
    <MasterItemModal
      isOpen={isMasterModalOpen}
      onClose={() => setIsMasterModalOpen(false)}
      initialTab={masterModalInitialTab}
      masterItems={masterItems}
      onAddMasterItem={handleAddMasterItem}
      onUpdateMasterItem={handleUpdateMasterItem}
      onDeleteMasterItem={handleDeleteMasterItem}
      masterRoutes={masterRoutes}
      onAddMasterRoute={handleAddMasterRoute}
      onUpdateMasterRoute={handleUpdateMasterRoute}
      onDeleteMasterRoute={handleDeleteMasterRoute}
      masterVendors={masterVendors}
      onAddMasterVendor={handleAddMasterVendor}
      onUpdateMasterVendor={handleUpdateMasterVendor}
      onDeleteMasterVendor={handleDeleteMasterVendor}
      masterTariffs={masterTariffs}
      onAddMasterTariff={handleAddMasterTariff}
      onUpdateMasterTariff={handleUpdateMasterTariff}
      onDeleteMasterTariff={handleDeleteMasterTariff}
      masterWarehouses={masterWarehouses}
      onAddMasterWarehouse={handleAddMasterWarehouse}
      onUpdateMasterWarehouse={handleUpdateMasterWarehouse}
      onDeleteMasterWarehouse={handleDeleteMasterWarehouse}
      blacklistRecords={blacklistRecords}
      onAddBlacklistRecord={handleAddBlacklist}
      onDeleteBlacklistRecord={handleDeleteBlacklist}
      warehouseUsers={warehouseUsers}
      onAddWarehouseUser={handleAddWarehouseUser}
      onDeleteWarehouseUser={handleDeleteWarehouseUser}
    />
  );

  // ISOLATED QR SCAN BIN MODE (?bin=5A.1) -> HANYA tampilkan pallet di Bin tersebut!
  if (scanOnlyBin) {
    const scanWarehouse = resolveWarehouseForBin(
      scanOnlyBin,
      masterWarehouses,
      activeWarehouse
    );
    const binOnlyRecords = records.filter(
      (r) => (r.lokasiBin || '').trim().toUpperCase() === scanOnlyBin
    );

    const handleExitScanMode = () => {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {}
      setScanOnlyBin(null);
      setIsPrintManifestOpen(false);
      setSelectedBinForModal(null);
    };

    return (
      <PrintBinManifestModal
        isOpen={true}
        isolatedScanMode={true}
        onClose={handleExitScanMode}
        binCode={scanOnlyBin}
        warehouseLabel={`${scanWarehouse?.namaGudang || 'Gudang'} · ${
          scanWarehouse?.locationGroup || 'Gd. KRIAN'
        }`}
        records={binOnlyRecords}
        onReorderPallets={handleReorderPallets}
        onProcessOutbound={handleProcessOutbound}
        onRestoreOutbound={handleRestoreOutbound}
      />
    );
  }

  // PORTAL VIEW (Level 1 SJA 3 / Gd. 137 / Gd. KRIAN -> langsung masuk Lokasi Bin & pilihan gudang di atas)
  if (!activeWarehouse) {
    return (
      <>
        <LocationPortalView
          masterWarehouses={masterWarehouses}
          selectedLocationGroup={portalLocationGroup}
          onSelectLocationGroup={(group) => {
            if (!group) {
              setPortalLocationGroup(null);
              return;
            }
            const groupActiveList = masterWarehouses
              .filter((w) => w.locationGroup === group && w.status === 'ACTIVE')
              .sort((a, b) =>
                (a.namaGudang || a.kodeGudang).localeCompare(
                  b.namaGudang || b.kodeGudang,
                  undefined,
                  { numeric: true }
                )
              );
            if (groupActiveList.length > 0) {
              setPortalLocationGroup(group);
              setActiveWarehouseId(groupActiveList[0].id);
              setActiveTab('bin_map');
            } else {
              setPortalLocationGroup(group);
            }
          }}
          onSelectWarehouse={(wh) => {
            setActiveWarehouseId(wh.id);
            setPortalLocationGroup(wh.locationGroup);
            setActiveTab('bin_map');
          }}
          onOpenWarehouseManagement={() => openMasterModal('gudang')}
          records={records}
          totalSuratJalan={suratJalanHistory.length}
          isCloudConnected={isCloudConnected}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />
        {sharedMasterModal}
      </>
    );
  }

  // Titles for current active view
  const tabTitles: Record<typeof activeTab, { title: string; subtitle: string }> = {
    input: {
      title: 'Input Data Pallet & Cetak Barcode',
      subtitle: `Entri 1-8 baris pallet, scan otomatis, alokasi Bin ${activeRackConfig.leftPrefix}.1 s/d ${activeRackConfig.rightPrefix}.${activeRackConfig.rightCount}`
    },
    results: {
      title: 'Hasil Barcode Pallet Terbit',
      subtitle: 'Label Code 128 dan QR Bin siap cetak format stiker A4'
    },
    history: {
      title: `Riwayat Pallet ${activeWarehouse.namaGudang}`,
      subtitle: 'Pelacakan stok pallet masuk, riwayat outbound, dan pengambilan muatan'
    },
    bin_map: {
      title: `${isGudang6Active ? 'Peta Rak & Lokasi Bin' : 'Denah Rak & Lokasi Bin'} ${
        activeWarehouse.namaGudang
      }`,
      subtitle: `Visualisasi tata letak rak ${activeRackConfig.leftPrefix} dan ${activeRackConfig.rightPrefix} dengan status isi real-time`
    },
    notes_check: {
      title: 'Tasklist Pallet Problem',
      subtitle: 'Daftar pallet dengan catatan problem / kendala untuk ditindaklanjuti & diedit langsung'
    },
    update_monitor: {
      title: 'Monitoring Update Pallet Harian',
      subtitle: 'Pantau jumlah dan rincian pallet yang mengalami pembaruan pada tanggal tertentu'
    },
    surat_jalan: {
      title: 'Surat Jalan / Delivery Note',
      subtitle: 'Penerbitan dokumen Form F/SCM/01.08 muatan armada pengiriman'
    },
    google_sheets: {
      title: 'Integrasi Google Sheets — Data GBJ (new)',
      subtitle: 'Sinkronisasi langsung (otomatis & manual) serta audit selisih antara sistem dan spreadsheet'
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row font-sans transition-colors duration-200">
      {/* ---------------------------------------------------------------- */}
      {/* LEFT SIDEBAR NAVIGATION                                          */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className={`no-print w-full md:w-64 xl:w-72 bg-white dark:bg-[#0f141c] border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 md:sticky md:top-0 md:h-screen z-40 select-none shadow-sm transition-all ${
          isMobileMenuOpen ? 'block' : 'hidden md:flex'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <span className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white block leading-none">
                  PalletTrack
                </span>
                <span className="text-[11px] font-bold text-blue-600 dark:text-cyan-400">
                  {activeWarehouse.locationGroup} · {activeWarehouse.namaGudang}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Back to Main Location Portal Button */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setPortalLocationGroup(null);
                setActiveWarehouseId(null);
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="Kembali ke pilihan lokasi Monitoring Produk IC — SJA 3"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>Menu Lokasi Utama</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                SJA 3
              </span>
            </button>
          </div>

          {/* Real-time Cloud Connection Status */}
          <div className="mt-2.5">
            <div
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
                isCloudConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCloudConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                ></span>
                <span>{isCloudConnected ? 'Cloud Real-time Aktif' : 'Menyambungkan...'}</span>
              </div>
              <Cloud className="w-3.5 h-3.5 opacity-70" />
            </div>
          </div>
        </div>

        {/* Navigation Menu List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Group 1: Operasional Gudang */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
              Operasional Gudang
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('input');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'input'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <PlusCircle className="w-4 h-4" />
                  <span>Input Pallet (1-8 Data)</span>
                </div>
              </button>

              {currentBatch && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('results');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === 'results'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Barcode className="w-4 h-4" />
                    <span>Hasil Barcode Pallet</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-bold">
                    {currentBatch.items.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActiveTab('history');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <History className="w-4 h-4" />
                  <span>Riwayat Pallet</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'history'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {records.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('bin_map');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'bin_map'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {isGudang6Active
                      ? `Peta Bin ${activeWarehouse.namaGudang}`
                      : `Denah Bin ${activeWarehouse.namaGudang}`}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('notes_check');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'notes_check'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>Tasklist Pallet Problem</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'notes_check'
                      ? 'bg-white/20 text-white'
                      : notesCheckCount > 0
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {notesCheckCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('update_monitor');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'update_monitor'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CalendarClock className="w-4 h-4" />
                  <span>Monitoring Update</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                    activeTab === 'update_monitor'
                      ? 'bg-white/20 text-white'
                      : todayUpdatedCount > 0
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {todayUpdatedCount}
                </span>
              </button>
            </div>
          </div>

          {/* Group 2: Distribusi & Pengiriman */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
              Distribusi Logistik
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('surat_jalan');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'surat_jalan'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4" />
                  <span>Surat Jalan / Delivery</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'surat_jalan'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {suratJalanHistory.length}
                </span>
              </button>
            </div>
          </div>

          {/* Group 3: Administrasi & Master ("User Management") */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
              Administrasi & Master
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => openMasterModal('tujuan_tarif')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors group"
                title="Buka User Management & Master Data Aplikasi"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>User Management</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                  {masterTariffs.length + masterItems.length + masterWarehouses.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('google_sheets');
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'google_sheets'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300'
                }`}
                title='Integrasi langsung ke Google Spreadsheet "Data GBJ (new)"'
              >
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet
                    className={`w-4 h-4 ${
                      activeTab === 'google_sheets'
                        ? 'text-white'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  />
                  <span>Google Sheets Sync</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === 'google_sheets'
                      ? 'bg-white/20 text-white'
                      : autoSyncEnabled &&
                        ((syncMode === 'apps_script' && isValidAppsScriptUrl(appsScriptUrl)) ||
                          (syncMode === 'oauth' && !needsGoogleAuth))
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : pendingSyncCount > 0
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {syncMode === 'apps_script'
                    ? autoSyncEnabled && isValidAppsScriptUrl(appsScriptUrl)
                      ? '24/7'
                      : isValidAppsScriptUrl(appsScriptUrl)
                      ? 'Siap'
                      : 'Setup'
                    : autoSyncEnabled && !needsGoogleAuth
                    ? 'Auto'
                    : pendingSyncCount > 0
                    ? `${pendingSyncCount}`
                    : needsGoogleAuth
                    ? 'Off'
                    : 'Siap'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsBackupModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                title="Cadangkan atau Pulihkan Data JSON"
              >
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Sinkron Data JSON</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {/* Quick Scanner Launcher */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#161c24] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
            <span>Scan Kamera Barcode / QR Bin</span>
          </button>

          {/* Dark Mode & Operator Info */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 truncate max-w-[170px]">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="truncate">Sandy (Super Admin)</span>
            </div>

            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Ganti Mode Gelap / Terang"
            >
              {isDarkMode ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-600" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* RIGHT MAIN VIEWPORT                                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header Bar */}
        <div className="md:hidden no-print flex items-center justify-between px-4 py-3 bg-white dark:bg-[#0f141c] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm block leading-none">PalletTrack</span>
              <span className="text-[10px] text-slate-500">{activeWarehouse.namaGudang}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPortalLocationGroup(null);
                setActiveWarehouseId(null);
              }}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              title="Kembali ke Menu Lokasi Utama"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              <Search className="w-4 h-4 text-blue-600" />
            </button>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              <Menu className="w-5 h-5 text-slate-700 dark:text-slate-200" />
            </button>
          </div>
        </div>

        {/* Top Breadcrumb, Inline Warehouse Switcher & Page Banner */}
        <header className="no-print bg-white/80 dark:bg-[#0f141c]/80 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3 sticky top-0 z-20 space-y-2.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {tabTitles[activeTab]?.title || 'PalletTrack'}
                </h1>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  &middot; {activeWarehouse.locationGroup} &middot; {activeWarehouse.namaGudang}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {tabTitles[activeTab]?.subtitle}
              </p>
            </div>

            {/* Quick Header Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Scan QR Bin</span>
              </button>
            </div>
          </div>

          {/* Pilihan Gudang Langsung di Bagian Atas (Gudang 05, Gudang 06, dan seterusnya) */}
          <div className="max-w-7xl mx-auto pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 mr-1 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
                <span>Pilihan Gudang ({activeWarehouse.locationGroup}):</span>
              </span>

              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {locationGroupWarehouses.map((wh) => {
                  const cfg = getWarehouseRackSlots(wh);
                  const isCurrent = wh.id === activeWarehouse.id;
                  const isMaintenance = wh.status !== 'ACTIVE';
                  const activePalletCount = records.filter((r) => {
                    if (r.status === 'OUT') return false;
                    const prefix = (r.lokasiBin || '').trim().toUpperCase().split('.')[0];
                    return prefix === cfg.leftPrefix || prefix === cfg.rightPrefix;
                  }).length;

                  return (
                    <button
                      key={wh.id}
                      type="button"
                      onClick={() => {
                        if (isMaintenance) {
                          openMasterModal('gudang');
                          return;
                        }
                        setActiveWarehouseId(wh.id);
                      }}
                      title={
                        isMaintenance
                          ? `${wh.namaGudang} berstatus Under Maintenance — klik untuk kelola di Master Gudang`
                          : `Pindah ke ${wh.namaGudang} (Rak ${cfg.leftPrefix} & ${cfg.rightPrefix})`
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isMaintenance
                          ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                      }`}
                    >
                      <span>{wh.namaGudang}</span>
                      <span
                        className={`text-[10px] font-mono tabular-nums ${
                          isCurrent
                            ? 'text-blue-100'
                            : isMaintenance
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-400 dark:text-slate-400'
                        }`}
                      >
                        {isMaintenance
                          ? 'Maintenance'
                          : `${cfg.leftPrefix}/${cfg.rightPrefix} · ${activePalletCount}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => openMasterModal('gudang')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Tambah atau atur gudang baru di Master Gudang"
            >
              <span>+ Tambah / Atur Gudang</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {records.length > 0 &&
            !lastSyncResult &&
            !(syncMode === 'apps_script' && autoSyncEnabled && isValidAppsScriptUrl(appsScriptUrl) && cloudBridgeLastSyncedAt) &&
            activeTab !== 'google_sheets' &&
            !isSheetsBannerDismissed && (
              <div className="no-print mb-5 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-emerald-900 dark:text-emerald-200">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    <strong>{records.length} Data Pallet</strong> &amp;{' '}
                    <strong>{suratJalanHistory.length} Surat Jalan</strong> tersedia. Sinkronkan ke
                    Google Sheets <strong>&ldquo;Data GBJ (new)&rdquo;</strong> agar data
                    otomatis terisi.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('google_sheets')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
                  >
                    Buka Google Sheets Sync &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSheetsBannerDismissed(true)}
                    className="px-2 py-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-semibold text-xs cursor-pointer"
                    aria-label="Tutup pemberitahuan"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}

          {activeTab === 'input' && (
            <div className="space-y-6">
              <PalletInputForm
                masterItems={masterItems}
                activeWarehouse={activeWarehouse}
                onOpenMasterDatabase={() => openMasterModal('barang')}
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
              masterItems={masterItems}
              masterWarehouses={masterWarehouses}
              suratJalanHistory={suratJalanHistory}
              onUpdateRecord={handleUpdateRecord}
              onReorderPallets={handleReorderPallets}
              onDeleteRecord={handleDeleteRecord}
              onClearAll={handleClearAllRecords}
              onNewInput={() => setActiveTab('input')}
              onProcessOutbound={handleProcessOutbound}
              onRestoreOutbound={handleRestoreOutbound}
            />
          )}

          {activeTab === 'bin_map' && (
            <WarehouseBinViewer
              records={records}
              activeWarehouse={activeWarehouse}
              onSelectBin={(binCode) => {
                handleOpenBinDetail(binCode);
              }}
            />
          )}

          {activeTab === 'notes_check' && (
            <PalletNotesCheckView
              records={records}
              masterItems={masterItems}
              onUpdateRecord={handleUpdateRecord}
            />
          )}

          {activeTab === 'update_monitor' && (
            <PalletUpdateMonitorView
              records={records}
              activeWarehouse={activeWarehouse}
              onOpenHistory={() => setActiveTab('history')}
            />
          )}

          {activeTab === 'surat_jalan' && (
            <SuratJalanView
              records={records}
              masterItems={masterItems}
              masterRoutes={masterRoutes}
              masterVendors={masterVendors}
              masterTariffs={masterTariffs}
              suratJalanHistory={suratJalanHistory}
              onSaveSuratJalan={handleSaveSuratJalan}
            />
          )}

          {activeTab === 'google_sheets' && (
            <GoogleSheetsSyncView
              records={records}
              suratJalanHistory={suratJalanHistory}
              masterItems={masterItems}
              masterWarehouses={masterWarehouses}
              syncMode={syncMode}
              onChangeSyncMode={(m) => setSyncMode(m)}
              appsScriptUrl={appsScriptUrl}
              onChangeAppsScriptUrl={setAppsScriptUrl}
              appsScriptSecret={appsScriptSecret}
              onChangeAppsScriptSecret={setAppsScriptSecret}
              isBridgeSavedInCloud={isBridgeSavedInCloud}
              onSaveBridgeSettings={async (opts) => {
                await persistBridgeConfigToCloud({
                  syncMode: 'apps_script',
                  autoSync24x7Enabled: opts?.autoSync24x7 ?? autoSyncEnabled
                });
              }}
              googleUser={googleUser}
              needsAuth={needsGoogleAuth}
              isLoggingIn={isGoogleLoggingIn}
              onGoogleSignIn={handleGoogleSignIn}
              onGoogleSignOut={handleGoogleSignOut}
              spreadsheetInput={spreadsheetInput}
              onChangeSpreadsheetInput={setSpreadsheetInput}
              selectedSheetTab={selectedSheetTab}
              onChangeSelectedSheetTab={setSelectedSheetTab}
              includeSuratJalanTab={includeSuratJalanTab}
              onChangeIncludeSuratJalanTab={setIncludeSuratJalanTab}
              includeManualSjTab={includeManualSjTab}
              onChangeIncludeManualSjTab={setIncludeManualSjTab}
              manualSjSpreadsheetInput={manualSjSpreadsheetInput}
              onChangeManualSjSpreadsheetInput={setManualSjSpreadsheetInput}
              includeRekapTab={includeRekapTab}
              onChangeIncludeRekapTab={setIncludeRekapTab}
              autoSyncEnabled={autoSyncEnabled}
              onEnableAutoSync={handleEnableAutoSync}
              onDisableAutoSync={handleDisableAutoSync}
              isSyncing={isSyncingSheets}
              lastSyncResult={lastSyncResult}
              syncError={sheetsSyncError}
              pendingSyncCount={pendingSyncCount}
              activityLogs={syncActivityLogs}
              onExecuteManualSync={async (alsoEnableAutoSync?: boolean) => {
                const res = await executeSheetsSync('Manual');
                if (alsoEnableAutoSync) {
                  setAutoSyncEnabled(true);
                }
                if (syncMode === 'apps_script' && isValidAppsScriptUrl(appsScriptUrl)) {
                  await persistBridgeConfigToCloud({
                    syncMode: 'apps_script',
                    palletTabTitle: res.palletTabTitle || selectedSheetTab,
                    autoSync24x7Enabled: alsoEnableAutoSync ? true : autoSyncEnabled,
                    lastSyncedAt: res.syncedAt
                  }).catch(() => {});
                }
              }}
              onImportFromSheet={handleImportFromGoogleSheet}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="no-print mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f141c] py-3.5 px-6 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                PT. Santos Jaya Abadi · {activeWarehouse.locationGroup} ({activeWarehouse.namaGudang}) &amp; Barcode Code 128
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Sinkronisasi Cloud Firestore aktif di seluruh tablet & ponsel operator
            </div>
          </div>
        </footer>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* MODALS & OVERLAYS                                               */}
      {/* ---------------------------------------------------------------- */}

      {/* Master Data & User Management Modal */}
      {sharedMasterModal}

      {/* Barcode & QR Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        records={records}
        onSelectBinManifest={(binCode: string) => {
          setSelectedBinForModal(binCode);
          setIsPrintManifestOpen(true);
        }}
        onProcessOutbound={handleProcessOutbound}
        onOpenBinDetail={handleOpenBinDetail}
      />

      {/* Bin Detail Modal */}
      <BinDetailModal
        isOpen={isBinModalOpen}
        onClose={() => {
          setIsBinModalOpen(false);
          setSelectedBinForModal(null);
        }}
        binCode={selectedBinForModal || ''}
        warehouseLabel={(() => {
          const wh = resolveWarehouseForBin(
            selectedBinForModal || '',
            masterWarehouses,
            activeWarehouse
          );
          return wh ? `${wh.namaGudang} · ${wh.locationGroup}` : activeWarehouse.namaGudang;
        })()}
        records={records}
        masterWarehouses={masterWarehouses}
        suratJalanHistory={suratJalanHistory}
        onReorderPallets={handleReorderPallets}
        onProcessOutbound={handleProcessOutbound}
        onRestoreOutbound={handleRestoreOutbound}
        onPrintManifest={(binCode: string) => {
          setIsBinModalOpen(false);
          setSelectedBinForModal(binCode);
          setIsPrintManifestOpen(true);
        }}
      />

      {/* Printed Manifest Sheet Modal */}
      <PrintBinManifestModal
        isOpen={isPrintManifestOpen}
        onClose={() => {
          setIsPrintManifestOpen(false);
          setSelectedBinForModal(null);
        }}
        binCode={selectedBinForModal || ''}
        warehouseLabel={(() => {
          const wh = resolveWarehouseForBin(
            selectedBinForModal || '',
            masterWarehouses,
            activeWarehouse
          );
          return wh ? `${wh.namaGudang} · ${wh.locationGroup}` : activeWarehouse.namaGudang;
        })()}
        records={records}
        onReorderPallets={handleReorderPallets}
        onProcessOutbound={handleProcessOutbound}
        onRestoreOutbound={handleRestoreOutbound}
      />

      {/* Backup and Restore Modal */}
      <DataBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        records={records}
        masterItems={masterItems}
        onImportData={handleImportBackupData}
      />
    </div>
  );
}
