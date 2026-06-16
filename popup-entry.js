async function initPopup() {
  const toggle    = document.getElementById("study-mode-toggle");
  const openApp   = document.getElementById("open-app");
  const bar       = document.getElementById("progress-bar");
  const count     = document.getElementById("progress-count");
  const banner    = document.getElementById("mode-banner");

  // 今日のタスク進捗を表示
  const today = new Date().toISOString().slice(0, 10);
  const tasks = await loadTasks();
  const todayTasks = tasks.filter((t) => t.date === today);
  const done  = todayTasks.filter((t) => t.done).length;
  const total = todayTasks.length;
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100);

  bar.style.width     = `${ratio}%`;
  count.textContent   = total === 0 ? "タスクなし" : `${done} / ${total} 完了`;

  // スタディモード
  const studyOn = await loadStudyMode();
  toggle.checked = studyOn;
  if (studyOn) banner.classList.add("active");

  toggle.addEventListener("change", async () => {
    await saveStudyMode(toggle.checked);
    banner.classList.toggle("active", toggle.checked);
  });

  // 管理画面を開く
  openApp.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  });
}

document.addEventListener("DOMContentLoaded", initPopup);
