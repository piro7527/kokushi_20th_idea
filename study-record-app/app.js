// ============================================
// 国家試験対策 学習記録アプリ - app.js
// Firebase Firestore Authentication & Sync
// ============================================

// --- Constants ---
const STORAGE_KEYS = {
    USER: 'kokushi_user', // Only store current session user
    // REMOVED: USERS_DB and RECORDS (we use Firestore now)
};

// --- DOM Elements ---
const elements = {
    authSection: document.getElementById('auth-section'),
    mainSection: document.getElementById('main-section'),
    // Auth tabs
    tabLogin: document.getElementById('tab-login'),
    tabRegister: document.getElementById('tab-register'),
    // Login form
    loginForm: document.getElementById('login-form'),
    loginStudentId: document.getElementById('login-student-id'),
    loginPassword: document.getElementById('login-password'),
    // Registration form
    registrationForm: document.getElementById('registration-form'),
    studentIdInput: document.getElementById('student-id'),
    studentNameInput: document.getElementById('student-name'),
    studentPassword: document.getElementById('student-password'),
    studentPasswordConfirm: document.getElementById('student-password-confirm'),
    // Main section
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
    // Check if Firestore is available
    if (typeof db === 'undefined') {
        alert('データベース接続エラー: Firebaseが読み込まれていません。インターネット接続を確認してください。');
        return;
    }
    loadCurrentUser();
    setupEventListeners();
});

// --- Event Listeners ---
function setupEventListeners() {
    // Auth tabs
    elements.tabLogin.addEventListener('click', () => switchTab('login'));
    elements.tabRegister.addEventListener('click', () => switchTab('register'));

    // Forms
    elements.loginForm.addEventListener('submit', handleLogin);
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

// --- Tab Switching ---
function switchTab(tab) {
    if (tab === 'login') {
        elements.tabLogin.classList.add('active');
        elements.tabRegister.classList.remove('active');
        elements.loginForm.classList.remove('hidden');
        elements.registrationForm.classList.add('hidden');
    } else {
        elements.tabLogin.classList.remove('active');
        elements.tabRegister.classList.add('active');
        elements.loginForm.classList.add('hidden');
        elements.registrationForm.classList.remove('hidden');
    }
}

// Simple hash function (not cryptographically secure, but simple)
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

// Helper to normalize Student ID (Full-width to Half-width, UpperCase)
function normalizeId(str) {
    if (!str) return '';
    const halfWidth = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
    return halfWidth.trim().toUpperCase();
}

// --- User Management (Firestore) ---

function loadCurrentUser() {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainSection();
        loadRecords(); // Fetch records from Firestore
    }
}

// Login with Firestore
async function handleLogin(e) {
    e.preventDefault();
    const btn = elements.loginForm.querySelector('button');
    setLoading(btn, true);

    const studentId = normalizeId(elements.loginStudentId.value);
    const password = elements.loginPassword.value;

    if (!studentId || !password) {
        showToast('学籍番号とパスワードを入力してください', 'error');
        setLoading(btn, false);
        return;
    }

    try {
        // 1. Get user document from 'users' collection
        const docRef = db.collection('users').doc(studentId);
        const doc = await docRef.get();

        if (!doc.exists) {
            showToast('この学籍番号は登録されていません', 'error');
            setLoading(btn, false);
            return;
        }

        const user = doc.data();
        
        // 2. Verify password
        if (user.passwordHash !== simpleHash(password)) {
            showToast('パスワードが間違っています', 'error');
            setLoading(btn, false);
            return;
        }

        // 3. Login success
        currentUser = {
            id: user.id,
            name: user.name
        };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
        
        showMainSection();
        await loadRecords(); // Fetch records
        showToast(`${user.name}さん、おかえりなさい！`);

    } catch (error) {
        console.error("Login Error:", error);
        showToast('ログイン中にエラーが発生しました', 'error');
    } finally {
        setLoading(btn, false);
    }
}

