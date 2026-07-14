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
let unlockRequestUiState = {
  status: 'idle',
  reason: '',
  requestedAt: '',
  requestId: '',
  lastUpdated: 0,
};
const UNLOCK_REQUEST_STATE_KEY = 'unlockRequestUiState';

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
    studying: false,
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

async function deleteTask(id) {
  tasks = tasks.filter((x) => x.id !== id);
  await saveTasks(tasks);
  await syncTodayProgressToFirebase();
  return tasks;
}

async function toggleTaskStudying(id) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;

  const nextStudying = !task.studying;
  tasks.forEach((item) => {
    if (item.id !== id) item.studying = false;
  });
  task.studying = nextStudying;
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  await syncTodayProgressToFirebase();
  return tasks;
}

function getTasks() {
  return tasks;
}

function getStudyingTask(taskList = tasks) {
  return (taskList || []).find((task) => task.studying) || null;
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
  // ホーム上部の自分スロットも更新
  const selfAvatar = document.getElementById('home-self-avatar');
  const selfName   = document.getElementById('home-self-name');
  const initial = (currentProfile.displayName || '自')[0];
  if (selfAvatar) selfAvatar.textContent = initial;
  if (selfName)   selfName.textContent   = currentProfile.displayName || '自分';

  const nameEl = document.getElementById('profile-current-name');
  const groupEl = document.getElementById('profile-current-group');
  if (nameEl) {
    nameEl.textContent = currentProfile.displayName || '名前未設定';
  }
  if (groupEl) {
    groupEl.textContent = currentProfile.groupId ? currentProfile.groupId : '未参加';
  }
}

function renderHomeUserRow(members = []) {
  const row = document.getElementById('home-user-row');
  if (!row) return;

  // 自分スロットを実名で更新
  const selfAvatar = document.getElementById('home-self-avatar');
  const selfName   = document.getElementById('home-self-name');
  const initial = (currentProfile.displayName || '自')[0];
  if (selfAvatar) selfAvatar.textContent = initial;
  if (selfName)   selfName.textContent   = currentProfile.displayName || '自分';

  // 既存のメンバースロットを削除
  row.querySelectorAll('.user-slot--member').forEach((el) => el.remove());

  const addSlot = row.querySelector('.user-slot--add');
  members
    .filter((m) => m.uid !== currentUid)
    .forEach((member) => {
      const slot = document.createElement('div');
      slot.className = 'user-slot user-slot--member';
      slot.innerHTML = `
        <div class="user-avatar">${(member.displayName || '?')[0]}</div>
        <span class="user-name">${member.displayName || '?'}</span>
      `;
      slot.addEventListener('click', () => showMemberPopup(member));
      if (addSlot) row.insertBefore(slot, addSlot);
      else row.appendChild(slot);
    });
}

function showMemberPopup(member) {
  const popup = document.getElementById('member-popup');
  if (!popup) return;

  const pct    = member.todayProgress || 0;
  const done   = member.completedCount || 0;
  const total  = member.totalCount || 0;
  const status = pct >= 100 ? '完了 🎉' : pct > 0 ? '学習中' : '未着手';
  const color  = pct >= 100 ? '#4caf50' : pct > 0 ? '#2196f3' : '#9e9e9e';

  popup.innerHTML = `
    <div class="member-popup__backdrop"></div>
    <div class="member-popup__card">
      <button class="member-popup__close" id="member-popup-close" type="button">✕</button>
      <div class="member-popup__avatar">${(member.displayName || '?')[0]}</div>
      <div class="member-popup__name">${member.displayName || '名前未設定'}</div>
      <div class="member-popup__status" style="color:${color}">${status}</div>
      <div class="member-popup__pct" style="color:${color}">${pct}%</div>
      <div class="member-popup__tasks">${done} / ${total} タスク完了</div>
    </div>
  `;
  popup.hidden = false;

  const close = () => { popup.hidden = true; };
  popup.querySelector('#member-popup-close').addEventListener('click', close);
  popup.querySelector('.member-popup__backdrop').addEventListener('click', close);
}

