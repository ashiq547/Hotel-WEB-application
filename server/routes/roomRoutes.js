const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Public GET routes for room inventory
router.get('/', roomController.getAllRooms);
router.get('/available', roomController.getAvailableRooms);

// Protected routes — membership/ownership checked in the controller:
// members of the hotel owning the room may create/update it; only
// Admins (or manager-members) may delete.
router.post('/', authenticateToken,
  rbac.requireAnyPermission(P.ROOM_CREATE, P.ROOM_UPDATE_OWNED),
  roomController.createRoom);
router.put('/:id', authenticateToken, rbac.requireAnyPermission(P.ROOM_UPDATE_OWNED, P.ROOM_UPDATE_ANY), roomController.updateRoom);
router.delete('/:id', authenticateToken, rbac.requireAnyPermission(P.ROOM_DELETE_OWNED, P.ROOM_DELETE_ANY), roomController.deleteRoom);

module.exports = router;
