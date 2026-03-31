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

window.__bootStatus?.('後台模組已載入');
if (window.ChartDataLabels) {
  Chart.register(window.ChartDataLabels);
  window.__bootStatus?.('後台圖表插件已載入');
} else {
  console.warn('ChartDataLabels plugin not loaded; continuing without datalabels.');
  window.__bootStatus?.('後台圖表插件缺失，已略過');
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
const recordsCardList = document.getElementById('recordsCardList');
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

function isMobileView() {
  return window.innerWidth <= 640;
}

function setSyncStatus(status, text) {
  syncIndicator.className = `status-indicator status-${status}`;
  syncIndicator.title = text;
  syncLabel.textContent = text;
}

function setDiagnostic(text, isError = false) {
  diagnosticBox.textContent = `診斷訊息：${text}`;
  diagnosticBox.className = isError ? 'diagnostic-box subtle-diagnostic diagnostic-box-error' : 'diagnostic-box subtle-diagnostic';
}

function percentOf(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function getRangeLabel(range, previous = false) {
  if (range === 'day') return previous ? '昨天' : '今天';
  if (range === 'week') return previous ? '上週' : '本週';
  return previous ? '上月' : '本月';
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
  if (!hasPassword) adminLoginStatus.textContent = '尚未設定後台密碼。';
  else if (!unlocked) adminLoginStatus.textContent = '請先輸入管理密碼。';
}

function renderAdminSelectOptions() {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  statsPersonSelect.innerHTML = ['<option value="all">全部人員</option>'].concat(people.map((person) => `<option value="${person}">${person}</option>`)).join('');
  statsCategorySelect.innerHTML = ['<option value="all">全部項目</option>'].concat(categories.map((category) => `<option value="${category}">${displayCategory(category)}</option>`)).join('');
}

function renderTags() {
  peopleTags.innerHTML = normalizePeople(dashboardState.people).map((person) => `
    <span class="tag">
      <span class="tag-name">${person.name}</span>
      <button type="button" onclick="window.resetPersonPassword('${person.name.replace(/'/g, "\\'")}')">設密碼</button>
      <button type="button" onclick="window.removePerson('${person.name.replace(/'/g, "\\'")}')">刪除</button>
    </span>
  `).join('');

  categoryTags.innerHTML = dashboardState.categories.map((category) => `
    <span class="tag">
      <span class="tag-name">${displayCategory(category)}</span>
      <button type="button" onclick="window.editCategory('${category.replace(/'/g, "\\'")}')">編輯</button>
      <button type="button" onclick="window.removeCategory('${category.replace(/'/g, "\\'")}')">刪除</button>
    </span>
  `).join('');
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

  const getMinutesByCategory = (records, matcher) =>
    records.filter((item) => matcher(item.category)).reduce((sum, item) => sum + item.durationMinutes, 0);

  const isStudyCategory = (category = '') => {
    const normalized = String(category).trim();
    return ['念書', '唸書', '讀書', '學習', 'study', 'Study'].includes(normalized);
  };

  const isLeisureOrGameCategory = (category = '') => {
    const normalized = String(category).trim();
    return ['休閒', '玩遊戲', '遊戲', '看劇', '娛樂', 'leisure', 'gaming', 'game', 'dramas', 'drama'].includes(normalized);
  };

  const studyMinutes = getMinutesByCategory(currentRecords, isStudyCategory);
  const previousStudyMinutes = getMinutesByCategory(previousRecords, isStudyCategory);
  const leisureGameMinutes = getMinutesByCategory(currentRecords, isLeisureOrGameCategory);
  const previousLeisureGameMinutes = getMinutesByCategory(previousRecords, isLeisureOrGameCategory);

  summaryCards.innerHTML = [
    {
      label: '總統計時間',
      value: formatDuration(totalMinutes),
      sub: compareMode === 'previous' ? `相較${getRangeLabel(range, true)}：${formatDelta(totalMinutes - previousTotalMinutes)}` : `${currentRecords.length} 筆紀錄`
    },
    {
      label: '唸書時間',
      value: formatDuration(studyMinutes),
      sub: compareMode === 'previous' ? `相較${getRangeLabel(range, true)}：${formatDelta(studyMinutes - previousStudyMinutes)}` : percentOf(studyMinutes, totalMinutes)
    },
    {
      label: '休閒＋遊戲',
      value: formatDuration(leisureGameMinutes),
      sub: compareMode === 'previous'
        ? `相較${getRangeLabel(range, true)}：${formatDelta(leisureGameMinutes - previousLeisureGameMinutes)}`
        : percentOf(leisureGameMinutes, totalMinutes)
    }
  ].map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div><div class="summary-sub">${card.sub}</div></div>`).join('');
}

function createChartOptionsForMobile() {
  const mobile = isMobileView();
  return {
    mobile,
    barIndexAxis: mobile ? 'y' : 'x',
    barAspectRatio: mobile ? 1.05 : 2.1,
    barMaxHeight: mobile ? 360 : 420,
    legendPosition: mobile ? 'bottom' : 'top',
    legendFontSize: mobile ? 10 : 11,
    pieLabelDisplay: true,
    pieCutout: mobile ? '58%' : '52%'
  };
}

function renderCharts(currentRecords, previousRecords, compareMode, range) {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  const selectedPerson = statsPersonSelect.value;
  const chartCurrentRecords = selectedPerson === 'all' ? currentRecords : currentRecords.filter((r) => r.person === selectedPerson);
  const chartPreviousRecords = selectedPerson === 'all' ? previousRecords : previousRecords.filter((r) => r.person === selectedPerson);
  const categoryTotals = aggregateByCategory(chartCurrentRecords, categories);
  const previousCategoryTotals = aggregateByCategory(chartPreviousRecords, categories);
  const mobileOptions = createChartOptionsForMobile();

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
              maxBarThickness: mobileOptions.mobile ? 22 : 34,
              categoryPercentage: 0.66,
              barPercentage: 0.76,
              datalabels: { display: false }
            },
            {
              label: getRangeLabel(range, true),
              data: previousCategoryTotals,
              backgroundColor: 'rgba(138, 168, 255, 0.72)',
              borderRadius: 10,
              maxBarThickness: mobileOptions.mobile ? 22 : 34,
              categoryPercentage: 0.66,
              barPercentage: 0.76,
              datalabels: { display: false }
            }
          ]
        : people.map((person, index) => ({
            label: person,
            data: aggregateByCategory(currentRecords.filter((record) => record.person === person), categories),
            backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
            borderRadius: 10,
            maxBarThickness: mobileOptions.mobile ? 22 : 34,
            categoryPercentage: 0.66,
            barPercentage: 0.76,
            datalabels: { display: false }
          }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: mobileOptions.barAspectRatio,
      indexAxis: mobileOptions.barIndexAxis,
      layout: {
        padding: {
          top: 8,
          right: 8,
          left: 4,
          bottom: 4
        }
      },
      plugins: {
        legend: {
          position: mobileOptions.legendPosition,
          align: 'start',
          labels: {
            padding: mobileOptions.mobile ? 8 : 12,
            boxWidth: mobileOptions.mobile ? 12 : 18,
            usePointStyle: false,
            font: {
              size: mobileOptions.legendFontSize
            }
          }
        },
        datalabels: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grace: '12%',
          title: { display: !mobileOptions.mobile, text: '分鐘' },
          ticks: {
            autoSkip: true,
            maxRotation: 0,
            padding: 6,
            font: { size: mobileOptions.mobile ? 10 : 11 }
          },
          grid: {
            drawBorder: false
          }
        },
        y: {
          offset: !mobileOptions.mobile,
          ticks: {
            autoSkip: false,
            padding: 6,
            font: { size: mobileOptions.mobile ? 10 : 11 }
          },
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
      cutout: mobileOptions.pieCutout,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: mobileOptions.mobile ? 12 : 18,
            padding: mobileOptions.mobile ? 10 : 14,
            font: { size: mobileOptions.mobile ? 10 : 11 }
          }
        },
        datalabels: {
          display: mobileOptions.pieLabelDisplay,
          color: '#3d3552',
          font: { weight: '700', size: mobileOptions.mobile ? 11 : 12 },
          formatter: (value, context) => {
            const total = context.dataset.data.reduce((sum, item) => sum + item, 0);
            if (!value || !total) return '';
            const percentage = Math.round((value / total) * 100);
            return mobileOptions.mobile ? `${percentage}%` : `${percentage}%\n${formatDuration(value)}`;
          }
        }
      }
    }
  });
}

function renderRecordsTable(records) {
  const sorted = [...records].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  if (!sorted.length) {
    recordsTableBody.innerHTML = '<tr><td colspan="6">目前這個區間沒有資料。</td></tr>';
    recordsCardList.innerHTML = '<div class="record-detail-card empty-mobile-card">目前這個區間沒有資料。</div>';
    return;
  }

  recordsTableBody.innerHTML = sorted.map((record) => `
    <tr>
      <td>${record.person}</td>
      <td>${displayCategory(record.category)}</td>
      <td>${formatDateTime(record.startTime)}</td>
      <td>${formatDateTime(record.endTime)}</td>
      <td>${record.durationMinutes}</td>
      <td><div class="action-cell"><button class="small-btn edit-btn" onclick="window.editRecord('${record.id}')">編輯</button><button class="small-btn delete-btn" onclick="window.deleteRecord('${record.id}')">刪除</button></div></td>
    </tr>
  `).join('');

  recordsCardList.innerHTML = sorted.map((record) => `
    <article class="record-detail-card">
      <div class="record-detail-head">
        <strong>${record.person}</strong>
        <span class="record-detail-minutes">${record.durationMinutes} 分鐘</span>
      </div>
      <div class="record-detail-grid">
        <div><span class="record-detail-label">項目</span><span>${displayCategory(record.category)}</span></div>
        <div><span class="record-detail-label">開始</span><span>${formatDateTime(record.startTime)}</span></div>
        <div><span class="record-detail-label">結束</span><span>${formatDateTime(record.endTime)}</span></div>
      </div>
      <div class="record-detail-actions">
        <button class="small-btn edit-btn" onclick="window.editRecord('${record.id}')">編輯</button>
        <button class="small-btn delete-btn" onclick="window.deleteRecord('${record.id}')">刪除</button>
      </div>
    </article>
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
  if (!isAdminUnlocked()) return alert('請先登入後台。');
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
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  const value = newCategoryInput.value.trim();
  if (!value) return;
  if (dashboardState.categories.includes(value)) return alert('這個項目已存在。');
  await saveDashboardState({ categories: dashboardState.categories.concat(value) });
  newCategoryInput.value = '';
}

async function setupAdminPassword() {
  const password = setupAdminPasswordInput.value.trim();
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return alert(`管理密碼至少 ${ADMIN_PASSWORD_MIN_LENGTH} 碼。`);
  await saveDashboardState({ settings: { ...normalizeSettings(dashboardState.settings), adminPassword: password, adminUpdatedAt: new Date().toISOString() } });
  setupAdminPasswordInput.value = '';
  alert('管理密碼已建立，請直接登入後台。');
}

function loginAdmin() {
  const result = verifyAdminPassword(dashboardState.settings, adminPasswordInput.value.trim());
  if (!result.ok) {
    adminLoginStatus.textContent = result.reason;
    return;
  }
  saveAdminSession();
  adminPasswordInput.value = '';
  adminLoginStatus.textContent = '登入成功。';
  updateAuthUI();
  refreshAdmin();
}

function logoutAdmin() {
  clearAdminSession();
  updateAuthUI();
}

window.resetPersonPassword = async function resetPersonPassword(name) {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  const nextPassword = prompt(`請輸入 ${name} 的新密碼`);
  if (!nextPassword || nextPassword.length < 4) return alert('密碼至少 4 碼。');
  await saveDashboardState({ people: updatePersonPassword(dashboardState.people, name, nextPassword) });
};

window.editCategory = async function editCategory(category) {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  const nextName = prompt('請輸入新的項目名稱', category);
  if (!nextName || nextName.trim() === category) return;
  const trimmed = nextName.trim();
  if (dashboardState.categories.includes(trimmed)) return alert('這個項目名稱已存在。');
  const renamed = renameCategoryInState(dashboardState, category, trimmed);
  await saveDashboardState(renamed);
};

window.removePerson = async function removePerson(person) {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  const people = normalizePeople(dashboardState.people);
  if (people.length <= 1) return alert('至少要保留一位人員。');

  const hasRecords = dashboardState.records.some((record) => record.person === person);
  const hasActive = Boolean(dashboardState.activeRecords?.[person]);
  const confirmMessage = hasRecords || hasActive
    ? `確定要刪除 ${person} 嗎？這會連同此人所有歷史紀錄與進行中紀錄一併刪除，且無法復原。`
    : `確定要刪除 ${person} 嗎？`;

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
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  if (dashboardState.categories.length <= 1) return alert('至少要保留一個項目。');
  const used = dashboardState.records.some((record) => record.category === category) || Object.values(dashboardState.activeRecords || {}).some((item) => item.category === category);
  if (used) return alert('這個項目已有使用紀錄，不能刪除。');
  await saveDashboardState({ categories: dashboardState.categories.filter((item) => item !== category) });
};

window.deleteRecord = async function deleteRecord(id) {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  await saveDashboardState({ records: dashboardState.records.filter((record) => record.id !== id) });
};

window.editRecord = async function editRecord(id) {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  const record = dashboardState.records.find((item) => item.id === id);
  if (!record) return;
  const person = prompt(`請輸入人員名稱（可用：${personNames(dashboardState.people).join(' / ')}）`, record.person);
  if (!person) return;
  const category = prompt(`請輸入項目名稱（可用：${dashboardState.categories.map(displayCategory).join(' / ')}）`, record.category);
  if (!category) return;
  const start = prompt('請輸入開始時間（YYYY-MM-DDTHH:mm）', toDatetimeLocalValue(record.startTime));
  if (!start) return;
  const end = prompt('請輸入結束時間（YYYY-MM-DDTHH:mm）', toDatetimeLocalValue(record.endTime));
  if (!end) return;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) return alert('時間格式不正確，或結束時間必須晚於開始時間。');
  if (!personNames(dashboardState.people).includes(person)) return alert('人員不存在。');
  if (!dashboardState.categories.includes(category)) return alert('項目不存在。');
  await saveDashboardState({ records: dashboardState.records.map((item) => item.id === id ? { ...item, person, category, startTime: startDate.toISOString(), endTime: endDate.toISOString(), durationMinutes: recalcDuration(startDate.toISOString(), endDate.toISOString()) } : item) });
};

function exportCsv() {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  if (!dashboardState.records.length) return alert('目前沒有資料可以匯出。');
  const rows = [['人員', '項目', '開始時間', '結束時間', '分鐘數']].concat(dashboardState.records.map((record) => [record.person, displayCategory(record.category), record.startTime, record.endTime, record.durationMinutes]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob('study-time-records.csv', new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}

function exportExcel() {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  if (!dashboardState.records.length) return alert('目前沒有資料可以匯出。');
  const sheet = XLSX.utils.json_to_sheet(dashboardState.records.map((record) => ({ 人員: record.person, 項目: displayCategory(record.category), 開始時間: record.startTime, 結束時間: record.endTime, 分鐘數: record.durationMinutes })));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Records');
  XLSX.writeFile(workbook, 'study-time-records.xlsx');
}

async function clearAllData() {
  if (!isAdminUnlocked()) return alert('請先登入後台。');
  if (!confirm('確定要清除所有紀錄與進行中資料嗎？')) return;
  await saveDashboardState({ records: [], activeRecords: {} });
}

async function init() {
  setSyncStatus('loading', '初始化中');
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
  window.addEventListener('resize', refreshAdmin);
  try {
    setDiagnostic('開始初始化 Firebase / Firestore...');
    await ensureRemoteState();
    setDiagnostic('已通過 ensureRemoteState，開始訂閱雲端資料...');
    subscribeDashboard((state) => {
      dashboardState = state;
      setSyncStatus('online', '已連線');
      setDiagnostic('後台已收到 Firestore 資料。');
      updateAuthUI();
      if (isAdminUnlocked()) refreshAdmin();
    }, (error) => {
      console.error(error);
      setSyncStatus('error', '連線失敗');
      setDiagnostic(`${error.name || 'Error'}: ${error.message || error.code || '未知錯誤'}`, true);
    });
  } catch (error) {
    console.error(error);
    setSyncStatus('error', '初始化失敗');
    setDiagnostic(`${error.name || 'Error'}: ${error.message || '初始化失敗'}`, true);
  }
}

init();
