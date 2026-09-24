const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
  let connection;

  try {
    // Connect without database first
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });

    console.log('Connected to MySQL server');

    // Create database
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'hotel_user_request_db'}`);
    console.log('Database created or already exists');

    // Use the database
    await connection.query(`USE ${process.env.DB_NAME || 'hotel_user_request_db'}`);

    // Create programs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Programs table created');

    // Create roles table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        program_id INT NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
        UNIQUE KEY unique_program_role (program_id, role_name)
      )
    `);
    console.log('Roles table created');

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL UNIQUE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        department VARCHAR(100),
        position VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created');

    // Create user_requests table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_number VARCHAR(50) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        requester_name VARCHAR(200) NOT NULL,
        requester_email VARCHAR(255) NOT NULL,
        status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
        request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by VARCHAR(200),
        approved_date TIMESTAMP NULL,
        completed_date TIMESTAMP NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_status (status),
        INDEX idx_request_date (request_date)
      )
    `);
    console.log('User requests table created');

    // Create request_access table (junction table for request and program/role)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS request_access (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        program_id INT NOT NULL,
        role_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES user_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        UNIQUE KEY unique_request_program_role (request_id, program_id, role_id)
      )
    `);
    console.log('Request access table created');

    // Create audit_log table for tracking all changes
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT,
        action VARCHAR(50) NOT NULL,
        changed_by VARCHAR(200) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_description TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES user_requests(id) ON DELETE SET NULL,
        INDEX idx_request_id (request_id),
        INDEX idx_created_at (created_at),
        INDEX idx_action (action)
      )
    `);
    console.log('Audit log table created');

    // Insert default programs
    const programs = [
      ['Opera Cloud', 'Property Management System'],
      ['POS Infrasys cloud', 'Point of Sale System'],
      ['Message Box', 'Internal Communication System'],
      ['Visionline Key Card', 'Key Card Management System'],
      ['Okkami', 'Okkami System'],
      ['Oracle Fusion Cloud', 'Oracle Fusion Cloud ERP']
    ];

    for (const [name, description] of programs) {
      await connection.query(
        'INSERT INTO programs (name, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?',
        [name, description, description]
      );
    }
    console.log('Default programs inserted');

    // Insert default roles for each program
    const defaultRoles = [
      { program: 'Opera Cloud', roles: ['Admin', 'Front Desk', 'Reservation', 'Housekeeping', 'Cashier', 'Report Viewer'] },
      { program: 'POS Infrasys cloud', roles: ['Admin', 'Manager', 'Cashier', 'Server', 'Report Viewer'] },
      { program: 'Message Box', roles: ['Admin', 'User', 'Manager'] },
      { program: 'Visionline Key Card', roles: ['Admin', 'Front Desk', 'Security', 'Engineer'] },
      { program: 'Okkami', roles: ['Admin', 'User', 'Manager'] },
      { program: 'Oracle Fusion Cloud', roles: ['Admin', 'Finance', 'HR', 'Procurement', 'Report Viewer'] }
    ];

    for (const { program, roles } of defaultRoles) {
      const [programResult] = await connection.query('SELECT id FROM programs WHERE name = ?', [program]);
      const programId = programResult[0].id;

      for (const roleName of roles) {
        await connection.query(
          'INSERT INTO roles (program_id, role_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE role_name = role_name',
          [programId, roleName]
        );
      }
    }
    console.log('Default roles inserted');

    console.log('\nDatabase initialization completed successfully!');

  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initializeDatabase();
