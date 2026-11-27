const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

// Ownership: guests see only their own bills (enforced in the controller).
router.get('/', authenticateToken, rbac.requireAnyPermission(P.BILL_READ_OWN, P.BILL_READ_ALL), billController.getAllBills);
router.get('/:id', authenticateToken, rbac.requireAnyPermission(P.BILL_READ_OWN, P.BILL_READ_ALL), billController.getBillById);
router.post('/generate', authenticateToken, rbac.requirePermission(P.BILL_CREATE), billController.generateBill);
router.put('/:id', authenticateToken, rbac.requirePermission(P.BILL_UPDATE), billController.updateBill);
router.patch('/:id', authenticateToken, rbac.requirePermission(P.BILL_UPDATE), billController.updateBill);

module.exports = router;
