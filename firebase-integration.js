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

  function saveToStorage(tasks, uid){
    const payload = {
      firebaseTasks: tasks,
      firebaseSyncedAt: Date.now(),
      firebaseUid: uid
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(payload);
    } else {
      try { localStorage.setItem('firebaseTasks', JSON.stringify(tasks)); localStorage.setItem('firebaseSyncedAt', String(Date.now())); localStorage.setItem('firebaseUid', uid); } catch(e){}
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

      setStatus(`UID:${short} 接続済み`, 'success');

    } catch(err){
      setStatus('Firebase接続エラー', 'error');
      console.error('[Firebase Integration] error', err);
    }
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    setStatus('Firebase接続中…','connecting');
    startIntegration();
  });

  window.addEventListener('beforeunload', ()=>{
    if (typeof unsubscribe === 'function') try { unsubscribe(); } catch(e){}
  });
})();
