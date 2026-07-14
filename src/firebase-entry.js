import { ensureAnonymousUser } from './authService.js';
import { upsertTask, subscribeTasks, deleteTask } from './taskRepository.js';
import { upsertUserProfile, updateTodayProgress } from './profileRepository.js';
import {
  createGroup as createGroupRecord,
  joinGroup as joinGroupRecord,
  subscribeGroupMembers
} from './groupRepository.js';
import {
  approveUnlockRequest as approveUnlockRequestRecord,
  createEmergencyUnlockHistory as createEmergencyUnlockHistoryRecord,
  createUnlockRequest as createUnlockRequestRecord,
  subscribeUnlockRequests
} from './unlockRequestRepository.js';

const uidEl = document.getElementById('uid');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const tasksList = document.getElementById('tasks');
const addBtn = document.getElementById('addBtn');
const taskInput = document.getElementById('taskTitle');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setError(err) {
  const message = err && err.message ? err.message : String(err);
  if (errorEl) errorEl.textContent = message;
  console.error(message, err);
}

function renderTasks(tasks) {
  if (!tasksList) return;
  tasksList.innerHTML = '';
  tasks.forEach(task => {
    const li = document.createElement('li');
    li.textContent = `${task.id || ''} — ${task.title || ''} — completed:${task.completed} — progress:${task.progress}`;
    tasksList.appendChild(li);
  });
}

async function createGroup(group = {}) {
  const user = await ensureAnonymousUser();
  return createGroupRecord({
    ...group,
    ownerUid: group.ownerUid || group.uid || user.uid,
    displayName: group.displayName || user.displayName || ''
  });
}

async function joinGroup(groupId, member = {}) {
  const user = await ensureAnonymousUser();
  return joinGroupRecord(groupId, {
    ...member,
    uid: member.uid || user.uid,
    displayName: member.displayName || user.displayName || ''
  });
}

async function createUnlockRequest(groupId, request = {}) {
  const user = await ensureAnonymousUser();
  return createUnlockRequestRecord(groupId, {
    ...request,
    requesterUid: request.requesterUid || request.uid || user.uid,
    requesterName: request.requesterName || request.displayName || user.displayName || ''
  });
}

async function approveUnlockRequest(groupId, requestId, approverUid) {
  const user = await ensureAnonymousUser();
  return approveUnlockRequestRecord(groupId, requestId, approverUid || user.uid);
}

async function createEmergencyUnlockHistory(groupId, history = {}) {
  const user = await ensureAnonymousUser();
  return createEmergencyUnlockHistoryRecord(groupId, {
    ...history,
    uid: history.uid || user.uid,
    displayName: history.displayName || user.displayName || ''
  });
}

window.studyFirebase = {
  ensureAnonymousUser,
  upsertTask,
  deleteTask,
  subscribeTasks,
  upsertUserProfile,
  updateTodayProgress,
  createGroup,
  joinGroup,
  subscribeGroupMembers,
  createUnlockRequest,
  subscribeUnlockRequests,
  approveUnlockRequest,
  createEmergencyUnlockHistory
};

console.log('[Firebase] Firebase bundle loaded');

async function init() {
  try {
    const user = await ensureAnonymousUser();
    if (uidEl) uidEl.textContent = user.uid;
    setStatus('Firebase initialization succeeded');
    subscribeTasks(user.uid, renderTasks, setError);
    addBtn?.addEventListener('click', async () => {
      const title = taskInput?.value?.trim();
      if (!title) {
        setError(new Error('タスク名を入力してください'));
        return;
      }
      try {
        await upsertTask(user.uid, { title });
        if (taskInput) taskInput.value = '';
      } catch (err) {
        setError(err);
      }
    });
  } catch (err) {
    setError(err);
    setStatus('Firebase initialization failed');
  }
}

init();