function renderGroupMembers(members = []) {
  renderHomeUserRow(members);

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

  // グループ部屋UIに実データを渡す
  if (window.GroupRoomUI) {
    window.GroupRoomUI.updateMembers(members, currentProfile.groupId);
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
    console.error('[Group Share] progress update failed', error);
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
    return;
  }

  const firebaseApi = await ensureFirebaseAvailable();
  if (!firebaseApi?.subscribeGroupMembers) return;

  groupUnsubscribe = firebaseApi.subscribeGroupMembers(
    groupId,
    (members) => {
      renderGroupMembers(members);
    },
    (error) => {
      console.error('[Group Share] group subscription error', error);
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
    const studyBtn = node.querySelector(".task__study-toggle");
    const range    = node.querySelector(".task__range");
    const pct      = node.querySelector(".task__pct");
    const edit     = node.querySelector(".task__edit");
    const del      = node.querySelector(".task__delete");

    check.checked = task.done;
    timeEl.textContent   = formatTimeRange(task.startTime, task.endTime);
    title.textContent    = task.title;
    category.textContent = task.category || "";
    if (studyBtn) {
      studyBtn.textContent = task.studying ? "勉強中 ✓" : "勉強中";
      studyBtn.classList.toggle("is-active", Boolean(task.studying));
      studyBtn.addEventListener("click", async () => {
        await toggleTaskStudying(task.id);
        renderAll();
      });
    }

    let updatedEl = node.querySelector(".task__updated");
    if (!updatedEl) {
      updatedEl = document.createElement("span");
      updatedEl.className = "task__updated";
      node.querySelector(".task-card__body").insertBefore(updatedEl, node.querySelector(".task-card__footer"));
    }
    updatedEl.textContent = `更新 ${formatRelativeTime(task.updatedAt)}`;

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
      openModal(task.date || getTodayDate(), task);
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

function useChromeStorage() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

function normalizeUnlockRequestState(state = {}) {
  return {
    status: state?.status === 'pending' || state?.status === 'emergency' ? state.status : 'idle',
    reason: typeof state?.reason === 'string' ? state.reason : '',
    requestedAt: typeof state?.requestedAt === 'string' ? state.requestedAt : '',
    requestId: typeof state?.requestId === 'string' ? state.requestId : '',
    lastUpdated: Number.isFinite(state?.lastUpdated) ? state.lastUpdated : 0,
  };
}

async function loadUnlockRequestUiState() {
  if (useChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([UNLOCK_REQUEST_STATE_KEY], (result) => {
        const value = result?.[UNLOCK_REQUEST_STATE_KEY];
        resolve(normalizeUnlockRequestState(value));
      });
    });
  }

  try {
    const raw = localStorage.getItem(UNLOCK_REQUEST_STATE_KEY);
    return normalizeUnlockRequestState(raw ? JSON.parse(raw) : {});
  } catch (error) {
    return normalizeUnlockRequestState({});
  }
}

async function saveUnlockRequestUiState(state = {}) {
  const payload = normalizeUnlockRequestState(state);
  unlockRequestUiState = payload;

  if (useChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [UNLOCK_REQUEST_STATE_KEY]: payload }, () => resolve());
    });
  }

  try {
    localStorage.setItem(UNLOCK_REQUEST_STATE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[UnlockRequest] failed to save local state', error);
  }
  return Promise.resolve();
}

function renderUnlockRequestUi() {
  const card = document.getElementById('unlock-request-card');
  const pill = document.getElementById('unlock-request-status-pill');
  const summary = document.getElementById('unlock-request-summary');
  const submitBtn = document.getElementById('unlock-request-submit');
  const emergencyBtn = document.getElementById('unlock-request-emergency');
  if (!card || !pill || !summary || !submitBtn || !emergencyBtn) return;

  const state = normalizeUnlockRequestState(unlockRequestUiState);
  const isPending = state.status === 'pending';
  const isEmergency = state.status === 'emergency';

  pill.textContent = isPending ? '承認待ち' : isEmergency ? '緊急解除済み' : '未申請';
  pill.classList.toggle('is-pending', isPending);
  pill.classList.toggle('is-emergency', isEmergency);

  if (isPending) {
    summary.textContent = '解除申請を出しました。studyModeはONのままです。';
  } else if (isEmergency) {
    summary.textContent = state.reason ? `緊急解除済み: ${state.reason}` : '緊急解除済みです。';
  } else {
    summary.textContent = 'studyModeをOFFにする前に、解除理由を入力して申請できます。';
  }

  submitBtn.textContent = isPending ? '申請をやり直す' : '解除申請';
  submitBtn.disabled = false;
  emergencyBtn.disabled = false;
}

async function syncStudyModeUi() {
  const toggle = document.getElementById('study-mode-toggle');
  if (!toggle) return;
  const pendingState = normalizeUnlockRequestState(await loadUnlockRequestUiState());
  const enabled = pendingState.status === 'pending' ? true : await loadStudyMode();
  toggle.checked = Boolean(enabled);
}

