const STORAGE_KEY = 'study-time-dashboard-records';
const ACTIVE_KEY = 'study-time-dashboard-active';
const PEOPLE = ['Sophia', 'Ariel'];
const CATEGORIES = ['念書', '休閒', '玩遊戲'];

const liveClock = document.getElementById('liveClock');
const personSelect = document.getElementById('personSelect');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const currentStatus = document.getElementById('currentStatus');
const todayRecords = document.getElementById('todayRecords');
const clearDataBtn = document.getElementById('clearDataBtn');
const rangeSelect = document.getElementById('rangeSelect');
const statsPersonSelect = document.getElementById('statsPersonSelect');
const summaryCards = document.getElementById('summaryCards');
const statsTableBody = document.getElementById('statsTableBody');

let barChart;
let pieChart;

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
  if (record) {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(record));
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
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

function tickClock() {
  liveClock.textContent = new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

function renderCurrentStatus() {
  const active = getActiveRecord();
  if (!active) {
    currentStatus.textContent = '目前沒有進行中的紀錄。';
    return;
  }

  currentStatus.innerHTML = `
    <strong>${active.person}</strong> 正在進行 <strong>${active.category}</strong><br />
    開始時間：${formatDateTime(active.startTime)}
  `;
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
          <div class="record-meta">
            ${formatDateTime(record.startTime)} ～ ${formatDateTime(record.endTime)}
          </div>
        </div>
      `
    )
    .join('');
}

function collectStats() {
  const records = getRecords();
  const range = rangeSelect.value;
  const selectedPerson = statsPersonSelect.value;
  const rangeStart = getRangeStart(range);

  return records.filter((record) => {
    const start = new Date(record.startTime);
    const inRange = start >= rangeStart;
    const personMatch = selectedPerson === 'all' ? true : record.person === selectedPerson;
    return inRange && personMatch;
  });
}

function renderSummary(records) {
  const totalMinutes = records.reduce((sum, item) => sum + item.durationMinutes, 0);
  const studyMinutes = records
    .filter((item) => item.category === '念書')
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  const leisureMinutes = records
    .filter((item) => item.category === '休閒')
    .reduce((sum, item) => sum + item.durationMinutes, 0);
  const gameMinutes = records
    .filter((item) => item.category === '玩遊戲')
    .reduce((sum, item) => sum + item.durationMinutes, 0);

  const cards = [
    { label: '總時數', value: formatDuration(totalMinutes) },
    { label: '念書時間', value: formatDuration(studyMinutes) },
    { label: '休閒＋遊戲', value: formatDuration(leisureMinutes + gameMinutes) }
  ];

  summaryCards.innerHTML = cards
    .map(
      (card) => `
        <div class="summary-card">
          <div class="label">${card.label}</div>
          <div class="value">${card.value}</div>
        </div>
      `
    )
    .join('');
}

function aggregateByCategory(records) {
  return CATEGORIES.map((category) =>
    records
      .filter((record) => record.category === category)
      .reduce((sum, record) => sum + record.durationMinutes, 0)
  );
}

function aggregateTable(records) {
  const map = new Map();

  records.forEach((record) => {
    const key = `${record.person}__${record.category}`;
    map.set(key, (map.get(key) || 0) + record.durationMinutes);
  });

  return Array.from(map.entries()).map(([key, total]) => {
    const [person, category] = key.split('__');
    return { person, category, total };
  });
}

function renderTable(records) {
  const rows = aggregateTable(records);

  if (!rows.length) {
    statsTableBody.innerHTML = '<tr><td colspan="4">目前這個區間沒有資料。</td></tr>';
    return;
  }

  statsTableBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.person}</td>
          <td>${row.category}</td>
          <td>${formatDuration(row.total)}</td>
          <td>${row.total}</td>
        </tr>
      `
    )
    .join('');
}

function renderCharts(records) {
  const selectedPerson = statsPersonSelect.value;
  const chartRecords = selectedPerson === 'all' ? records : records.filter((r) => r.person === selectedPerson);
  const categoryTotals = aggregateByCategory(chartRecords);

  const groupedByPerson = PEOPLE.map((person) => ({
    person,
    totals: aggregateByCategory(records.filter((record) => record.person === person))
  }));

  if (barChart) barChart.destroy();
  if (pieChart) pieChart.destroy();

  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: CATEGORIES,
      datasets: groupedByPerson.map((item, index) => ({
        label: item.person,
        data: item.totals,
        backgroundColor: index === 0 ? 'rgba(255, 138, 161, 0.75)' : 'rgba(138, 168, 255, 0.75)',
        borderRadius: 10
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '分鐘'
          }
        }
      }
    }
  });

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: CATEGORIES,
      datasets: [
        {
          data: categoryTotals,
          backgroundColor: [
            'rgba(255, 138, 161, 0.8)',
            'rgba(255, 216, 140, 0.85)',
            'rgba(138, 168, 255, 0.82)'
          ],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function renderStats() {
  const statsRecords = collectStats();
  renderSummary(statsRecords);
  renderCharts(statsRecords);
  renderTable(statsRecords);
}

startBtn.addEventListener('click', () => {
  const active = getActiveRecord();
  if (active) {
    alert('目前已經有一筆進行中的紀錄，請先結束它。');
    return;
  }

  const newActive = {
    person: personSelect.value,
    category: categorySelect.value,
    startTime: new Date().toISOString()
  };

  saveActiveRecord(newActive);
  renderCurrentStatus();
});

endBtn.addEventListener('click', () => {
  const active = getActiveRecord();
  if (!active) {
    alert('目前沒有進行中的紀錄可以結束。');
    return;
  }

  const endTime = new Date();
  const startTime = new Date(active.startTime);
  const durationMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));

  const records = getRecords();
  records.push({
    ...active,
    endTime: endTime.toISOString(),
    durationMinutes
  });

  saveRecords(records);
  saveActiveRecord(null);
  renderCurrentStatus();
  renderTodayRecords();
  renderStats();
});

clearDataBtn.addEventListener('click', () => {
  const ok = confirm('確定要清除所有本機紀錄嗎？這個動作無法復原。');
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  renderCurrentStatus();
  renderTodayRecords();
  renderStats();
});

rangeSelect.addEventListener('change', renderStats);
statsPersonSelect.addEventListener('change', renderStats);

setInterval(tickClock, 1000);
tickClock();
renderCurrentStatus();
renderTodayRecords();
renderStats();
