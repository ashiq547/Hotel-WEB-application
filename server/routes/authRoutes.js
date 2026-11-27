const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Public
router.post('/login', authController.login);
router.post('/guest-login', authController.guestLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Authenticated
router.get('/me', authenticateToken, authController.getMe);
router.get('/profile/:id', authenticateToken, authController.getProfile);
router.post('/change-password', authenticateToken, authController.changePassword);
router.post('/update-profile', authenticateToken, authController.updateProfile);

// Session management — self-service for every role.
router.get('/sessions', authenticateToken, rbac.requirePermission(P.SESSION_READ_SELF), authController.listSessions);
router.delete('/sessions/:id', authenticateToken, rbac.requirePermission(P.SESSION_REVOKE_SELF), authController.revokeSession);
router.post('/sessions/revoke-all', authenticateToken, rbac.requirePermission(P.SESSION_REVOKE_SELF), authController.revokeAllSessions);

module.exports = router;
