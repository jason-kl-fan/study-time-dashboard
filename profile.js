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
  updatePersonPassword
} from './shared.js';

const syncBanner = document.getElementById('syncBanner');
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

let dashboardState = { people: [], categories: [], records: [] };
let currentUser = null;
let profilePieChart;

function setSyncStatus(text, ok = true) {
  syncBanner.textContent = text;
  syncBanner.className = ok ? 'sync-banner' : 'sync-banner sync-banner-error';
}

function setDiagnostic(text, isError = false) {
  diagnosticBox.textContent = `診斷訊息：${text}`;
  diagnosticBox.className = isError ? 'diagnostic-box diagnostic-box-error' : 'diagnostic-box';
}

function renderPeople() {
  const names = personNames(dashboardState.people);
  loginPersonSelect.innerHTML = names.map((name) => `<option value="${name}">${name}</option>`).join('');
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
  const totalMinutes = records.reduce((sum, item) => sum + item.durationMinutes, 0);
  const studyMinutes = records.filter((item) => item.category === '念書').reduce((sum, item) => sum + item.durationMinutes, 0);
  const leisureMinutes = records.filter((item) => item.category === '休閒').reduce((sum, item) => sum + item.durationMinutes, 0);
  const gameMinutes = records.filter((item) => item.category === '玩遊戲').reduce((sum, item) => sum + item.durationMinutes, 0);
  const totals = aggregateByCategory(records, dashboardState.categories);

  profileStatus.innerHTML = `<strong>${currentUser}</strong> 已登入，可以查看個人統計與修改密碼。`;
  profileSummaryCards.innerHTML = [
    { label: '總時數 / Total', value: formatDuration(totalMinutes) },
    { label: '念書時間 / Study', value: formatDuration(studyMinutes) },
    { label: '休閒＋遊戲 / Leisure + Game', value: formatDuration(leisureMinutes + gameMinutes) }
  ]
    .map((card) => `<div class="summary-card"><div class="label">${card.label}</div><div class="value">${card.value}</div></div>`)
    .join('');

  if (profilePieChart) profilePieChart.destroy();
  profilePieChart = new Chart(document.getElementById('profilePieChart'), {
    type: 'doughnut',
    data: {
      labels: dashboardState.categories,
      datasets: [{ data: totals, backgroundColor: dashboardState.categories.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  const sum = totals.reduce((acc, value) => acc + value, 0);
  profileLegend.innerHTML = dashboardState.categories
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
    .join('');

  if (!records.length) {
    profileRecords.className = 'record-list empty-state';
    profileRecords.textContent = '目前這個區間沒有你的紀錄。';
    return;
  }

  profileRecords.className = 'record-list';
  profileRecords.innerHTML = records
    .slice()
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .map(
      (record) => `
        <div class="record-item">
          <div class="record-top">
            <span>${record.category}</span>
            <span>${formatDuration(record.durationMinutes)}</span>
          </div>
          <div class="record-meta">${formatDateTime(record.startTime)} ～ ${formatDateTime(record.endTime)}</div>
        </div>
      `
    )
    .join('');
}

loginBtn.addEventListener('click', () => {
  const person = loginPersonSelect.value;
  const password = loginPasswordInput.value;
  const check = verifyPassword(dashboardState.people, person, password);
  if (!check.ok) return alert(check.reason);
  currentUser = person;
  loginPasswordInput.value = '';
  renderProfile();
});

logoutBtn.addEventListener('click', () => {
  currentUser = null;
  renderProfile();
});

changePasswordBtn.addEventListener('click', async () => {
  if (!currentUser) return alert('請先登入。');
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const check = verifyPassword(dashboardState.people, currentUser, currentPassword);
  if (!check.ok) return alert(check.reason);
  if (!newPassword || newPassword.length < 4) return alert('新密碼至少 4 碼。');

  await saveDashboardState({ people: updatePersonPassword(dashboardState.people, currentUser, newPassword) });
  currentPasswordInput.value = '';
  newPasswordInput.value = '';
  alert('密碼更新成功。');
});

profileRangeSelect.addEventListener('change', renderProfile);

(async function init() {
  try {
    setDiagnostic('開始初始化 Firebase / Firestore...');
    await ensureRemoteState();
    setDiagnostic('已通過 ensureRemoteState，開始訂閱雲端資料...');
    subscribeDashboard(
      (state) => {
        dashboardState = state;
        renderPeople();
        setSyncStatus('雲端同步狀態：已連線 Cloud Sync Connected');
        setDiagnostic('個人頁已收到 Firestore 資料。');
        renderProfile();
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
