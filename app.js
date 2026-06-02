let tasks = [];

document.addEventListener("DOMContentLoaded", () => {
  tasks = loadTasks();
  renderTasks();

  const taskInput = document.getElementById("task-input");
  const addBtn = document.getElementById("add-btn");

  addBtn.addEventListener("click", () => {
    addTask(taskInput.value);
    taskInput.value = "";
    taskInput.focus();
  });

  taskInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addTask(taskInput.value);
      taskInput.value = "";
      taskInput.focus();
    }
  });
});

// タスク追加
function addTask(title) {
  const trimmedTitle = title.trim();

  if (trimmedTitle === "") {
    alert("タスクを入力してください");
    return;
  }

  const task = {
    id: Date.now(),
    title: trimmedTitle,
    completed: false,
    progress: 0,
    studying: false,
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString(),
  };

  tasks.push(task);
  saveTasks(tasks);
  renderTasks();
}

// 完了チェック切り替え
function toggleTask(id) {
  tasks = tasks.map((task) => {
    if (task.id === id) {
      const newCompleted = !task.completed;

      return {
        ...task,
        completed: newCompleted,
        progress: newCompleted ? 100 : task.progress,
        updatedAt: new Date().toLocaleString(),
      };
    }

    return task;
  });

  saveTasks(tasks);
  renderTasks();
}

// 削除
function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);

  saveTasks(tasks);
  renderTasks();
}

// 進捗バー変更
function updateTaskProgress(id, progress) {
  const progressNumber = Number(progress);

  tasks = tasks.map((task) => {
    if (task.id === id) {
      return {
        ...task,
        progress: progressNumber,
        completed: progressNumber === 100,
        updatedAt: new Date().toLocaleString(),
      };
    }

    return task;
  });

  saveTasks(tasks);
  renderTasks();
}

// タスク一覧を返す
function getTasks() {
  return tasks;
}

// 全体進捗計算
function getProgress() {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;

  if (total === 0) {
    return {
      completed: 0,
      total: 0,
      percent: 0,
    };
  }

  return {
    completed: completed,
    total: total,
    percent: Math.round((completed / total) * 100),
  };
}

// 画面表示
function renderTasks() {
  const taskList = document.getElementById("task-list");
  const template = document.getElementById("task-item");
  const emptyState = document.getElementById("empty-state");
  const progressCount = document.getElementById("progress-count");
  const progressBar = document.getElementById("progress-bar");

  taskList.innerHTML = "";

  emptyState.hidden = tasks.length !== 0;

  tasks.forEach((task) => {
    const clone = template.content.cloneNode(true);

    const li = clone.querySelector(".task");
    const checkbox = clone.querySelector(".task__check");
    const title = clone.querySelector(".task__title");
    const range = clone.querySelector(".task__range");
    const pct = clone.querySelector(".task__pct");
    const deleteBtn = clone.querySelector(".task__delete");

    li.dataset.id = task.id;

    title.textContent = task.title;

    checkbox.checked = task.completed;
    checkbox.addEventListener("change", () => {
      toggleTask(task.id);
    });

    range.value = task.progress ?? 0;
    pct.textContent = `${task.progress ?? 0}%`;

    range.addEventListener("input", () => {
      pct.textContent = `${range.value}%`;
    });

    range.addEventListener("change", () => {
      updateTaskProgress(task.id, range.value);
    });

    deleteBtn.addEventListener("click", () => {
      deleteTask(task.id);
    });

    if (task.completed) {
      li.classList.add("is-completed");
    }

    taskList.appendChild(clone);
  });

  const progress = getProgress();

  progressCount.textContent = `${progress.completed} / ${progress.total}`;
  progressBar.style.width = `${progress.percent}%`;
}
