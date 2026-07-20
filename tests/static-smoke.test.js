const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('app.htmlから参照するローカルスクリプトが存在する', () => {
  const html = read('app.html');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0);
  scripts.forEach((script) => {
    assert.ok(fs.existsSync(path.join(root, script)), `${script} が存在しません`);
  });
});

test('現行グループUIに固定ダミー実装が残っていない', () => {
  const source = `${read('group-ui.js')}\n${read('group-room-ui.js')}`;
  ['DUMMY_', '（ダミー）', 'TODO: Firebase実装', 'スタブ関数'].forEach((marker) => {
    assert.equal(source.includes(marker), false, `${marker} が残っています`);
  });
});

test('グループ部屋の実データAPIがFirebaseバンドル元から公開される', () => {
  const source = read('src/firebase-entry.js');
  [
    'subscribeGroup',
    'subscribeGroupMembers',
    'updateGroupSettings',
    'subscribeGroupActivities',
    'subscribeUnlockRequests',
    'approveUnlockRequest',
    'rejectUnlockRequest',
    'subscribeEmergencyUnlockHistory',
    'subscribeSettings',
    'upsertSettings',
  ].forEach((api) => assert.ok(source.includes(api), `${api} が公開されていません`));
});

test('グループ画面に申請・緊急解除・活動フィードの描画先がある', () => {
  const html = read('app.html');
  ['gr-unlock-list', 'gr-emergency-list', 'group-activity-feed', 'group-member-list'].forEach((id) => {
    assert.ok(html.includes(`id="${id}"`), `${id} がありません`);
  });
});

test('ポップアップのOFF操作にもグループ解除ルールが適用される', () => {
  const source = read('popup-entry.js');
  assert.ok(source.includes('studyGroupSettings'));
  assert.ok(source.includes("settings.unlockRule !== 'free'"));
});

test('Firestoreルールがグループの実データを保護する', () => {
  const rules = read('firestore.rules');
  ['match /members/{uid}', 'match /unlockRequests/{requestId}', 'match /unlockHistory/{historyId}', 'match /activities/{activityId}'].forEach((rule) => {
    assert.ok(rules.includes(rule), `${rule} がありません`);
  });
  assert.ok(rules.includes("resource.data.requesterUid != request.auth.uid"));
});

test('FirestoreルールをFirebase CLIからデプロイできる', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.equal(config.firestore.rules, 'firestore.rules');
  const projects = JSON.parse(read('.firebaserc'));
  assert.equal(projects.projects.default, 'shibafu-3cc52');
});
