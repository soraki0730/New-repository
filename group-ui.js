/* =========================================================
   group-ui.js  ―  グループ機能UI担当
   Firebase処理は別担当が実装するため、スタブ関数で仮置き
   ========================================================= */

// ===== ダミーデータ（Firebase実装前の仮データ） =====
const DUMMY_GROUP = {
  id: 'group-abc123',
  name: '水曜勉強会',
  type: 'mild', // mild | focus | joint
};

const DUMMY_MEMBERS = [
  {
    uid: 'me',
    displayName: '自分',
    todayProgress: 75,
    completedCount: 3,
    totalCount: 4,
    isStudying: true,
    updatedAt: Date.now() - 5 * 60 * 1000,
    isSelf: true,
  },
  {
    uid: 'uid-riku',
    displayName: 'Riku',
    todayProgress: 100,
    completedCount: 5,
    totalCount: 5,
    isStudying: false,
    updatedAt: Date.now() - 20 * 60 * 1000,
    isSelf: false,
  },
  {
    uid: 'uid-saki',
    displayName: 'Saki',
    todayProgress: 40,
    completedCount: 2,
    totalCount: 5,
    isStudying: true,
    updatedAt: Date.now() - 2 * 60 * 1000,
    isSelf: false,
  },
  {
    uid: 'uid-yuto',
    displayName: 'Yuto',
    todayProgress: 0,
    completedCount: 0,
    totalCount: 3,
    isStudying: false,
    updatedAt: Date.now() - 60 * 60 * 1000,
    isSelf: false,
  },
];

const DUMMY_ACTIVITIES = [
  { uid: 'uid-saki', displayName: 'Saki', type: 'study_start', time: Date.now() - 2 * 60 * 1000 },
  { uid: 'uid-riku', displayName: 'Riku', type: 'task_done', taskName: 'プログラミング応用', time: Date.now() - 15 * 60 * 1000 },
  { uid: 'uid-yuto', displayName: 'Yuto', type: 'reaction', emoji: '👏', targetName: 'Riku', time: Date.now() - 18 * 60 * 1000 },
  { uid: 'me', displayName: '自分', type: 'study_end', time: Date.now() - 30 * 60 * 1000 },
];

// ===== グループ設定デフォルト値 =====
let groupSettings = {
  shareLevel: 'progress',   // progress | category | detail
  notifyLevel: 'normal',    // low | normal | high
  releaseRule: 'free',      // free | reason | approval
  allowEmergency: true,
};

// ===== Firebase スタブ関数（別担当が実装） =====
async function fetchGroupData(groupId) {
  // TODO: Firebase実装
  return DUMMY_GROUP;
}

async function fetchGroupMembers(groupId) {
  // TODO: Firebase実装
  return DUMMY_MEMBERS;
}

async function createGroup(name, type) {
  // TODO: Firebase実装
  console.log('[Group] createGroup:', name, type);
  return { id: 'new-group-' + Date.now(), name, type };
}

async function joinGroup(groupId) {
  // TODO: Firebase実装
  console.log('[Group] joinGroup:', groupId);
  return true;
}

async function sendReaction(targetUid, emoji) {
  // TODO: Firebase実装
  console.log('[Group] sendReaction:', targetUid, emoji);
}

async function saveGroupSettings(settings) {
  // TODO: Firebase実装
  console.log('[Group] saveGroupSettings:', settings);
}

// ===== ユーティリティ =====
function formatRelative(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

function groupTypeLabel(type) {
  return { mild: 'ゆるい自習', focus: '強制集中', joint: '共同課題' }[type] || type;
}

function activityText(act) {
  switch (act.type) {
    case 'study_start': return `${act.displayName}さんが学習を開始しました`;
    case 'study_end':   return `${act.displayName}さんが学習を終了しました`;
    case 'task_done':   return `${act.displayName}さんが「${act.taskName}」を完了しました`;
    case 'release_req': return `${act.displayName}さんがstudyModeの解除を申請しました`;
    case 'reaction':    return `${act.displayName}さんが${act.targetName}さんに${act.emoji}を送りました`;
    default:            return `${act.displayName}さんがアクティビティを更新しました`;
  }
}

// ===== パネル切替 =====
function showGroupPanel(panelId) {
  ['group-panel-home', 'group-panel-setup', 'group-panel-settings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = (id !== panelId);
  });
}

// ===== グループホーム描画 =====
function renderGroupHome(group, members, activities) {
  // ヘッダー
  const nameEl = document.getElementById('group-name');
  const typeEl = document.getElementById('group-type-badge');
  if (nameEl) nameEl.textContent = group.name;
  if (typeEl) typeEl.textContent = groupTypeLabel(group.type);

  // メンバーリスト
  renderMemberCards(members);

  // アクティビティ
  renderActivityFeed(activities);
}

