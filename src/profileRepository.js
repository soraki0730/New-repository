import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient.js';

export async function upsertUserProfile(uid, profile) {
  if (!uid) return null;

  const profileRef = doc(db, 'users', uid);
  const payload = {};

  if (profile && typeof profile === 'object') {
    const displayName = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
    if (displayName) {
      payload.displayName = displayName;
    } else if (profile.displayName === undefined) {
      payload.displayName = '名前未設定';
    } else {
      payload.displayName = '名前未設定';
    }

    const groupId = typeof profile.groupId === 'string' ? profile.groupId.trim() : '';
    if (groupId) {
      payload.groupId = groupId;
    }

    if (typeof profile.todayProgress === 'number') {
      payload.todayProgress = profile.todayProgress;
    }
    if (typeof profile.completedCount === 'number') {
      payload.completedCount = profile.completedCount;
    }
    if (typeof profile.totalCount === 'number') {
      payload.totalCount = profile.totalCount;
    }
  }

  payload.lastActiveAt = serverTimestamp();
  payload.updatedAt = serverTimestamp();

  await setDoc(profileRef, payload, { merge: true });
  return { uid };
}

export async function updateTodayProgress(uid, progressData) {
  if (!uid) return null;

  const profileRef = doc(db, 'users', uid);
  const payload = {
    todayProgress: typeof progressData?.todayProgress === 'number' ? progressData.todayProgress : 0,
    completedCount: typeof progressData?.completedCount === 'number' ? progressData.completedCount : 0,
    totalCount: typeof progressData?.totalCount === 'number' ? progressData.totalCount : 0,
    lastActiveAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(profileRef, payload, { merge: true });
  return { uid, ...payload };
}
