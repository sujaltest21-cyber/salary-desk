const STORAGE_KEY = 'salary_mgmt_state';
const CURRENCY = '\u20B9';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDE6odwvFABF0ja6aNTj3b66fCiatzOJcQ",
  authDomain: "salary-bfa89.firebaseapp.com",
  databaseURL: "https://salary-bfa89-default-rtdb.firebaseio.com",
  projectId: "salary-bfa89",
  storageBucket: "salary-bfa89.firebasestorage.app",
  messagingSenderId: "979238180600",
  appId: "1:979238180600:web:c873e61a5df74e32e1cd0d"
};

// Initialize Firebase with fallback safety check
let db;
if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  } catch (e) {
    console.error("Firebase initialization failed:", e);
    setupMockDb();
  }
} else {
  console.error("Firebase SDK not loaded from CDN.");
  setupMockDb();
}

function setupMockDb() {
  db = {
    ref: function(path) {
      return {
        once: function(event) {
          return Promise.resolve({
            val: function() {
              return null;
            }
          });
        },
        set: function(value) {
          return Promise.resolve();
        }
      };
    }
  };
}

let state = {
  isAuthenticated: false,
  password: '',
  departments: [],
  employees: [],
  loginTime: null,
  autoLogoutHours: 24
};

let currentView = null;
let sessionTimer = null;

function loadState(callback) {
  // Fetch admin password from Firebase database
  db.ref('adminPassword').once('value').then(pwdSnap => {
    state.password = pwdSnap.val() || '';
    
    // Fetch departments, employees and autoLogout settings
    return db.ref('state').once('value');
  }).then(stateSnap => {
    const saved = stateSnap.val() || {};
    state.departments = Array.isArray(saved.departments) ? saved.departments : [];
    
    // Retrieve and normalize employees list (Firebase can return arrays or objects, and drops empty arrays like history)
    let rawEmployees = [];
    if (saved.employees) {
      if (Array.isArray(saved.employees)) {
        rawEmployees = saved.employees.filter(Boolean);
      } else if (typeof saved.employees === 'object') {
        rawEmployees = Object.values(saved.employees).filter(Boolean);
      }
    }
    
    state.employees = rawEmployees.map(emp => ({
      id: emp.id || '',
      name: emp.name || '',
      department: emp.department || '',
      salary: parseFloat(emp.salary) || 0,
      date: emp.date || '',
      remark: emp.remark || '',
      status: emp.status || 'active',
      history: Array.isArray(emp.history) ? emp.history : [],
      resignationDate: emp.resignationDate || null,
      resignationReason: emp.resignationReason || null
    }));
    
    state.autoLogoutHours = saved.autoLogoutHours || 24;
    
    // Check if the user is authenticated in the current browser session using sessionStorage (no localStorage used)
    const localSession = sessionStorage.getItem('isAuthenticated');
    if (localSession === 'true') {
      state.isAuthenticated = true;
      state.loginTime = parseInt(sessionStorage.getItem('loginTime'), 10) || null;
    }
    
    if (callback) callback();
  }).catch(err => {
    console.error("Error loading state from Firebase:", err);
    if (callback) callback();
  });
}

function saveState() {
  // Save departments, employees, autoLogout settings to Firebase
  db.ref('state').set({
    departments: state.departments,
    employees: state.employees,
    autoLogoutHours: state.autoLogoutHours
  });
  
  // Save adminPassword to Firebase if set
  if (state.password) {
    db.ref('adminPassword').set(state.password);
  }
  
  // Track tab session status in sessionStorage instead of localStorage
  if (state.isAuthenticated) {
    sessionStorage.setItem('isAuthenticated', 'true');
    sessionStorage.setItem('loginTime', String(state.loginTime));
  } else {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('loginTime');
  }
}

function generateId() {
  return 'emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(n) {
  return CURRENCY + ' ' + Number(n).toLocaleString('en-IN');
}

function formatInc(n) {
  return (n > 0 ? '+' : '') + CURRENCY + ' ' + Number(n).toLocaleString('en-IN');
}

