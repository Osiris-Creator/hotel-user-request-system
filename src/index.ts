import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, CreateRequestBody, AuditLog } from './types';
import { sendEmail, getApprovalRequestEmail, getApprovalCompletedEmail } from './email';

const app = new Hono<{ Bindings: Env }>();

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
    const { user, requester, programAccess, notes } = body;

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
      ).bind(user.first_name, user.last_name, user.email, user.department, user.position, userId).run();
    } else {
      const userResult = await c.env.DB.prepare(
        'INSERT INTO users (employee_id, first_name, last_name, email, department, position) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(user.employee_id, user.first_name, user.last_name, user.email, user.department, user.position).run();
      userId = userResult.meta.last_row_id;
    }

    // Insert user request
    const requestResult = await c.env.DB.prepare(
      'INSERT INTO user_requests (request_number, user_id, requester_name, requester_email, notes) VALUES (?, ?, ?, ?, ?)'
    ).bind(requestNumber, userId, requester.name, requester.email, notes || null).run();

    const requestId = requestResult.meta.last_row_id;

    // Insert program access
    for (const access of programAccess) {
      await c.env.DB.prepare(
        'INSERT INTO request_access (request_id, program_id, role_id) VALUES (?, ?, ?)'
      ).bind(requestId, access.program_id, access.role_id).run();
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
      'SELECT COUNT(*) as count FROM request_programs WHERE program_id = ?'
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
      'SELECT COUNT(*) as count FROM request_programs WHERE role_id = ?'
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
    const { approver_name, approver_email, createdBy } = await c.req.json();

    // Get max level and add 1
    const maxLevel = await c.env.DB.prepare(
      'SELECT MAX(approver_level) as max_level FROM approval_settings'
    ).first();

    const newLevel = (maxLevel?.max_level || 0) + 1;

    const result = await c.env.DB.prepare(
      'INSERT INTO approval_settings (approver_level, approver_name, approver_email) VALUES (?, ?, ?)'
    ).bind(newLevel, approver_name, approver_email).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?)'
    ).bind('CREATE_APPROVER', createdBy, `Added approver level ${newLevel}: ${approver_name}`, clientIP).run();

    return c.json({ success: true, message: 'Approver added successfully', id: result.meta.last_row_id, level: newLevel });
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
    ).bind('UPDATE_APPROVER', updatedBy, `Updated approver level ${level}: ${approver_name}`, clientIP).run();

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
    ).bind('DELETE_APPROVER', deletedBy, `Deleted approver level ${level}: ${approver?.approver_name || 'Unknown'}`, clientIP).run();

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

    // Get request details
    const request = await c.env.DB.prepare(
      'SELECT ur.*, u.first_name, u.last_name, u.employee_id FROM user_requests ur JOIN users u ON ur.user_id = u.id WHERE ur.id = ?'
    ).bind(requestId).first();

    if (!request) {
      return c.json({ success: false, message: 'Request not found' }, 404);
    }

    // Get approver settings
    const approver = await c.env.DB.prepare(
      'SELECT * FROM approval_settings WHERE approver_level = ?'
    ).bind(approver_level).first();

    if (!approver) {
      return c.json({ success: false, message: 'Approver not found' }, 404);
    }

    // Check if already approved at this level
    const existing = await c.env.DB.prepare(
      'SELECT * FROM approval_history WHERE request_id = ? AND approver_level = ?'
    ).bind(requestId, approver_level).first();

    if (existing) {
      return c.json({ success: false, message: 'Already approved at this level' }, 400);
    }

    // Add approval record
    await c.env.DB.prepare(
      'INSERT INTO approval_history (request_id, approver_level, approver_name, approver_email, status, comments, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(requestId, approver_level, approver.approver_name, approver.approver_email, 'approved', comments || '', new Date().toISOString()).run();

    // Get program names
    const programs = await c.env.DB.prepare(
      'SELECT p.name FROM request_programs rp JOIN programs p ON rp.program_id = p.id WHERE rp.request_id = ? GROUP BY p.id'
    ).bind(requestId).all();

    const programNames = programs.results.map((p: any) => p.name);
    const employeeName = `${request.first_name} ${request.last_name}`;

    // Get total approver count (excluding final notification)
    const totalApprovers = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM approval_settings WHERE approver_level < (SELECT MAX(approver_level) FROM approval_settings)'
    ).first();

    // Check if all approvers have approved
    const approvalCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM approval_history WHERE request_id = ? AND status = ?'
    ).bind(requestId, 'approved').first();

    let newStatus = request.status;

    if (approvalCount.count >= totalApprovers.count) {
      // All approvers approved
      newStatus = 'approved';
      await c.env.DB.prepare(
        'UPDATE user_requests SET status = ?, approved_by = ?, approved_date = ? WHERE id = ?'
      ).bind(newStatus, approvedBy, new Date().toISOString(), requestId).run();

      // Send final notification email
      const finalNotification = await c.env.DB.prepare(
        'SELECT * FROM approval_settings ORDER BY approver_level DESC LIMIT 1'
      ).first();

      if (finalNotification) {
        await sendEmail({
          to: finalNotification.approver_email,
          subject: `✅ Request ${request.request_number} - Fully Approved`,
          html: getApprovalCompletedEmail(request.request_number, employeeName, programNames)
        });
      }
    } else {
      // Send email to next approver
      const nextLevel = approver_level + 1;
      const nextApprover = await c.env.DB.prepare(
        'SELECT * FROM approval_settings WHERE approver_level = ?'
      ).bind(nextLevel).first();

      if (nextApprover) {
        await sendEmail({
          to: nextApprover.approver_email,
          subject: `🔔 New Request ${request.request_number} - Approval Required`,
          html: getApprovalRequestEmail(request.request_number, employeeName, programNames, nextApprover.approver_name, nextLevel)
        });
      }
    }

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, request_id, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind('APPROVE_REQUEST', requestId, approvedBy, `Approved by ${approver.approver_name} (Level ${approver_level})`, clientIP).run();

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

    // Get approver settings
    const approver = await c.env.DB.prepare(
      'SELECT * FROM approval_settings WHERE approver_level = ?'
    ).bind(approver_level).first();

    if (!approver) {
      return c.json({ success: false, message: 'Approver not found' }, 404);
    }

    // Add rejection record
    await c.env.DB.prepare(
      'INSERT INTO approval_history (request_id, approver_level, approver_name, approver_email, status, comments, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(requestId, approver_level, approver.approver_name, approver.approver_email, 'rejected', comments || '', new Date().toISOString()).run();

    // Update request status
    await c.env.DB.prepare(
      'UPDATE user_requests SET status = ? WHERE id = ?'
    ).bind('rejected', requestId).run();

    // Log to audit
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    await c.env.DB.prepare(
      'INSERT INTO audit_log (action, request_id, changed_by, change_description, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).bind('REJECT_REQUEST', requestId, rejectedBy, `Rejected by ${approver.approver_name} (Level ${approver_level})`, clientIP).run();

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
