/* =========================================================
   popup.js  ―  B：ロジック担当
   ---------------------------------------------------------
   契約（名前は勝手に変えない）：
     addTask(title)    → Promise<Task[]>
     toggleTask(id)    → Promise<Task[]>
     deleteTask(id)    → Promise<Task[]>
     getTasks()        → Task[]        ※同期。今メモリにある配列を返すだけ
   No.2 のために追加した関数（基本6契約のリネームではなく追加）：
     setProgress(id, percent) → Promise<Task[]>

   ルール：
   - mutation 系（add/toggle/delete/setProgress）は中で saveTasks まで呼び、更新後の配列を返す
   - 書き込みはこの4関数の中だけ。getTasks は読むだけ・保存しない
   - これで「保存タイミング」が1か所に集約され、状態とストレージがズレない
   ========================================================= */

// ---- メモリ上の唯一の正 ----
let tasks = [];
let studyMode = false;

/* Task スキーマ（チーム合意）
   { id, title, done, progress, createdAt, updatedAt }
     progress : 0–100 の整数。done と同期（progress=100 ⇔ done=true）
     createdAt / updatedAt : No.3「最終更新時間」で使う土台。今は記録のみ */
function makeTask(taskData) {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    title: taskData.title.trim(),
    memo: taskData.memo || "",
    date: taskData.date || "",
    priority: taskData.priority || "normal",
    done: false,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ====== ロジック（契約関数）======

async function addTask(taskData) {
  const title = (taskData.title || "").trim();

  if (!title) return tasks;

  tasks.push(makeTask(taskData));
  await saveTasks(tasks);
  return tasks;
}

async function toggleTask(id) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  task.done = !task.done;
  task.progress = task.done ? 100 : 0; // チェック=100% / 外す=0%
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  return tasks;
}

async function setProgress(id, percent) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  task.progress = p;
  task.done = p >= 100; // 100%なら完了扱い（％と完了を同期）
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

// 進捗計算：完了数 / 全体数（STEP1 の ◯/◯ 表示用）
function getProgressSummary() {
  const total = tasks.length;
  const done = tasks.filter((x) => x.done).length;
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, ratio };
}

/* =========================================================
   ここから下：画面描画と操作の配線
   （A の markup / CSS を、データから組み立てて反映する係）
   ========================================================= */

const els = {};
let seen = new Set(); // 既に表示済みの id。新規行だけ登場アニメさせるため

let currentCalendarDate = new Date();

function renderSummary() {
  const { done, total, ratio } = getProgressSummary();
  els.count.textContent = `${done} / ${total}`;
  els.bar.style.width = `${ratio}%`;
  els.empty.hidden = total !== 0;
}

