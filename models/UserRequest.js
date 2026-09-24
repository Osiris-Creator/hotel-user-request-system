const db = require('../config/database');

class UserRequest {
  static async create(requestData) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { user, requester, programAccess, notes } = requestData;

      // Generate request number
      const requestNumber = await this.generateRequestNumber();

      // Insert or get user
      let userId;
      const [existingUser] = await connection.query(
        'SELECT id FROM users WHERE employee_id = ?',
        [user.employee_id]
      );

      if (existingUser.length > 0) {
        userId = existingUser[0].id;
        // Update user information
        await connection.query(
          'UPDATE users SET first_name = ?, last_name = ?, email = ?, department = ?, position = ? WHERE id = ?',
          [user.first_name, user.last_name, user.email, user.department, user.position, userId]
        );
      } else {
        const [userResult] = await connection.query(
          'INSERT INTO users (employee_id, first_name, last_name, email, department, position) VALUES (?, ?, ?, ?, ?, ?)',
          [user.employee_id, user.first_name, user.last_name, user.email, user.department, user.position]
        );
        userId = userResult.insertId;
      }

      // Insert user request
      const [requestResult] = await connection.query(
        'INSERT INTO user_requests (request_number, user_id, requester_name, requester_email, notes) VALUES (?, ?, ?, ?, ?)',
        [requestNumber, userId, requester.name, requester.email, notes || null]
      );
      const requestId = requestResult.insertId;

      // Insert program access
      for (const access of programAccess) {
        await connection.query(
          'INSERT INTO request_access (request_id, program_id, role_id) VALUES (?, ?, ?)',
          [requestId, access.program_id, access.role_id]
        );
      }

      // Log to audit
      await connection.query(
        'INSERT INTO audit_log (request_id, action, changed_by, new_value, change_description) VALUES (?, ?, ?, ?, ?)',
        [requestId, 'CREATE', requester.name, JSON.stringify(requestData), 'New user access request created']
      );

      await connection.commit();
      return { requestId, requestNumber };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async generateRequestNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    const [result] = await db.query(
      'SELECT COUNT(*) as count FROM user_requests WHERE request_number LIKE ?',
      [`REQ${year}${month}%`]
    );

    const sequence = String(result[0].count + 1).padStart(4, '0');
    return `REQ${year}${month}${sequence}`;
  }

  static async getById(requestId) {
    const [requests] = await db.query(`
      SELECT
        ur.*,
        u.employee_id, u.first_name, u.last_name, u.email as user_email,
        u.department, u.position
      FROM user_requests ur
      INNER JOIN users u ON ur.user_id = u.id
      WHERE ur.id = ?
    `, [requestId]);

    if (requests.length === 0) return null;

    const request = requests[0];

    // Get program access
    const [access] = await db.query(`
      SELECT
        ra.id, ra.program_id, ra.role_id,
        p.name as program_name,
        r.role_name
      FROM request_access ra
      INNER JOIN programs p ON ra.program_id = p.id
      INNER JOIN roles r ON ra.role_id = r.id
      WHERE ra.request_id = ?
    `, [requestId]);

    request.programAccess = access;
    return request;
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT
        ur.*,
        u.employee_id, u.first_name, u.last_name, u.email as user_email,
        u.department, u.position
      FROM user_requests ur
      INNER JOIN users u ON ur.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      query += ' AND ur.status = ?';
      params.push(filters.status);
    }

    if (filters.fromDate) {
      query += ' AND ur.request_date >= ?';
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      query += ' AND ur.request_date <= ?';
      params.push(filters.toDate);
    }

    if (filters.search) {
      query += ' AND (ur.request_number LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.employee_id LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY ur.request_date DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }

    const [requests] = await db.query(query, params);
    return requests;
  }

  static async updateStatus(requestId, status, changedBy, additionalData = {}) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [oldData] = await connection.query(
        'SELECT status FROM user_requests WHERE id = ?',
        [requestId]
      );

      const updateFields = ['status = ?'];
      const updateParams = [status];

      if (status === 'approved') {
        updateFields.push('approved_by = ?', 'approved_date = NOW()');
        updateParams.push(additionalData.approvedBy || changedBy);
      } else if (status === 'completed') {
        updateFields.push('completed_date = NOW()');
      }

      updateParams.push(requestId);

      await connection.query(
        `UPDATE user_requests SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );

      // Log to audit
      await connection.query(
        'INSERT INTO audit_log (request_id, action, changed_by, old_value, new_value, change_description) VALUES (?, ?, ?, ?, ?, ?)',
        [
          requestId,
          'UPDATE_STATUS',
          changedBy,
          oldData[0].status,
          status,
          `Status changed from ${oldData[0].status} to ${status}`
        ]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getAuditLog(requestId) {
    const [logs] = await db.query(`
      SELECT * FROM audit_log
      WHERE request_id = ?
      ORDER BY created_at DESC
    `, [requestId]);
    return logs;
  }

  static async getAllAuditLogs(filters = {}) {
    let query = 'SELECT al.*, ur.request_number FROM audit_log al LEFT JOIN user_requests ur ON al.request_id = ur.id WHERE 1=1';
    const params = [];

    if (filters.fromDate) {
      query += ' AND al.created_at >= ?';
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      query += ' AND al.created_at <= ?';
      params.push(filters.toDate);
    }

    if (filters.action) {
      query += ' AND al.action = ?';
      params.push(filters.action);
    }

    if (filters.requestId) {
      query += ' AND al.request_id = ?';
      params.push(filters.requestId);
    }

    query += ' ORDER BY al.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }

    const [logs] = await db.query(query, params);
    return logs;
  }
}

module.exports = UserRequest;
