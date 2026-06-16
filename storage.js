// storage.js

const STORAGE_KEY = "tasks";
const STUDY_MODE_KEY = "studyMode";
const BLOCKED_SITES_KEY = "blockedSites";

const DEFAULT_BLOCKED_SITES = [
  "https://www.youtube.com/",
  "chrome://extensions/",
];

// ==============================
// ユーティリティ関数
// ==============================
function useChrome() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

// ==============================
// タスク取得
// ==============================
function loadTasks() {
  if (useChrome()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result?.[STORAGE_KEY] ?? []);
      });
    });
  }

  const data = localStorage.getItem(STORAGE_KEY);
  return Promise.resolve(data ? JSON.parse(data) : []);
}

// 指定日付のタスクを取得
function loadTasksByDate(date) {
  return loadTasks().then((tasks) => {
    return tasks.filter((task) => task.date === date);
  });
}

// 未完了タスクを取得
function loadUndoneTasks() {
  return loadTasks().then((tasks) => {
    return tasks.filter((task) => !task.done);
  });
}

// ==============================
// タスク保存
// ==============================
function saveTasks(tasks) {
  if (useChrome()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: tasks }, () => {
        resolve();
      });
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  return Promise.resolve();
}

// タスクを追加
function addTask(task) {
  return loadTasks().then((tasks) => {
    const newTask = {
      id: Date.now().toString(),
      name: task.name,
      category: task.category,
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
      done: false,
    };
    tasks.push(newTask);
    return saveTasks(tasks).then(() => newTask);
  });
}

// タスクを更新
function updateTask(taskId, updates) {
  return loadTasks().then((tasks) => {
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) return null;
    
    tasks[index] = { ...tasks[index], ...updates };
    return saveTasks(tasks).then(() => tasks[index]);
  });
}

// タスクを削除
function deleteTask(taskId) {
  return loadTasks().then((tasks) => {
    const filtered = tasks.filter((t) => t.id !== taskId);
    return saveTasks(filtered).then(() => taskId);
  });
}

// タスク完了状態を切り替え
function toggleTaskDone(taskId) {
  return loadTasks().then((tasks) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return null;
    
    task.done = !task.done;
    return saveTasks(tasks).then(() => task);
  });
}

// ==============================
// StudyMode取得・保存
// ==============================
function loadStudyMode() {
  if (useChrome()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STUDY_MODE_KEY], (result) => {
        resolve(result?.[STUDY_MODE_KEY] ?? false);
      });
    });
  }

  const data = localStorage.getItem(STUDY_MODE_KEY);
  return Promise.resolve(data ? JSON.parse(data) : false);
}

function saveStudyMode(value) {
  if (useChrome()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STUDY_MODE_KEY]: value }, () => {
        resolve();
      });
    });
  }

  localStorage.setItem(STUDY_MODE_KEY, JSON.stringify(value));
  return Promise.resolve();
}

// ==============================
// ブロック対象サイト管理
// ==============================
function loadBlockedSites() {
  if (useChrome()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([BLOCKED_SITES_KEY], (result) => {
        resolve(result?.[BLOCKED_SITES_KEY] ?? DEFAULT_BLOCKED_SITES);
      });
    });
  }

  const data = localStorage.getItem(BLOCKED_SITES_KEY);
  return Promise.resolve(data ? JSON.parse(data) : DEFAULT_BLOCKED_SITES);
}

function saveBlockedSites(sites) {
  if (useChrome()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [BLOCKED_SITES_KEY]: sites }, () => {
        resolve();
      });
    });
  }

  localStorage.setItem(BLOCKED_SITES_KEY, JSON.stringify(sites));
  return Promise.resolve();
}

// ブロック対象サイトを追加
function addBlockedSite(url) {
  return loadBlockedSites().then((sites) => {
    if (!sites.includes(url)) {
      sites.push(url);
      return saveBlockedSites(sites).then(() => sites);
    }
    return sites;
  });
}

// ブロック対象サイトを削除
function removeBlockedSite(url) {
  return loadBlockedSites().then((sites) => {
    const filtered = sites.filter((site) => site !== url);
    return saveBlockedSites(filtered).then(() => filtered);
  });
}

// ==============================
// 分析・集計関数
// ==============================
// カテゴリ別進捗を計算
function getCategoryProgress() {
  return loadTasks().then((tasks) => {
    const categoryMap = {};
    
    tasks.forEach((task) => {
      if (!categoryMap[task.category]) {
        categoryMap[task.category] = { total: 0, done: 0 };
      }
      categoryMap[task.category].total++;
      if (task.done) {
        categoryMap[task.category].done++;
      }
    });
    
    const result = [];
    Object.entries(categoryMap).forEach(([category, { total, done }]) => {
      result.push({
        category,
        total,
        done,
        percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      });
    });
    
    return result;
  });
}

// 今日の達成率を取得
function getTodayProgress() {
  const today = new Date().toISOString().split("T")[0];
  return loadTasksByDate(today).then((tasks) => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    return {
      total,
      done,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}