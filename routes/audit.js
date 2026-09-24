const express = require('express');
const router = express.Router();
const UserRequest = require('../models/UserRequest');

// Get all audit logs with optional filters
router.get('/', async (req, res) => {
  try {
    const filters = {
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      action: req.query.action,
      requestId: req.query.requestId,
      limit: req.query.limit || 100
    };

    const logs = await UserRequest.getAllAuditLogs(filters);
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
});

module.exports = router;
