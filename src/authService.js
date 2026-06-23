import { signInAnonymously } from 'firebase/auth/web-extension';
import { auth } from './firebaseClient.js';

export async function ensureAnonymousUser() {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const result = await signInAnonymously(auth);
  return result.user;
}
