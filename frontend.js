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

const liveClock = document.getElementById('liveClock');
const syncBanner = document.getElementById('syncBanner');
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
const personChartsGrid = document.getElementById('personChartsGrid');

let dashboardState = { people: [], categories: [], records: [], activeRecords: {} };
let overviewBarChart;
let personCharts = [];

function tickClock() {
  liveClock.textContent = new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

function setSyncStatus(text, ok = true) {
  syncBanner.textContent = text;
  syncBanner.className = ok ? 'sync-banner' : 'sync-banner sync-banner-error';
}

function setDiagnostic(text, isError = false) {
  diagnosticBox.textContent = `診斷訊息：${text}`;
  diagnosticBox.className = isError ? 'diagnostic-box diagnostic-box-error' : 'diagnostic-box';
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
          <div class="record-top">
            <span>${record.person}｜${record.category}</span>
            <span>${formatDuration(record.durationMinutes)}</span>
          </div>
          <div class="record-meta">${formatDateTime(record.startTime)} ～ ${formatDateTime(record.endTime)}</div>
        </div>
      `
    )
    .join('');
}

function collectFrontendStats() {
  const range = rangeSelect.value;
  const person = overviewPersonSelect.value;
  const start = getRangeStart(range);
  return dashboardState.records.filter((record) => {
    const inRange = new Date(record.startTime) >= start;
    const personMatch = person === 'all' ? true : record.person === person;
    return inRange && personMatch;
  });
}

function renderSummary(records) {
  const totalMinutes = records.reduce((sum, item) => sum + item.durationMinutes, 0);
  const studyMinutes = records.filter((item) => item.category === '念書').reduce((sum, item) => sum + item.durationMinutes, 0);
  const leisureMinutes = records.filter((item) => item.category === '休閒').reduce((sum, item) => sum + item.durationMinutes, 0);
  const gameMinutes = records.filter((item) => item.category === '玩遊戲').reduce((sum, item) => sum + item.durationMinutes, 0);

  summaryCards.innerHTML = [
    { label: '總時數 / Total', value: formatDuration(totalMinutes) },
    { label: '念書時間 / Study', value: formatDuration(studyMinutes) },
    { label: '休閒＋遊戲 / Leisure + Game', value: formatDuration(leisureMinutes + gameMinutes) }
  ]
    .map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div></div>`)
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
        borderRadius: 10
      }))
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: '分鐘 Minutes' } } }
    }
  });
}