async function openUnlockRequestModal(reason = '') {
  const modal = document.getElementById('unlock-request-modal');
  const textarea = document.getElementById('unlock-request-reason');
  if (!modal || !textarea) return;
  textarea.value = reason || unlockRequestUiState.reason || '';
  modal.classList.add('active');
  setTimeout(() => textarea.focus(), 50);
}

function closeUnlockRequestModal() {
  const modal = document.getElementById('unlock-request-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function submitUnlockRequest(reason = '') {
  const trimmedReason = (reason || '').trim();
  const nextState = {
    ...normalizeUnlockRequestState(unlockRequestUiState),
    status: 'pending',
    reason: trimmedReason || '理由未記入',
    requestedAt: new Date().toISOString(),
    lastUpdated: Date.now(),
  };

  await saveUnlockRequestUiState(nextState);
  await saveStudyMode(true);
  renderUnlockRequestUi();
  closeUnlockRequestModal();

  try {
    const groupId = (currentProfile.groupId || '').trim();
    if (groupId && window.studyFirebase && typeof window.studyFirebase.createUnlockRequest === 'function') {
      const result = await window.studyFirebase.createUnlockRequest(groupId, {
        requesterUid: currentUid || undefined,
        requesterName: currentProfile.displayName || '匿名',
        reason: nextState.reason,
      });
      await saveUnlockRequestUiState({
        ...nextState,
        requestId: result?.requestId || nextState.requestId,
        lastUpdated: Date.now(),
      });
      renderUnlockRequestUi();
      return true;
    }
  } catch (error) {
    // グループ未設定や Firebase 権限エラーでも UI だけは維持する
  }

  return true;
}

async function emergencyUnlock(reason = '') {
  const trimmedReason = (reason || '').trim();
  const nextState = {
    ...normalizeUnlockRequestState(unlockRequestUiState),
    status: 'emergency',
    reason: trimmedReason || '緊急解除',
    requestedAt: new Date().toISOString(),
    lastUpdated: Date.now(),
  };

  await saveUnlockRequestUiState(nextState);
  await saveStudyMode(false);
  renderUnlockRequestUi();
  closeUnlockRequestModal();

  try {
    const groupId = (currentProfile.groupId || '').trim();
    if (groupId && window.studyFirebase && typeof window.studyFirebase.createEmergencyUnlockHistory === 'function') {
      await window.studyFirebase.createEmergencyUnlockHistory(groupId, {
        uid: currentUid || undefined,
        displayName: currentProfile.displayName || '匿名',
        reason: nextState.reason,
        progressAtUnlock: getTodayProgressData().todayProgress,
      });
    }
  } catch (error) {
    // グループ未設定や Firebase 権限エラーでも UI だけは維持する
  }

  return true;
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

    const updatedEl = document.createElement('div');
    updatedEl.className = 'period-task-card__updated';
    updatedEl.textContent = `更新 ${formatRelativeTime(task.updatedAt)}`;
    body.appendChild(updatedEl);

    const studyBtn = document.createElement('button');
    studyBtn.className = `period-task-card__study${task.studying ? ' is-active' : ''}`;
    studyBtn.type = 'button';
    studyBtn.textContent = task.studying ? '勉強中 ✓' : '勉強中';
    studyBtn.addEventListener('click', async () => {
      await toggleTaskStudying(task.id);
      renderAll();
    });
    body.appendChild(studyBtn);

    const meta = [task.category, formatTimeRange(task.startTime, task.endTime)]
      .filter(Boolean).join(' · ');
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'period-task-card__meta';
      metaEl.textContent = meta;
      body.appendChild(metaEl);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'period-task-card__edit';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', '編集');
    editBtn.addEventListener('click', () => {
      openModal(task.date || getTodayDate(), task);
    });
    card.appendChild(editBtn);

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

    card.appendChild(checkBtn);
    card.appendChild(body);
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

function openModal(defaultDate, task = null) {
  editingTaskId = task?.id || null;
  els.input.value = task?.title || "";
  els.taskDate.value = task?.date || defaultDate || getTodayDate();
  els.taskStartTime.value = task?.startTime || "";
  els.taskEndTime.value = task?.endTime || "";

  document.querySelectorAll(".category-chip").forEach((chip) => {
    chip.classList.toggle("selected", chip.dataset.value === (task?.category || ""));
  });

  if (els.modalSubmit) {
    els.modalSubmit.textContent = task ? "変更を保存" : "タスクを追加";
  }

  const titleEl = document.querySelector(".modal-sheet__title");
  if (titleEl) {
    titleEl.textContent = task ? "タスクを編集" : "タスク追加";
  }

  els.modal.classList.add("active");
  setTimeout(() => els.input.focus(), 50);
}

function closeModal() {
  editingTaskId = null;
  els.modal.classList.remove("active");
  els.input.value = "";
  els.taskDate.value = "";
  els.taskStartTime.value = "";
  els.taskEndTime.value = "";
  document.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("selected"));

  if (els.modalSubmit) {
    els.modalSubmit.textContent = "タスクを追加";
  }

  const titleEl = document.querySelector(".modal-sheet__title");
  if (titleEl) {
    titleEl.textContent = "タスク追加";
  }
}

async function handleSubmit() {
  const title = els.input.value.trim();
  if (!title) {
    els.input.focus();
    return;
  }

  const selectedChip = document.querySelector(".category-chip.selected");
  const payload = {
    category: selectedChip ? selectedChip.dataset.value : "",
    date: els.taskDate.value,
    startTime: els.taskStartTime.value,
    endTime: els.taskEndTime.value,
  };

  if (editingTaskId) {
    const task = tasks.find((item) => item.id === editingTaskId);
    if (task) {
      task.title = title;
      task.category = payload.category;
      task.date = payload.date;
      task.startTime = payload.startTime;
      task.endTime = payload.endTime;
      task.updatedAt = Date.now();
      await saveTasks(tasks);
      await syncTodayProgressToFirebase();
    }
  } else {
    await addTask(title, payload);
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

let blockUrls = [];

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
    removeBtn.addEventListener("click", async () => {
      blockUrls.splice(i, 1);
      await saveBlockedSites(blockUrls);
      renderBlockUrls();
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    els.blockUrlList.appendChild(item);
  });
}

async function handleAddBlockUrl() {
  const url = els.blockUrlInput.value.trim();
  if (!url) return;
  if (!blockUrls.includes(url)) {
    blockUrls.push(url);
    await saveBlockedSites(blockUrls);
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
  els.modalSubmit       = document.getElementById("modal-submit");
  els.achievementPct    = document.getElementById("achievement-pct");
  els.achievementCircle = document.getElementById("achievement-circle");
  els.taskDate          = document.getElementById("task-date");
  els.taskStartTime     = document.getElementById("task-start-time");
  els.taskEndTime       = document.getElementById("task-end-time");
  els.blockUrlList      = document.getElementById("block-url-list");
  els.blockUrlInput     = document.getElementById("block-url-input");

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
  els.modalSubmit.addEventListener("click", handleSubmit);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  handleSubmit();
    if (e.key === "Escape") closeModal();
  });

  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
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

  // 設定：スタディモードトグル（主導権：chrome.storage.local が唯一の真実）
  const studyToggle = document.getElementById("study-mode-toggle");
  if (studyToggle) {
    // 起動時に現在値を反映
    unlockRequestUiState = await loadUnlockRequestUiState();
    await syncStudyModeUi();
    renderUnlockRequestUi();

    // トグル操作 → OFFは即時にしない。理由入力モーダルを開く
    studyToggle.addEventListener("change", async () => {
      if (!studyToggle.checked) {
        studyToggle.checked = true;
        await openUnlockRequestModal();
        return;
      }
      await saveStudyMode(true);
    });

    // popup など他からの変更 → トグルを最新値に更新
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !Object.prototype.hasOwnProperty.call(changes, "studyMode")) return;
        const pendingState = normalizeUnlockRequestState(unlockRequestUiState);
        studyToggle.checked = pendingState.status === 'pending' ? true : Boolean(changes.studyMode.newValue);
      });
    }
  }

  // 解除申請 UI
  document.getElementById("unlock-request-submit")?.addEventListener("click", async () => {
    await openUnlockRequestModal();
  });
  document.getElementById("unlock-request-emergency")?.addEventListener("click", async () => {
    await openUnlockRequestModal();
  });
  document.getElementById("unlock-request-modal-cancel")?.addEventListener("click", closeUnlockRequestModal);
  document.getElementById("unlock-request-modal-submit")?.addEventListener("click", async () => {
    const reason = document.getElementById("unlock-request-reason")?.value || '';
    await submitUnlockRequest(reason);
  });
  document.getElementById("unlock-request-modal-emergency")?.addEventListener("click", async () => {
    const reason = document.getElementById("unlock-request-reason")?.value || '';
    await emergencyUnlock(reason);
  });
  document.getElementById("unlock-request-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeUnlockRequestModal();
  });

  // 初期描画
  tasks = await loadTasks();
  renderAll();
  blockUrls = await loadBlockedSites();
  renderBlockUrls();

  // プロフィール・グループ共有
  document.getElementById('profile-save-btn').addEventListener('click', async () => {
    await saveProfileAndJoinGroup();
  });

  await initializeGroupSharing();
  await syncTodayProgressToFirebase();
});
