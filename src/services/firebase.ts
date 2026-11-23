import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  getDocFromServer,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { PalletRecord, MasterItem } from '../types/warehouse';
import firebaseConfig from '../../firebase-applet-config.json';

// 1. Default Firebase App for Google Sign-In & Workspace Sheets OAuth (from firebase-applet-config.json)
const oauthApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(oauthApp);

// 2. Original Warehouse Firestore Database (preserves existing pallet & Surat Jalan records)
const WAREHOUSE_FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0913601146',
  appId: '1:384813567177:web:b8b5f68bd094b549f6d118',
  apiKey: 'AIzaSyBPGoGQHLz5STAWbNHkg0uVSeejS2L9mfs',
  authDomain: 'gen-lang-client-0913601146.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-warehousepalletb-09b7e014-c1a5-48ba-b298-09265a692963',
  storageBucket: 'gen-lang-client-0913601146.firebasestorage.app',
  messagingSenderId: '384813567177'
};

const WAREHOUSE_APP_NAME = 'warehouse-data-app';
const warehouseApp =
  getApps().find((a) => a.name === WAREHOUSE_APP_NAME) ||
  initializeApp(WAREHOUSE_FIREBASE_CONFIG, WAREHOUSE_APP_NAME);

export const db = getFirestore(
  warehouseApp,
  WAREHOUSE_FIREBASE_CONFIG.firestoreDatabaseId
);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively remove properties with `undefined` values before sending to Firestore.
 * Firestore throws "Unsupported field value: undefined" if any field is undefined.
 */
function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        result[k] = sanitizeForFirestore(v);
      }
    });
    return result as T;
  }
  return value;
}

/**
 * Validate Connection to Firestore on boot
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is running in offline mode or network is unreachable');
    }
    return false;
  }
}

// Test connection on module load
testConnection().catch(() => {});

const PALLET_COLLECTION = 'pallet_records';
const MASTER_COLLECTION = 'master_items';

/**
 * Real-time subscription to Pallet Records across all warehouse devices
 */
export function subscribeToPalletRecords(
  onUpdate: (records: PalletRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, PALLET_COLLECTION));
  
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const records: PalletRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PalletRecord;
        if (data && data.id) {
          records.push(data);
        }
      });
      // Sort newest first
      records.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      onUpdate(records);
    },
    (error) => {
      console.error('Snapshot error for pallet_records:', error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, PALLET_COLLECTION);
    }
  );

  return unsubscribe;
}

/**
 * Save a batch of pallet records to Firestore
 */
export async function savePalletRecordsBatch(records: PalletRecord[]): Promise<void> {
  if (records.length === 0) return;
  try {
    const batch = writeBatch(db);
    records.forEach((record) => {
      const ref = doc(db, PALLET_COLLECTION, record.id);
      batch.set(ref, sanitizeForFirestore(record));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, PALLET_COLLECTION);
  }
}

/**
 * Update an existing pallet record in Firestore
 */
export async function updatePalletRecord(record: PalletRecord): Promise<void> {
  try {
    const ref = doc(db, PALLET_COLLECTION, record.id);
    await setDoc(ref, sanitizeForFirestore(record));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PALLET_COLLECTION}/${record.id}`);
  }
}

/**
 * Batch-update physical binOrder values for reordered pallets inside a Bin
 */
export async function updatePalletsBinOrder(
  updates: { id: string; binOrder: number }[]
): Promise<void> {
  if (!updates || updates.length === 0) return;
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    updates.forEach(({ id, binOrder }) => {
      const ref = doc(db, PALLET_COLLECTION, id);
      batch.update(ref, {
        binOrder,
        updatedAt: nowIso,
        lastUpdateAction: 'Urutan Rak Bin'
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, PALLET_COLLECTION);
  }
}

/**
 * Delete a single pallet record from Firestore
 */
export async function deletePalletRecord(recordId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PALLET_COLLECTION, recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PALLET_COLLECTION}/${recordId}`);
  }
}

/**
 * Process outbound pallets (Pengambilan Produk)
 * Sets status: 'OUT', tujuanPengambilan, tanggalPengambilan
 */
