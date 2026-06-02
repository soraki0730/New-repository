let tasks = [];

// ページ読み込み時に保存済みタスクを取得
document.addEventListener("DOMContentLoaded", () => {
  tasks = loadTasks();
  renderTasks();
});

// タスク追加
function addTask(title) {
  if (title.trim() === "") {
    alert("タスクを入力してください");
    return;
  }

  const task = {
    id: Date.now(),
    title: title,
    completed: false,
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
      return {
        ...task,
        completed: !task.completed,
        updatedAt: new Date().toLocaleString(),
      };
    }
    return task;
  });

  saveTasks(tasks);
  renderTasks();
}

// タスク削除
function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);

  saveTasks(tasks);
  renderTasks();
}

// タスク一覧を返す
function getTasks() {
  return tasks;
}

// 進捗計算
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

// 勉強中フラグ切り替え
function toggleStudying(id) {
  tasks = tasks.map((task) => {
    if (task.id === id) {
      return {
        ...task,
        studying: !task.studying,
        updatedAt: new Date().toLocaleString(),
      };
    }
    return task;
  });

  saveTasks(tasks);
  renderTasks();
}
