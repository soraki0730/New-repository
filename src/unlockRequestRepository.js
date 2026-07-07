import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebaseClient.js';

function normalizeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function createUnlockRequest(groupId, request = {}) {
  const normalizedGroupId = normalizeText(groupId);
  const requesterUid = normalizeText(request.requesterUid || request.uid);
  if (!normalizedGroupId) throw new Error('groupId is required');
  if (!requesterUid) throw new Error('requesterUid is required');

  const requestRef = doc(collection(db, 'groups', normalizedGroupId, 'unlockRequests'));
  await setDoc(requestRef, {
    requesterUid,
    requesterName: normalizeText(request.requesterName || request.displayName, 'Anonymous'),
    reason: normalizeText(request.reason),
    status: 'pending',
    requestedAt: serverTimestamp(),
    approvedBy: null,
    approvedAt: null
  });

  return { groupId: normalizedGroupId, requestId: requestRef.id };
}

export function subscribeUnlockRequests(groupId, onChange, onError) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) {
    onChange([]);
    return () => {};
  }

  const requestsQuery = query(
    collection(db, 'groups', normalizedGroupId, 'unlockRequests'),
    orderBy('requestedAt', 'desc')
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const requests = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
      }));
      onChange(requests);
    },
    onError
  );
}

export async function approveUnlockRequest(groupId, requestId, approverUid) {
  const normalizedGroupId = normalizeText(groupId);
  const normalizedRequestId = normalizeText(requestId);
  const normalizedApproverUid = normalizeText(approverUid);
  if (!normalizedGroupId) throw new Error('groupId is required');
  if (!normalizedRequestId) throw new Error('requestId is required');
  if (!normalizedApproverUid) throw new Error('approverUid is required');

  await updateDoc(doc(db, 'groups', normalizedGroupId, 'unlockRequests', normalizedRequestId), {
    status: 'approved',
    approvedBy: normalizedApproverUid,
    approvedAt: serverTimestamp()
  });

  return {
    groupId: normalizedGroupId,
    requestId: normalizedRequestId,
    approvedBy: normalizedApproverUid
  };
}

export async function createEmergencyUnlockHistory(groupId, history = {}) {
  const normalizedGroupId = normalizeText(groupId);
  const uid = normalizeText(history.uid);
  if (!normalizedGroupId) throw new Error('groupId is required');
  if (!uid) throw new Error('uid is required');

  const historyRef = doc(collection(db, 'groups', normalizedGroupId, 'unlockHistory'));
  await setDoc(historyRef, {
    uid,
    displayName: normalizeText(history.displayName, 'Anonymous'),
    type: 'emergency',
    reason: normalizeText(history.reason),
    progressAtUnlock: normalizeNumber(history.progressAtUnlock),
    unlockedAt: serverTimestamp()
  });

  return { groupId: normalizedGroupId, historyId: historyRef.id };
}