// Register with Firestore
async function handleRegistration(e) {
    e.preventDefault();
    const btn = elements.registrationForm.querySelector('button');
    setLoading(btn, true);

    const studentId = normalizeId(elements.studentIdInput.value);
    const studentName = elements.studentNameInput.value.trim();
    const password = elements.studentPassword.value;
    const passwordConfirm = elements.studentPasswordConfirm.value;

    if (!studentId || !studentName || !password) {
        showToast('すべての項目を入力してください', 'error');
        setLoading(btn, false);
        return;
    }

    if (password.length < 4) {
        showToast('パスワードは4文字以上にしてください', 'error');
        setLoading(btn, false);
        return;
    }

    if (password !== passwordConfirm) {
        showToast('パスワードが一致しません', 'error');
        setLoading(btn, false);
        return;
    }

    try {
        // 1. Check if user already exists
        const docRef = db.collection('users').doc(studentId);
        const doc = await docRef.get();

        if (doc.exists) {
            showToast('この学籍番号は既に登録されています', 'error');
            setLoading(btn, false);
            return;
        }

        // 2. Create new user
        const newUser = {
            id: studentId,
            name: studentName,
            passwordHash: simpleHash(password),
            registeredAt: new Date().toISOString()
        };

        await docRef.set(newUser);

        // 3. Auto-login
        currentUser = {
            id: studentId,
            name: studentName
        };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
        
        // Initialize records storage for this user
        await db.collection('students').doc(studentId).set({
             studentId: studentId,
             studentName: studentName,
             records: [],
             lastUpdated: new Date().toISOString()
        });

        showMainSection();
        records = [];
        updateDisplay();
        showToast('登録が完了しました！');

    } catch (error) {
        console.error("Registration Error:", error);
        showToast('登録中にエラーが発生しました', 'error');
    } finally {
        setLoading(btn, false);
    }
}

function handleLogout() {
    if (confirm('ログアウトしますか？')) {
        currentUser = null;
        records = [];
        localStorage.removeItem(STORAGE_KEYS.USER);
        showAuthSection();
    }
}

// --- UI Helpers ---
function showMainSection() {
    elements.authSection.classList.add('hidden');
    elements.mainSection.classList.remove('hidden');
    elements.displayUserInfo.textContent = `${currentUser.id} - ${currentUser.name}`;
}

function showAuthSection() {
    elements.mainSection.classList.add('hidden');
    elements.authSection.classList.remove('hidden');
    elements.loginForm.reset();
    elements.registrationForm.reset();
    switchTab('login');
}

function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = '処理中...';
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || '送信';
    }
}

// --- Records Management (Firestore) ---

// Load records from Firestore
async function loadRecords() {
    if (!currentUser) return;
    
    try {
        const doc = await db.collection('students').doc(currentUser.id).get();
        if (doc.exists && doc.data().records) {
            records = doc.data().records;
        } else {
            records = [];
        }
        updateDisplay();
    } catch (error) {
        console.error("Error loading records:", error);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

// Save records to Firestore
async function saveRecords() {
    if (!currentUser) return;

    try {
        const userDoc = {
            studentId: currentUser.id,
            studentName: currentUser.name,
            records: records,
            lastUpdated: new Date().toISOString()
        };

        // Ovewrite the document with current state
        await db.collection('students').doc(currentUser.id).set(userDoc);
        console.log('Records synced to Firestore');
    } catch (error) {
        console.error("Error syncing to Firestore:", error);
        showToast('データの保存に失敗しました', 'error');
    }
}

async function handleRecordSubmit(e) {
    e.preventDefault();

    const field = elements.fieldSelect.value;
    const attempted = parseInt(elements.questionsAttempted.value);
    const correct = parseInt(elements.questionsCorrect.value);
    const btn = elements.recordForm.querySelector('button');

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

    setLoading(btn, true);

    const now = new Date();
    const record = {
        id: Date.now(),
        userId: currentUser.id,
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
    
    try {
        await saveRecords();
        updateDisplay();
        elements.recordForm.reset();
        showToast('記録を保存しました！');
    } catch (error) {
        // If save failed, revert UI? Or just warn.
        // For now, simple warning
    } finally {
        setLoading(btn, false);
    }
}

async function deleteRecord(recordId) {
    if (confirm('この記録を削除しますか？')) {
        records = records.filter(r => r.id !== recordId);
        try {
            await saveRecords();
            updateDisplay();
            showToast('記録を削除しました');
        } catch (error) {
            console.error("Delete error:", error);
            showToast('削除に失敗しました', 'error');
        }
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
