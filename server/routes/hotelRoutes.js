const express = require('express');
const router = express.Router();
const hotelController = require('../controllers/hotelController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Public GET routes for hotel list & details
router.get('/', hotelController.getAllHotels);
router.get('/:id', hotelController.getHotelById);

// Protected hotel management — ownership/membership checked in the controller:
// members may update (Manager-members rename), only Admins delete / manage members.
router.post('/', authenticateToken, rbac.requirePermission(P.HOTEL_CREATE), hotelController.createHotel);
router.put('/:id', authenticateToken, rbac.requirePermission(P.ROOM_UPDATE_OWNED), hotelController.updateHotel);
router.delete('/:id', authenticateToken, rbac.requirePermission(P.HOTEL_DELETE_ANY), hotelController.deleteHotel);

// Hotel membership (fine-grained shared-resource permissions)
router.get('/:id/members', authenticateToken, rbac.requirePermission(P.HOTEL_READ_MEMBERS), hotelController.listMembers);
router.post('/:id/members', authenticateToken, rbac.requirePermission(P.HOTEL_MANAGE_MEMBERS), hotelController.addMember);
router.delete('/:id/members/:employeeId', authenticateToken, rbac.requirePermission(P.HOTEL_MANAGE_MEMBERS), hotelController.removeMember);

module.exports = router;
