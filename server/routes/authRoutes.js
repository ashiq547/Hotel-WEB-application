const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

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

// Session management
router.get('/sessions', authenticateToken, authController.listSessions);
router.delete('/sessions/:id', authenticateToken, authController.revokeSession);
router.post('/sessions/revoke-all', authenticateToken, authController.revokeAllSessions);

module.exports = router;
