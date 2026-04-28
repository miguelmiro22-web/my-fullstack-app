// ============================================================
// Global State
// ============================================================
let currentUser = null;
const STORAGE_KEY = 'ipt_demo_v1';
const API_URL = 'http://localhost:4000';
window.db = { accounts: [], departments: [], employees: [], requests: [] };

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    loadFromStorage();
    handleRouting();
    window.addEventListener('hashchange', handleRouting);

    // Register form
    document.getElementById('register-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const firstName = document.getElementById('reg-firstname').value.trim();
        const lastName  = document.getElementById('reg-lastname').value.trim();
        const email     = document.getElementById('reg-email').value.trim();
        const password  = document.getElementById('reg-password').value;

        try {
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Mr',
                    firstName,
                    lastName,
                    email,
                    password,
                    confirmPassword: password,
                    role: 'User'
                })
            });

            if (!res.ok) {
                const err = await res.json();
                showToast(err.message || 'Registration failed!', 'danger');
                return;
            }

            localStorage.setItem('unverified_email', email);
            this.reset();
            window.location.hash = '#/verify-email';
        } catch (err) {
            showToast('Cannot connect to server! Make sure your API is running.', 'danger');
        }
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const email    = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const res = await fetch(`${API_URL}/users/authenticate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!res.ok) {
                errorDiv.textContent = 'Invalid email or password!';
                errorDiv.classList.remove('d-none');
                return;
            }

            const user = await res.json();
            // Normalize role to lowercase for existing role checks
            user.role = user.role ? user.role.toLowerCase() : 'user';
            localStorage.setItem('auth_token', user.token);
            setAuthState(true, user);
            errorDiv.classList.add('d-none');
            this.reset();
            window.location.hash = '#/profile';
        } catch (err) {
            showToast('Cannot connect to server! Make sure your API is running.', 'danger');
        }
    });

    // Request form
    document.getElementById('request-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const type = document.getElementById('request-type').value;
        if (!type) { showToast('Please select a request type!', 'danger'); return; }

        let newRequest;
        if (type === 'Leave') {
            const startDate = document.getElementById('leave-start').value;
            const endDate   = document.getElementById('leave-end').value;
            if (!startDate || !endDate) { showToast('Please select start and end dates!', 'danger'); return; }
            newRequest = {
                id: window.db.requests.length + 1, type,
                leaveType: document.getElementById('leave-type').value,
                startDate, endDate,
                reason: document.getElementById('leave-reason').value,
                status: 'Pending',
                date: new Date().toISOString().split('T')[0],
                userEmail: currentUser.email
            };
        } else {
            const items = [];
            document.getElementById('items-container').querySelectorAll('[id^="item-"]').forEach(div => {
                const id   = div.id.split('-')[1];
                const name = document.getElementById('item-name-' + id);
                const qty  = document.getElementById('item-qty-' + id);
                if (name && qty && name.value.trim()) items.push({ name: name.value.trim(), quantity: parseInt(qty.value) || 1 });
            });
            if (!items.length) { showToast('Please add at least one item!', 'danger'); return; }
            newRequest = {
                id: window.db.requests.length + 1, type, items,
                status: 'Pending',
                date: new Date().toISOString().split('T')[0],
                userEmail: currentUser.email
            };
        }
        window.db.requests.push(newRequest);
        saveToStorage();
        showToast('Request submitted successfully!');
        bootstrap.Modal.getInstance(document.getElementById('requestModal')).hide();
        renderRequestsList();
        this.reset();
    });

    // Employee form
    document.getElementById('employee-inline-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const editId      = document.getElementById('emp-edit-id').value;
        const employeeId  = document.getElementById('emp-id-field').value.trim();
        const userEmail   = document.getElementById('emp-email-field').value.trim();
        const position    = document.getElementById('emp-position-field').value.trim();
        const deptId      = parseInt(document.getElementById('emp-dept-field').value);
        const hireDate    = document.getElementById('emp-hire-field').value;
        const emailError  = document.getElementById('emp-email-error');

        // Check against API-loaded accounts
        const user = window.db.accounts.find(a => a.email === userEmail);
        if (!user) { emailError.style.display = 'block'; return; }
        emailError.style.display = 'none';

        if (editId) {
            const emp = window.db.employees.find(e => e.id === parseInt(editId));
            if (emp) { emp.employeeId = employeeId; emp.userId = user.id; emp.position = position; emp.departmentId = deptId; emp.hireDate = hireDate; }
        } else {
            window.db.employees.push({ id: window.db.employees.length + 1, employeeId, userId: user.id, position, departmentId: deptId, hireDate });
        }
        saveToStorage(); hideEmployeeForm(); renderEmployeesList();
        showToast(editId ? 'Employee updated!' : 'Employee added!');
    });

    // Department form
    document.getElementById('department-inline-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const editId = document.getElementById('dept-edit-id').value;
        const name   = document.getElementById('dept-name-field').value.trim();
        const desc   = document.getElementById('dept-desc-field').value.trim();
        if (editId) {
            const dept = window.db.departments.find(d => d.id === parseInt(editId));
            if (dept) { dept.name = name; dept.description = desc; }
        } else {
            const newId = window.db.departments.length ? Math.max(...window.db.departments.map(d => d.id)) + 1 : 1;
            window.db.departments.push({ id: newId, name, description: desc });
        }
        saveToStorage(); hideDepartmentForm(); renderDepartmentsList();
        showToast(editId ? 'Department updated!' : 'Department added!');
    });

    // Account form
    document.getElementById('account-inline-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const editId    = document.getElementById('acc-edit-id').value;
        const firstName = document.getElementById('acc-firstname-field').value.trim();
        const lastName  = document.getElementById('acc-lastname-field').value.trim();
        const email     = document.getElementById('acc-email-field').value.trim();
        const password  = document.getElementById('acc-password-field').value;
        const role      = document.getElementById('acc-role-field').value;
        const emailErr  = document.getElementById('acc-email-error');
        const token     = localStorage.getItem('auth_token');

        try {
            if (editId) {
                // UPDATE existing user via API
                const body = { firstName, lastName, email, role };
                if (password) { body.password = password; body.confirmPassword = password; }

                const res = await fetch(`${API_URL}/users/${editId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });

                if (!res.ok) {
                    const err = await res.json();
                    if (err.message && err.message.includes('email')) { emailErr.style.display = 'block'; return; }
                    showToast(err.message || 'Update failed!', 'danger'); return;
                }
                emailErr.style.display = 'none';
            } else {
                // CREATE new user via API
                if (!password) { showToast('Password is required!', 'danger'); return; }

                const res = await fetch(`${API_URL}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: 'Mr',
                        firstName, lastName, email,
                        password,
                        confirmPassword: password,
                        role
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    if (err.message && err.message.includes('email')) { emailErr.style.display = 'block'; return; }
                    showToast(err.message || 'Failed to create account!', 'danger'); return;
                }
                emailErr.style.display = 'none';
            }

            hideAccountForm();
            await renderAccountsList();
            showToast(editId ? 'Account updated!' : 'Account added!');
        } catch (err) {
            showToast('Cannot connect to server!', 'danger');
        }
    });
});

// ============================================================
// ROUTING
// ============================================================
function handleRouting() {
    const hash = window.location.hash || '#/';
    let page = hash.replace(/^#\/?/, '') || 'home';

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const userRoutes  = ['profile', 'requests'];
    const adminRoutes = ['employees', 'accounts', 'departments'];

    if ((userRoutes.includes(page) || adminRoutes.includes(page)) && !currentUser) {
        window.location.hash = '#/login'; return;
    }
    if (adminRoutes.includes(page) && (!currentUser || currentUser.role !== 'admin')) {
        window.location.hash = '#/'; return;
    }

    const el = document.getElementById(page + '-page');
    if (!el) {
        document.getElementById('home-page').classList.add('active'); return;
    }
    el.classList.add('active');

    if (page === 'verify-email') {
        const email = localStorage.getItem('unverified_email');
        if (email) document.getElementById('verify-email-display').textContent = email;
    } else if (page === 'login') {
        const flag = localStorage.getItem('show_verification_success');
        const alertEl = document.getElementById('login-success-alert');
        if (flag === 'true' && alertEl) {
            alertEl.classList.remove('d-none');
            localStorage.removeItem('show_verification_success');
            setTimeout(() => alertEl.classList.add('d-none'), 5000);
        }
    } else if (page === 'profile')   { renderProfile(); }
    else if (page === 'accounts')    { hideAccountForm();    renderAccountsList(); }
    else if (page === 'departments') { hideDepartmentForm(); renderDepartmentsList(); }
    else if (page === 'employees')   { hideEmployeeForm();   renderEmployeesList(); }
    else if (page === 'requests')    {
        const title = document.getElementById('requests-page-title');
        if (title) title.textContent = currentUser.role === 'admin' ? 'All Requests' : 'My Requests';
        renderRequestsList();
    }
}

// ============================================================
// STORAGE — Accounts now live in MySQL via API.
// Departments, Employees, Requests still use localStorage.
// ============================================================
function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        departments: window.db.departments,
        employees:   window.db.employees,
        requests:    window.db.requests
    }));
}

function loadFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            window.db.departments = parsed.departments || [];
            window.db.employees   = parsed.employees   || [];
            window.db.requests    = parsed.requests    || [];
            if (!window.db.departments.length) seedLocalData();
        } else {
            seedLocalData();
        }
    } catch (e) {
        seedLocalData();
    }

    // Auto-login: if JWT token exists, verify it and restore session
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            // Decode JWT payload (middle part between dots)
            const payload = JSON.parse(atob(token.split('.')[1]));
            fetch(`${API_URL}/users/${payload.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.ok ? res.json() : null)
            .then(user => {
                if (user) {
                    user.role = user.role ? user.role.toLowerCase() : 'user';
                    user.token = token;
                    setAuthState(true, user);
                    // Also load all accounts into window.db for employees lookup
                    return fetch(`${API_URL}/users`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }
            })
            .then(res => res && res.ok ? res.json() : null)
            .then(users => {
                if (users) window.db.accounts = users;
            })
            .catch(() => {
                localStorage.removeItem('auth_token');
            });
        } catch (e) {
            localStorage.removeItem('auth_token');
        }
    }
}

