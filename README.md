# 今日のタスク（STEP1）

学習タスク管理アプリ。今スプリントのスコープはバックログ **No.1（追加・削除）** と **No.2（進捗：％ or 完了）**。

## 動かし方
- ローカル確認：`index.html` をダブルクリックで開くだけ（script tag 方式なので `file://` でも動く）
- 公開：この `project/` フォルダをそのまま Vercel に上げれば動く
- データは各ブラウザの localStorage に保存される（キー：`studytask.v1`）

## ファイルと役割（触る場所が被らない＝コンフリクトしない）
| ファイル | 担当 | 役割 |
|---|---|---|
| `index.html` / `style.css` | A | 入力欄・ボタン・一覧の見た目、1行のテンプレート |
| `app.js` | B | ロジック（契約関数）＋進捗計算＋描画の配線 |
| `storage.js` | C | localStorage の保存・読込（保存方式を知るのはここだけ） |

## 関数の約束（名前を勝手に変えない）
```
addTask(title)          → Promise<Task[]>
toggleTask(id)          → Promise<Task[]>
deleteTask(id)          → Promise<Task[]>
getTasks()              → Task[]   // 同期。今メモリにある配列を返すだけ
saveTasks(tasks)        → Promise<void>
loadTasks()             → Promise<Task[]>
setProgress(id, percent)→ Promise<Task[]>  // No.2用に追加（基本6つはそのまま）
```

### ルール（ここがズレるとバグる）
1. **保存方式を知るのは `storage.js` だけ。** 将来 chrome.storage / API に差し替えても他は無変更で済むよう、`save/loadTasks` は最初から `async`。
2. **書き込みは add / toggle / delete / setProgress の中だけ。** それぞれ中で `saveTasks` まで呼び、更新後の配列を返す。`getTasks` は読むだけ・保存しない。これで状態とストレージがズレない。
3. **Task の形（チーム合意）**
   ```ts
   type Task = {
     id: string;        // crypto.randomUUID()
     title: string;
     done: boolean;
     progress: number;  // 0–100。done と同期（100 ⇔ done=true）
     createdAt: number; // Date.now()
     updatedAt: number; // 更新のたびに更新（No.3 最終更新時間の土台）
   };
   ```

## スコープ外（次スプリント）
- No.3 最終更新時間の**表示**（`updatedAt` は今から記録済み）
- No.4 勉強中フラグ
- No.10〜 拡張機能連携（chrome.storage 共有など）

## UXの肝（No.1の最重要要件）
タイトルのみで登録／Enterで即追加／追加後すぐ入力欄に再フォーカス／開いたら自動フォーカス。