export async function updatePalletsOutbound(
  palletIds: string[],
  tujuan: string,
  petugas?: string
): Promise<void> {
  if (palletIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    palletIds.forEach((id) => {
      const ref = doc(db, PALLET_COLLECTION, id);
      batch.update(ref, {
        status: 'OUT',
        tujuanPengambilan: tujuan,
        tanggalPengambilan: nowIso,
        petugasPengambilan: petugas || 'Petugas Lapangan',
        updatedAt: nowIso,
        lastUpdateAction: `Outbound (${tujuan})`
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, PALLET_COLLECTION);
  }
}

/**
 * Restore taken pallets back into Bin (Batalkan Outbound)
 */
export async function restorePalletsToBin(palletIds: string[]): Promise<void> {
  if (palletIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    palletIds.forEach((id) => {
      const ref = doc(db, PALLET_COLLECTION, id);
      batch.update(ref, {
        status: 'IN',
        tujuanPengambilan: null,
        tanggalPengambilan: null,
        petugasPengambilan: null,
        updatedAt: nowIso,
        lastUpdateAction: 'Kembalikan ke Bin'
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, PALLET_COLLECTION);
  }
}

/**
 * Clear all pallet records from Firestore
 */
export async function clearAllPalletRecords(): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, PALLET_COLLECTION));
    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, PALLET_COLLECTION);
  }
}

/**
 * Real-time subscription to Master Items
 */
export function subscribeToMasterItems(
  onUpdate: (items: MasterItem[]) => void
): () => void {
  const q = query(collection(db, MASTER_COLLECTION));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: MasterItem[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as MasterItem;
        if (raw) {
          items.push({ ...raw, id: raw.id || docSnap.id });
        }
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Snapshot error for master_items:', error);
      handleFirestoreError(error, OperationType.LIST, MASTER_COLLECTION);
    }
  );

  return unsubscribe;
}

/**
 * Save/update a master item in Firestore
 */
export async function saveMasterItem(item: MasterItem): Promise<void> {
  try {
    await setDoc(doc(db, MASTER_COLLECTION, item.id), sanitizeForFirestore(item));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${MASTER_COLLECTION}/${item.id}`);
  }
}

/**
 * Save multiple master items in Firestore (batch seed)
 */
export async function seedMasterItems(items: MasterItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const batch = writeBatch(db);
    items.forEach((item) => {
      batch.set(doc(db, MASTER_COLLECTION, item.id), sanitizeForFirestore(item));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, MASTER_COLLECTION);
  }
}

/**
 * Delete a master item from Firestore
 */
export async function deleteMasterItem(itemId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, MASTER_COLLECTION, itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${MASTER_COLLECTION}/${itemId}`);
  }
}

const ROUTES_COLLECTION = 'master_routes';
const VENDORS_COLLECTION = 'master_vendors';
const SURAT_JALAN_COLLECTION = 'surat_jalan_records';

/**
 * Real-time subscription to Master Routes
 */
export function subscribeToMasterRoutes(
  onUpdate: (routes: import('../types/warehouse').MasterRoute[]) => void
): () => void {
  const q = query(collection(db, ROUTES_COLLECTION));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const routes: import('../types/warehouse').MasterRoute[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as import('../types/warehouse').MasterRoute;
        if (raw) {
          routes.push({ ...raw, id: raw.id || docSnap.id });
        }
      });
      onUpdate(routes);
    },
    (error) => {
      console.error('Snapshot error for master_routes:', error);
      handleFirestoreError(error, OperationType.LIST, ROUTES_COLLECTION);
    }
  );

  return unsubscribe;
}

export async function saveMasterRoute(route: import('../types/warehouse').MasterRoute): Promise<void> {
  try {
    await setDoc(doc(db, ROUTES_COLLECTION, route.id), sanitizeForFirestore(route));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${ROUTES_COLLECTION}/${route.id}`);
  }
}

export async function seedMasterRoutes(routes: import('../types/warehouse').MasterRoute[]): Promise<void> {
  if (routes.length === 0) return;
  try {
    const batch = writeBatch(db);
    routes.forEach((route) => {
      batch.set(doc(db, ROUTES_COLLECTION, route.id), sanitizeForFirestore(route));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ROUTES_COLLECTION);
  }
}

export async function deleteMasterRoute(routeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ROUTES_COLLECTION, routeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${ROUTES_COLLECTION}/${routeId}`);
  }
}

/**
 * Real-time subscription to Master Vendors
 */
