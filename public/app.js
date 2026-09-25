// Configuration
const API_URL = 'https://hotel-user-request-system.avanivacationclubsamui1.workers.dev';

let currentUser = null;
let programs = [];
let selectedLoginRole = 'user';
let editingUserId = null;

// Check if already logged in
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = sessionStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showApp();
  }
});

// Login Tab Switching
document.querySelectorAll('.login-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedLoginRole = tab.dataset.role;
  });
});

// Login Form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        role: selectedLoginRole
      })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.data;
      sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
      errorDiv.style.display = 'none';
      showApp();
    } else {
      errorDiv.textContent = data.message || 'Invalid username or password';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.textContent = 'An error occurred during login';
    errorDiv.style.display = 'block';
  }
});

// Show App
function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-container').classList.add('active');

  // Update user info
  document.getElementById('user-name').textContent = currentUser.full_name;
  document.getElementById('user-role-badge').textContent = currentUser.role === 'admin' ? 'Administrator' : 'User';
  document.getElementById('user-avatar').textContent = currentUser.full_name.charAt(0);

  // Show/hide admin tabs
  if (currentUser.role === 'user') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  loadPrograms();
  loadDepartments();
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('currentUser');
  currentUser = null;
  location.reload();
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;

    // Check permission
    if (currentUser.role === 'user' && btn.classList.contains('admin-only')) {
      showError('You do not have permission to access this page');
      return;
    }

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    if (tabName === 'list') {
      loadRequests();
    } else if (tabName === 'audit') {
      loadAuditLogs();
    } else if (tabName === 'reports') {
      initReportDates();
    } else if (tabName === 'users') {
      loadSystemUsers();
    } else if (tabName === 'programs') {
      loadProgramsManagement();
    } else if (tabName === 'departments') {
      loadDepartmentHeads();
    } else if (tabName === 'approvers') {
      loadApprovalSettings();
    }
  });
});

// Initialize report dates
function initReportDates() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  document.getElementById('report-from-date').value = firstDay;
  document.getElementById('report-to-date').value = today;
}

// Load programs
async function loadPrograms() {
  try {
    const response = await fetch(`${API_URL}/api/programs`);
    const data = await response.json();

    if (data.success) {
      programs = data.data;
      addProgramAccess();
    } else {
      showError('Unable to load programs');
    }
  } catch (error) {
    console.error('Error loading programs:', error);
    showError('An error occurred while loading data');
  }
}

// Load departments
async function loadDepartments() {
  try {
    const response = await fetch(`${API_URL}/api/departments`);
    const data = await response.json();

    if (data.success) {
      const departmentSelect = document.getElementById('department_select');
      if (departmentSelect) {
        departmentSelect.innerHTML = '<option value="">-- Select Department --</option>' +
          data.data.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
      }
    }
  } catch (error) {
    console.error('Error loading departments:', error);
  }
}

// Load department heads management
async function loadDepartmentHeads() {
  try {
    const [departmentsRes, headsRes] = await Promise.all([
      fetch(`${API_URL}/api/departments`),
      fetch(`${API_URL}/api/department-heads`)
    ]);

    const departmentsData = await departmentsRes.json();
    const headsData = await headsRes.json();

    if (departmentsData.success && headsData.success) {
      const departments = departmentsData.data;
      const heads = headsData.data;

      const container = document.getElementById('departments-list');

      container.innerHTML = departments.map(dept => {
        const head = heads.find(h => h.department_id === dept.id);
        return `
        <div class="card" style="margin-bottom: 16px;">
          <div class="card-body">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
              <div>
                <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: var(--primary);">
                  ${dept.name}
                </h3>
                <p style="margin: 0; color: var(--gray-600); font-size: 0.9rem;">
                  ${dept.description || 'Department'}
                </p>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="editDepartmentHead(${dept.id}, '${dept.name.replace(/'/g, "\\'")}', '${head?.head_name?.replace(/'/g, "\\'") || ''}', '${head?.head_email || ''}')">
                ${head ? '✏️ Edit' : '➕ Set'} Head
              </button>
            </div>
            ${head ? `
            <div style="background: var(--gray-50); padding: 16px; border-radius: 8px;">
              <div style="margin-bottom: 8px;">
                <strong style="color: var(--gray-700);">Department Head:</strong>
                <span style="margin-left: 8px;">${head.head_name}</span>
              </div>
              <div>
                <strong style="color: var(--gray-700);">Email:</strong>
                <span style="margin-left: 8px;">${head.head_email}</span>
              </div>
            </div>
            ` : `
            <div style="background: var(--yellow-50); padding: 12px; border-radius: 8px; border-left: 4px solid var(--yellow-500);">
              <p style="margin: 0; color: var(--yellow-700); font-size: 0.9rem;">
                ⚠️ No department head configured
              </p>
            </div>
            `}
          </div>
        </div>
      `;
      }).join('');
    } else {
      showError('Unable to load departments');
    }
  } catch (error) {
    console.error('Error loading department heads:', error);
    showError('An error occurred while loading department heads');
  }
}

