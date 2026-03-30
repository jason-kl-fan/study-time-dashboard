const STORAGE_KEY = 'study-time-dashboard-records';
const ACTIVE_KEY = 'study-time-dashboard-active';
const PEOPLE_KEY = 'study-time-dashboard-people';
const CATEGORY_KEY = 'study-time-dashboard-categories';
const DEFAULT_PEOPLE = ['Sophia', 'Ariel'];
const DEFAULT_CATEGORIES = ['念書', '休閒', '玩遊戲'];

const liveClock = document.getElementById('liveClock');
const personSelect = document.getElementById('personSelect');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const currentStatus = document.getElementById('currentStatus');
const todayRecords = document.getElementById('todayRecords');
const clearDataBtn = document.getElementById('clearDataBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
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

let barChart;
let pieChart;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStoredList(key, fallback) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

function saveStoredList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getPeople() {
  return getStoredList(PEOPLE_KEY, DEFAULT_PEOPLE);
}

function savePeople(value) {
  saveStoredList(PEOPLE_KEY, value);
}

function getCategories() {
  return getStoredList(CATEGORY_KEY, DEFAULT_CATEGORIES);
}

function saveCategories(value) {
  saveStoredList(CATEGORY_KEY, value);
}

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

function toDatetimeLocalValue(dateString) {
  const date = new Date(dateString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function renderSelectOptions() {
  const people = getPeople();
  const categories = getCategories();

  personSelect.innerHTML = people.map((person) => `<option value="${person}">${person}</option>`).join('');
  categorySelect.innerHTML = categories.map((category) => `<option value="${category}">${category}</option>`).join('');

  statsPersonSelect.innerHTML = ['<option value="all">全部人員</option>']
    .concat(people.map((person) => `<option value="${person}">${person}</option>`))
    .join('');

  statsCategorySelect.innerHTML = ['<option value="all">全部項目</option>']
    .concat(categories.map((category) => `<option value="${category}">${category}</option>`))
    .join('');
}

function renderTags() {
  peopleTags.innerHTML = getPeople()
    .map(
      (person) => `<span class="tag">${person}<button type="button" onclick="removePerson('${person.replace(/'/g, "\\'")}')">×</button></span>`
    )
    .join('');

  categoryTags.innerHTML = getCategories()
    .map(
      (category) => `<span class="tag">${category}<button type="button" onclick="removeCategory('${category.replace(/'/g, "\\'")}')">×</button></span>`
    )
    .join('');
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
  const selectedCategory = statsCategorySelect.value;
  const rangeStart = getRangeStart(range);

  return records.filter((record) => {
    const start = new Date(record.startTime);
    const inRange = start >= rangeStart;
    const personMatch = selectedPerson === 'all' ? true : record.person === selectedPerson;
    const categoryMatch = selectedCategory === 'all' ? true : record.category === selectedCategory;
    return inRange && personMatch && categoryMatch;
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

function aggregateByCategory(records, categories) {
  return categories.map((category) =>
    records
      .filter((record) => record.category === category)
      .reduce((sum, record) => sum + record.durationMinutes, 0)
  );
}

function renderCharts(records) {
  const people = getPeople();
  const categories = getCategories();
  const selectedPerson = statsPersonSelect.value;
  const chartRecords = selectedPerson === 'all' ? records : records.filter((r) => r.person === selectedPerson);
  const categoryTotals = aggregateByCategory(chartRecords, categories);

  const palette = [
    'rgba(255, 138, 161, 0.75)',
    'rgba(138, 168, 255, 0.75)',
    'rgba(255, 216, 140, 0.82)',
    'rgba(146, 220, 189, 0.82)',
    'rgba(191, 160, 255, 0.82)',
    'rgba(255, 170, 120, 0.82)'
  ];

  const groupedByPerson = people.map((person) => ({
    person,
    totals: aggregateByCategory(records.filter((record) => record.person === person), categories)
  }));

  if (barChart) barChart.destroy();
  if (pieChart) pieChart.destroy();

  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels: categories,
      datasets: groupedByPerson.map((item, index) => ({
        label: item.person,
        data: item.totals,
        backgroundColor: palette[index % palette.length],
        borderRadius: 10
      }))
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: '分鐘' }
        }
      }
    }
  });

  pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [
        {
          data: categoryTotals,
          backgroundColor: categories.map((_, index) => palette[index % palette.length]),
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
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
              <button class="small-btn edit-btn" onclick="editRecord('${record.id}')">編輯</button>
              <button class="small-btn delete-btn" onclick="deleteRecord('${record.id}')">刪除</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
}

function renderStats() {
  const statsRecords = collectStats();
  renderSummary(statsRecords);
  renderCharts(statsRecords);
  renderRecordsTable(statsRecords);
}

function recalcDuration(startTime, endTime) {
  return Math.max(1, Math.round((new Date(endTime) - new Date(startTime)) / 60000));
}

function addPerson() {
  const value = newPersonInput.value.trim();
  if (!value) return;
  const people = getPeople();
  if (people.includes(value)) {
    alert('這個人員已存在。');
    return;
  }
  people.push(value);
  savePeople(people);
  newPersonInput.value = '';
  refreshAll();
}

function addCategory() {
  const value = newCategoryInput.value.trim();
  if (!value) return;
  const categories = getCategories();
  if (categories.includes(value)) {
    alert('這個項目已存在。');
    return;
  }
  categories.push(value);
  saveCategories(categories);
  newCategoryInput.value = '';
  refreshAll();
}

window.removePerson = function removePerson(person) {
  const people = getPeople();
  if (people.length <= 1) {
    alert('至少要保留一位人員。');
    return;
  }
  const used = getRecords().some((record) => record.person === person) || (getActiveRecord() && getActiveRecord().person === person);
  if (used) {
    alert('這個人員已經有使用紀錄，暫時不能刪除。');
    return;
  }
  savePeople(people.filter((item) => item !== person));
  refreshAll();
};

window.removeCategory = function removeCategory(category) {
  const categories = getCategories();
  if (categories.length <= 1) {
    alert('至少要保留一個項目。');
    return;
  }
  const used = getRecords().some((record) => record.category === category) || (getActiveRecord() && getActiveRecord().category === category);
  if (used) {
    alert('這個項目已經有使用紀錄，暫時不能刪除。');
    return;
  }
  saveCategories(categories.filter((item) => item !== category));
  refreshAll();
};

window.deleteRecord = function deleteRecord(id) {
  const ok = confirm('確定要刪除這筆紀錄嗎？');
  if (!ok) return;
  saveRecords(getRecords().filter((record) => record.id !== id));
  refreshAll();
};

window.editRecord = function editRecord(id) {
  const records = getRecords();
  const record = records.find((item) => item.id === id);
  if (!record) return;

  const people = getPeople().join(' / ');
  const categories = getCategories().join(' / ');

  const person = prompt(`請輸入人員名稱（可用：${people}）`, record.person);
  if (!person) return;
  const category = prompt(`請輸入項目名稱（可用：${categories}）`, record.category);
  if (!category) return;
  const start = prompt('請輸入開始時間（格式：YYYY-MM-DDTHH:mm）', toDatetimeLocalValue(record.startTime));
  if (!start) return;
  const end = prompt('請輸入結束時間（格式：YYYY-MM-DDTHH:mm）', toDatetimeLocalValue(record.endTime));
  if (!end) return;

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    alert('時間格式不正確，或結束時間必須晚於開始時間。');
    return;
  }

  if (!getPeople().includes(person)) {
    alert('人員不存在，請先新增該人員。');
    return;
  }
  if (!getCategories().includes(category)) {
    alert('項目不存在，請先新增該項目。');
    return;
  }

  const updated = records.map((item) =>
    item.id === id
      ? {
          ...item,
          person,
          category,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          durationMinutes: recalcDuration(startDate.toISOString(), endDate.toISOString())
        }
      : item
  );

  saveRecords(updated);
  refreshAll();
};

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const records = getRecords();
  if (!records.length) {
    alert('目前沒有資料可以匯出。');
    return;
  }

  const rows = [
    ['人員', '項目', '開始時間', '結束時間', '分鐘數'],
    ...records.map((record) => [record.person, record.category, record.startTime, record.endTime, record.durationMinutes])
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  downloadBlob('study-time-records.csv', new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
}

function exportExcel() {
  const records = getRecords();
  if (!records.length) {
    alert('目前沒有資料可以匯出。');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(
    records.map((record) => ({
      人員: record.person,
      項目: record.category,
      開始時間: formatDateTime(record.startTime),
      結束時間: formatDateTime(record.endTime),
      分鐘數: record.durationMinutes
    }))
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '時間紀錄');
  XLSX.writeFile(workbook, 'study-time-records.xlsx');
}

function refreshAll() {
  const currentStatsPerson = statsPersonSelect.value;
  const currentStatsCategory = statsCategorySelect.value;
  const currentPerson = personSelect.value;
  const currentCategory = categorySelect.value;

  renderSelectOptions();
  renderTags();

  if ([...personSelect.options].some((option) => option.value === currentPerson)) personSelect.value = currentPerson;
  if ([...categorySelect.options].some((option) => option.value === currentCategory)) categorySelect.value = currentCategory;
  if ([...statsPersonSelect.options].some((option) => option.value === currentStatsPerson)) statsPersonSelect.value = currentStatsPerson;
  if ([...statsCategorySelect.options].some((option) => option.value === currentStatsCategory)) statsCategorySelect.value = currentStatsCategory;

  renderCurrentStatus();
  renderTodayRecords();
  renderStats();
}

startBtn.addEventListener('click', () => {
  const active = getActiveRecord();
  if (active) {
    alert('目前已經有一筆進行中的紀錄，請先結束它。');
    return;
  }

  const newActive = {
    id: uid(),
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
  const records = getRecords();
  records.push({
    ...active,
    endTime: endTime.toISOString(),
    durationMinutes: recalcDuration(active.startTime, endTime.toISOString())
  });

  saveRecords(records);
  saveActiveRecord(null);
  refreshAll();
});

clearDataBtn.addEventListener('click', () => {
  const ok = confirm('確定要清除所有本機紀錄嗎？這個動作無法復原。');
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACTIVE_KEY);
  refreshAll();
});

exportCsvBtn.addEventListener('click', exportCsv);
exportExcelBtn.addEventListener('click', exportExcel);
addPersonBtn.addEventListener('click', addPerson);
addCategoryBtn.addEventListener('click', addCategory);
rangeSelect.addEventListener('change', renderStats);
statsPersonSelect.addEventListener('change', renderStats);
statsCategorySelect.addEventListener('change', renderStats);
newPersonInput.addEventListener('keydown', (e) => e.key === 'Enter' && addPerson());
newCategoryInput.addEventListener('keydown', (e) => e.key === 'Enter' && addCategory());

setInterval(tickClock, 1000);
tickClock();
refreshAll();
