(function(){
  // Firebase integration for app UI: anonymous auth, subscribe tasks, store to chrome.storage.local
  let unsubscribe = null;
  let subscribedUid = null;

  function $(sel){ return document.getElementById(sel); }
  const statusEl = $('firebase-sync-status');

  function setStatus(text, cls){
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove('connecting','success','error');
    if (cls) statusEl.classList.add(cls);
  }

  function formatTime(ts){
    const d = new Date(ts);
    return d.toLocaleTimeString();
  }

  const backupCountEl = $('firebase-backup-count');
  const restoreButton = $('firebase-restore-button');
  let isRestoring = false;

  function saveToStorage(tasks, uid){
    const payload = {
      firebaseTasks: tasks,
      firebaseSyncedAt: Date.now(),
      firebaseUid: uid
    };
    if (typeof backupCountEl !== 'undefined' && backupCountEl) {
      backupCountEl.textContent = `クラウド保存：${tasks.length}件`;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(payload);
    } else {
      try {
        localStorage.setItem('firebaseTasks', JSON.stringify(tasks));
        localStorage.setItem('firebaseSyncedAt', String(Date.now()));
        localStorage.setItem('firebaseUid', uid);
      } catch(e){}
    }
  }

  async function startIntegration(){
    if (!window.studyFirebase) {
      // wait for studyFirebase to appear for up to ~5s
      const start = Date.now();
      while(!window.studyFirebase && (Date.now()-start) < 5000){
        await new Promise(r=>setTimeout(r,200));
      }
    }
    if (!window.studyFirebase) {
      setStatus('Firebase接続エラー', 'error');
      console.error('[Firebase Integration] studyFirebase not found');
      return;
    }

    try{
      const user = await window.studyFirebase.ensureAnonymousUser();
      const uid = user && user.uid ? String(user.uid) : '';
      const short = uid ? uid.slice(0,8) : '-';
      setStatus(`UID:${short} 接続中…`, 'connecting');
      console.log('[Firebase Integration] authenticated');

      // avoid double subscribe
      if (unsubscribe && subscribedUid === uid) return;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }

      subscribedUid = uid;
      unsubscribe = window.studyFirebase.subscribeTasks(uid, (tasks)=>{
        // tasks is array
        saveToStorage(tasks, uid);
        setStatus(`Firebase同期済み：${tasks.length}件 ${formatTime(Date.now())}`, 'success');
        console.log(`[Firebase Integration] synced: ${tasks.length} tasks`);
      }, (err)=>{
        setStatus('Firebase接続エラー', 'error');
        console.error('[Firebase Integration] subscribe error', err);
      });

      // Initial push: read local tasks and upsert to Firestore (do not bulk-delete remote)
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['tasks'], (res) => {
            const localTasks = res?.tasks || [];
            localTasks.forEach(t => {
              if (!t || !t.id) {
                console.warn('[Firebase Integration] skipping local task without id');
                return;
              }
              // map storage fields to firestore expected fields minimally
              const payload = {
                id: String(t.id),
                title: t.name || t.title || '',
                completed: t.done ?? t.completed ?? false,
                progress: t.progress ?? 0,
                // keep original fields as metadata
                name: t.name,
                category: t.category,
                date: t.date,
                startTime: t.startTime,
                endTime: t.endTime
              };
              window.studyFirebase.upsertTask(uid, payload).then(() => {
                console.log(`[Firebase Integration] local task pushed: ${t.id}`);
              }).catch(e => console.error('[Firebase Integration] push error', e));
            });
            console.log(`[Firebase Integration] local tasks pushed: ${localTasks.length} tasks`);
          });
        }
      } catch (e) {
        console.error('[Firebase Integration] initial push error', e);
      }

      setStatus(`UID:${short} 接続済み`, 'success');

    } catch(err){
      setStatus('Firebase接続エラー', 'error');
      console.error('[Firebase Integration] error', err);
    }
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    setStatus('Firebase接続中…','connecting');
    startIntegration();
    if (restoreButton) {
      restoreButton.addEventListener('click', async () => {
        if (!window.confirm('クラウドのタスクをローカルに復元しますか？\n現在のローカルタスクは上書きされません。')) {
          return;
        }
        if (isRestoring) return;
        isRestoring = true;
        restoreButton.disabled = true;
        setStatus('Firebase同期中…', 'connecting');
        try {
          const storageGet = () => new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['tasks', 'firebaseTasks'], (res) => {
                resolve({ tasks: res?.tasks || [], firebaseTasks: res?.firebaseTasks || [] });
              });
            } else {
              const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
              const firebaseTasks = JSON.parse(localStorage.getItem('firebaseTasks') || '[]');
              resolve({ tasks, firebaseTasks });
            }
          });
          const { tasks: localTasks, firebaseTasks } = await storageGet();
          const localMap = new Map(localTasks.filter(t => t && t.id).map(t => [String(t.id), t]));
          const merged = [...localTasks];
          let restoredCount = 0;
          firebaseTasks.forEach(ft => {
            if (!ft || !ft.id) {
              console.warn('[Firebase Integration] skipping cloud task without id');
              return;
            }
            const id = String(ft.id);
            const local = localMap.get(id);
            const cloudTitle = ft.title || ft.name || '';
            const cloudName = ft.name || ft.title || '';
            if (!local) {
              merged.push({
                id,
                title: cloudTitle,
                name: cloudName,
                category: ft.category ?? '未分類',
                date: ft.date ?? '',
                startTime: ft.startTime ?? '',
                endTime: ft.endTime ?? '',
                done: ft.done ?? false,
                progress: ft.progress ?? 0,
                updatedAt: ft.updatedAt,
                createdAt: ft.createdAt,
                completedAt: ft.completedAt
              });
              restoredCount += 1;
            } else {
              const localUpdated = typeof local.updatedAt === 'number' ? local.updatedAt : null;
              const cloudUpdated = typeof ft.updatedAt === 'number' ? ft.updatedAt : null;
              if (cloudUpdated !== null && localUpdated !== null && cloudUpdated > localUpdated) {
                const index = merged.findIndex(t => String(t.id) === id);
                if (index !== -1) {
                  merged[index] = {
                    ...local,
                    title: cloudTitle || local.title || local.name || '',
                    name: cloudName || local.name || local.title || '',
                    category: local.category ?? ft.category ?? '未分類',
                    date: local.date ?? ft.date ?? '',
                    startTime: local.startTime ?? ft.startTime ?? '',
                    endTime: local.endTime ?? ft.endTime ?? '',
                    done: ft.done ?? local.done ?? false,
                    progress: ft.progress ?? local.progress ?? 0,
                    updatedAt: ft.updatedAt,
                    createdAt: ft.createdAt ?? local.createdAt,
                    completedAt: ft.completedAt
                  };
                  restoredCount += 1;
                }
              }
            }
          });
          const storageSet = () => new Promise((resolve, reject) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ tasks: merged }, () => {
                resolve();
              });
            } else {
              try {
                localStorage.setItem('tasks', JSON.stringify(merged));
                resolve();
              } catch (e) {
                reject(e);
              }
            }
          });
          await storageSet();
          setStatus(`クラウドから${restoredCount}件復元しました`, 'success');
          console.log(`[Firebase Integration] restored: ${restoredCount} tasks`);
          window.location.reload();
        } catch (err) {
          setStatus('Firebase同期エラー', 'error');
          console.error('[Firebase Integration] restore error', err);
        } finally {
          isRestoring = false;
          if (restoreButton) restoreButton.disabled = false;
        }
      });
    }
  });
  // storage change listener
  let storageListener = null;
  function onStorageChange(changes, area) {
    if (area !== 'local') return;
    if (!changes.tasks) return; // ignore other keys (including firebaseTasks)
    const { oldValue, newValue } = changes.tasks;
    const before = Array.isArray(oldValue) ? oldValue : [];
    const after = Array.isArray(newValue) ? newValue : [];

    const beforeMap = new Map(before.map(t => [String(t.id), t]));
    const afterMap = new Map(after.map(t => [String(t.id), t]));

    // detect created and updated
    after.forEach(t => {
      if (!t || !t.id) {
        console.warn('[Firebase Integration] skipping local task without id');
        return;
      }
      const id = String(t.id);
      const prev = beforeMap.get(id);
      if (!prev) {
        // created
        window.studyFirebase.upsertTask(subscribedUid, {
          id: id,
          title: t.name || t.title || '',
          completed: t.done ?? t.completed ?? false,
          progress: t.progress ?? 0,
          name: t.name,
          category: t.category,
          date: t.date,
          startTime: t.startTime,
          endTime: t.endTime
        }).then(()=>{
          console.log(`[Firebase Integration] local task created: ${id}`);
        }).catch(e=>console.error('[Firebase Integration] upsert error', e));
      } else {
        // compare JSON
        try{
          const prevS = JSON.stringify(prev);
          const nowS = JSON.stringify(t);
          if (prevS !== nowS) {
            window.studyFirebase.upsertTask(subscribedUid, {
              id: id,
              title: t.name || t.title || '',
              completed: t.done ?? t.completed ?? false,
              progress: t.progress ?? 0,
              name: t.name,
              category: t.category,
              date: t.date,
              startTime: t.startTime,
              endTime: t.endTime
            }).then(()=>{
              console.log(`[Firebase Integration] local task updated: ${id}`);
            }).catch(e=>console.error('[Firebase Integration] upsert error', e));
          }
        } catch(e){ console.error(e); }
      }
    });

    // detect deleted
    before.forEach(t => {
      if (!t || !t.id) return;
      const id = String(t.id);
      if (!afterMap.has(id)) {
        window.studyFirebase.deleteTask(subscribedUid, id).then(()=>{
          console.log(`[Firebase Integration] local task deleted: ${id}`);
        }).catch(e=>console.error('[Firebase Integration] delete error', e));
      }
    });

    // final log
    console.log(`[Firebase Integration] local tasks pushed: ${after.length} tasks`);
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    // register storage listener (only once)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged && !storageListener) {
      storageListener = onStorageChange;
      chrome.storage.onChanged.addListener(storageListener);
    }
  });

  window.addEventListener('beforeunload', ()=>{
    if (typeof unsubscribe === 'function') try { unsubscribe(); } catch(e){}
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged && storageListener) {
      try { chrome.storage.onChanged.removeListener(storageListener); } catch(e){}
      storageListener = null;
    }
  });
})();
