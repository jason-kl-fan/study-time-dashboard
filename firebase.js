import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const dashboardRef = doc(db, 'studyTimeDashboard', 'main');

const defaultState = {
  people: ['Sophia', 'Ariel'],
  categories: ['念書', '休閒', '玩遊戲'],
  records: [],
  activeRecord: null,
  updatedAt: null
};

export async function ensureRemoteState() {
  const snap = await getDoc(dashboardRef);
  if (!snap.exists()) {
    await setDoc(dashboardRef, { ...defaultState, updatedAt: serverTimestamp() });
  }
}

export function subscribeDashboard(callback) {
  return onSnapshot(dashboardRef, (snap) => {
    const data = snap.exists() ? snap.data() : defaultState;
    callback({
      people: data.people || defaultState.people,
      categories: data.categories || defaultState.categories,
      records: data.records || [],
      activeRecord: data.activeRecord || null,
      updatedAt: data.updatedAt || null
    });
  });
}

export async function saveDashboardState(partialState) {
  await updateDoc(dashboardRef, {
    ...partialState,
    updatedAt: serverTimestamp()
  });
}

export { defaultState };
