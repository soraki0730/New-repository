async function initBlock() {
  const tasks = await loadTasks();
  const pending = tasks.filter((task) => !task.done).length;
  const message = document.getElementById("block-message");
  const hint = document.getElementById("block-hint");
  const openApp = document.getElementById("open-app");

  if (pending > 0) {
    message.textContent = `${pending} 件の未完了タスクがあります。`;
    hint.textContent = `あと ${pending} 個完了すると閲覧制限が解除されます。`;
  } else {
    message.textContent = "未完了タスクはありません。";
    hint.textContent = "管理画面でタスクを確認してください。";
  }

  openApp.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  });
}

document.addEventListener("DOMContentLoaded", initBlock);
