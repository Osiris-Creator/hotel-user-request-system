const express = require('express');
const router = express.Router();
const Program = require('../models/Program');

// Get all programs
router.get('/', async (req, res) => {
  try {
    const programs = await Program.getAll();
    res.json({
      success: true,
      data: programs
    });
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch programs',
      error: error.message
    });
  }
});

// Get all programs with roles
router.get('/with-roles', async (req, res) => {
  try {
    const programs = await Program.getAllWithRoles();
    res.json({
      success: true,
      data: programs
    });
  } catch (error) {
    console.error('Error fetching programs with roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch programs with roles',
      error: error.message
    });
  }
});

// Get roles for a specific program
router.get('/:id/roles', async (req, res) => {
  try {
    const roles = await Program.getRolesByProgramId(req.params.id);
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
});

module.exports = router;