function showCheck() {
  const el = document.getElementById('check-indicator');
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), 900);
}

/* ---- Session Timeout ---- */
function checkSessionTimeout() {
  if (!state.isAuthenticated || !state.loginTime) return;
  const elapsed = Date.now() - state.loginTime;
  const maxMs = state.autoLogoutHours * 3600000;
  if (elapsed >= maxMs) {
    handleLogout();
  }
}

/* ---- Modal ---- */
function openModal(title, bodyHTML, wide) {
  const container = document.getElementById('modal-container');
  container.classList.toggle('modal-wide', !!wide);
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ---- Password Toggle ---- */
const EYE_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function toggleFieldVisibility(inputId, show) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const wrap = input.parentElement.classList.contains('password-wrap') ? input.parentElement : null;
  const target = wrap || input;
  if (show) {
    target.classList.remove('hidden');
    input.classList.remove('hidden');
  } else {
    target.classList.add('hidden');
    input.classList.add('hidden');
  }
}

function setupPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.parentElement.classList.contains('password-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'password-wrap';
  if (input.classList.contains('hidden')) {
    wrap.classList.add('hidden');
  }
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toggle-pass';
  btn.innerHTML = EYE_OPEN;
  btn.addEventListener('click', () => {
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass ? EYE_CLOSED : EYE_OPEN;
  });
  wrap.appendChild(btn);
}

/* ---- Auth ---- */
function handleLogin() {
  const input = document.getElementById('password-input');
  const confirm = document.getElementById('password-confirm');
  const error = document.getElementById('login-error');
  const val = input.value.trim();

  if (!state.password) {
    const val2 = confirm.value.trim();
    if (!val) { error.textContent = 'Please enter a password'; return; }
    if (val.length < 4) { error.textContent = 'Password must be at least 4 characters'; return; }
    if (val !== val2) { error.textContent = 'Passwords do not match'; return; }
    state.password = val;
    state.isAuthenticated = true;
    state.loginTime = Date.now();
    saveState();
    showApp();
    return;
  }

  if (!val) { error.textContent = 'Please enter your password'; return; }
  if (val === state.password) {
    state.isAuthenticated = true;
    state.loginTime = Date.now();
    saveState();
    showApp();
  } else {
    error.textContent = 'Incorrect password';
    input.value = '';
    input.focus();
  }
}

function handleLogout() {
  state.isAuthenticated = false;
  state.loginTime = null;
  currentView = null;
  saveState();
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-panel').classList.remove('hidden');
  document.getElementById('app-viewport').innerHTML = '';
  document.getElementById('password-input').value = '';
  document.getElementById('password-confirm').value = '';
  toggleFieldVisibility('password-confirm', false);
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-subtitle').textContent = 'Enter password to continue';
  closeModal();
}

function showApp() {
  document.getElementById('login-panel').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
}

