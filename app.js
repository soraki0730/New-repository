/* =========================================================
   app.js  ―  B：ロジック担当
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

/* Task スキーマ（チーム合意）
   { id, title, done, progress, createdAt, updatedAt }
     progress : 0–100 の整数。done と同期（progress=100 ⇔ done=true）
     createdAt / updatedAt : No.3「最終更新時間」で使う土台。今は記録のみ */
function makeTask(title) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// ====== ロジック（契約関数）======

async function addTask(title) {
  const t = (title || "").trim();
  if (!t) return tasks;                 // 空タイトルは無視
  tasks.push(makeTask(t));
  await saveTasks(tasks);
  return tasks;
}

async function toggleTask(id) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  task.done = !task.done;
  task.progress = task.done ? 100 : 0;  // チェック=100% / 外す=0%
  task.updatedAt = Date.now();
  await saveTasks(tasks);
  return tasks;
}

async function setProgress(id, percent) {
  const task = tasks.find((x) => x.id === id);
  if (!task) return tasks;
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  task.progress = p;
  task.done = p >= 100;                 // 100%なら完了扱い（％と完了を同期）
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

function renderAll() {
  renderList();
  renderSummary();
}

// 追加：Enter / ＋ボタン 共通。連続入力しやすいよう即フォーカスを戻す
async function handleAdd() {
  const value = els.input.value;
  if (!value.trim()) {
    els.input.focus();
    return;
  }
  await addTask(value);
  els.input.value = "";
  els.input.focus();
  renderAll();
}

document.addEventListener("DOMContentLoaded", async () => {
  els.input = document.getElementById("task-input");
  els.addBtn = document.getElementById("add-btn");
  els.list = document.getElementById("task-list");
  els.template = document.getElementById("task-item");
  els.count = document.getElementById("progress-count");
  els.bar = document.getElementById("progress-bar");
  els.empty = document.getElementById("empty-state");

  els.addBtn.addEventListener("click", handleAdd);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAdd(); // Enter で追加
  });

  tasks = await loadTasks(); // 起動時に1回だけ読む
  renderAll();
  els.input.focus(); // 開いたら即入力できる
});