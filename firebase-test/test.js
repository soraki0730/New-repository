// Firebase 単体接続テスト（CDNモジュール使用）
// 要件:
// - 既存の ../firebaseConfig.js を相対参照する（インポートの試行を行う）
// - CDN のモジュールを使って initializeApp() を実行（二重実行は避ける）
// - 成功時には画面に「Firebase initialization succeeded」と表示
// - 失敗時には画面と console にエラーを表示

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  doc
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const uidEl = document.getElementById('uid');
const tasksList = document.getElementById('tasks');
const addBtn = document.getElementById('addBtn');
const taskInput = document.getElementById('taskTitle');

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setError(err) {
  const msg = err && err.message ? err.message : String(err);
  console.error(msg, err);
  if (errorEl) errorEl.textContent = msg;
}

async function tryImportConfigModule() {
  try {
    await import('../firebaseConfig.js');
    return true;
  } catch (err) {
    console.warn('Module import of ../firebaseConfig.js failed (falling back to fetch):', err);
    return false;
  }
}

async function fetchAndParseConfig() {
  try {
    const res = await fetch('../firebaseConfig.js');
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const text = await res.text();
    const m = text.match(/const\s+firebaseConfig\s*=\s*(\{[\s\S]*?\})\s*;/m);
    if (!m) throw new Error('firebaseConfig object not found in ../firebaseConfig.js');
    const objText = m[1];
    const config = Function('return (' + objText + ')')();
    return config;
  } catch (err) {
    throw err;
  }
}

async function ensureInitialized() {
  await tryImportConfigModule();

  if (getApps().length > 0) {
    setStatus('Firebase initialization succeeded');
    console.log('Firebase already initialized by imported module.');
    return;
  }

  try {
    const config = await fetchAndParseConfig();
    if (getApps().length === 0) {
      initializeApp(config);
      setStatus('Firebase initialization succeeded');
      console.log('Firebase initialized via CDN initializeApp().');
    } else {
      setStatus('Firebase initialization succeeded');
      console.log('Firebase was initialized in-between.');
    }
  } catch (err) {
    setError(err);
    setStatus('Firebase initialization failed');
    return;
  }
}

let db = null;
let auth = null;
let unsubscribe = null;

function renderTasks(docs) {
  if (!tasksList) return;
  tasksList.innerHTML = '';
  docs.forEach(d => {
    const li = document.createElement('li');
    const data = d.data();
    li.textContent = `${data.id || d.id} — ${data.title} — completed:${data.completed} — progress:${data.progress}`;
    tasksList.appendChild(li);
  });
}

async function startApp() {
  await ensureInitialized();

  try {
    auth = getAuth();
    db = getFirestore();

    // Sign in anonymously
    const anonRes = await signInAnonymously(auth).catch(e => { throw e; });
    const user = anonRes.user;
    uidEl.textContent = user.uid;
    setStatus('Firebase initialization succeeded');

    // Listen to tasks collection for this user
    const tasksCol = collection(db, 'users', user.uid, 'tasks');
    const q = query(tasksCol, orderBy('createdAt'));
    unsubscribe = onSnapshot(q, snapshot => {
      renderTasks(snapshot.docs);
    }, err => {
      setError(err);
    });

    addBtn.addEventListener('click', async () => {
      const title = (taskInput.value || '').trim();
      if (!title) return setError(new Error('タイトルを入力してください'));
      try {
        const ref = await addDoc(tasksCol, {
          title,
          completed: false,
          progress: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        // store id field
        await setDoc(ref, { id: ref.id }, { merge: true });
        taskInput.value = '';
      } catch (err) {
        setError(err);
      }
    });

  } catch (err) {
    setError(err);
    setStatus('Firebase initialization failed');
  }
}

startApp();
