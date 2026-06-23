import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../firebaseConfig.js';

let app = null;

export function getFirebaseApp() {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export const auth = getAuth(getFirebaseApp());
export const db = getFirestore(getFirebaseApp());
