import {
  ensureRemoteState,
  subscribeDashboard,
  saveDashboardState
} from './firebase.js';
import {
  formatDateTime,
  formatDuration,
  toDatetimeLocalValue,
  getRangeStart,
  recalcDuration,
  aggregateByCategory,
  downloadBlob,
  CHART_PALETTE,
  personNames,
  normalizePeople,
  updatePersonPassword
} from './shared.js';

const syncBanner = document.getElementById('syncBanner');
const rangeSelect = document.getElementById('rangeSelect');
const statsPersonSelect = document.getElementById('statsPersonSelect');
const statsCategorySelect = document.getElementById('statsCategorySelect');
const summaryCards = document.getElementById('summaryCards');
const recordsTableBody = document.getElementById('recordsTableBody');
const newPersonInput = document.getElementById('newPersonInput');
const newCategoryInput = document.getElementById('newCategoryInput');
const addPersonBtn = document.getElementById('addPersonBtn');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const peopleTags = document.getElementById('peopleTags');
const categoryTags = document.getElementById('categoryTags');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const clearDataBtn = document.getElementById('clearDataBtn');

let dashboardState = { people: [], categories: [], records: [], activeRecords: {} };
let barChart;
let pieChart;

function setSyncStatus(text, ok = true) {
  syncBanner.textContent = text;
  syncBanner.className = ok ? 'sync-banner' : 'sync-banner sync-banner-error';
}

function renderAdminSelectOptions() {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  statsPersonSelect.innerHTML = ['<option value="all">全部人員</option>']
    .concat(people.map((person) => `<option value="${person}">${person}</option>`))
    .join('');
  statsCategorySelect.innerHTML = ['<option value="all">全部項目</option>']
    .concat(categories.map((category) => `<option value="${category}">${category}</option>`))
    .join('');
}

function renderTags() {
  peopleTags.innerHTML = normalizePeople(dashboardState.people)
    .map((person) => `<span class="tag">${person.name}<button type="button" onclick="window.resetPersonPassword('${person.name.replace(/'/g, "\\'")}')">設密碼</button><button type="button" onclick="window.removePerson('${person.name.replace(/'/g, "\\'")}')">×</button></span>`)
    .join('');

  categoryTags.innerHTML = dashboardState.categories
    .map((category) => `<span class="tag">${category}<button type="button" onclick="window.removeCategory('${category.replace(/'/g, "\\'")}')">×</button></span>`)
    .join('');
}

function collectStats() {
  const range = rangeSelect.value;
  const selectedPerson = statsPersonSelect.value;
  const selectedCategory = statsCategorySelect.value;
  const rangeStart = getRangeStart(range);

  return dashboardState.records.filter((record) => {
    const start = new Date(record.startTime);
    const inRange = start >= rangeStart;
    const personMatch = selectedPerson === 'all' ? true : record.person === selectedPerson;
    const categoryMatch = selectedCategory === 'all' ? true : record.category === selectedCategory;
    return inRange && personMatch && categoryMatch;
  });
}