/* ---- Departments ---- */
function showAddDepartmentModal() {
  const deptRows = state.departments.map(d =>
    `<div class="dept-row"><span>${escHtml(d)}</span><button class="dept-remove" data-dept="${escHtml(d)}">&times;</button></div>`
  ).join('');
  openModal('Manage Departments', `
    <input type="text" id="dept-name-input" class="input-field" placeholder="Department name" autofocus>
    <button id="add-dept-btn" class="btn btn-primary btn-block">Add Department</button>
    <div class="dept-list-vertical">${deptRows || '<div class="dept-row" style="color:#9ca3af">No departments yet</div>'}</div>
  `);
  setTimeout(() => {
    document.getElementById('add-dept-btn').addEventListener('click', addDepartment);
    document.getElementById('dept-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addDepartment(); });
    document.querySelectorAll('.dept-row .dept-remove').forEach(el => {
      el.addEventListener('click', () => removeDepartment(el.dataset.dept));
    });
  }, 0);
}

function addDepartment() {
  const input = document.getElementById('dept-name-input');
  const name = input.value.trim();
  if (!name || state.departments.includes(name)) return;
  state.departments.push(name);
  saveState();
  showAddDepartmentModal();
}

function removeDepartment(name) {
  state.departments = state.departments.filter(d => d !== name);
  state.employees.forEach(e => { if (e.department === name) e.department = ''; });
  saveState();
  showAddDepartmentModal();
}

/* ---- Employees ---- */
function showAddEmployeeModal() {
  if (!state.departments.length) {
    openModal('Add Employee', '<p style="color:#6b7280;font-size:14px">Please add a department first.</p>');
    return;
  }
  const deptOpts = '<option value="" disabled selected>Select Department</option>' + state.departments.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
  openModal('Add Employee', `
    <input type="text" id="emp-name" class="input-field" placeholder="Employee name" autofocus>
    <select id="emp-dept" class="input-field">${deptOpts}</select>
    <input type="number" id="emp-salary" class="input-field" placeholder="Salary">
    <input type="date" id="emp-date" class="input-field">
    <input type="text" id="emp-remark" class="input-field" placeholder="Remark (optional)">
    <button id="add-emp-btn" class="btn btn-primary btn-block">Add Employee</button>
  `);
  document.getElementById('emp-date').value = new Date().toISOString().slice(0, 10);
  setTimeout(() => {
    document.getElementById('add-emp-btn').addEventListener('click', addEmployee);
    const name = document.getElementById('emp-name');
    const dept = document.getElementById('emp-dept');
    const salary = document.getElementById('emp-salary');
    const date = document.getElementById('emp-date');
    const remark = document.getElementById('emp-remark');
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); dept.focus(); }
    });
    dept.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); dept.showPicker(); }
    });
    dept.addEventListener('change', () => {
      if (dept.value) salary.focus();
    });
    salary.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); remark.focus(); }
    });
    date.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); remark.focus(); }
    });
    remark.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addEmployee(); }
    });
  }, 0);
}

function addEmployee() {
  const name = document.getElementById('emp-name').value.trim();
  const department = document.getElementById('emp-dept').value;
  const salary = parseFloat(document.getElementById('emp-salary').value);
  const date = document.getElementById('emp-date').value;
  const remark = document.getElementById('emp-remark').value.trim();
  if (!name || !department || isNaN(salary)) return;
  state.employees.push({
    id: generateId(),
    name,
    department,
    salary,
    date,
    remark: remark || '',
    status: 'active',
    history: [],
    resignationDate: null,
    resignationReason: null
  });
  saveState();
  closeModal();
  showCheck();
  if (currentView === 'employee-preview') renderEmployeePreview();
  else if (currentView === 'employee-list') renderEmployeeList();
}

/* ---- Inline Update (no history push) ---- */
function updateEmployeeField(id, field, value) {
  const emp = state.employees.find(e => e.id === id);
  if (!emp) return;
  if (field === 'salary') {
    const newSalary = parseFloat(value);
    if (!isNaN(newSalary)) emp.salary = newSalary;
  } else if (field === 'name') {
    emp.name = value;
  } else if (field === 'date') {
    emp.date = value;
  } else if (field === 'remark') {
    emp.remark = value;
  }
  saveState();
  showCheck();
}

/* ---- Increment ---- */
function showIncrementModal(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  openModal('Increment Salary: ' + emp.name, `
    <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Current salary: <strong>${formatCurrency(emp.salary)}</strong> (since ${formatDate(emp.date)})</p>
    <input type="number" id="inc-amount" class="input-field" placeholder="Increment amount (e.g. 5000)" autofocus>
    <input type="date" id="inc-date" class="input-field">
    <button id="inc-btn" class="btn btn-primary btn-block">Apply Increment</button>
  `);
  document.getElementById('inc-date').value = new Date().toISOString().slice(0, 10);
  setTimeout(() => {
    document.getElementById('inc-btn').addEventListener('click', () => processIncrement(empId));
    document.getElementById('inc-amount').addEventListener('keydown', (e) => { if (e.key === 'Enter') processIncrement(empId); });
  }, 0);
}

