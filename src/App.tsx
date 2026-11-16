import React, { useState, useEffect } from 'react';
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
  SuratJalanRecord,
  DEFAULT_MASTER_ITEMS,
  DEFAULT_MASTER_ROUTES,
  DEFAULT_MASTER_VENDORS,
  DEFAULT_MASTER_ROUTE_TARIFFS,
  DEFAULT_BLACKLIST_RECORDS,
  DEFAULT_WAREHOUSE_USERS
} from './types/warehouse';
import { PalletInputForm } from './components/PalletInputForm';
import { BarcodeResultsView } from './components/BarcodeResultsView';
import { PalletHistoryTable } from './components/PalletHistoryTable';
import { WarehouseBinViewer } from './components/WarehouseBinViewer';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { MasterItemModal } from './components/MasterItemModal';
import { BinDetailModal } from './components/BinDetailModal';
import { PrintBinManifestModal } from './components/PrintBinManifestModal';
import { DataBackupModal } from './components/DataBackupModal';
import { SuratJalanView } from './components/SuratJalanView';
import { LocationPortalView } from './components/LocationPortalView';
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
  subscribeToBlacklist,
  saveBlacklistRecord,
  deleteBlacklistRecord,
  subscribeToWarehouseUsers,
  saveWarehouseUser,
  deleteWarehouseUser,
  subscribeToSuratJalanRecords,
  saveSuratJalanRecord,
  updateSuratJalanRecord
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
  ArrowLeft
} from 'lucide-react';

// Storage Keys
const RECORD_STORAGE_KEYS = ['wh_pallet_records_v1', 'warehouse_pallet_records'];
const MASTER_STORAGE_KEYS = ['wh_master_items_v1', 'wh_master_items'];
const ROUTE_STORAGE_KEYS = ['wh_master_routes_v1', 'wh_master_routes'];
const VENDOR_STORAGE_KEYS = ['wh_master_vendors_v1', 'wh_master_vendors'];
const TARIFF_STORAGE_KEYS = ['wh_master_tariffs_v1', 'wh_master_tariffs'];
const BLACKLIST_STORAGE_KEYS = ['wh_master_blacklist_v1'];
const USER_STORAGE_KEYS = ['wh_warehouse_users_v1'];
const SURAT_STORAGE_KEYS = ['wh_surat_jalan_records_v1', 'wh_surat_jalan_records'];

// Tracking Deleted Entity IDs to prevent deleted items from resurrecting
const DELETED_ITEMS_KEY = 'pallettrack_deleted_master_items_v1';
const DELETED_ROUTES_KEY = 'pallettrack_deleted_master_routes_v1';
const DELETED_VENDORS_KEY = 'pallettrack_deleted_master_vendors_v1';
const DELETED_TARIFFS_KEY = 'pallettrack_deleted_master_tariffs_v1';
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

