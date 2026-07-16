/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Define strict shapes for custom configuration files
interface FirebaseConfigDefault {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
  clientId?: string;
  firestoreDatabaseId?: string;
}

interface GisTokenResponse {
  error?: string;
  access_token?: string;
  expires_in?: string | number;
}

interface GisTokenClientInstance {
  requestAccessToken: (options: { prompt: string }) => void;
}

// Construct the operational Firebase configuration.
const metaEnv = import.meta.env || {};

// Explicitly type the glob mapping object instead of using 'any'
const configFiles = import.meta.glob<Record<string, unknown>>('../../firebase-applet-config*.json', { eager: true });
const configKeys = Object.keys(configFiles);

const firebaseConfigDefault: FirebaseConfigDefault = configKeys.length > 0 
  ? ((configFiles[configKeys[0]] as Record<string, any>).default || {}) 
  : {};

const firebaseConfig = {
  apiKey: (metaEnv.VITE_FIREBASE_API_KEY as string) || firebaseConfigDefault.apiKey || "",
  authDomain: (metaEnv.VITE_FIREBASE_AUTH_DOMAIN as string) || firebaseConfigDefault.authDomain || "",
  projectId: (metaEnv.VITE_FIREBASE_PROJECT_ID as string) || firebaseConfigDefault.projectId || "",
  storageBucket: (metaEnv.VITE_FIREBASE_STORAGE_BUCKET as string) || firebaseConfigDefault.storageBucket || "",
  messagingSenderId: (metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || firebaseConfigDefault.messagingSenderId || "",
  appId: (metaEnv.VITE_FIREBASE_APP_ID as string) || firebaseConfigDefault.appId || "",
  measurementId: (metaEnv.VITE_FIREBASE_MEASUREMENT_ID as string) || firebaseConfigDefault.measurementId || ""
};

// OAuth 2.0 Web client ID 
const GOOGLE_CLIENT_ID = (metaEnv.VITE_GOOGLE_CLIENT_ID as string) || firebaseConfigDefault.clientId || "";
const OAUTH_SCOPES = "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let provider: GoogleAuthProvider | null = null;
let initError: Error | null = null;

try {
  const isKeyEmpty = !firebaseConfig.apiKey || firebaseConfig.apiKey.trim() === "";
  const isKeyPlaceholder = firebaseConfig.apiKey.includes("YOUR_") || firebaseConfig.apiKey === "null" || firebaseConfig.apiKey === "undefined";
  
  if (isKeyEmpty || isKeyPlaceholder) {
    throw new Error('Firebase apiKey is missing or not configured. Set the VITE_FIREBASE_* environment variables (or provide a firebase-applet-config.json) to enable Google Sign-In.');
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  if (firebaseConfigDefault.firestoreDatabaseId) {
    db = getFirestore(app, firebaseConfigDefault.firestoreDatabaseId);
  } else {
    db = getFirestore(app);
  }

  provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/documents');
  provider.addScope('https://www.googleapis.com/auth/drive');
} catch (err) {
  const errorObj = err instanceof Error ? err : new Error(String(err));
  console.warn('Firebase or Auth initialization bypassed:', errorObj.message);
  initError = errorObj;
}

export { auth, db };

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory or load from localStorage
let cachedAccessToken: string | null = (() => {
  try {
    return localStorage.getItem('gdocs_access_token');
  } catch {
    return null;
  }
})();

// When the cached access token expires (epoch ms).
let tokenExpiryMs: number | null = (() => {
  try {
    const v = localStorage.getItem('gdocs_token_expiry');
    return v ? Number(v) : null;
  } catch {
    return null;
  }
})();

function persistToken(token: string, expiresInSec: number) {
  cachedAccessToken = token;
  tokenExpiryMs = Date.now() + expiresInSec * 1000;
  try {
    localStorage.setItem('gdocs_access_token', token);
    localStorage.setItem('gdocs_token_expiry', String(tokenExpiryMs));
  } catch (e) {
    console.warn('Failed to persist access token:', e);
  }
}

// --- Silent token refresh via Google Identity Services (GIS) ---
let gisScriptPromise: Promise<void> | null = null;
let gisTokenClient: GisTokenClientInstance | null = null;
let pendingResolve: ((t: string | null) => void) | null = null;
let pendingRefresh: Promise<string | null> | null = null;

function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(s);
  });
  return gisScriptPromise;
}

async function ensureTokenClient(): Promise<GisTokenClientInstance> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured; cannot silently refresh the Google access token.');
  }
  await loadGisScript();
  if (!gisTokenClient) {
    gisTokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: OAUTH_SCOPES,
      callback: (resp: GisTokenResponse) => {
        const resolve = pendingResolve;
        pendingResolve = null;
        if (resp.error || !resp.access_token) {
          console.error('[Auth] Silent token refresh response error:', resp.error || 'no access_token');
          if (resolve) resolve(null);
          return;
        }
        persistToken(resp.access_token, Number(resp.expires_in) || 3600);
        if (resolve) resolve(cachedAccessToken);
      },
    });
  }
  return gisTokenClient!;
}

export const refreshAccessTokenSilently = async (): Promise<string | null> => {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    try {
      const client = await ensureTokenClient();
      return await new Promise<string | null>((resolve) => {
        pendingResolve = resolve;
        client.requestAccessToken({ prompt: '' });
      });
    } catch (e) {
      console.error('[Auth] Silent token refresh failed:', e);
      return null;
    }
  })().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
};

export const getValidAccessToken = async (): Promise<string | null> => {
  const SKEW_MS = 5 * 60 * 1000;
  if (cachedAccessToken && tokenExpiryMs && Date.now() < tokenExpiryMs - SKEW_MS) {
    return cachedAccessToken;
  }
  const refreshed = await refreshAccessTokenSilently();
  return refreshed || cachedAccessToken;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth || initError) {
    if (onAuthFailure) {
      setTimeout(() => onAuthFailure(), 0);
    }
    return () => {};
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = await getValidAccessToken();

      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      try {
        localStorage.removeItem('gdocs_access_token');
      } catch {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth || initError || !provider) {
    const errorMsg = initError ? initError.message : 'Firebase Auth is not configured. Set your VITE_FIREBASE_* environment variables to enable Google Sign-In.';
    throw new Error(errorMsg);
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    persistToken(credential.accessToken, 3600);
    return { user: result.user, accessToken: cachedAccessToken! };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    try {
      cachedAccessToken = localStorage.getItem('gdocs_access_token');
    } catch {}
  }
  return cachedAccessToken;
};

export const logout = async () => {
  try {
    localStorage.removeItem('gdocs_access_token');
    localStorage.removeItem('gdocs_token_expiry');
  } catch {}
  cachedAccessToken = null;
  tokenExpiryMs = null;
  if (!auth) {
    return;
  }
  await auth.signOut();
};

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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}