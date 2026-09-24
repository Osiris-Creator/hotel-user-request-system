import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, CreateRequestBody, AuditLog } from './types';

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
