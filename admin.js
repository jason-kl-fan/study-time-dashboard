import {
  ensureRemoteState,
  subscribeDashboard,
  saveDashboardState
} from './firebase.js';
import {
  formatDateTime,
  formatDuration,
  formatDelta,
  toDatetimeLocalValue,
  getRangeStart,
  getPreviousRangeStart,
  recalcDuration,
  aggregateByCategory,
  downloadBlob,
  CHART_PALETTE,
  personNames,
  normalizePeople,
  normalizeSettings,
  updatePersonPassword,
  verifyAdminPassword,
  ADMIN_PASSWORD_MIN_LENGTH,
  hasAdminSession,
  saveAdminSession,
  clearAdminSession,
  displayCategory,
  renameCategoryInState
} from './shared.js';

window.__bootStatus?.('後台模組已載入 / Admin module loaded');
if (window.ChartDataLabels) {
  Chart.register(window.ChartDataLabels);
  window.__bootStatus?.('後台圖表插件已載入 / Chart plugin ready');
} else {
  console.warn('ChartDataLabels plugin not loaded; continuing without datalabels.');
  window.__bootStatus?.('後台圖表插件缺失，略過 / Chart plugin missing, skipped');
}

const syncIndicator = document.getElementById('syncIndicator');
const syncLabel = document.getElementById('syncLabel');
const diagnosticBox = document.getElementById('diagnosticBox');
const securityNoteText = document.getElementById('securityNoteText');
const adminAuthShell = document.getElementById('adminAuthShell');
const adminLoginPanel = document.getElementById('adminLoginPanel');
const adminSetupPanel = document.getElementById('adminSetupPanel');
const adminAppShell = document.getElementById('adminAppShell');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLoginStatus = document.getElementById('adminLoginStatus');
const setupAdminPasswordInput = document.getElementById('setupAdminPasswordInput');
const setupAdminPasswordBtn = document.getElementById('setupAdminPasswordBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const rangeSelect = document.getElementById('rangeSelect');
const statsPersonSelect = document.getElementById('statsPersonSelect');
const statsCategorySelect = document.getElementById('statsCategorySelect');
const compareModeSelect = document.getElementById('compareModeSelect');
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

let dashboardState = { people: [], categories: [], records: [], activeRecords: {}, settings: {} };
let barChart;
let pieChart;

function setSyncStatus(status, text) {
  syncIndicator.className = `status-indicator status-${status}`;
  syncIndicator.title = text;
  syncLabel.textContent = text;
}

function setDiagnostic(text, isError = false) {
  diagnosticBox.textContent = `診斷訊息 / Diagnostic：${text}`;
  diagnosticBox.className = isError ? 'diagnostic-box subtle-diagnostic diagnostic-box-error' : 'diagnostic-box subtle-diagnostic';
}

function percentOf(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function getRangeLabel(range, previous = false) {
  if (range === 'day') return previous ? '昨天 / Previous Day' : '今天 / Current Day';
  if (range === 'week') return previous ? '上週 / Previous Week' : '本週 / Current Week';
  return previous ? '上月 / Previous Month' : '本月 / Current Month';
}

function isAdminUnlocked() {
  return hasAdminSession() && Boolean(normalizeSettings(dashboardState.settings).adminPassword);
}

function updateAuthUI() {
  const settings = normalizeSettings(dashboardState.settings);
  securityNoteText.textContent = settings.lastSecurityNote;
  const hasPassword = Boolean(settings.adminPassword);
  const unlocked = isAdminUnlocked();
  adminSetupPanel.classList.toggle('hidden', hasPassword);
  adminLoginPanel.classList.toggle('hidden', !hasPassword || unlocked);
  adminAuthShell.classList.toggle('hidden', unlocked);
  adminAppShell.classList.toggle('hidden', !unlocked);
  if (!hasPassword) adminLoginStatus.textContent = '尚未設定後台密碼。 / Admin password not set.';
  else if (!unlocked) adminLoginStatus.textContent = '請先輸入管理密碼。 / Enter admin password first.';
}

function renderAdminSelectOptions() {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  statsPersonSelect.innerHTML = ['<option value="all">全部人員 / All</option>'].concat(people.map((person) => `<option value="${person}">${person}</option>`)).join('');
  statsCategorySelect.innerHTML = ['<option value="all">全部項目 / All</option>'].concat(categories.map((category) => `<option value="${category}">${displayCategory(category)}</option>`)).join('');
}

function renderTags() {
  peopleTags.innerHTML = normalizePeople(dashboardState.people).map((person) => `<span class="tag">${person.name}<button type="button" onclick="window.resetPersonPassword('${person.name.replace(/'/g, "\\'")}')">設密碼 / Password</button><button type="button" onclick="window.removePerson('${person.name.replace(/'/g, "\\'")}')">刪除 / Delete</button></span>`).join('');
  categoryTags.innerHTML = dashboardState.categories.map((category) => `<span class="tag">${displayCategory(category)}<button type="button" onclick="window.editCategory('${category.replace(/'/g, "\\'")}')">編輯 / Edit</button><button type="button" onclick="window.removeCategory('${category.replace(/'/g, "\\'")}')">刪除 / Delete</button></span>`).join('');
}

function collectStats() {
  const range = rangeSelect.value;
  const compareMode = compareModeSelect.value;
  const rangeStart = getRangeStart(range);
  const previousRangeStart = getPreviousRangeStart(range);
  const selectedPerson = statsPersonSelect.value;
  const selectedCategory = statsCategorySelect.value;

  const matchesFilters = (record) =>
    (selectedPerson === 'all' || record.person === selectedPerson) &&
    (selectedCategory === 'all' || record.category === selectedCategory);

  const currentRecords = dashboardState.records.filter((record) => {
    const start = new Date(record.startTime);
    return start >= rangeStart && matchesFilters(record);
  });

  const previousRecords = compareMode === 'previous'
    ? dashboardState.records.filter((record) => {
        const start = new Date(record.startTime);
        return start >= previousRangeStart && start < rangeStart && matchesFilters(record);
      })
    : [];

  return { currentRecords, previousRecords, compareMode, range };
}

function renderSummary(currentRecords, previousRecords, compareMode, range) {
  const totalMinutes = currentRecords.reduce((sum, item) => sum + item.durationMinutes, 0);
  const previousTotalMinutes = previousRecords.reduce((sum, item) => sum + item.durationMinutes, 0);
  const studyMinutes = currentRecords.filter((item) => item.category === '念書').reduce((sum, item) => sum + item.durationMinutes, 0);
  const previousStudyMinutes = previousRecords.filter((item) => item.category === '念書').reduce((sum, item) => sum + item.durationMinutes, 0);
  const leisureMinutes = currentRecords.filter((item) => item.category === '休閒').reduce((sum, item) => sum + item.durationMinutes, 0);
  const gameMinutes = currentRecords.filter((item) => item.category === '玩遊戲').reduce((sum, item) => sum + item.durationMinutes, 0);
  const previousLeisureMinutes = previousRecords.filter((item) => item.category === '休閒').reduce((sum, item) => sum + item.durationMinutes, 0);
  const previousGameMinutes = previousRecords.filter((item) => item.category === '玩遊戲').reduce((sum, item) => sum + item.durationMinutes, 0);

  summaryCards.innerHTML = [
    {
      label: '總統計時間 / Total Time',
      value: formatDuration(totalMinutes),
      sub: compareMode === 'previous' ? `相較${getRangeLabel(range, true)}：${formatDelta(totalMinutes - previousTotalMinutes)}` : `${currentRecords.length} 筆紀錄 / records`
    },
    {
      label: '念書時間 / Study Time',
      value: formatDuration(studyMinutes),
      sub: compareMode === 'previous' ? `相較${getRangeLabel(range, true)}：${formatDelta(studyMinutes - previousStudyMinutes)}` : percentOf(studyMinutes, totalMinutes)
    },
    {
      label: '休閒＋遊戲 / Leisure + Gaming',
      value: formatDuration(leisureMinutes + gameMinutes),
      sub: compareMode === 'previous'
        ? `相較${getRangeLabel(range, true)}：${formatDelta(leisureMinutes + gameMinutes - previousLeisureMinutes - previousGameMinutes)}`
        : percentOf(leisureMinutes + gameMinutes, totalMinutes)
    }
  ].map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div><div class="summary-sub">${card.sub}</div></div>`).join('');
}

function renderCharts(currentRecords, previousRecords, compareMode, range) {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  const selectedPerson = statsPersonSelect.value;
  const chartCurrentRecords = selectedPerson === 'all' ? currentRecords : currentRecords.filter((r) => r.person === selectedPerson);
  const chartPreviousRecords = selectedPerson === 'all' ? previousRecords : previousRecords.filter((r) => r.person === selectedPerson);
  const categoryTotals = aggregateByCategory(chartCurrentRecords, categories);
  const previousCategoryTotals = aggregateByCategory(chartPreviousRecords, categories);

  if (barChart) barChart.destroy();
  if (pieChart) pieChart.destroy();

  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: categories.map(displayCategory),
      datasets: compareMode === 'previous'
        ? [
            {
              label: getRangeLabel(range, false),
              data: categoryTotals,
              backgroundColor: CHART_PALETTE[0],
              borderRadius: 10,
              maxBarThickness: 34,
              categoryPercentage: 0.66,
              barPercentage: 0.76,
              datalabels: { display: false, color: '#4b415f', formatter: (value) => (value ? formatDuration(value) : '') }
            },
            {
              label: getRangeLabel(range, true),
              data: previousCategoryTotals,
              backgroundColor: 'rgba(138, 168, 255, 0.72)',
              borderRadius: 10,
              maxBarThickness: 34,
              categoryPercentage: 0.66,
              barPercentage: 0.76,
              datalabels: { display: false, color: '#4b415f', formatter: (value) => (value ? formatDuration(value) : '') }
            }
          ]
        : people.map((person, index) => ({
            label: person,
            data: aggregateByCategory(currentRecords.filter((record) => record.person === person), categories),
            backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
            borderRadius: 10,
            maxBarThickness: 34,
            categoryPercentage: 0.66,
            barPercentage: 0.76,
            datalabels: {
              display: false,
              color: '#4b415f',
              formatter: (value) => (value ? formatDuration(value) : '')
            }
          }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.1,
      layout: {
        padding: {
          top: 12,
          right: 10,
          left: 8,
          bottom: 8
        }
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            padding: 12,
            boxWidth: 18,
            usePointStyle: false,
            font: {
              size: 11
            }
          }
        },
        datalabels: {
          display: false
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: {
            maxRotation: 0,
            autoSkip: false,
            padding: 8,
            font: {
              size: 11
            }
          },
          grid: {
            drawBorder: false
          }
        },
        y: {
          beginAtZero: true,
          grace: '12%',
          title: { display: true, text: '分鐘 / Minutes' },
          grid: {
            drawBorder: false
          }
        }
      }
    }
  });

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: categories.map(displayCategory),
      datasets: [{
        data: categoryTotals,
        backgroundColor: categories.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        datalabels: {
          color: '#3d3552',
          font: { weight: '700', size: 12 },
          formatter: (value, context) => {
            const total = context.dataset.data.reduce((sum, item) => sum + item, 0);
            if (!value || !total) return '';
            return `${Math.round((value / total) * 100)}%\n${formatDuration(value)}`;
          }
        }
      }
    }
  });
}

function renderRecordsTable(records) {
  const sorted = [...records].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  if (!sorted.length) {
    recordsTableBody.innerHTML = '<tr><td colspan="6">目前這個區間沒有資料。 / No data in this range.</td></tr>';
    return;
  }
  recordsTableBody.innerHTML = sorted.map((record) => `
    <tr>
      <td>${record.person}</td>
      <td>${displayCategory(record.category)}</td>
      <td>${formatDateTime(record.startTime)}</td>
      <td>${formatDateTime(record.endTime)}</td>
      <td>${record.durationMinutes}</td>
      <td><div class="action-cell"><button class="small-btn edit-btn" onclick="window.editRecord('${record.id}')">編輯 / Edit</button><button class="small-btn delete-btn" onclick="window.deleteRecord('${record.id}')">刪除 / Delete</button></div></td>
    </tr>
  `).join('');
}

function renderAdminStats() {
  const { currentRecords, previousRecords, compareMode, range } = collectStats();
  renderSummary(currentRecords, previousRecords, compareMode, range);
  renderCharts(currentRecords, previousRecords, compareMode, range);
  renderRecordsTable(currentRecords);
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
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  const value = newPersonInput.value.trim();
  if (!value) return;
  const people = normalizePeople(dashboardState.people);
  if (people.some((item) => item.name === value)) return alert('這個人員已存在。 / Person exists.');
  const password = prompt(`請為 ${value} 設定初始密碼 / Set initial password`);
  if (!password || password.length < 4) return alert('密碼至少 4 碼。 / At least 4 characters.');
  await saveDashboardState({ people: people.concat({ name: value, password, createdAt: new Date().toISOString() }) });
  newPersonInput.value = '';
}

async function addCategory() {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  const value = newCategoryInput.value.trim();
  if (!value) return;
  if (dashboardState.categories.includes(value)) return alert('這個項目已存在。 / Category exists.');
  await saveDashboardState({ categories: dashboardState.categories.concat(value) });
  newCategoryInput.value = '';
}

async function setupAdminPassword() {
  const password = setupAdminPasswordInput.value.trim();
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return alert(`管理密碼至少 ${ADMIN_PASSWORD_MIN_LENGTH} 碼。 / At least ${ADMIN_PASSWORD_MIN_LENGTH} chars.`);
  await saveDashboardState({ settings: { ...normalizeSettings(dashboardState.settings), adminPassword: password, adminUpdatedAt: new Date().toISOString() } });
  setupAdminPasswordInput.value = '';
  alert('管理密碼已建立，請直接登入後台。 / Admin password saved.');
}

function loginAdmin() {
  const result = verifyAdminPassword(dashboardState.settings, adminPasswordInput.value.trim());
  if (!result.ok) {
    adminLoginStatus.textContent = result.reason;
    return;
  }
  saveAdminSession();
  adminPasswordInput.value = '';
  adminLoginStatus.textContent = '登入成功。 / Login successful.';
  updateAuthUI();
  refreshAdmin();
}

function logoutAdmin() {
  clearAdminSession();
  updateAuthUI();
}

window.resetPersonPassword = async function resetPersonPassword(name) {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  const nextPassword = prompt(`請輸入 ${name} 的新密碼 / New password`);
  if (!nextPassword || nextPassword.length < 4) return alert('密碼至少 4 碼。 / At least 4 characters.');
  await saveDashboardState({ people: updatePersonPassword(dashboardState.people, name, nextPassword) });
};

window.editCategory = async function editCategory(category) {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  const nextName = prompt(`請輸入新的項目名稱 / Enter new category name`, category);
  if (!nextName || nextName.trim() === category) return;
  const trimmed = nextName.trim();
  if (dashboardState.categories.includes(trimmed)) return alert('這個項目名稱已存在。 / Category already exists.');
  const renamed = renameCategoryInState(dashboardState, category, trimmed);
  await saveDashboardState(renamed);
};

window.removePerson = async function removePerson(person) {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  const people = normalizePeople(dashboardState.people);
  if (people.length <= 1) return alert('至少要保留一位人員。 / Keep at least one person.');

  const hasRecords = dashboardState.records.some((record) => record.person === person);
  const hasActive = Boolean(dashboardState.activeRecords?.[person]);
  const confirmMessage = hasRecords || hasActive
    ? `確定要刪除 ${person} 嗎？這會連同此人所有歷史紀錄與進行中紀錄一併刪除，且無法復原。 / Delete ${person} and all related records?`
    : `確定要刪除 ${person} 嗎？ / Delete ${person}?`;

  if (!confirm(confirmMessage)) return;

  const nextActiveRecords = { ...(dashboardState.activeRecords || {}) };
  delete nextActiveRecords[person];

  await saveDashboardState({
    people: people.filter((item) => item.name !== person),
    records: dashboardState.records.filter((record) => record.person !== person),
    activeRecords: nextActiveRecords
  });
};

window.removeCategory = async function removeCategory(category) {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  if (dashboardState.categories.length <= 1) return alert('至少要保留一個項目。 / Keep at least one category.');
  const used = dashboardState.records.some((record) => record.category === category) || Object.values(dashboardState.activeRecords || {}).some((item) => item.category === category);
  if (used) return alert('這個項目已有使用紀錄，不能刪除。 / Category has data.');
  await saveDashboardState({ categories: dashboardState.categories.filter((item) => item !== category) });
};

window.deleteRecord = async function deleteRecord(id) {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  if (!confirm('確定要刪除這筆紀錄嗎？ / Delete this record?')) return;
  await saveDashboardState({ records: dashboardState.records.filter((record) => record.id !== id) });
};

window.editRecord = async function editRecord(id) {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  const record = dashboardState.records.find((item) => item.id === id);
  if (!record) return;
  const person = prompt(`請輸入人員名稱 / Person (${personNames(dashboardState.people).join(' / ')})`, record.person);
  if (!person) return;
  const category = prompt(`請輸入項目名稱 / Category (${dashboardState.categories.map(displayCategory).join(' / ')})`, record.category);
  if (!category) return;
  const start = prompt('請輸入開始時間 / Start (YYYY-MM-DDTHH:mm)', toDatetimeLocalValue(record.startTime));
  if (!start) return;
  const end = prompt('請輸入結束時間 / End (YYYY-MM-DDTHH:mm)', toDatetimeLocalValue(record.endTime));
  if (!end) return;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return alert('時間格式不正確，或結束時間必須晚於開始時間。 / Invalid time.');
  if (!personNames(dashboardState.people).includes(person)) return alert('人員不存在。 / Person not found.');
  if (!dashboardState.categories.includes(category)) return alert('項目不存在。 / Category not found.');
  await saveDashboardState({ records: dashboardState.records.map((item) => item.id === id ? { ...item, person, category, startTime: startDate.toISOString(), endTime: endDate.toISOString(), durationMinutes: recalcDuration(startDate.toISOString(), endDate.toISOString()) } : item) });
};

function exportCsv() {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  if (!dashboardState.records.length) return alert('目前沒有資料可以匯出。 / No data.');
  const rows = [['人員 / Person', '項目 / Category', '開始時間 / Start', '結束時間 / End', '分鐘數 / Minutes']].concat(dashboardState.records.map((record) => [record.person, displayCategory(record.category), record.startTime, record.endTime, record.durationMinutes]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob('study-time-records.csv', new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}

function exportExcel() {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  if (!dashboardState.records.length) return alert('目前沒有資料可以匯出。 / No data.');
  const sheet = XLSX.utils.json_to_sheet(dashboardState.records.map((record) => ({ '人員 / Person': record.person, '項目 / Category': displayCategory(record.category), '開始時間 / Start': record.startTime, '結束時間 / End': record.endTime, '分鐘數 / Minutes': record.durationMinutes })));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Records');
  XLSX.writeFile(workbook, 'study-time-records.xlsx');
}

async function clearAllData() {
  if (!isAdminUnlocked()) return alert('請先登入後台。 / Login first.');
  if (!confirm('確定要清除所有紀錄與進行中資料嗎？ / Clear all data?')) return;
  await saveDashboardState({ records: [], activeRecords: {} });
}

async function init() {
  setSyncStatus('loading', '初始化中 / Initializing');
  adminLoginBtn.addEventListener('click', loginAdmin);
  setupAdminPasswordBtn.addEventListener('click', setupAdminPassword);
  adminLogoutBtn.addEventListener('click', logoutAdmin);
  addPersonBtn.addEventListener('click', addPerson);
  addCategoryBtn.addEventListener('click', addCategory);
  exportCsvBtn.addEventListener('click', exportCsv);
  exportExcelBtn.addEventListener('click', exportExcel);
  clearDataBtn.addEventListener('click', clearAllData);
  rangeSelect.addEventListener('change', refreshAdmin);
  statsPersonSelect.addEventListener('change', refreshAdmin);
  statsCategorySelect.addEventListener('change', refreshAdmin);
  compareModeSelect.addEventListener('change', refreshAdmin);
  try {
    setDiagnostic('開始初始化 Firebase / Firestore...');
    await ensureRemoteState();
    setDiagnostic('已通過 ensureRemoteState，開始訂閱雲端資料 / Subscribing...');
    subscribeDashboard((state) => {
      dashboardState = state;
      setSyncStatus('online', '已連線 / Connected');
      setDiagnostic('後台已收到 Firestore 資料。 / Admin synced.');
      updateAuthUI();
      if (isAdminUnlocked()) refreshAdmin();
    }, (error) => {
      console.error(error);
      setSyncStatus('error', '連線失敗 / Error');
      setDiagnostic(`${error.name || 'Error'}: ${error.message || error.code || '未知錯誤'}`, true);
    });
  } catch (error) {
    console.error(error);
    setSyncStatus('error', '初始化失敗 / Init Failed');
    setDiagnostic(`${error.name || 'Error'}: ${error.message || '初始化失敗'}`, true);
  }
}

init();