function processIncrement(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  const incAmount = parseFloat(document.getElementById('inc-amount').value);
  const newDate = document.getElementById('inc-date').value;
  if (isNaN(incAmount) || incAmount <= 0 || !newDate) return;
  const oldSalary = emp.salary;
  const newSalary = oldSalary + incAmount;
  emp.history.push({
    prevSalary: oldSalary,
    increment: incAmount,
    newSalary: newSalary,
    date: emp.date
  });
  emp.salary = newSalary;
  emp.date = newDate;
  saveState();
  closeModal();
  showCheck();
  if (currentView === 'employee-preview') renderEmployeePreview();
}

/* ---- History Modal ---- */
function showHistoryModal(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  const history = emp.history.slice().reverse();
  if (!history.length) {
    openModal('Salary History: ' + emp.name, '<p style="color:#6b7280;font-size:14px;text-align:center;padding:24px 0">No salary history recorded.</p>');
    return;
  }
  const first = history[history.length - 1];
  let formulaHtml = '';
  if (history.length === 1) {
    formulaHtml = `<div class="history-formula"><span class="hf-prev">${formatCurrency(first.prevSalary)}</span><span class="hf-plus"> + </span><span class="hf-inc">${formatInc(first.increment)}</span><span class="hf-eq"> = </span><span class="hf-new">${formatCurrency(first.newSalary)}</span></div>`;
  }
  let rows = '';
  history.forEach(h => {
    rows += `<tr>
      <td>${formatCurrency(h.prevSalary)}</td>
      <td class="hm-inc">${formatInc(h.increment)}</td>
      <td class="hm-total">${formatCurrency(h.newSalary)}</td>
      <td class="hm-date">${formatDate(h.date)}</td>
    </tr>`;
  });
  openModal('Salary History: ' + emp.name, `
    ${formulaHtml}
    <table class="history-modal-table">
      <thead><tr>
        <th style="width:22%">Previous</th>
        <th style="width:18%">Increment</th>
        <th style="width:22%">Updated</th>
        <th style="width:38%">Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

/* ---- Resign / Rehire ---- */
function showResignModal(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  openModal('Resign: ' + emp.name, `
    <p style="color:#6b7280;font-size:13px;margin-bottom:12px">Confirm resignation for <strong>${escHtml(emp.name)}</strong> (${escHtml(emp.department)})</p>
    <input type="date" id="resign-date" class="input-field">
    <textarea id="resign-reason" class="input-field resign-reason-input" placeholder="Reason for resignation (optional)"></textarea>
    <button id="confirm-resign-btn" class="btn btn-danger btn-block">Confirm Resignation</button>
  `);
  document.getElementById('resign-date').value = new Date().toISOString().slice(0, 10);
  setTimeout(() => {
    document.getElementById('confirm-resign-btn').addEventListener('click', () => confirmResign(empId));
  }, 0);
}

function confirmResign(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  emp.status = 'resigned';
  emp.resignationDate = document.getElementById('resign-date').value || new Date().toISOString().slice(0, 10);
  emp.resignationReason = document.getElementById('resign-reason').value.trim() || '';
  saveState();
  closeModal();
  showCheck();
  if (currentView === 'employee-preview') renderEmployeePreview();
}

function rehireEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  emp.status = 'active';
  emp.resignationDate = null;
  emp.resignationReason = null;
  saveState();
  showCheck();
  renderResignTab();
}

/* ---- Settings ---- */
function showSettingsModal() {
  const currentHours = state.autoLogoutHours || 24;
  openModal('Settings', `
    <input type="password" id="set-old-pass" class="input-field" placeholder="Current password" autofocus>
    <input type="password" id="set-new-pass" class="input-field" placeholder="New password">
    <input type="password" id="set-confirm-pass" class="input-field" placeholder="Confirm new password">
    <hr style="border:none;border-top:1px solid #f3f4f6;margin:16px 0">
    <p style="font-size:12px;color:#9ca3af;margin-bottom:6px;text-align:left">Auto Session Logout (hours)</p>
    <input type="number" id="set-auto-logout" class="input-field" placeholder="Hours" value="${currentHours}" min="1" max="720">
    <button id="set-save-btn" class="btn btn-primary btn-block">Save Settings</button>
    <p id="set-error" class="login-error"></p>
  `);
  setTimeout(() => {
    setupPasswordToggle('set-old-pass');
    setupPasswordToggle('set-new-pass');
    setupPasswordToggle('set-confirm-pass');
    document.getElementById('set-save-btn').addEventListener('click', processSettings);
    document.getElementById('set-confirm-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') processSettings(); });
  }, 0);
}

function processSettings() {
  const old = document.getElementById('set-old-pass').value.trim();
  const newP = document.getElementById('set-new-pass').value.trim();
  const confirm = document.getElementById('set-confirm-pass').value.trim();
  const hours = parseInt(document.getElementById('set-auto-logout').value, 10);
  const error = document.getElementById('set-error');
  if (old !== state.password) { error.textContent = 'Current password is incorrect'; return; }
  if (!newP) { error.textContent = 'Please enter a new password'; return; }
  if (newP.length < 4) { error.textContent = 'Password must be at least 4 characters'; return; }
  if (newP !== confirm) { error.textContent = 'Passwords do not match'; return; }
  state.password = newP;
  state.autoLogoutHours = (hours > 0) ? hours : 24;
  state.loginTime = Date.now();
  saveState();
  closeModal();
  showCheck();
}

/* ---- Rendering: Employee List (Master Name Editor) ---- */
function renderEmployeeList() {
  currentView = 'employee-list';
  const vp = document.getElementById('app-viewport');
  const active = state.employees.filter(e => e.status === 'active');
  if (!active.length) {
    vp.innerHTML = '<div class="viewport-grid"><div class="viewport-empty" style="min-height:50vh">No employees.</div></div>';
    return;
  }
  const grouped = {};
  state.departments.forEach(d => { grouped[d] = []; });
  active.forEach(e => {
    if (!grouped[e.department]) grouped[e.department] = [];
    grouped[e.department].push(e);
  });
  let html = '<div class="viewport-grid"><h1 class="view-heading">Employee List</h1><div class="employee-list-grid">';
  Object.keys(grouped).forEach(dept => {
    const emps = grouped[dept];
    if (!emps.length) return;
    html += `<div class="emp-list-group">
      <div class="emp-list-header">${escHtml(dept)} (${emps.length})</div>`;
    emps.forEach(emp => {
      html += `<div class="emp-list-row">
        <input class="emp-list-input" type="text" value="${escHtml(emp.name)}" readonly data-id="${emp.id}">
        <button class="pencil-btn" data-id="${emp.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="delete-btn" data-id="${emp.id}" style="background:none;border:none;color:#dc2626;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:all 0.12s;margin-left:2px;" title="Delete Permanently">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>`;
    });
    html += `</div>`;
  });
  html += '</div></div></div>';
  vp.innerHTML = html;
  document.querySelectorAll('.pencil-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.emp-list-row');
      const input = row.querySelector('.emp-list-input');
      const isLocked = input.hasAttribute('readonly');
      if (isLocked) {
        input.removeAttribute('readonly');
        input.focus();
        btn.classList.add('active');
      }
    });
  });
  document.querySelectorAll('.emp-list-input').forEach(input => {
    const save = () => {
      input.setAttribute('readonly', '');
      const btn = input.closest('.emp-list-row').querySelector('.pencil-btn');
      btn.classList.remove('active');
      updateEmployeeField(input.dataset.id, 'name', input.value);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = btn.dataset.id;
      const emp = state.employees.find(e => e.id === empId);
      if (!emp) return;
      if (confirm(`Are you sure you want to permanently delete employee "${emp.name}"?`)) {
        state.employees = state.employees.filter(e => e.id !== empId);
        saveState();
        showCheck();
        renderEmployeeList();
      }
    });
  });
}

