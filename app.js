/* =========================================================
   app.js  ―  ロジック担当（A・B担当）
   ========================================================= */

let tasks    = [];
let tasksTab = 'day'; // 'day' | 'week' | 'month'
let navDate  = new Date();
let currentUid = null;
let currentProfile = { displayName: '', groupId: '' };
let groupUnsubscribe = null;
let activeGroupId = '';
let editingTaskId = null;
let unlockRequestUnsubscribe = null;
let isSettingStudyMode = false;

const UNLOCK_STATE_KEY = 'unlockRequestState';
const UNLOCK_REQUESTS_KEY = 'unlockRequests';
const EMERGENCY_UNLOCK_HISTORY_KEY = 'emergencyUnlockHistory';

// ====== 日付ユーティリティ ======

function dateToStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayDate() {
  return dateToStr(new Date());
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // 日曜始まり
  return d;
}

function makeTask(title, { category = "", date = "", startTime = "", endTime = "" } = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    category,
    date: date || getTodayDate(),
    startTime,
    endTime,
    done: false,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ====== ロジック（契約関数）======

async function addTask(title, options = {}) {
  const t = (title || "").trim();
  if (!t) return tasks;
  tasks.push(makeTask(t, options));
  await saveTasks(tasks);
  await syncTodayProgressToFirebase();
  return tasks;
}

async function toggleTask(id) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  task.done = !task.done;
  task.progress = task.done ? 100 : 0;
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  await syncTodayProgressToFirebase();
  return tasks;
}

async function setProgress(id, percent) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  task.progress = p;
  task.done = p >= 100;
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  await syncTodayProgressToFirebase();
  return tasks;
}

async function updateTaskDetails(id, updates = {}) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  task.title = (updates.title || "").trim();
  task.category = updates.category || "";
  task.date = updates.date || getTodayDate();
  task.startTime = updates.startTime || "";
  task.endTime = updates.endTime || "";
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  return tasks;
}

async function deleteTask(id) {
  tasks = tasks.filter((x) => x.id !== id);
  await saveTasks(tasks);
  await syncTodayProgressToFirebase();
  return tasks;
}

function getTasks() {
  return tasks;
}

