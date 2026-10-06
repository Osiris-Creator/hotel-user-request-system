import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import type { Env, CreateRequestBody, AuditLog } from './types';
import { sendEmail, getApprovalRequestEmail, getApprovalCompletedEmail, getApprovalNotificationEmail } from './email';
import { generateRequestFormHtml, buildRequestFormAttachment } from './request-form';

const app = new Hono<{ Bindings: Env }>();

// Generate random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// CORS middleware
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'OK', message: 'Hotel User Request System is running' });
});

// Get all programs with roles
app.get('/api/programs', async (c) => {
  try {
    const programs = await c.env.DB.prepare('SELECT * FROM programs ORDER BY name').all();

    for (const program of programs.results) {
      const roles = await c.env.DB.prepare(
        'SELECT * FROM roles WHERE program_id = ? ORDER BY role_name'
      ).bind(program.id).all();

      program.roles = roles.results;
    }

    return c.json({ success: true, data: programs.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch programs', error: error.message }, 500);
  }
});

// Get all departments
app.get('/api/departments', async (c) => {
  try {
    const departments = await c.env.DB.prepare('SELECT * FROM departments ORDER BY name').all();
    return c.json({ success: true, data: departments.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch departments', error: error.message }, 500);
  }
});

// Get department heads
app.get('/api/department-heads', async (c) => {
  try {
    const heads = await c.env.DB.prepare(
      'SELECT dh.*, d.name as department_name FROM department_heads dh JOIN departments d ON dh.department_id = d.id ORDER BY d.name'
    ).all();
    return c.json({ success: true, data: heads.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch department heads', error: error.message }, 500);
  }
});

// Add new department
app.post('/api/departments', async (c) => {
  try {
    const { name, description, createdBy } = await c.req.json();

    if (!name || name.trim() === '') {
      return c.json({ success: false, message: 'Department name is required' }, 400);
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO departments (name, description, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))'
    ).bind(name.trim(), description?.trim() || null).run();

    const departmentId = result.meta.last_row_id;

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('CREATE_DEPARTMENT', createdBy, `Created new department: ${name}`, clientIP).run();

    return c.json({ success: true, message: 'Department created successfully', data: { id: departmentId, name, description } });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to create department', error: error.message }, 500);
  }
});

// Delete department
app.delete('/api/departments/:departmentId', async (c) => {
  try {
    const departmentId = c.req.param('departmentId');
    const { deletedBy } = await c.req.json();

    // Check if department has requests or approvals
    const hasRequests = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_requests WHERE department_id = ?'
    ).bind(departmentId).first();

    if ((hasRequests?.count as number) > 0) {
      return c.json({ success: false, message: 'Cannot delete department with existing requests' }, 400);
    }

    // Get department name for audit
    const dept = await c.env.DB.prepare('SELECT name FROM departments WHERE id = ?').bind(departmentId).first();

    // Delete department head if exists
    await c.env.DB.prepare('DELETE FROM department_heads WHERE department_id = ?').bind(departmentId).run();

    // Delete department
    await c.env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(departmentId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('DELETE_DEPARTMENT', deletedBy, `Deleted department: ${dept?.name}`, clientIP).run();

    return c.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to delete department', error: error.message }, 500);
  }
});

// Update department head
app.patch('/api/department-heads/:departmentId', async (c) => {
  try {
    const departmentId = c.req.param('departmentId');
    const { head_name, head_email, updatedBy } = await c.req.json();

    // Check if department head exists
    const existing = await c.env.DB.prepare(
      'SELECT * FROM department_heads WHERE department_id = ?'
    ).bind(departmentId).first();

    if (existing) {
      await c.env.DB.prepare(
        'UPDATE department_heads SET head_name = ?, head_email = ? WHERE department_id = ?'
      ).bind(head_name, head_email, departmentId).run();
    } else {
      await c.env.DB.prepare(
        'INSERT INTO department_heads (department_id, head_name, head_email) VALUES (?, ?, ?)'
      ).bind(departmentId, head_name, head_email).run();
    }

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('UPDATE_DEPARTMENT_HEAD', updatedBy, `Updated department head for department ${departmentId}: ${head_name}`, clientIP).run();

    return c.json({ success: true, message: 'Department head updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update department head', error: error.message }, 500);
  }
});

// Get roles for specific program
app.get('/api/programs/:id/roles', async (c) => {
  try {
    const programId = c.req.param('id');
    const roles = await c.env.DB.prepare(
      'SELECT * FROM roles WHERE program_id = ? ORDER BY role_name'
    ).bind(programId).all();

    return c.json({ success: true, data: roles.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch roles', error: error.message }, 500);
  }
});

// Create new user request
app.post('/api/requests', async (c) => {
  try {
    const body: CreateRequestBody = await c.req.json();
    const { user, requester, programAccess, notes, department_id } = body;

    // Generate request number
    const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
    const countResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM user_requests WHERE request_number LIKE ?'
    ).bind(`REQ${dateStr}%`).first();

    const sequence = String((countResult?.count as number || 0) + 1).padStart(4, '0');
    const requestNumber = `REQ${dateStr}${sequence}`;

    // Insert or update user
    let userId: number;
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE employee_id = ?'
    ).bind(user.employee_id).first();

    if (existingUser) {
      userId = existingUser.id as number;
      await c.env.DB.prepare(
        'UPDATE users SET first_name = ?, last_name = ?, email = ?, department = ?, position = ?, updated_at = datetime("now") WHERE id = ?'
      ).bind(user.first_name, user.last_name, user.email || null, user.department, user.position, userId).run();
    } else {
      const userResult = await c.env.DB.prepare(
        'INSERT INTO users (employee_id, first_name, last_name, email, department, position) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(user.employee_id, user.first_name, user.last_name, user.email || null, user.department, user.position).run();
      userId = userResult.meta.last_row_id;
    }

    // Insert user request with department
    const requestResult = await c.env.DB.prepare(
      'INSERT INTO user_requests (request_number, user_id, requester_name, requester_email, department_id, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(requestNumber, userId, requester.name, requester.email, department_id || null, notes || null).run();

    const requestId = requestResult.meta.last_row_id;

    // Insert program access
    for (const access of programAccess) {
      await c.env.DB.prepare(
        'INSERT INTO request_access (request_id, program_id, role_id) VALUES (?, ?, ?)'
      ).bind(requestId, access.program_id, access.role_id).run();
    }

    // Get program names for email
    const programs = await c.env.DB.prepare(
      'SELECT p.name FROM request_access rp JOIN programs p ON rp.program_id = p.id WHERE rp.request_id = ? GROUP BY p.id'
    ).bind(requestId).all();

    const programNames = programs.results.map((p: any) => p.name);
    const employeeName = `${user.first_name} ${user.last_name}`;

    // Determine the first approver in the chain (Approver 1)
    // Priority: department head (if department has a configured head), otherwise first general approver
    let firstApprover: { name: string; email: string } | null = null;

    if (department_id) {
      const departmentHead = await c.env.DB.prepare(
        'SELECT * FROM department_heads WHERE department_id = ?'
      ).bind(department_id).first();

      if (departmentHead) {
        firstApprover = { name: departmentHead.head_name as string, email: departmentHead.head_email as string };
      }
    }

    // Fallback to first general approver if no department head
    if (!firstApprover) {
      const generalApprover = await c.env.DB.prepare(
        'SELECT * FROM approval_settings ORDER BY approver_level LIMIT 1'
      ).first();
      if (generalApprover) {
        firstApprover = { name: generalApprover.approver_name as string, email: generalApprover.approver_email as string };
      }
    }

    // Create the first approval step (level 1) and notify
    if (firstApprover) {
      const token = generateToken();

      await c.env.DB.prepare(
        'INSERT INTO approval_history (request_id, approver_level, approver_name, approver_email, token, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(requestId, 1, firstApprover.name, firstApprover.email, token, 'pending').run();

      const formAttachment = await buildRequestFormAttachment(c.env.DB, requestId, requestNumber);

      await sendEmail({
        to: firstApprover.email,
        subject: `🔔 New Request ${requestNumber} - Approval Required`,
        html: getApprovalRequestEmail(requestNumber, employeeName, programNames.join(', '), firstApprover.name, 1, token, c.env.APP_URL, requestId),
        attachments: formAttachment ? [formAttachment] : undefined
      }, {
        APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
      });
    }

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (request_id, action, changed_by, new_value, change_description, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(requestId, 'CREATE', requester.name, JSON.stringify(body), 'New user access request created', clientIP).run();

    return c.json({
      success: true,
      message: 'User request created successfully',
      data: { requestId, requestNumber }
    }, 201);
  } catch (error) {
    console.error('Error creating request:', error);
    return c.json({ success: false, message: 'Failed to create user request', error: error.message }, 500);
  }
});

// Get all requests with filters
app.get('/api/requests', async (c) => {
  try {
    const status = c.req.query('status');
    const fromDate = c.req.query('fromDate');
    const toDate = c.req.query('toDate');
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '50');

    let query = `
      SELECT
        ur.*,
        u.employee_id, u.first_name, u.last_name, u.email as user_email,
        u.department, u.position
      FROM user_requests ur
      INNER JOIN users u ON ur.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += ' AND ur.status = ?';
      params.push(status);
    }

    if (fromDate) {
      query += ' AND ur.request_date >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      query += ' AND ur.request_date <= ?';
      params.push(toDate);
    }

    if (search) {
      query += ' AND (ur.request_number LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.employee_id LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY ur.request_date DESC LIMIT ?';
    params.push(limit);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ success: true, data: result.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch requests', error: error.message }, 500);
  }
});

// Get single request by ID
app.get('/api/requests/:id', async (c) => {
  try {
    const requestId = c.req.param('id');

    const request = await c.env.DB.prepare(`
      SELECT
        ur.*,
        u.employee_id, u.first_name, u.last_name, u.email as user_email,
        u.department, u.position
      FROM user_requests ur
      INNER JOIN users u ON ur.user_id = u.id
      WHERE ur.id = ?
    `).bind(requestId).first();

    if (!request) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    // Get program access
    const access = await c.env.DB.prepare(`
      SELECT
        ra.id, ra.program_id, ra.role_id,
        p.name as program_name,
        r.role_name
      FROM request_access ra
      INNER JOIN programs p ON ra.program_id = p.id
      INNER JOIN roles r ON ra.role_id = r.id
      WHERE ra.request_id = ?
    `).bind(requestId).all();

    request.programAccess = access.results;

    return c.json({ success: true, data: request });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch request', error: error.message }, 500);
  }
});

// Update request status
app.patch('/api/requests/:id/status', async (c) => {
  try {
    const requestId = c.req.param('id');
    const { status, changedBy, approvedBy } = await c.req.json();

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return c.json({ success: false, message: 'Invalid status value' }, 400);
    }

    // Get old status
    const oldData = await c.env.DB.prepare(
      'SELECT status FROM user_requests WHERE id = ?'
    ).bind(requestId).first();

    if (!oldData) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    // Update status
    let updateQuery = 'UPDATE user_requests SET status = ?, updated_at = datetime("now")';
    const params: any[] = [status];

    if (status === 'approved') {
      updateQuery += ', approved_by = ?, approved_date = datetime("now")';
      params.push(approvedBy || changedBy);
    } else if (status === 'completed') {
      updateQuery += ', completed_date = datetime("now")';
    }

    updateQuery += ' WHERE id = ?';
    params.push(requestId);

    await c.env.DB.prepare(updateQuery).bind(...params).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (request_id, action, changed_by, old_value, new_value, change_description, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      requestId,
      'UPDATE_STATUS',
      changedBy,
      oldData.status,
      status,
      `Status changed from ${oldData.status} to ${status}`,
      clientIP
    ).run();

    return c.json({ success: true, message: 'Request status updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update status', error: error.message }, 500);
  }
});

// Get audit log for specific request
app.get('/api/requests/:id/audit', async (c) => {
  try {
    const requestId = c.req.param('id');
    const logs = await c.env.DB.prepare(
      'SELECT * FROM audit_log WHERE request_id = ? ORDER BY created_at DESC'
    ).bind(requestId).all();

    return c.json({ success: true, data: logs.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch audit log', error: error.message }, 500);
  }
});

// Get all audit logs with filters
app.get('/api/audit', async (c) => {
  try {
    const fromDate = c.req.query('fromDate');
    const toDate = c.req.query('toDate');
    const action = c.req.query('action');
    const requestId = c.req.query('requestId');
    const limit = parseInt(c.req.query('limit') || '100');

    let query = 'SELECT al.*, ur.request_number FROM audit_log al LEFT JOIN user_requests ur ON al.request_id = ur.id WHERE 1=1';
    const params: any[] = [];

    if (fromDate) {
      query += ' AND al.created_at >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      query += ' AND al.created_at <= ?';
      params.push(toDate);
    }

    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    if (requestId) {
      query += ' AND al.request_id = ?';
      params.push(requestId);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ?';
    params.push(limit);

    const logs = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ success: true, data: logs.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch audit logs', error: error.message }, 500);
  }
});

// ============================================
// PROGRAM & ROLE MANAGEMENT (ADMIN ONLY)
// ============================================

// Create new program
app.post('/api/programs', async (c) => {
  try {
    const { name, description, createdBy } = await c.req.json();

    const result = await c.env.DB.prepare(
      'INSERT INTO programs (name, description) VALUES (?, ?)'
    ).bind(name, description || '').run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('CREATE_PROGRAM', createdBy, `Created program: ${name}`, clientIP).run();

    return c.json({ success: true, message: 'Program created successfully', id: result.meta.last_row_id });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to create program', error: error.message }, 500);
  }
});

// Update program
app.patch('/api/programs/:id', async (c) => {
  try {
    const programId = c.req.param('id');
    const { name, description, updatedBy } = await c.req.json();

    await c.env.DB.prepare(
      'UPDATE programs SET name = ?, description = ? WHERE id = ?'
    ).bind(name, description || '', programId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('UPDATE_PROGRAM', updatedBy, `Updated program ID ${programId}: ${name}`, clientIP).run();

    return c.json({ success: true, message: 'Program updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update program', error: error.message }, 500);
  }
});

// Delete program
app.delete('/api/programs/:id', async (c) => {
  try {
    const programId = c.req.param('id');
    const { deletedBy } = await c.req.json();

    // Check if program is used in any requests
    const usedInRequests = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM request_access WHERE program_id = ?'
    ).bind(programId).first();

    if (usedInRequests.count > 0) {
      return c.json({
        success: false,
        message: 'Cannot delete program that is used in existing requests'
      }, 400);
    }

    // Get program name for audit log
    const program = await c.env.DB.prepare(
      'SELECT name FROM programs WHERE id = ?'
    ).bind(programId).first();

    // Delete roles first
    await c.env.DB.prepare(
      'DELETE FROM roles WHERE program_id = ?'
    ).bind(programId).run();

    // Delete program
    await c.env.DB.prepare(
      'DELETE FROM programs WHERE id = ?'
    ).bind(programId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('DELETE_PROGRAM', deletedBy, `Deleted program: ${program?.name || programId}`, clientIP).run();

    return c.json({ success: true, message: 'Program deleted successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to delete program', error: error.message }, 500);
  }
});

// Create new role for a program
app.post('/api/programs/:id/roles', async (c) => {
  try {
    const programId = c.req.param('id');
    const { role_name, description, createdBy } = await c.req.json();

    const result = await c.env.DB.prepare(
      'INSERT INTO roles (program_id, role_name, description) VALUES (?, ?, ?)'
    ).bind(programId, role_name, description || '').run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('CREATE_ROLE', createdBy, `Created role: ${role_name} for program ID ${programId}`, clientIP).run();

    return c.json({ success: true, message: 'Role created successfully', id: result.meta.last_row_id });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to create role', error: error.message }, 500);
  }
});

// Update role
app.patch('/api/programs/:programId/roles/:roleId', async (c) => {
  try {
    const programId = c.req.param('programId');
    const roleId = c.req.param('roleId');
    const { role_name, description, updatedBy } = await c.req.json();

    await c.env.DB.prepare(
      'UPDATE roles SET role_name = ?, description = ? WHERE id = ? AND program_id = ?'
    ).bind(role_name, description || '', roleId, programId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('UPDATE_ROLE', updatedBy, `Updated role ID ${roleId}: ${role_name}`, clientIP).run();

    return c.json({ success: true, message: 'Role updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update role', error: error.message }, 500);
  }
});

// Delete role
app.delete('/api/programs/:programId/roles/:roleId', async (c) => {
  try {
    const programId = c.req.param('programId');
    const roleId = c.req.param('roleId');
    const { deletedBy } = await c.req.json();

    // Check if role is used in any requests
    const usedInRequests = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM request_access WHERE role_id = ?'
    ).bind(roleId).first();

    if (usedInRequests.count > 0) {
      return c.json({
        success: false,
        message: 'Cannot delete role that is used in existing requests'
      }, 400);
    }

    // Get role name for audit log
    const role = await c.env.DB.prepare(
      'SELECT role_name FROM roles WHERE id = ?'
    ).bind(roleId).first();

    // Delete role
    await c.env.DB.prepare(
      'DELETE FROM roles WHERE id = ? AND program_id = ?'
    ).bind(roleId, programId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('DELETE_ROLE', deletedBy, `Deleted role: ${role?.role_name || roleId}`, clientIP).run();

    return c.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to delete role', error: error.message }, 500);
  }
});

// ============================================
// TOKEN-BASED APPROVAL (Email Link Approval)
// ============================================

// Token-based approval endpoint (GET: redirect to form, POST: process approval)
app.get('/api/approve', async (c) => {
  const token = c.req.query('token');
  const action = c.req.query('action');

  if (!token || !action) {
    return c.html(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:50px">
          <h1>❌ Invalid Request</h1>
          <p>Missing token or action parameter.</p>
        </body>
      </html>
    `, 400);
  }

  // Find approval by token
  const approval = await c.env.DB.prepare(
    'SELECT ah.*, ur.request_number, ur.requester_name, u.first_name, u.last_name FROM approval_history ah JOIN user_requests ur ON ah.request_id = ur.id JOIN users u ON ur.user_id = u.id WHERE ah.token = ?'
  ).bind(token).first();

  if (!approval) {
    return c.html(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:50px">
          <h1>❌ Invalid or Expired Token</h1>
          <p>This approval link is no longer valid.</p>
        </body>
      </html>
    `, 404);
  }

  if (approval.status !== 'pending') {
    const statusText = approval.status === 'approved' ? '✅ Approved' : '❌ Rejected';
    return c.html(`
      <html>
        <body style="font-family:sans-serif;text-align:center;padding:50px">
          <h1>${statusText}</h1>
          <p>This request has already been ${approval.status}.</p>
          <p><small>Processed at: ${approval.approved_at || 'Unknown'}</small></p>
        </body>
      </html>
    `, 400);
  }

  const actionText = action === 'approve' ? '✅ Approve' : '❌ Reject';
  const actionColor = action === 'approve' ? '#16a34a' : '#dc2626';
  const employeeName = `${approval.first_name} ${approval.last_name}`;

  // Show confirmation form
  return c.html(`
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${actionText} Request</title>
        <style>
          body { font-family: sans-serif; background: #f3f4f6; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: ${actionColor}; color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .info-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${actionColor}; }
          .info-box p { margin: 8px 0; color: #333; }
          .info-box strong { color: #1e3a5f; }
          textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-family: sans-serif; font-size: 14px; resize: vertical; min-height: 100px; }
          .btn { display: inline-block; background: ${actionColor}; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; border: none; cursor: pointer; }
          .btn:hover { opacity: 0.9; }
          .btn:disabled { background: #9ca3af; cursor: not-allowed; }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
          #loading { display: none; text-align: center; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;font-size:28px">${actionText} Request</h1>
          </div>
          <div class="content">
            <div class="info-box">
              <p><strong>Request Number:</strong> ${approval.request_number}</p>
              <p><strong>Employee Name:</strong> ${employeeName}</p>
              <p><strong>Requester:</strong> ${approval.requester_name}</p>
              <p><strong>Your Role:</strong> Approver Level ${approval.approver_level}</p>
            </div>

            <form id="approvalForm" onsubmit="handleSubmit(event)">
              <div class="form-group">
                <label for="comment">Comment (Optional):</label>
                <textarea id="comment" name="comment" placeholder="Add any comments or reasons for your decision..."></textarea>
              </div>

              <div style="text-align:center">
                <button type="submit" class="btn" id="submitBtn">${actionText}</button>
              </div>

              <div id="loading">
                <p>Processing...</p>
              </div>
            </form>
          </div>
        </div>

        <script>
          async function handleSubmit(e) {
            e.preventDefault();

            const btn = document.getElementById('submitBtn');
            const loading = document.getElementById('loading');
            const comment = document.getElementById('comment').value;

            btn.disabled = true;
            loading.style.display = 'block';

            try {
              const response = await fetch('/api/approve?token=${token}&action=${action}', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment })
              });

              const result = await response.json();

              if (result.success) {
                document.querySelector('.content').innerHTML = \`
                  <div style="text-align:center;padding:40px 20px">
                    <div style="font-size:64px;margin-bottom:20px">${action === 'approve' ? '✅' : '❌'}</div>
                    <h2 style="color:${actionColor};margin:0 0 16px">Request ${action === 'approve' ? 'Approved' : 'Rejected'} Successfully</h2>
                    <p style="color:#666">Thank you for your response.</p>
                  </div>
                \`;
              } else {
                alert('Error: ' + result.message);
                btn.disabled = false;
                loading.style.display = 'none';
              }
            } catch (error) {
              alert('An error occurred. Please try again.');
              btn.disabled = false;
              loading.style.display = 'none';
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Get approval details by token (GET)
app.get('/api/approve/details', async (c) => {
  try {
    const token = c.req.query('token');

    if (!token) {
      return c.json({ success: false, message: 'Missing token' }, 400);
    }

    // Find approval by token
    const approval = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE token = ?'
    ).bind(token).first();

    if (!approval) {
      return c.json({ success: false, message: 'Invalid or expired token' }, 404);
    }

    if (approval.status !== 'pending') {
      return c.json({ success: false, message: `This approval has already been ${approval.status}` }, 400);
    }

    const requestId = approval.request_id;

    // Get request details
    const request = await c.env.DB.prepare(
      'SELECT ur.*, u.first_name, u.last_name, u.employee_id, d.name as department_name FROM user_requests ur JOIN users u ON ur.user_id = u.id LEFT JOIN departments d ON u.department_id = d.id WHERE ur.id = ?'
    ).bind(requestId).first();

    if (!request) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    // Get program names
    const programs = await c.env.DB.prepare(
      'SELECT p.name FROM request_access rp JOIN programs p ON rp.program_id = p.id WHERE rp.request_id = ? GROUP BY p.id'
    ).bind(requestId).all();

    const programNames = programs.results.map((p: any) => p.name).join(', ');

    return c.json({
      success: true,
      approval: {
        approver_level: approval.approver_level,
        approver_name: approval.approver_name,
        approver_email: approval.approver_email,
        status: approval.status
      },
      request: {
        request_number: request.request_number,
        employee_name: `${request.first_name} ${request.last_name}`,
        employee_id: request.employee_id,
        department: request.department_name,
        programs: programNames,
        status: request.status,
        created_at: request.created_at
      }
    });
  } catch (error) {
    console.error('Get approval details error:', error);
    return c.json({ success: false, message: 'Failed to get approval details', error: error.message }, 500);
  }
});

// Process token-based approval (POST)
app.post('/api/approve', async (c) => {
  try {
    const token = c.req.query('token');
    const action = c.req.query('action');
    const { comment } = await c.req.json();

    if (!token || !action) {
      return c.json({ success: false, message: 'Missing token or action' }, 400);
    }

    // Find approval by token
    const approval = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE token = ?'
    ).bind(token).first();

    if (!approval) {
      return c.json({ success: false, message: 'Invalid or expired token' }, 404);
    }

    if (approval.status !== 'pending') {
      return c.json({ success: false, message: `Already ${approval.status}` }, 400);
    }

    const requestId = approval.request_id as number;
    const currentLevel = approval.approver_level as number;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update approval step
    await c.env.DB.prepare(
      'UPDATE approval_history SET status = ?, comments = ?, approved_at = ? WHERE id = ?'
    ).bind(newStatus, comment || '', new Date().toISOString(), approval.id).run();

    // Get request details
    const request = await c.env.DB.prepare(
      'SELECT ur.*, u.first_name, u.last_name FROM user_requests ur JOIN users u ON ur.user_id = u.id WHERE ur.id = ?'
    ).bind(requestId).first();

    if (!request) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    const employeeName = `${request.first_name} ${request.last_name}`;

    // Get program names
    const programs = await c.env.DB.prepare(
      'SELECT p.name FROM request_access rp JOIN programs p ON rp.program_id = p.id WHERE rp.request_id = ? GROUP BY p.id'
    ).bind(requestId).all();
    const programNames = programs.results.map((p: any) => p.name).join(', ');

    // Send notification to requester
    if (request.requester_email) {
      await sendEmail({
        to: request.requester_email as string,
        subject: `${action === 'approve' ? '✅' : '❌'} Request ${request.request_number} - Update`,
        html: getApprovalNotificationEmail(
          request.request_number as string,
          employeeName,
          `${approval.approver_name} (Approver Level ${currentLevel})`,
          action === 'approve',
          comment
        )
      }, {
        APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
      });
    }

    if (action === 'reject') {
      // Reject request immediately
      await c.env.DB.prepare(
        'UPDATE user_requests SET status = ? WHERE id = ?'
      ).bind('rejected', requestId).run();

      // Send final rejection email to the requester
      if (request.requester_email) {
        await sendEmail({
          to: request.requester_email as string,
          subject: `❌ Request ${request.request_number} - Rejected`,
          html: getApprovalCompletedEmail(request.request_number as string, employeeName, programNames, false, c.env.APP_URL, requestId)
        }, {
          APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
        });
      }

      // Log to audit
      const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
      await c.env.DB.prepare(
        'INSERT INTO audit_log (action, request_id, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
      ).bind('REJECT_REQUEST', requestId, approval.approver_name, `Rejected by ${approval.approver_name} via email (Level ${currentLevel})`, clientIP).run();

      return c.json({ success: true, message: 'Request rejected' });
    }

    // If approved, check if all approvals are complete
    const allApprovals = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? ORDER BY approver_level'
    ).bind(requestId).all();

    const allApproved = allApprovals.results.every((a: any) => a.status === 'approved');

    if (allApproved) {
      // All approvers approved
      await c.env.DB.prepare(
        'UPDATE user_requests SET status = ?, approved_by = ?, approved_date = ? WHERE id = ?'
      ).bind('approved', approval.approver_name, new Date().toISOString(), requestId).run();

      // Send final approval email to the requester first, then the final-notification recipient
      const settingsResult = await c.env.DB.prepare(
        'SELECT * FROM approval_settings ORDER BY approver_level'
      ).all();
      const finalNotification = settingsResult.results.length > 0 ? settingsResult.results[settingsResult.results.length - 1] : null;

      const completionAttachment = await buildRequestFormAttachment(
        c.env.DB, requestId, request.request_number as string
      );

      const completionRecipients = [
        request.requester_email as string | null,
        finalNotification ? (finalNotification as any).approver_email as string : null,
      ].filter((e, idx, arr) => e && arr.indexOf(e) === idx) as string[];

      for (const email of completionRecipients) {
        await sendEmail({
          to: email,
          subject: `✅ Request ${request.request_number} - Fully Approved`,
          html: getApprovalCompletedEmail(request.request_number as string, employeeName, programNames, true, c.env.APP_URL, requestId),
          attachments: completionAttachment ? [completionAttachment] : undefined
        }, {
          APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
        });
      }
    } else {
      // Find next pending approval
      const nextStep = allApprovals.results.find((a: any) => a.status === 'pending' && a.approver_level > currentLevel);

      if (nextStep) {
        // Send email to next approver
        const nextAttachment = await buildRequestFormAttachment(
          c.env.DB, requestId, request.request_number as string
        );

        await sendEmail({
          to: (nextStep as any).approver_email,
          subject: `🔔 New Request ${request.request_number} - Approval Required`,
          html: getApprovalRequestEmail(
            request.request_number as string,
            employeeName,
            programNames,
            (nextStep as any).approver_name,
            (nextStep as any).approver_level,
            (nextStep as any).token,
            c.env.APP_URL,
            requestId
          ),
          attachments: nextAttachment ? [nextAttachment] : undefined
        }, {
          APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
        });
      }
    }

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, request_id, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind('APPROVE_REQUEST', requestId, approval.approver_name, `Approved by ${approval.approver_name} via email (Level ${currentLevel})`, clientIP).run();

    return c.json({ success: true, message: 'Request approved successfully' });
  } catch (error) {
    console.error('Approval error:', error);
    return c.json({ success: false, message: 'Failed to process approval', error: error.message }, 500);
  }
});

// ============================================
// APPROVAL WORKFLOW MANAGEMENT
// ============================================

// Get approval settings
app.get('/api/approval-settings', async (c) => {
  try {
    const settings = await c.env.DB.prepare(
      'SELECT * FROM approval_settings WHERE is_active = 1 ORDER BY approver_level'
    ).all();

    return c.json({ success: true, data: settings.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch approval settings', error: error.message }, 500);
  }
});

// Create new approver
app.post('/api/approval-settings', async (c) => {
  try {
    const { approver_level, approver_name, approver_email, createdBy } = await c.req.json();

    if (!approver_level || !approver_name || !approver_email) {
      return c.json({ success: false, message: 'Missing required fields' }, 400);
    }

    // Check if level already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM approval_settings WHERE approver_level = ?'
    ).bind(approver_level).first();

    if (existing) {
      return c.json({ success: false, message: `Approver level ${approver_level} already exists` }, 400);
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO approval_settings (approver_level, approver_name, approver_email, is_active) VALUES (?, ?, ?, 1)'
    ).bind(approver_level, approver_name, approver_email).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('CREATE_APPROVER', createdBy || 'System', `Added approver level ${approver_level}: ${approver_name}`, clientIP).run();

    return c.json({ success: true, message: 'Approver added successfully', id: result.meta.last_row_id, level: approver_level });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to add approver', error: error.message }, 500);
  }
});

// Update approval settings
app.patch('/api/approval-settings/:level', async (c) => {
  try {
    const level = c.req.param('level');
    const { approver_name, approver_email, updatedBy } = await c.req.json();

    await c.env.DB.prepare(
      'UPDATE approval_settings SET approver_name = ?, approver_email = ? WHERE approver_level = ?'
    ).bind(approver_name, approver_email, level).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('UPDATE_APPROVER', updatedBy || 'System', `Updated approver level ${level}: ${approver_name}`, clientIP).run();

    return c.json({ success: true, message: 'Approval settings updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update approval settings', error: error.message }, 500);
  }
});

// Delete approver
app.delete('/api/approval-settings/:level', async (c) => {
  try {
    const level = c.req.param('level');
    const { deletedBy } = await c.req.json();

    // Get approver name for audit
    const approver = await c.env.DB.prepare(
      'SELECT approver_name FROM approval_settings WHERE approver_level = ?'
    ).bind(level).first();

    // Delete approver
    await c.env.DB.prepare(
      'DELETE FROM approval_settings WHERE approver_level = ?'
    ).bind(level).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('DELETE_APPROVER', deletedBy || 'System', `Deleted approver level ${level}: ${approver?.approver_name || 'Unknown'}`, clientIP).run();

    return c.json({ success: true, message: 'Approver deleted successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to delete approver', error: error.message }, 500);
  }
});

// Get approval history for a request
app.get('/api/requests/:id/approvals', async (c) => {
  try {
    const requestId = c.req.param('id');
    const history = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? ORDER BY approver_level'
    ).bind(requestId).all();

    return c.json({ success: true, data: history.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch approval history', error: error.message }, 500);
  }
});

// Approve request (by approver level)
app.post('/api/requests/:id/approve', async (c) => {
  try {
    const requestId = c.req.param('id');
    const { approver_level, comments, approvedBy } = await c.req.json();
    const currentLevel = parseInt(approver_level);

    // Get request details
    const request = await c.env.DB.prepare(
      'SELECT ur.*, u.first_name, u.last_name, u.employee_id FROM user_requests ur JOIN users u ON ur.user_id = u.id WHERE ur.id = ?'
    ).bind(requestId).first();

    if (!request) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    // Find the pending approval step at this level
    const currentStep = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? AND approver_level = ? AND status = ?'
    ).bind(requestId, currentLevel, 'pending').first();

    if (!currentStep) {
      return c.json({ success: false, message: 'No pending approval at this level' }, 400);
    }

    // Mark current step as approved
    await c.env.DB.prepare(
      'UPDATE approval_history SET status = ?, comments = ?, approved_at = ? WHERE id = ?'
    ).bind('approved', comments || '', new Date().toISOString(), currentStep.id).run();

    // Get program names for email
    const programs = await c.env.DB.prepare(
      'SELECT p.name FROM request_access rp JOIN programs p ON rp.program_id = p.id WHERE rp.request_id = ? GROUP BY p.id'
    ).bind(requestId).all();

    const programNames = programs.results.map((p: any) => p.name);
    const employeeName = `${request.first_name} ${request.last_name}`;

    // Build the approval chain
    // approval_settings = general approvers + final notification (last entry)
    const settingsResult = await c.env.DB.prepare(
      'SELECT * FROM approval_settings ORDER BY approver_level'
    ).all();
    const settings = settingsResult.results;
    const generalApprovers = settings.slice(0, Math.max(0, settings.length - 1));
    const finalNotification = settings.length > 0 ? settings[settings.length - 1] : null;

    // Get the level-1 approver to determine if it was a department head
    const level1 = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? AND approver_level = 1'
    ).bind(requestId).first();

    const level1IsDeptHead = level1 && !generalApprovers.some(
      (a: any) => a.approver_email === level1.approver_email
    );

    // Full chain of approvers who must approve (chain[i] = level i+1)
    const chain = level1IsDeptHead
      ? [{ approver_name: level1.approver_name, approver_email: level1.approver_email }, ...generalApprovers]
      : [...generalApprovers];

    const currentIndex = currentLevel - 1;
    let newStatus = request.status;

    if (currentIndex + 1 < chain.length) {
      // Route to next approver
      const nextLevel = currentLevel + 1;
      const nextApprover = chain[currentIndex + 1];
      const nextToken = generateToken();

      await c.env.DB.prepare(
        'INSERT INTO approval_history (request_id, approver_level, approver_name, approver_email, token, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(requestId, nextLevel, nextApprover.approver_name, nextApprover.approver_email, nextToken, 'pending').run();

      const nextAttachment = await buildRequestFormAttachment(
        c.env.DB, requestId, request.request_number as string
      );

      await sendEmail({
        to: nextApprover.approver_email as string,
        subject: `🔔 New Request ${request.request_number} - Approval Required`,
        html: getApprovalRequestEmail(request.request_number as string, employeeName, programNames.join(', '), nextApprover.approver_name as string, nextLevel, nextToken, c.env.APP_URL, requestId),
        attachments: nextAttachment ? [nextAttachment] : undefined
      }, {
        APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
      });

      // Notify the requester that this level approved
      if (request.requester_email) {
        await sendEmail({
          to: request.requester_email as string,
          subject: `✅ Request ${request.request_number} - Update`,
          html: getApprovalNotificationEmail(
            request.request_number as string,
            employeeName,
            `${currentStep.approver_name} (Approver Level ${currentLevel})`,
            true,
            comments
          )
        }, {
          APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
        });
      }
    } else {
      // All approvers have approved
      newStatus = 'approved';
      await c.env.DB.prepare(
        'UPDATE user_requests SET status = ?, approved_by = ?, approved_date = ? WHERE id = ?'
      ).bind(newStatus, approvedBy || 'System', new Date().toISOString(), requestId).run();

      // Get all approvers in the chain to notify
      const allApprovals = await c.env.DB.prepare(
        'SELECT DISTINCT approver_email FROM approval_history WHERE request_id = ? ORDER BY approver_level'
      ).bind(requestId).all();

      const approverEmails = allApprovals.results.map((a: any) => a.approver_email);
      const requesterEmail = await c.env.DB.prepare(
        'SELECT u.email FROM users u WHERE u.id = ?'
      ).bind(request.user_id).first();

      // Create list of all people to notify (requester first)
      const notifyEmails = [
        request.requester_email,
        requesterEmail?.email,
        ...approverEmails,
        finalNotification?.approver_email
      ].filter((e, idx, arr) => e && arr.indexOf(e) === idx); // Remove duplicates

      const auditLink = `${c.env.APP_URL}/api/requests/${requestId}/print-form`;

      const completionAttachment = await buildRequestFormAttachment(
        c.env.DB, requestId, request.request_number as string
      );

      // Send approval completed email to all involved parties
      for (const email of notifyEmails) {
        if (email) {
          await sendEmail({
            to: email,
            subject: `✅ Request ${request.request_number} - Fully Approved and Completed`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #4caf50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; font-size: 24px;">✅ REQUEST APPROVED</h1>
                </div>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 8px 8px;">
                  <p>Good news! The access request has been successfully approved and processed.</p>

                  <div style="background: white; padding: 15px; border-left: 4px solid #4caf50; margin: 20px 0; border-radius: 4px;">
                    <p><strong>Request Number:</strong> ${request.request_number}</p>
                    <p><strong>Employee:</strong> ${employeeName}</p>
                    <p><strong>Programs Requested:</strong> ${programNames.join(', ')}</p>
                    <p><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
                  </div>

                  <div style="background: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Approval Chain Summary:</h3>
                    <ol style="margin-bottom: 0;">
                      ${allApprovals.results.map((a: any, idx: number) => `
                        <li style="margin-bottom: 8px;">
                          <strong>Level ${idx + 1}:</strong> Approved
                        </li>
                      `).join('')}
                    </ol>
                  </div>

                  <p style="margin-top: 20px; color: #666; font-size: 14px;">
                    <strong>📋 View Full Audit Trail:</strong><br>
                    You can view the complete approval history and print the request form by clicking the button below:
                  </p>

                  <div style="text-align: center; margin: 20px 0;">
                    <a href="${auditLink}" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
                      📋 View Approval History & Print Form
                    </a>
                  </div>

                  <p style="color: #666; font-size: 13px;">
                    📎 The approved request form is attached. Open it and press Ctrl+P (Cmd+P) to save it as a PDF.
                  </p>

                  <p style="color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
                    This is an automated email from the User Access Request System. Please do not reply to this email.
                  </p>
                </div>
              </div>
            `,
            attachments: completionAttachment ? [completionAttachment] : undefined
          }, {
            APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
          });
        }
      }
    }

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, request_id, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind('APPROVE_REQUEST', requestId, approvedBy || 'System', `Approved by ${currentStep.approver_name} (Level ${currentLevel})`, clientIP).run();

    return c.json({
      success: true,
      message: 'Request approved successfully',
      newStatus: newStatus,
      needsMoreApproval: newStatus !== 'approved'
    });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to approve request', error: error.message }, 500);
  }
});

// Reject request (by approver level)
app.post('/api/requests/:id/reject', async (c) => {
  try {
    const requestId = c.req.param('id');
    const { approver_level, comments, rejectedBy } = await c.req.json();
    const currentLevel = parseInt(approver_level);

    // Find the pending approval step at this level
    const currentStep = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? AND approver_level = ? AND status = ?'
    ).bind(requestId, currentLevel, 'pending').first();

    if (!currentStep) {
      return c.json({ success: false, message: 'No pending approval at this level' }, 400);
    }

    // Mark current step as rejected
    await c.env.DB.prepare(
      'UPDATE approval_history SET status = ?, comments = ?, approved_at = ? WHERE id = ?'
    ).bind('rejected', comments || '', new Date().toISOString(), currentStep.id).run();

    // Update request status
    await c.env.DB.prepare(
      'UPDATE user_requests SET status = ? WHERE id = ?'
    ).bind('rejected', requestId).run();

    // Notify the requester of the rejection
    const rejectedRequest = await c.env.DB.prepare(
      'SELECT ur.*, u.first_name, u.last_name FROM user_requests ur JOIN users u ON ur.user_id = u.id WHERE ur.id = ?'
    ).bind(requestId).first();

    if (rejectedRequest?.requester_email) {
      const programs = await c.env.DB.prepare(
        'SELECT p.name FROM request_access rp JOIN programs p ON rp.program_id = p.id WHERE rp.request_id = ? GROUP BY p.id'
      ).bind(requestId).all();
      const programNames = programs.results.map((p: any) => p.name).join(', ');
      const employeeName = `${rejectedRequest.first_name} ${rejectedRequest.last_name}`;

      await sendEmail({
        to: rejectedRequest.requester_email as string,
        subject: `❌ Request ${rejectedRequest.request_number} - Update`,
        html: getApprovalNotificationEmail(
          rejectedRequest.request_number as string,
          employeeName,
          `${currentStep.approver_name} (Approver Level ${currentLevel})`,
          false,
          comments
        )
      }, {
        APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
      });

      await sendEmail({
        to: rejectedRequest.requester_email as string,
        subject: `❌ Request ${rejectedRequest.request_number} - Rejected`,
        html: getApprovalCompletedEmail(
          rejectedRequest.request_number as string,
          employeeName,
          programNames,
          false,
          c.env.APP_URL,
          requestId
        )
      }, {
        APP_URL: c.env.APP_URL,
        EMAIL_SERVICE_URL: c.env.EMAIL_SERVICE_URL,
        EMAIL_API_TOKEN: c.env.EMAIL_API_TOKEN
      });
    }

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, request_id, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind('REJECT_REQUEST', requestId, rejectedBy, `Rejected by ${currentStep.approver_name} (Level ${currentLevel})`, clientIP).run();

    return c.json({ success: true, message: 'Request rejected' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to reject request', error: error.message }, 500);
  }
});

// ============================================
// SYSTEM USERS MANAGEMENT (AUTHENTICATION)
// ============================================

// Login endpoint
app.post('/api/auth/login', async (c) => {
  try {
    const { username, password, role } = await c.req.json();

    const user = await c.env.DB.prepare(
      'SELECT * FROM system_users WHERE username = ? AND role = ? AND is_active = 1'
    ).bind(username, role).first();

    if (!user || user.password !== password) {
      return c.json({ success: false, message: 'Invalid credentials' }, 401);
    }

    // Update last login
    await c.env.DB.prepare(
      'UPDATE system_users SET last_login = datetime("now") WHERE id = ?'
    ).bind(user.id).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('LOGIN', username, `User ${username} logged in`, clientIP).run();

    return c.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return c.json({ success: false, message: 'Login failed', error: error.message }, 500);
  }
});

// Get all system users (admin only)
app.get('/api/system-users', async (c) => {
  try {
    const users = await c.env.DB.prepare(
      'SELECT id, username, full_name, email, role, is_active, last_login, created_at FROM system_users ORDER BY created_at DESC'
    ).all();

    return c.json({ success: true, data: users.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch users', error: error.message }, 500);
  }
});

// Get single system user
app.get('/api/system-users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const user = await c.env.DB.prepare(
      'SELECT id, username, full_name, email, role, is_active, last_login, created_at FROM system_users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    return c.json({ success: true, data: user });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch user', error: error.message }, 500);
  }
});

// Create new system user (admin only)
app.post('/api/system-users', async (c) => {
  try {
    const { username, password, full_name, email, role, createdBy } = await c.req.json();

    // Check if username exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM system_users WHERE username = ?'
    ).bind(username).first();

    if (existing) {
      return c.json({ success: false, message: 'Username already exists' }, 400);
    }

    // Insert new user
    const result = await c.env.DB.prepare(
      'INSERT INTO system_users (username, password, full_name, email, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(username, password, full_name, email || null, role).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, new_value, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      'CREATE_USER',
      createdBy,
      JSON.stringify({ username, full_name, role }),
      `Created new ${role} user: ${username}`,
      clientIP
    ).run();

    return c.json({
      success: true,
      message: 'User created successfully',
      data: { userId: result.meta.last_row_id }
    }, 201);
  } catch (error) {
    return c.json({ success: false, message: 'Failed to create user', error: error.message }, 500);
  }
});

// Update system user (admin only)
app.patch('/api/system-users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const { full_name, email, password, role, is_active, updatedBy } = await c.req.json();

    // Get old data for audit
    const oldData = await c.env.DB.prepare(
      'SELECT * FROM system_users WHERE id = ?'
    ).bind(userId).first();

    if (!oldData) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      params.push(full_name);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (password !== undefined) {
      updates.push('password = ?');
      params.push(password);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    updates.push('updated_at = datetime("now")');
    params.push(userId);

    await c.env.DB.prepare(
      `UPDATE system_users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, old_value, new_value, change_description, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      'UPDATE_USER',
      updatedBy,
      JSON.stringify({ username: oldData.username, role: oldData.role, is_active: oldData.is_active }),
      JSON.stringify({ username: oldData.username, role: role || oldData.role, is_active: is_active !== undefined ? is_active : oldData.is_active }),
      `Updated user: ${oldData.username}`,
      clientIP
    ).run();

    return c.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update user', error: error.message }, 500);
  }
});

// Delete system user (admin only)
app.delete('/api/system-users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const { deletedBy } = await c.req.json();

    // Get user data for audit
    const user = await c.env.DB.prepare(
      'SELECT username, role FROM system_users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    // Don't allow deleting the last admin
    if (user.role === 'admin') {
      const adminCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM system_users WHERE role = "admin" AND is_active = 1'
      ).first();

      if (adminCount && (adminCount.count as number) <= 1) {
        return c.json({ success: false, message: 'Cannot delete the last admin user' }, 400);
      }
    }

    // Delete user
    await c.env.DB.prepare(
      'DELETE FROM system_users WHERE id = ?'
    ).bind(userId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, old_value, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      'DELETE_USER',
      deletedBy,
      JSON.stringify({ username: user.username, role: user.role }),
      `Deleted user: ${user.username}`,
      clientIP
    ).run();

    return c.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to delete user', error: error.message }, 500);
  }
});

// Get approval history for a request
app.get('/api/requests/:id/approval-history', async (c) => {
  try {
    const requestId = c.req.param('id');

    const request = await c.env.DB.prepare(
      `SELECT ur.*, d.name as department_name
       FROM user_requests ur
       LEFT JOIN departments d ON ur.department_id = d.id
       WHERE ur.id = ?`
    ).bind(requestId).first();

    if (!request) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    const approvals = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? ORDER BY approver_level'
    ).bind(requestId).all();

    const programAccess = await c.env.DB.prepare(
      `SELECT p.name as program_name, r.role_name
       FROM request_access ra
       JOIN programs p ON ra.program_id = p.id
       JOIN roles r ON ra.role_id = r.id
       WHERE ra.request_id = ?`
    ).bind(requestId).all();

    return c.json({
      success: true,
      request: {
        ...request,
        programAccess: programAccess.results || []
      },
      approvals: approvals.results || []
    });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to get approval history', error: error.message }, 500);
  }
});

// Generate printable approval form
app.get('/api/requests/:id/print-form', async (c) => {
  try {
    const requestId = c.req.param('id');
    const htmlContent = await generateRequestFormHtml(c.env.DB, requestId);

    if (!htmlContent) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    // Return HTML for browser to render and print
    return c.html(htmlContent);
  } catch (error) {
    return c.json({ success: false, message: 'Failed to generate print form', error: error.message }, 500);
  }
});

// Serve static files from public directory (after all API routes)
app.use('/*', serveStatic({ namespace: 'ASSETS' }));

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, message: 'Route not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    success: false,
    message: 'Something went wrong!',
    error: err.message
  }, 500);
});

export default app;