export default function App() {
  const [selectedLocation, setSelectedLocation] = useState<'PORTAL' | 'GD_KRIAN'>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('bin') ? 'GD_KRIAN' : 'PORTAL';
    } catch {
      return 'PORTAL';
    }
  });

  const [activeTab, setActiveTab] = useState<
    'input' | 'results' | 'history' | 'bin_map' | 'surat_jalan'
  >('input');

  // Master Data & User Management State
  const [masterItems, setMasterItems] = useState<MasterItem[]>(loadSavedMasterItems);
  const [masterRoutes, setMasterRoutes] = useState<MasterRoute[]>(loadSavedMasterRoutes);
  const [masterVendors, setMasterVendors] = useState<MasterVendor[]>(loadSavedMasterVendors);
  const [masterTariffs, setMasterTariffs] = useState<MasterRouteTariff[]>(loadSavedMasterTariffs);
  const [blacklistRecords, setBlacklistRecords] = useState<BlacklistRecord[]>(loadSavedBlacklist);
  const [warehouseUsers, setWarehouseUsers] = useState<WarehouseUser[]>(loadSavedWarehouseUsers);

  // Operational State
  const [suratJalanHistory, setSuratJalanHistory] = useState<SuratJalanRecord[]>(loadSavedSuratJalan);
  const [records, setRecords] = useState<PalletRecord[]>(loadSavedRecords);
  const [currentBatch, setCurrentBatch] = useState<BatchSubmission | null>(null);

  // Modals & Controls
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Bin detail viewer state
  const [selectedBinForModal, setSelectedBinForModal] = useState<string | null>(null);
  const [isBinModalOpen, setIsBinModalOpen] = useState(false);
  const [isPrintManifestOpen, setIsPrintManifestOpen] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Check URL query params on load (e.g. ?bin=5A.1)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const binParam = searchParams.get('bin');
      if (binParam) {
        setSelectedLocation('GD_KRIAN');
        setSelectedBinForModal(binParam.toUpperCase());
        setIsPrintManifestOpen(true);
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

    return () => {
      unsubscribeRecords();
      unsubscribeMaster();
      unsubscribeRoutes();
      unsubscribeVendors();
      unsubscribeTariffs();
      unsubscribeBlacklist();
      unsubscribeUsers();
      unsubscribeSuratJalan();
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

  // Surat Jalan Save / Update Handler
  const handleSaveSuratJalan = async (newSurat: SuratJalanRecord) => {
    const isExisting = suratJalanHistory.some((s) => s.id === newSurat.id);

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
              noSuratJalan: newSurat.noSuratJalan
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
              noSuratJalan: newSurat.noSuratJalan
            };
          }
          return r;
        })
      );
      await saveSuratJalanRecord(newSurat);
    }
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

      return {
        id: `plt-${nowMs}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        nomorPallet: row.nomorPallet.trim().toUpperCase(),
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
  };

  const handleUpdateRecord = async (updatedRecord: PalletRecord) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
    );
    setCurrentBatch((prev) => {
      if (!prev) return prev;
      const hasMatch = prev.items.some((i) => i.id === updatedRecord.id);
      if (!hasMatch) return prev;
      const nextItems = prev.items.map((i) =>
        i.id === updatedRecord.id ? updatedRecord : i
      );
      return {
        ...prev,
        items: nextItems,
        totalQty: nextItems.reduce((sum, i) => sum + (Number(i.qtyPallet) || 0), 0)
      };
    });
    await updatePalletRecord(updatedRecord);
  };

  const handleReorderPallets = async (orderedPallets: PalletRecord[]) => {
    const updates = computeReorderedBinEntries(orderedPallets);
    if (updates.length === 0) return;

    const orderMap = new Map(updates.map((u) => [u.id, u.binOrder]));
    setRecords((prev) =>
      prev.map((r) => {
        const nextOrder = orderMap.get(r.id);
        return nextOrder !== undefined ? { ...r, binOrder: nextOrder } : r;
      })
    );

    await updatePalletsBinOrder(updates);
  };

  const handleDeleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    deletePalletRecord(id).catch((err) =>
      console.error('Failed to delete pallet record from cloud:', err)
    );
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
            petugasPengambilan: petugas || 'Petugas Lapangan'
          };
        }
        return r;
      })
    );

    try {
      await updatePalletsOutbound(palletIds, destination, petugas);
    } catch (err) {
      console.error('Failed to update outbound in Firestore:', err);
    }
  };

  const handleRestoreOutbound = async (palletIds: string[]) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (palletIds.includes(r.id)) {
          return {
            ...r,
            status: 'IN',
            tujuanPengambilan: undefined,
            tanggalPengambilan: undefined,
            petugasPengambilan: undefined
          };
        }
        return r;
      })
    );

    try {
      await restorePalletsToBin(palletIds);
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
  };

  // Titles for current active view
  const tabTitles: Record<typeof activeTab, { title: string; subtitle: string }> = {
    input: {
      title: 'Input Data Pallet & Cetak Barcode',
      subtitle: 'Entri 1-8 baris pallet, scan otomatis, alokasi Bin 5A.1 s/d 5B.50'
    },
    results: {
      title: 'Hasil Barcode Pallet Terbit',
      subtitle: 'Label Code 128 dan QR Bin siap cetak format stiker A4'
    },
    history: {
      title: 'Riwayat Pallet Gudang 5',
      subtitle: 'Pelacakan stok pallet masuk, riwayat outbound, dan pengambilan muatan'
    },
    bin_map: {
      title: 'Denah Rak & Lokasi Bin Gudang 5',
      subtitle: 'Visualisasi denah rak 5A dan 5B dengan status isi real-time'
    },
    surat_jalan: {
      title: 'Surat Jalan / Delivery Note',
      subtitle: 'Penerbitan dokumen Form F/SCM/01.08 muatan armada pengiriman'
    }
  };

  const activeBinsCount = new Set(
    records.filter((r) => r.status !== 'OUT').map((r) => r.lokasiBin.toUpperCase())
  ).size;

  if (selectedLocation === 'PORTAL') {
    return (
      <LocationPortalView
        onSelectLocation={(loc) => setSelectedLocation(loc)}
        totalRecords={records.length}
        activeBinsCount={activeBinsCount}
        totalSuratJalan={suratJalanHistory.length}
        isCloudConnected={isCloudConnected}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row font-sans transition-colors duration-200">
      {/* ---------------------------------------------------------------- */}
      {/* LEFT SIDEBAR NAVIGATION ("Ke samping kiri dan lebih proper")    */}
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
                  Gd. KRIAN · Gudang 5
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

          {/* Back to Location Portal Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedLocation('PORTAL');
              setIsMobileMenuOpen(false);
            }}
            className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title="Kembali ke pilihan lokasi Monitoring Produk IC — SJA 3"
          >
            <span className="flex items-center gap-2">
              <ArrowLeft className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              <span>Menu Lokasi Gudang</span>
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">SJA 3</span>
          </button>

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
                  <span>Denah Bin Gudang 5</span>
                </div>
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
                onClick={() => {
                  setIsMasterModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors group"
                title="Buka User Management & Master Data Aplikasi"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>User Management</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                  {masterTariffs.length + masterItems.length}
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
              <span className="text-[10px] text-slate-500">Gudang 5</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedLocation('PORTAL')}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              title="Menu Lokasi Gudang"
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

        {/* Top Breadcrumb & Page Banner */}
        <header className="no-print bg-white/60 dark:bg-[#0f141c]/60 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3.5 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {tabTitles[activeTab]?.title || 'PalletTrack'}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                  Gd. KRIAN · Gudang 5 SJA
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {tabTitles[activeTab]?.subtitle}
              </p>
            </div>

            {/* Quick Header Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Scan QR Bin</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
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
              masterItems={masterItems}
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
              onSelectBin={(binCode) => {
                handleOpenBinDetail(binCode);
              }}
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
        </main>

        {/* Footer */}
        <footer className="no-print mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f141c] py-3.5 px-6 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                PT. Santos Jaya Abadi · Sistem Inbound Pallet Gudang 5 Sukodono & Barcode Code 128
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
      <MasterItemModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
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
        blacklistRecords={blacklistRecords}
        onAddBlacklistRecord={handleAddBlacklist}
        onDeleteBlacklistRecord={handleDeleteBlacklist}
        warehouseUsers={warehouseUsers}
        onAddWarehouseUser={handleAddWarehouseUser}
        onDeleteWarehouseUser={handleDeleteWarehouseUser}
      />

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
        records={records}
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
