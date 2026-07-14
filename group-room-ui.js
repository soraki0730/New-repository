/* =========================================================
   group-room-ui.js  ―  グループ部屋 UI（実データ版）
   group-ui.js のダミー描画を実データで上書きする
   ========================================================= */

(function () {
  // ====== ダミーデータ（解除申請） ======

  const DUMMY_UNLOCK_REQUESTS = [
    {
      id: 'req-001',
      userName: '桂',
      reason: '課題でYouTubeの解説動画を見る必要があります',
      requestedAt: Date.now() - 8 * 60 * 1000,
    },
  ];

  // ====== 状態 ======

  let _members = [];
  let _groupId = '';

  // ====== ユーティリティ ======

  function rel(ts) {
    if (!ts) return '';
    const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : ts;
    const diff = Math.max(1, Math.round((Date.now() - ms) / 60000));
    if (diff < 60) return `${diff}分前`;
    const h = Math.round(diff / 60);
    if (h < 24) return `${h}時間前`;
    return `${Math.round(h / 24)}日前`;
  }

  function pctColor(p) {
    if (p >= 100) return '#4caf50';
    if (p >= 50)  return '#2196f3';
    return '#ff9800';
  }

  function statusBadge(member) {
    if (member.totalCount === 0) return { text: '未設定',  cls: 'gr-s--idle' };
    if (member.todayProgress >= 100) return { text: '完了 🎉', cls: 'gr-s--done' };
    if (member.todayProgress > 0)    return { text: '学習中', cls: 'gr-s--active' };
    return { text: '未着手', cls: 'gr-s--idle' };
  }

  // ====== 描画：メンバー一覧（#group-member-list を上書き） ======

  function renderMembers() {
    const list = document.getElementById('group-member-list');
    if (!list) return;

    if (!_groupId || _members.length === 0) return; // ダミーデータのままにする

    list.innerHTML = '';
    _members.forEach((m) => {
      const pct    = m.todayProgress || 0;
      const status = statusBadge(m);
      const card   = document.createElement('div');
      card.className = 'gr-member-card';
      card.innerHTML = `
        <div class="gr-member-card__top">
          <div class="gr-member-card__left">
            <div class="gr-avatar">${(m.displayName || '?')[0]}</div>
            <div>
              <div class="gr-member-name">${m.displayName || '名前未設定'}</div>
              <span class="gr-status ${status.cls}">${status.text}</span>
            </div>
          </div>
          <div class="gr-member-pct" style="color:${pctColor(pct)}">${pct}%</div>
        </div>
        <div class="gr-progress-track">
          <div class="gr-progress-bar" style="width:${pct}%;background:${pctColor(pct)}"></div>
        </div>
        <div class="gr-member-meta">
          ${m.completedCount || 0} / ${m.totalCount || 0} タスク完了
          <span class="gr-updated">${rel(m.updatedAt || m.lastActiveAt)}</span>
        </div>
      `;
      list.appendChild(card);
    });
  }

  // ====== 描画：解除申請（#gr-unlock-list） ======

  function renderUnlockRequests() {
    const list  = document.getElementById('gr-unlock-list');
    const badge = document.getElementById('gr-unlock-badge');
    if (!list) return;

    const reqs = _groupId ? DUMMY_UNLOCK_REQUESTS : [];

    if (badge) {
      badge.textContent = reqs.length > 0 ? String(reqs.length) : '';
      badge.hidden = reqs.length === 0;
    }

    if (reqs.length === 0) {
      list.innerHTML = '<p class="gr-empty-note">現在、解除申請はありません</p>';
      return;
    }

    list.innerHTML = '';
    reqs.forEach((req) => {
      const card = document.createElement('div');
      card.className = 'gr-unlock-card';
      card.innerHTML = `
        <div class="gr-unlock-card__header">
          <span class="gr-unlock-icon">🔓</span>
          <span class="gr-unlock-user">${req.userName}さんが解除申請中</span>
          <span class="gr-unlock-time">${rel(req.requestedAt)}</span>
        </div>
        <p class="gr-unlock-reason">理由：${req.reason}</p>
        <div class="gr-unlock-actions">
          <button class="gr-approve-btn" type="button">承認する</button>
          <button class="gr-deny-btn"    type="button">却下</button>
        </div>
      `;
      card.querySelector('.gr-approve-btn').addEventListener('click', () => {
        console.log('[GroupRoom] approve', req.id);
        alert(`${req.userName}さんの解除申請を承認しました（ダミー）`);
      });
      card.querySelector('.gr-deny-btn').addEventListener('click', () => {
        console.log('[GroupRoom] deny', req.id);
        alert(`${req.userName}さんの解除申請を却下しました（ダミー）`);
      });
      list.appendChild(card);
    });
  }

  // ====== 外部API ======

  window.GroupRoomUI = {
    updateMembers(members, groupId) {
      _members = Array.isArray(members) ? members : [];
      if (groupId !== undefined) _groupId = groupId || '';
      renderMembers();
      renderUnlockRequests();
    },
    setGroup(groupId) {
      _groupId = groupId || '';
      renderUnlockRequests();
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderUnlockRequests();
  });
})();