// Edit department head
window.editDepartmentHead = function(deptId, deptName, headName, headEmail) {
  const newName = prompt(`${deptName} - Department Head\n\nEnter name:`, headName);
  if (newName === null) return;

  const newEmail = prompt(`${deptName} - Department Head\n\nEnter email:`, headEmail);
  if (newEmail === null) return;

  updateDepartmentHead(deptId, newName, newEmail);
};

// Update department head
async function updateDepartmentHead(deptId, name, email) {
  try {
    const response = await fetch(`${API_URL}/api/department-heads/${deptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        head_name: name,
        head_email: email,
        updatedBy: currentUser.username
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Department head updated successfully');
      loadDepartmentHeads();
    } else {
      showError(data.message || 'Unable to update department head');
    }
  } catch (error) {
    console.error('Error updating department head:', error);
    showError('An error occurred while updating department head');
  }
}

// Add program access field
function addProgramAccess() {
  const container = document.getElementById('program-access-list');
  const index = container.children.length;

  const div = document.createElement('div');
  div.className = 'program-access-item';
  div.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr auto; gap: 16px; align-items: end; padding: 16px; background: var(--gray-50); border-radius: 10px; margin-bottom: 12px;';
  div.innerHTML = `
    <div class="form-group" style="margin-bottom: 0;">
      <label>Program</label>
      <select class="program-select" data-index="${index}" required>
        <option value="">-- Select Program --</option>
        ${programs.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin-bottom: 0;">
      <label>Roles (select multiple)</label>
      <div class="role-checkboxes" data-index="${index}" style="border: 1px solid var(--gray-300); border-radius: 8px; padding: 12px; min-height: 50px; background: var(--gray-50);">
        <p style="color: var(--gray-500); margin: 0; font-size: 0.9rem;">Select a program first</p>
      </div>
    </div>
    <div class="form-group" style="margin-bottom: 0;">
      ${index > 0 ? '<button type="button" class="btn btn-danger btn-icon remove-program">🗑️</button>' : '<div style="width: 40px;"></div>'}
    </div>
  `;

  container.appendChild(div);

  div.querySelector('.program-select').addEventListener('change', async (e) => {
    const programId = e.target.value;
    const roleContainer = div.querySelector('.role-checkboxes');

    if (programId) {
      await loadRolesCheckbox(programId, roleContainer);
    } else {
      roleContainer.innerHTML = '<p style="color: var(--gray-500); margin: 0; font-size: 0.9rem;">Select a program first</p>';
    }
  });

  const removeBtn = div.querySelector('.remove-program');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      div.remove();
    });
  }
}

// Load roles as checkboxes
async function loadRolesCheckbox(programId, containerElement) {
  try {
    const program = programs.find(p => p.id == programId);
    if (program && program.roles && program.roles.length > 0) {
      containerElement.innerHTML = program.roles.map(r => `
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
          <input type="checkbox" value="${r.id}" class="role-checkbox" style="width: auto;">
          <span>${r.role_name}</span>
        </label>
      `).join('');
    } else {
      containerElement.innerHTML = '<p style="color: var(--gray-500); margin: 0; font-size: 0.9rem;">No roles available</p>';
    }
  } catch (error) {
    console.error('Error loading roles:', error);
    containerElement.innerHTML = '<p style="color: var(--error); margin: 0; font-size: 0.9rem;">Error loading roles</p>';
  }
}

// Load roles (old function for compatibility)
async function loadRoles(programId, selectElement) {
  try {
    const program = programs.find(p => p.id == programId);
    if (program && program.roles) {
      selectElement.innerHTML = '<option value="">-- Select Role --</option>' +
        program.roles.map(r => `<option value="${r.id}">${r.role_name}</option>`).join('');
    }
  } catch (error) {
    console.error('Error loading roles:', error);
  }
}

// Add program button
document.getElementById('add-program-btn').addEventListener('click', () => {
  addProgramAccess();
});

// Submit create request form
document.getElementById('create-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const programAccess = [];

  document.querySelectorAll('.program-access-item').forEach(item => {
    const programSelect = item.querySelector('.program-select');
    const roleCheckboxes = item.querySelectorAll('.role-checkbox:checked');

    if (programSelect.value && roleCheckboxes.length > 0) {
      roleCheckboxes.forEach(checkbox => {
        programAccess.push({
          program_id: parseInt(programSelect.value),
          role_id: parseInt(checkbox.value)
        });
      });
    }
  });

  if (programAccess.length === 0) {
    showError('Please select at least one program and role');
    return;
  }

  const departmentSelect = document.getElementById('department_select');
  const departmentId = departmentSelect.value;
  const departmentName = departmentSelect.options[departmentSelect.selectedIndex].text;

  const requestData = {
    user: {
      employee_id: formData.get('employee_id'),
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      email: formData.get('email'),
      department: departmentName,
      position: formData.get('position')
    },
    requester: {
      name: formData.get('requester_name'),
      email: formData.get('requester_email')
    },
    programAccess: programAccess,
    department_id: departmentId ? parseInt(departmentId) : null,
    notes: formData.get('notes')
  };

  try {
    const response = await fetch(`${API_URL}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    const data = await response.json();

    if (data.success) {
      showSuccess(`✅ Request created successfully! เลขที่: ${data.data.requestNumber}`);
      e.target.reset();
      document.getElementById('program-access-list').innerHTML = '';
      addProgramAccess();
    } else {
      showError('Unable to create request: ' + data.message);
    }
  } catch (error) {
    console.error('Error creating request:', error);
    showError('An error occurredในการสร้างคำขอ');
  }
});

// Load requests
async function loadRequests() {
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('filter-search').value;

  const container = document.getElementById('requests-list');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

  try {
    let url = `${API_URL}/api/requests?limit=50`;
    if (status) url += `&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      displayRequests(data.data);
    } else {
      container.innerHTML = '<div class="alert alert-error">Unable to load data</div>';
    }
  } catch (error) {
    console.error('Error loading requests:', error);
    container.innerHTML = '<div class="alert alert-error">An error occurredในการโหลดข้อมูล</div>';
  }
}

// Display requests
function displayRequests(requests) {
  const container = document.getElementById('requests-list');

  if (requests.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 40px;">No data found</p>';
    return;
  }

  container.innerHTML = requests.map(req => {
    const date = new Date(req.request_date).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="request-card" data-id="${req.id}">
        <div class="request-header">
          <span class="request-number">${req.request_number}</span>
          <span class="status-badge status-${req.status}">${getStatusText(req.status)}</span>
        </div>
        <div class="request-info">
          <p><strong>พนักงาน:</strong> ${req.first_name} ${req.last_name}</p>
          <p><strong>รหัส:</strong> ${req.employee_id} | <strong>แผนก:</strong> ${req.department || '-'}</p>
          <p><strong>วันที่:</strong> ${date}</p>
          <p><strong>ผู้ขอ:</strong> ${req.requester_name}</p>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.request-card').forEach(card => {
    card.addEventListener('click', () => {
      showRequestDetail(card.dataset.id);
    });
  });
}

function getStatusText(status) {
  const statusMap = {
    'pending': '⏳ รอพิจารณา',
    'approved': '✅ อนุมัติแล้ว',
    'rejected': '❌ ไม่อนุมัติ',
    'completed': '🎉 เสร็จสิ้น'
  };
  return statusMap[status] || status;
}

// Show request detail modal
async function showRequestDetail(requestId) {
  const modal = document.getElementById('detail-modal');
  const modalBody = document.getElementById('modal-body');

  modalBody.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';
  modal.classList.add('active');

  try {
    const response = await fetch(`${API_URL}/api/requests/${requestId}`);
    const data = await response.json();

    if (data.success) {
      const req = data.data;
      const requestDate = new Date(req.request_date).toLocaleString('th-TH');

      modalBody.innerHTML = `
        <div style="padding: 20px;">
          <div style="background: var(--gray-50); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px;">📋 ข้อมูลคำขอ</h3>
            <div style="display: grid; gap: 12px;">
              <p><strong>เลขที่:</strong> ${req.request_number}</p>
              <p><strong>สถานะ:</strong> <span class="status-badge status-${req.status}">${getStatusText(req.status)}</span></p>
              <p><strong>วันที่ขอ:</strong> ${requestDate}</p>
            </div>
          </div>

          <div style="background: var(--gray-50); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px;">👤 ข้อมูลพนักงาน</h3>
            <div style="display: grid; gap: 8px;">
              <p><strong>รหัส:</strong> ${req.employee_id}</p>
              <p><strong>ชื่อ:</strong> ${req.first_name} ${req.last_name}</p>
              <p><strong>อีเมล:</strong> ${req.user_email}</p>
              <p><strong>แผนก:</strong> ${req.department || '-'}</p>
              <p><strong>ตำแหน่ง:</strong> ${req.position || '-'}</p>
            </div>
          </div>

          <div style="background: var(--gray-50); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px;">💻 โปรแกรมและสิทธิ์</h3>
            <div style="display: grid; gap: 8px;">
              ${req.programAccess.map(pa => `
                <p>• <strong>${pa.program_name}</strong> - ${pa.role_name}</p>
              `).join('')}
            </div>
          </div>

          ${req.notes ? `
            <div style="background: var(--gray-50); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
              <h3 style="margin-bottom: 12px;">📌 หมายเหตุ</h3>
              <p>${req.notes}</p>
            </div>
          ` : ''}

          ${currentUser.role === 'admin' && req.status === 'pending' ? `
            <div style="background: var(--primary-light); padding: 20px; border-radius: 12px; margin-bottom: 24px;">
              <h3 style="margin-bottom: 12px;">⚡ การจัดการคำขอ</h3>
              <div style="display: flex; gap: 12px;">
                <button class="btn btn-success" onclick="updateStatus(${req.id}, 'approved')">✅ อนุมัติ</button>
                <button class="btn btn-danger" onclick="updateStatus(${req.id}, 'rejected')">❌ ไม่อนุมัติ</button>
              </div>
            </div>
          ` : ''}

          ${req.approved_by ? `
            <div style="background: var(--gray-50); padding: 20px; border-radius: 12px;">
              <h3 style="margin-bottom: 12px;">✅ การอนุมัติ</h3>
              <p><strong>ผู้อนุมัติ:</strong> ${req.approved_by}</p>
              ${req.approved_date ? `<p><strong>วันที่:</strong> ${new Date(req.approved_date).toLocaleString('th-TH')}</p>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    } else {
      modalBody.innerHTML = '<div class="alert alert-error">Unable to load data</div>';
    }
  } catch (error) {
    console.error('Error loading request detail:', error);
    modalBody.innerHTML = '<div class="alert alert-error">An error occurred</div>';
  }
}

// Update request status
window.updateStatus = async function(requestId, status) {
  const changedBy = currentUser.full_name;

  try {
    const response = await fetch(`${API_URL}/api/requests/${requestId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status,
        changedBy: changedBy,
        approvedBy: changedBy
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Status updated successfully');
      document.getElementById('detail-modal').classList.remove('active');
      loadRequests();
    } else {
      showError('Unable to update status');
    }
  } catch (error) {
    console.error('Error updating status:', error);
    showError('An error occurred');
  }
};

// Generate Report
document.getElementById('generate-report-btn')?.addEventListener('click', async () => {
  const fromDate = document.getElementById('report-from-date').value;
  const toDate = document.getElementById('report-to-date').value;

  if (!fromDate || !toDate) {
    showError('Please select date range');
    return;
  }

  try {
    const url = `${API_URL}/api/requests?fromDate=${fromDate}&toDate=${toDate}&limit=1000`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      displayReport(data.data, fromDate, toDate);
    } else {
      showError('Unable to generate report');
    }
  } catch (error) {
    console.error('Error generating report:', error);
    showError('An error occurred');
  }
});

// Display Report
function displayReport(requests, fromDate, toDate) {
  const summary = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    completed: requests.filter(r => r.status === 'completed').length
  };

  document.getElementById('report-summary').innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div class="card" style="background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: white; text-align: center; padding: 24px;">
        <h3 style="font-size: 2.5rem; margin-bottom: 8px;">${summary.total}</h3>
        <p>รวมทั้งหมด</p>
      </div>
      <div class="card" style="background: #fef3c7; text-align: center; padding: 24px;">
        <h3 style="font-size: 2.5rem; margin-bottom: 8px; color: #92400e;">${summary.pending}</h3>
        <p style="color: #92400e;">รอพิจารณา</p>
      </div>
      <div class="card" style="background: #d1fae5; text-align: center; padding: 24px;">
        <h3 style="font-size: 2.5rem; margin-bottom: 8px; color: #065f46;">${summary.approved}</h3>
        <p style="color: #065f46;">อนุมัติแล้ว</p>
      </div>
      <div class="card" style="background: #fee2e2; text-align: center; padding: 24px;">
        <h3 style="font-size: 2.5rem; margin-bottom: 8px; color: #991b1b;">${summary.rejected}</h3>
        <p style="color: #991b1b;">ไม่อนุมัติ</p>
      </div>
      <div class="card" style="background: #dbeafe; text-align: center; padding: 24px;">
        <h3 style="font-size: 2.5rem; margin-bottom: 8px; color: #1e40af;">${summary.completed}</h3>
        <p style="color: #1e40af;">เสร็จสิ้น</p>
      </div>
    </div>
  `;

  document.getElementById('report-list').innerHTML = `
    <div class="card">
      <h3 style="margin-bottom: 16px;">📋 รายละเอียดคำขอ</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--gray-100);">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--gray-300);">เลขที่</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--gray-300);">รหัสพนักงาน</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--gray-300);">ชื่อ-นามสกุล</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--gray-300);">แผนก</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--gray-300);">สถานะ</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--gray-300);">วันที่</th>
            </tr>
          </thead>
          <tbody>
            ${requests.map(req => `
              <tr style="border-bottom: 1px solid var(--gray-200);">
                <td style="padding: 12px;">${req.request_number}</td>
                <td style="padding: 12px;">${req.employee_id}</td>
                <td style="padding: 12px;">${req.first_name} ${req.last_name}</td>
                <td style="padding: 12px;">${req.department || '-'}</td>
                <td style="padding: 12px;"><span class="status-badge status-${req.status}">${getStatusText(req.status)}</span></td>
                <td style="padding: 12px;">${new Date(req.request_date).toLocaleDateString('th-TH')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Export Excel
document.getElementById('export-excel-btn')?.addEventListener('click', async () => {
  const fromDate = document.getElementById('report-from-date').value;
  const toDate = document.getElementById('report-to-date').value;

  if (!fromDate || !toDate) {
    showError('Please select date rangeก่อน');
    return;
  }

  try {
    const url = `${API_URL}/api/requests?fromDate=${fromDate}&toDate=${toDate}&limit=10000`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      exportToCSV(data.data, fromDate, toDate);
    }
  } catch (error) {
    console.error('Error exporting:', error);
    showError('An error occurredในการ Export');
  }
});

function exportToCSV(requests, fromDate, toDate) {
  const csv = [
    ['เลขที่คำขอ', 'รหัสพนักงาน', 'ชื่อ', 'นามสกุล', 'อีเมล', 'แผนก', 'ตำแหน่ง', 'สถานะ', 'วันที่ขอ', 'ผู้ขอ'],
    ...requests.map(r => [
      r.request_number,
      r.employee_id,
      r.first_name,
      r.last_name,
      r.user_email,
      r.department || '',
      r.position || '',
      r.status,
      new Date(r.request_date).toLocaleString('th-TH'),
      r.requester_name
    ])
  ].map(row => row.join(',')).join('\n');

  const BOM = '﻿';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `request-report-${fromDate}-to-${toDate}.csv`;
  link.click();

  showSuccess('✅ Export successful');
}

// Load audit logs
async function loadAuditLogs() {
  const action = document.getElementById('audit-action').value;
  const days = parseInt(document.getElementById('audit-days').value);

  const container = document.getElementById('audit-list');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    let url = `${API_URL}/api/audit?fromDate=${fromDate.toISOString()}&toDate=${toDate.toISOString()}&limit=100`;
    if (action) url += `&action=${action}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.success) {
      displayAuditLogs(data.data);
    } else {
      container.innerHTML = '<div class="alert alert-error">Unable to load data</div>';
    }
  } catch (error) {
    console.error('Error loading audit logs:', error);
    container.innerHTML = '<div class="alert alert-error">An error occurred</div>';
  }
}

function displayAuditLogs(logs) {
  const container = document.getElementById('audit-list');

  if (logs.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 40px;">No data found</p>';
    return;
  }

  container.innerHTML = logs.map(log => `
    <div style="background: white; padding: 20px; border-radius: 12px; margin-bottom: 12px; border-left: 4px solid var(--primary); box-shadow: var(--shadow-sm);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <span style="font-weight: 700; color: var(--primary);">${log.action}</span>
          ${log.request_number ? `<span style="margin-left: 12px; color: var(--gray-500);">คำขอ: ${log.request_number}</span>` : ''}
        </div>
        <span style="color: var(--gray-500); font-size: 0.85rem;">${new Date(log.created_at).toLocaleString('th-TH')}</span>
      </div>
      <p style="color: var(--gray-700);">${log.change_description}</p>
      <p style="color: var(--gray-500); font-size: 0.85rem; margin-top: 8px;">โดย: ${log.changed_by}${log.ip_address ? ` (IP: ${log.ip_address})` : ''}</p>
    </div>
  `).join('');
}

// ============================================
// USER MANAGEMENT FUNCTIONS
// ============================================

// Load system users
async function loadSystemUsers() {
  const container = document.getElementById('users-list');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

  try {
    const response = await fetch(`${API_URL}/api/system-users`);
    const data = await response.json();

    if (data.success) {
      displaySystemUsers(data.data);
    } else {
      container.innerHTML = '<div class="alert alert-error">Unable to load data</div>';
    }
  } catch (error) {
    console.error('Error loading users:', error);
    container.innerHTML = '<div class="alert alert-error">An error occurred</div>';
  }
}

function displaySystemUsers(users) {
  const container = document.getElementById('users-list');

  if (users.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 40px;">No data found</p>';
    return;
  }

  container.innerHTML = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden;">
        <thead>
          <tr style="background: var(--gray-100);">
            <th style="padding: 16px; text-align: left;">Username</th>
            <th style="padding: 16px; text-align: left;">ชื่อ-นามสกุล</th>
            <th style="padding: 16px; text-align: left;">อีเมล</th>
            <th style="padding: 16px; text-align: left;">บทบาท</th>
            <th style="padding: 16px; text-align: center;">สถานะ</th>
            <th style="padding: 16px; text-align: center;">Login ล่าสุด</th>
            <th style="padding: 16px; text-align: center;">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => `
            <tr style="border-bottom: 1px solid var(--gray-200);">
              <td style="padding: 16px;"><strong>${user.username}</strong></td>
              <td style="padding: 16px;">${user.full_name}</td>
              <td style="padding: 16px;">${user.email || '-'}</td>
              <td style="padding: 16px;">
                <span class="status-badge ${user.role === 'admin' ? 'status-completed' : 'status-pending'}">
                  ${user.role === 'admin' ? '🔐 Admin' : '👤 User'}
                </span>
              </td>
              <td style="padding: 16px; text-align: center;">
                <span class="status-badge ${user.is_active ? 'status-approved' : 'status-rejected'}">
                  ${user.is_active ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน'}
                </span>
              </td>
              <td style="padding: 16px; text-align: center; font-size: 0.9rem; color: var(--gray-600);">
                ${user.last_login ? new Date(user.last_login).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
              </td>
              <td style="padding: 16px; text-align: center;">
                <button class="btn btn-secondary btn-icon" onclick="editUser(${user.id})" title="แก้ไข">✏️</button>
                <button class="btn btn-danger btn-icon" onclick="deleteUser(${user.id}, '${user.username}')" title="ลบ">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Add user button
document.getElementById('add-user-btn')?.addEventListener('click', () => {
  openUserModal();
});

// Open user modal
function openUserModal(userId = null) {
  editingUserId = userId;
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');

  form.reset();
  document.getElementById('user-id').value = '';
  document.getElementById('user-modal-title').textContent = userId ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่';
  document.getElementById('user-active-group').style.display = userId ? 'block' : 'none';

  if (userId) {
    loadUserData(userId);
  } else {
    document.getElementById('user-password').required = true;
  }

  modal.classList.add('active');
}

// Load user data for editing
async function loadUserData(userId) {
  try {
    const response = await fetch(`${API_URL}/api/system-users/${userId}`);
    const data = await response.json();

    if (data.success) {
      const user = data.data;
      document.getElementById('user-id').value = user.id;
      document.getElementById('user-username').value = user.username;
      document.getElementById('user-username').disabled = true;
      document.getElementById('user-fullname').value = user.full_name;
      document.getElementById('user-email').value = user.email || '';
      document.getElementById('user-role').value = user.role;
      document.getElementById('user-active').checked = user.is_active === 1;
      document.getElementById('user-password').required = false;
      document.getElementById('user-password').placeholder = 'ใส่รหัสผ่านใหม่หากต้องการเปลี่ยน';
    }
  } catch (error) {
    console.error('Error loading user:', error);
    showError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
  }
}

// Submit user form
document.getElementById('user-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const userId = document.getElementById('user-id').value;
  const formData = new FormData(e.target);

  const userData = {
    username: formData.get('username'),
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    role: formData.get('role'),
    createdBy: currentUser.username,
    updatedBy: currentUser.username
  };

  const password = formData.get('password');
  if (password) {
    userData.password = password;
  }

  if (userId) {
    userData.is_active = document.getElementById('user-active').checked;
  }

  try {
    const url = userId
      ? `${API_URL}/api/system-users/${userId}`
      : `${API_URL}/api/system-users`;

    const method = userId ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (data.success) {
      showSuccess(userId ? '✅ User updated successfully' : '✅ User created successfully');
      document.getElementById('user-modal').classList.remove('active');
      document.getElementById('user-username').disabled = false;
      loadSystemUsers();
    } else {
      showError(data.message || 'Unable to save data');
    }
  } catch (error) {
    console.error('Error saving user:', error);
    showError('An error occurredในการบันทึกข้อมูล');
  }
});

// Edit user
window.editUser = function(userId) {
  openUserModal(userId);
};

// Delete user
window.deleteUser = async function(userId, username) {
  if (!confirm(`Do you want to delete user "${username}" Are you sure?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/system-users/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletedBy: currentUser.username })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ User deleted successfully');
      loadSystemUsers();
    } else {
      showError(data.message || 'Unable to delete user');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    showError('An error occurredในการลบผู้ใช้');
  }
};

// Close user modal
document.getElementById('user-modal-close')?.addEventListener('click', () => {
  document.getElementById('user-modal').classList.remove('active');
  document.getElementById('user-username').disabled = false;
});

document.getElementById('user-cancel-btn')?.addEventListener('click', () => {
  document.getElementById('user-modal').classList.remove('active');
  document.getElementById('user-username').disabled = false;
});

// Filter buttons
document.getElementById('filter-btn')?.addEventListener('click', loadRequests);
document.getElementById('audit-filter-btn')?.addEventListener('click', loadAuditLogs);

// ============================================
// PROGRAMS & ROLES MANAGEMENT
// ============================================

// Load programs management
async function loadProgramsManagement() {
  try {
    const response = await fetch(`${API_URL}/api/programs`);
    const data = await response.json();

    if (data.success) {
      const container = document.getElementById('programs-mgmt-list');
      if (data.data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">No programs found</p>';
        return;
      }

      container.innerHTML = data.data.map(program => `
        <div class="card" style="margin-bottom: 16px;">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem;">${program.name}</h3>
              ${program.description ? `<p style="margin: 4px 0 0; color: var(--gray-600); font-size: 0.9rem;">${program.description}</p>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" onclick="editProgram(${program.id}, '${program.name.replace(/'/g, "\\'")}', '${(program.description || '').replace(/'/g, "\\'")}')">
                ✏️ Edit
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteProgram(${program.id}, '${program.name.replace(/'/g, "\\'")}')">
                🗑️ Delete
              </button>
            </div>
          </div>
          <div class="card-body">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h4 style="margin: 0; font-size: 1rem;">Roles (${program.roles?.length || 0})</h4>
              <button class="btn btn-primary btn-sm" onclick="addRole(${program.id}, '${program.name.replace(/'/g, "\\'")}')">
                ➕ Add Role
              </button>
            </div>
            ${program.roles && program.roles.length > 0 ? `
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Role Name</th>
                    <th>Description</th>
                    <th style="width: 150px; text-align: center;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${program.roles.map(role => `
                    <tr>
                      <td><strong>${role.role_name}</strong></td>
                      <td>${role.description || '-'}</td>
                      <td style="text-align: center;">
                        <button class="btn btn-secondary btn-sm" onclick="editRole(${program.id}, ${role.id}, '${role.role_name.replace(/'/g, "\\'")}', '${(role.description || '').replace(/'/g, "\\'")}')">
                          ✏️
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteRole(${program.id}, ${role.id}, '${role.role_name.replace(/'/g, "\\'")}')">
                          🗑️
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p style="text-align: center; color: var(--gray-500); padding: 16px 0;">No roles defined yet</p>'}
          </div>
        </div>
      `).join('');
    } else {
      showError('Unable to load programs');
    }
  } catch (error) {
    console.error('Error loading programs:', error);
    showError('An error occurred while loading programs');
  }
}

// Add/Edit Program
document.getElementById('add-program-btn-mgmt')?.addEventListener('click', () => {
  document.getElementById('program-modal-title').textContent = 'Add New Program';
  document.getElementById('program-form').reset();
  document.getElementById('program-id').value = '';
  document.getElementById('program-modal').classList.add('active');
});

window.editProgram = function(id, name, description) {
  document.getElementById('program-modal-title').textContent = 'Edit Program';
  document.getElementById('program-id').value = id;
  document.getElementById('program-name').value = name;
  document.getElementById('program-description').value = description || '';
  document.getElementById('program-modal').classList.add('active');
};

// Submit program form
document.getElementById('program-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const programId = document.getElementById('program-id').value;
  const formData = {
    name: document.getElementById('program-name').value,
    description: document.getElementById('program-description').value,
    [programId ? 'updatedBy' : 'createdBy']: currentUser.username
  };

  try {
    const url = programId
      ? `${API_URL}/api/programs/${programId}`
      : `${API_URL}/api/programs`;

    const response = await fetch(url, {
      method: programId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (data.success) {
      showSuccess(programId ? '✅ Program updated successfully' : '✅ Program created successfully');
      document.getElementById('program-modal').classList.remove('active');
      loadProgramsManagement();
      loadProgramsList(); // Reload for create request form
    } else {
      showError(data.message || 'Unable to save program');
    }
  } catch (error) {
    console.error('Error saving program:', error);
    showError('An error occurred while saving program');
  }
});

// Delete program
window.deleteProgram = async function(programId, programName) {
  if (!confirm(`Delete program "${programName}"?\n\nThis will also delete all roles in this program. Are you sure?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/programs/${programId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletedBy: currentUser.username })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Program deleted successfully');
      loadProgramsManagement();
      loadProgramsList();
    } else {
      showError(data.message || 'Unable to delete program');
    }
  } catch (error) {
    console.error('Error deleting program:', error);
    showError('An error occurred while deleting program');
  }
};

// Add/Edit Role
window.addRole = function(programId, programName) {
  document.getElementById('role-modal-title').textContent = `Add Role to ${programName}`;
  document.getElementById('role-form').reset();
  document.getElementById('role-id').value = '';
  document.getElementById('role-program-id').value = programId;
  document.getElementById('role-modal').classList.add('active');
};

window.editRole = function(programId, roleId, roleName, description) {
  document.getElementById('role-modal-title').textContent = 'Edit Role';
  document.getElementById('role-id').value = roleId;
  document.getElementById('role-program-id').value = programId;
  document.getElementById('role-name').value = roleName;
  document.getElementById('role-description').value = description || '';
  document.getElementById('role-modal').classList.add('active');
};

// Submit role form
document.getElementById('role-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const roleId = document.getElementById('role-id').value;
  const programId = document.getElementById('role-program-id').value;
  const formData = {
    role_name: document.getElementById('role-name').value,
    description: document.getElementById('role-description').value,
    [roleId ? 'updatedBy' : 'createdBy']: currentUser.username
  };

  try {
    const url = roleId
      ? `${API_URL}/api/programs/${programId}/roles/${roleId}`
      : `${API_URL}/api/programs/${programId}/roles`;

    const response = await fetch(url, {
      method: roleId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (data.success) {
      showSuccess(roleId ? '✅ Role updated successfully' : '✅ Role created successfully');
      document.getElementById('role-modal').classList.remove('active');
      loadProgramsManagement();
      loadProgramsList();
    } else {
      showError(data.message || 'Unable to save role');
    }
  } catch (error) {
    console.error('Error saving role:', error);
    showError('An error occurred while saving role');
  }
});

// Delete role
window.deleteRole = async function(programId, roleId, roleName) {
  if (!confirm(`Delete role "${roleName}"? Are you sure?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/programs/${programId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletedBy: currentUser.username })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Role deleted successfully');
      loadProgramsManagement();
      loadProgramsList();
    } else {
      showError(data.message || 'Unable to delete role');
    }
  } catch (error) {
    console.error('Error deleting role:', error);
    showError('An error occurred while deleting role');
  }
};

// Close program modal
document.getElementById('program-modal-close')?.addEventListener('click', () => {
  document.getElementById('program-modal').classList.remove('active');
});

document.getElementById('program-cancel-btn')?.addEventListener('click', () => {
  document.getElementById('program-modal').classList.remove('active');
});

// Close role modal
document.getElementById('role-modal-close')?.addEventListener('click', () => {
  document.getElementById('role-modal').classList.remove('active');
});

document.getElementById('role-cancel-btn')?.addEventListener('click', () => {
  document.getElementById('role-modal').classList.remove('active');
});

// ============================================
// APPROVAL SETTINGS MANAGEMENT
// ============================================

// Load approval settings
async function loadApprovalSettings() {
  try {
    const response = await fetch(`${API_URL}/api/approval-settings`);
    const data = await response.json();

    if (data.success) {
      const container = document.getElementById('approvers-list');

      if (data.data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">No approvers configured yet</p>';
        return;
      }

      // Determine if last item is final notification
      const totalApprovers = data.data.length;

      container.innerHTML = data.data.map((approver, index) => {
        const isFinalNotification = (index === totalApprovers - 1);
        const levelName = isFinalNotification
          ? 'Final Notification Email'
          : `Approver ${approver.approver_level}`;
        const description = isFinalNotification
          ? 'Receives final notification when all approvals are complete'
          : 'Reviews and approves requests';

        return `
        <div class="card" style="margin-bottom: 16px;">
          <div class="card-body">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
              <div>
                <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: var(--primary);">
                  ${levelName}
                </h3>
                <p style="margin: 0; color: var(--gray-600); font-size: 0.9rem;">
                  ${description}
                </p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-sm" onclick="editApprover(${approver.approver_level}, '${approver.approver_name.replace(/'/g, "\\'")}', '${approver.approver_email}')">
                  ✏️ Edit
                </button>
                ${data.data.length > 1 ? `
                <button class="btn btn-danger btn-sm" onclick="deleteApprover(${approver.approver_level}, '${approver.approver_name.replace(/'/g, "\\'")}')">
                  🗑️ Delete
                </button>
                ` : ''}
              </div>
            </div>
            <div style="background: var(--gray-50); padding: 16px; border-radius: 8px;">
              <div style="margin-bottom: 8px;">
                <strong style="color: var(--gray-700);">Name:</strong>
                <span style="margin-left: 8px;">${approver.approver_name}</span>
              </div>
              <div>
                <strong style="color: var(--gray-700);">Email:</strong>
                <span style="margin-left: 8px;">${approver.approver_email}</span>
              </div>
            </div>
          </div>
        </div>
      `;
      }).join('');
    } else {
      showError('Unable to load approval settings');
    }
  } catch (error) {
    console.error('Error loading approval settings:', error);
    showError('An error occurred while loading approval settings');
  }
}

// Add new approver
document.getElementById('add-approver-btn')?.addEventListener('click', () => {
  const name = prompt('Enter approver name:');
  if (!name) return;

  const email = prompt('Enter approver email:');
  if (!email) return;

  addApprover(name, email);
});

// Add approver
async function addApprover(name, email) {
  try {
    const response = await fetch(`${API_URL}/api/approval-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approver_name: name,
        approver_email: email,
        createdBy: currentUser.username
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Approver added successfully');
      loadApprovalSettings();
    } else {
      showError(data.message || 'Unable to add approver');
    }
  } catch (error) {
    console.error('Error adding approver:', error);
    showError('An error occurred while adding approver');
  }
}

// Edit approver
window.editApprover = function(level, name, email) {
  const newName = prompt('Enter approver name:', name);
  if (!newName) return;

  const newEmail = prompt('Enter approver email:', email);
  if (!newEmail) return;

  updateApprover(level, newName, newEmail);
};

// Delete approver
window.deleteApprover = async function(level, name) {
  if (!confirm(`Delete approver "${name}"?\n\nThis cannot be undone. Are you sure?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/approval-settings/${level}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deletedBy: currentUser.username
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Approver deleted successfully');
      loadApprovalSettings();
    } else {
      showError(data.message || 'Unable to delete approver');
    }
  } catch (error) {
    console.error('Error deleting approver:', error);
    showError('An error occurred while deleting approver');
  }
};

// Update approver
async function updateApprover(level, name, email) {
  try {
    const response = await fetch(`${API_URL}/api/approval-settings/${level}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approver_name: name,
        approver_email: email,
        updatedBy: currentUser.username
      })
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('✅ Approval settings updated successfully');
      loadApprovalSettings();
    } else {
      showError(data.message || 'Unable to update approval settings');
    }
  } catch (error) {
    console.error('Error updating approval settings:', error);
    showError('An error occurred while updating approval settings');
  }
}

// Filter buttons
document.getElementById('filter-btn')?.addEventListener('click', loadRequests);
document.getElementById('audit-filter-btn')?.addEventListener('click', loadAuditLogs);

// Modal close
document.querySelector('.modal-close').addEventListener('click', () => {
  document.getElementById('detail-modal').classList.remove('active');
});

window.addEventListener('click', (e) => {
  const detailModal = document.getElementById('detail-modal');
  const userModal = document.getElementById('user-modal');

  if (e.target === detailModal) {
    detailModal.classList.remove('active');
  }
  if (e.target === userModal) {
    userModal.classList.remove('active');
    document.getElementById('user-username').disabled = false;
  }
});

// Alert functions
function showError(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-error';
  alert.textContent = message;
  alert.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px; box-shadow: var(--shadow-xl);';

  document.body.appendChild(alert);

  setTimeout(() => {
    alert.remove();
  }, 5000);
}

function showSuccess(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success';
  alert.textContent = message;
  alert.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px; box-shadow: var(--shadow-xl);';

  document.body.appendChild(alert);

  setTimeout(() => {
    alert.remove();
  }, 5000);
}
