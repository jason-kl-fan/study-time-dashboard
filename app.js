const STORAGE_KEY = 'study-time-dashboard-records';
const ACTIVE_KEY = 'study-time-dashboard-active';
const PEOPLE_KEY = 'study-time-dashboard-people';
const CATEGORY_KEY = 'study-time-dashboard-categories';
const DEFAULT_PEOPLE = ['Sophia', 'Ariel'];
const DEFAULT_CATEGORIES = ['念書', '休閒', '玩遊戲'];
const CHART_PALETTE = [
  'rgba(255, 138, 161, 0.78)',
  'rgba(138, 168, 255, 0.78)',
  'rgba(255, 216, 140, 0.84)',
  'rgba(146, 220, 189, 0.84)',
  'rgba(191, 160, 255, 0.84)',
  'rgba(255, 170, 120, 0.84)'
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStoredList(key, fallback) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

function saveStoredList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getPeople() {
  return getStoredList(PEOPLE_KEY, DEFAULT_PEOPLE);
}

function savePeople(value) {
  saveStoredList(PEOPLE_KEY, value);
}

function getCategories() {
  return getStoredList(CATEGORY_KEY, DEFAULT_CATEGORIES);
}

function saveCategories(value) {
  saveStoredList(CATEGORY_KEY, value);
}

function getRecords() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getActiveRecord() {
  return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
}

function saveActiveRecord(record) {
  if (record) localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
  else localStorage.removeItem(ACTIVE_KEY);
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDuration(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} 分鐘`;
  if (mins === 0) return `${hrs} 小時`;
  return `${hrs} 小時 ${mins} 分鐘`;
}

function toDatetimeLocalValue(dateString) {
  const date = new Date(dateString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getRangeStart(range) {
  const now = new Date();
  if (range === 'day') return startOfDay(now);
  if (range === 'week') return startOfWeek(now);
  return startOfMonth(now);
}

function recalcDuration(startTime, endTime) {
  return Math.max(1, Math.round((new Date(endTime) - new Date(startTime)) / 60000));
}

function aggregateByCategory(records, categories) {
  return categories.map((category) =>
    records.filter((record) => record.category === category).reduce((sum, record) => sum + record.durationMinutes, 0)
  );
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