export function subscribeToMasterVendors(
  onUpdate: (vendors: import('../types/warehouse').MasterVendor[]) => void
): () => void {
  const q = query(collection(db, VENDORS_COLLECTION));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const vendors: import('../types/warehouse').MasterVendor[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as import('../types/warehouse').MasterVendor;
        if (raw) {
          vendors.push({ ...raw, id: raw.id || docSnap.id });
        }
      });
      onUpdate(vendors);
    },
    (error) => {
      console.error('Snapshot error for master_vendors:', error);
      handleFirestoreError(error, OperationType.LIST, VENDORS_COLLECTION);
    }
  );

  return unsubscribe;
}

export async function saveMasterVendor(vendor: import('../types/warehouse').MasterVendor): Promise<void> {
  try {
    await setDoc(doc(db, VENDORS_COLLECTION, vendor.id), sanitizeForFirestore(vendor));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${VENDORS_COLLECTION}/${vendor.id}`);
  }
}

export async function seedMasterVendors(vendors: import('../types/warehouse').MasterVendor[]): Promise<void> {
  if (vendors.length === 0) return;
  try {
    const batch = writeBatch(db);
    vendors.forEach((vendor) => {
      batch.set(doc(db, VENDORS_COLLECTION, vendor.id), sanitizeForFirestore(vendor));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, VENDORS_COLLECTION);
  }
}

export async function deleteMasterVendor(vendorId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, VENDORS_COLLECTION, vendorId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${VENDORS_COLLECTION}/${vendorId}`);
  }
}

/**
 * Real-time subscription to Surat Jalan Records
 */
export function subscribeToSuratJalanRecords(
  onUpdate: (records: import('../types/warehouse').SuratJalanRecord[]) => void
): () => void {
  const q = query(collection(db, SURAT_JALAN_COLLECTION));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const records: import('../types/warehouse').SuratJalanRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as import('../types/warehouse').SuratJalanRecord;
        if (data && data.id) {
          records.push(data);
        }
      });
      records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(records);
    },
    (error) => {
      console.error('Snapshot error for surat_jalan_records:', error);
      handleFirestoreError(error, OperationType.LIST, SURAT_JALAN_COLLECTION);
    }
  );

  return unsubscribe;
}

export async function saveSuratJalanRecord(
  record: import('../types/warehouse').SuratJalanRecord
): Promise<void> {
  try {
    const suratRef = doc(db, SURAT_JALAN_COLLECTION, record.id);
    await setDoc(suratRef, sanitizeForFirestore(record));

    // Also mark the associated pallet records with suratJalanId and noSuratJalan (ignore missing docs)
    if (record.palletIds && record.palletIds.length > 0) {
      await Promise.all(
        record.palletIds.map((pid) =>
          updateDoc(doc(db, PALLET_COLLECTION, pid), {
            suratJalanId: record.id,
            noSuratJalan: record.noSuratJalan
          }).catch(() => undefined)
        )
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${SURAT_JALAN_COLLECTION}/${record.id}`);
  }
}

export async function updateSuratJalanRecord(
  record: import('../types/warehouse').SuratJalanRecord
): Promise<void> {
  try {
    const suratRef = doc(db, SURAT_JALAN_COLLECTION, record.id);
    await setDoc(suratRef, sanitizeForFirestore(record));

    // Sinkronkan nomor Surat Jalan pada pallet terkait (abaikan jika dokumen pallet sudah dihapus)
    if (record.palletIds && record.palletIds.length > 0) {
      await Promise.all(
        record.palletIds.map((pid) =>
          updateDoc(doc(db, PALLET_COLLECTION, pid), {
            suratJalanId: record.id,
            noSuratJalan: record.noSuratJalan
          }).catch(() => undefined)
        )
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${SURAT_JALAN_COLLECTION}/${record.id}`);
  }
}

export async function deleteSuratJalanRecord(suratId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, SURAT_JALAN_COLLECTION, suratId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${SURAT_JALAN_COLLECTION}/${suratId}`);
  }
}

// -------------------------------------------------------------
// MASTER ROUTE TARIFFS (TUJUAN & TARIF)
// -------------------------------------------------------------
const TARIFFS_COLLECTION = 'master_route_tariffs';

export function subscribeToMasterTariffs(
  onUpdate: (tariffs: import('../types/warehouse').MasterRouteTariff[]) => void
): () => void {
  const q = query(collection(db, TARIFFS_COLLECTION));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: import('../types/warehouse').MasterRouteTariff[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as import('../types/warehouse').MasterRouteTariff;
        if (raw) {
          items.push({ ...raw, id: raw.id || docSnap.id });
        }
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Snapshot error for master_route_tariffs:', error);
      handleFirestoreError(error, OperationType.LIST, TARIFFS_COLLECTION);
    }
  );
  return unsubscribe;
}

export async function saveMasterTariff(
  tariff: import('../types/warehouse').MasterRouteTariff
): Promise<void> {
  try {
    await setDoc(doc(db, TARIFFS_COLLECTION, tariff.id), sanitizeForFirestore(tariff));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${TARIFFS_COLLECTION}/${tariff.id}`);
  }
}

