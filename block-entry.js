async function initBlock() {
  const tasks = await loadTasks();
  const undoneTasks = tasks.filter((task) => !task.done);
  const message = document.getElementById("block-message");
  const hint = document.getElementById("block-hint");
  const tasksContainer = document.getElementById("tasks-container");
  const openApp = document.getElementById("open-app");

  // メッセージを更新
  if (undoneTasks.length > 0) {
    message.textContent = `${undoneTasks.length} 件の未完了タスクがあります。`;
    hint.textContent = `あと ${undoneTasks.length} 個完了すると閲覧制限が解除されます。`;
  } else {
    message.textContent = "未完了タスクはありません。";
    hint.textContent = "管理画面でタスクを確認してください。";
  }

  // タスク一覧を表示
  if (undoneTasks.length === 0) {
    tasksContainer.innerHTML = '<div class="empty-state">未完了のタスクはありません</div>';
  } else {
    const tasksList = document.createElement("ul");
    tasksList.className = "tasks-list";

    undoneTasks.forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-item";
      
      const nameDiv = document.createElement("div");
      nameDiv.className = "task-name";
      nameDiv.textContent = task.name;
      
      const metaDiv = document.createElement("div");
      metaDiv.className = "task-meta";
      metaDiv.textContent = `${task.startTime} - ${task.endTime} | ${task.category}`;
      
      li.appendChild(nameDiv);
      li.appendChild(metaDiv);
      tasksList.appendChild(li);
    });

    tasksContainer.innerHTML = "";
    tasksContainer.appendChild(tasksList);
  }

  openApp.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  });
}

document.addEventListener("DOMContentLoaded", initBlock);
