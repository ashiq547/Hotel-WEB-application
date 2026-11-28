const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Public route for checking username availability during guest registration
router.get('/check-username', guestController.checkUsernameAvailability);

// Public route for guest self-registration
router.post('/', guestController.createGuest);

router.get('/', authenticateToken, rbac.requirePermission(P.GUEST_READ_ALL), guestController.getAllGuests);
router.get('/search', authenticateToken, rbac.requirePermission(P.GUEST_READ_ALL), guestController.searchGuests);
router.get('/profile/:id', authenticateToken,
  rbac.requireAnyPermission(P.PROFILE_READ_SELF, P.GUEST_READ_ALL),
  guestController.getGuestProfile);
router.get('/:id', authenticateToken,
  rbac.requireAnyPermission(P.PROFILE_READ_SELF, P.GUEST_READ_ALL),
  guestController.getGuestById);
router.put('/:id', authenticateToken, rbac.requirePermission(P.GUEST_UPDATE_ANY), guestController.updateGuest);
router.delete('/:id', authenticateToken, rbac.requirePermission(P.GUEST_DELETE_ANY), guestController.deleteGuest);

module.exports = router;
