const express = require('express');
const router = express.Router();
const controller = require('../controllers/userAdminController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

// Any authenticated user can see their own authoritative role/permissions.
router.get('/me/permissions', authenticateToken, controller.getMyPermissions);

// Admin-only management endpoints — enforced server-side on every request.
router.get('/', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.listUsers);
router.get('/audit', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.getAuditLog);
router.get('/security', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.getSecuritySummary);
router.get('/content', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.getModerationContent);
router.delete('/content', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.deleteModerationContent);
router.post('/bulk', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_BAN), controller.bulkUpdateUsers);
router.get('/export/:kind', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.exportCsv);
router.get('/:type/:id', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.getUserDetail);
router.put('/:type/:id/role', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_SET_ROLE), controller.setUserRole);
router.post('/:type/:id/ban', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_BAN), controller.banUser);
router.post('/:type/:id/unban', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_UNBAN), controller.unbanUser);

module.exports = router;