function renderSummary(records) {
  const totalMinutes = records.reduce((sum, item) => sum + item.durationMinutes, 0);
  const studyMinutes = records.filter((item) => item.category === '念書').reduce((sum, item) => sum + item.durationMinutes, 0);
  const leisureMinutes = records.filter((item) => item.category === '休閒').reduce((sum, item) => sum + item.durationMinutes, 0);
  const gameMinutes = records.filter((item) => item.category === '玩遊戲').reduce((sum, item) => sum + item.durationMinutes, 0);

  summaryCards.innerHTML = [
    { label: '總時數', value: formatDuration(totalMinutes) },
    { label: '念書時間', value: formatDuration(studyMinutes) },
    { label: '休閒＋遊戲', value: formatDuration(leisureMinutes + gameMinutes) }
  ]
    .map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div></div>`)
    .join('');
}

function renderCharts(records) {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  const selectedPerson = statsPersonSelect.value;
  const chartRecords = selectedPerson === 'all' ? records : records.filter((r) => r.person === selectedPerson);
  const categoryTotals = aggregateByCategory(chartRecords, categories);

  if (barChart) barChart.destroy();
  if (pieChart) pieChart.destroy();

  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: categories,
      datasets: people.map((person, index) => ({
        label: person,
        data: aggregateByCategory(records.filter((record) => record.person === person), categories),
        backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
        borderRadius: 10
      }))
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: '分鐘' } } }
    }
  });

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{ data: categoryTotals, backgroundColor: categories.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderRecordsTable(records) {
  const sorted = [...records].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  if (!sorted.length) {
    recordsTableBody.innerHTML = '<tr><td colspan="6">目前這個區間沒有資料。</td></tr>';
    return;
  }

  recordsTableBody.innerHTML = sorted
    .map(
      (record) => `
        <tr>
          <td>${record.person}</td>
          <td>${record.category}</td>
          <td>${formatDateTime(record.startTime)}</td>
          <td>${formatDateTime(record.endTime)}</td>
          <td>${record.durationMinutes}</td>
          <td>
            <div class="action-cell">
              <button class="small-btn edit-btn" onclick="window.editRecord('${record.id}')">編輯</button>
              <button class="small-btn delete-btn" onclick="window.deleteRecord('${record.id}')">刪除</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
}

function renderAdminStats() {
  const statsRecords = collectStats();
  renderSummary(statsRecords);
  renderCharts(statsRecords);
  renderRecordsTable(statsRecords);
}

function refreshAdmin() {
  const selectedPerson = statsPersonSelect.value;
  const selectedCategory = statsCategorySelect.value;
  renderAdminSelectOptions();
  renderTags();
  if ([...statsPersonSelect.options].some((opt) => opt.value === selectedPerson)) statsPersonSelect.value = selectedPerson;
  if ([...statsCategorySelect.options].some((opt) => opt.value === selectedCategory)) statsCategorySelect.value = selectedCategory;
  renderAdminStats();
}

async function addPerson() {
  const value = newPersonInput.value.trim();
  if (!value) return;
  const people = normalizePeople(dashboardState.people);
  if (people.some((item) => item.name === value)) return alert('這個人員已存在。');
  const password = prompt(`請為 ${value} 設定初始密碼`);
  if (!password || password.length < 4) return alert('密碼至少 4 碼。');
  await saveDashboardState({ people: people.concat({ name: value, password, createdAt: new Date().toISOString() }) });
  newPersonInput.value = '';
}

async function addCategory() {
  const value = newCategoryInput.value.trim();
  if (!value) return;
  if (dashboardState.categories.includes(value)) return alert('這個項目已存在。');
  await saveDashboardState({ categories: dashboardState.categories.concat(value) });
  newCategoryInput.value = '';
}

window.resetPersonPassword = async function resetPersonPassword(name) {
  const nextPassword = prompt(`請輸入 ${name} 的新密碼`);
  if (!nextPassword || nextPassword.length < 4) return alert('密碼至少 4 碼。');
  await saveDashboardState({ people: updatePersonPassword(dashboardState.people, name, nextPassword) });
};

window.removePerson = async function removePerson(person) {
  const people = normalizePeople(dashboardState.people);
  if (people.length <= 1) return alert('至少要保留一位人員。');
  const used = dashboardState.records.some((record) => record.person === person) || dashboardState.activeRecords?.[person];
  if (used) return alert('這個人員已經有使用紀錄，暫時不能刪除。');
  await saveDashboardState({ people: people.filter((item) => item.name !== person) });
};

window.removeCategory = async function removeCategory(category) {
  if (dashboardState.categories.length <= 1) return alert('至少要保留一個項目。');
  const used = dashboardState.records.some((record) => record.category === category) || Object.values(dashboardState.activeRecords || {}).some((item) => item.category === category);
  if (used) return alert('這個項目已經有使用紀錄，暫時不能刪除。');
  await saveDashboardState({ categories: dashboardState.categories.filter((item) => item !== category) });
};