function seedLocalData() {
    window.db.departments = [
        { id: 1, name: 'Engineering', description: 'Technology and development team' },
        { id: 2, name: 'HR',          description: 'Human Resources department' }
    ];
    window.db.employees = [];
    window.db.requests  = [];
    saveToStorage();
}

// ============================================================
// AUTH STATE
// ============================================================
function setAuthState(isAuth, user = null) {
    const body = document.body;
    if (isAuth && user) {
        currentUser = user;
        body.classList.remove('not-authenticated');
        body.classList.add('authenticated');
        body.classList.toggle('is-admin', user.role === 'admin');
        const display = document.getElementById('username-display');
        if (display) display.textContent = user.firstName + ' ' + user.lastName;
    } else {
        currentUser = null;
        body.classList.remove('authenticated', 'is-admin');
        body.classList.add('not-authenticated');
    }
}

function logout() {
    localStorage.removeItem('auth_token');
    setAuthState(false);
    window.location.hash = '#/';
    showToast('Logged out successfully!', 'info');
}

// NOTE: Email verification is simulated since the API does not send real emails.
// In a real app, the API would send a verification email with a token link.
function simulateEmailVerification() {
    const email = localStorage.getItem('unverified_email');
    if (!email) { showToast('No email to verify!', 'danger'); return; }
    localStorage.removeItem('unverified_email');
    localStorage.setItem('show_verification_success', 'true');
    showToast('Email verified! You can now log in.', 'success');
    window.location.hash = '#/login';
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function renderProfile() {
    const content = document.getElementById('profile-content');
    if (!currentUser) return;
    content.innerHTML = `
        <div class="card" style="max-width:480px; border-top:3px solid var(--accent);">
            <div class="card-body">
                <h5 class="card-title" style="border-bottom:none; padding-bottom:0; margin-bottom:0.25rem;">${currentUser.firstName} ${currentUser.lastName}</h5>
                <p class="card-text mt-2">
                    <strong>Email:</strong> ${currentUser.email}<br>
                    <strong>Role:</strong> <span class="badge bg-${currentUser.role === 'admin' ? 'danger' : 'primary'}">${currentUser.role}</span>
                </p>
                <button class="btn btn-secondary" onclick="showEditProfileForm()"><i class="bi bi-pencil me-1"></i>Edit Profile</button>
            </div>
        </div>
        <div id="edit-profile-form-container" class="card mt-3" style="display:none; max-width:480px;">
            <div class="card-body">
                <h5 class="card-title">Edit Profile</h5>
                <form id="edit-profile-form">
                    <div class="mb-3"><label class="form-label">First Name</label><input type="text" class="form-control" id="profile-firstname" value="${currentUser.firstName}" required></div>
                    <div class="mb-3"><label class="form-label">Last Name</label><input type="text" class="form-control" id="profile-lastname" value="${currentUser.lastName}" required></div>
                    <div class="mb-3"><label class="form-label">New Password <span style="color:var(--text-muted);font-size:0.78rem;text-transform:none;">(leave blank to keep current)</span></label><input type="password" class="form-control" id="profile-password" placeholder="Enter new password..."></div>
                    <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Save Changes</button>
                    <button type="button" class="btn btn-secondary ms-2" onclick="hideEditProfileForm()">Cancel</button>
                </form>
            </div>
        </div>
    `;
    document.getElementById('edit-profile-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const firstName = document.getElementById('profile-firstname').value.trim();
        const lastName  = document.getElementById('profile-lastname').value.trim();
        const password  = document.getElementById('profile-password').value;
        const token     = localStorage.getItem('auth_token');

        try {
            const body = { firstName, lastName };
            if (password) { body.password = password; body.confirmPassword = password; }

            const res = await fetch(`${API_URL}/users/${currentUser.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) { showToast('Failed to update profile!', 'danger'); return; }

            currentUser.firstName = firstName;
            currentUser.lastName  = lastName;
            document.getElementById('username-display').textContent = firstName + ' ' + lastName;
            renderProfile();
            showToast('Profile updated successfully!');
        } catch (err) {
            showToast('Cannot connect to server!', 'danger');
        }
    });
}

function showEditProfileForm()  { document.getElementById('edit-profile-form-container').style.display = 'block'; }
function hideEditProfileForm()  { document.getElementById('edit-profile-form-container').style.display = 'none'; }

// ============================================================
// ACCOUNTS — Now fetches from API
// ============================================================
async function renderAccountsList() {
    const el    = document.getElementById('accounts-list');
    const token = localStorage.getItem('auth_token');
    el.innerHTML = '<p class="text-muted">Loading accounts...</p>';

    try {
        const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            el.innerHTML = '<p class="text-danger">Failed to load accounts. Make sure you are logged in as Admin.</p>';
            return;
        }

        const accounts = await res.json();
        window.db.accounts = accounts; // keep in sync for employees lookup

        if (!accounts.length) {
            el.innerHTML = '<p class="text-muted">No accounts found.</p>';
            return;
        }

        el.innerHTML = `
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${accounts.map(a => `
                        <tr>
                            <td>${a.firstName} ${a.lastName}</td>
                            <td>${a.email}</td>
                            <td><span class="badge bg-${a.role === 'Admin' ? 'danger' : 'primary'}">${a.role}</span></td>
                            <td>
                                <button class="btn btn-sm btn-warning" onclick="editAccount(${a.id})">Edit</button>
                                <button class="btn btn-sm btn-info"    onclick="resetPassword(${a.id})">Reset Password</button>
                                <button class="btn btn-sm btn-danger"  onclick="deleteAccount(${a.id})">Delete</button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (err) {
        el.innerHTML = '<p class="text-danger">Cannot connect to server. Make sure your API is running on port 4000.</p>';
    }
}

function renderDepartmentsList() {
    const el = document.getElementById('departments-list');
    if (!window.db.departments.length) { el.innerHTML = '<p class="text-muted">No departments found.</p>'; return; }
    el.innerHTML = `
        <table class="table table-striped table-hover">
            <thead class="table-dark"><tr><th>ID</th><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>${window.db.departments.map(d => `
                <tr>
                    <td>${d.id}</td>
                    <td><strong>${d.name}</strong></td>
                    <td>${d.description}</td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editDepartment(${d.id})">Edit</button>
                        <button class="btn btn-sm btn-danger"  onclick="deleteDepartment(${d.id})">Delete</button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>`;
}

function renderEmployeesList() {
    const el = document.getElementById('employees-list');
    if (!window.db.employees.length) { el.innerHTML = '<p class="text-muted">No employees found.</p>'; return; }
    el.innerHTML = `
        <table class="table table-striped table-hover">
            <thead class="table-dark"><tr><th>ID</th><th>Name</th><th>Position</th><th>Dept</th><th>Hire Date</th><th>Actions</th></tr></thead>
            <tbody>${window.db.employees.map(emp => {
                const user = window.db.accounts.find(a => a.id === emp.userId);
                const dept = window.db.departments.find(d => d.id === emp.departmentId);
                return `<tr>
                    <td>${emp.employeeId}</td>
                    <td>${user ? user.firstName + ' ' + user.lastName : 'Unknown'}</td>
                    <td>${emp.position}</td>
                    <td>${dept ? dept.name : 'Unknown'}</td>
                    <td>${emp.hireDate}</td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editEmployee(${emp.id})">Edit</button>
                        <button class="btn btn-sm btn-danger"  onclick="deleteEmployee(${emp.id})">Delete</button>
                    </td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

function renderRequestsList() {
    const el = document.getElementById('requests-list');
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'admin';
    const list = isAdmin ? window.db.requests : window.db.requests.filter(r => r.userEmail === currentUser.email);

    if (!list.length) {
        el.innerHTML = isAdmin
            ? '<p class="text-muted">No requests yet.</p>'
            : '<p class="text-muted">You have no requests yet.</p><button class="btn btn-success" onclick="showNewRequestModal()">Create One</button>';
        return;
    }
    el.innerHTML = `
        <table class="table table-striped table-hover">
            <thead class="table-dark"><tr><th>Date</th>${isAdmin ? '<th>Requested By</th>' : ''}<th>Type</th><th>Details</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${list.map(req => {
                const badge = req.status === 'Approved' ? 'success' : req.status === 'Rejected' ? 'danger' : 'warning';
                const details = req.type === 'Leave'
                    ? `${req.leaveType}: ${req.startDate} to ${req.endDate}`
                    : req.items.map(i => `${i.name} (${i.quantity})`).join(', ');
                const requester = window.db.accounts.find(a => a.email === req.userEmail);
                return `<tr>
                    <td>${req.date}</td>
                    ${isAdmin ? `<td><strong>${requester ? requester.firstName + ' ' + requester.lastName : req.userEmail}</strong></td>` : ''}
                    <td><strong>${req.type}</strong></td>
                    <td>${details}</td>
                    <td><span class="badge bg-${badge}">${req.status}</span></td>
                    <td class="d-flex gap-1 flex-wrap">
                        <button class="btn btn-sm btn-info" onclick="viewRequest(${req.id})">View</button>
                        ${isAdmin && req.status === 'Pending' ? `
                            <button class="btn btn-sm btn-success" onclick="processRequest(${req.id},'Approved')">Approve</button>
                            <button class="btn btn-sm btn-danger"  onclick="processRequest(${req.id},'Rejected')">Reject</button>` : ''}
                        ${!isAdmin && req.status === 'Pending' ? `
                            <button class="btn btn-sm btn-danger" onclick="cancelRequest(${req.id})">Cancel</button>` : ''}
                    </td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
}

// ============================================================
// EMPLOYEE ACTIONS
// ============================================================
function populateDeptDropdown() {
    const sel = document.getElementById('emp-dept-field');
    sel.innerHTML = window.db.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}
function showAddEmployeeForm() {
    document.getElementById('employee-form-title').textContent = 'Add Employee';
    document.getElementById('emp-edit-id').value = '';
    document.getElementById('employee-inline-form').reset();
    document.getElementById('emp-email-error').style.display = 'none';
    document.getElementById('emp-hire-field').value = new Date().toISOString().split('T')[0];
    populateDeptDropdown();
    document.getElementById('employee-form-container').style.display = 'block';
    document.getElementById('employee-form-container').scrollIntoView({ behavior: 'smooth' });
}
function hideEmployeeForm() {
    document.getElementById('employee-form-container').style.display = 'none';
    document.getElementById('employee-inline-form').reset();
}
function editEmployee(id) {
    const emp = window.db.employees.find(e => e.id === id); if (!emp) return;
    const user = window.db.accounts.find(a => a.id === emp.userId);
    document.getElementById('employee-form-title').textContent = 'Edit Employee';
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-id-field').value = emp.employeeId;
    document.getElementById('emp-email-field').value = user ? user.email : '';
    document.getElementById('emp-position-field').value = emp.position;
    document.getElementById('emp-hire-field').value = emp.hireDate;
    document.getElementById('emp-email-error').style.display = 'none';
    populateDeptDropdown();
    document.getElementById('emp-dept-field').value = emp.departmentId;
    document.getElementById('employee-form-container').style.display = 'block';
    document.getElementById('employee-form-container').scrollIntoView({ behavior: 'smooth' });
}
function deleteEmployee(id) {
    const emp = window.db.employees.find(e => e.id === id); if (!emp) return;
    if (confirm(`Delete employee ${emp.employeeId}?`)) {
        window.db.employees = window.db.employees.filter(e => e.id !== id);
        saveToStorage(); renderEmployeesList(); showToast('Employee deleted.', 'danger');
    }
}

// ============================================================
// DEPARTMENT ACTIONS
// ============================================================
function showAddDepartmentForm() {
    document.getElementById('department-form-title').textContent = 'Add Department';
    document.getElementById('dept-edit-id').value = '';
    document.getElementById('department-inline-form').reset();
    document.getElementById('department-form-container').style.display = 'block';
    document.getElementById('department-form-container').scrollIntoView({ behavior: 'smooth' });
}
function hideDepartmentForm() {
    document.getElementById('department-form-container').style.display = 'none';
    document.getElementById('department-inline-form').reset();
}
function editDepartment(id) {
    const dept = window.db.departments.find(d => d.id === id); if (!dept) return;
    document.getElementById('department-form-title').textContent = 'Edit Department';
    document.getElementById('dept-edit-id').value = dept.id;
    document.getElementById('dept-name-field').value = dept.name;
    document.getElementById('dept-desc-field').value = dept.description;
    document.getElementById('department-form-container').style.display = 'block';
    document.getElementById('department-form-container').scrollIntoView({ behavior: 'smooth' });
}
function deleteDepartment(id) {
    const dept = window.db.departments.find(d => d.id === id); if (!dept) return;
    if (confirm(`Delete "${dept.name}"?`)) {
        window.db.departments = window.db.departments.filter(d => d.id !== id);
        saveToStorage(); renderDepartmentsList(); showToast('Department deleted.', 'danger');
    }
}

// ============================================================
// ACCOUNT ACTIONS — Now calls API
// ============================================================
function showAddAccountForm() {
    document.getElementById('account-form-title').textContent = 'Add Account';
    document.getElementById('acc-edit-id').value = '';
    document.getElementById('account-inline-form').reset();
    document.getElementById('acc-email-error').style.display = 'none';
    document.getElementById('acc-password-field').required = true;
    document.getElementById('account-form-container').style.display = 'block';
    document.getElementById('account-form-container').scrollIntoView({ behavior: 'smooth' });
}
function hideAccountForm() {
    document.getElementById('account-form-container').style.display = 'none';
    document.getElementById('account-inline-form').reset();
}
function editAccount(id) {
    // Find from the API-loaded accounts in window.db
    const acc = window.db.accounts.find(a => a.id === id); if (!acc) return;
    document.getElementById('account-form-title').textContent = 'Edit Account';
    document.getElementById('acc-edit-id').value = acc.id;
    document.getElementById('acc-firstname-field').value = acc.firstName;
    document.getElementById('acc-lastname-field').value = acc.lastName;
    document.getElementById('acc-email-field').value = acc.email;
    document.getElementById('acc-password-field').value = '';
    document.getElementById('acc-password-field').required = false;
    document.getElementById('acc-role-field').value = acc.role;
    document.getElementById('acc-email-error').style.display = 'none';
    document.getElementById('account-form-container').style.display = 'block';
    document.getElementById('account-form-container').scrollIntoView({ behavior: 'smooth' });
}
function resetPassword(id) {
    editAccount(id);
    document.getElementById('account-form-title').textContent = 'Reset Password';
    setTimeout(() => document.getElementById('acc-password-field').focus(), 100);
}
async function deleteAccount(id) {
    if (currentUser && currentUser.id === id) { showToast('Cannot delete your own account!', 'danger'); return; }
    const acc = window.db.accounts.find(a => a.id === id); if (!acc) return;
    if (!confirm(`Delete ${acc.firstName} ${acc.lastName}?`)) return;

    const token = localStorage.getItem('auth_token');
    try {
        const res = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Account deleted.', 'danger');
            await renderAccountsList();
        } else {
            showToast('Failed to delete account.', 'danger');
        }
    } catch (err) {
        showToast('Cannot connect to server!', 'danger');
    }
}

// ============================================================
// REQUEST ACTIONS
// ============================================================
let itemCounter = 0;

function handleRequestTypeChange() {
    const type = document.getElementById('request-type').value;
    document.getElementById('items-section').style.display = (type === 'Equipment' || type === 'Resources') ? 'block' : 'none';
    document.getElementById('leave-section').style.display = type === 'Leave' ? 'block' : 'none';
    if ((type === 'Equipment' || type === 'Resources') && !document.getElementById('items-container').children.length) addItemField();
    if (type === 'Leave') {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('leave-start').value = today;
        document.getElementById('leave-end').value = today;
    }
}

function showNewRequestModal() {
    document.getElementById('request-form').reset();
    document.getElementById('items-container').innerHTML = '';
    itemCounter = 0;
    document.getElementById('items-section').style.display = 'none';
    document.getElementById('leave-section').style.display = 'none';
    new bootstrap.Modal(document.getElementById('requestModal')).show();
}

function addItemField() {
    itemCounter++;
    const container = document.getElementById('items-container');
    const isFirst = itemCounter === 1;
    if (!isFirst) {
        const prev = container.querySelector('.item-add-btn');
        if (prev) { const pid = prev.dataset.id; prev.outerHTML = `<button type="button" class="btn btn-outline-danger btn-sm item-remove-btn" onclick="removeItemField(${pid})">×</button>`; }
    }
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-2 align-items-center';
    div.id = 'item-' + itemCounter;
    div.innerHTML = `
        <input type="text" class="form-control" placeholder="Item name" id="item-name-${itemCounter}" required>
        <input type="number" class="form-control" style="width:70px;" placeholder="Qty" id="item-qty-${itemCounter}" min="1" value="1" required>
        <button type="button" class="btn btn-outline-success btn-sm item-add-btn" data-id="${itemCounter}" onclick="addItemField()">+</button>`;
    container.appendChild(div);
}

function removeItemField(id) {
    const div = document.getElementById('item-' + id);
    if (div) {
        div.remove();
        const rows = document.getElementById('items-container').querySelectorAll('[id^="item-"]');
        if (rows.length) {
            const last = rows[rows.length - 1];
            const lid  = last.id.split('-')[1];
            const rb   = last.querySelector('.item-remove-btn');
            if (rb) rb.outerHTML = `<button type="button" class="btn btn-outline-success btn-sm item-add-btn" data-id="${lid}" onclick="addItemField()">+</button>`;
        }
    }
}

function viewRequest(id) {
    const req = window.db.requests.find(r => r.id === id); if (!req) return;
    const details = req.type === 'Leave'
        ? `Leave Type: ${req.leaveType}\nStart: ${req.startDate}\nEnd: ${req.endDate}\nReason: ${req.reason || 'N/A'}`
        : req.items.map(i => `- ${i.name}: ${i.quantity}`).join('\n');
    alert(`Request #${req.id}\nType: ${req.type}\nDate: ${req.date}\nStatus: ${req.status}\n\n${details}`);
}

function processRequest(id, status) {
    const req = window.db.requests.find(r => r.id === id); if (!req) return;
    if (!confirm(`${status === 'Approved' ? 'Approve' : 'Reject'} this request?`)) return;
    req.status = status;
    saveToStorage(); renderRequestsList();
    showToast(`Request ${status.toLowerCase()}!`, status === 'Approved' ? 'success' : 'danger');
}

function cancelRequest(id) {
    const req = window.db.requests.find(r => r.id === id); if (!req) return;
    if (confirm('Cancel this request?')) {
        req.status = 'Rejected';
        saveToStorage(); renderRequestsList(); showToast('Request cancelled.', 'danger');
    }
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'success') {
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();
    const colors = {
        success: { bg: '#f0fdf4', border: 'rgba(22,163,74,0.3)',  color: '#15803d', icon: 'bi-check-circle-fill' },
        danger:  { bg: '#fff1f1', border: 'rgba(220,38,38,0.3)',  color: '#b91c1c', icon: 'bi-x-circle-fill' },
        info:    { bg: '#f0f9ff', border: 'rgba(2,132,199,0.2)',   color: '#0369a1', icon: 'bi-info-circle-fill' },
    };
    const c = colors[type] || colors.success;
    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.innerHTML = `<i class="bi ${c.icon} me-2"></i>${message}`;
    Object.assign(toast.style, {
        position: 'fixed', top: '80px', right: '24px', zIndex: '9999',
        background: c.bg, border: `1px solid ${c.border}`, color: c.color,
        padding: '0.75rem 1.25rem', borderRadius: '10px',
        fontFamily: "'DM Sans', sans-serif", fontWeight: '600', fontSize: '0.875rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center',
        minWidth: '240px', transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}