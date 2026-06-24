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

function toMillis(value) {
  if (!value) return null;
  return typeof value.toMillis === 'function' ? value.toMillis() : value;
}

export async function upsertTask(uid, task) {
  const tasksCollection = collection(db, 'users', uid, 'tasks');
  const taskRef = task.id ? doc(tasksCollection, task.id) : doc(tasksCollection);
  const taskData = {
    id: task.id || taskRef.id,
    title: task.title || '',
    completed: task.completed ?? false,
    progress: task.progress ?? 0,
    createdAt: task.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(taskRef, taskData, { merge: true });
  return taskData.id;
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
        return {
          id: data.id || docSnapshot.id,
          title: data.title,
          completed: data.completed,
          progress: data.progress,
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt)
        };
      });
      onTasks(tasks);
    },
    onError
  );
}