window.deleteRecord = async function deleteRecord(id) {
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  await saveDashboardState({ records: dashboardState.records.filter((record) => record.id !== id) });
};

window.editRecord = async function editRecord(id) {
  const record = dashboardState.records.find((item) => item.id === id);
  if (!record) return;

  const person = prompt(`請輸入人員名稱（可用：${personNames(dashboardState.people).join(' / ')}）`, record.person);
  if (!person) return;
  const category = prompt(`請輸入項目名稱（可用：${dashboardState.categories.join(' / ')}）`, record.category);
  if (!category) return;
  const start = prompt('請輸入開始時間（格式：YYYY-MM-DDTHH:mm）', toDatetimeLocalValue(record.startTime));
  if (!start) return;
  const end = prompt('請輸入結束時間（格式：YYYY-MM-DDTHH:mm）', toDatetimeLocalValue(record.endTime));
  if (!end) return;

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return alert('時間格式不正確，或結束時間必須晚於開始時間。');
  if (!personNames(dashboardState.people).includes(person)) return alert('人員不存在，請先新增該人員。');
  if (!dashboardState.categories.includes(category)) return alert('項目不存在，請先新增該項目。');

  await saveDashboardState({
    records: dashboardState.records.map((item) =>
      item.id === id
        ? { ...item, person, category, startTime: startDate.toISOString(), endTime: endDate.toISOString(), durationMinutes: recalcDuration(startDate.toISOString(), endDate.toISOString()) }
        : item
    )
  });
};

function exportCsv() {
  if (!dashboardState.records.length) return alert('目前沒有資料可以匯出。');
  const rows = [['人員', '項目', '開始時間', '結束時間', '分鐘數']].concat(
    dashboardState.records.map((record) => [record.person, record.category, record.startTime, record.endTime, record.durationMinutes])
  );
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  downloadBlob('study-time-records.csv', new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
}

function exportExcel() {
  if (!dashboardState.records.length) return alert('目前沒有資料可以匯出。');
  const worksheet = XLSX.utils.json_to_sheet(
    dashboardState.records.map((record) => ({ 人員: record.person, 項目: record.category, 開始時間: formatDateTime(record.startTime), 結束時間: formatDateTime(record.endTime), 分鐘數: record.durationMinutes }))
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '時間紀錄');
  XLSX.writeFile(workbook, 'study-time-records.xlsx');
}

addPersonBtn.addEventListener('click', addPerson);
addCategoryBtn.addEventListener('click', addCategory);
newPersonInput.addEventListener('keydown', (e) => e.key === 'Enter' && addPerson());
newCategoryInput.addEventListener('keydown', (e) => e.key === 'Enter' && addCategory());
rangeSelect.addEventListener('change', renderAdminStats);
statsPersonSelect.addEventListener('change', renderAdminStats);
statsCategorySelect.addEventListener('change', renderAdminStats);
exportCsvBtn.addEventListener('click', exportCsv);
exportExcelBtn.addEventListener('click', exportExcel);
clearDataBtn.addEventListener('click', async () => {
  if (!confirm('確定要清除所有雲端資料嗎？這個動作無法復原。')) return;
  await saveDashboardState({ records: [], activeRecords: {} });
});

(async function init() {
  try {
    await ensureRemoteState();
    subscribeDashboard(
      (state) => {
        dashboardState = state;
        setSyncStatus('雲端同步狀態：已連線 Cloud Sync Connected');
        refreshAdmin();
      },
      (error) => {
        console.error(error);
        setSyncStatus(`雲端同步狀態：${error.code || '連線失敗'}，請檢查 Firestore 是否已開啟`, false);
      }
    );
  } catch (error) {
    console.error(error);
    setSyncStatus('雲端同步狀態：連線失敗，請檢查 Firebase 設定', false);
  }
})();
