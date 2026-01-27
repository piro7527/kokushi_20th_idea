// ============================================
// 国家試験対策 学習記録アプリ - app.js
// ============================================

// --- Constants ---
const STORAGE_KEYS = {
    USER: 'kokushi_user',
    RECORDS: 'kokushi_records'
};

// --- DOM Elements ---
const elements = {
    registrationSection: document.getElementById('registration-section'),
    mainSection: document.getElementById('main-section'),
    registrationForm: document.getElementById('registration-form'),
    studentIdInput: document.getElementById('student-id'),
    studentNameInput: document.getElementById('student-name'),
    displayUserInfo: document.getElementById('display-user-info'),
    logoutBtn: document.getElementById('logout-btn'),
    recordForm: document.getElementById('record-form'),
    fieldSelect: document.getElementById('field-select'),
    questionsAttempted: document.getElementById('questions-attempted'),
    questionsCorrect: document.getElementById('questions-correct'),
    totalQuestions: document.getElementById('total-questions'),
    totalCorrect: document.getElementById('total-correct'),
    averageRate: document.getElementById('average-rate'),
    totalRecords: document.getElementById('total-records'),
    recordsBody: document.getElementById('records-body'),
    noRecords: document.getElementById('no-records'),
    exportBtn: document.getElementById('export-btn'),
    progressChart: document.getElementById('progress-chart')
};

// --- State ---
let currentUser = null;
let records = [];
let chart = null;

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    loadUser();
    setupEventListeners();
});

// --- Event Listeners ---
function setupEventListeners() {
    elements.registrationForm.addEventListener('submit', handleRegistration);
    elements.recordForm.addEventListener('submit', handleRecordSubmit);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.exportBtn.addEventListener('click', exportToCSV);

    // Validation: correct cannot exceed attempted
    elements.questionsCorrect.addEventListener('input', () => {
        const attempted = parseInt(elements.questionsAttempted.value) || 0;
        const correct = parseInt(elements.questionsCorrect.value) || 0;
        if (correct > attempted) {
            elements.questionsCorrect.value = attempted;
        }
    });
}

// --- User Management ---
function loadUser() {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainSection();
        loadRecords();
    }
}

