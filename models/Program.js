const db = require('../config/database');

class Program {
  static async getAll() {
    const [programs] = await db.query('SELECT * FROM programs ORDER BY name');
    return programs;
  }

  static async getById(id) {
    const [programs] = await db.query('SELECT * FROM programs WHERE id = ?', [id]);
    return programs[0] || null;
  }

  static async getRolesByProgramId(programId) {
    const [roles] = await db.query(
      'SELECT * FROM roles WHERE program_id = ? ORDER BY role_name',
      [programId]
    );
    return roles;
  }

  static async getAllWithRoles() {
    const [programs] = await db.query('SELECT * FROM programs ORDER BY name');

    for (const program of programs) {
      program.roles = await this.getRolesByProgramId(program.id);
    }

    return programs;
  }

  static async create(name, description) {
    const [result] = await db.query(
      'INSERT INTO programs (name, description) VALUES (?, ?)',
      [name, description]
    );
    return result.insertId;
  }

  static async createRole(programId, roleName, description) {
    const [result] = await db.query(
      'INSERT INTO roles (program_id, role_name, description) VALUES (?, ?, ?)',
      [programId, roleName, description]
    );
    return result.insertId;
  }
}

module.exports = Program;
