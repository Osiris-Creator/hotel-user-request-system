const express = require('express');
const router = express.Router();
const UserRequest = require('../models/UserRequest');

// Create new user request
router.post('/', async (req, res) => {
  try {
    const result = await UserRequest.create(req.body);
    res.status(201).json({
      success: true,
      message: 'User request created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating user request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user request',
      error: error.message
    });
  }
});

// Get all requests with optional filters
router.get('/', async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      search: req.query.search,
      limit: req.query.limit
    };
    const requests = await UserRequest.getAll(filters);
    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: error.message
    });
  }
});

// Get single request by ID
router.get('/:id', async (req, res) => {
  try {
    const request = await UserRequest.getById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error fetching request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch request',
      error: error.message
    });
  }
});

// Update request status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, changedBy, approvedBy } = req.body;

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    await UserRequest.updateStatus(req.params.id, status, changedBy, { approvedBy });

    res.json({
      success: true,
      message: 'Request status updated successfully'
    });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update request status',
      error: error.message
    });
  }
});

// Get audit log for a specific request
router.get('/:id/audit', async (req, res) => {
  try {
    const logs = await UserRequest.getAuditLog(req.params.id);
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit log',
      error: error.message
    });
  }
});

module.exports = router;
