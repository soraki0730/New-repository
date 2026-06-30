import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from './firebaseClient.js';

export function subscribeGroupMembers(groupId, onMembers, onError) {
  if (!groupId) {
    onMembers([]);
    return () => {};
  }

  const usersCollection = collection(db, 'users');
  const q = query(
    usersCollection,
    where('groupId', '==', groupId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const members = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        const todayProgress = typeof data?.todayProgress === 'number' ? data.todayProgress : 0;
        const completedCount = typeof data?.completedCount === 'number' ? data.completedCount : 0;
        const totalCount = typeof data?.totalCount === 'number' ? data.totalCount : 0;
        const rawUpdatedAt = data?.updatedAt;
        const lastActiveAt = data?.lastActiveAt;
        return {
          uid: docSnapshot.id,
          displayName: data?.displayName || '名前未設定',
          groupId: data?.groupId || '',
          todayProgress,
          completedCount,
          totalCount,
          lastActiveAt: rawUpdatedAt || lastActiveAt || null,
          updatedAt: rawUpdatedAt || null,
        };
      });
      onMembers(members);
    },
    onError
  );
}
