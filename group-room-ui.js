/* =========================================================
   group-room-ui.js  ―  メンバー・解除申請・緊急解除履歴
   ========================================================= */

(function () {
  let groupId = '';
  let currentUid = '';
  let currentName = '名前未設定';
  let members = [];
  let requests = [];
  let emergencyHistory = [];
  let unsubscribeRequests = null;
  let unsubscribeHistory = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toMillis(timestamp) {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    return Number(timestamp) || Date.parse(timestamp) || 0;
  }

  function relativeTime(timestamp) {
    const value = toMillis(timestamp);
    if (!value) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  }

  function progressColor(progress) {
    if (progress >= 100) return '#4caf50';
    if (progress >= 50) return '#2196f3';
    return '#ff9800';
  }

  function getShareLevel() {
    return window.GroupUI?.getSettings?.()?.shareLevel || 'progress';
  }

  function sortMembersForDisplay(nextMembers = []) {
    return [...nextMembers].sort((left, right) => {
      const leftStudying = left.studying ? 1 : 0;
      const rightStudying = right.studying ? 1 : 0;
      if (leftStudying !== rightStudying) return rightStudying - leftStudying;
      const progressDelta = (right.todayProgress || 0) - (left.todayProgress || 0);
      if (progressDelta !== 0) return progressDelta;
      return String(left.displayName || '').localeCompare(String(right.displayName || ''), 'ja');
    });
  }

  function getSharedPreview(member) {
    const shareLevel = getShareLevel();
    if (shareLevel === 'progress') return null;
    const sharedTasks = Array.isArray(member.sharedTasks) ? member.sharedTasks : [];
    if (shareLevel === 'category') {
      const categoryTask = sharedTasks.find((task) => task?.category);
      if (!categoryTask?.category) return null;
      return { label: '共有カテゴリ', value: categoryTask.category };
    }
    const detailTask = sharedTasks.find((task) => task?.title);
    if (detailTask?.title) return { label: '現在のタスク', value: detailTask.title };
    const categoryTask = sharedTasks.find((task) => task?.category);
    if (categoryTask?.category) return { label: '共有カテゴリ', value: categoryTask.category };
    return null;
  }

  function statusBadge(member) {
    if (member.totalCount === 0) return { text: '未設定', cls: 'gr-s--idle' };
    if (member.todayProgress >= 100) return { text: '完了 🎉', cls: 'gr-s--done' };
    if (member.studying || member.todayProgress > 0) return { text: '学習中', cls: 'gr-s--active' };
    return { text: '未着手', cls: 'gr-s--idle' };
  }

  function renderSharedTasks(sharedTasks = []) {
    if (!Array.isArray(sharedTasks) || sharedTasks.length === 0) return '';
    return `<div class="gr-shared-tasks">${sharedTasks.map((task) => {
      if (task.title) {
        return `<div class="gr-shared-task">
          <span class="gr-shared-task__label">
            <span>${escapeHtml(task.title)}</span>
            <small class="gr-shared-task__category">${escapeHtml(task.category || '未分類')}</small>
          </span>
          <strong>${Number(task.progress) || 0}%</strong>
        </div>`;
      }
      return `<div class="gr-shared-task"><span>${escapeHtml(task.category || '未分類')}</span><strong>${Number(task.completedCount) || 0}/${Number(task.totalCount) || 0}</strong></div>`;
    }).join('')}</div>`;
  }

  function renderStudyNowSection() {
    const list = document.getElementById('group-study-list');
    const empty = document.getElementById('group-study-empty');
    if (!list || !empty) return;

    const studyingMembers = sortMembersForDisplay(members.filter((member) => member.studying));
    if (studyingMembers.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = studyingMembers.map((member) => {
      const preview = getSharedPreview(member);
      const isSelf = member.uid === currentUid;
      return `
        <article class="group-study-card${isSelf ? ' group-study-card--self' : ''}">
          <div class="group-study-card__top">
            <div class="group-study-card__left">
              <div class="group-study-card__avatar">${escapeHtml((member.displayName || '?')[0])}</div>
              <div>
                <div class="group-study-card__name">${escapeHtml(member.displayName || '名前未設定')}${isSelf ? ' <span class="group-badge group-badge--self">自分</span>' : ''}</div>
                <span class="group-study-card__status">学習中</span>
              </div>
            </div>
          </div>
          ${preview ? `<p class="group-study-card__detail">${escapeHtml(preview.label)}<strong>${escapeHtml(preview.value)}</strong></p>` : ''}
          ${isSelf ? '' : `<button class="group-study-card__action" data-uid="${escapeHtml(member.uid)}" data-name="${escapeHtml(member.displayName)}" data-emoji="👏" type="button">👏 応援する</button>`}
        </article>
      `;
    }).join('');

    list.querySelectorAll('.group-study-card__action').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await window.GroupUI?.sendReaction(button.dataset.uid, button.dataset.name, button.dataset.emoji);
          button.disabled = true;
          button.textContent = '応援しました';
          setTimeout(() => {
            button.disabled = false;
            button.textContent = '👏 応援する';
          }, 1200);
        } catch (error) {
          console.error('[GroupRoom] cheer failed', error);
        }
      });
    });
  }

  function renderProgressSummary() {
    const progressText = document.getElementById('group-summary-progress-text');
    const progressPct = document.getElementById('group-summary-progress-pct');
    const progressBar = document.getElementById('group-summary-progress-bar');
    if (!progressText || !progressPct || !progressBar) return;

    const totals = members.reduce((accumulator, member) => {
      accumulator.completedCount += Number(member.completedCount) || 0;
      accumulator.totalCount += Number(member.totalCount) || 0;
      return accumulator;
    }, { completedCount: 0, totalCount: 0 });

    const progress = totals.totalCount === 0 ? 0 : Math.round((totals.completedCount / totals.totalCount) * 100);
    progressText.textContent = `${totals.completedCount} / ${totals.totalCount} タスク`;
    progressPct.textContent = `${progress}%`;
    progressBar.style.width = `${progress}%`;
  }

  function renderMembers() {
    const list = document.getElementById('group-member-list');
    if (!list) return;
    renderStudyNowSection();
    renderProgressSummary();
    if (!groupId) {
      list.innerHTML = '<p class="gr-empty-note">グループに参加するとメンバーが表示されます</p>';
      return;
    }
    if (members.length === 0) {
      list.innerHTML = '<p class="gr-empty-note">メンバー情報を読み込み中です</p>';
      return;
    }
    const displayMembers = sortMembersForDisplay(members);
    list.innerHTML = displayMembers.map((member) => {
      const progress = Math.max(0, Math.min(100, member.todayProgress || 0));
      const status = statusBadge(member);
      const isSelf = member.uid === currentUid;
      return `
        <div class="gr-member-card${isSelf ? ' gr-member-card--self' : ''}">
          <div class="gr-member-card__top">
            <div class="gr-member-card__left">
              <div class="gr-avatar">${escapeHtml((member.displayName || '?')[0])}</div>
              <div>
                <div class="gr-member-name">${escapeHtml(member.displayName || '名前未設定')}${isSelf ? ' <span class="group-badge group-badge--self">自分</span>' : ''}</div>
                <span class="gr-status ${status.cls}">${escapeHtml(status.text)}</span>
              </div>
            </div>
            <div class="gr-member-pct" style="color:${progressColor(progress)}">${progress}%</div>
          </div>
          <div class="gr-progress-track">
            <div class="gr-progress-bar" style="width:${progress}%;background:${progressColor(progress)}"></div>
          </div>
          <div class="gr-member-meta">
            ${member.completedCount || 0} / ${member.totalCount || 0} タスク完了
            <span class="gr-updated">${escapeHtml(relativeTime(member.lastActiveAt || member.updatedAt))}</span>
          </div>
          ${renderSharedTasks(member.sharedTasks)}
          ${isSelf ? '' : `<div class="group-reactions">
            ${['👏', '🔥', '👍'].map((emoji) => `<button class="reaction-btn" data-uid="${escapeHtml(member.uid)}" data-name="${escapeHtml(member.displayName)}" data-emoji="${emoji}" type="button">${emoji}</button>`).join('')}
          </div>`}
        </div>
      `;
    }).join('');
    list.querySelectorAll('.reaction-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await window.GroupUI?.sendReaction(button.dataset.uid, button.dataset.name, button.dataset.emoji);
          button.classList.add('reaction-btn--sent');
          setTimeout(() => button.classList.remove('reaction-btn--sent'), 1200);
        } catch (error) {
          console.error('[GroupRoom] reaction failed', error);
        }
      });
    });
  }

  async function updateRequesterState(request) {
    if (request.requesterUid !== currentUid || !['approved', 'rejected'].includes(request.status)) return;
    const state = {
      status: request.status,
      reason: request.reason || '',
      requestedAt: request.requestedAt?.toDate?.().toISOString?.() || new Date(toMillis(request.requestedAt) || Date.now()).toISOString(),
      requestId: request.id,
      lastUpdated: Date.now(),
    };
    const payload = { unlockRequestUiState: state };
    if (request.status === 'approved') payload.studyMode = false;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.set(payload, resolve));
    } else {
      Object.entries(payload).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
    }
  }

  function requestStatusLabel(status) {
    return { pending: '申請中', approved: '承認済み ✓', rejected: '却下済み' }[status] || status;
  }

  function renderRequests() {
    const list = document.getElementById('gr-unlock-list');
    const badge = document.getElementById('gr-unlock-badge');
    const section = document.getElementById('group-request-section');
    if (!list) return;
    const pendingCount = requests.filter((request) => request.status === 'pending').length;
    if (badge) {
      badge.textContent = pendingCount ? String(pendingCount) : '';
      badge.hidden = pendingCount === 0;
    }
    if (section) section.classList.toggle('is-pending', pendingCount > 0);
    if (!groupId) {
      list.innerHTML = '<p class="gr-empty-note">グループに参加すると解除申請が表示されます</p>';
      return;
    }
    if (requests.length === 0) {
      list.innerHTML = '<p class="gr-empty-note">現在、解除申請はありません</p>';
      return;
    }
    list.innerHTML = requests.slice(0, 10).map((request) => {
      const pending = request.status === 'pending';
      const isOwn = request.requesterUid === currentUid;
      return `
        <div class="gr-unlock-card gr-unlock-card--${escapeHtml(request.status || 'pending')}">
          <div class="gr-unlock-card__header">
            <span class="gr-unlock-icon">🔓</span>
            <span class="gr-unlock-user">${escapeHtml(request.requesterName || '不明')}さんの解除申請</span>
            <span class="gr-unlock-time">${escapeHtml(relativeTime(request.requestedAt))}</span>
          </div>
          <p class="gr-unlock-reason">理由：${escapeHtml(request.reason || '理由なし')}</p>
          ${pending ? `<div class="gr-unlock-actions">
            <button class="gr-approve-btn" data-action="approve" data-id="${escapeHtml(request.id)}" type="button" ${isOwn ? 'disabled title="自分の申請は承認できません"' : ''}>承認する</button>
            <button class="gr-deny-btn" data-action="reject" data-id="${escapeHtml(request.id)}" type="button" ${isOwn ? 'disabled title="自分の申請は却下できません"' : ''}>却下</button>
          </div>` : `<div class="gr-request-result gr-request-result--${escapeHtml(request.status)}">${escapeHtml(requestStatusLabel(request.status))}</div>`}
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => resolveRequest(button.dataset.id, button.dataset.action, button));
    });
  }

  async function resolveRequest(requestId, action, button) {
    const api = window.studyFirebase;
    if (!api || !groupId || !currentUid) return;
    const request = requests.find((item) => item.id === requestId);
    button.disabled = true;
    button.textContent = '更新中…';
    try {
      if (action === 'approve') {
        await api.approveUnlockRequest(groupId, requestId, currentUid);
        await window.GroupUI?.recordActivity('unlock_approved', { requestId });
      } else {
        await api.rejectUnlockRequest(groupId, requestId, currentUid);
        await window.GroupUI?.recordActivity('unlock_rejected', { requestId });
      }
    } catch (error) {
      console.error('[GroupRoom] request update failed', error);
      button.disabled = false;
      button.textContent = action === 'approve' ? '承認する' : '却下';
    }
  }

  function renderEmergencyHistory() {
    const list = document.getElementById('gr-emergency-list');
    if (!list) return;
    if (!groupId) {
      list.innerHTML = '<p class="gr-empty-note">グループに参加すると緊急解除履歴が表示されます</p>';
      return;
    }
    const emergencyOnly = emergencyHistory.filter((history) => history.type === 'emergency');
    if (emergencyOnly.length === 0) {
      list.innerHTML = '<p class="gr-empty-note">緊急解除履歴はありません</p>';
      return;
    }
    list.innerHTML = emergencyOnly.map((history) => `
      <div class="gr-emergency-card">
        <div class="gr-emergency-card__head">
          <span>🚨 ${escapeHtml(history.displayName || '不明')}さんが緊急解除</span>
          <span>${escapeHtml(relativeTime(history.unlockedAt))}</span>
        </div>
        <p>理由：${escapeHtml(history.reason || '理由なし')}</p>
        <small>解除時の進捗 ${Number(history.progressAtUnlock) || 0}%</small>
      </div>
    `).join('');
  }

  function stopSubscriptions() {
    if (typeof unsubscribeRequests === 'function') unsubscribeRequests();
    if (typeof unsubscribeHistory === 'function') unsubscribeHistory();
    unsubscribeRequests = null;
    unsubscribeHistory = null;
  }

  async function subscribe() {
    stopSubscriptions();
    requests = [];
    emergencyHistory = [];
    renderRequests();
    renderEmergencyHistory();
    if (!groupId || !window.studyFirebase) return;
    if (window.studyFirebase.subscribeUnlockRequests) {
      unsubscribeRequests = window.studyFirebase.subscribeUnlockRequests(groupId, async (nextRequests) => {
        requests = nextRequests;
        renderRequests();
        const latestOwnRequest = nextRequests.find((request) => request.requesterUid === currentUid);
        if (latestOwnRequest) await updateRequesterState(latestOwnRequest);
      }, (error) => console.error('[GroupRoom] unlock subscription failed', error));
    }
    if (window.studyFirebase.subscribeEmergencyUnlockHistory) {
      unsubscribeHistory = window.studyFirebase.subscribeEmergencyUnlockHistory(groupId, (history) => {
        emergencyHistory = history;
        renderEmergencyHistory();
      }, (error) => console.error('[GroupRoom] history subscription failed', error));
    }
  }

  window.GroupRoomUI = {
    updateMembers(nextMembers, nextGroupId) {
      members = Array.isArray(nextMembers) ? nextMembers : [];
      if (nextGroupId !== undefined && nextGroupId !== groupId) {
        groupId = nextGroupId || '';
        subscribe();
      }
      renderMembers();
    },
    setGroup(nextGroupId) {
      if ((nextGroupId || '') === groupId) return;
      groupId = nextGroupId || '';
      subscribe();
      renderMembers();
    },
    setContext(context = {}) {
      currentUid = context.uid || currentUid;
      currentName = context.displayName || currentName;
      const changed = (context.groupId || '') !== groupId;
      groupId = context.groupId || '';
      if (changed) subscribe();
      renderMembers();
      renderRequests();
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderMembers();
    renderRequests();
    renderEmergencyHistory();
  });
  window.addEventListener('study-group-settings-changed', () => {
    renderStudyNowSection();
  });
  window.addEventListener('beforeunload', stopSubscriptions);
})();