export async function seedMasterTariffs(
  tariffs: import('../types/warehouse').MasterRouteTariff[]
): Promise<void> {
  if (tariffs.length === 0) return;
  try {
    const batch = writeBatch(db);
    tariffs.forEach((t) => {
      batch.set(doc(db, TARIFFS_COLLECTION, t.id), sanitizeForFirestore(t));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, TARIFFS_COLLECTION);
  }
}

export async function deleteMasterTariff(tariffId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, TARIFFS_COLLECTION, tariffId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${TARIFFS_COLLECTION}/${tariffId}`);
  }
}

// -------------------------------------------------------------
// MASTER BLACKLIST
// -------------------------------------------------------------
const BLACKLIST_COLLECTION = 'master_blacklist';

export function subscribeToBlacklist(
  onUpdate: (records: import('../types/warehouse').BlacklistRecord[]) => void
): () => void {
  const q = query(collection(db, BLACKLIST_COLLECTION));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: import('../types/warehouse').BlacklistRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as import('../types/warehouse').BlacklistRecord;
        if (data) {
          items.push({ ...data, id: data.id || docSnap.id });
        }
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Snapshot error for master_blacklist:', error);
      handleFirestoreError(error, OperationType.LIST, BLACKLIST_COLLECTION);
    }
  );
  return unsubscribe;
}

export async function saveBlacklistRecord(
  record: import('../types/warehouse').BlacklistRecord
): Promise<void> {
  try {
    await setDoc(doc(db, BLACKLIST_COLLECTION, record.id), sanitizeForFirestore(record));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${BLACKLIST_COLLECTION}/${record.id}`);
  }
}

export async function seedBlacklistRecords(
  records: import('../types/warehouse').BlacklistRecord[]
): Promise<void> {
  if (records.length === 0) return;
  try {
    const batch = writeBatch(db);
    records.forEach((r) => {
      batch.set(doc(db, BLACKLIST_COLLECTION, r.id), sanitizeForFirestore(r));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, BLACKLIST_COLLECTION);
  }
}

export async function deleteBlacklistRecord(recordId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, BLACKLIST_COLLECTION, recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${BLACKLIST_COLLECTION}/${recordId}`);
  }
}

// -------------------------------------------------------------
// WAREHOUSE USERS (USER MANAGEMENT)
// -------------------------------------------------------------
const USERS_COLLECTION = 'warehouse_users';

export function subscribeToWarehouseUsers(
  onUpdate: (users: import('../types/warehouse').WarehouseUser[]) => void
): () => void {
  const q = query(collection(db, USERS_COLLECTION));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: import('../types/warehouse').WarehouseUser[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as import('../types/warehouse').WarehouseUser;
        if (data) {
          items.push({ ...data, id: data.id || docSnap.id });
        }
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Snapshot error for warehouse_users:', error);
      handleFirestoreError(error, OperationType.LIST, USERS_COLLECTION);
    }
  );
  return unsubscribe;
}

export async function saveWarehouseUser(
  user: import('../types/warehouse').WarehouseUser
): Promise<void> {
  try {
    await setDoc(doc(db, USERS_COLLECTION, user.id), sanitizeForFirestore(user));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${USERS_COLLECTION}/${user.id}`);
  }
}