function renderList() {
  els.list.innerHTML = "";
  const current = getTasks();
  const prevSeen = seen;
  seen = new Set();
  let newIdx = 0;

  current.forEach((task) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;
    node.classList.toggle("is-done", task.done);

    // 初登場の行だけ stagger 付きで登場（再描画のたびにチラつかせない）
    if (!prevSeen.has(task.id)) {
      node.classList.add("enter");
      node.style.setProperty("--i", newIdx++);
    }
    seen.add(task.id);

    const check = node.querySelector(".task__check");
    const title = node.querySelector(".task__title");
    const range = node.querySelector(".task__range");
    const pct = node.querySelector(".task__pct");
    const del = node.querySelector(".task__delete");

    check.checked = task.done;
    title.textContent = task.title;
    range.value = task.progress;
    range.style.setProperty("--fill", `${task.progress}%`);
    pct.textContent = `${task.progress}%`;

    // 完了チェック（方式1）
    check.addEventListener("change", async () => {
      await toggleTask(task.id);
      renderAll();
    });

    // ％スライダー（方式2）：ドラッグ中は表示だけ即時更新、放したら保存
    range.addEventListener("input", () => {
      pct.textContent = `${range.value}%`;
      range.style.setProperty("--fill", `${range.value}%`);
    });
    range.addEventListener("change", async () => {
      await setProgress(task.id, Number(range.value));
      renderAll();
    });

    // 削除（フェードを見せてから消す）
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
function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  els.calendarTitle.textContent = `${year}年${month + 1}月`;
  els.calendarGrid.innerHTML = "";

  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const dateText = formatDate(date);
    const dayTasks = tasks.filter((task) => task.date === dateText);

    const day = document.createElement("div");
    day.className = "calendar__day";

    if (date.getMonth() !== month) {
      day.classList.add("is-outside");
    }

    const dateLabel = document.createElement("span");
    dateLabel.className = "calendar__date";
    dateLabel.textContent = date.getDate();

    const taskBox = document.createElement("div");
    taskBox.className = "calendar__tasks";

    dayTasks.forEach((task) => {
      const taskItem = document.createElement("span");
      taskItem.className = "calendar__task";
      taskItem.textContent = task.title;

      if (task.priority === "high") {
        taskItem.classList.add("is-high");
      }

      if (task.priority === "low") {
        taskItem.classList.add("is-low");
      }

      if (task.done) {
        taskItem.classList.add("is-done");
      }

      taskBox.appendChild(taskItem);
    });

    day.appendChild(dateLabel);
    day.appendChild(taskBox);
    els.calendarGrid.appendChild(day);
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function renderAll() {
  renderList();
  renderSummary();
  renderCalendar();
}

// 追加：Enter / ＋ボタンで詳細設定画面を開く
function openTaskDetail() {
  const inputValue = els.input.value.trim();

  els.detailTitle.value = inputValue;
  els.detailMemo.value = "";
  els.detailDate.value = "";
  els.detailPriority.value = "normal";

  els.detailModal.hidden = false;
  els.detailTitle.focus();
}

function closeTaskDetail() {
  els.detailModal.hidden = true;
}

// 詳細設定画面の「追加」ボタンを押したとき
async function handleDetailAdd() {
  const title = els.detailTitle.value.trim();

  if (!title) {
    els.detailTitle.focus();
    return;
  }

  await addTask({
    title: title,
    memo: els.detailMemo.value.trim(),
    date: els.detailDate.value,
    priority: els.detailPriority.value,
  });

  els.input.value = "";
  closeTaskDetail();
  renderAll();
  els.input.focus();
}

function renderStudyMode() {
  els.studyToggle.checked = studyMode;
}

async function setStudyMode(enabled) {
  studyMode = enabled;
  await saveStudyMode(enabled);
  renderStudyMode();
}

document.addEventListener("DOMContentLoaded", async () => {
  els.input = document.getElementById("task-input");
  els.addBtn = document.getElementById("add-btn");
  els.list = document.getElementById("task-list");
  els.template = document.getElementById("task-item");
  els.count = document.getElementById("progress-count");
  els.bar = document.getElementById("progress-bar");
  els.empty = document.getElementById("empty-state");

  els.calendarTitle = document.getElementById("calendar-title");
  els.calendarGrid = document.getElementById("calendar-grid");
  els.prevMonthBtn = document.getElementById("prev-month-btn");
  els.nextMonthBtn = document.getElementById("next-month-btn");

  // 詳細設定画面の要素を取得
  els.detailModal = document.getElementById("task-detail-modal");
  els.detailTitle = document.getElementById("detail-title");
  els.detailMemo = document.getElementById("detail-memo");
  els.detailDate = document.getElementById("detail-date");
  els.detailPriority = document.getElementById("detail-priority");
  els.detailCloseBtn = document.getElementById("detail-close-btn");
  els.detailCancelBtn = document.getElementById("detail-cancel-btn");
  els.detailAddBtn = document.getElementById("detail-add-btn");

  els.prevMonthBtn.addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
  });

  els.nextMonthBtn.addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
  });

  // ＋ボタンを押したら、即追加ではなく詳細画面を開く
  els.addBtn.addEventListener("click", openTaskDetail);

  // Enterでも詳細画面を開く
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openTaskDetail();
  });

  // 詳細画面のボタン
  els.detailCloseBtn.addEventListener("click", closeTaskDetail);
  els.detailCancelBtn.addEventListener("click", closeTaskDetail);
  els.detailAddBtn.addEventListener("click", handleDetailAdd);

  els.studyToggle = document.getElementById("study-mode-toggle");
  els.studyToggle.addEventListener("change", async () => {
    await setStudyMode(els.studyToggle.checked);
  });

  tasks = await loadTasks();
  studyMode = await loadStudyMode();
  renderAll();
  renderStudyMode();
  els.input.focus();
});
