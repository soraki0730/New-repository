import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebaseClient.js';

const DEFAULT_GROUP_SETTINGS = {
  shareLevel: 'progress',
  unlockRule: 'approval',
  emergencyUnlock: true,
  notificationLevel: 'standard'
};

function normalizeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildMemberPayload(member, role) {
  const uid = normalizeText(member?.uid);
  if (!uid) throw new Error('uid is required');

  return {
    uid,
    displayName: normalizeText(member?.displayName, 'Anonymous'),
    role,
    todayProgress: normalizeNumber(member?.todayProgress),
    completedCount: normalizeNumber(member?.completedCount),
    totalCount: normalizeNumber(member?.totalCount),
    studying: Boolean(member?.studying),
    lastActiveAt: serverTimestamp()
  };
}

export async function createGroup(group = {}) {
  const ownerUid = normalizeText(group.ownerUid || group.uid);
  if (!ownerUid) throw new Error('ownerUid is required');

  const groupRef = group.groupId
    ? doc(db, 'groups', String(group.groupId))
    : doc(collection(db, 'groups'));
  const groupId = groupRef.id;
  const batch = writeBatch(db);

  batch.set(groupRef, {
    name: normalizeText(group.name, 'New Study Group'),
    type: normalizeText(group.type, 'focus'),
    ownerUid,
    createdAt: serverTimestamp(),
    settings: {
      ...DEFAULT_GROUP_SETTINGS,
      ...(group.settings && typeof group.settings === 'object' ? group.settings : {})
    }
  });

  batch.set(
    doc(db, 'groups', groupId, 'members', ownerUid),
    buildMemberPayload(
      {
        uid: ownerUid,
        displayName: group.ownerName || group.displayName,
        todayProgress: group.todayProgress,
        completedCount: group.completedCount,
        totalCount: group.totalCount,
        studying: group.studying
      },
      'owner'
    )
  );

  await batch.commit();
  return { groupId };
}

export async function joinGroup(groupId, member = {}) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) throw new Error('groupId is required');

  const payload = buildMemberPayload(member, 'member');
  await writeBatch(db)
    .set(doc(db, 'groups', normalizedGroupId, 'members', payload.uid), payload, { merge: true })
    .commit();

  return { groupId: normalizedGroupId, uid: payload.uid };
}

export async function deleteGroupMember(groupId, uid) {
  const normalizedGroupId = normalizeText(groupId);
  const normalizedUid = normalizeText(uid);
  if (!normalizedGroupId || !normalizedUid) throw new Error('groupId and uid are required');
  await deleteDoc(doc(db, 'groups', normalizedGroupId, 'members', normalizedUid));
  return { groupId: normalizedGroupId, uid: normalizedUid };
}

export function subscribeGroupMembers(groupId, onChange, onError) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) {
    onChange([]);
    return () => {};
  }

  const membersQuery = query(
    collection(db, 'groups', normalizedGroupId, 'members'),
    orderBy('lastActiveAt', 'desc')
  );

  return onSnapshot(
    membersQuery,
    (snapshot) => {
      const members = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        return {
          uid: data?.uid || docSnapshot.id,
          displayName: data?.displayName || 'Anonymous',
          role: data?.role || 'member',
          todayProgress: normalizeNumber(data?.todayProgress),
          completedCount: normalizeNumber(data?.completedCount),
          totalCount: normalizeNumber(data?.totalCount),
          studying: Boolean(data?.studying),
          lastActiveAt: data?.lastActiveAt || null
        };
      });
      onChange(members);
    },
    onError
  );
}
