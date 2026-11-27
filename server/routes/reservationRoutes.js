const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// All reservation endpoints require authentication; authorization is checked
// server-side per request. Ownership is enforced inside the controller.
router.get('/', authenticateToken,
  rbac.requireAnyPermission(P.RESERVATION_READ_OWN, P.RESERVATION_READ_ALL),
  reservationController.getAllReservations);

router.get('/:id', authenticateToken,
  rbac.requireAnyPermission(P.RESERVATION_READ_OWN, P.RESERVATION_READ_ALL),
  reservationController.getReservationById);

router.post('/', authenticateToken,
  rbac.requireAnyPermission(P.RESERVATION_CREATE_SELF, P.RESERVATION_CREATE_ANY),
  reservationController.createReservation);

router.put('/:id', authenticateToken,
  rbac.requireAnyPermission(P.RESERVATION_UPDATE_OWN, P.RESERVATION_UPDATE_ANY),
  reservationController.updateReservation);

router.delete('/:id', authenticateToken,
  rbac.requireAnyPermission(P.RESERVATION_DELETE_OWN, P.RESERVATION_DELETE_ANY),
  reservationController.deleteReservation);

module.exports = router;
