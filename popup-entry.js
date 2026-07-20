async function initPopup() {
  const toggle    = document.getElementById("study-mode-toggle");
  const openApp   = document.getElementById("open-app");
  const bar       = document.getElementById("progress-bar");
  const count     = document.getElementById("progress-count");
  const banner    = document.getElementById("mode-banner");

  const syncStudyModeUi = (isOn = false) => {
    if (!toggle) return;
    toggle.checked = Boolean(isOn);
    if (banner) {
      banner.classList.toggle("active", Boolean(isOn));
    }
  };

  const loadGroupSettings = () => new Promise((resolve) => {
    const fallback = { unlockRule: 'free', emergencyUnlock: true, groupId: '' };
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['studyGroupSettings', 'firebaseGroupId'], (result) => {
        const savedGroupId = result?.firebaseGroupId || '';
        const safeFallback = savedGroupId ? { ...fallback, groupId: savedGroupId, unlockRule: 'approval' } : fallback;
        resolve({ ...safeFallback, ...(result?.studyGroupSettings || {}) });
      });
      return;
    }
    try {
      resolve({ ...fallback, ...JSON.parse(localStorage.getItem('studyGroupSettings') || '{}') });
    } catch (error) {
      resolve(fallback);
    }
  });

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
  syncStudyModeUi(studyOn);

  toggle.addEventListener("change", async () => {
    if (!toggle.checked) {
      const settings = await loadGroupSettings();
      if (settings.groupId && settings.unlockRule !== 'free') {
        toggle.checked = true;
        syncStudyModeUi(true);
        if (banner) {
          banner.textContent = settings.unlockRule === 'reason'
            ? '🔒 解除理由の入力は管理画面から行ってください'
            : '🔒 メンバーへの解除申請は管理画面から行ってください';
        }
        chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
        return;
      }
    }
    await saveStudyMode(toggle.checked);
    syncStudyModeUi(toggle.checked);
  });

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, "studyMode")) return;
      loadStudyMode().then((value) => syncStudyModeUi(value));
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "studyMode") {
      loadStudyMode().then((value) => syncStudyModeUi(value));
    }
  });

  // 管理画面を開く
  openApp.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  });
}

document.addEventListener("DOMContentLoaded", initPopup);
