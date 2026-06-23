import { ensureAnonymousUser } from './authService.js';
import { upsertTask, subscribeTasks } from './taskRepository.js';

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

window.studyFirebase = {
  ensureAnonymousUser,
  upsertTask,
  subscribeTasks
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
