/* =========================================================
   group-room-ui.js  ―  グループ部屋 UI
   ========================================================= */

(function () {
  // ====== ダミーデータ（解除申請・アクティビティ） ======

  const DUMMY_UNLOCK_REQUESTS = [
    {
      id: 'req-001',
      userName: '桂',
      reason: '課題でYouTubeの解説動画を見る必要があります',
      requestedAt: Date.now() - 8 * 60 * 1000,
    },
  ];

  const DUMMY_ACTIVITIES = [
    { id: 'act-1', time: '10:32', text: '田中さんがタスクを完了しました', type: 'task' },
    { id: 'act-2', time: '10:18', text: '桂さんがスタディモードを開始しました', type: 'study' },
    {
      id: 'act-3',
      time: '10:05',
      text: '佐藤さんが緊急解除しました',
      sub: '理由：授業で動画を見る必要があったため',
      type: 'emergency',
    },
    { id: 'act-4', time: '09:51', text: '田中さんがタスクを追加しました', type: 'task' },
  ];

  // ====== 状態 ======

  let _members = [];
  let _groupId = '';
  let _groupName = '';

  // ====== ユーティリティ ======

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : ts;
    const diff = Math.max(1, Math.round((Date.now() - ms) / 60000));
    if (diff < 60) return `${diff}分前`;
    const h = Math.round(diff / 60);
    if (h < 24) return `${h}時間前`;
    return `${Math.round(h / 24)}日前`;
  }

  function statusLabel(member) {
    if (member.totalCount === 0) return { text: '未設定', cls: 'status--idle' };
    if (member.todayProgress >= 100) return { text: '完了 🎉', cls: 'status--done' };
    if (member.todayProgress > 0) return { text: '学習中', cls: 'status--active' };
    return { text: '未着手', cls: 'status--idle' };
  }

  function progressColor(pct) {
    if (pct >= 100) return '#4caf50';
    if (pct >= 50) return '#2196f3';
    return '#ff9800';
  }

  // ====== 描画：ヘッダー ======

  function renderHeader() {
    const nameEl = document.getElementById('gr-group-name');
    const idEl = document.getElementById('gr-group-id');
    const countEl = document.getElementById('gr-member-count');

    const name = _groupName || _groupId || '未参加';
    if (nameEl) nameEl.textContent = name;
    if (idEl) idEl.textContent = _groupId ? `ID: ${_groupId}` : '';
    if (countEl) countEl.textContent = `${_members.length}人`;
  }

  // ====== 描画：メンバー一覧 ======

  function renderMembers() {
    const list = document.getElementById('gr-member-list');
    const empty = document.getElementById('gr-member-empty');
    if (!list) return;

    if (!_groupId) {
      if (empty) empty.hidden = false;
      list.innerHTML = '';
      return;
    }

    if (_members.length === 0) {
      if (empty) { empty.hidden = false; empty.textContent = 'メンバーがいません'; }
      list.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;
    list.innerHTML = '';

    _members.forEach((member) => {
      const pct = member.todayProgress || 0;
      const status = statusLabel(member);
      const card = document.createElement('div');
      card.className = 'gr-member-card';
      card.innerHTML = `
        <div class="gr-member-card__top">
          <div class="gr-member-card__left">
            <div class="gr-member-avatar">${(member.displayName || '?')[0]}</div>
            <div>
              <div class="gr-member-name">${member.displayName || '名前未設定'}</div>
              <span class="gr-status-badge ${status.cls}">${status.text}</span>
            </div>
          </div>
          <div class="gr-member-pct" style="color:${progressColor(pct)}">${pct}%</div>
        </div>
        <div class="gr-member-progress-track">
          <div class="gr-member-progress-bar" style="width:${pct}%;background:${progressColor(pct)}"></div>
        </div>
        <div class="gr-member-meta">
          ${member.completedCount || 0} / ${member.totalCount || 0} タスク完了
          <span class="gr-member-updated">${formatRelativeTime(member.updatedAt || member.lastActiveAt)}</span>
        </div>
      `;
      list.appendChild(card);
    });
  }

  // ====== 描画：解除申請 ======

  function renderUnlockRequests() {
    const section = document.getElementById('gr-unlock-section');
    const list = document.getElementById('gr-unlock-list');
    const badge = document.getElementById('gr-unlock-badge');
    if (!list) return;

    const requests = _groupId ? DUMMY_UNLOCK_REQUESTS : [];

    if (badge) badge.textContent = requests.length > 0 ? requests.length : '';
    if (badge) badge.hidden = requests.length === 0;

    if (requests.length === 0) {
      list.innerHTML = '<p class="gr-empty-note">現在、解除申請はありません</p>';
      return;
    }

    list.innerHTML = '';
    requests.forEach((req) => {
      const card = document.createElement('div');
      card.className = 'gr-unlock-card';
      card.innerHTML = `
        <div class="gr-unlock-card__header">
          <span class="gr-unlock-icon">🔓</span>
          <span class="gr-unlock-user">${req.userName}さんが解除申請中</span>
          <span class="gr-unlock-time">${formatRelativeTime(req.requestedAt)}</span>
        </div>
        <p class="gr-unlock-reason">理由：${req.reason}</p>
        <div class="gr-unlock-actions">
          <button class="gr-approve-btn" data-id="${req.id}">承認する</button>
          <button class="gr-deny-btn" data-id="${req.id}">却下</button>
        </div>
      `;
      card.querySelector('.gr-approve-btn').addEventListener('click', () => {
        handleApprove(req.id, req.userName);
      });
      card.querySelector('.gr-deny-btn').addEventListener('click', () => {
        handleDeny(req.id, req.userName);
      });
      list.appendChild(card);
    });
  }

  function handleApprove(id, userName) {
    console.log('[GroupRoom] approve unlock request', id);
    alert(`${userName}さんの解除申請を承認しました（ダミー）`);
  }

  function handleDeny(id, userName) {
    console.log('[GroupRoom] deny unlock request', id);
    alert(`${userName}さんの解除申請を却下しました（ダミー）`);
  }

  // ====== 描画：アクティビティ ======

  function renderActivities() {
    const list = document.getElementById('gr-activity-list');
    if (!list) return;

    const items = _groupId ? DUMMY_ACTIVITIES : [];

    if (items.length === 0) {
      list.innerHTML = '<p class="gr-empty-note">アクティビティはありません</p>';
      return;
    }

    list.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = `gr-activity-row gr-activity-row--${item.type}`;
      row.innerHTML = `
        <span class="gr-activity-time">${item.time}</span>
        <div class="gr-activity-body">
          <span class="gr-activity-text">${item.text}</span>
          ${item.sub ? `<span class="gr-activity-sub">${item.sub}</span>` : ''}
        </div>
      `;
      list.appendChild(row);
    });
  }

  // ====== 全体再描画 ======

  function renderAll() {
    renderHeader();
    renderMembers();
    renderUnlockRequests();
    renderActivities();
  }

  // ====== 外部API（app.js から呼び出す） ======

  window.GroupRoomUI = {
    updateMembers(members, groupId, groupName) {
      _members = Array.isArray(members) ? members : [];
      if (groupId !== undefined) _groupId = groupId || '';
      if (groupName !== undefined) _groupName = groupName || '';
      renderAll();
    },
    setGroup(groupId, groupName) {
      _groupId = groupId || '';
      _groupName = groupName || '';
      renderAll();
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderAll();
  });
})();
