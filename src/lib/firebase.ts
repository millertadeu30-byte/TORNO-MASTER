import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc } from "firebase/firestore";
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
    // Cleanly strip any undefined fields using JSON serialization/deserialization
    const sanitizedPayload = JSON.parse(JSON.stringify(payload));
    await setDoc(docRef, sanitizedPayload, { merge: true });
    return true;
  } catch (err) {
    console.error("Erro ao persistir licenças no Firebase Firestore:", err);
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

export interface ExperienceData {
  id?: string;
  title: string;
  message: string;
  userName: string;
  userToken: string;
  image?: string; // base64 string
  images?: string[]; // array of base64 strings
  createdAt: string;
}

/**
 * Fetches all experiences from persistent Firestore, ordered by createdAt descending.
 */
export async function fetchExperiencesFromCloud(): Promise<ExperienceData[]> {
  const path = "experiences";
  try {
    const colRef = collection(db, "experiences");
    const querySnap = await getDocs(colRef);
    const list: ExperienceData[] = [];
    querySnap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as ExperienceData);
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.error("Erro ao carregar experiências do Firestore:", err);
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
}

/**
 * Adds a new experience to the cloud Firestore.
 */
export async function saveExperienceToCloud(exp: ExperienceData): Promise<string | null> {
  const path = "experiences";
  try {
    const colRef = collection(db, "experiences");
    const sanitized = JSON.parse(JSON.stringify(exp));
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (err) {
    console.error("Erro ao salvar experiência no Firestore:", err);
    handleFirestoreError(err, OperationType.WRITE, path);
    return null;
  }
}

/**
 * Deletes an experience from cloud Firestore.
 */
export async function deleteExperienceFromCloud(id: string): Promise<boolean> {
  const path = `experiences/${id}`;
  try {
    const docRef = doc(db, "experiences", id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("Erro ao deletar experiência no Firestore:", err);
    handleFirestoreError(err, OperationType.DELETE, path);
    return false;
  }
}

/**
 * Updates an experience in the cloud Firestore.
 */
export async function updateExperienceInCloud(id: string, updates: Partial<ExperienceData>): Promise<boolean> {
  const path = `experiences/${id}`;
  try {
    const docRef = doc(db, "experiences", id);
    const sanitized = JSON.parse(JSON.stringify(updates));
    await setDoc(docRef, sanitized, { merge: true });
    return true;
  } catch (err) {
    console.error("Erro ao atualizar experiência no Firestore:", err);
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
}

/**
 * Fetches blocked tokens list.
 */
export async function fetchBlockedTokensFromCloud(): Promise<string[]> {
  const path = "experiences_config/moderation";
  try {
    const docRef = doc(db, "experiences_config", "moderation");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().blockedTokens || [];
    }
  } catch (err) {
    console.error("Erro ao ler tokens bloqueados:", err);
    handleFirestoreError(err, OperationType.GET, path);
  }
  return [];
}

/**
 * Saves/updates blocked tokens list.
 */
export async function saveBlockedTokensToCloud(blockedTokens: string[]): Promise<boolean> {
  const path = "experiences_config/moderation";
  try {
    const docRef = doc(db, "experiences_config", "moderation");
    await setDoc(docRef, { blockedTokens }, { merge: true });
    return true;
  } catch (err) {
    console.error("Erro ao salvar tokens bloqueados:", err);
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}
