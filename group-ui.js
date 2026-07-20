/* =========================================================
   group-ui.js  ―  グループ作成・参加・設定・活動フィード
   ========================================================= */

(function () {
  const DEFAULT_SETTINGS = {
    shareLevel: 'progress',
    notificationLevel: 'standard',
    unlockRule: 'approval',
    emergencyUnlock: true,
  };

  let firebaseApi = null;
  let currentUid = '';
  let displayName = '名前未設定';
  let groupId = '';
  let groupData = null;
  let currentActivities = [];
  let currentReactions = [];
  let activityExpanded = false;
  let unsubscribeGroup = null;
  let unsubscribeActivities = null;
  let unsubscribeReactions = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function timestampToMillis(timestamp) {
    if (!timestamp) return 0;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    return Number(timestamp) || 0;
  }

  function formatRelative(timestamp) {
    const value = timestampToMillis(timestamp);
    if (!value) return '';
    const min = Math.max(0, Math.floor((Date.now() - value) / 60000));
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  }

  function groupTypeLabel(type) {
    return { mild: 'ゆるい自習', focus: '強制集中', joint: '共同課題' }[type] || 'グループ';
  }

  function effectiveSettings() {
    if (!groupId) return { ...DEFAULT_SETTINGS, unlockRule: 'free' };
    return { ...DEFAULT_SETTINGS, ...(groupData?.settings || {}) };
  }

  function syncSettingsToStorage() {
    const payload = { ...effectiveSettings(), groupId };
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ studyGroupSettings: payload });
    } else {
      localStorage.setItem('studyGroupSettings', JSON.stringify(payload));
    }
  }

  function setFeedback(message, kind = '') {
    let feedback = document.getElementById('group-feedback');
    if (!feedback) {
      feedback = document.createElement('p');
      feedback.id = 'group-feedback';
      feedback.className = 'group-feedback';
      document.getElementById('view-group')?.prepend(feedback);
    }
    feedback.textContent = message;
    feedback.dataset.kind = kind;
    feedback.hidden = !message;
  }

  function showGroupPanel(panelId) {
    ['group-panel-home', 'group-panel-setup', 'group-panel-settings'].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = id !== panelId;
    });
  }

  function renderHeader() {
    const name = document.getElementById('group-name');
    const type = document.getElementById('group-type-badge');
    const idLabel = document.getElementById('group-id-label');
    const setupButton = document.getElementById('group-join-or-create-btn');
    if (name) name.textContent = groupData?.name || (groupId ? 'グループを読み込み中…' : 'グループ未参加');
    if (type) type.textContent = groupData ? groupTypeLabel(groupData.type) : '';
    if (idLabel) idLabel.textContent = groupId ? `ID: ${groupId}` : '';
    if (setupButton) setupButton.textContent = groupId ? 'グループを変更・参加' : '＋ グループを作成・参加';
  }

  function applySettingsToForm() {
    const settings = { ...DEFAULT_SETTINGS, ...(groupData?.settings || {}) };
    const notifyValue = settings.notificationLevel === 'standard' ? 'normal' : settings.notificationLevel;
    const shareInput = document.querySelector(`input[name="share-level"][value="${settings.shareLevel}"]`);
    const notifyInput = document.querySelector(`input[name="notify-level"][value="${notifyValue}"]`);
    const unlockInput = document.querySelector(`input[name="release-rule"][value="${settings.unlockRule}"]`);
    if (shareInput) shareInput.checked = true;
    if (notifyInput) notifyInput.checked = true;
    if (unlockInput) unlockInput.checked = true;
    const emergency = document.getElementById('allow-emergency');
    if (emergency) emergency.checked = Boolean(settings.emergencyUnlock);

    const isOwner = Boolean(groupData && groupData.ownerUid === currentUid);
    const botSection = document.getElementById('bot-section');
    if (botSection) botSection.hidden = !isOwner;
    document.querySelectorAll('#group-panel-settings input').forEach((input) => {
      input.disabled = !isOwner;
    });
    const saveButton = document.getElementById('group-settings-save');
    if (saveButton) {
      saveButton.disabled = !isOwner;
      saveButton.textContent = isOwner ? '設定を保存' : '設定変更はオーナーのみ';
    }
  }

  function activityText(activity) {
    const actor = activity.actorName || activity.displayName || 'メンバー';
    switch (activity.type) {
      case 'group_created': return `${actor}さんがグループを作成しました`;
      case 'member_joined': return `${actor}さんがグループに参加しました`;
      case 'reaction': return `${actor}さんが${activity.targetName || 'メンバー'}さんに${activity.emoji || '👏'}を送りました`;
      case 'unlock_approved': return `${actor}さんが解除申請を承認しました`;
      case 'unlock_rejected': return `${actor}さんが解除申請を却下しました`;
      case 'unlock_requested': return `${actor}さんがstudyModeの解除を申請しました`;
      case 'emergency_unlock': return `${actor}さんがstudyModeを緊急解除しました`;
      case 'reason_unlock': return `${actor}さんが理由を記録してstudyModeを解除しました`;
      case 'settings_updated': return `${actor}さんがグループ設定を更新しました`;
      case 'study_started': return `${actor}さんが集中を始めました`;
      case 'study_stopped': return `${actor}さんが集中を終えました`;
      case 'task_completed': return `${actor}さんがタスクを完了しました`;
      default: return `${actor}さんがグループを更新しました`;
    }
  }

  function activityPresentation(activity) {
    const presentations = {
      study_started: { icon: '▶', label: '集中スタート', cls: 'activity-item--study' },
      study_stopped: { icon: '■', label: '集中終了', cls: 'activity-item--study' },
      task_completed: { icon: '✓', label: 'タスク完了', cls: 'activity-item--complete' },
      member_joined: { icon: '+', label: '新しい仲間', cls: 'activity-item--member' },
      group_created: { icon: '＋', label: 'グループ', cls: 'activity-item--member' },
      unlock_requested: { icon: '!', label: '解除申請', cls: 'activity-item--request' },
      unlock_approved: { icon: '✓', label: '申請承認', cls: 'activity-item--complete' },
      unlock_rejected: { icon: '×', label: '申請却下', cls: 'activity-item--request' },
      emergency_unlock: { icon: '!', label: '緊急解除', cls: 'activity-item--danger' },
      reason_unlock: { icon: '!', label: '理由付き解除', cls: 'activity-item--request' },
      settings_updated: { icon: '⚙', label: '設定変更', cls: 'activity-item--system' },
    };
    return presentations[activity.type] || { icon: '•', label: '更新', cls: 'activity-item--system' };
  }

  const REACTION_OPTIONS = [
    { key: 'clap', emoji: '👏' },
    { key: 'fire', emoji: '🔥' },
    { key: 'like', emoji: '👍' },
  ];

  function reactionButton(targetType, targetId, targetUid, targetName, option) {
    const matching = currentReactions.filter((reaction) => reaction.targetType === targetType
      && reaction.targetId === targetId && reaction.emojiKey === option.key);
    const selected = matching.some((reaction) => reaction.actorUid === currentUid);
    return `<button class="activity-reaction${selected ? ' is-selected' : ''}" type="button"
      data-target-type="${escapeHtml(targetType)}" data-target-id="${escapeHtml(targetId)}"
      data-target-uid="${escapeHtml(targetUid || '')}" data-target-name="${escapeHtml(targetName || '')}"
      data-emoji-key="${option.key}" data-emoji="${option.emoji}" aria-pressed="${selected}">
      <span>${option.emoji}</span><strong>${matching.length || ''}</strong>
    </button>`;
  }

  function renderActivities(activities = []) {
    const feed = document.getElementById('group-activity-feed');
    if (!feed) return;
    if (!groupId) {
      feed.innerHTML = '<p class="gr-empty-note">グループに参加すると活動が表示されます</p>';
      return;
    }
    const notificationLevel = groupData?.settings?.notificationLevel || 'standard';
    const visibleActivities = notificationLevel === 'low'
      ? activities.filter((activity) => ['unlock_requested', 'unlock_approved', 'unlock_rejected', 'emergency_unlock', 'reason_unlock', 'settings_updated'].includes(activity.type))
      : notificationLevel === 'standard' || notificationLevel === 'normal'
        ? activities.filter((activity) => activity.type !== 'reaction')
        : activities;
    const timelineActivities = visibleActivities.filter((activity) => activity.type !== 'reaction');
    if (timelineActivities.length === 0) {
      feed.innerHTML = '<p class="gr-empty-note">まだアクティビティはありません</p>';
      const moreButton = document.getElementById('group-activity-more');
      if (moreButton) moreButton.hidden = true;
      return;
    }
    const displayed = activityExpanded ? timelineActivities : timelineActivities.slice(0, 5);
    feed.innerHTML = displayed.map((activity) => {
      const actor = activity.actorName || activity.displayName || 'メンバー';
      const presentation = activityPresentation(activity);
      return `<article class="activity-item ${presentation.cls}">
        <div class="activity-item__icon" aria-hidden="true">${presentation.icon}</div>
        <div class="activity-item__body">
          <div class="activity-item__meta"><span>${escapeHtml(presentation.label)}</span><time>${escapeHtml(formatRelative(activity.createdAt))}</time></div>
          <p class="activity-item__text">${escapeHtml(activityText(activity))}</p>
          ${activity.taskName ? `<p class="activity-item__task">${escapeHtml(activity.taskName)}</p>` : ''}
          ${activity.actorUid === currentUid ? '' : `<div class="activity-item__reactions">${REACTION_OPTIONS.map((option) => reactionButton('activity', activity.id, activity.actorUid, actor, option)).join('')}</div>`}
        </div>
      </article>`;
    }).join('');
    feed.querySelectorAll('.activity-reaction').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await toggleReaction({
            targetType: button.dataset.targetType,
            targetId: button.dataset.targetId,
            targetUid: button.dataset.targetUid,
            targetName: button.dataset.targetName,
            emojiKey: button.dataset.emojiKey,
            emoji: button.dataset.emoji,
          });
        } finally {
          button.disabled = false;
        }
      });
    });
    const moreButton = document.getElementById('group-activity-more');
    if (moreButton) {
      moreButton.hidden = timelineActivities.length <= 5;
      moreButton.textContent = activityExpanded ? '最新5件に戻す' : `もっと見る（残り${timelineActivities.length - 5}件）`;
    }
  }

  async function ensureFirebase() {
    if (firebaseApi) return firebaseApi;
    for (let index = 0; index < 30 && !window.studyFirebase; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    firebaseApi = window.studyFirebase || null;
    return firebaseApi;
  }

  function stopSubscriptions() {
    if (typeof unsubscribeGroup === 'function') unsubscribeGroup();
    if (typeof unsubscribeActivities === 'function') unsubscribeActivities();
    if (typeof unsubscribeReactions === 'function') unsubscribeReactions();
    unsubscribeGroup = null;
    unsubscribeActivities = null;
    unsubscribeReactions = null;
  }

  async function subscribeCurrentGroup() {
    stopSubscriptions();
    currentActivities = [];
    currentReactions = [];
    activityExpanded = false;
    renderHeader();
    renderActivities([]);
    if (!groupId) {
      groupData = null;
      applySettingsToForm();
      syncSettingsToStorage();
      return;
    }
    const api = await ensureFirebase();
    if (!api?.subscribeGroup) {
      setFeedback('グループ情報を読み込めませんでした', 'error');
      return;
    }
    unsubscribeGroup = api.subscribeGroup(groupId, (nextGroup) => {
      groupData = nextGroup;
      renderHeader();
      applySettingsToForm();
      syncSettingsToStorage();
      renderActivities(currentActivities);
      window.dispatchEvent(new CustomEvent('study-group-settings-changed', {
        detail: { groupId, settings: groupData?.settings || DEFAULT_SETTINGS }
      }));
      if (!nextGroup) setFeedback('指定したグループが見つかりません', 'error');
    }, (error) => {
      console.error('[Group] subscribe failed', error);
      setFeedback('グループ情報の取得に失敗しました', 'error');
    });
    if (api.subscribeGroupActivities) {
      unsubscribeActivities = api.subscribeGroupActivities(groupId, (activities) => {
        currentActivities = activities;
        renderActivities(currentActivities);
      }, (error) => {
        console.error('[Group] activity subscription failed', error);
        setFeedback('アクティビティの取得に失敗しました', 'error');
      });
    }
    if (api.subscribeGroupReactions) {
      unsubscribeReactions = api.subscribeGroupReactions(groupId, (reactions) => {
        currentReactions = reactions;
        renderActivities(currentActivities);
        window.GroupRoomUI?.updateReactions?.(currentReactions);
      }, (error) => {
        console.error('[Group] reaction subscription failed', error);
      });
    }
  }

  async function saveProfileGroup(nextGroupId) {
    groupId = nextGroupId;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await new Promise((resolve) => chrome.storage.local.set({ firebaseGroupId: nextGroupId }, resolve));
    } else {
      localStorage.setItem('firebaseGroupId', nextGroupId);
    }
    if (firebaseApi?.upsertUserProfile && currentUid) {
      await firebaseApi.upsertUserProfile(currentUid, { displayName, groupId: nextGroupId });
    }
    window.dispatchEvent(new CustomEvent('study-group-changed', {
      detail: { groupId: nextGroupId, displayName }
    }));
    await subscribeCurrentGroup();
  }

  async function recordActivity(type, extra = {}) {
    const api = await ensureFirebase();
    if (!groupId || !currentUid || !api?.createGroupActivity) return false;
    try {
      await api.createGroupActivity(groupId, {
        actorUid: currentUid,
        actorName: displayName,
        type,
        ...extra,
      });
      return true;
    } catch (error) {
      console.warn('[Group] activity write failed', error);
      return false;
    }
  }

  async function createNewGroup() {
    const nameInput = document.getElementById('group-name-input');
    const button = document.getElementById('group-create-btn');
    const name = nameInput?.value.trim() || '';
    const type = document.querySelector('input[name="group-type"]:checked')?.value || 'mild';
    if (!name) {
      setFeedback('グループ名を入力してください', 'error');
      nameInput?.focus();
      return;
    }
    const api = await ensureFirebase();
    if (!api?.createGroup || !currentUid) {
      setFeedback('Firebaseに接続できません', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = '作成中…';
    try {
      const result = await api.createGroup({ name, type, ownerUid: currentUid, ownerName: displayName });
      await saveProfileGroup(result.groupId);
      await recordActivity('group_created');
      showGroupPanel('group-panel-home');
      setFeedback(`「${name}」を作成しました`, 'success');
      if (nameInput) nameInput.value = '';
    } catch (error) {
      console.error('[Group] create failed', error);
      setFeedback('グループの作成に失敗しました', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'グループを作成';
    }
  }

  async function joinExistingGroup() {
    const idInput = document.getElementById('group-id-input');
    const button = document.getElementById('group-join-btn');
    const nextGroupId = idInput?.value.trim() || '';
    if (!nextGroupId) {
      setFeedback('グループIDを入力してください', 'error');
      idInput?.focus();
      return;
    }
    const api = await ensureFirebase();
    if (!api?.joinGroup || !currentUid) {
      setFeedback('Firebaseに接続できません', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = '参加中…';
    try {
      await api.joinGroup(nextGroupId, { uid: currentUid, displayName });
      await saveProfileGroup(nextGroupId);
      await recordActivity('member_joined');
      showGroupPanel('group-panel-home');
      setFeedback('グループに参加しました', 'success');
      if (idInput) idInput.value = '';
    } catch (error) {
      console.error('[Group] join failed', error);
      setFeedback('グループが見つからないか、参加できませんでした', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'グループに参加';
    }
  }

  async function saveSettings() {
    const button = document.getElementById('group-settings-save');
    const api = await ensureFirebase();
    if (!groupId || !api?.updateGroupSettings || groupData?.ownerUid !== currentUid) return;
    const settings = {
      shareLevel: document.querySelector('input[name="share-level"]:checked')?.value || 'progress',
      notificationLevel: document.querySelector('input[name="notify-level"]:checked')?.value || 'normal',
      unlockRule: document.querySelector('input[name="release-rule"]:checked')?.value || 'approval',
      emergencyUnlock: document.getElementById('allow-emergency')?.checked ?? true,
    };
    button.disabled = true;
    button.textContent = '保存中…';
    try {
      await api.updateGroupSettings(groupId, settings);
      await recordActivity('settings_updated');
      setFeedback('グループ設定を保存しました', 'success');
    } catch (error) {
      console.error('[Group] settings update failed', error);
      setFeedback('グループ設定を保存できませんでした', 'error');
    } finally {
      button.disabled = false;
      button.textContent = '設定を保存';
    }
  }

  async function toggleReaction(reaction = {}) {
    const api = await ensureFirebase();
    if (!groupId || !currentUid || !api?.toggleGroupReaction) return { active: false };
    if (reaction.targetUid === currentUid) return { active: false };
    return api.toggleGroupReaction(groupId, {
      ...reaction,
      actorUid: currentUid,
      actorName: displayName,
    });
  }

  async function sendReaction(targetUid, targetName, emoji) {
    if (!groupId || !targetUid || targetUid === currentUid) return { active: false };
    const emojiKey = { '👏': 'clap', '🔥': 'fire', '👍': 'like' }[emoji] || 'clap';
    const result = await toggleReaction({ targetType: 'member', targetId: targetUid, targetUid, targetName, emojiKey, emoji });
    if (result.active) await recordActivity('reaction', { targetUid, targetName, emoji });
    return result;
  }

  function initButtons() {
    document.querySelectorAll('.group-setup-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.group-setup-tab').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('group-create-form').hidden = tab.dataset.tab !== 'create';
        document.getElementById('group-join-form').hidden = tab.dataset.tab !== 'join';
      });
    });
    document.getElementById('group-create-btn')?.addEventListener('click', createNewGroup);
    document.getElementById('group-join-btn')?.addEventListener('click', joinExistingGroup);
    document.getElementById('group-settings-save')?.addEventListener('click', saveSettings);
    document.getElementById('group-settings-btn')?.addEventListener('click', () => {
      if (!groupId) {
        showGroupPanel('group-panel-setup');
        return;
      }
      applySettingsToForm();
      showGroupPanel('group-panel-settings');
    });
    document.getElementById('group-settings-back')?.addEventListener('click', () => showGroupPanel('group-panel-home'));
    document.getElementById('group-setup-back')?.addEventListener('click', () => showGroupPanel('group-panel-home'));
    document.getElementById('group-join-or-create-btn')?.addEventListener('click', () => showGroupPanel('group-panel-setup'));
    document.getElementById('group-activity-more')?.addEventListener('click', () => {
      activityExpanded = !activityExpanded;
      renderActivities(currentActivities);
    });
  }

  window.GroupUI = {
    async setContext(context = {}) {
      currentUid = context.uid || currentUid;
      displayName = context.displayName || displayName;
      const nextGroupId = context.groupId || '';
      if (nextGroupId !== groupId) {
        groupId = nextGroupId;
        await subscribeCurrentGroup();
      } else {
        renderHeader();
      }
    },
    sendReaction,
    recordActivity,
    getSettings() {
      return effectiveSettings();
    },
    openSetup() {
      showGroupPanel('group-panel-setup');
    },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    initButtons();
    renderHeader();
    renderActivities([]);
    firebaseApi = await ensureFirebase();
    if (!firebaseApi?.ensureAnonymousUser) return;
    const user = await firebaseApi.ensureAnonymousUser();
    currentUid = String(user.uid || '');
    const stored = await new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['firebaseDisplayName', 'firebaseGroupId'], resolve);
      } else {
        resolve({
          firebaseDisplayName: localStorage.getItem('firebaseDisplayName') || '',
          firebaseGroupId: localStorage.getItem('firebaseGroupId') || '',
        });
      }
    });
    displayName = stored.firebaseDisplayName || displayName;
    groupId = stored.firebaseGroupId || '';
    await subscribeCurrentGroup();
  });

  window.addEventListener('beforeunload', stopSubscriptions);
})();
