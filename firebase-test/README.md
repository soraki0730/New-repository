# Firebase 単体接続テスト

目的: Firebase Authentication（匿名ログイン）と Firestore の単独通信（読み書き・リアルタイム取得）をブラウザ上で確認するためのテストページです。既存コードや拡張本体は変更しません。

動作概要:
- 匿名ログイン（`signInAnonymously()`）を実行し、ログイン後に `uid` を画面に表示します。
- 画面でタスク名を入力して「Firestoreに追加」ボタンを押すと `users/{uid}/tasks/{自動ID}` にデータを保存します。
- 保存するフィールド:
  - `id` (自動生成IDをフィールドにも保存)
  - `title`
  - `completed`: `false`
  - `progress`: `0`
  - `createdAt`: `serverTimestamp()`
  - `updatedAt`: `serverTimestamp()`
- `onSnapshot()` で `users/{uid}/tasks` をリアルタイム監視し、一覧表示します。
- エラーは console と画面の両方に表示されます。

ファイル:
- `test.html` — テスト用 UI（UID表示、入力欄、ボタン、タスクリスト）
- `test.js` — CDN の Firebase ESM を用いて初期化・認証・Firestore 操作を行うスクリプト

実行方法 (必ず HTTP サーバで提供すること):
- VS Code の Live Server 拡張を使って `firebase-test/` を開く。Live Server 起動後、例: `http://127.0.0.1:5500/firebase-test/test.html`
- またはルートで簡易 HTTP サーバを起動してアクセスする例:

```bash
# Python の簡易サーバ (ポート8000)
python -m http.server 8000

# あるいは npm の http-server を使う
npx http-server -p 8000
```

その後ブラウザで `http://127.0.0.1:8000/firebase-test/test.html` にアクセスします。

設定について:
- スクリプトはまず `../firebaseConfig.js` のモジュールインポートを試み、失敗した場合は同ファイルを fetch して `firebaseConfig` オブジェクトを抽出して `initializeApp()` を呼びます。ルートの `firebaseConfig.js` に `const firebaseConfig = { ... };` が含まれていれば利用できます。

注意事項:
- `test.js` は CDN（https://www.gstatic.com/firebasejs/*）の ESM を利用します。`file://` で直接開くと動作しないため、必ず HTTP 経由で開いてください。
- CDN の利用は「単独テスト限定」です。Manifest V3 の Chrome 拡張本体では外部 CDN のスクリプト実行制約があるため、拡張本体に組み込む際は `npm install firebase` → `esbuild` 等でバンドルして利用してください。

次のステップ（オプション）:
- 実際の接続を試すには、ルートの `firebaseConfig.js` に正しい Firebase 設定が入っていることを確認してください。
- 拡張本体に統合する場合は `npm install firebase` して `esbuild` 等で `firebase` をバンドルする手順を実行します。
