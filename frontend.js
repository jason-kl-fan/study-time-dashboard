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
  CHART_PALETTE
} from './shared.js';

const liveClock = document.getElementById('liveClock');
const syncBanner = document.getElementById('syncBanner');
const personSelect = document.getElementById('personSelect');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const currentStatus = document.getElementById('currentStatus');
const todayRecords = document.getElementById('todayRecords');
const rangeSelect = document.getElementById('rangeSelect');
const overviewPersonSelect = document.getElementById('overviewPersonSelect');
const summaryCards = document.getElementById('summaryCards');
const personChartsGrid = document.getElementById('personChartsGrid');

let dashboardState = { people: [], categories: [], records: [], activeRecord: null };
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

function renderSelectOptions() {
  const { people, categories } = dashboardState;
  personSelect.innerHTML = people.map((person) => `<option value="${person}">${person}</option>`).join('');
  categorySelect.innerHTML = categories.map((category) => `<option value="${category}">${category}</option>`).join('');
  overviewPersonSelect.innerHTML = ['<option value="all">全部人員 / All</option>']
    .concat(people.map((person) => `<option value="${person}">${person}</option>`))
    .join('');
}

function renderCurrentStatus() {
  const active = dashboardState.activeRecord;
  currentStatus.innerHTML = active
    ? `<strong>${active.person}</strong> 正在進行 <strong>${active.category}</strong><br />開始時間 Start: ${formatDateTime(active.startTime)}`
    : '目前沒有進行中的紀錄。';
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
  const { people, categories } = dashboardState;
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
                <div>${formatDuration(minutes)} ｜ ${ratio}%</div>
                <div class="chart-en">${category} ｜ ${formatDuration(minutes)} ｜ ${ratio}%</div>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderPersonCharts(records) {
  const { people, categories } = dashboardState;
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

startBtn.addEventListener('click', async () => {
  if (dashboardState.activeRecord) {
    alert('目前已經有一筆進行中的紀錄，請先結束它。');
    return;
  }
  await saveDashboardState({
    activeRecord: {
      id: uid(),
      person: personSelect.value,
      category: categorySelect.value,
      startTime: new Date().toISOString()
    }
  });
});

endBtn.addEventListener('click', async () => {
  const active = dashboardState.activeRecord;
  if (!active) {
    alert('目前沒有進行中的紀錄可以結束。');
    return;
  }
  const endTime = new Date().toISOString();
  const nextRecords = dashboardState.records.concat({
    ...active,
    endTime,
    durationMinutes: recalcDuration(active.startTime, endTime)
  });
  await saveDashboardState({ records: nextRecords, activeRecord: null });
});

rangeSelect.addEventListener('change', renderFrontendStats);
overviewPersonSelect.addEventListener('change', renderFrontendStats);

setInterval(tickClock, 1000);
tickClock();

(async function init() {
  try {
    await ensureRemoteState();
    subscribeDashboard((state) => {
      dashboardState = state;
      setSyncStatus('雲端同步狀態：已連線 Cloud Sync Connected');
      refreshFrontend();
    });
  } catch (error) {
    console.error(error);
    setSyncStatus('雲端同步狀態：連線失敗，請檢查 Firebase 設定', false);
  }
})();