function getTodayProgressData(taskList = tasks) {
  const today = getTodayDate();
  const todayTasks = (taskList || []).filter((t) => t.date === today);
  const totalCount = todayTasks.length;
  const completedCount = todayTasks.filter((t) => t.done).length;
  const todayProgress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return { todayProgress, completedCount, totalCount };
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '未更新';
  const value = typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : timestamp;
  if (!value) return '未更新';
  const diffMs = Date.now() - value;
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}日前`;
}

function readStoredProfileSettings() {
  return new Promise((resolve) => {
    const fallback = { displayName: '', groupId: '' };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['firebaseDisplayName', 'firebaseGroupId'], (result) => {
        resolve({
          displayName: result?.firebaseDisplayName || '',
          groupId: result?.firebaseGroupId || ''
        });
      });
      return;
    }

    try {
      resolve({
        displayName: localStorage.getItem('firebaseDisplayName') || '',
        groupId: localStorage.getItem('firebaseGroupId') || ''
      });
    } catch (error) {
      resolve(fallback);
    }
  });
}

function saveProfileSettings(displayName, groupId) {
  const payload = {
    firebaseDisplayName: displayName || '',
    firebaseGroupId: groupId || ''
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(payload);
    return;
  }

  try {
    localStorage.setItem('firebaseDisplayName', payload.firebaseDisplayName);
    localStorage.setItem('firebaseGroupId', payload.firebaseGroupId);
  } catch (error) {
    console.warn('[Group Share] local profile save failed', error);
  }
}

function storageGet(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, (result) => {
        resolve(result || {});
      });
      return;
    }

    const result = {};
    (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
      try {
        const value = localStorage.getItem(key);
        result[key] = value ? JSON.parse(value) : undefined;
      } catch (error) {
        result[key] = undefined;
      }
    });
    resolve(result);
  });
}

function storageSet(payload) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(payload, () => resolve());
      return;
    }

    Object.entries(payload).forEach(([key, value]) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn('[Unlock Request] local save failed', error);
      }
    });
    resolve();
  });
}

function makeUnlockId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatUnlockTime(timestamp) {
  if (!timestamp) return '';
  const value = typeof timestamp.toMillis === 'function' ? timestamp.toMillis() : timestamp;
  return new Date(value).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getUnlockActorName() {
  return currentProfile.displayName || '名前未設定';
}

function getUnlockGroupId() {
  return currentProfile.groupId || activeGroupId || '';
}

async function getUnlockUidSafely() {
  try {
    return await ensureCurrentUser();
  } catch (error) {
    console.warn('[Unlock Request] Firebase user unavailable; using local-only request', error);
    return currentUid || '';
  }
}

async function readUnlockState() {
  const result = await storageGet([UNLOCK_STATE_KEY]);
  return result?.[UNLOCK_STATE_KEY] || { status: 'none' };
}

async function saveUnlockState(state) {
  await storageSet({ [UNLOCK_STATE_KEY]: state || { status: 'none' } });
}

async function readLocalUnlockRequests() {
  const result = await storageGet([UNLOCK_REQUESTS_KEY]);
  return Array.isArray(result?.[UNLOCK_REQUESTS_KEY]) ? result[UNLOCK_REQUESTS_KEY] : [];
}

async function saveLocalUnlockRequests(requests) {
  await storageSet({ [UNLOCK_REQUESTS_KEY]: requests });
}

async function upsertLocalUnlockRequest(request) {
  const requests = await readLocalUnlockRequests();
  const index = requests.findIndex((item) => item.id === request.id);
  if (index >= 0) {
    requests[index] = { ...requests[index], ...request };
  } else {
    requests.unshift(request);
  }
  await saveLocalUnlockRequests(requests.slice(0, 20));
}

async function readEmergencyUnlockHistory() {
  const result = await storageGet([EMERGENCY_UNLOCK_HISTORY_KEY]);
  return Array.isArray(result?.[EMERGENCY_UNLOCK_HISTORY_KEY]) ? result[EMERGENCY_UNLOCK_HISTORY_KEY] : [];
}

async function saveEmergencyUnlockHistory(items) {
  await storageSet({ [EMERGENCY_UNLOCK_HISTORY_KEY]: items });
}

async function addLocalEmergencyUnlockHistory(item) {
  const history = await readEmergencyUnlockHistory();
  await saveEmergencyUnlockHistory([item, ...history].slice(0, 20));
}

async function callFirebaseUnlockMethod(methodName, payload) {
  const firebaseApi = await ensureFirebaseAvailable();
  const method = firebaseApi?.[methodName];
  if (typeof method !== 'function') return null;

  try {
    if (method.length >= 3) {
      return await method(payload.groupId, payload.uid, payload);
    }
    if (method.length >= 2) {
      return await method(payload.groupId, payload);
    }
    return await method(payload);
  } catch (error) {
    console.warn(`[Unlock Request] ${methodName} failed; using local storage`, error);
    return null;
  }
}

async function persistUnlockRequest(reason) {
  const uid = await getUnlockUidSafely();
  const now = Date.now();
  const request = {
    id: makeUnlockId('unlock'),
    type: 'unlock-request',
    status: 'pending',
    uid: uid || '',
    displayName: getUnlockActorName(),
    groupId: getUnlockGroupId(),
    reason,
    createdAt: now,
    updatedAt: now,
    source: 'local'
  };

  const result = await callFirebaseUnlockMethod('createUnlockRequest', request);
  const savedRequest = {
    ...request,
    id: typeof result === 'string' ? result : (result?.id || request.id),
    source: result ? 'firestore' : 'local'
  };

  await upsertLocalUnlockRequest(savedRequest);
  return savedRequest;
}

async function persistEmergencyUnlock(reason) {
  const uid = await getUnlockUidSafely();
  const now = Date.now();
  const item = {
    id: makeUnlockId('emergency'),
    type: 'emergency-unlock',
    status: 'emergency',
    uid: uid || '',
    displayName: getUnlockActorName(),
    groupId: getUnlockGroupId(),
    reason,
    createdAt: now,
    updatedAt: now,
    source: 'local'
  };

  const result = await callFirebaseUnlockMethod('createEmergencyUnlockHistory', item);
  const savedItem = {
    ...item,
    id: typeof result === 'string' ? result : (result?.id || item.id),
    source: result ? 'firestore' : 'local'
  };

  await addLocalEmergencyUnlockHistory(savedItem);
  return savedItem;
}

function setProfileFormValues(profile = {}) {
  const displayNameInput = document.getElementById('profile-display-name');
  const groupIdInput = document.getElementById('profile-group-id');
  if (displayNameInput) {
    displayNameInput.value = profile.displayName || '';
  }
  if (groupIdInput) {
    groupIdInput.value = profile.groupId || '';
  }
}

function renderProfileSummary() {
  const nameEl = document.getElementById('profile-current-name');
  const groupEl = document.getElementById('profile-current-group');
  if (nameEl) {
    nameEl.textContent = currentProfile.displayName || '名前未設定';
  }
  if (groupEl) {
    groupEl.textContent = currentProfile.groupId ? currentProfile.groupId : '未参加';
  }
}

function renderGroupMembers(members = []) {
  const list = document.getElementById('group-progress-list');
  const empty = document.getElementById('group-progress-empty');
  if (!list || !empty) return;

  if (!currentProfile.groupId) {
    empty.hidden = false;
    list.innerHTML = '';
    return;
  }

  empty.hidden = members.length > 0;
  list.innerHTML = '';

  if (members.length === 0) {
    empty.textContent = '今日のタスクはありません';
    return;
  }

  const fragment = document.createDocumentFragment();
  members.forEach((member) => {
    const card = document.createElement('div');
    card.className = 'group-member-card';

    const top = document.createElement('div');
    top.className = 'group-member-card__top';

    const name = document.createElement('div');
    name.className = 'group-member-card__name';
    name.textContent = member.displayName || '名前未設定';

    const badge = document.createElement('span');
    badge.className = 'group-member-card__badge';
    badge.textContent = member.uid === currentUid ? '自分' : '参加中';

    top.appendChild(name);
    top.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'group-member-card__meta';
    const total = member.totalCount || 0;
    if (total === 0) {
      meta.textContent = '今日のタスクはありません';
    } else {
      meta.textContent = `${member.todayProgress || 0}% · ${member.completedCount || 0} / ${total} タスク完了`;
    }

    const updated = document.createElement('div');
    updated.className = 'group-member-card__meta';
    updated.textContent = `最終更新 ${formatRelativeTime(member.updatedAt || member.lastActiveAt)}`;

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(updated);
    fragment.appendChild(card);
  });

  list.appendChild(fragment);
}

async function renderUnlockStatus() {
  const card = document.getElementById('unlock-status-card');
  if (!card) return;

  const state = await readUnlockState();
  card.classList.remove('is-emergency', 'is-approved');

  if (!state || state.status === 'none') {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }

  card.hidden = false;
  if (state.status === 'pending') {
    card.innerHTML = `
      <strong>承認待ち</strong>
      解除申請を送信しました。承認されるまでスタディモードはONのままです。<br>
      理由：${escapeHtml(state.reason || '理由未入力')}
    `;
    return;
  }

  if (state.status === 'emergency') {
    card.classList.add('is-emergency');
    card.innerHTML = `
      <strong>緊急解除しました</strong>
      理由：${escapeHtml(state.reason || '理由未入力')}
    `;
    return;
  }

  if (state.status === 'approved') {
    card.classList.add('is-approved');
    card.innerHTML = `
      <strong>解除申請が承認されました</strong>
      スタディモードをOFFにしました。<br>
      理由：${escapeHtml(state.reason || '理由未入力')}
    `;
  }
}

function renderUnlockRequestCard(item) {
  const card = document.createElement('div');
  const isEmergency = item.type === 'emergency-unlock' || item.status === 'emergency';
  const isApproved = item.status === 'approved';
  card.className = [
    'unlock-request-card',
    isEmergency ? 'is-emergency' : '',
    isApproved ? 'is-approved' : ''
  ].filter(Boolean).join(' ');

  const top = document.createElement('div');
  top.className = 'unlock-request-card__top';

  const title = document.createElement('div');
  title.className = 'unlock-request-card__title';
  title.textContent = item.displayName || '名前未設定';

  const badge = document.createElement('span');
  badge.className = 'unlock-request-card__badge';
  if (isEmergency) {
    badge.textContent = '緊急解除';
  } else if (isApproved) {
    badge.textContent = '承認済み';
  } else {
    badge.textContent = '承認待ち';
  }

  top.appendChild(title);
  top.appendChild(badge);

  const reason = document.createElement('div');
  reason.className = 'unlock-request-card__reason';
  reason.textContent = item.reason ? `理由：${item.reason}` : '理由：未入力';

  const meta = document.createElement('div');
  meta.className = 'unlock-request-card__meta';
  const created = formatUnlockTime(item.createdAt);
  const source = item.source === 'firestore' ? 'Firestore' : 'ローカル保存';
  meta.textContent = [created, source].filter(Boolean).join(' · ');

  card.appendChild(top);
  card.appendChild(reason);
  card.appendChild(meta);

  if (!isEmergency && !isApproved) {
    const actions = document.createElement('div');
    actions.className = 'unlock-request-card__actions';

    const approveBtn = document.createElement('button');
    approveBtn.className = 'unlock-approve-btn';
    approveBtn.type = 'button';
    approveBtn.textContent = '承認';
    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true;
      await approveUnlockRequestForDemo(item);
      await renderUnlockStatus();
      await renderUnlockRequests();
    });

    actions.appendChild(approveBtn);
    card.appendChild(actions);
  }

  return card;
}

async function renderUnlockRequests(remoteRequests = null) {
  const list = document.getElementById('unlock-request-list');
  const empty = document.getElementById('unlock-request-empty');
  if (!list || !empty) return;

  const localRequests = remoteRequests || await readLocalUnlockRequests();
  const emergencyHistory = await readEmergencyUnlockHistory();
  const currentGroup = getUnlockGroupId();
  const combined = [...localRequests, ...emergencyHistory]
    .filter((item) => !currentGroup || !item.groupId || item.groupId === currentGroup)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  list.innerHTML = '';
  empty.hidden = combined.length > 0;

  if (combined.length === 0) {
    empty.textContent = currentGroup ? '解除申請はありません' : 'グループIDを設定すると解除申請が表示されます';
    return;
  }

  const fragment = document.createDocumentFragment();
  combined.forEach((item) => {
    fragment.appendChild(renderUnlockRequestCard(item));
  });
  list.appendChild(fragment);
}

async function subscribeToUnlockRequests(groupId) {
  if (unlockRequestUnsubscribe) {
    try { unlockRequestUnsubscribe(); } catch (error) {}
    unlockRequestUnsubscribe = null;
  }

  await renderUnlockRequests();
  if (!groupId) return;

  const firebaseApi = await ensureFirebaseAvailable();
  if (typeof firebaseApi?.subscribeUnlockRequests !== 'function') return;

  try {
    unlockRequestUnsubscribe = firebaseApi.subscribeUnlockRequests(
      groupId,
      async (requests) => {
        const safeRequests = Array.isArray(requests) ? requests : [];
        await saveLocalUnlockRequests(safeRequests);
        await renderUnlockRequests(safeRequests);
      },
      async () => {
        await renderUnlockRequests();
      }
    );
  } catch (error) {
    console.warn('[Unlock Request] subscribeUnlockRequests failed; using local storage', error);
    await renderUnlockRequests();
  }
}

async function approveUnlockRequestForDemo(item) {
  const firebaseApi = await ensureFirebaseAvailable();
  if (typeof firebaseApi?.approveUnlockRequest === 'function') {
    try {
      if (firebaseApi.approveUnlockRequest.length >= 2) {
        await firebaseApi.approveUnlockRequest(item.groupId, item.id);
      } else {
        await firebaseApi.approveUnlockRequest({ groupId: item.groupId, requestId: item.id, id: item.id });
      }
    } catch (error) {
      console.warn('[Unlock Request] approveUnlockRequest failed; approving locally', error);
    }
  }

  const approved = {
    ...item,
    status: 'approved',
    approvedAt: Date.now(),
    updatedAt: Date.now()
  };
  await upsertLocalUnlockRequest(approved);

  const state = await readUnlockState();
  if (state?.requestId === item.id || item.uid === currentUid) {
    await saveUnlockState({
      ...state,
      ...approved,
      status: 'approved',
      requestId: item.id
    });
    isSettingStudyMode = true;
    await saveStudyMode(false);
    isSettingStudyMode = false;
  }
}

async function ensureFirebaseAvailable() {
  if (window.studyFirebase) return window.studyFirebase;
  for (let i = 0; i < 10; i += 1) {
    if (window.studyFirebase) return window.studyFirebase;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return window.studyFirebase || null;
}

async function ensureCurrentUser() {
  const firebaseApi = await ensureFirebaseAvailable();
  if (!firebaseApi?.ensureAnonymousUser) return null;
  if (currentUid) return currentUid;
  const user = await firebaseApi.ensureAnonymousUser();
  currentUid = user?.uid ? String(user.uid) : null;
  return currentUid;
}

async function syncTodayProgressToFirebase() {
  const firebaseApi = await ensureFirebaseAvailable();
  if (!firebaseApi?.updateTodayProgress || !currentUid) return null;
  const progressData = getTodayProgressData(tasks);
  try {
    await firebaseApi.updateTodayProgress(currentUid, progressData);
    console.log(`[Group Share] progress updated: ${progressData.completedCount}/${progressData.totalCount} (${progressData.todayProgress}%)`);
    return progressData;
  } catch (error) {
    console.warn('[Group Share] progress update failed', error);
    return null;
  }
}

async function subscribeToGroup(groupId) {
  if (groupUnsubscribe) {
    groupUnsubscribe();
    groupUnsubscribe = null;
  }

  activeGroupId = groupId || '';
  if (!groupId) {
    renderGroupMembers([]);
    await subscribeToUnlockRequests('');
    return;
  }

  const firebaseApi = await ensureFirebaseAvailable();
  await subscribeToUnlockRequests(groupId);
  if (!firebaseApi?.subscribeGroupMembers) return;

  groupUnsubscribe = firebaseApi.subscribeGroupMembers(
    groupId,
    (members) => {
      renderGroupMembers(members);
    },
    (error) => {
      console.warn('[Group Share] group subscription error', error);
      renderGroupMembers([]);
    }
  );
}

async function saveProfileAndJoinGroup() {
  const firebaseApi = await ensureFirebaseAvailable();
  if (!firebaseApi?.upsertUserProfile || !currentUid) {
    return false;
  }

  const displayNameInput = document.getElementById('profile-display-name');
  const groupIdInput = document.getElementById('profile-group-id');
  const displayName = (displayNameInput?.value || '').trim() || '名前未設定';
  const groupId = (groupIdInput?.value || '').trim();

  currentProfile = { displayName, groupId };
  saveProfileSettings(displayName, groupId);
  renderProfileSummary();

  await firebaseApi.upsertUserProfile(currentUid, { displayName, groupId });
  await syncTodayProgressToFirebase();
  await subscribeToGroup(groupId);
  return true;
}

async function initializeGroupSharing() {
  const savedProfile = await readStoredProfileSettings();
  currentProfile = {
    displayName: savedProfile.displayName || '名前未設定',
    groupId: savedProfile.groupId || ''
  };
  setProfileFormValues(currentProfile);
  renderProfileSummary();

  const uid = await ensureCurrentUser();
  if (!uid) {
    console.warn('[Group Share] Firebase user not available');
    return;
  }

  currentUid = uid;
  await saveProfileAndJoinGroup();
  await syncTodayProgressToFirebase();
}

// ====== 描画 ======

const els = {};
let seen = new Set();

const CATEGORY_ICONS = {
  "プログラミング": "💻",
  "学習":           "📚",
  "就活":           "💼",
  "読書":           "📖",
  "その他":         "📝",
  "未分類":         "🗂️",
};

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function renderSummary() {
  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const total = todayTasks.length;
  const done  = todayTasks.filter((t) => t.done).length;
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100);

  if (els.count) els.count.textContent = `${done} / ${total} 完了`;
  if (els.bar)   els.bar.style.width = `${ratio}%`;

  if (els.achievementPct) els.achievementPct.textContent = `${ratio}%`;
  if (els.achievementCircle) {
    const deg = ratio * 3.6;
    els.achievementCircle.style.background =
      `conic-gradient(from -90deg, var(--primary) ${deg}deg, #E0E0E0 ${deg}deg)`;
  }
}

