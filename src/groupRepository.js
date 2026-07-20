import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
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

function normalizeSharedTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => ({
    title: normalizeText(item?.title),
    category: normalizeText(item?.category, '未分類'),
    progress: Math.max(0, Math.min(100, normalizeNumber(item?.progress))),
    done: Boolean(item?.done),
    completedCount: normalizeNumber(item?.completedCount),
    totalCount: normalizeNumber(item?.totalCount)
  }));
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
    sharedTasks: normalizeSharedTasks(member?.sharedTasks),
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

export async function updateGroupMemberProgress(groupId, uid, progress = {}) {
  const normalizedGroupId = normalizeText(groupId);
  const normalizedUid = normalizeText(uid);
  if (!normalizedGroupId || !normalizedUid) throw new Error('groupId and uid are required');
  await updateDoc(doc(db, 'groups', normalizedGroupId, 'members', normalizedUid), {
    displayName: normalizeText(progress.displayName, 'Anonymous'),
    todayProgress: normalizeNumber(progress.todayProgress),
    completedCount: normalizeNumber(progress.completedCount),
    totalCount: normalizeNumber(progress.totalCount),
    studying: Boolean(progress.studying),
    sharedTasks: normalizeSharedTasks(progress.sharedTasks),
    lastActiveAt: serverTimestamp()
  });
  return { groupId: normalizedGroupId, uid: normalizedUid };
}

export async function upsertTestBot(groupId, ownerUid, bot = {}) {
  const normalizedGroupId = normalizeText(groupId);
  const normalizedOwnerUid = normalizeText(ownerUid);
  const botUid = normalizeText(bot.uid);
  if (!normalizedGroupId || !normalizedOwnerUid || !botUid) {
    throw new Error('groupId, ownerUid and bot uid are required');
  }
  const payload = {
    ...buildMemberPayload(bot, 'bot'),
    isTestBot: true,
    createdBy: normalizedOwnerUid
  };
  await writeBatch(db)
    .set(doc(db, 'groups', normalizedGroupId, 'members', botUid), payload, { merge: true })
    .commit();
  return { groupId: normalizedGroupId, uid: botUid };
}

export async function getGroup(groupId) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) throw new Error('groupId is required');
  const snapshot = await getDoc(doc(db, 'groups', normalizedGroupId));
  if (!snapshot.exists()) throw new Error('group not found');
  return { id: snapshot.id, ...snapshot.data() };
}

export function subscribeGroup(groupId, onChange, onError) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, 'groups', normalizedGroupId),
    (snapshot) => onChange(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
    onError
  );
}

export async function updateGroupSettings(groupId, settings = {}) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) throw new Error('groupId is required');
  const payload = {
    shareLevel: normalizeText(settings.shareLevel, DEFAULT_GROUP_SETTINGS.shareLevel),
    unlockRule: normalizeText(settings.unlockRule || settings.releaseRule, DEFAULT_GROUP_SETTINGS.unlockRule),
    emergencyUnlock: settings.emergencyUnlock ?? settings.allowEmergency ?? DEFAULT_GROUP_SETTINGS.emergencyUnlock,
    notificationLevel: normalizeText(
      settings.notificationLevel || settings.notifyLevel,
      DEFAULT_GROUP_SETTINGS.notificationLevel
    )
  };
  await updateDoc(doc(db, 'groups', normalizedGroupId), {
    settings: payload,
    updatedAt: serverTimestamp()
  });
  return payload;
}

export async function createGroupActivity(groupId, activity = {}) {
  const normalizedGroupId = normalizeText(groupId);
  const actorUid = normalizeText(activity.actorUid || activity.uid);
  if (!normalizedGroupId) throw new Error('groupId is required');
  if (!actorUid) throw new Error('actorUid is required');

  const activityRef = await addDoc(collection(db, 'groups', normalizedGroupId, 'activities'), {
    actorUid,
    actorName: normalizeText(activity.actorName || activity.displayName, 'Anonymous'),
    type: normalizeText(activity.type, 'update'),
    targetUid: normalizeText(activity.targetUid),
    targetName: normalizeText(activity.targetName),
    emoji: normalizeText(activity.emoji),
    taskName: normalizeText(activity.taskName),
    requestId: normalizeText(activity.requestId),
    createdAt: serverTimestamp()
  });
  return { groupId: normalizedGroupId, activityId: activityRef.id };
}

export function subscribeGroupActivities(groupId, onChange, onError) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) {
    onChange([]);
    return () => {};
  }
  const activitiesQuery = query(
    collection(db, 'groups', normalizedGroupId, 'activities'),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  return onSnapshot(
    activitiesQuery,
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError
  );
}

export function subscribeGroupReactions(groupId, onChange, onError) {
  const normalizedGroupId = normalizeText(groupId);
  if (!normalizedGroupId) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'groups', normalizedGroupId, 'reactions'),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError
  );
}

export async function toggleGroupReaction(groupId, reaction = {}) {
  const normalizedGroupId = normalizeText(groupId);
  const actorUid = normalizeText(reaction.actorUid);
  const targetType = normalizeText(reaction.targetType, 'member');
  const targetId = normalizeText(reaction.targetId || reaction.targetUid);
  const emojiKey = normalizeText(reaction.emojiKey);
  if (!normalizedGroupId || !actorUid || !targetId || !emojiKey) {
    throw new Error('groupId, actorUid, targetId and emojiKey are required');
  }
  const reactionId = [targetType, targetId, actorUid, emojiKey].join('__');
  const reactionRef = doc(db, 'groups', normalizedGroupId, 'reactions', reactionId);
  const existing = await getDoc(reactionRef);
  if (existing.exists()) {
    await deleteDoc(reactionRef);
    return { active: false, reactionId };
  }
  await setDoc(reactionRef, {
    actorUid,
    actorName: normalizeText(reaction.actorName, 'Anonymous'),
    targetType,
    targetId,
    targetUid: normalizeText(reaction.targetUid),
    targetName: normalizeText(reaction.targetName),
    emojiKey,
    emoji: normalizeText(reaction.emoji),
    createdAt: serverTimestamp()
  });
  return { active: true, reactionId };
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
          isTestBot: Boolean(data?.isTestBot),
          createdBy: data?.createdBy || '',
          todayProgress: normalizeNumber(data?.todayProgress),
          completedCount: normalizeNumber(data?.completedCount),
          totalCount: normalizeNumber(data?.totalCount),
          studying: Boolean(data?.studying),
          sharedTasks: normalizeSharedTasks(data?.sharedTasks),
          lastActiveAt: data?.lastActiveAt || null
        };
      });
      onChange(members);
    },
    onError
  );
}
