import {
  ensureRemoteState,
  subscribeDashboard,
  saveDashboardState
} from './firebase.js';
import {
  uid,
  formatDateTime,
  formatDuration,
  startOfDay,
  getRangeStart,
  recalcDuration,
  aggregateByCategory,
  CHART_PALETTE,
  personNames,
  verifyPassword
} from './shared.js';

Chart.register(ChartDataLabels);

const liveClock = document.getElementById('liveClock');
const syncIndicator = document.getElementById('syncIndicator');
const syncLabel = document.getElementById('syncLabel');
const diagnosticBox = document.getElementById('diagnosticBox');
const personSelect = document.getElementById('personSelect');
const categorySelect = document.getElementById('categorySelect');
const passwordInput = document.getElementById('passwordInput');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const currentStatus = document.getElementById('currentStatus');
const todayRecords = document.getElementById('todayRecords');
const rangeSelect = document.getElementById('rangeSelect');
const overviewPersonSelect = document.getElementById('overviewPersonSelect');
const summaryCards = document.getElementById('summaryCards');
const overviewBreakdown = document.getElementById('overviewBreakdown');
const personChartsGrid = document.getElementById('personChartsGrid');

let dashboardState = { people: [], categories: [], records: [], activeRecords: {}, settings: {} };
let overviewBarChart;
let personCharts = [];

