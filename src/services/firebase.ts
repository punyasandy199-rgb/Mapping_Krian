import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
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

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Must pass firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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
      batch.set(ref, record);
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
        const data = docSnap.data() as MasterItem;
        if (data && data.id) {
          items.push(data);
        }
      });
      if (items.length > 0) {
        onUpdate(items);
      }
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
    await setDoc(doc(db, MASTER_COLLECTION, item.id), item);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${MASTER_COLLECTION}/${item.id}`);
  }
}

/**
 * Save multiple master items in Firestore (batch seed)
 */
export async function seedMasterItems(items: MasterItem[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    items.forEach((item) => {
      batch.set(doc(db, MASTER_COLLECTION, item.id), item);
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
