/* =========================================================
   app.js  ―  ロジック担当（A・B担当）
   契約（名前は勝手に変えない）：
     addTask(title)          → Promise<Task[]>
     toggleTask(id)          → Promise<Task[]>
     deleteTask(id)          → Promise<Task[]>
     getTasks()              → Task[]
     setProgress(id, percent)→ Promise<Task[]>
   ========================================================= */

let tasks = [];

function getTodayDate() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function makeTask(title, { category = "", date = "", startTime = "", endTime = "" } = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    category,
    date: date || getTodayDate(),
    startTime,
    endTime,
    done: false,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ====== ロジック（契約関数）======

async function addTask(title, options = {}) {
  const t = (title || "").trim();
  if (!t) return tasks;
  tasks.push(makeTask(t, options));
  await saveTasks(tasks);
  return tasks;
}

async function toggleTask(id) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  task.done = !task.done;
  task.progress = task.done ? 100 : 0;
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  return tasks;
}

async function setProgress(id, percent) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  task.progress = p;
  task.done = p >= 100;
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  return tasks;
}

async function deleteTask(id) {
  tasks = tasks.filter((x) => x.id !== id);
  await saveTasks(tasks);
  return tasks;
}

function getTasks() {
  return tasks;
}

function getProgressSummary() {
  const total = tasks.length;
  const done = tasks.filter((x) => x.done).length;
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, ratio };
}

// ====== 描画 ======

const els = {};
let seen = new Set();

const CATEGORY_ICONS = {
  "プログラミング": "💻",
  "学習":           "📚",
  "就活":           "💼",
  "読書":           "📖",
  "その他":         "📝",
  "未分類":         "🗂️",
};

function renderSummary() {
  // 達成率は今日のタスクのみで計算
  const today = getTodayDate();
  const todayTasks = tasks.filter((t) => t.date === today);
  const total = todayTasks.length;
  const done  = todayTasks.filter((t) => t.done).length;
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100);

  if (els.count) els.count.textContent = `${done} / ${total} 完了`;
  if (els.bar)   els.bar.style.width = `${ratio}%`;

  if (els.achievementPct) els.achievementPct.textContent = `${ratio}%`;
  if (els.achievementCircle) {
    const deg = ratio * 3.6;
    els.achievementCircle.style.background =
      `conic-gradient(from -90deg, var(--primary) ${deg}deg, #E0E0E0 ${deg}deg)`;
  }
}

function formatTimeRange(startTime, endTime) {
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  if (startTime) return startTime;
  return "";
}

function renderList() {
  els.list.innerHTML = "";

  // 今日のタスクだけ取り出して開始時間順に並べる
  const today = getTodayDate();
  const current = getTasks()
    .filter((t) => t.date === today)
    .sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  if (els.empty) els.empty.hidden = current.length !== 0;

  const prevSeen = seen;
  seen = new Set();
  let newIdx = 0;

  current.forEach((task) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.classList.toggle("is-done", task.done);

    if (!prevSeen.has(task.id)) {
      node.classList.add("enter");
      node.style.setProperty("--i", newIdx++);
    }
    seen.add(task.id);

    const check    = node.querySelector(".task__check");
    const timeEl   = node.querySelector(".task__time");
    const title    = node.querySelector(".task__title");
    const category = node.querySelector(".task__category");
    const range    = node.querySelector(".task__range");
    const pct      = node.querySelector(".task__pct");
    const del      = node.querySelector(".task__delete");

    check.checked = task.done;
    timeEl.textContent   = formatTimeRange(task.startTime, task.endTime);
    title.textContent    = task.title;
    category.textContent = task.category || "";
    range.value = task.progress;
    range.style.setProperty("--fill", `${task.progress}%`);
    pct.textContent = `${task.progress}%`;

    check.addEventListener("change", async () => {
      await toggleTask(task.id);
      renderAll();
    });

    range.addEventListener("input", () => {
      pct.textContent = `${range.value}%`;
      range.style.setProperty("--fill", `${range.value}%`);
    });

    range.addEventListener("change", async () => {
      await setProgress(task.id, Number(range.value));
      renderAll();
    });

    del.addEventListener("click", () => {
      node.classList.add("is-removing");
      setTimeout(async () => {
        await deleteTask(task.id);
        renderAll();
      }, 180);
    });

    els.list.appendChild(node);
  });
}

