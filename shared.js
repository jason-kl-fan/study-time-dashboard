export const CHART_PALETTE = [
  'rgba(255, 138, 161, 0.78)',
  'rgba(138, 168, 255, 0.78)',
  'rgba(255, 216, 140, 0.84)',
  'rgba(146, 220, 189, 0.84)',
  'rgba(191, 160, 255, 0.84)',
  'rgba(255, 170, 120, 0.84)'
];

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  if (hrs === 0) return `${mins} 分鐘`; 
  if (mins === 0) return `${hrs} 小時`;
  return `${hrs} 小時 ${mins} 分鐘`;
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

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
