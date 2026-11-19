import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../config/coupleConfig';

const app = initializeApp(firebaseConfig);

// 依據 firebase-applet-config.json 指定之 firestoreDatabaseId 初始化 Firestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface FirestoreErrorResult {
  info: FirestoreErrorInfo;
  isQuotaExceeded: boolean;
  isOfflineOrUnavailable: boolean;
  isPermissionDenied: boolean;
}

type FirestoreErrorListener = (result: FirestoreErrorResult) => void;
const errorListeners = new Set<FirestoreErrorListener>();

export function subscribeFirestoreError(listener: FirestoreErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function classifyFirestoreError(error: unknown): {
  message: string;
  isQuotaExceeded: boolean;
  isOfflineOrUnavailable: boolean;
  isPermissionDenied: boolean;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();

  const isQuotaExceeded =
    lower.includes('quota') ||
    lower.includes('resource-exhausted') ||
    lower.includes('resource exhausted');

  const isOfflineOrUnavailable =
    lower.includes('offline') ||
    lower.includes('unavailable') ||
    lower.includes('network') ||
    lower.includes('deadline-exceeded');

  const isPermissionDenied =
    lower.includes('permission-denied') ||
    lower.includes('permission denied') ||
    lower.includes('insufficient permissions');

  return {
    message: rawMessage,
    isQuotaExceeded,
    isOfflineOrUnavailable,
    isPermissionDenied,
  };
}

/**
 * 安全記錄 Firestore 錯誤並通知介面進行離線／本地降級，
 * 不再直接 throw Error 導致 Uncaught Error 或畫面卡死。
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorResult {
  const classified = classifyFirestoreError(error);
  const errInfo: FirestoreErrorInfo = {
    error: classified.message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  console.warn('[Firestore Safe Handler]', errInfo);

  const result: FirestoreErrorResult = {
    info: errInfo,
    isQuotaExceeded: classified.isQuotaExceeded,
    isOfflineOrUnavailable: classified.isOfflineOrUnavailable,
    isPermissionDenied: classified.isPermissionDenied,
  };

  errorListeners.forEach((listener) => {
    try {
      listener(result);
    } catch {
      // 忽略訂閱者內部錯誤
    }
  });

  return result;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    const classified = classifyFirestoreError(error);
    if (classified.isOfflineOrUnavailable || classified.isQuotaExceeded) {
      console.warn('Firestore 目前無法連線或額度受限，將切換至本地檢視模式。');
      return false;
    }
    return true;
  }
}