/* ---- Rendering: Employee Preview ---- */
function renderEmployeePreview() {
  currentView = 'employee-preview';
  const vp = document.getElementById('app-viewport');
  const active = state.employees.filter(e => e.status === 'active');
  if (!active.length) {
    vp.innerHTML = '<div class="viewport-grid"><div class="viewport-empty" style="min-height:50vh">No active employees.</div></div>';
    return;
  }
  const grouped = {};
  state.departments.forEach(d => { grouped[d] = []; });
  active.forEach(e => {
    if (!grouped[e.department]) grouped[e.department] = [];
    grouped[e.department].push(e);
  });
  let html = '<div class="viewport-grid"><h1 class="view-heading">Employee Preview</h1><div class="employee-preview-grid">';
  const deptKeys = Object.keys(grouped);
  deptKeys.forEach((dept, i) => {
    const emps = grouped[dept];
    if (!emps.length) return;
    if (i > 0 && i % 2 === 0) {
      html += '<div class="grid-divider"></div>';
    }
    html += `<div class="dept-group" data-dept="${escHtml(dept)}">
      <div class="dept-group-header">
        <span class="collapse-icon">&#9660;</span>
        <h3>${escHtml(dept)}</h3>
        <span class="emp-count">${emps.length} employee${emps.length > 1 ? 's' : ''}</span>
      </div>
      <div class="dept-body">
      <table class="emp-table compact">
        <thead><tr>
          <th style="width:28%">Name</th>
          <th style="width:14%">Date</th>
          <th style="width:18%">Salary</th>
          <th style="width:22%">Remark</th>
          <th style="width:6%">History</th>
          <th style="width:12%">Actions</th>
        </tr></thead>
        <tbody>`;
    emps.forEach(emp => {
      const hCount = emp.history.length;
      html += `<tr data-id="${emp.id}">
        <td><input class="inline-input name-input" type="text" value="${escHtml(emp.name)}" readonly></td>
        <td><input class="inline-input" type="date" value="${emp.date || ''}" readonly></td>
        <td><input class="inline-input salary-input" type="number" value="${emp.salary}" data-field="salary"></td>
        <td><input class="inline-input" type="text" value="${escHtml(emp.remark || '')}" data-field="remark" placeholder="Add remark"></td>
        <td>${hCount ? `<button class="history-btn" data-id="${emp.id}">${hCount}</button>` : '<span style="color:#d1d5db;font-size:11px">0</span>'}</td>
        <td class="actions-cell"><button class="btn btn-sm btn-secondary inc-btn" data-id="${emp.id}">Increment</button><button class="btn btn-sm btn-danger resign-btn" data-id="${emp.id}">Resign</button></td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  });
  html += '</div></div>';
  vp.innerHTML = html;
  attachInlineListeners();
  attachHistoryButtons();
  attachIncrementButtons();
  attachResignButtons();
  attachCollapseHeaders();
}

/* ---- Rendering: Resign Tab ---- */
function renderResignTab() {
  currentView = 'resign-tab';
  const vp = document.getElementById('app-viewport');
  const resigned = state.employees.filter(e => e.status === 'resigned');
  if (!resigned.length) {
    vp.innerHTML = '<div class="viewport-grid"><div class="resigned-empty">No resigned employees</div></div>';
    return;
  }
  const grouped = {};
  resigned.forEach(e => {
    const d = e.department || 'Other';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });
  let html = '<div class="viewport-grid"><h1 class="view-heading">Resigned Employees</h1><div class="employee-preview-grid">';
  Object.keys(grouped).forEach(dept => {
    const emps = grouped[dept];
    html += `<div class="dept-group" data-dept="${escHtml(dept)}">
      <div class="dept-group-header">
        <span class="collapse-icon">&#9660;</span>
        <h3>${escHtml(dept)}</h3>
        <span class="emp-count">${emps.length} resigned</span>
      </div>
      <div class="dept-body">
      <table class="emp-table compact">
        <thead><tr>
          <th style="width:18%">Resignation Date</th>
          <th style="width:24%">Employee Name</th>
          <th style="width:20%">Base Salary Archive</th>
          <th style="width:28%">Reason</th>
          <th style="width:10%"></th>
        </tr></thead>
        <tbody>`;
    emps.forEach(emp => {
      html += `<tr>
        <td><span class="inline-input" style="border:none;color:#6b7280">${formatDate(emp.resignationDate)}</span></td>
        <td><span class="inline-input name-input" style="border:none;color:#6b7280">${escHtml(emp.name)}</span></td>
        <td><span class="inline-input salary-input" style="border:none;color:#6b7280">${formatCurrency(emp.salary)}</span></td>
        <td><span class="inline-input" style="border:none;color:#6b7280">${escHtml(emp.resignationReason || '-')}</span></td>
        <td class="actions-cell">
          <button class="btn btn-sm rehire-btn" data-id="${emp.id}">Rehire</button>
          <button class="btn btn-sm btn-danger delete-resigned-btn" data-id="${emp.id}">Delete</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  });
  html += '</div></div>';
  vp.innerHTML = html;
  attachCollapseHeaders();
  document.querySelectorAll('.rehire-btn').forEach(btn => {
    btn.addEventListener('click', () => rehireEmployee(btn.dataset.id));
  });
  document.querySelectorAll('.delete-resigned-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = btn.dataset.id;
      const emp = state.employees.find(e => e.id === empId);
      if (!emp) return;
      if (confirm(`Are you sure you want to permanently delete resigned employee "${emp.name}"?`)) {
        state.employees = state.employees.filter(e => e.id !== empId);
        saveState();
        showCheck();
        renderResignTab();
      }
    });
  });
}