function handleRegistration(e) {
    e.preventDefault();

    const studentId = elements.studentIdInput.value.trim().toUpperCase();
    const studentName = elements.studentNameInput.value.trim();

    if (!studentId || !studentName) {
        showToast('学籍番号と氏名を入力してください', 'error');
        return;
    }

    currentUser = {
        id: studentId,
        name: studentName,
        registeredAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
    showMainSection();
    loadRecords();
    showToast('登録が完了しました！');
}

function handleLogout() {
    if (confirm('ログアウトしますか？\n（記録データは保持されます）')) {
        currentUser = null;
        localStorage.removeItem(STORAGE_KEYS.USER);
        showRegistrationSection();
    }
}

function showMainSection() {
    elements.registrationSection.classList.add('hidden');
    elements.mainSection.classList.remove('hidden');
    elements.displayUserInfo.textContent = `${currentUser.id} - ${currentUser.name}`;
}

function showRegistrationSection() {
    elements.mainSection.classList.add('hidden');
    elements.registrationSection.classList.remove('hidden');
    elements.registrationForm.reset();
}

// --- Records Management ---
function loadRecords() {
    const savedRecords = localStorage.getItem(STORAGE_KEYS.RECORDS);
    records = savedRecords ? JSON.parse(savedRecords) : [];
    updateDisplay();
}

function saveRecords() {
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
}

function handleRecordSubmit(e) {
    e.preventDefault();

    const field = elements.fieldSelect.value;
    const attempted = parseInt(elements.questionsAttempted.value);
    const correct = parseInt(elements.questionsCorrect.value);

    if (!field) {
        showToast('分野を選択してください', 'error');
        return;
    }

    if (isNaN(attempted) || isNaN(correct)) {
        showToast('数値を入力してください', 'error');
        return;
    }

    if (attempted < 0 || correct < 0) {
        showToast('0以上の数値を入力してください', 'error');
        return;
    }

    if (correct > attempted) {
        showToast('正答数は問題数以下にしてください', 'error');
        return;
    }

    const now = new Date();
    const record = {
        id: Date.now(),
        oderId: currentUser.id,
        userName: currentUser.name,
        field: field,
        attempted: attempted,
        correct: correct,
        rate: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
        date: now.toLocaleDateString('ja-JP'),
        time: now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        timestamp: now.toISOString()
    };

    records.unshift(record);
    saveRecords();
    updateDisplay();
    elements.recordForm.reset();
    showToast('記録を保存しました！');
}

function deleteRecord(recordId) {
    if (confirm('この記録を削除しますか？')) {
        records = records.filter(r => r.id !== recordId);
        saveRecords();
        updateDisplay();
        showToast('記録を削除しました');
    }
}

// --- Display Updates ---
function updateDisplay() {
    updateStats();
    updateTable();
    updateChart();
}

function updateStats() {
    const totalAttempted = records.reduce((sum, r) => sum + r.attempted, 0);
    const totalCorrect = records.reduce((sum, r) => sum + r.correct, 0);
    const avgRate = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    elements.totalQuestions.textContent = totalAttempted.toLocaleString();
    elements.totalCorrect.textContent = totalCorrect.toLocaleString();
    elements.averageRate.textContent = `${avgRate}%`;
    elements.totalRecords.textContent = records.length;
}

function updateTable() {
    if (records.length === 0) {
        elements.recordsBody.innerHTML = '';
        elements.noRecords.classList.remove('hidden');
        return;
    }

    elements.noRecords.classList.add('hidden');

    elements.recordsBody.innerHTML = records.map(record => {
        const rateClass = record.rate >= 80 ? 'rate-high' :
            record.rate >= 60 ? 'rate-medium' : 'rate-low';

        return `
            <tr>
                <td>${record.date}</td>
                <td>${record.time}</td>
                <td>${record.field || '-'}</td>
                <td>${record.attempted}</td>
                <td>${record.correct}</td>
                <td class="${rateClass}">${record.rate}%</td>
                <td>
                    <button class="btn btn-danger" onclick="deleteRecord(${record.id})">削除</button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateChart() {
    // Get last 20 records in chronological order for the chart
    const chartData = records.slice().reverse().slice(-20);

    const labels = chartData.map(r => `${r.date}\n${r.time}`);
    const data = chartData.map(r => r.rate);

    if (chart) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
    } else {
        const ctx = elements.progressChart.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '正答率 (%)',
                    data: data,
                    borderColor: '#4f8cff',
                    backgroundColor: 'rgba(79, 140, 255, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#4f8cff',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#1a1a2e',
                        titleColor: '#e0e0e0',
                        bodyColor: '#e0e0e0',
                        borderColor: '#4f8cff',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#a0a0a0',
                            callback: value => `${value}%`
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#a0a0a0',
                            maxRotation: 45,
                            font: {
                                size: 10
                            }
                        }
                    }
                }
            }
        });
    }
}

// --- CSV Export ---
function exportToCSV() {
    if (records.length === 0) {
        showToast('エクスポートする記録がありません', 'error');
        return;
    }

    const headers = ['学籍番号', '氏名', '日付', '時刻', '分野', '問題数', '正答数', '正答率(%)'];
    const csvContent = [
        headers.join(','),
        ...records.map(r => [
            r.userId,
            r.userName,
            r.date,
            r.time,
            r.field || '',
            r.attempted,
            r.correct,
            r.rate
        ].join(','))
    ].join('\n');

    // Add BOM for Excel compatibility with Japanese
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `学習記録_${currentUser.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('CSVをダウンロードしました');
}

// --- Toast Notifications ---
function showToast(message, type = 'success') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    if (type === 'error') {
        toast.style.background = '#ff5252';
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
