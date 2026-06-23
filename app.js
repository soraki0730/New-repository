/* =========================================================
   app.js  ―  ロジック担当（A・B担当）
   ========================================================= */

let tasks    = [];
let tasksTab = 'day'; // 'day' | 'week' | 'month'
let navDate  = new Date();

// ====== 日付ユーティリティ ======

function dateToStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayDate() {
  return dateToStr(new Date());
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // 日曜始まり
  return d;
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

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function renderSummary() {
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

function renderAll() {
  renderList();
  renderSummary();
  if (document.getElementById('view-tasks').classList.contains('active')) {
    renderTasksContent();
  }
}

// ====== マイページ（日/週/月）======

function updatePeriodLabel() {
  const label = document.getElementById('tasks-period-label');
  if (!label) return;
  if (tasksTab === 'day') {
    label.textContent =
      `${navDate.getFullYear()}年${navDate.getMonth() + 1}月${navDate.getDate()}日`;
  } else if (tasksTab === 'week') {
    const start = new Date(navDate);
    start.setDate(navDate.getDate() - 2);
    const end = new Date(navDate);
    end.setDate(navDate.getDate() + 4);
    label.textContent =
      `${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
  } else {
    label.textContent = `${navDate.getFullYear()}年${navDate.getMonth() + 1}月`;
  }
}

function renderTasksContent() {
  updatePeriodLabel();
  if (tasksTab === 'day')       renderDayView();
  else if (tasksTab === 'week') renderWeekView();
  else                          renderMonthView();
}

function navigatePeriod(dir) {
  const d = new Date(navDate);
  if (tasksTab === 'day')       d.setDate(d.getDate() + dir);
  else if (tasksTab === 'week') d.setDate(d.getDate() + dir * 7);
  else                          d.setMonth(d.getMonth() + dir);
  navDate = d;
  renderTasksContent();
}

function jumpToDay(date) {
  navDate  = new Date(date);
  tasksTab = 'day';
  document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-day').classList.add('active');
  renderTasksContent();
}

function renderDayView() {
  const content = document.getElementById('tasks-content');
  if (!content) return;

  const dateStr  = dateToStr(navDate);
  const dayTasks = tasks
    .filter(t => t.date === dateStr)
    .sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  content.innerHTML = '';

  if (dayTasks.length === 0) {
    content.innerHTML = '<p class="period-empty">この日のタスクはありません</p>';
    return;
  }

  const list = document.createElement('div');
  list.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:10px;';

  dayTasks.forEach(task => {
    const card = document.createElement('div');
    card.className = `period-task-card${task.done ? ' is-done' : ''}`;

    const checkBtn = document.createElement('button');
    checkBtn.className = 'period-task-card__check';
    checkBtn.setAttribute('aria-label', task.done ? '完了を取り消す' : '完了にする');
    checkBtn.addEventListener('click', async () => {
      await toggleTask(task.id);
      renderAll();
    });

    const body = document.createElement('div');
    body.className = 'period-task-card__body';

    const titleEl = document.createElement('div');
    titleEl.className = 'period-task-card__title';
    titleEl.textContent = task.title;
    body.appendChild(titleEl);

    const meta = [task.category, formatTimeRange(task.startTime, task.endTime)]
      .filter(Boolean).join(' · ');
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'period-task-card__meta';
      metaEl.textContent = meta;
      body.appendChild(metaEl);
    }

    card.appendChild(checkBtn);
    card.appendChild(body);
    list.appendChild(card);
  });

  content.appendChild(list);
}

function renderWeekView() {
  const content = document.getElementById('tasks-content');
  if (!content) return;

  const weekStart = new Date(navDate);
  weekStart.setDate(navDate.getDate() - 2);
  const today = getTodayDate();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:16px;';

  const grid = document.createElement('div');
  grid.className = 'week-calendar-grid';

  for (let i = 0; i < 7; i++) {
    const d        = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr  = dateToStr(d);
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const isToday  = dateStr === today;

    const card = document.createElement('div');
    card.className = `week-day-card${isToday ? ' is-today' : ''}`;
    card.style.cursor = 'pointer';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'week-day-card__date';
    dateLabel.textContent = `${DAY_LABELS[d.getDay()]} ${d.getDate()}`;

    const taskList = document.createElement('div');
    taskList.className = 'week-day-card__tasks';

    if (dayTasks.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size:11px;color:var(--ink-soft);';
      empty.textContent = 'なし';
      taskList.appendChild(empty);
    } else {
      dayTasks.forEach(task => {
        const chip = document.createElement('span');
        chip.className = `calendar-task-chip${task.done ? ' is-done' : ''}`;
        chip.textContent = task.title;
        taskList.appendChild(chip);
      });
    }

    card.appendChild(dateLabel);
    card.appendChild(taskList);
    card.addEventListener('click', () => jumpToDay(d));
    grid.appendChild(card);
  }

  wrapper.appendChild(grid);
  content.innerHTML = '';
  content.appendChild(wrapper);
}

function renderMonthView() {
  const content = document.getElementById('tasks-content');
  if (!content) return;

  const year  = navDate.getFullYear();
  const month = navDate.getMonth();
  const today = getTodayDate();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding:16px;';

  const cal = document.createElement('div');
  cal.className = 'month-calendar';

  const weekdayRow = document.createElement('div');
  weekdayRow.className = 'month-calendar__weekdays';
  DAY_LABELS.forEach(d => {
    const span = document.createElement('span');
    span.className = 'month-calendar__weekday';
    span.textContent = d;
    weekdayRow.appendChild(span);
  });

  const grid = document.createElement('div');
  grid.className = 'month-calendar__grid';

  const firstDay  = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  for (let i = 0; i < 42; i++) {
    const d        = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr  = dateToStr(d);
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const isOutside = d.getMonth() !== month;
    const isToday   = dateStr === today;

    const cell = document.createElement('div');
    cell.className = [
      'month-calendar__day',
      isOutside ? 'is-outside' : '',
      isToday   ? 'is-today'   : '',
    ].filter(Boolean).join(' ');
    cell.style.cursor = 'pointer';

    const dateLabel = document.createElement('div');
    dateLabel.className = 'month-calendar__date';
    dateLabel.textContent = d.getDate();
    cell.appendChild(dateLabel);

    dayTasks.slice(0, 2).forEach(task => {
      const chip = document.createElement('span');
      chip.className = `calendar-task-chip${task.done ? ' is-done' : ''}`;
      chip.textContent = task.title;
      cell.appendChild(chip);
    });

    if (dayTasks.length > 2) {
      const more = document.createElement('span');
      more.className = 'calendar-task-chip';
      more.style.cssText = 'color:var(--ink-soft);background:transparent;font-size:10px;padding:0 6px;';
      more.textContent = `+${dayTasks.length - 2}件`;
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => jumpToDay(d));
    grid.appendChild(cell);
  }

  cal.appendChild(weekdayRow);
  cal.appendChild(grid);
  wrapper.appendChild(cal);
  content.innerHTML = '';
  content.appendChild(wrapper);
}

// ====== モーダル ======

function openModal(defaultDate) {
  els.taskDate.value = defaultDate || getTodayDate();
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

  if (viewName === "tasks") renderTasksContent();
}

// ====== 設定タブ UI ======

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
  els.taskDate          = document.getElementById("task-date");
  els.taskStartTime     = document.getElementById("task-start-time");
  els.taskEndTime       = document.getElementById("task-end-time");
  els.blockUrlList      = document.getElementById("block-url-list");
  els.blockUrlInput     = document.getElementById("block-url-input");

  // カテゴリチップ（再クリックで解除）
  document.querySelectorAll(".category-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const wasSelected = chip.classList.contains("selected");
      document.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("selected"));
      if (!wasSelected) chip.classList.add("selected");
    });
  });

  // タスク追加
  document.getElementById("add-btn").addEventListener("click", () => openModal());
  document.getElementById("add-btn-tasks").addEventListener("click", () => openModal(dateToStr(navDate)));
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-submit").addEventListener("click", handleAdd);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  handleAdd();
    if (e.key === "Escape") closeModal();
  });

  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeModal();
  });

  // ボトムナビゲーション
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // マイページ タブ切替
  document.getElementById("tab-day").addEventListener("click", () => {
    tasksTab = 'day';
    document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-day').classList.add('active');
    renderTasksContent();
  });
  document.getElementById("tab-week").addEventListener("click", () => {
    tasksTab = 'week';
    document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-week').classList.add('active');
    renderTasksContent();
  });
  document.getElementById("tab-month").addEventListener("click", () => {
    tasksTab = 'month';
    document.querySelectorAll('#view-tasks .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-month').classList.add('active');
    renderTasksContent();
  });

  // 期間ナビゲーション矢印
  document.getElementById("tasks-prev").addEventListener("click", () => navigatePeriod(-1));
  document.getElementById("tasks-next").addEventListener("click", () => navigatePeriod(+1));

  // フォーカスバナー → 設定画面
  document.querySelectorAll(".focus-banner").forEach((el) => {
    el.addEventListener("click", () => switchView("settings"));
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
