const express = require('express');
const router = express.Router();
const controller = require('../controllers/userAdminController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

// Any authenticated user can see their own authoritative role/permissions.
router.get('/me/permissions', authenticateToken, controller.getMyPermissions);

// Admin-only management endpoints — enforced server-side on every request.
router.get('/', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_READ_ALL), controller.listUsers);
router.put('/:type/:id/role', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_SET_ROLE), controller.setUserRole);
router.post('/:type/:id/ban', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_BAN), controller.banUser);
router.post('/:type/:id/unban', authenticateToken, rbac.requirePermission(rbac.PERMISSIONS.USER_UNBAN), controller.unbanUser);

module.exports = router;
