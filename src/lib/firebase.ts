import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

let firebaseApp: any = null;
let firebaseAuth: any = null;

export function initializeFirebaseClient(config: any) {
  if (getApps().length === 0) {
    firebaseApp = initializeApp(config);
  } else {
    firebaseApp = getApp();
  }
  firebaseAuth = getAuth(firebaseApp);
  return { app: firebaseApp, auth: firebaseAuth };
}

export function getClientAuth() {
  return firebaseAuth;
}

export async function signInWithGoogle() {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not initialized. Please wait for the application config to load.');
  }
  const provider = new GoogleAuthProvider();
  // Enforce the user account selection screen
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  const result = await signInWithPopup(firebaseAuth, provider);
  return result.user;
}

export async function logoutClient() {
  if (firebaseAuth) {
    await signOut(firebaseAuth);
  }
}