function renderProgressList() {
  if (!els.progressList) return;
  els.progressList.innerHTML = "";

  if (tasks.length === 0) {
    const msg = document.createElement("p");
    msg.style.cssText = "text-align:center;color:var(--ink-soft);padding:24px;font-size:14px;";
    msg.textContent = "タスクがありません";
    els.progressList.appendChild(msg);
    return;
  }

  // カテゴリごとに集計
  const categoryMap = {};
  tasks.forEach((task) => {
    const cat = task.category || "未分類";
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, done: 0 };
    categoryMap[cat].total++;
    if (task.done) categoryMap[cat].done++;
  });

  // 達成率が高い順に表示
  const sorted = Object.entries(categoryMap).sort(
    ([, a], [, b]) => (b.done / b.total) - (a.done / a.total)
  );

  sorted.forEach(([category, { total, done }]) => {
    const percentage = Math.round((done / total) * 100);

    const item = document.createElement("div");
    item.className = "progress-item";

    const head = document.createElement("div");
    head.className = "progress-item__head";

    const icon = document.createElement("div");
    icon.className = "progress-item__icon";
    icon.textContent = CATEGORY_ICONS[category] ?? "📝";

    const nameWrap = document.createElement("div");
    nameWrap.style.cssText = "flex:1;min-width:0;";

    const name = document.createElement("span");
    name.className = "progress-item__name";
    name.textContent = category;

    const sub = document.createElement("p");
    sub.style.cssText = "font-size:11px;color:var(--ink-soft);margin-top:1px;";
    sub.textContent = `${done} / ${total} 完了`;

    nameWrap.appendChild(name);
    nameWrap.appendChild(sub);

    const pctEl = document.createElement("span");
    pctEl.className = "progress-item__pct";
    pctEl.textContent = `${percentage}%`;

    head.appendChild(icon);
    head.appendChild(nameWrap);
    head.appendChild(pctEl);

    const track = document.createElement("div");
    track.className = "progress-item__track";

    const fill = document.createElement("div");
    fill.className = "progress-item__fill";
    fill.style.width = `${percentage}%`;

    track.appendChild(fill);
    item.appendChild(head);
    item.appendChild(track);
    els.progressList.appendChild(item);
  });
}

function renderAll() {
  renderList();
  renderSummary();
  renderProgressList();
}

// ====== モーダル ======

function openModal() {
  els.taskDate.value = getTodayDate();
  els.modal.classList.add("active");
  setTimeout(() => els.input.focus(), 50);
}

function closeModal() {
  els.modal.classList.remove("active");
  els.input.value = "";
  els.taskDate.value = "";
  els.taskStartTime.value = "";
  els.taskEndTime.value = "";
  document.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("selected"));
}

async function handleAdd() {
  const title = els.input.value;
  if (!title.trim()) {
    els.input.focus();
    return;
  }
  const selectedChip = document.querySelector(".category-chip.selected");
  await addTask(title, {
    category:  selectedChip ? selectedChip.dataset.value : "",
    date:      els.taskDate.value,
    startTime: els.taskStartTime.value,
    endTime:   els.taskEndTime.value,
  });
  closeModal();
  renderAll();
}

// ====== ナビゲーション ======

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add("active");

  const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (btn) btn.classList.add("active");

  if (viewName === "tasks") renderProgressList();
}

// ====== 設定タブ UI（保存は Role C が担当）======

let blockUrls = ["https://www.youtube.com/"];

function renderBlockUrls() {
  els.blockUrlList.innerHTML = "";

  if (blockUrls.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "padding:12px 16px;font-size:13px;color:var(--ink-soft);border-top:1px solid var(--line);";
    empty.textContent = "ブロックするURLがありません";
    els.blockUrlList.appendChild(empty);
    return;
  }

  blockUrls.forEach((url, i) => {
    const item = document.createElement("div");
    item.className = "block-url-item";

    const text = document.createElement("span");
    text.className = "block-url-item__text";
    text.textContent = url;

    const removeBtn = document.createElement("button");
    removeBtn.className = "block-url-item__remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `${url}を削除`);
    removeBtn.addEventListener("click", () => {
      blockUrls.splice(i, 1);
      renderBlockUrls();
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    els.blockUrlList.appendChild(item);
  });
}

function handleAddBlockUrl() {
  const url = els.blockUrlInput.value.trim();
  if (!url) return;
  if (!blockUrls.includes(url)) {
    blockUrls.push(url);
    renderBlockUrls();
  }
  els.blockUrlInput.value = "";
  els.blockUrlInput.focus();
}

// ====== 初期化 ======

document.addEventListener("DOMContentLoaded", async () => {
  els.input             = document.getElementById("task-input");
  els.list              = document.getElementById("task-list");
  els.template          = document.getElementById("task-item");
  els.count             = document.getElementById("progress-count");
  els.bar               = document.getElementById("progress-bar");
  els.empty             = document.getElementById("empty-state");
  els.modal             = document.getElementById("add-modal");
  els.achievementPct    = document.getElementById("achievement-pct");
  els.achievementCircle = document.getElementById("achievement-circle");
  els.progressList      = document.getElementById("progress-list");
  els.taskDate          = document.getElementById("task-date");
  els.taskStartTime     = document.getElementById("task-start-time");
  els.taskEndTime       = document.getElementById("task-end-time");
  els.blockUrlList      = document.getElementById("block-url-list");
  els.blockUrlInput     = document.getElementById("block-url-input");

  // カテゴリチップ：1つだけ選択できる
  document.querySelectorAll(".category-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
  });

  // タスク追加
  document.getElementById("add-btn").addEventListener("click", openModal);
  document.getElementById("add-btn-tasks").addEventListener("click", openModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-submit").addEventListener("click", handleAdd);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  handleAdd();
    if (e.key === "Escape") closeModal();
  });

  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  // ナビゲーション
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // 設定：ブロックURL
  document.getElementById("block-url-add-btn").addEventListener("click", handleAddBlockUrl);
  document.getElementById("block-url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAddBlockUrl();
  });

  // 初期描画
  tasks = await loadTasks();
  renderAll();
  renderBlockUrls();
});