function renderMemberCards(members) {
  const list = document.getElementById('group-member-list');
  if (!list) return;
  list.innerHTML = '';

  members.forEach(m => {
    const card = document.createElement('div');
    card.className = 'group-member-card' + (m.isSelf ? ' group-member-card--self' : '');

    card.innerHTML = `
      <div class="group-member-card__top">
        <div class="group-member-card__avatar">${m.displayName.slice(0, 1)}</div>
        <div class="group-member-card__info">
          <div class="group-member-card__name">
            ${m.displayName}
            ${m.isSelf ? '<span class="group-badge group-badge--self">自分</span>' : ''}
            ${m.isStudying ? '<span class="group-badge group-badge--studying">学習中</span>' : ''}
          </div>
          <div class="group-member-card__meta">
            ${m.completedCount} / ${m.totalCount} タスク完了 &nbsp;·&nbsp; ${formatRelative(m.updatedAt)}
          </div>
        </div>
        <div class="group-member-card__pct">${m.todayProgress}%</div>
      </div>
      <div class="group-progress-track">
        <div class="group-progress-bar" style="width:${m.todayProgress}%"></div>
      </div>
      ${m.isSelf ? '' : `
      <div class="group-reactions">
        ${['👏', '🔥', '👍'].map(e =>
          `<button class="reaction-btn" data-uid="${m.uid}" data-emoji="${e}">${e}</button>`
        ).join('')}
      </div>`}
    `;

    list.appendChild(card);
  });

  // リアクションボタンのイベント
  list.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sendReaction(btn.dataset.uid, btn.dataset.emoji);
      btn.classList.add('reaction-btn--sent');
      setTimeout(() => btn.classList.remove('reaction-btn--sent'), 1500);
    });
  });
}

function renderActivityFeed(activities) {
  const feed = document.getElementById('group-activity-feed');
  if (!feed) return;
  feed.innerHTML = '';

  activities.forEach(act => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <span class="activity-item__dot"></span>
      <span class="activity-item__text">${activityText(act)}</span>
      <span class="activity-item__time">${formatRelative(act.time)}</span>
    `;
    feed.appendChild(item);
  });
}

// ===== グループ作成・参加パネル =====
function initGroupSetupPanel() {
  const tabs = document.querySelectorAll('.group-setup-tab');
  const createPanel = document.getElementById('group-create-form');
  const joinPanel   = document.getElementById('group-join-form');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      if (createPanel) createPanel.hidden = (target !== 'create');
      if (joinPanel)   joinPanel.hidden   = (target !== 'join');
    });
  });

  // 作成ボタン
  const createBtn = document.getElementById('group-create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = document.getElementById('group-name-input')?.value.trim();
      const type = document.querySelector('input[name="group-type"]:checked')?.value || 'mild';
      if (!name) { alert('グループ名を入力してください'); return; }
      createBtn.disabled = true;
      createBtn.textContent = '作成中…';
      await createGroup(name, type);
      createBtn.disabled = false;
      createBtn.textContent = 'グループを作成';
      showGroupPanel('group-panel-home');
      renderGroupHome(DUMMY_GROUP, DUMMY_MEMBERS, DUMMY_ACTIVITIES);
    });
  }

  // 参加ボタン
  const joinBtn = document.getElementById('group-join-btn');
  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      const gid = document.getElementById('group-id-input')?.value.trim();
      if (!gid) { alert('グループIDを入力してください'); return; }
      joinBtn.disabled = true;
      joinBtn.textContent = '参加中…';
      await joinGroup(gid);
      joinBtn.disabled = false;
      joinBtn.textContent = 'グループに参加';
      showGroupPanel('group-panel-home');
      renderGroupHome(DUMMY_GROUP, DUMMY_MEMBERS, DUMMY_ACTIVITIES);
    });
  }
}

// ===== グループ設定パネル =====
function initGroupSettingsPanel() {
  const saveBtn = document.getElementById('group-settings-save');
  if (!saveBtn) return;

  // 現在値を反映
  const shareRadio = document.querySelector(`input[name="share-level"][value="${groupSettings.shareLevel}"]`);
  if (shareRadio) shareRadio.checked = true;
  const notifyRadio = document.querySelector(`input[name="notify-level"][value="${groupSettings.notifyLevel}"]`);
  if (notifyRadio) notifyRadio.checked = true;
  const releaseRadio = document.querySelector(`input[name="release-rule"][value="${groupSettings.releaseRule}"]`);
  if (releaseRadio) releaseRadio.checked = true;
  const emergencyToggle = document.getElementById('allow-emergency');
  if (emergencyToggle) emergencyToggle.checked = groupSettings.allowEmergency;

  saveBtn.addEventListener('click', async () => {
    groupSettings = {
      shareLevel:     document.querySelector('input[name="share-level"]:checked')?.value || 'progress',
      notifyLevel:    document.querySelector('input[name="notify-level"]:checked')?.value || 'normal',
      releaseRule:    document.querySelector('input[name="release-rule"]:checked')?.value || 'free',
      allowEmergency: document.getElementById('allow-emergency')?.checked ?? true,
    };
    await saveGroupSettings(groupSettings);
    saveBtn.textContent = '保存しました！';
    setTimeout(() => { saveBtn.textContent = '設定を保存'; }, 1500);
  });
}

// ===== ボタン類の初期化 =====
function initGroupButtons() {
  // ホームの設定ボタン
  document.getElementById('group-settings-btn')?.addEventListener('click', () => {
    showGroupPanel('group-panel-settings');
  });

  // 設定の戻るボタン
  document.getElementById('group-settings-back')?.addEventListener('click', () => {
    showGroupPanel('group-panel-home');
  });

  // セットアップの戻るボタン（グループ参加済みの場合）
  document.getElementById('group-setup-back')?.addEventListener('click', () => {
    showGroupPanel('group-panel-home');
  });

  // ホームの「グループ作成・参加」ボタン
  document.getElementById('group-join-or-create-btn')?.addEventListener('click', () => {
    showGroupPanel('group-panel-setup');
  });
}

// ===== エントリポイント =====
function initGroupUI() {
  initGroupButtons();
  initGroupSetupPanel();
  initGroupSettingsPanel();

  // ダミーデータでホームを描画
  renderGroupHome(DUMMY_GROUP, DUMMY_MEMBERS, DUMMY_ACTIVITIES);
}

document.addEventListener('DOMContentLoaded', initGroupUI);
