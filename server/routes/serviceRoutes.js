const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

router.get('/', authenticateToken, rbac.requirePermission(P.SERVICE_READ), serviceController.getAllServices);
router.post('/', authenticateToken, rbac.requirePermission(P.SERVICE_CREATE), serviceController.createService);
router.put('/:id', authenticateToken, rbac.requirePermission(P.SERVICE_UPDATE), serviceController.updateService);
router.delete('/:id', authenticateToken, rbac.requirePermission(P.SERVICE_DELETE), serviceController.deleteService);

// Service Records — guests see their own records; staff need SERVICE_ASSIGN to create/assign.
router.get('/records', authenticateToken, rbac.requirePermission(P.SERVICE_READ), serviceController.getGuestServiceRecords);
router.post('/assign', authenticateToken, rbac.requirePermission(P.SERVICE_ASSIGN), serviceController.assignServiceToGuest);
router.post('/records', authenticateToken, rbac.requirePermission(P.SERVICE_ASSIGN), serviceController.assignServiceToGuest);

module.exports = router;
