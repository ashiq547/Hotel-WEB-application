const express = require('express');
const router = express.Router();
const hotelController = require('../controllers/hotelController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Public GET routes for hotel list & details
router.get('/', hotelController.getAllHotels);
router.get('/:id', hotelController.getHotelById);

// Ownership and membership are checked in the controller.
router.post('/', authenticateToken, rbac.requirePermission(P.HOTEL_CREATE), hotelController.createHotel);
router.put('/:id', authenticateToken, rbac.requirePermission(P.ROOM_UPDATE_OWNED), hotelController.updateHotel);
router.delete('/:id', authenticateToken,
  rbac.requireAnyPermission(P.HOTEL_READ_MEMBERS, P.ROOM_UPDATE_OWNED),
  hotelController.deleteHotel);

// Hotel membership (fine-grained shared-resource permissions)
router.get('/:id/members', authenticateToken,
  rbac.requireAnyPermission(P.HOTEL_READ_MEMBERS, P.ROOM_UPDATE_OWNED),
  hotelController.listMembers);
router.post('/:id/members', authenticateToken,
  rbac.requireAnyPermission(P.HOTEL_READ_MEMBERS, P.ROOM_UPDATE_OWNED),
  hotelController.addMember);
router.delete('/:id/members/:employeeId', authenticateToken,
  rbac.requireAnyPermission(P.HOTEL_READ_MEMBERS, P.ROOM_UPDATE_OWNED),
  hotelController.removeMember);

module.exports = router;
