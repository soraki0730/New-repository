async function initPopup() {
  const toggle = document.getElementById("study-mode-toggle");
  const openApp = document.getElementById("open-app");

  toggle.checked = await loadStudyMode();

  toggle.addEventListener("change", async () => {
    await saveStudyMode(toggle.checked);
  });

  openApp.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
  });
}

document.addEventListener("DOMContentLoaded", initPopup);
