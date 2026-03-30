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
import { DEFAULT_CATEGORIES, DEFAULT_PEOPLE, normalizePeople } from './shared.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const dashboardRef = doc(db, 'studyTimeDashboard', 'main');

const defaultState = {
  people: normalizePeople(DEFAULT_PEOPLE),
  categories: DEFAULT_CATEGORIES,
  records: [],
  activeRecords: {},
  updatedAt: null
};

export async function ensureRemoteState() {
  const snap = await getDoc(dashboardRef);
  if (!snap.exists()) {
    await setDoc(dashboardRef, { ...defaultState, updatedAt: serverTimestamp() });
    return;
  }

  const data = snap.data();
  const patch = {};
  if (!Array.isArray(data.people) || (data.people[0] && typeof data.people[0] === 'string')) {
    patch.people = normalizePeople(data.people || DEFAULT_PEOPLE);
  }
  if (!data.activeRecords) {
    patch.activeRecords = {};
  }
  if (Object.keys(patch).length) {
    await updateDoc(dashboardRef, { ...patch, updatedAt: serverTimestamp() });
  }
}

export function subscribeDashboard(callback) {
  return onSnapshot(dashboardRef, (snap) => {
    const data = snap.exists() ? snap.data() : defaultState;
    callback({
      people: normalizePeople(data.people || defaultState.people),
      categories: data.categories || defaultState.categories,
      records: data.records || [],
      activeRecords: data.activeRecords || {},
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