export async function seedWarehouseUsers(
  users: import('../types/warehouse').WarehouseUser[]
): Promise<void> {
  if (users.length === 0) return;
  try {
    const batch = writeBatch(db);
    users.forEach((u) => {
      batch.set(doc(db, USERS_COLLECTION, u.id), sanitizeForFirestore(u));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, USERS_COLLECTION);
  }
}

export async function deleteWarehouseUser(userId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${USERS_COLLECTION}/${userId}`);
  }
}

// -------------------------------------------------------------
// MASTER WAREHOUSES (GUDANG & SUB-LOCATION)
// -------------------------------------------------------------
const WAREHOUSES_COLLECTION = 'master_warehouses';

export function subscribeToMasterWarehouses(
  onUpdate: (warehouses: import('../types/warehouse').MasterWarehouse[]) => void
): () => void {
  const q = query(collection(db, WAREHOUSES_COLLECTION));
  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: import('../types/warehouse').MasterWarehouse[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as import('../types/warehouse').MasterWarehouse;
        if (raw) {
          items.push({ ...raw, id: raw.id || docSnap.id });
        }
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Snapshot error for master_warehouses:', error);
      handleFirestoreError(error, OperationType.LIST, WAREHOUSES_COLLECTION);
    }
  );
  return unsubscribe;
}

export async function saveMasterWarehouse(
  warehouse: import('../types/warehouse').MasterWarehouse
): Promise<void> {
  try {
    await setDoc(doc(db, WAREHOUSES_COLLECTION, warehouse.id), sanitizeForFirestore(warehouse));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${WAREHOUSES_COLLECTION}/${warehouse.id}`);
  }
}

export async function deleteMasterWarehouse(warehouseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, WAREHOUSES_COLLECTION, warehouseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${WAREHOUSES_COLLECTION}/${warehouseId}`);
  }
}

// -------------------------------------------------------------
// MASTER REGISTRY METADATA (SHARED DELETIONS & TOUCHED FLAGS ACROSS DEVICES)
// -------------------------------------------------------------
const APP_SETTINGS_COLLECTION = 'test';
const MASTER_META_DOC_ID = 'master_registry_meta_v1';

export type MasterCollectionKey =
  | 'items'
  | 'routes'
  | 'vendors'
  | 'tariffs'
  | 'warehouses'
  | 'blacklist'
  | 'users';

export interface MasterRegistryMeta {
  deletedIds: Partial<Record<MasterCollectionKey, string[]>>;
  touched: Partial<Record<MasterCollectionKey, boolean>>;
  updatedAt: string;
}

export function subscribeToMasterRegistryMeta(
  onUpdate: (meta: MasterRegistryMeta | null) => void
): () => void {
  const ref = doc(db, APP_SETTINGS_COLLECTION, MASTER_META_DOC_ID);
  const unsubscribe = onSnapshot(
    ref,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as MasterRegistryMeta);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Snapshot error for master_registry_meta:', error);
    }
  );
  return unsubscribe;
}

export async function saveMasterRegistryMeta(meta: MasterRegistryMeta): Promise<void> {
  try {
    const ref = doc(db, APP_SETTINGS_COLLECTION, MASTER_META_DOC_ID);
    await setDoc(ref, sanitizeForFirestore(meta));
  } catch (error) {
    console.error('Failed to save master registry meta:', error);
  }
}

// -------------------------------------------------------------
// GOOGLE SHEETS BRIDGE SETTINGS (SHARED ACROSS ALL DEVICES)
// -------------------------------------------------------------
const SHEETS_BRIDGE_DOC_ID = 'google_sheets_bridge';

export type SheetsSyncMode = 'apps_script' | 'oauth';

export interface SheetsBridgeConfig {
  syncMode: SheetsSyncMode;
  appsScriptUrl: string;
  appsScriptSecret: string;
  spreadsheetUrl: string;
  palletTabTitle: string;
  includeSuratJalanTab: boolean;
  includeManualSjTab?: boolean;
  manualSjSpreadsheetUrl?: string;
  includeRekapTab: boolean;
  lockSheetReadOnly?: boolean;
  autoSync24x7Enabled: boolean;
  lastSyncedAt?: string;
  lastSyncedSummary?: string;
  updatedAt: string;
}

export function subscribeToSheetsBridgeConfig(
  onUpdate: (config: SheetsBridgeConfig | null) => void
): () => void {
  const ref = doc(db, APP_SETTINGS_COLLECTION, SHEETS_BRIDGE_DOC_ID);
  const unsubscribe = onSnapshot(
    ref,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as SheetsBridgeConfig);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Snapshot error for google_sheets_bridge:', error);
    }
  );
  return unsubscribe;
}

export async function saveSheetsBridgeConfig(config: SheetsBridgeConfig): Promise<void> {
  try {
    const ref = doc(db, APP_SETTINGS_COLLECTION, SHEETS_BRIDGE_DOC_ID);
    await setDoc(ref, sanitizeForFirestore(config));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${APP_SETTINGS_COLLECTION}/${SHEETS_BRIDGE_DOC_ID}`
    );
  }
}




