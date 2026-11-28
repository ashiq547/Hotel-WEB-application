const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const rbac = require('../utils/rbac');
const { authenticateToken } = require('../middleware/auth');

const P = rbac.PERMISSIONS;

router.get('/', authenticateToken, rbac.requirePermission(P.EMPLOYEE_READ_ALL), employeeController.getAllEmployees);
router.get('/:id', authenticateToken, rbac.requirePermission(P.EMPLOYEE_READ_ALL), employeeController.getEmployeeById);
router.post('/', authenticateToken, rbac.requirePermission(P.EMPLOYEE_CREATE), employeeController.createEmployee);
router.put('/:id', authenticateToken, rbac.requirePermission(P.EMPLOYEE_UPDATE_ANY), employeeController.updateEmployee);
router.delete('/:id', authenticateToken, rbac.requirePermission(P.EMPLOYEE_DELETE_ANY), employeeController.deleteEmployee);

module.exports = router;