function formatTimeRange(startTime, endTime) {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (startTime) return startTime;
  return "";
}

function renderList() {
  els.list.innerHTML = "";

  const today = getTodayDate();
  const current = getTasks()
    .filter((t) => t.date === today)
    .sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  if (els.empty) els.empty.hidden = current.length !== 0;

  const prevSeen = seen;
  seen = new Set();
  let newIdx = 0;

  current.forEach((task) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.classList.toggle("is-done", task.done);

    if (!prevSeen.has(task.id)) {
      node.classList.add("enter");
      node.style.setProperty("--i", newIdx++);
    }
    seen.add(task.id);

    const check    = node.querySelector(".task__check");
    const timeEl   = node.querySelector(".task__time");
    const title    = node.querySelector(".task__title");
    const category = node.querySelector(".task__category");
    const range    = node.querySelector(".task__range");
    const pct      = node.querySelector(".task__pct");
    const edit     = node.querySelector(".task__edit");
    const del      = node.querySelector(".task__delete");

    check.checked = task.done;
    timeEl.textContent   = formatTimeRange(task.startTime, task.endTime);
    title.textContent    = task.title;
    category.textContent = task.category || "";
    range.value = task.progress;
    range.style.setProperty("--fill", `${task.progress}%`);
    pct.textContent = `${task.progress}%`;

    check.addEventListener("change", async () => {
      await toggleTask(task.id);
      renderAll();
    });

    range.addEventListener("input", () => {
      pct.textContent = `${range.value}%`;
      range.style.setProperty("--fill", `${range.value}%`);
    });

    range.addEventListener("change", async () => {
      await setProgress(task.id, Number(range.value));
      renderAll();
    });

    edit.addEventListener("click", () => {
      openModal(task.date, task);
    });

    del.addEventListener("click", () => {
      node.classList.add("is-removing");
      setTimeout(async () => {
        await deleteTask(task.id);
        renderAll();
      }, 180);
    });

    els.list.appendChild(node);
  });
}

