// storage.js

const STORAGE_KEY = "tasks";

// 取得
function loadTasks() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result?.[STORAGE_KEY] ?? []);
      });
    });
  }

  const data = localStorage.getItem(STORAGE_KEY);
  return Promise.resolve(data ? JSON.parse(data) : []);
}

// 保存
function saveTasks(tasks) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: tasks }, () => {
        resolve();
      });
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  return Promise.resolve();
}