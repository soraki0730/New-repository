// content.js

let BLOCK_URLS = [];

// ブロック対象URLを動的に読み込む
function loadBlockedUrls() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["blockedSites"], (result) => {
      BLOCK_URLS = result?.blockedSites ?? [
        "https://www.youtube.com/",
        "chrome://extensions/",
      ];
    });
  } else {
    const data = localStorage.getItem("blockedSites");
    BLOCK_URLS = data ? JSON.parse(data) : [
      "https://www.youtube.com/",
      "chrome://extensions/",
    ];
  }
}

// 初期読み込み
loadBlockedUrls();

function shouldBlockUrl(url, taskState) {
  if (!taskState?.studyMode || !taskState?.hasPendingTasks) return false;
  return BLOCK_URLS.some((blocked) => url.includes(blocked));
}

function redirectToBlockPage() {
  window.location.href = chrome.runtime.getURL("block.html");
}

function handleTaskState(taskState) {
  if (shouldBlockUrl(window.location.href, taskState)) {
    redirectToBlockPage();
  }
}

function loadStateAndHandle() {
  chrome.storage.local.get(["tasks", "studyMode"], (result) => {
    const nextState = {
      totalCount: Array.isArray(result.tasks) ? result.tasks.length : 0,
      pendingCount: Array.isArray(result.tasks)
        ? result.tasks.filter((task) => !task.done).length
        : 0,
      hasPendingTasks:
        Array.isArray(result.tasks) && result.tasks.some((task) => !task.done),
      studyMode: Boolean(result.studyMode),
    };
    handleTaskState(nextState);
  });
}

loadStateAndHandle();

chrome.runtime.sendMessage({ type: "GET_TASK_STATE" }, (taskState) => {
  if (chrome.runtime.lastError) {
    console.warn("[content] runtime sendMessage failed", chrome.runtime.lastError);
    return;
  }
  handleTaskState(taskState || {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  
  // blockedSites が変更されたら再読み込み
  if (changes.blockedSites) {
    loadBlockedUrls();
  }
  
  // tasks か studyMode が変更されたら状態を再チェック
  if (changes.tasks || changes.studyMode) {
    loadStateAndHandle();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TASK_STATE_UPDATED") {
    handleTaskState(message.taskState || {});
  }
});
