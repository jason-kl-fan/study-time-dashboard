import {
  ensureRemoteState,
  subscribeDashboard,
  saveDashboardState
} from './firebase.js';
import {
  formatDateTime,
  formatDuration,
  getRangeStart,
  aggregateByCategory,
  CHART_PALETTE,
  personNames,
  verifyPassword,
  updatePersonPassword,
  saveProfileSession,
  clearProfileSession,
  getProfileSession
} from './shared.js';

Chart.register(ChartDataLabels);

const syncIndicator = document.getElementById('syncIndicator');
const syncLabel = document.getElementById('syncLabel');
const diagnosticBox = document.getElementById('diagnosticBox');
const loginPersonSelect = document.getElementById('loginPersonSelect');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const profileStatus = document.getElementById('profileStatus');
const currentPasswordInput = document.getElementById('currentPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const profileRangeSelect = document.getElementById('profileRangeSelect');
const profileSummaryCards = document.getElementById('profileSummaryCards');
const profileLegend = document.getElementById('profileLegend');
const profileRecords = document.getElementById('profileRecords');

let dashboardState = { people: [], categories: [], records: [], settings: {} };
let currentUser = null;
let profilePieChart;

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

function renderPeople() {
  const names = personNames(dashboardState.people);
  loginPersonSelect.innerHTML = names.map((name) => `<option value="${name}">${name}</option>`).join('');
  if (currentUser && names.includes(currentUser)) {
    loginPersonSelect.value = currentUser;
  }
}

function getUserRecords() {
  if (!currentUser) return [];
  const rangeStart = getRangeStart(profileRangeSelect.value);
  return dashboardState.records.filter((record) => record.person === currentUser && new Date(record.startTime) >= rangeStart);
}

function renderProfile() {
  if (!currentUser) {
    profileStatus.textContent = '尚未登入。';
    profileSummaryCards.innerHTML = '';
    profileLegend.innerHTML = '<div class="chart-stats-note">登入後即可查看統計。</div>';
    profileRecords.className = 'record-list empty-state';
    profileRecords.textContent = '登入後即可查看自己的紀錄。';
    if (profilePieChart) profilePieChart.destroy();
    return;
  }

  const records = getUserRecords();
  const categories = dashboardState.categories;
  const totals = aggregateByCategory(records, categories);
  const totalMinutes = totals.reduce((sum, value) => sum + value, 0);

  profileStatus.textContent = `${currentUser} 已登入，可查看自己的紀錄與統計。`;

  profileSummaryCards.innerHTML = [
    { label: '總統計時間', value: formatDuration(totalMinutes), sub: `${records.length} 筆紀錄` },
    { label: '主要項目', value: records.length ? categories[totals.indexOf(Math.max(...totals))] : '尚無資料', sub: records.length ? percentOf(Math.max(...totals), totalMinutes) : '0%' },
    { label: '平均每筆', value: records.length ? formatDuration(Math.round(totalMinutes / records.length)) : '0 分鐘', sub: '單筆平均時長' }
  ]
    .map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div><div class="summary-sub">${card.sub}</div></div>`)
    .join('');

  if (profilePieChart) profilePieChart.destroy();
  profilePieChart = new Chart(document.getElementById('profilePieChart'), {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{ data: totals, backgroundColor: categories.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderWidth: 0 }]
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

  profileLegend.innerHTML = categories
    .map((category, index) => `
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
    `)
    .join('');

  if (!records.length) {
    profileRecords.className = 'record-list empty-state';
    profileRecords.textContent = '目前這個區間沒有個人紀錄。';
    return;
  }

  profileRecords.className = 'record-list';
  profileRecords.innerHTML = [...records]
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .map(
      (record) => `
        <div class="record-item">
          <div>
            <strong>${record.category}</strong>
            <div class="record-time">${formatDateTime(record.startTime)} → ${formatDateTime(record.endTime)}</div>
          </div>
          <div class="record-duration">${formatDuration(record.durationMinutes)}</div>
        </div>
      `
    )
    .join('');
}

function restoreSession() {
  const session = getProfileSession();
  if (!session?.name) return;
  if (personNames(dashboardState.people).includes(session.name)) {
    currentUser = session.name;
  } else {
    clearProfileSession();
  }
}

function handleLogin() {
  const person = loginPersonSelect.value;
  const password = loginPasswordInput.value.trim();
  const result = verifyPassword(dashboardState.people, person, password);
  if (!result.ok) return alert(result.reason);
  currentUser = person;
  saveProfileSession(person);
  loginPasswordInput.value = '';
  renderProfile();
}

function handleLogout() {
  currentUser = null;
  clearProfileSession();
  renderProfile();
}

async function changePassword() {
  if (!currentUser) return alert('請先登入。');
  const currentPassword = currentPasswordInput.value.trim();
  const newPassword = newPasswordInput.value.trim();
  if (newPassword.length < 4) return alert('新密碼至少 4 碼。');

  const result = verifyPassword(dashboardState.people, currentUser, currentPassword);
  if (!result.ok) return alert(result.reason);

  await saveDashboardState({ people: updatePersonPassword(dashboardState.people, currentUser, newPassword) });
  currentPasswordInput.value = '';
  newPasswordInput.value = '';
  alert('密碼已更新。');
}

async function init() {
  setSyncStatus('loading', '連線中');

  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  changePasswordBtn.addEventListener('click', changePassword);
  profileRangeSelect.addEventListener('change', renderProfile);

  try {
    setDiagnostic('開始初始化 Firebase / Firestore...');
    await ensureRemoteState();
    setDiagnostic('已通過 ensureRemoteState，開始訂閱雲端資料...');
    subscribeDashboard(
      (state) => {
        dashboardState = state;
        restoreSession();
        renderPeople();
        setSyncStatus('online', '已連線');
        setDiagnostic('個人頁已收到 Firestore 資料。');
        renderProfile();
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