function buildStatsLegend(person, categories, totals) {
  const sum = totals.reduce((acc, value) => acc + value, 0);
  if (!sum) {
    return `<div class="chart-stats-note">${person} 目前沒有資料 / No data yet</div>`;
  }

  return `
    <div class="chart-stats-list">
      ${categories
        .map((category, index) => {
          const minutes = totals[index];
          const ratio = sum ? ((minutes / sum) * 100).toFixed(1) : '0.0';
          return `
            <div class="chart-stats-item">
              <span class="dot" style="background:${CHART_PALETTE[index % CHART_PALETTE.length]}"></span>
              <div>
                <strong>${category}</strong>
                <div>累積時間 ${formatDuration(minutes)} ｜ 比例 ${ratio}%</div>
                <div class="chart-en">Total ${formatDuration(minutes)} ｜ Ratio ${ratio}%</div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderPersonCharts(records) {
  const people = personNames(dashboardState.people);
  const categories = dashboardState.categories;
  personCharts.forEach((chart) => chart.destroy());
  personCharts = [];

  personChartsGrid.innerHTML = people
    .map((person, index) => {
      const totals = aggregateByCategory(records.filter((record) => record.person === person), categories);
      const totalMinutes = totals.reduce((sum, value) => sum + value, 0);
      return `
        <div class="chart-card person-chart-card">
          <h3>${person} 的時間分配圖 / ${person} Distribution</h3>
          <p class="person-total">累積時間 Total Time：${formatDuration(totalMinutes)}</p>
          <canvas id="personChart-${index}"></canvas>
          ${buildStatsLegend(person, categories, totals)}
        </div>
      `;
    })
    .join('');

  people.forEach((person, index) => {
    const canvas = document.getElementById(`personChart-${index}`);
    const data = aggregateByCategory(records.filter((record) => record.person === person), categories);
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [
          {
            data,
            backgroundColor: categories.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
    personCharts.push(chart);
  });
}

function renderFrontendStats() {
  const records = collectFrontendStats();
  renderSummary(records);
  renderOverviewBar(records);
  renderPersonCharts(records);
}

function refreshFrontend() {
  const selectedPerson = personSelect.value;
  const selectedCategory = categorySelect.value;
  const selectedOverviewPerson = overviewPersonSelect.value;

  renderSelectOptions();

  if ([...personSelect.options].some((opt) => opt.value === selectedPerson)) personSelect.value = selectedPerson;
  if ([...categorySelect.options].some((opt) => opt.value === selectedCategory)) categorySelect.value = selectedCategory;
  if ([...overviewPersonSelect.options].some((opt) => opt.value === selectedOverviewPerson)) overviewPersonSelect.value = selectedOverviewPerson;

  renderCurrentStatus();
  renderTodayRecords();
  renderFrontendStats();
}

async function submitStart() {
  const person = personSelect.value;
  const password = passwordInput.value;
  const check = verifyPassword(dashboardState.people, person, password);
  if (!check.ok) return alert(check.reason);
  if (dashboardState.activeRecords?.[person]) {
    return alert('這位人員目前已經有一筆進行中的紀錄。');
  }

  await saveDashboardState({
    activeRecords: {
      ...dashboardState.activeRecords,
      [person]: {
        id: uid(),
        person,
        category: categorySelect.value,
        startTime: new Date().toISOString()
      }
    }
  });
  passwordInput.value = '';
}

async function submitEnd() {
  const person = personSelect.value;
  const password = passwordInput.value;
  const check = verifyPassword(dashboardState.people, person, password);
  if (!check.ok) return alert(check.reason);

  const active = dashboardState.activeRecords?.[person];
  if (!active) {
    return alert('這位人員目前沒有進行中的紀錄可以結束。');
  }

  const endTime = new Date().toISOString();
  const nextActive = { ...dashboardState.activeRecords };
  delete nextActive[person];

  await saveDashboardState({
    records: dashboardState.records.concat({
      ...active,
      endTime,
      durationMinutes: recalcDuration(active.startTime, endTime)
    }),
    activeRecords: nextActive
  });
  passwordInput.value = '';
}

personSelect.addEventListener('change', renderCurrentStatus);
startBtn.addEventListener('click', submitStart);
endBtn.addEventListener('click', submitEnd);
rangeSelect.addEventListener('change', renderFrontendStats);
overviewPersonSelect.addEventListener('change', renderFrontendStats);

setInterval(tickClock, 1000);
tickClock();

(async function init() {
  try {
    setDiagnostic('開始初始化 Firebase / Firestore...');
    await ensureRemoteState();
    setDiagnostic('已通過 ensureRemoteState，開始訂閱雲端資料...');
    subscribeDashboard(
      (state) => {
        dashboardState = state;
        setSyncStatus('雲端同步狀態：已連線 Cloud Sync Connected');
        setDiagnostic('前台已收到 Firestore 資料。');
        refreshFrontend();
      },
      (error) => {
        console.error(error);
        setSyncStatus(`雲端同步狀態：${error.code || '連線失敗'}，請檢查 Firestore 是否已開啟`, false);
        setDiagnostic(`${error.name || 'Error'}: ${error.message || error.code || '未知錯誤'}`, true);
      }
    );
  } catch (error) {
    console.error(error);
    setSyncStatus('雲端同步狀態：連線失敗，請檢查 Firebase 設定', false);
    setDiagnostic(`${error.name || 'Error'}: ${error.message || '初始化失敗'}`, true);
  }
})();