function tickClock() {
  liveClock.textContent = new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
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

function renderSelectOptions() {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;

  personSelect.innerHTML = people.map((person) => `<option value="${person}">${person}</option>`).join('');
  categorySelect.innerHTML = categories.map((category) => `<option value="${category}">${category}</option>`).join('');
  overviewPersonSelect.innerHTML = ['<option value="all">全部人員 / All</option>']
    .concat(people.map((person) => `<option value="${person}">${person}</option>`))
    .join('');
}

function renderCurrentStatus() {
  const person = personSelect.value;
  const active = dashboardState.activeRecords?.[person];
  currentStatus.innerHTML = active
    ? `<strong>${active.person}</strong> 正在進行 <strong>${active.category}</strong><br />開始時間 Start: ${formatDateTime(active.startTime)}`
    : '目前這位人員沒有進行中的紀錄。';
}

function renderTodayRecords() {
  const today = startOfDay(new Date()).getTime();
  const filtered = dashboardState.records
    .filter((record) => startOfDay(new Date(record.startTime)).getTime() === today)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  if (!filtered.length) {
    todayRecords.className = 'record-list empty-state';
    todayRecords.textContent = '目前還沒有紀錄，先按下開始計時吧。';
    return;
  }

  todayRecords.className = 'record-list';
  todayRecords.innerHTML = filtered
    .map(
      (record) => `
        <div class="record-item">
          <div>
            <strong>${record.person}</strong> · ${record.category}
            <div class="record-time">${formatDateTime(record.startTime)} → ${formatDateTime(record.endTime)}</div>
          </div>
          <div class="record-duration">${formatDuration(record.durationMinutes)}</div>
        </div>
      `
    )
    .join('');
}

function collectOverviewRecords() {
  const selectedPerson = overviewPersonSelect.value;
  const rangeStart = getRangeStart(rangeSelect.value);
  return dashboardState.records.filter((record) => {
    const personMatch = selectedPerson === 'all' ? true : record.person === selectedPerson;
    return personMatch && new Date(record.startTime) >= rangeStart;
  });
}

function renderSummary(records) {
  const totalMinutes = records.reduce((sum, record) => sum + record.durationMinutes, 0);
  const studyMinutes = records.filter((record) => record.category === '念書').reduce((sum, record) => sum + record.durationMinutes, 0);
  const leisureMinutes = records.filter((record) => record.category === '休閒').reduce((sum, record) => sum + record.durationMinutes, 0);
  const gameMinutes = records.filter((record) => record.category === '玩遊戲').reduce((sum, record) => sum + record.durationMinutes, 0);

  summaryCards.innerHTML = [
    { label: '總統計時間', value: formatDuration(totalMinutes), sub: `${records.length} 筆紀錄` },
    { label: '念書時間', value: formatDuration(studyMinutes), sub: percentOf(studyMinutes, totalMinutes) },
    { label: '休閒＋遊戲', value: formatDuration(leisureMinutes + gameMinutes), sub: percentOf(leisureMinutes + gameMinutes, totalMinutes) }
  ]
    .map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div><div class="summary-sub">${card.sub}</div></div>`)
    .join('');
}

function renderOverviewBreakdown(records) {
  const categories = dashboardState.categories;
  const totals = aggregateByCategory(records, categories);
  const totalMinutes = totals.reduce((sum, value) => sum + value, 0);

  if (!totalMinutes) {
    overviewBreakdown.className = 'chart-stats-list empty-state';
    overviewBreakdown.textContent = '目前這個統計區間還沒有資料。';
    return;
  }

  overviewBreakdown.className = 'chart-stats-list';
  overviewBreakdown.innerHTML = categories
    .map(
      (category, index) => `
        <div class="chart-stat-item stat-pill-row">
          <div class="stat-pill-left">
            <span class="color-dot" style="background:${CHART_PALETTE[index % CHART_PALETTE.length]}"></span>
            <span>${category}</span>
          </div>
          <div class="stat-pill-right">
            <strong>${formatDuration(totals[index])}</strong>
            <span>${percentOf(totals[index], totalMinutes)}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function renderOverviewBar(records) {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;

  if (overviewBarChart) overviewBarChart.destroy();

  overviewBarChart = new Chart(document.getElementById('overviewBarChart'), {
    type: 'bar',
    data: {
      labels: categories,
      datasets: people.map((person, index) => ({
        label: person,
        data: aggregateByCategory(records.filter((record) => record.person === person), categories),
        backgroundColor: CHART_PALETTE[index % CHART_PALETTE.length],
        borderRadius: 12,
        datalabels: {
          color: '#4b415f',
          anchor: 'end',
          align: 'top',
          font: { weight: '700' },
          formatter: (value) => (value ? formatDuration(value) : '')
        }
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        datalabels: { clamp: true }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: '分鐘' }
        }
      }
    }
  });
}

function renderPersonCharts(records) {
  personCharts.forEach((chart) => chart.destroy());
  personCharts = [];

  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;

  personChartsGrid.innerHTML = people
    .map(
      (person, index) => `
        <article class="chart-card person-chart-card">
          <div class="subsection-title-row">
            <h3>${person}</h3>
            <span class="mini-pill">個人分配圖</span>
          </div>
          <canvas id="personChart-${index}"></canvas>
          <div class="chart-stats-note" id="personChartNote-${index}"></div>
          <div class="chart-stats-list" id="personChartStats-${index}"></div>
        </article>
      `
    )
    .join('');

  people.forEach((person, index) => {
    const personRecords = records.filter((record) => record.person === person);
    const totals = aggregateByCategory(personRecords, categories);
    const totalMinutes = totals.reduce((sum, value) => sum + value, 0);

    const ctx = document.getElementById(`personChart-${index}`);
    const note = document.getElementById(`personChartNote-${index}`);
    const stats = document.getElementById(`personChartStats-${index}`);

    note.textContent = totalMinutes
      ? `總計 ${formatDuration(totalMinutes)}，主要分配：${categories[totals.indexOf(Math.max(...totals))] || '尚無資料'}`
      : '目前這個區間尚無資料。';

    stats.innerHTML = totalMinutes
      ? categories
          .map(
            (category, i) => `
              <div class="chart-stat-item stat-pill-row">
                <div class="stat-pill-left">
                  <span class="color-dot" style="background:${CHART_PALETTE[i % CHART_PALETTE.length]}"></span>
                  <span>${category}</span>
                </div>
                <div class="stat-pill-right">
                  <strong>${formatDuration(totals[i])}</strong>
                  <span>${percentOf(totals[i], totalMinutes)}</span>
                </div>
              </div>
            `
          )
          .join('')
      : '<div class="empty-state">尚無可顯示數據。</div>';

    personCharts.push(
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: categories,
          datasets: [{
            data: totals,
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
      })
    );
  });
}

function refreshFrontend() {
  const selectedPerson = overviewPersonSelect.value;
  renderSelectOptions();
  if ([...overviewPersonSelect.options].some((option) => option.value === selectedPerson)) {
    overviewPersonSelect.value = selectedPerson;
  }
  renderCurrentStatus();
  renderTodayRecords();
  const records = collectOverviewRecords();
  renderSummary(records);
  renderOverviewBreakdown(records);
  renderOverviewBar(records);
  renderPersonCharts(records);
}

async function startRecord() {
  const person = personSelect.value;
  const category = categorySelect.value;
  const password = passwordInput.value.trim();

  const result = verifyPassword(dashboardState.people, person, password);
  if (!result.ok) return alert(result.reason);
  if (dashboardState.activeRecords?.[person]) return alert('這位人員已經有進行中的紀錄。');

  await saveDashboardState({
    activeRecords: {
      ...dashboardState.activeRecords,
      [person]: {
        id: uid(),
        person,
        category,
        startTime: new Date().toISOString()
      }
    }
  });

  passwordInput.value = '';
}

async function endRecord() {
  const person = personSelect.value;
  const password = passwordInput.value.trim();
  const result = verifyPassword(dashboardState.people, person, password);
  if (!result.ok) return alert(result.reason);

  const active = dashboardState.activeRecords?.[person];
  if (!active) return alert('這位人員目前沒有進行中的紀錄。');

  const endTime = new Date().toISOString();
  const nextRecord = {
    ...active,
    endTime,
    durationMinutes: recalcDuration(active.startTime, endTime)
  };

  const nextActive = { ...dashboardState.activeRecords };
  delete nextActive[person];

  await saveDashboardState({
    records: dashboardState.records.concat(nextRecord),
    activeRecords: nextActive
  });

  passwordInput.value = '';
}

async function init() {
  tickClock();
  setInterval(tickClock, 1000);
  setSyncStatus('loading', '連線中');

  startBtn.addEventListener('click', startRecord);
  endBtn.addEventListener('click', endRecord);
  personSelect.addEventListener('change', renderCurrentStatus);
  rangeSelect.addEventListener('change', refreshFrontend);
  overviewPersonSelect.addEventListener('change', refreshFrontend);

  try {
    setDiagnostic('開始初始化 Firebase / Firestore...');
    await ensureRemoteState();
    setDiagnostic('已通過 ensureRemoteState，開始訂閱雲端資料...');
    subscribeDashboard(
      (state) => {
        dashboardState = state;
        setSyncStatus('online', '已連線');
        setDiagnostic('前台已收到 Firestore 資料。');
        refreshFrontend();
      },
      (error) => {
        console.error(error);
        setSyncStatus('error', '連線失敗');
        setDiagnostic(`${error.name || 'Error'}: ${error.message || error.code || '未知錯誤'}`, true);
      }
    );
  } catch (error) {
    console.error(error);
    setSyncStatus('error', '初始化失敗');
    setDiagnostic(`${error.name || 'Error'}: ${error.message || '初始化失敗'}`, true);
  }
}

init();
