const BLOCK_URLS = [
  "https://www.youtube.com/",
];

function shouldBlockUrl(url, taskState) {
  if (!taskState?.hasPendingTasks) return false;
  return BLOCK_URLS.some((blocked) => url.includes(blocked));
}

function showBlockScreen() {
  const message = document.createElement("div");
  message.style.position = "fixed";
  message.style.inset = "0";
  message.style.background = "#111";
  message.style.color = "#fff";
  message.style.display = "flex";
  message.style.alignItems = "center";
  message.style.justifyContent = "center";
  message.style.flexDirection = "column";
  message.style.padding = "32px";
  message.style.zIndex = "999999999";
  message.style.textAlign = "center";
  message.innerHTML = `
    <div style="max-width:520px;">
      <h1 style="font-size:2rem; margin-bottom:0.5rem;">閲覧制限中</h1>
      <p style="font-size:1rem; line-height:1.6; margin-bottom:1.5rem;">
        未完了のタスクがあるため、このサイトは閲覧できません。
      </p>
      <p style="font-size:0.95rem; opacity:0.8;">
        タスクを完了すると、自動的に制限が解除されます。
      </p>
    </div>
  `;

  document.documentElement.innerHTML = "";
  document.documentElement.appendChild(message);
}

function handleTaskState(taskState) {
  if (shouldBlockUrl(window.location.href, taskState)) {
    showBlockScreen();
  }
}

chrome.runtime.sendMessage({ type: "GET_TASK_STATE" }, (taskState) => {
  handleTaskState(taskState || {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.tasks) return;
  const nextState = {
    totalCount: Array.isArray(changes.tasks.newValue) ? changes.tasks.newValue.length : 0,
    pendingCount: Array.isArray(changes.tasks.newValue)
      ? changes.tasks.newValue.filter((task) => !task.done).length
      : 0,
    hasPendingTasks:
      Array.isArray(changes.tasks.newValue) &&
      changes.tasks.newValue.some((task) => !task.done),
  };
  handleTaskState(nextState);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TASK_STATE_UPDATED") {
    handleTaskState(message.taskState || {});
  }
});
