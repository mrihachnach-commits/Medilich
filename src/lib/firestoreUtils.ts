import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const subscribeToEvents = (userId: string, callback: (events: any[]) => void) => {
  const path = `users/${userId}/events`;
  const q = query(collection(db, path));
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(events);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const subscribeToSettings = (userId: string, callback: (settings: any) => void) => {
  const path = `users/${userId}`;
  return onSnapshot(doc(db, path), (snap) => {
    if (snap.exists()) {
      callback(snap.data()?.settings || null);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const getEvents = async (userId: string) => {
  const path = `users/${userId}/events`;
  try {
    const q = query(collection(db, path));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
};

export const createEvent = async (userId: string, eventData: any) => {
  const path = `users/${userId}/events`;
  try {
    const docRef = doc(collection(db, path));
    const data = { ...eventData, id: docRef.id, userId, createdAt: new Date().toISOString() };
    await setDoc(docRef, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateEvent = async (userId: string, eventId: string, updates: any) => {
  const path = `users/${userId}/events/${eventId}`;
  try {
    const docRef = doc(db, path);
    await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteEvent = async (userId: string, eventId: string) => {
  const path = `users/${userId}/events/${eventId}`;
  try {
    const docRef = doc(db, path);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const getUserSettings = async (userId: string) => {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, path));
    return snap.data()?.settings || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
};

export const saveUserSettings = async (userId: string, settings: any) => {
  const path = `users/${userId}`;
  try {
    await setDoc(
      doc(db, path), 
      { 
        uid: userId, 
        email: auth.currentUser?.email || '', 
        settings, 
        updatedAt: new Date().toISOString() 
      }, 
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