/* ---- Image Generate Preview ---- */
function renderImagePreview() {
  currentView = 'image-preview';
  const vp = document.getElementById('app-viewport');
  const active = state.employees.filter(e => e.status === 'active');
  if (!active.length) {
    vp.innerHTML = '<div class="viewport-grid"><div class="viewport-empty" style="min-height:50vh">No active employees.</div></div>';
    return;
  }
  const grouped = {};
  active.forEach(e => {
    const d = e.department || 'Other';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });

  // Get active departments in order, preserving user ordering from state.departments
  const activeDepts = state.departments.filter(d => grouped[d] && grouped[d].length > 0);
  Object.keys(grouped).forEach(d => {
    if (!activeDepts.includes(d)) {
      activeDepts.push(d);
    }
  });

  // Distribute departments alternately to left and right columns to render side-by-side
  const leftDepts = [];
  const rightDepts = [];
  activeDepts.forEach((d, idx) => {
    if (idx % 2 === 0) {
      leftDepts.push(d);
    } else {
      rightDepts.push(d);
    }
  });

  function renderDeptTable(dept) {
    const emps = grouped[dept];
    let h = `<table class="ledger-table"><tbody>
      <tr class="dept-header-row"><td colspan="5">${escHtml(dept)}</td></tr>`;
    emps.forEach((emp, idx) => {
      const d = emp.date ? new Date(emp.date + 'T00:00:00') : null;
      const dateStr = d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '';
      h += `<tr class="ledger-row">
        <td class="idx">${idx + 1}</td>
        <td class="date">${dateStr}</td>
        <td class="name">${escHtml(emp.name)}</td>
        <td class="salary">${Number(emp.salary).toLocaleString('en-IN')}</td>
        <td class="remark"></td>
      </tr>`;
    });
    const emptyRows = Math.max(0, 12 - emps.length);
    for (let e = 0; e < emptyRows; e++) {
      h += `<tr class="ledger-row empty-row">
        <td class="idx"></td>
        <td class="date"></td>
        <td class="name"></td>
        <td class="salary"></td>
        <td class="remark"></td>
      </tr>`;
    }
    h += '</tbody></table>';
    return h;
  }

  let html = '<div class="viewport-grid"><div class="view-heading-row"><h1 class="view-heading">Image Generate Preview</h1><button class="btn btn-sm btn-primary" id="download-ledger-btn">Download Ledger Image</button></div><div class="image-preview-layout">';
  html += '<div class="ipl-left">';
  leftDepts.forEach(d => { html += renderDeptTable(d); });
  html += '</div>';
  html += '<div class="ipl-right">';
  rightDepts.forEach(d => { html += renderDeptTable(d); });
  html += '</div></div></div>';
  vp.innerHTML = html;
  document.getElementById('download-ledger-btn').addEventListener('click', generateAndDownloadImage);
}

