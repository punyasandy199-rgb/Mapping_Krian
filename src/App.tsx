import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import kapalApiLogo from './assets/kapal-api-logo.png';
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
  seedMasterRoutes,
  subscribeToMasterVendors,
  saveMasterVendor,
  deleteMasterVendor,
  seedMasterVendors,
  subscribeToMasterTariffs,
  saveMasterTariff,
  deleteMasterTariff,
  seedMasterTariffs,
  subscribeToMasterWarehouses,
  saveMasterWarehouse,
  deleteMasterWarehouse,
  subscribeToBlacklist,
  saveBlacklistRecord,
  deleteBlacklistRecord,
  seedBlacklistRecords,
  subscribeToWarehouseUsers,
  saveWarehouseUser,
  deleteWarehouseUser,
  seedWarehouseUsers,
  subscribeToSuratJalanRecords,
  saveSuratJalanRecord,
  updateSuratJalanRecord,
  deleteSuratJalanRecord,
  MasterCollectionKey,
  MasterRegistryMeta,
  subscribeToMasterRegistryMeta,
  saveMasterRegistryMeta,
  SheetsSyncMode,
  SheetsBridgeConfig,
  subscribeToSheetsBridgeConfig,
  saveSheetsBridgeConfig
} from './services/firebase';
import {
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
const ACTIVE_OPERATOR_STORAGE_KEY = 'pallettrack_active_operator_v1';
const MASTER_SYNC_CHANNEL = 'pallettrack_master_sync_v1';

const DELETED_KEY_MAP: Record<MasterCollectionKey, string> = {
  items: DELETED_ITEMS_KEY,
  routes: DELETED_ROUTES_KEY,
  vendors: DELETED_VENDORS_KEY,
  tariffs: DELETED_TARIFFS_KEY,
  warehouses: DELETED_WAREHOUSES_KEY,
  blacklist: DELETED_BLACKLIST_KEY,
  users: DELETED_USERS_KEY
};

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
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

function broadcastMasterSync(scope: string = 'all') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(MASTER_SYNC_CHANNEL);
      ch.postMessage({ scope, ts: Date.now() });
      ch.close();
    }
  } catch {}
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

const PURGED_SURAT_JALAN_IDS = new Set([
  'sj-1794549474809-0-d69p',
  'sj-1794549475032-1-vr2n',
  'sj-1794804651402-0-9y26'
]);

