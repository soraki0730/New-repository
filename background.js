const DEFAULT_TASK_STATE = {
  totalCount: 0,
  pendingCount: 0,
  hasPendingTasks: false,
  studyMode: false,
};

let currentTaskState = { ...DEFAULT_TASK_STATE };

function computeTaskState(tasks = [], studyMode = false) {
  const totalCount = Array.isArray(tasks) ? tasks.length : 0;
  const pendingCount = Array.isArray(tasks)
    ? tasks.filter((task) => !task.done).length
    : 0;

  return {
    totalCount,
    pendingCount,
    hasPendingTasks: pendingCount > 0,
    studyMode: Boolean(studyMode),
  };
}

function refreshTaskState() {
  chrome.storage.local.get(["tasks", "studyMode"], (result) => {
    currentTaskState = computeTaskState(result.tasks, result.studyMode);
  });
}

function broadcastTaskState() {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(
        tab.id,
        { type: "TASK_STATE_UPDATED", taskState: currentTaskState },
        () => {
          /* ignore errors from tabs without the content script */
        }
      );
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  refreshTaskState();
});

chrome.runtime.onStartup.addListener(() => {
  refreshTaskState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.tasks && !changes.studyMode) return;

  chrome.storage.local.get(["tasks", "studyMode"], (result) => {
    currentTaskState = computeTaskState(result.tasks, result.studyMode);
    broadcastTaskState();
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "GET_TASK_STATE") return;
  sendResponse(currentTaskState);
});
