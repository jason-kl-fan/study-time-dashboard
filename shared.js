export const CHART_PALETTE = [
  'rgba(255, 138, 161, 0.78)',
  'rgba(138, 168, 255, 0.78)',
  'rgba(255, 216, 140, 0.84)',
  'rgba(146, 220, 189, 0.84)',
  'rgba(191, 160, 255, 0.84)',
  'rgba(255, 170, 120, 0.84)'
];

export const DEFAULT_PEOPLE = ['Sophia', 'Ariel'];
export const DEFAULT_CATEGORIES = ['念書', '休閒', '玩遊戲'];
export const ADMIN_SESSION_KEY = 'study-time-admin-auth';
export const PROFILE_SESSION_KEY = 'study-time-profile-auth';
export const ADMIN_PASSWORD_MIN_LENGTH = 6;

const CATEGORY_LABELS = {
  '念書': '念書',
  '休閒': '休閒',
  '玩遊戲': '玩遊戲'
};

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePeople(rawPeople = []) {
  if (!Array.isArray(rawPeople) || rawPeople.length === 0) {
    return DEFAULT_PEOPLE.map((name) => ({ name, password: '', createdAt: new Date().toISOString() }));
  }

  return rawPeople.map((item) => {
    if (typeof item === 'string') {
      return { name: item, password: '', createdAt: new Date().toISOString() };
    }
    return {
      name: item.name,
      password: item.password || '',
      createdAt: item.createdAt || new Date().toISOString()
    };
  });
}

export function normalizeSettings(rawSettings = {}) {
  return {
    adminPassword: rawSettings?.adminPassword || '',
    adminUpdatedAt: rawSettings?.adminUpdatedAt || null,
    lastSecurityNote: rawSettings?.lastSecurityNote || '請記得在 Firestore 規則與 Firebase Auth 再做進一步保護。 / Please add stronger Firebase Auth and Firestore Rules later.'
  };
}

export function personNames(people = []) {
  return normalizePeople(people).map((item) => item.name);
}

export function displayCategory(category) {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  return category;
}

export function formatDateTime(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatDuration(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} 分鐘 / min`;
  if (mins === 0) return `${hrs} 小時 / hr`;
  return `${hrs} 小時 ${mins} 分鐘 / ${hrs}h ${mins}m`;
}

export function toDatetimeLocalValue(dateString) {
  const date = new Date(dateString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getRangeStart(range) {
  const now = new Date();
  if (range === 'day') return startOfDay(now);
  if (range === 'week') return startOfWeek(now);
  return startOfMonth(now);
}

export function recalcDuration(startTime, endTime) {
  return Math.max(1, Math.round((new Date(endTime) - new Date(startTime)) / 60000));
}

export function aggregateByCategory(records, categories) {
  return categories.map((category) =>
    records.filter((record) => record.category === category).reduce((sum, record) => sum + record.durationMinutes, 0)
  );
}

export function renameCategoryInState(state, oldName, newName) {
  const categories = state.categories.map((item) => (item === oldName ? newName : item));
  const records = state.records.map((record) => (record.category === oldName ? { ...record, category: newName } : record));
  const activeRecords = Object.fromEntries(
    Object.entries(state.activeRecords || {}).map(([key, value]) => [
      key,
      value?.category === oldName ? { ...value, category: newName } : value
    ])
  );
  return { categories, records, activeRecords };
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function verifyPassword(people, name, password) {
  const person = normalizePeople(people).find((item) => item.name === name);
  if (!person) return { ok: false, reason: '找不到這位人員。 / Person not found.' };
  if (!person.password) return { ok: false, reason: '這位人員尚未設定密碼。 / Password not set yet.' };
  if (person.password !== password) return { ok: false, reason: '密碼錯誤。 / Wrong password.' };
  return { ok: true, person };
}

export function updatePersonPassword(people, name, nextPassword) {
  return normalizePeople(people).map((item) =>
    item.name === name ? { ...item, password: nextPassword } : item
  );
}

export function verifyAdminPassword(settings, password) {
  const normalized = normalizeSettings(settings);
  if (!normalized.adminPassword) return { ok: false, reason: '尚未設定後台管理密碼。 / Admin password not set.' };
  if (normalized.adminPassword !== password) return { ok: false, reason: '管理密碼錯誤。 / Wrong admin password.' };
  return { ok: true };
}

export function createSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function saveAdminSession() {
  localStorage.setItem(ADMIN_SESSION_KEY, createSessionToken());
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function hasAdminSession() {
  return Boolean(localStorage.getItem(ADMIN_SESSION_KEY));
}

export function saveProfileSession(name) {
  localStorage.setItem(PROFILE_SESSION_KEY, JSON.stringify({ name, token: createSessionToken() }));
}

export function clearProfileSession() {
  localStorage.removeItem(PROFILE_SESSION_KEY);
}

export function getProfileSession() {
  try {
    const raw = localStorage.getItem(PROFILE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
