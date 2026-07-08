import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { ClientToken } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyC2wG1w7JZ2n6naHQm61Q_dSL_pNt9LC30",
  authDomain: "gen-lang-client-0844737316.firebaseapp.com",
  projectId: "gen-lang-client-0844737316",
  storageBucket: "gen-lang-client-0844737316.firebasestorage.app",
  messagingSenderId: "860570413915",
  appId: "1:860570413915:web:7d90d41bbaaea9e8b5087e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Use the database ID specified in firebase-applet-config.json
export const db = getFirestore(app, "ai-studio-programartornosc-c4246517-7656-4783-8803-6805ce5c9b19");

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
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Fetches clients list and support phone from persistent Firestore cloud database.
 */
export async function fetchLicensingFromCloud(): Promise<{ clients: ClientToken[]; supportPhone?: string } | null> {
  const path = "licensing/config";
  try {
    const docRef = doc(db, "licensing", "config");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        clients: data.clients || [],
        supportPhone: data.supportPhone
      };
    }
  } catch (err) {
    console.error("Erro ao ler licenças do Firebase Firestore:", err);
    handleFirestoreError(err, OperationType.GET, path);
  }
  return null;
}

/**
 * Saves clients list and/or support phone to persistent Firestore cloud database.
 */
export async function saveLicensingToCloud(clients: ClientToken[], supportPhone?: string): Promise<boolean> {
  const path = "licensing/config";
  try {
    const docRef = doc(db, "licensing", "config");
    const payload: { clients: ClientToken[]; supportPhone?: string } = { clients };
    if (supportPhone) {
      payload.supportPhone = supportPhone;
    }
    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error("Erro ao persistir licenças no Firebase Firestore:", err);
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}