function generateAndDownloadImage() {
  const btn = document.getElementById('download-ledger-btn');
  btn.textContent = 'Generating...';
  btn.disabled = true;
  const el = document.querySelector('.image-preview-layout');
  if (!el || typeof html2canvas === 'undefined') { btn.textContent = 'Download Ledger Image'; btn.disabled = false; return; }
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false }).then(canvas => {
    const link = document.createElement('a');
    link.download = 'polish_assort_ledger_' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.textContent = 'Download Ledger Image';
    btn.disabled = false;
  }).catch(() => {
    btn.textContent = 'Download Ledger Image';
    btn.disabled = false;
  });
}

/* ---- Event Binding Helpers ---- */
function attachInlineListeners() {
  document.querySelectorAll('.emp-table .inline-input:not([readonly])').forEach(input => {
    const save = () => {
      const row = input.closest('tr');
      if (!row) return;
      updateEmployeeField(row.dataset.id, input.dataset.field, input.value);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
  });
}

function attachHistoryButtons() {
  document.querySelectorAll('.history-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showHistoryModal(btn.dataset.id);
    });
  });
}

function attachIncrementButtons() {
  document.querySelectorAll('.inc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showIncrementModal(btn.dataset.id);
    });
  });
}

function attachResignButtons() {
  document.querySelectorAll('.resign-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showResignModal(btn.dataset.id);
    });
  });
}

