import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from './firebaseClient.js';
import { normalizeFromFirestore, localToFirestorePayload } from './taskNormalizer.js';

function toMillis(value) {
  if (!value) return null;
  return typeof value.toMillis === 'function' ? value.toMillis() : value;
}

export async function upsertTask(uid, task) {
  const tasksCollection = collection(db, 'users', uid, 'tasks');
  const taskRef = task.id ? doc(tasksCollection, task.id) : doc(tasksCollection);
  const payload = localToFirestorePayload(task);
  // ensure createdAt/updatedAt handling: if no createdAt provided, use serverTimestamp in payload
  if (!payload.createdAt) payload.createdAt = serverTimestamp();
  payload.updatedAt = serverTimestamp();
  await setDoc(taskRef, payload, { merge: true });
  return String(task.id || taskRef.id);
}

export async function deleteTask(uid, taskId) {
  if (!taskId) return;
  const taskRef = doc(db, 'users', uid, 'tasks', String(taskId));
  await deleteDoc(taskRef);
  return taskId;
}

export function subscribeTasks(uid, onTasks, onError) {
  const tasksCollection = collection(db, 'users', uid, 'tasks');
  const tasksQuery = query(tasksCollection, orderBy('createdAt'));
  return onSnapshot(
    tasksQuery,
    snapshot => {
      const tasks = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return normalizeFromFirestore(docSnapshot.id, data);
      });
      onTasks(tasks);
    },
    onError
  );
}
