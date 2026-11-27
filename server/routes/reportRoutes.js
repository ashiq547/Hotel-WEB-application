const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Operational reports — staff only (guests have no report permissions).
router.get('/dashboard', authenticateToken, rbac.requirePermission(P.REPORT_READ_BASIC), reportController.getDashboardStats);
router.get('/top-spenders', authenticateToken, rbac.requirePermission(P.REPORT_READ_BASIC), reportController.getHighestSpendingGuests);
router.get('/upcoming-checkins', authenticateToken, rbac.requirePermission(P.REPORT_READ_BASIC), reportController.getUpcomingCheckins);
router.get('/employee-salary', authenticateToken, rbac.requirePermission(P.REPORT_READ_SALARY), reportController.getEmployeeSalaryReport);
router.get('/occupancy', authenticateToken, rbac.requirePermission(P.REPORT_READ_BASIC), reportController.getOccupancyReport);

module.exports = router;
