const liveClock = document.getElementById('liveClock');
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

let overviewBarChart;
let personCharts = [];

function tickClock() {
  liveClock.textContent = new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

function renderSelectOptions() {
  const people = getPeople();
  const categories = getCategories();
  personSelect.innerHTML = people.map((person) => `<option value="${person}">${person}</option>`).join('');
  categorySelect.innerHTML = categories.map((category) => `<option value="${category}">${category}</option>`).join('');
  overviewPersonSelect.innerHTML = ['<option value="all">全部人員</option>']
    .concat(people.map((person) => `<option value="${person}">${person}</option>`))
    .join('');
}

function renderCurrentStatus() {
  const active = getActiveRecord();
  currentStatus.innerHTML = active
    ? `<strong>${active.person}</strong> 正在進行 <strong>${active.category}</strong><br />開始時間：${formatDateTime(active.startTime)}`
    : '目前沒有進行中的紀錄。';
}

function renderTodayRecords() {
  const records = getRecords();
  const today = startOfDay(new Date()).getTime();
  const filtered = records
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
  return getRecords().filter((record) => {
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
    { label: '總時數', value: formatDuration(totalMinutes) },
    { label: '念書時間', value: formatDuration(studyMinutes) },
    { label: '休閒＋遊戲', value: formatDuration(leisureMinutes + gameMinutes) }
  ]
    .map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div></div>`)
    .join('');
}

function renderOverviewBar(records) {
  const people = getPeople();
  const categories = getCategories();

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
      scales: { y: { beginAtZero: true, title: { display: true, text: '分鐘' } } }
    }
  });
}

function renderPersonCharts(records) {
  const people = getPeople();
  const categories = getCategories();
  personCharts.forEach((chart) => chart.destroy());
  personCharts = [];

  personChartsGrid.innerHTML = people
    .map(
      (person, index) => `
        <div class="chart-card person-chart-card">
          <h3>${person} 的時間分配圖</h3>
          <canvas id="personChart-${index}"></canvas>
        </div>
      `
    )
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
        plugins: { legend: { position: 'bottom' } }
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

startBtn.addEventListener('click', () => {
  if (getActiveRecord()) {
    alert('目前已經有一筆進行中的紀錄，請先結束它。');
    return;
  }
  saveActiveRecord({
    id: uid(),
    person: personSelect.value,
    category: categorySelect.value,
    startTime: new Date().toISOString()
  });
  renderCurrentStatus();
});

endBtn.addEventListener('click', () => {
  const active = getActiveRecord();
  if (!active) {
    alert('目前沒有進行中的紀錄可以結束。');
    return;
  }
  const endTime = new Date().toISOString();
  const records = getRecords();
  records.push({ ...active, endTime, durationMinutes: recalcDuration(active.startTime, endTime) });
  saveRecords(records);
  saveActiveRecord(null);
  refreshFrontend();
});

rangeSelect.addEventListener('change', renderFrontendStats);
overviewPersonSelect.addEventListener('change', renderFrontendStats);

setInterval(tickClock, 1000);
tickClock();
refreshFrontend();