function loadSavedSuratJalan(): SuratJalanRecord[] {
  try {
    for (const key of SURAT_STORAGE_KEYS) {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (sj) => sj && !PURGED_SURAT_JALAN_IDS.has(sj.id)
          );
          if (cleaned.length !== parsed.length) {
            localStorage.setItem(key, JSON.stringify(cleaned));
          }
          return cleaned;
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
  const [activeOperatorId, setActiveOperatorId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_OPERATOR_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // Operational State
  const [suratJalanHistory, setSuratJalanHistory] = useState<SuratJalanRecord[]>(loadSavedSuratJalan);
  const [records, setRecords] = useState<PalletRecord[]>(loadSavedRecords);
  const [currentBatch, setCurrentBatch] = useState<BatchSubmission | null>(null);

  // Shared Cloud Metadata & Latest Snapshots for atomic master reconciliation across devices
  const cloudMetaRef = useRef<MasterRegistryMeta>({
    deletedIds: {},
    touched: {},
    updatedAt: ''
  });
  const latestCloudRef = useRef<{
    items: MasterItem[] | null;
    routes: MasterRoute[] | null;
    vendors: MasterVendor[] | null;
    tariffs: MasterRouteTariff[] | null;
    warehouses: MasterWarehouse[] | null;
    blacklist: BlacklistRecord[] | null;
    users: WarehouseUser[] | null;
  }>({
    items: null,
    routes: null,
    vendors: null,
    tariffs: null,
    warehouses: null,
    blacklist: null,
    users: null
  });

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
  const [syncMode, setSyncMode] = useState<SheetsSyncMode>(() => {
    try {
      const saved = localStorage.getItem('pallettrack_gsheets_mode_v1');
      return saved === 'oauth' ? 'oauth' : 'apps_script';
    } catch {
      return 'apps_script';
    }
  });
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>('');
  const [appsScriptSecret, setAppsScriptSecret] = useState<string>(DEFAULT_APPS_SCRIPT_SECRET);
  const [isBridgeSavedInCloud, setIsBridgeSavedInCloud] = useState<boolean>(false);
  const [cloudBridgeLastSyncedAt, setCloudBridgeLastSyncedAt] = useState<string | null>(null);
  const [detectedBridgeVersion, setDetectedBridgeVersion] = useState<number | null>(null);

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
  const [lockSheetReadOnly, setLockSheetReadOnly] = useState<boolean>(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    try {
      const savedMode = localStorage.getItem('pallettrack_gsheets_mode_v1');
      if (savedMode === 'oauth') {
        return localStorage.getItem('pallettrack_gsheets_autosync_oauth_v1') === 'true';
      }
      return false;
    } catch {
      return false;
    }
  });
  const [isSheetsBannerDismissed, setIsSheetsBannerDismissed] = useState<boolean>(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncAllResult | null>(null);
  const [sheetsSyncError, setSheetsSyncError] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [syncActivityLogs, setSyncActivityLogs] = useState<SyncActivityLogItem[]>([]);
  const [localMutationVersion, setLocalMutationVersion] = useState<number>(0);
  const localMutationVersionRef = useRef<number>(0);
  const lastSyncedDigestRef = useRef<string>('');
  const lastSyncedLocalVersionRef = useRef<number>(0);
  const isAutoSyncRunningRef = useRef<boolean>(false);
  const hasQueuedAutoSyncRef = useRef<boolean>(false);

  // Sync dark class on document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const getMergedDeletedSet = useCallback((key: MasterCollectionKey): Set<string> => {
    const localSet = getDeletedIds(DELETED_KEY_MAP[key]);
    const cloudList = cloudMetaRef.current.deletedIds?.[key] || [];
    const merged = new Set<string>(localSet);
    cloudList.forEach((id) => merged.add(id));
    if (merged.size > localSet.size) {
      try {
        localStorage.setItem(DELETED_KEY_MAP[key], JSON.stringify(Array.from(merged)));
      } catch {}
    }
    return merged;
  }, []);

  const persistMasterMeta = useCallback(
    (key: MasterCollectionKey, opts?: { addDeletedId?: string; markTouched?: boolean }) => {
      const current = cloudMetaRef.current;
      const mergedDeleted = new Set<string>(current.deletedIds?.[key] || []);
      getDeletedIds(DELETED_KEY_MAP[key]).forEach((id) => mergedDeleted.add(id));
      if (opts?.addDeletedId) {
        mergedDeleted.add(opts.addDeletedId);
        recordDeletedId(DELETED_KEY_MAP[key], opts.addDeletedId);
      }

      const nextMeta: MasterRegistryMeta = {
        deletedIds: {
          ...(current.deletedIds || {}),
          [key]: Array.from(mergedDeleted)
        },
        touched: {
          ...(current.touched || {}),
          ...(opts?.markTouched ? { [key]: true } : {})
        },
        updatedAt: new Date().toISOString()
      };
      cloudMetaRef.current = nextMeta;
      saveMasterRegistryMeta(nextMeta).catch(() => {});
    },
    []
  );

  const reconcileMasterCollection = useCallback(
    (key?: MasterCollectionKey) => {
      const shouldSync = (target: MasterCollectionKey) => !key || key === target;
      const cloud = latestCloudRef.current;
      const touched = cloudMetaRef.current.touched || {};

      if (shouldSync('items') && cloud.items !== null) {
        const deleted = getMergedDeletedSet('items');
        const map = new Map<string, MasterItem>();
        DEFAULT_MASTER_ITEMS.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
        cloud.items.filter((i) => !deleted.has(i.id)).forEach((i) => map.set(i.id, i));
        setMasterItems(Array.from(map.values()));
      }

      if (shouldSync('routes') && cloud.routes !== null) {
        const deleted = getMergedDeletedSet('routes');
        setMasterRoutes(
          deduplicateMasterRoutes([
            ...DEFAULT_MASTER_ROUTES.filter((r) => !deleted.has(r.id)),
            ...cloud.routes.filter((r) => !deleted.has(r.id))
          ])
        );
      }

      if (shouldSync('vendors') && cloud.vendors !== null) {
        const deleted = getMergedDeletedSet('vendors');
        if (cloud.vendors.length > 0 || touched.vendors) {
          setMasterVendors(cloud.vendors.filter((v) => !deleted.has(v.id)));
        } else {
          setMasterVendors(DEFAULT_MASTER_VENDORS.filter((v) => !deleted.has(v.id)));
        }
      }

      if (shouldSync('tariffs') && cloud.tariffs !== null) {
        const deleted = getMergedDeletedSet('tariffs');
        if (cloud.tariffs.length > 0 || touched.tariffs) {
          setMasterTariffs(cloud.tariffs.filter((t) => !deleted.has(t.id)));
        } else {
          setMasterTariffs(DEFAULT_MASTER_ROUTE_TARIFFS.filter((t) => !deleted.has(t.id)));
        }
      }

      if (shouldSync('blacklist') && cloud.blacklist !== null) {
        const deleted = getMergedDeletedSet('blacklist');
        if (cloud.blacklist.length > 0 || touched.blacklist) {
          setBlacklistRecords(cloud.blacklist.filter((b) => !deleted.has(b.id)));
        } else {
          setBlacklistRecords(DEFAULT_BLACKLIST_RECORDS.filter((b) => !deleted.has(b.id)));
        }
      }

      if (shouldSync('users') && cloud.users !== null) {
        const deleted = getMergedDeletedSet('users');
        if (cloud.users.length > 0 || touched.users) {
          setWarehouseUsers(cloud.users.filter((u) => !deleted.has(u.id)));
        } else {
          setWarehouseUsers(DEFAULT_WAREHOUSE_USERS.filter((u) => !deleted.has(u.id)));
        }
      }

      if (shouldSync('warehouses') && cloud.warehouses !== null) {
        const deleted = getMergedDeletedSet('warehouses');
        const map = new Map<string, MasterWarehouse>();
        DEFAULT_MASTER_WAREHOUSES.filter((w) => !deleted.has(w.id)).forEach((w) =>
          map.set(w.id, w)
        );
        cloud.warehouses.filter((w) => !deleted.has(w.id)).forEach((w) => map.set(w.id, w));
        setMasterWarehouses(Array.from(map.values()));
      }
    },
    [getMergedDeletedSet]
  );

  // Real-time synchronization with Cloud Firestore
  useEffect(() => {
    // 0. Subscribe to Shared Master Registry Metadata (cross-device deletions & touched flags)
    const unsubscribeMeta = subscribeToMasterRegistryMeta((meta) => {
      if (!meta) return;
      cloudMetaRef.current = {
        deletedIds: meta.deletedIds || {},
        touched: meta.touched || {},
        updatedAt: meta.updatedAt || ''
      };
      // Sinkronkan deletedIds ke localStorage lokal
      (Object.keys(DELETED_KEY_MAP) as MasterCollectionKey[]).forEach((k) => {
        const incoming = meta.deletedIds?.[k] || [];
        if (incoming.length > 0) {
          const merged = new Set<string>(getDeletedIds(DELETED_KEY_MAP[k]));
          incoming.forEach((id) => merged.add(id));
          try {
            localStorage.setItem(DELETED_KEY_MAP[k], JSON.stringify(Array.from(merged)));
          } catch {}
        }
      });
      reconcileMasterCollection();
    });

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

    // 2. Subscribe to Master Items (direct reconciliation, no stale prev accumulation)
    const unsubscribeMaster = subscribeToMasterItems((cloudMaster) => {
      latestCloudRef.current.items = cloudMaster || [];
      reconcileMasterCollection('items');
    });

    // 3. Subscribe to Master Routes
    const unsubscribeRoutes = subscribeToMasterRoutes((cloudRoutes) => {
      latestCloudRef.current.routes = cloudRoutes || [];
      reconcileMasterCollection('routes');
    });

    // 4. Subscribe to Master Vendors
    const unsubscribeVendors = subscribeToMasterVendors((cloudVendors) => {
      latestCloudRef.current.vendors = cloudVendors || [];
      reconcileMasterCollection('vendors');
    });

    // 5. Subscribe to Master Tariffs (Tujuan & Tarif)
    const unsubscribeTariffs = subscribeToMasterTariffs((cloudTariffs) => {
      latestCloudRef.current.tariffs = cloudTariffs || [];
      reconcileMasterCollection('tariffs');
    });

    // 6. Subscribe to Blacklist
    const unsubscribeBlacklist = subscribeToBlacklist((cloudBlacklist) => {
      latestCloudRef.current.blacklist = cloudBlacklist || [];
      reconcileMasterCollection('blacklist');
    });

    // 7. Subscribe to Warehouse Users
    const unsubscribeUsers = subscribeToWarehouseUsers((cloudUsers) => {
      latestCloudRef.current.users = cloudUsers || [];
      reconcileMasterCollection('users');
    });

    // 8. Subscribe to Surat Jalan Records
    const unsubscribeSuratJalan = subscribeToSuratJalanRecords((cloudSurat) => {
      if (cloudSurat) {
        setSuratJalanHistory(
          cloudSurat.filter((sj) => sj && !PURGED_SURAT_JALAN_IDS.has(sj.id))
        );
      }
    });

    // 9. Subscribe to Master Warehouses (Lokasi & Sub-Lokasi Gudang)
    const unsubscribeWarehouses = subscribeToMasterWarehouses((cloudWarehouses) => {
      latestCloudRef.current.warehouses = cloudWarehouses || [];
      reconcileMasterCollection('warehouses');
    });

    // 10. Subscribe to Shared Google Sheets Bridge Settings (for 24/7 no-login operator sync)
    const unsubscribeBridge = subscribeToSheetsBridgeConfig((cfg) => {
      if (!cfg) return;
      const effectiveMode: SheetsSyncMode = cfg.syncMode || 'apps_script';
      setSyncMode(effectiveMode);
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
      if (cfg.lockSheetReadOnly !== undefined) {
        setLockSheetReadOnly(cfg.lockSheetReadOnly);
      }
      setIsBridgeSavedInCloud(Boolean(cfg.appsScriptUrl && isValidAppsScriptUrl(cfg.appsScriptUrl)));
      setCloudBridgeLastSyncedAt(cfg.lastSyncedAt || null);
      if (effectiveMode === 'apps_script') {
        setAutoSyncEnabled(Boolean(cfg.autoSync24x7Enabled));
      } else {
        try {
          const savedOAuthAuto = localStorage.getItem('pallettrack_gsheets_autosync_oauth_v1');
          if (savedOAuthAuto !== null) {
            setAutoSyncEnabled(savedOAuthAuto === 'true');
          } else if (cfg.autoSync24x7Enabled !== undefined) {
            setAutoSyncEnabled(Boolean(cfg.autoSync24x7Enabled));
          }
        } catch {}
      }
    });

    return () => {
      unsubscribeMeta();
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
  }, [reconcileMasterCollection]);

  // Same-browser Multi-Tab real-time sync (storage event + BroadcastChannel)
  useEffect(() => {
    const syncFromLocalStorage = (key?: string | null) => {
      if (!key || key === MASTER_STORAGE_KEYS[0] || key === DELETED_ITEMS_KEY) {
        setMasterItems(loadSavedMasterItems());
      }
      if (!key || key === ROUTE_STORAGE_KEYS[0] || key === DELETED_ROUTES_KEY) {
        setMasterRoutes(loadSavedMasterRoutes());
      }
      if (!key || key === VENDOR_STORAGE_KEYS[0] || key === DELETED_VENDORS_KEY) {
        setMasterVendors(loadSavedMasterVendors());
      }
      if (!key || key === TARIFF_STORAGE_KEYS[0] || key === DELETED_TARIFFS_KEY) {
        setMasterTariffs(loadSavedMasterTariffs());
      }
      if (!key || key === WAREHOUSE_STORAGE_KEYS[0] || key === DELETED_WAREHOUSES_KEY) {
        setMasterWarehouses(loadSavedMasterWarehouses());
      }
      if (!key || key === BLACKLIST_STORAGE_KEYS[0] || key === DELETED_BLACKLIST_KEY) {
        setBlacklistRecords(loadSavedBlacklist());
      }
      if (!key || key === USER_STORAGE_KEYS[0] || key === DELETED_USERS_KEY) {
        setWarehouseUsers(loadSavedWarehouseUsers());
      }
      if (!key || key === RECORD_STORAGE_KEYS[0]) {
        setRecords(loadSavedRecords());
      }
      if (!key || key === SURAT_STORAGE_KEYS[0]) {
        setSuratJalanHistory(loadSavedSuratJalan());
      }
      if (!key || key === ACTIVE_OPERATOR_STORAGE_KEY) {
        try {
          setActiveOperatorId(localStorage.getItem(ACTIVE_OPERATOR_STORAGE_KEY) || '');
        } catch {}
      }
    };

    const handleStorage = (e: StorageEvent) => {
      syncFromLocalStorage(e.key);
    };
    window.addEventListener('storage', handleStorage);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(MASTER_SYNC_CHANNEL);
        bc.onmessage = () => {
          syncFromLocalStorage(null);
        };
      }
    } catch {}

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, []);

  // Keep active warehouse selection synced when User Management edits or deletes warehouses
  useEffect(() => {
    if (!activeWarehouseId) return;
    const matched = masterWarehouses.find((w) => w.id === activeWarehouseId);
    if (!matched) {
      setActiveWarehouseId(null);
    } else if (matched.locationGroup !== portalLocationGroup) {
      setPortalLocationGroup(matched.locationGroup);
    }
  }, [masterWarehouses, activeWarehouseId, portalLocationGroup]);

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
      localStorage.setItem(BLACKLIST_STORAGE_KEYS[0], JSON.stringify(blacklistRecords));
    } catch (e) {}
  }, [blacklistRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_STORAGE_KEYS[0], JSON.stringify(warehouseUsers));
    } catch (e) {}
  }, [warehouseUsers]);

  useEffect(() => {
    try {
      if (activeOperatorId) {
        localStorage.setItem(ACTIVE_OPERATOR_STORAGE_KEY, activeOperatorId);
      }
    } catch (e) {}
  }, [activeOperatorId]);

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

  useEffect(() => {
    try {
      localStorage.setItem('pallettrack_gsheets_mode_v1', syncMode);
    } catch (e) {}
  }, [syncMode]);

  useEffect(() => {
    if (syncMode === 'oauth') {
      try {
        localStorage.setItem('pallettrack_gsheets_autosync_oauth_v1', String(autoSyncEnabled));
      } catch (e) {}
    }
  }, [syncMode, autoSyncEnabled]);

  useEffect(() => {
    localMutationVersionRef.current = localMutationVersion;
  }, [localMutationVersion]);

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
          `${s.id}:${s.updatedAt || s.createdAt}:${s.noSuratJalan}:${s.tanggal}:${
            s.tanggalPengambilanFormatted || ''
          }:${s.tglJamCetakCustom || ''}:${s.noSpp || ''}:${s.noPo || ''}:${s.noPolisi || ''}:${
            s.namaVendorArmada || ''
          }:${s.namaDriver || ''}:${s.noHpDriver || ''}:${s.noKontainer || ''}:${
            s.noFaktur || ''
          }:${s.noInvoice || ''}:${s.ruteDariNama || ''}:${s.ruteTujuanNama || ''}:${
            s.tarif ?? ''
          }:${s.ppnPersen ?? ''}:${s.tarifTotal ?? ''}:${s.grandTotalBox}:${s.grandTotalKg}:${
            s.note || ''
          }:${(s.palletIds || []).join(',')}:${(s.itemsSummary || [])
            .map((it) => `${it.kodeItem || '-'}:${it.namaBarang}:${it.qtyBox}:${it.totalKg}`)
            .join(';')}`
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
        lockSheetReadOnly: overrides.lockSheetReadOnly ?? lockSheetReadOnly,
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
      lockSheetReadOnly,
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
                syncRekapTab: includeRekapTab,
                lockSheetReadOnly
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
                syncRekapTab: includeRekapTab,
                lockSheetReadOnly
              });
        setLastSyncResult(result);
        setCloudBridgeLastSyncedAt(result.syncedAt);
        if (result.bridgeVersion !== undefined) {
          setDetectedBridgeVersion(result.bridgeVersion);
        }
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
      lockSheetReadOnly,
      computeDataDigest,
      appendSyncLog
    ]
  );

  const executeSheetsSyncRef = useRef(executeSheetsSync);
  useEffect(() => {
    executeSheetsSyncRef.current = executeSheetsSync;
  }, [executeSheetsSync]);

  const oauthDataDigest = useMemo(
    () => (syncMode === 'oauth' ? computeDataDigest() : ''),
    [syncMode, computeDataDigest]
  );

  const handleGoogleSignIn = async () => {
    setIsGoogleLoggingIn(true);
    setSheetsSyncError(null);
    try {
      const { user } = await signInWithGoogleSheets();
      setGoogleUser(user);
      setNeedsGoogleAuth(false);
      if (autoSyncEnabled) {
        window.setTimeout(() => {
          executeSheetsSyncRef.current('Otomatis').catch(() => {});
        }, 400);
      }
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
    lastSyncedLocalVersionRef.current = localMutationVersionRef.current;
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
  // - Cara B (apps_script): runs on the mutating device (24/7 without Google login), never cancelled by Firestore snapshot echoes
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

      const timer = window.setTimeout(async () => {
        if (isAutoSyncRunningRef.current) {
          hasQueuedAutoSyncRef.current = true;
          return;
        }
        isAutoSyncRunningRef.current = true;
        const targetVer = localMutationVersionRef.current;
        try {
          await executeSheetsSyncRef.current('Otomatis');
          lastSyncedLocalVersionRef.current = targetVer;
        } catch {
          // Error already captured in sheetsSyncError & syncActivityLogs
        } finally {
          isAutoSyncRunningRef.current = false;
          if (hasQueuedAutoSyncRef.current || localMutationVersionRef.current > targetVer) {
            hasQueuedAutoSyncRef.current = false;
            setLocalMutationVersion((v) => v + 1);
          }
        }
      }, 1200);

      return () => window.clearTimeout(timer);
    }

    if (!oauthDataDigest || oauthDataDigest === lastSyncedDigestRef.current) return;

    if (needsGoogleAuth || !getGoogleSheetsAccessToken()) {
      setPendingSyncCount((c) => c + 1);
      return;
    }

    const timer = window.setTimeout(async () => {
      if (isAutoSyncRunningRef.current) {
        hasQueuedAutoSyncRef.current = true;
        return;
      }
      isAutoSyncRunningRef.current = true;
      try {
        await executeSheetsSyncRef.current('Otomatis');
      } catch {
        // Error already captured in sheetsSyncError & syncActivityLogs
      } finally {
        isAutoSyncRunningRef.current = false;
        if (hasQueuedAutoSyncRef.current) {
          hasQueuedAutoSyncRef.current = false;
          window.setTimeout(() => {
            executeSheetsSyncRef.current('Otomatis').catch(() => {});
          }, 500);
        }
      }
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [
    autoSyncEnabled,
    syncMode,
    appsScriptUrl,
    localMutationVersion,
    oauthDataDigest,
    needsGoogleAuth
  ]);

  // Master Items Handlers
  const handleAddMasterItem = (newItem: Omit<MasterItem, 'id'>) => {
    const item: MasterItem = {
      ...newItem,
      id: `itm-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterItems((prev) => [item, ...prev]);
    saveMasterItem(item).catch((err) => console.error('Cloud save item error:', err));
    broadcastMasterSync('items');
  };

  const handleUpdateMasterItem = (updatedItem: MasterItem) => {
    const oldItem = masterItems.find((i) => i.id === updatedItem.id);
    const oldKode = (oldItem?.kodeItem || updatedItem.kodeItem).trim().toUpperCase();
    const oldNama = (oldItem?.namaBarang || updatedItem.namaBarang).trim().toUpperCase();
    const newKode = updatedItem.kodeItem.trim().toUpperCase();
    const newNama = updatedItem.namaBarang.trim();
    const newNamaUpper = newNama.toUpperCase();
    const newUnit = updatedItem.satuan || 'Box';
    const newBerat = updatedItem.beratPerBoxKg ?? 30;
    const nowIso = new Date().toISOString();

    setMasterItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    saveMasterItem(updatedItem).catch((err) => console.error('Cloud update item error:', err));

    // Otomatis cascade perubahan Master Barang ke data pallet berjalan & batch aktif
    const changedPallets: PalletRecord[] = [];
    const nextRecords = records.map((r) => {
      const rKode = (r.kodeItem || '').trim().toUpperCase();
      const matches = rKode === oldKode || rKode === newKode;
      if (!matches) return r;
      if (rKode === newKode && r.namaBarang === newNama && r.unit === newUnit) {
        return r;
      }
      const nextRec: PalletRecord = {
        ...r,
        kodeItem: newKode,
        namaBarang: newNama,
        unit: newUnit,
        updatedAt: nowIso,
        lastUpdateAction: `Sync Master Barang (${newKode})`
      };
      changedPallets.push(nextRec);
      return nextRec;
    });
    if (changedPallets.length > 0) {
      setRecords(nextRecords);
      const changedMap = new Map(changedPallets.map((p) => [p.id, p]));
      setCurrentBatch((prev) => {
        if (!prev) return prev;
        const hasMatch = prev.items.some((i) => changedMap.has(i.id));
        if (!hasMatch) return prev;
        return {
          ...prev,
          items: prev.items.map((i) => changedMap.get(i.id) || i)
        };
      });
      Promise.all(
        changedPallets.map((p) => updatePalletRecord(p).catch(() => undefined))
      );
    }

    // Otomatis cascade perubahan Master Barang ke Surat Jalan yang sudah terbit
    const changedSuratJalans: SuratJalanRecord[] = [];
    const nextSjs = suratJalanHistory.map((sj) => {
      if (!sj.itemsSummary || sj.itemsSummary.length === 0) return sj;
      let sjModified = false;
      const nextSummary = sj.itemsSummary.map((line) => {
        const lKode = (line.kodeItem || '').trim().toUpperCase();
        const lNama = (line.namaBarang || '').trim().toUpperCase();
        const matches =
          (lKode && lKode !== '-' && (lKode === oldKode || lKode === newKode)) ||
          (lNama && (lNama === oldNama || lNama === newNamaUpper));
        if (!matches) return line;
        const nextTotalKg = Math.round((Number(line.qtyBox) || 0) * newBerat * 100) / 100;
        const nextDetail = `${newKode} (1 X ${newBerat} KG)`;
        if (
          lKode === newKode &&
          lNama === newNamaUpper &&
          line.beratPerBoxKg === newBerat &&
          line.totalKg === nextTotalKg &&
          line.detailBarang === nextDetail
        ) {
          return line;
        }
        sjModified = true;
        return {
          ...line,
          kodeItem: newKode,
          namaBarang: newNamaUpper,
          detailBarang: nextDetail,
          beratPerBoxKg: newBerat,
          totalKg: nextTotalKg
        };
      });
      if (!sjModified) return sj;
      const nextGrandKg =
        Math.round(nextSummary.reduce((sum, l) => sum + (Number(l.totalKg) || 0), 0) * 100) / 100;
      const nextSj: SuratJalanRecord = {
        ...sj,
        itemsSummary: nextSummary,
        grandTotalKg: nextGrandKg,
        updatedAt: nowIso,
        lastUpdateAction: `Sync Master Barang (${newKode})`
      };
      changedSuratJalans.push(nextSj);
      return nextSj;
    });
    if (changedSuratJalans.length > 0) {
      setSuratJalanHistory(nextSjs);
      Promise.all(
        changedSuratJalans.map((sj) => updateSuratJalanRecord(sj).catch(() => undefined))
      );
    }

    if (changedPallets.length > 0 || changedSuratJalans.length > 0) {
      setLocalMutationVersion((v) => v + 1);
    }
    broadcastMasterSync('items');
  };

  const handleDeleteMasterItem = (id: string) => {
    persistMasterMeta('items', { addDeletedId: id, markTouched: true });
    setMasterItems((prev) => prev.filter((i) => i.id !== id));
    deleteMasterItem(id).catch((err) => console.error('Cloud delete item error:', err));
    broadcastMasterSync('items');
  };

  // Route Handlers
  const handleAddMasterRoute = (newRoute: Omit<MasterRoute, 'id'>) => {
    const route: MasterRoute = {
      ...newRoute,
      id: `route-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterRoutes((prev) => deduplicateMasterRoutes([...prev, route]));
    saveMasterRoute(route).catch((err) => console.error('Cloud save route error:', err));
    broadcastMasterSync('routes');
  };

  const handleUpdateMasterRoute = (updatedRoute: MasterRoute) => {
    const oldRoute = masterRoutes.find((r) => r.id === updatedRoute.id);
    const nowIso = new Date().toISOString();

    setMasterRoutes((prev) =>
      deduplicateMasterRoutes(
        prev.map((r) => (r.id === updatedRoute.id ? updatedRoute : r))
      )
    );
    saveMasterRoute(updatedRoute).catch((err) => console.error('Cloud update route error:', err));

    // Cascade perubahan nama/alamat rute ke Surat Jalan terbit yang merujuk rute ini
    const changedSjs: SuratJalanRecord[] = [];
    const nextSjs = suratJalanHistory.map((sj) => {
      const matchDari = sj.ruteDariId === updatedRoute.id;
      const matchTujuan = sj.ruteTujuanId === updatedRoute.id;
      if (!matchDari && !matchTujuan) return sj;
      const nextSj: SuratJalanRecord = {
        ...sj,
        ...(matchDari
          ? {
              ruteDariNama: updatedRoute.namaLokasi,
              ruteDariAlamat: updatedRoute.alamat
            }
          : {}),
        ...(matchTujuan
          ? {
              ruteTujuanKode: updatedRoute.kodeLokasi,
              ruteTujuanNama: updatedRoute.namaLokasi,
              ruteTujuanAlamat: updatedRoute.alamat
            }
          : {}),
        updatedAt: nowIso,
        lastUpdateAction: `Sync Master Rute (${updatedRoute.kodeLokasi})`
      };
      changedSjs.push(nextSj);
      return nextSj;
    });
    if (changedSjs.length > 0) {
      setSuratJalanHistory(nextSjs);
      Promise.all(changedSjs.map((sj) => updateSuratJalanRecord(sj).catch(() => undefined)));
      setLocalMutationVersion((v) => v + 1);
    }

    // Jika namaLokasi berubah, sinkronkan ke masterTariffs yang cocok
    if (
      oldRoute &&
      normalizeRouteKey(oldRoute.namaLokasi) !== normalizeRouteKey(updatedRoute.namaLokasi)
    ) {
      const oldNamaKey = normalizeRouteKey(oldRoute.namaLokasi);
      const changedTariffs: MasterRouteTariff[] = [];
      const nextTariffs = masterTariffs.map((t) => {
        const matchAwal = normalizeRouteKey(t.ruteAwal) === oldNamaKey;
        const matchTuj = normalizeRouteKey(t.ruteTujuan) === oldNamaKey;
        if (!matchAwal && !matchTuj) return t;
        const nextT: MasterRouteTariff = {
          ...t,
          ...(matchAwal ? { ruteAwal: updatedRoute.namaLokasi } : {}),
          ...(matchTuj
            ? {
                ruteTujuan: updatedRoute.namaLokasi,
                alamatTujuan: updatedRoute.alamat || t.alamatTujuan
              }
            : {})
        };
        changedTariffs.push(nextT);
        return nextT;
      });
      if (changedTariffs.length > 0) {
        setMasterTariffs(nextTariffs);
        Promise.all(changedTariffs.map((t) => saveMasterTariff(t).catch(() => undefined)));
      }
    }

    broadcastMasterSync('routes');
  };

  const handleDeleteMasterRoute = (id: string) => {
    persistMasterMeta('routes', { addDeletedId: id, markTouched: true });
    setMasterRoutes((prev) => prev.filter((r) => r.id !== id));
    deleteMasterRoute(id).catch((err) => console.error('Cloud delete route error:', err));
    broadcastMasterSync('routes');
  };

  // Vendor Handlers
  const ensureVendorsSeeded = (overrideList?: MasterVendor[]) => {
    const cloudVendors = latestCloudRef.current.vendors;
    if (
      (!cloudVendors || cloudVendors.length === 0) &&
      !cloudMetaRef.current.touched?.vendors
    ) {
      const list = overrideList ?? masterVendors;
      seedMasterVendors(list).catch(() => {});
      persistMasterMeta('vendors', { markTouched: true });
    }
  };

  const handleAddMasterVendor = (newVendor: Omit<MasterVendor, 'id'>) => {
    const vendor: MasterVendor = {
      ...newVendor,
      id: `vendor-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    const nextList = [...masterVendors, vendor];
    ensureVendorsSeeded(nextList);
    setMasterVendors(nextList);
    saveMasterVendor(vendor).catch((err) => console.error('Cloud save vendor error:', err));
    persistMasterMeta('vendors', { markTouched: true });
    broadcastMasterSync('vendors');
  };

  const handleUpdateMasterVendor = (updatedVendor: MasterVendor) => {
    const oldVendor = masterVendors.find((v) => v.id === updatedVendor.id);
    const nextList = masterVendors.map((v) =>
      v.id === updatedVendor.id ? updatedVendor : v
    );
    ensureVendorsSeeded(nextList);
    setMasterVendors(nextList);
    saveMasterVendor(updatedVendor).catch((err) => console.error('Cloud update vendor error:', err));
    persistMasterMeta('vendors', { markTouched: true });

    // Cascade perubahan nama vendor ke masterTariffs & Surat Jalan terbit
    if (
      oldVendor &&
      oldVendor.namaVendor.trim().toLowerCase() !== updatedVendor.namaVendor.trim().toLowerCase()
    ) {
      const oldLower = oldVendor.namaVendor.trim().toLowerCase();
      const changedTariffs: MasterRouteTariff[] = [];
      const nextTariffs = masterTariffs.map((t) => {
        if ((t.vendor || '').trim().toLowerCase() !== oldLower) return t;
        const nextT = { ...t, vendor: updatedVendor.namaVendor };
        changedTariffs.push(nextT);
        return nextT;
      });
      if (changedTariffs.length > 0) {
        setMasterTariffs(nextTariffs);
        Promise.all(changedTariffs.map((t) => saveMasterTariff(t).catch(() => undefined)));
      }

      const nowIso = new Date().toISOString();
      const changedSjs: SuratJalanRecord[] = [];
      const nextSjs = suratJalanHistory.map((sj) => {
        if (
          sj.vendorId !== updatedVendor.id &&
          (sj.namaVendorArmada || '').trim().toLowerCase() !== oldLower
        ) {
          return sj;
        }
        const nextSj: SuratJalanRecord = {
          ...sj,
          namaVendorArmada: updatedVendor.namaVendor,
          updatedAt: nowIso,
          lastUpdateAction: `Sync Vendor (${updatedVendor.namaVendor})`
        };
        changedSjs.push(nextSj);
        return nextSj;
      });
      if (changedSjs.length > 0) {
        setSuratJalanHistory(nextSjs);
        Promise.all(changedSjs.map((sj) => updateSuratJalanRecord(sj).catch(() => undefined)));
        setLocalMutationVersion((v) => v + 1);
      }
    }

    broadcastMasterSync('vendors');
  };

  const handleDeleteMasterVendor = (id: string) => {
    const remaining = masterVendors.filter((v) => v.id !== id);
    ensureVendorsSeeded(remaining);
    persistMasterMeta('vendors', { addDeletedId: id, markTouched: true });
    setMasterVendors(remaining);
    deleteMasterVendor(id).catch((err) => console.error('Cloud delete vendor error:', err));
    broadcastMasterSync('vendors');
  };

  // Tujuan & Tarif Handlers
  const ensureTariffsSeeded = (overrideList?: MasterRouteTariff[]) => {
    const cloudTariffs = latestCloudRef.current.tariffs;
    if (
      (!cloudTariffs || cloudTariffs.length === 0) &&
      !cloudMetaRef.current.touched?.tariffs
    ) {
      const list = overrideList ?? masterTariffs;
      seedMasterTariffs(list).catch(() => {});
      persistMasterMeta('tariffs', { markTouched: true });
    }
  };

  const syncTariffLocationsToRoutes = (tariff: MasterRouteTariff) => {
    const candidates = [
      { loc: (tariff.ruteAwal || '').trim(), isTujuan: false },
      { loc: (tariff.ruteTujuan || '').trim(), isTujuan: true }
    ];
    let currentRoutes = [...masterRoutes];
    const routesToSave: MasterRoute[] = [];

    candidates.forEach(({ loc, isTujuan }) => {
      if (!loc) return;
      const locKey = normalizeRouteKey(loc);
      const existing = currentRoutes.find(
        (r) =>
          normalizeRouteKey(r.namaLokasi) === locKey ||
          normalizeRouteKey(r.kodeLokasi) === locKey
      );
      if (!existing) {
        const created: MasterRoute = {
          id: `route-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          kodeLokasi: loc,
          namaLokasi: loc,
          alamat: isTujuan ? tariff.alamatTujuan || '' : '',
          tipe: 'KEDUA',
          tarifDefault: isTujuan ? tariff.tarif : 0,
          ppnPersen: isTujuan ? tariff.ppnPersen : 0
        };
        currentRoutes = deduplicateMasterRoutes([...currentRoutes, created]);
        routesToSave.push(created);
      } else if (isTujuan && tariff.alamatTujuan && existing.alamat !== tariff.alamatTujuan) {
        const updatedRoute: MasterRoute = {
          ...existing,
          alamat: tariff.alamatTujuan
        };
        currentRoutes = currentRoutes.map((r) => (r.id === existing.id ? updatedRoute : r));
        routesToSave.push(updatedRoute);
      }
    });

    if (routesToSave.length > 0) {
      setMasterRoutes(currentRoutes);
      Promise.all(routesToSave.map((r) => saveMasterRoute(r).catch(() => undefined)));
    }
  };

  const handleAddMasterTariff = (newTariff: Omit<MasterRouteTariff, 'id'>) => {
    const tariff: MasterRouteTariff = {
      ...newTariff,
      id: `trf-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    const nextList = [tariff, ...masterTariffs];
    ensureTariffsSeeded(nextList);
    setMasterTariffs(nextList);
    saveMasterTariff(tariff).catch((err) => console.error('Cloud save tariff error:', err));
    persistMasterMeta('tariffs', { markTouched: true });
    syncTariffLocationsToRoutes(tariff);
    broadcastMasterSync('tariffs');
  };

  const handleUpdateMasterTariff = (updatedTariff: MasterRouteTariff) => {
    const nextList = masterTariffs.map((t) =>
      t.id === updatedTariff.id ? updatedTariff : t
    );
    ensureTariffsSeeded(nextList);
    setMasterTariffs(nextList);
    saveMasterTariff(updatedTariff).catch((err) => console.error('Cloud update tariff error:', err));
    persistMasterMeta('tariffs', { markTouched: true });
    syncTariffLocationsToRoutes(updatedTariff);
    setLocalMutationVersion((v) => v + 1);
    broadcastMasterSync('tariffs');
  };

  const handleDeleteMasterTariff = (id: string) => {
    const remaining = masterTariffs.filter((t) => t.id !== id);
    ensureTariffsSeeded(remaining);
    persistMasterMeta('tariffs', { addDeletedId: id, markTouched: true });
    setMasterTariffs(remaining);
    deleteMasterTariff(id).catch((err) => console.error('Cloud delete tariff error:', err));
    broadcastMasterSync('tariffs');
  };

  // Blacklist Handlers
  const ensureBlacklistSeeded = (overrideList?: BlacklistRecord[]) => {
    const cloudBlacklist = latestCloudRef.current.blacklist;
    if (
      (!cloudBlacklist || cloudBlacklist.length === 0) &&
      !cloudMetaRef.current.touched?.blacklist
    ) {
      const list = overrideList ?? blacklistRecords;
      seedBlacklistRecords(list).catch(() => {});
      persistMasterMeta('blacklist', { markTouched: true });
    }
  };

  const handleAddBlacklist = (newBl: Omit<BlacklistRecord, 'id'>) => {
    const bl: BlacklistRecord = {
      ...newBl,
      id: `bl-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    const nextList = [bl, ...blacklistRecords];
    ensureBlacklistSeeded(nextList);
    setBlacklistRecords(nextList);
    saveBlacklistRecord(bl).catch((err) => console.error('Cloud save blacklist error:', err));
    persistMasterMeta('blacklist', { markTouched: true });
    broadcastMasterSync('blacklist');
  };

  const handleUpdateBlacklist = (updatedBl: BlacklistRecord) => {
    const nextList = blacklistRecords.map((b) =>
      b.id === updatedBl.id ? updatedBl : b
    );
    ensureBlacklistSeeded(nextList);
    setBlacklistRecords(nextList);
    saveBlacklistRecord(updatedBl).catch((err) => console.error('Cloud update blacklist error:', err));
    persistMasterMeta('blacklist', { markTouched: true });
    broadcastMasterSync('blacklist');
  };

  const handleDeleteBlacklist = (id: string) => {
    const remaining = blacklistRecords.filter((b) => b.id !== id);
    ensureBlacklistSeeded(remaining);
    persistMasterMeta('blacklist', { addDeletedId: id, markTouched: true });
    setBlacklistRecords(remaining);
    deleteBlacklistRecord(id).catch((err) => console.error('Cloud delete blacklist error:', err));
    broadcastMasterSync('blacklist');
  };

  // Warehouse Users Handlers
  const ensureUsersSeeded = (overrideList?: WarehouseUser[]) => {
    const cloudUsers = latestCloudRef.current.users;
    if (
      (!cloudUsers || cloudUsers.length === 0) &&
      !cloudMetaRef.current.touched?.users
    ) {
      const list = overrideList ?? warehouseUsers;
      seedWarehouseUsers(list).catch(() => {});
      persistMasterMeta('users', { markTouched: true });
    }
  };

  const handleAddWarehouseUser = (newUser: Omit<WarehouseUser, 'id'>) => {
    const usr: WarehouseUser = {
      ...newUser,
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    const nextList = [...warehouseUsers, usr];
    ensureUsersSeeded(nextList);
    setWarehouseUsers(nextList);
    saveWarehouseUser(usr).catch((err) => console.error('Cloud save user error:', err));
    persistMasterMeta('users', { markTouched: true });
    broadcastMasterSync('users');
  };

  const handleUpdateWarehouseUser = (updatedUser: WarehouseUser) => {
    const nextList = warehouseUsers.map((u) =>
      u.id === updatedUser.id ? updatedUser : u
    );
    ensureUsersSeeded(nextList);
    setWarehouseUsers(nextList);
    saveWarehouseUser(updatedUser).catch((err) => console.error('Cloud update user error:', err));
    persistMasterMeta('users', { markTouched: true });
    broadcastMasterSync('users');
  };

  const handleDeleteWarehouseUser = (id: string) => {
    const remaining = warehouseUsers.filter((u) => u.id !== id);
    ensureUsersSeeded(remaining);
    persistMasterMeta('users', { addDeletedId: id, markTouched: true });
    setWarehouseUsers(remaining);
    deleteWarehouseUser(id).catch((err) => console.error('Cloud delete user error:', err));
    broadcastMasterSync('users');
  };

  // Master Warehouses Handlers
  const handleAddMasterWarehouse = (newWarehouse: Omit<MasterWarehouse, 'id'>) => {
    const wh: MasterWarehouse = {
      ...newWarehouse,
      id: `wh-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
    };
    setMasterWarehouses((prev) => [...prev, wh]);
    saveMasterWarehouse(wh).catch((err) => console.error('Cloud save warehouse error:', err));
    broadcastMasterSync('warehouses');
  };

  const handleUpdateMasterWarehouse = (updatedWarehouse: MasterWarehouse) => {
    const oldWh = masterWarehouses.find((w) => w.id === updatedWarehouse.id);
    setMasterWarehouses((prev) =>
      prev.map((w) => (w.id === updatedWarehouse.id ? updatedWarehouse : w))
    );
    saveMasterWarehouse(updatedWarehouse).catch((err) =>
      console.error('Cloud update warehouse error:', err)
    );

    // Sinkronkan lokasiGudang pada PalletRecord yang berada di rak gudang ini
    const oldCfg = getWarehouseRackSlots(oldWh);
    const newCfg = getWarehouseRackSlots(updatedWarehouse);
    const prefixes = new Set(
      [oldCfg.leftPrefix, oldCfg.rightPrefix, newCfg.leftPrefix, newCfg.rightPrefix].filter(Boolean)
    );
    const nextCanonical = mapGroupToCanonicalWarehouse(updatedWarehouse.locationGroup);
    const nowIso = new Date().toISOString();
    const changedPallets: PalletRecord[] = [];
    const nextRecords = records.map((r) => {
      const binPrefix = (r.lokasiBin || '').trim().toUpperCase().split('.')[0];
      if (!binPrefix || !prefixes.has(binPrefix)) return r;
      if (r.lokasiGudang === nextCanonical) return r;
      const nextRec: PalletRecord = {
        ...r,
        lokasiGudang: nextCanonical,
        updatedAt: nowIso,
        lastUpdateAction: `Sync Master Gudang (${updatedWarehouse.namaGudang})`
      };
      changedPallets.push(nextRec);
      return nextRec;
    });
    if (changedPallets.length > 0) {
      setRecords(nextRecords);
      Promise.all(
        changedPallets.map((p) => updatePalletRecord(p).catch(() => undefined))
      );
      setLocalMutationVersion((v) => v + 1);
    }
    broadcastMasterSync('warehouses');
  };

  const handleDeleteMasterWarehouse = (id: string) => {
    persistMasterMeta('warehouses', { addDeletedId: id, markTouched: true });
    setMasterWarehouses((prev) => prev.filter((w) => w.id !== id));
    if (activeWarehouseId === id) {
      setActiveWarehouseId(null);
    }
    deleteMasterWarehouse(id).catch((err) => console.error('Cloud delete warehouse error:', err));
    broadcastMasterSync('warehouses');
  };

  // Surat Jalan Save / Update Handler
  const handleSaveSuratJalan = async (newSurat: SuratJalanRecord) => {
    const isExisting = suratJalanHistory.some((s) => s.id === newSurat.id);
    const nowIso = new Date().toISOString();
    const stampedSurat: SuratJalanRecord = {
      ...newSurat,
      updatedAt: nowIso,
      lastUpdateAction:
        newSurat.lastUpdateAction ||
        (isExisting
          ? `Edit Surat Jalan (${newSurat.noSuratJalan})`
          : !newSurat.palletIds || newSurat.palletIds.length === 0
          ? `Buat Surat Jalan Manual (${newSurat.noSuratJalan})`
          : `Buat Surat Jalan (${newSurat.noSuratJalan})`)
    };

    const linkedSet = new Set(stampedSurat.palletIds || []);
    const palletsToPersist: PalletRecord[] = [];
    records.forEach((r) => {
      if (linkedSet.has(r.id)) {
        palletsToPersist.push({
          ...r,
          suratJalanId: stampedSurat.id,
          noSuratJalan: stampedSurat.noSuratJalan,
          updatedAt: nowIso,
          lastUpdateAction:
            stampedSurat.lastUpdateAction || `Surat Jalan ${stampedSurat.noSuratJalan}`
        });
      } else if (isExisting && r.suratJalanId === stampedSurat.id && !linkedSet.has(r.id)) {
        const cleaned: PalletRecord = {
          ...r,
          updatedAt: nowIso,
          lastUpdateAction: `Lepas dari SJ ${stampedSurat.noSuratJalan}`
        };
        delete cleaned.suratJalanId;
        delete cleaned.noSuratJalan;
        palletsToPersist.push(cleaned);
      }
    });
    const persistedMap = new Map(palletsToPersist.map((p) => [p.id, p]));

    if (isExisting) {
      setSuratJalanHistory((prev) =>
        prev.map((s) => (s.id === stampedSurat.id ? stampedSurat : s))
      );
      setRecords((prev) =>
        prev.map((r) => persistedMap.get(r.id) || r)
      );
      await updateSuratJalanRecord(stampedSurat);
    } else {
      setSuratJalanHistory((prev) => [stampedSurat, ...prev]);
      setRecords((prev) =>
        prev.map((r) => persistedMap.get(r.id) || r)
      );
      await saveSuratJalanRecord(stampedSurat);
    }

    if (palletsToPersist.length > 0) {
      await Promise.all(
        palletsToPersist.map((p) => updatePalletRecord(p).catch(() => undefined))
      );
    }

    setLocalMutationVersion((v) => v + 1);
  };

  const handleDeleteSuratJalan = async (sj: SuratJalanRecord) => {
    const nowIso = new Date().toISOString();
    setSuratJalanHistory((prev) => prev.filter((s) => s.id !== sj.id));

    const affectedPalletIds = new Set<string>();
    setRecords((prev) =>
      prev.map((r) => {
        if (r.suratJalanId === sj.id || (sj.palletIds || []).includes(r.id)) {
          affectedPalletIds.add(r.id);
          return {
            ...r,
            suratJalanId: undefined,
            noSuratJalan: undefined,
            updatedAt: nowIso,
            lastUpdateAction: `Hapus Surat Jalan ${sj.noSuratJalan}`
          };
        }
        return r;
      })
    );

    await deleteSuratJalanRecord(sj.id);
    if (affectedPalletIds.size > 0) {
      const affectedList = records.filter((r) => affectedPalletIds.has(r.id));
      await Promise.all(
        affectedList.map((r) => {
          const cleaned = { ...r, updatedAt: nowIso, lastUpdateAction: `Hapus SJ ${sj.noSuratJalan}` };
          delete cleaned.suratJalanId;
          delete cleaned.noSuratJalan;
          return updatePalletRecord(cleaned).catch(() => undefined);
        })
      );
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
      updatedAt: new Date().toISOString(),
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
    const isToday = (iso?: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      return (
        !isNaN(d.getTime()) &&
        d.getFullYear() === todayY &&
        d.getMonth() === todayM &&
        d.getDate() === todayD
      );
    };
    const palletCount = records.filter((r) => isToday(r.updatedAt || r.tanggalPengambilan)).length;
    const sjCount = suratJalanHistory.filter((sj) => isToday(sj.updatedAt)).length;
    return palletCount + sjCount;
  })();

  const openMasterModal = (tab: MasterModalTabKey = 'tujuan_tarif') => {
    setMasterModalInitialTab(tab);
    setIsMasterModalOpen(true);
    setIsMobileMenuOpen(false);
  };

  const activeWarehouseUsers = warehouseUsers.filter((u) => u.status === 'Aktif');
  const currentOperator =
    activeWarehouseUsers.find((u) => u.id === activeOperatorId) ||
    activeWarehouseUsers[0] ||
    warehouseUsers[0] ||
    null;

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
      onUpdateBlacklistRecord={handleUpdateBlacklist}
      onDeleteBlacklistRecord={handleDeleteBlacklist}
      warehouseUsers={warehouseUsers}
      onAddWarehouseUser={handleAddWarehouseUser}
      onUpdateWarehouseUser={handleUpdateWarehouseUser}
      onDeleteWarehouseUser={handleDeleteWarehouseUser}
      suratJalanHistory={suratJalanHistory}
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
          onOpenSuratJalan={() => {
            const defaultWh =
              masterWarehouses.find((w) => w.status === 'ACTIVE') || masterWarehouses[0];
            if (defaultWh) {
              setPortalLocationGroup(defaultWh.locationGroup);
              setActiveWarehouseId(defaultWh.id);
              setActiveTab('surat_jalan');
            }
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

  const cleanWarehouseName = activeWarehouse.namaGudang.trim();
  const denahWarehouseLabel = /^gudang\b/i.test(cleanWarehouseName)
    ? `Denah ${cleanWarehouseName}`
    : `Denah Gudang ${cleanWarehouseName}`;

  // Titles for current active view
  const tabTitles: Record<typeof activeTab, { title: string; subtitle: string }> = {
    input: {
      title: 'Penginputan data IC',
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
      title: denahWarehouseLabel,
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
        {/* Brand Header (Klik Logo / PalletTrack untuk kembali ke Menu Lokasi Utama) */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setPortalLocationGroup(null);
                setActiveWarehouseId(null);
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none transition-opacity hover:opacity-85 min-w-0"
              title="Kembali ke Menu Lokasi Utama"
              aria-label="PalletTrack — Kembali ke Menu Lokasi Utama"
            >
              <img
                src={kapalApiLogo}
                alt="Kapal Api"
                className="h-11 w-auto object-contain bg-white shrink-0"
              />
              <div className="min-w-0">
                <span className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors block leading-none">
                  PalletTrack
                </span>
                <span className="text-[11px] font-bold text-blue-600 dark:text-cyan-400 mt-1 block truncate">
                  {activeWarehouse.locationGroup} · {activeWarehouse.namaGudang}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-white shrink-0"
            >
              <X className="w-5 h-5" />
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
                  <span>Penginputan data IC</span>
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
                  <span>{denahWarehouseLabel}</span>
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

          {/* Dark Mode & Active Operator Switcher (Live dari User Management) */}
          <div className="flex items-center justify-between pt-1 gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              {activeWarehouseUsers.length > 0 ? (
                <select
                  aria-label="Operator Aktif"
                  value={currentOperator?.id || ''}
                  onChange={(e) => setActiveOperatorId(e.target.value)}
                  className="w-full min-w-0 bg-transparent text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate focus:outline-none cursor-pointer"
                  title="Petugas aktif (otomatis mengikuti daftar User Management)"
                >
                  {activeWarehouseUsers.map((u) => (
                    <option
                      key={u.id}
                      value={u.id}
                      className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    >
                      {u.nama} ({u.role})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate text-amber-600 dark:text-amber-400">
                  Belum ada petugas aktif
                </span>
              )}
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
          <button
            type="button"
            onClick={() => {
              setPortalLocationGroup(null);
              setActiveWarehouseId(null);
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-2 text-left cursor-pointer hover:opacity-85 transition-opacity"
            title="Kembali ke Menu Lokasi Utama"
            aria-label="PalletTrack — Kembali ke Menu Lokasi Utama"
          >
            <img
              src={kapalApiLogo}
              alt="Kapal Api"
              className="h-9 w-auto object-contain bg-white shrink-0"
            />
            <div>
              <span className="font-bold text-sm block leading-none text-slate-950 dark:text-white">
                PalletTrack
              </span>
              <span className="text-[10px] text-slate-500">{activeWarehouse.namaGudang}</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"
              title="Scan Kamera Barcode / QR Bin"
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
              suratJalanHistory={suratJalanHistory}
              activeWarehouse={activeWarehouse}
              masterItems={masterItems}
              masterWarehouses={masterWarehouses}
              onUpdateRecord={handleUpdateRecord}
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
              blacklistRecords={blacklistRecords}
              onSaveSuratJalan={handleSaveSuratJalan}
              onDeleteSuratJalan={handleDeleteSuratJalan}
              sheetsSyncStatus={{
                autoSyncEnabled,
                syncMode,
                isBridgeConfigured:
                  syncMode === 'apps_script'
                    ? isValidAppsScriptUrl(appsScriptUrl)
                    : !needsGoogleAuth,
                isSyncing: isSyncingSheets,
                error: sheetsSyncError,
                lastSyncedAt: lastSyncResult?.syncedAt || cloudBridgeLastSyncedAt,
                includeSuratJalanTab,
                includeManualSjTab,
                bridgeVersion: detectedBridgeVersion,
                onOpenSheetsTab: () => setActiveTab('google_sheets'),
                onSyncNow: async () => {
                  await executeSheetsSync('Manual');
                }
              }}
            />
          )}

          {activeTab === 'google_sheets' && (
            <GoogleSheetsSyncView
              records={records}
              suratJalanHistory={suratJalanHistory}
              masterItems={masterItems}
              masterWarehouses={masterWarehouses}
              syncMode={syncMode}
              onChangeSyncMode={(m) => {
                setSyncMode(m);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ syncMode: m }).catch(() => {});
                }
              }}
              appsScriptUrl={appsScriptUrl}
              onChangeAppsScriptUrl={setAppsScriptUrl}
              appsScriptSecret={appsScriptSecret}
              onChangeAppsScriptSecret={setAppsScriptSecret}
              isBridgeSavedInCloud={isBridgeSavedInCloud}
              onSaveBridgeSettings={async (opts) => {
                const nextAuto = opts?.autoSync24x7 ?? true;
                setAutoSyncEnabled(nextAuto);
                await persistBridgeConfigToCloud({
                  syncMode: 'apps_script',
                  autoSync24x7Enabled: nextAuto
                });
              }}
              googleUser={googleUser}
              needsAuth={needsGoogleAuth}
              isLoggingIn={isGoogleLoggingIn}
              onGoogleSignIn={handleGoogleSignIn}
              onGoogleSignOut={handleGoogleSignOut}
              spreadsheetInput={spreadsheetInput}
              onChangeSpreadsheetInput={(val) => {
                setSpreadsheetInput(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ spreadsheetUrl: val }).catch(() => {});
                }
              }}
              selectedSheetTab={selectedSheetTab}
              onChangeSelectedSheetTab={(val) => {
                setSelectedSheetTab(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ palletTabTitle: val }).catch(() => {});
                }
              }}
              includeSuratJalanTab={includeSuratJalanTab}
              onChangeIncludeSuratJalanTab={(val) => {
                setIncludeSuratJalanTab(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ includeSuratJalanTab: val }).catch(() => {});
                }
              }}
              includeManualSjTab={includeManualSjTab}
              onChangeIncludeManualSjTab={(val) => {
                setIncludeManualSjTab(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ includeManualSjTab: val }).catch(() => {});
                }
              }}
              manualSjSpreadsheetInput={manualSjSpreadsheetInput}
              onChangeManualSjSpreadsheetInput={(val) => {
                setManualSjSpreadsheetInput(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ manualSjSpreadsheetUrl: val }).catch(() => {});
                }
              }}
              includeRekapTab={includeRekapTab}
              onChangeIncludeRekapTab={(val) => {
                setIncludeRekapTab(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ includeRekapTab: val }).catch(() => {});
                }
              }}
              lockSheetReadOnly={lockSheetReadOnly}
              onChangeLockSheetReadOnly={(val) => {
                setLockSheetReadOnly(val);
                if (isBridgeSavedInCloud && isValidAppsScriptUrl(appsScriptUrl)) {
                  persistBridgeConfigToCloud({ lockSheetReadOnly: val }).catch(() => {});
                }
              }}
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
