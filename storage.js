// storage.js

const STORAGE_KEY = "tasks";
const STUDY_MODE_KEY = "studyMode";

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

function loadStudyMode() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STUDY_MODE_KEY], (result) => {
        resolve(result?.[STUDY_MODE_KEY] ?? false);
      });
    });
  }

  const data = localStorage.getItem(STUDY_MODE_KEY);
  return Promise.resolve(data ? JSON.parse(data) : false);
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

function saveStudyMode(value) {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STUDY_MODE_KEY]: value }, () => {
        resolve();
      });
    });
  }

  localStorage.setItem(STUDY_MODE_KEY, JSON.stringify(value));
  return Promise.resolve();
}