function renderAll() {
  renderList();
  renderSummary();
  if (document.getElementById('view-tasks').classList.contains('active')) {
    renderTasksContent();
  }
}

// ====== マイページ（日/週/月）======

function updatePeriodLabel() {
  const label = document.getElementById('tasks-period-label');
  if (!label) return;
  if (tasksTab === 'day') {
    label.textContent =
      `${navDate.getFullYear()}年${navDate.getMonth() + 1}月${navDate.getDate()}日`;
  } else if (tasksTab === 'week') {
    const start = new Date(navDate);
    start.setDate(navDate.getDate() - 2);
    const end = new Date(navDate);
    end.setDate(navDate.getDate() + 4);
    label.textContent =
      `${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
  } else {
    label.textContent = `${navDate.getFullYear()}年${navDate.getMonth() + 1}月`;
  }
}

function renderTasksContent() {
  updatePeriodLabel();
  if (tasksTab === 'day')       renderDayView();
  else if (tasksTab === 'week') renderWeekView();
  else                          renderMonthView();
}

function navigatePeriod(dir) {
  const d = new Date(navDate);
  if (tasksTab === 'day')       d.setDate(d.getDate() + dir);
  else if (tasksTab === 'week') d.setDate(d.getDate() + dir * 7);
  else                          d.setMonth(d.getMonth() + dir);
  navDate = d;
  renderTasksContent();
}

function jumpToDay(date) {
  navDate  = new Date(date);
  tasksTab = 'day';
  document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-day').classList.add('active');
  renderTasksContent();
}

function renderDayView() {
  const content = document.getElementById('tasks-content');
  if (!content) return;

  const dateStr  = dateToStr(navDate);
  const dayTasks = tasks
    .filter(t => t.date === dateStr)
    .sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  content.innerHTML = '';

  if (dayTasks.length === 0) {
    content.innerHTML = '<p class="period-empty">この日のタスクはありません</p>';
    return;
  }

  const list = document.createElement('div');
  list.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:10px;';

  dayTasks.forEach(task => {
    const card = document.createElement('div');
    card.className = `period-task-card${task.done ? ' is-done' : ''}`;

    const checkBtn = document.createElement('button');
    checkBtn.className = 'period-task-card__check';
    checkBtn.setAttribute('aria-label', task.done ? '完了を取り消す' : '完了にする');
    checkBtn.addEventListener('click', async () => {
      await toggleTask(task.id);
      renderAll();
    });

    const body = document.createElement('div');
    body.className = 'period-task-card__body';

    const titleEl = document.createElement('div');
    titleEl.className = 'period-task-card__title';
    titleEl.textContent = task.title;
    body.appendChild(titleEl);

    const meta = [task.category, formatTimeRange(task.startTime, task.endTime)]
      .filter(Boolean).join(' · ');
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'period-task-card__meta';
      metaEl.textContent = meta;
      body.appendChild(metaEl);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'period-task-card__delete';
    delBtn.textContent = '×';
    delBtn.setAttribute('aria-label', '削除');
    delBtn.addEventListener('click', async () => {
      card.style.opacity = '0';
      card.style.transform = 'translateX(12px)';
      card.style.transition = 'opacity 0.18s, transform 0.18s';
      setTimeout(async () => {
        await deleteTask(task.id);
        renderAll();
      }, 180);
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'period-task-card__edit';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', '編集');
    editBtn.addEventListener('click', () => {
      openModal(task.date, task);
    });

    card.appendChild(checkBtn);
    card.appendChild(body);
    card.appendChild(editBtn);
    card.appendChild(delBtn);
    list.appendChild(card);
  });

  content.appendChild(list);
}

function renderWeekView() {
  const content = document.getElementById('tasks-content');
  if (!content) return;

  const weekStart = new Date(navDate);
  weekStart.setDate(navDate.getDate() - 2);
  const today = getTodayDate();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:16px;';

  const grid = document.createElement('div');
  grid.className = 'week-calendar-grid';

  for (let i = 0; i < 7; i++) {
    const d        = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr  = dateToStr(d);
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const isToday  = dateStr === today;

    const card = document.createElement('div');
    card.className = `week-day-card${isToday ? ' is-today' : ''}`;
    card.style.cursor = 'pointer';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'week-day-card__date';
    dateLabel.textContent = `${DAY_LABELS[d.getDay()]} ${d.getDate()}`;

    const taskList = document.createElement('div');
    taskList.className = 'week-day-card__tasks';

    if (dayTasks.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:11px;color:var(--ink-soft);';
      empty.textContent = 'なし';
      taskList.appendChild(empty);
    } else {
      dayTasks.forEach(task => {
        const chip = document.createElement('span');
        chip.className = `calendar-task-chip${task.done ? ' is-done' : ''}`;
        chip.textContent = task.title;
        taskList.appendChild(chip);
      });
    }

    card.appendChild(dateLabel);
    card.appendChild(taskList);
    card.addEventListener('click', () => jumpToDay(d));
    grid.appendChild(card);
  }

  wrapper.appendChild(grid);
  content.innerHTML = '';
  content.appendChild(wrapper);
}

function renderMonthView() {
  const content = document.getElementById('tasks-content');
  if (!content) return;

  const year  = navDate.getFullYear();
  const month = navDate.getMonth();
  const today = getTodayDate();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:16px;';

  const cal = document.createElement('div');
  cal.className = 'month-calendar';

  const weekdayRow = document.createElement('div');
  weekdayRow.className = 'month-calendar__weekdays';
  DAY_LABELS.forEach(d => {
    const span = document.createElement('span');
    span.className = 'month-calendar__weekday';
    span.textContent = d;
    weekdayRow.appendChild(span);
  });

  const grid = document.createElement('div');
  grid.className = 'month-calendar__grid';

  const firstDay  = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  for (let i = 0; i < 42; i++) {
    const d        = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr  = dateToStr(d);
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const isOutside = d.getMonth() !== month;
    const isToday   = dateStr === today;

    const cell = document.createElement('div');
    cell.className = [
      'month-calendar__day',
      isOutside ? 'is-outside' : '',
      isToday   ? 'is-today'   : '',
    ].filter(Boolean).join(' ');
    cell.style.cursor = 'pointer';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'month-calendar__date';
    dateLabel.textContent = d.getDate();
    cell.appendChild(dateLabel);

    dayTasks.slice(0, 2).forEach(task => {
      const chip = document.createElement('span');
      chip.className = `calendar-task-chip${task.done ? ' is-done' : ''}`;
      chip.textContent = task.title;
      cell.appendChild(chip);
    });

    if (dayTasks.length > 2) {
      const more = document.createElement('span');
      more.className = 'calendar-task-chip';
      more.style.cssText = 'color:var(--ink-soft);background:transparent;font-size:10px;padding:0 6px;';
      more.textContent = `+${dayTasks.length - 2}件`;
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => jumpToDay(d));
    grid.appendChild(cell);
  }

  cal.appendChild(weekdayRow);
  cal.appendChild(grid);
  wrapper.appendChild(cal);
  content.innerHTML = '';
  content.appendChild(wrapper);
}

// ====== 時間入力フォーマット ======

function setupTimeInput(input) {
  // 3桁目を打った瞬間にコロンを自動挿入
  input.addEventListener('input', () => {
    const digits = input.value.replace(/[^0-9]/g, '');
    if (digits.length >= 3) {
      input.value = digits.slice(0, 2) + ':' + digits.slice(2, 4);
    }
  });

  // フォーカスを外したときに "1800" → "18:00" に整形
  input.addEventListener('blur', () => {
    const val = input.value.trim();
    if (!val) return;
    const digits = val.replace(/[^0-9]/g, '');
    if (!digits) { input.value = ''; return; }

    const h = digits.length <= 2 ? parseInt(digits) : parseInt(digits.slice(0, 2));
    const m = digits.length <= 2 ? 0                : parseInt(digits.slice(2, 4) || '0');

    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      input.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else {
      input.value = '';
    }
  });
}

function getDefaultTimes() {
  const now = new Date();
  // 分が1以上なら切り上げ、0なら現在の時刻のまま
  const startHour = now.getMinutes() > 0 ? (now.getHours() + 1) % 24 : now.getHours();
  const endHour   = (startHour + 1) % 24;
  return {
    start: `${String(startHour).padStart(2, '0')}:00`,
    end:   `${String(endHour).padStart(2, '0')}:00`,
  };
}

// ====== モーダル ======

function setUnlockModalError(message) {
  if (!els.unlockModalError) return;
  els.unlockModalError.hidden = !message;
  els.unlockModalError.textContent = message || '';
}

function openUnlockModal() {
  if (!els.unlockModal || !els.unlockReasonInput) return;
  els.unlockReasonInput.value = '';
  setUnlockModalError('');
  els.unlockModal.classList.add('active');
  setTimeout(() => els.unlockReasonInput.focus(), 50);
}

function closeUnlockModal() {
  if (!els.unlockModal) return;
  els.unlockModal.classList.remove('active');
  if (els.unlockReasonInput) els.unlockReasonInput.value = '';
  setUnlockModalError('');
}

function setUnlockButtonsDisabled(disabled) {
  if (els.unlockRequestSubmit) els.unlockRequestSubmit.disabled = disabled;
  if (els.unlockEmergencySubmit) els.unlockEmergencySubmit.disabled = disabled;
}

function getUnlockReason() {
  return (els.unlockReasonInput?.value || '').trim();
}

async function submitUnlockRequest() {
  const reason = getUnlockReason();
  if (!reason) {
    setUnlockModalError('解除理由を入力してください');
    els.unlockReasonInput?.focus();
    return;
  }

  setUnlockButtonsDisabled(true);
  try {
    const request = await persistUnlockRequest(reason);
    await saveUnlockState({
      status: 'pending',
      requestId: request.id,
      reason,
      groupId: request.groupId,
      createdAt: request.createdAt,
      source: request.source
    });

    isSettingStudyMode = true;
    await saveStudyMode(true);
    if (els.studyToggle) els.studyToggle.checked = true;
    isSettingStudyMode = false;

    closeUnlockModal();
    await renderUnlockStatus();
    await renderUnlockRequests();
  } finally {
    setUnlockButtonsDisabled(false);
    isSettingStudyMode = false;
  }
}

async function submitEmergencyUnlock() {
  const reason = getUnlockReason();
  if (!reason) {
    setUnlockModalError('緊急解除の理由を入力してください');
    els.unlockReasonInput?.focus();
    return;
  }

  setUnlockButtonsDisabled(true);
  try {
    const item = await persistEmergencyUnlock(reason);
    await saveUnlockState({
      status: 'emergency',
      emergencyId: item.id,
      reason,
      groupId: item.groupId,
      createdAt: item.createdAt,
      source: item.source
    });

    isSettingStudyMode = true;
    await saveStudyMode(false);
    if (els.studyToggle) els.studyToggle.checked = false;
    isSettingStudyMode = false;

    closeUnlockModal();
    await renderUnlockStatus();
    await renderUnlockRequests();
  } finally {
    setUnlockButtonsDisabled(false);
    isSettingStudyMode = false;
  }
}

async function handleStudyModeToggleChange(studyToggle) {
  if (isSettingStudyMode) return;

  if (studyToggle.checked) {
    await saveUnlockState({ status: 'none' });
    await saveStudyMode(true);
    await renderUnlockStatus();
    return;
  }

  const wasStudyModeOn = await loadStudyMode();
  if (!wasStudyModeOn) {
    await saveStudyMode(false);
    await renderUnlockStatus();
    return;
  }

  studyToggle.checked = true;
  isSettingStudyMode = true;
  await saveStudyMode(true);
  isSettingStudyMode = false;
  await renderUnlockStatus();
  openUnlockModal();
}

async function keepStudyModeOnWhilePending(studyToggle, nextValue) {
  if (isSettingStudyMode || nextValue !== false) return false;
  const state = await readUnlockState();
  if (state?.status !== 'pending') return false;

  studyToggle.checked = true;
  isSettingStudyMode = true;
  await saveStudyMode(true);
  isSettingStudyMode = false;
  await renderUnlockStatus();
  return true;
}

function setSelectedCategory(category) {
  document.querySelectorAll(".category-chip").forEach((chip) => {
    chip.classList.toggle("selected", chip.dataset.value === category);
  });
}

function setModalMode(task) {
  const isEditing = Boolean(task);
  if (els.modalTitle) els.modalTitle.textContent = isEditing ? "タスク編集" : "タスク追加";
  if (els.modalSubmit) els.modalSubmit.textContent = isEditing ? "変更を保存" : "タスクを追加";
  els.modal.setAttribute("aria-label", isEditing ? "タスク編集" : "タスク追加");
}

function openModal(defaultDate, task = null) {
  editingTaskId = task ? task.id : null;
  setModalMode(task);
  els.input.value = task ? task.title : "";
  els.taskDate.value = task ? (task.date || getTodayDate()) : (defaultDate || getTodayDate());

  if (task) {
    els.taskStartTime.value = task.startTime || "";
    els.taskEndTime.value = task.endTime || "";
  } else {
    const { start, end } = getDefaultTimes();
    els.taskStartTime.value = start;
    els.taskEndTime.value = end;
  }

  setSelectedCategory(task ? (task.category || "") : "");
  els.modal.classList.add("active");
  setTimeout(() => els.input.focus(), 50);
}

function closeModal() {
  els.modal.classList.remove("active");
  editingTaskId = null;
  setModalMode(null);
  els.input.value = "";
  els.taskDate.value = "";
  els.taskStartTime.value = "";
  els.taskEndTime.value = "";
  setSelectedCategory("");
}

async function handleAdd() {
  const title = els.input.value;
  if (!title.trim()) {
    els.input.focus();
    return;
  }
  const selectedChip = document.querySelector(".category-chip.selected");
  const taskData = {
    category:  selectedChip ? selectedChip.dataset.value : "",
    date:      els.taskDate.value,
    startTime: els.taskStartTime.value,
    endTime:   els.taskEndTime.value,
  };
  if (editingTaskId) {
    await updateTaskDetails(editingTaskId, { title, ...taskData });
  } else {
    await addTask(title, taskData);
  }
  closeModal();
  renderAll();
}

// ====== ナビゲーション ======

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add("active");

  const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (btn) btn.classList.add("active");

  if (viewName === "tasks") renderTasksContent();
}

// ====== 設定タブ UI ======

let blockUrls = ["https://www.youtube.com/"];

function renderBlockUrls() {
  els.blockUrlList.innerHTML = "";

  if (blockUrls.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "padding:12px 16px;font-size:13px;color:var(--ink-soft);border-top:1px solid var(--line);";
    empty.textContent = "ブロックするURLがありません";
    els.blockUrlList.appendChild(empty);
    return;
  }

  blockUrls.forEach((url, i) => {
    const item = document.createElement("div");
    item.className = "block-url-item";

    const text = document.createElement("span");
    text.className = "block-url-item__text";
    text.textContent = url;

    const removeBtn = document.createElement("button");
    removeBtn.className = "block-url-item__remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `${url}を削除`);
    removeBtn.addEventListener("click", () => {
      blockUrls.splice(i, 1);
      renderBlockUrls();
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    els.blockUrlList.appendChild(item);
  });
}

function handleAddBlockUrl() {
  const url = els.blockUrlInput.value.trim();
  if (!url) return;
  if (!blockUrls.includes(url)) {
    blockUrls.push(url);
    renderBlockUrls();
  }
  els.blockUrlInput.value = "";
  els.blockUrlInput.focus();
}

// ====== 初期化 ======

document.addEventListener("DOMContentLoaded", async () => {
  els.input             = document.getElementById("task-input");
  els.list              = document.getElementById("task-list");
  els.template          = document.getElementById("task-item");
  els.count             = document.getElementById("progress-count");
  els.bar               = document.getElementById("progress-bar");
  els.empty             = document.getElementById("empty-state");
  els.modal             = document.getElementById("add-modal");
  els.modalTitle        = document.getElementById("modal-title");
  els.modalSubmit       = document.getElementById("modal-submit");
  els.achievementPct    = document.getElementById("achievement-pct");
  els.achievementCircle = document.getElementById("achievement-circle");
  els.taskDate          = document.getElementById("task-date");
  els.taskStartTime     = document.getElementById("task-start-time");
  els.taskEndTime       = document.getElementById("task-end-time");
  els.blockUrlList      = document.getElementById("block-url-list");
  els.blockUrlInput     = document.getElementById("block-url-input");
  els.studyToggle       = document.getElementById("study-mode-toggle");
  els.unlockModal       = document.getElementById("unlock-modal");
  els.unlockReasonInput = document.getElementById("unlock-reason-input");
  els.unlockModalError  = document.getElementById("unlock-modal-error");
  els.unlockRequestSubmit = document.getElementById("unlock-request-submit");
  els.unlockEmergencySubmit = document.getElementById("unlock-emergency-submit");

  // 時間入力フォーマット設定
  setupTimeInput(els.taskStartTime);
  setupTimeInput(els.taskEndTime);

  // カテゴリチップ（再クリックで解除）
  document.querySelectorAll(".category-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const wasSelected = chip.classList.contains("selected");
      document.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("selected"));
      if (!wasSelected) chip.classList.add("selected");
    });
  });

  // タスク追加
  document.getElementById("add-btn").addEventListener("click", () => openModal());
  document.getElementById("add-btn-tasks").addEventListener("click", () => openModal(dateToStr(navDate)));
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-submit").addEventListener("click", handleAdd);
  document.getElementById("unlock-modal-cancel").addEventListener("click", closeUnlockModal);
  els.unlockRequestSubmit?.addEventListener("click", submitUnlockRequest);
  els.unlockEmergencySubmit?.addEventListener("click", submitEmergencyUnlock);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  handleAdd();
    if (e.key === "Escape") closeModal();
  });

  els.unlockReasonInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeUnlockModal();
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitUnlockRequest();
  });

  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  els.unlockModal?.addEventListener("click", (e) => {
    if (e.target === els.unlockModal) closeUnlockModal();
  });

  // ボトムナビゲーション
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // マイページ タブ切替
  document.getElementById("tab-day").addEventListener("click", () => {
    tasksTab = 'day';
    document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-day').classList.add('active');
    renderTasksContent();
  });
  document.getElementById("tab-week").addEventListener("click", () => {
    tasksTab = 'week';
    document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-week').classList.add('active');
    renderTasksContent();
  });
  document.getElementById("tab-month").addEventListener("click", () => {
    tasksTab = 'month';
    document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-month').classList.add('active');
    renderTasksContent();
  });

  // 期間ナビゲーション矢印
  document.getElementById("tasks-prev").addEventListener("click", () => navigatePeriod(-1));
  document.getElementById("tasks-next").addEventListener("click", () => navigatePeriod(+1));

  // フォーカスバナー → 設定画面
  document.querySelectorAll(".focus-banner").forEach((el) => {
    el.addEventListener("click", () => switchView("settings"));
  });

  // 設定：ブロックURL
  document.getElementById("block-url-add-btn").addEventListener("click", handleAddBlockUrl);
  document.getElementById("block-url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddBlockUrl();
  });

  // 設定：スタディモード
  const studyOn = await loadStudyMode();
  els.studyToggle.checked = studyOn;
  els.studyToggle.addEventListener("change", async () => {
    await handleStudyModeToggleChange(els.studyToggle);
  });

  // chrome.storage の変化を監視してトグルを最新状態に保つ
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.studyMode) {
        const nextStudyMode = changes.studyMode.newValue ?? false;
        keepStudyModeOnWhilePending(els.studyToggle, nextStudyMode).then((keptOn) => {
          if (!keptOn) els.studyToggle.checked = nextStudyMode;
        });
      }
      if (changes[UNLOCK_STATE_KEY] || changes[UNLOCK_REQUESTS_KEY] || changes[EMERGENCY_UNLOCK_HISTORY_KEY]) {
        renderUnlockStatus();
        renderUnlockRequests();
      }
    });
  }

  // 初期描画
  tasks = await loadTasks();
  renderAll();
  renderBlockUrls();
  await renderUnlockStatus();
  await renderUnlockRequests();

  // プロフィール・グループ共有
  document.getElementById('profile-save-btn').addEventListener('click', async () => {
    await saveProfileAndJoinGroup();
  });

  await initializeGroupSharing();
  await syncTodayProgressToFirebase();
});
