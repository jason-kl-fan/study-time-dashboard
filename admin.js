import {
  ensureRemoteState,
  subscribeDashboard,
  saveDashboardState
} from './firebase.js';
import {
  canonicalCategory,
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
const customRangeBar = document.getElementById('customRangeBar');
const customStartDateInput = document.getElementById('customStartDateInput');
const customEndDateInput = document.getElementById('customEndDateInput');
const quickRangeWrap = document.getElementById('quickRangeWrap');
const rangeInfoCard = document.getElementById('rangeInfoCard');
const summaryCards = document.getElementById('summaryCards');
const recordsTableBody = document.getElementById('recordsTableBody');
const recordsCardList = document.getElementById('recordsCardList');
const adminPieNote = document.getElementById('adminPieNote');
const adminPieBreakdown = document.getElementById('adminPieBreakdown');
const personCategoryBox = document.getElementById('personCategoryBox');
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
  if (range === 'month') return previous ? '上月' : '本月';
  return previous ? '上一個自訂區間' : '自訂區間';
}

function parseDateInputValue(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function getCustomRangeBounds() {
  const start = parseDateInputValue(customStartDateInput?.value);
  const end = parseDateInputValue(customEndDateInput?.value, true);
  if (!start || !end || start > end) return null;
  return { start, end };
}

function getPreviousCustomRangeBounds(bounds) {
  if (!bounds) return null;
  const rangeMs = bounds.end.getTime() - bounds.start.getTime() + 1;
  const previousEnd = new Date(bounds.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - rangeMs + 1);
  return { start: previousStart, end: previousEnd };
}

function updateCustomRangeUI() {
  const isCustom = rangeSelect.value === 'custom';
  customRangeBar?.classList.toggle('hidden', !isCustom);
  quickRangeWrap?.classList.toggle('hidden', !isCustom);
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat('zh-Hant-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function applyQuickRange(shortcut) {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  if (shortcut === 'today') {
    // keep as today
  } else if (shortcut === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (shortcut === 'last7') {
    start.setDate(start.getDate() - 6);
  } else if (shortcut === 'last30') {
    start.setDate(start.getDate() - 29);
  } else if (shortcut === 'thisMonth') {
    start.setDate(1);
  } else if (shortcut === 'lastMonth') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }

  customStartDateInput.value = formatDateForInput(start);
  customEndDateInput.value = formatDateForInput(end);
  refreshAdmin();
}

function renderRangeInfo(range, compareMode) {
  if (!rangeInfoCard) return;
  let currentText = getRangeLabel(range, false);
  let previousText = getRangeLabel(range, true);

  if (range === 'custom') {
    const currentBounds = getCustomRangeBounds();
    const previousBounds = getPreviousCustomRangeBounds(currentBounds);
    if (!currentBounds) {
      rangeInfoCard.classList.add('hidden');
      return;
    }
    currentText = `${formatDateOnly(currentBounds.start)} ～ ${formatDateOnly(currentBounds.end)}`;
    previousText = previousBounds
      ? `${formatDateOnly(previousBounds.start)} ～ ${formatDateOnly(previousBounds.end)}`
      : '—';
  }

  rangeInfoCard.innerHTML = compareMode === 'previous'
    ? `<strong>目前區間：</strong>${currentText}<br /><strong>比較區間：</strong>${previousText}`
    : `<strong>目前區間：</strong>${currentText}`;
  rangeInfoCard.classList.remove('hidden');
}

function getTopCategories(records, limit = 3) {
  return Object.entries(records.reduce((acc, record) => {
    acc[record.category] = (acc[record.category] || 0) + record.durationMinutes;
    return acc;
  }, {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
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
  const selectedPerson = statsPersonSelect.value;
  const selectedCategory = statsCategorySelect.value;
  const customBounds = range === 'custom' ? getCustomRangeBounds() : null;
  const previousCustomBounds = range === 'custom' ? getPreviousCustomRangeBounds(customBounds) : null;
  const rangeStart = range === 'custom' ? customBounds?.start : getRangeStart(range);
  const rangeEnd = range === 'custom' ? customBounds?.end : null;
  const previousRangeStart = range === 'custom' ? previousCustomBounds?.start : (rangeStart ? getPreviousRangeStart(range) : null);
  const previousRangeEnd = range === 'custom' ? previousCustomBounds?.end : rangeStart;

  const matchesFilters = (record) =>
    (selectedPerson === 'all' || record.person === selectedPerson) &&
    (selectedCategory === 'all' || record.category === selectedCategory);

  const currentRecords = !rangeStart
    ? []
    : dashboardState.records.filter((record) => {
        const start = new Date(record.startTime);
        const inRange = range === 'custom'
          ? start >= rangeStart && start <= rangeEnd
          : start >= rangeStart;
        return inRange && matchesFilters(record);
      });

  const previousRecords = compareMode === 'previous' && previousRangeStart && previousRangeEnd
    ? dashboardState.records.filter((record) => {
        const start = new Date(record.startTime);
        return start >= previousRangeStart && start <= previousRangeEnd && matchesFilters(record);
      })
    : [];

  return { currentRecords, previousRecords, compareMode, range, hasValidCustomRange: range !== 'custom' || Boolean(customBounds) };
}

function renderSummary(currentRecords, previousRecords, compareMode, range) {
  const totalMinutes = currentRecords.reduce((sum, item) => sum + item.durationMinutes, 0);
  const previousTotalMinutes = previousRecords.reduce((sum, item) => sum + item.durationMinutes, 0);

  const getMinutesByCanonicalTargets = (records, targets) =>
    records
      .filter((item) => targets.includes(canonicalCategory(item.category)))
      .reduce((sum, item) => sum + item.durationMinutes, 0);

  const studyTargets = ['唸書'];
  const leisureGameTargets = ['休閒', '遊戲', '看劇', '娛樂'];

  const studyMinutes = getMinutesByCanonicalTargets(currentRecords, studyTargets);
  const previousStudyMinutes = getMinutesByCanonicalTargets(previousRecords, studyTargets);
  const leisureGameMinutes = getMinutesByCanonicalTargets(currentRecords, leisureGameTargets);
  const previousLeisureGameMinutes = getMinutesByCanonicalTargets(previousRecords, leisureGameTargets);
  const topCategories = getTopCategories(currentRecords);

  console.debug('admin-summary-category-check', {
    currentCategories: currentRecords.map((item) => ({ raw: item.category, canonical: canonicalCategory(item.category) })),
    previousCategories: previousRecords.map((item) => ({ raw: item.category, canonical: canonicalCategory(item.category) })),
    studyMinutes,
    leisureGameMinutes
  });

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
    },
    {
      label: topCategories[0] ? `熱門分類：${displayCategory(topCategories[0][0])}` : '熱門分類',
      value: topCategories[0] ? formatDuration(topCategories[0][1]) : '尚無資料',
      sub: topCategories.length > 1
        ? `接著是 ${topCategories.slice(1).map(([category, minutes]) => `${displayCategory(category)} ${formatDuration(minutes)}`).join('、')}`
        : '目前區間尚無其他分類'
    }
  ].map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div><div class="summary-sub">${card.sub}</div></div>`).join('');
}

function createChartOptionsForMobile() {
  const mobile = isMobileView();
  return {
    mobile,
    barIndexAxis: 'x',
    barAspectRatio: mobile ? 1.28 : 2.1,
    barMaxHeight: mobile ? 360 : 420,
    legendPosition: 'top',
    legendFontSize: mobile ? 10 : 11,
    pieLabelDisplay: true,
    pieCutout: mobile ? '58%' : '52%'
  };
}

function renderAdminPieBreakdown(categories, totals) {
  if (!adminPieNote || !adminPieBreakdown) return;

  const totalMinutes = totals.reduce((sum, value) => sum + value, 0);
  const topIndex = totals.indexOf(Math.max(...totals));

  if (!totalMinutes) {
    adminPieNote.textContent = '目前這個統計區間還沒有資料。';
    adminPieBreakdown.className = 'chart-stats-list empty-state';
    adminPieBreakdown.textContent = '尚無可顯示數據。';
    return;
  }

  adminPieNote.textContent = `總計 ${formatDuration(totalMinutes)}，主要分配：${displayCategory(categories[topIndex] || '尚無資料')}`;
  adminPieBreakdown.className = 'chart-stats-list';
  adminPieBreakdown.innerHTML = categories
    .map((category, index) => `
      <div class="chart-stat-item stat-pill-row">
        <div class="stat-pill-left">
          <span class="color-dot" style="background:${CHART_PALETTE[index % CHART_PALETTE.length]}"></span>
          <span>${displayCategory(category)}</span>
        </div>
        <div class="stat-pill-right">
          <strong>${formatDuration(totals[index])}</strong>
          <span>${percentOf(totals[index], totalMinutes)}</span>
        </div>
      </div>
    `)
    .join('');
}

function getPersonCategoryTotals(records, people, categories) {
  return people.map((person) => {
    const personRecords = records.filter((record) => record.person === person);
    const totals = aggregateByCategory(personRecords, categories);
    return {
      person,
      records: personRecords,
      totals,
      totalMinutes: personRecords.reduce((sum, record) => sum + record.durationMinutes, 0)
    };
  });
}

function renderPersonCategoryBreakdown(currentRecords) {
  if (!personCategoryBox) return;
  const categories = dashboardState.categories;
  const people = personNames(dashboardState.people);
  const rows = getPersonCategoryTotals(currentRecords, people, categories);

  if (!rows.some((row) => row.totalMinutes > 0)) {
    personCategoryBox.className = 'chart-stats-list empty-state';
    personCategoryBox.textContent = '目前這個統計區間還沒有可顯示的人員分類資料。';
    return;
  }

  personCategoryBox.className = 'chart-stats-list';
  personCategoryBox.innerHTML = rows.map((row) => `
    <div class="record-detail-card" style="margin-bottom:12px;">
      <div class="record-detail-head">
        <strong>${row.person}</strong>
        <span class="record-detail-minutes">總計 ${formatDuration(row.totalMinutes)}</span>
      </div>
      <div class="record-detail-grid">
        ${dashboardState.categories.map((category, index) => `
          <div>
            <span class="record-detail-label">${displayCategory(category)}</span>
            <span>${formatDuration(row.totals[index])}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
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
  const personCategoryTotals = getPersonCategoryTotals(currentRecords, people, categories);

  renderAdminPieBreakdown(categories, categoryTotals);
  renderPersonCategoryBreakdown(currentRecords);

  if (barChart) barChart.destroy();
  if (pieChart) pieChart.destroy();

  const isAllPeopleMode = compareMode !== 'previous' && selectedPerson === 'all';
  const barLabels = isAllPeopleMode ? people : categories.map(displayCategory);
  const barDatasets = compareMode === 'previous'
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
    : isAllPeopleMode
      ? categories.map((category, index) => ({
          label: displayCategory(category),
          data: personCategoryTotals.map((row) => row.totals[index]),
          backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
          borderRadius: 10,
          maxBarThickness: mobileOptions.mobile ? 26 : 34,
          categoryPercentage: mobileOptions.mobile ? 0.78 : 0.66,
          barPercentage: mobileOptions.mobile ? 0.88 : 0.76,
          datalabels: { display: false }
        }))
      : [{
          label: selectedPerson,
          data: categoryTotals,
          backgroundColor: CHART_PALETTE[0],
          borderRadius: 10,
          maxBarThickness: mobileOptions.mobile ? 22 : 34,
          categoryPercentage: 0.66,
          barPercentage: 0.76,
          datalabels: { display: false }
        }];

  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: barLabels,
      datasets: barDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: mobileOptions.barAspectRatio,
      indexAxis: mobileOptions.barIndexAxis,
      layout: {
        padding: {
          top: 12,
          right: 10,
          left: 6,
          bottom: 6
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
          offset: true,
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            padding: 10,
            font: { size: mobileOptions.mobile ? 10 : 11 }
          },
          grid: {
            drawBorder: false
          }
        },
        y: {
          beginAtZero: true,
          grace: '12%',
          title: { display: true, text: '分鐘 / Minutes' },
          ticks: {
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
  updateCustomRangeUI();
  const { currentRecords, previousRecords, compareMode, range, hasValidCustomRange } = collectStats();
  if (range === 'custom' && !hasValidCustomRange) {
    rangeInfoCard?.classList.add('hidden');
    summaryCards.innerHTML = '<div class="summary-card"><div class="label">自訂區間</div><div class="value">請選日期</div><div class="summary-sub">開始日期不能晚於結束日期</div></div>';
    renderCharts([], [], 'off', range);
    renderRecordsTable([]);
    return;
  }
  renderRangeInfo(range, compareMode);
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
  const today = new Date().toISOString().slice(0, 10);
  if (customStartDateInput) customStartDateInput.value = today;
  if (customEndDateInput) customEndDateInput.value = today;
  updateCustomRangeUI();
  adminLoginBtn.addEventListener('click', loginAdmin);
  setupAdminPasswordBtn.addEventListener('click', setupAdminPassword);
  adminLogoutBtn.addEventListener('click', logoutAdmin);
  addPersonBtn.addEventListener('click', addPerson);
  addCategoryBtn.addEventListener('click', addCategory);
  exportCsvBtn.addEventListener('click', exportCsv);
  exportExcelBtn.addEventListener('click', exportExcel);
  clearDataBtn.addEventListener('click', clearAllData);
  rangeSelect.addEventListener('change', refreshAdmin);
  customStartDateInput?.addEventListener('change', refreshAdmin);
  customEndDateInput?.addEventListener('change', refreshAdmin);
  document.querySelectorAll('[data-range-shortcut]').forEach((button) => {
    button.addEventListener('click', () => {
      rangeSelect.value = 'custom';
      updateCustomRangeUI();
      applyQuickRange(button.dataset.rangeShortcut);
    });
  });
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