function attachCollapseHeaders() {
  document.querySelectorAll('.dept-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const icon = header.querySelector('.collapse-icon');
      const body = header.nextElementSibling;
      if (body) {
        body.classList.toggle('hidden');
        icon.classList.toggle('collapsed');
      }
    });
  });
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ---- Navigation ---- */
function handleNav(view) {
  closeModal();
  switch (view) {
    case 'add-employee':
      showAddEmployeeModal();
      break;
    case 'employee-preview':
      renderEmployeePreview();
      break;
    case 'employee-list':
      renderEmployeeList();
      break;
    case 'resign-tab':
      renderResignTab();
      break;
    case 'image-preview':
      renderImagePreview();
      break;
    case 'add-department':
      showAddDepartmentModal();
      break;
    case 'setting':
      showSettingsModal();
      break;
    case 'logout':
      handleLogout();
      break;
  }
}

/* ---- Keyboard ---- */
function handleKeydown(e) {
  if (e.key === 'Escape') {
    if (!document.getElementById('modal-overlay').classList.contains('hidden')) {
      closeModal();
      return;
    }
    if (currentView) {
      currentView = null;
      document.getElementById('app-viewport').innerHTML = '';
    }
  }
}

/* ---- Init ---- */
function init() {
  loadState(() => {
    const loginSub = document.getElementById('login-subtitle');

    if (state.password) {
      loginSub.textContent = 'Enter password to continue';
      toggleFieldVisibility('password-confirm', false);
    } else {
      loginSub.textContent = 'Set your admin password';
      toggleFieldVisibility('password-confirm', true);
    }

    if (state.password && state.isAuthenticated) {
      checkSessionTimeout();
      if (state.isAuthenticated) showApp();
    }
  });

  setupPasswordToggle('password-input');
  setupPasswordToggle('password-confirm');

  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('password-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  document.getElementById('nav-logo').addEventListener('click', () => location.reload());

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => handleNav(link.dataset.view));
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.addEventListener('keydown', handleKeydown);

  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(checkSessionTimeout, 30000);
}

document.addEventListener('DOMContentLoaded', init);
