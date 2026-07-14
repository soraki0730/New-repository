import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from './firebaseClient.js';

function normalizePayload(groupIdOrPayload, maybePayload) {
  if (typeof groupIdOrPayload === 'string') {
    return { ...(maybePayload || {}), groupId: groupIdOrPayload };
  }
  return { ...(groupIdOrPayload || {}) };
}

function normalizeCreatedAt(value) {
  if (!value) return Date.now();
  return typeof value.toMillis === 'function' ? value.toMillis() : value;
}

function requestCollection(groupId) {
  return collection(db, 'groups', groupId || 'demo-group', 'unlockRequests');
}

function emergencyCollection(groupId) {
  return collection(db, 'groups', groupId || 'demo-group', 'emergencyUnlockHistory');
}

function normalizeRequest(docSnapshot) {
  const data = docSnapshot.data() || {};
  return {
    id: docSnapshot.id,
    type: data.type || 'unlock-request',
    status: data.status || 'pending',
    uid: data.uid || '',
    displayName: data.displayName || '名前未設定',
    groupId: data.groupId || '',
    reason: data.reason || '',
    createdAt: normalizeCreatedAt(data.createdAt),
    updatedAt: normalizeCreatedAt(data.updatedAt),
    approvedAt: normalizeCreatedAt(data.approvedAt),
    source: 'firestore'
  };
}

export async function createUnlockRequest(groupIdOrPayload, maybePayload) {
  const payload = normalizePayload(groupIdOrPayload, maybePayload);
  const ref = payload.id ? doc(requestCollection(payload.groupId), String(payload.id)) : doc(requestCollection(payload.groupId));
  const data = {
    type: 'unlock-request',
    status: 'pending',
    uid: payload.uid || '',
    displayName: payload.displayName || '名前未設定',
    groupId: payload.groupId || '',
    reason: payload.reason || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, data, { merge: true });
  return { id: ref.id, ...payload, status: 'pending', source: 'firestore' };
}

export function subscribeUnlockRequests(groupId, onRequests, onError) {
  if (!groupId) {
    onRequests([]);
    return () => {};
  }

  const requestsQuery = query(requestCollection(groupId), orderBy('createdAt', 'desc'));
  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      onRequests(snapshot.docs.map(normalizeRequest));
    },
    onError
  );
}

export async function approveUnlockRequest(groupIdOrPayload, maybeRequestId) {
  const payload = normalizePayload(groupIdOrPayload, {});
  const requestId = maybeRequestId || payload.requestId || payload.id;
  if (!requestId) return null;
  const ref = doc(requestCollection(payload.groupId), String(requestId));
  await setDoc(ref, {
    status: 'approved',
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return { id: String(requestId), status: 'approved' };
}

export async function createEmergencyUnlockHistory(groupIdOrPayload, maybePayload) {
  const payload = normalizePayload(groupIdOrPayload, maybePayload);
  const ref = payload.id ? doc(emergencyCollection(payload.groupId), String(payload.id)) : doc(emergencyCollection(payload.groupId));
  const data = {
    type: 'emergency-unlock',
    status: 'emergency',
    uid: payload.uid || '',
    displayName: payload.displayName || '名前未設定',
    groupId: payload.groupId || '',
    reason: payload.reason || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, data, { merge: true });
  return { id: ref.id, ...payload, status: 'emergency', source: 'firestore' };
}
