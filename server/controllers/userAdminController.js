/**
 * Admin user-management controller.
 *
 * Safety rules enforced here (never trust the client):
 * - An admin cannot change their OWN role (no self-promotion/demotion accidents).
 * - An admin cannot ban another admin.
 * - A banned user is rejected on the very next request by requirePermission.
 */
const db = require('../config/db');
const userAccounts = require('../utils/userAccounts');
const sessionStore = require('../utils/sessionStore');

const VALID_ROLES = ['Guest', 'Receptionist', 'Manager', 'Admin'];

/** Resolve the DB user-type for an acting user (guest vs employee). */
function userTypeOf(req) {
  return String(req.user.role).toLowerCase() === 'guest' ? 'Guest' : 'Employee';
}

// List all user accounts (roles, ban state)
exports.listUsers = async (req, res, next) => {
  try {
    const accounts = await userAccounts.listAccounts();
    res.json({ users: accounts });
  } catch (err) {
    next(err);
  }
};

// Change a user's role
exports.setUserRole = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const { role } = req.body;
    const userType = type === 'guest' ? 'Guest' : 'Employee';
    const targetId = Number(id);

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }

    // SAFETY: an admin cannot change their own role.
    if (userType === userTypeOf(req) && Number(req.user.id) === targetId) {
      return res.status(403).json({ error: 'You cannot change your own role' });
    }

    const target = await userAccounts.getAccount(userType, targetId, false);
    if (target && target.Role === 'Admin' && role !== 'Admin') {
      // Only another admin may demote an admin — but never themselves (rule above).
      const actingRole = await userAccounts.getRole(userTypeOf(req), req.user.id, req.user.role);
      if (actingRole !== 'Admin') {
        return res.status(403).json({ error: 'Only an admin can change an admin\'s role' });
      }
    }

    await userAccounts.setRole(userType, targetId, role);

    // Role change takes effect immediately: revoke the target's sessions so
    // their next request re-authenticates with the new role.
    await sessionStore.revokeAllSessions(userType, targetId);

    res.json({ message: `Role updated to ${role}` });
  } catch (err) {
    next(err);
  }
};

// Ban a user
exports.banUser = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const { reason } = req.body;
    const userType = type === 'guest' ? 'Guest' : 'Employee';
    const targetId = Number(id);

    // SAFETY: an admin cannot ban another admin (and therefore never themselves).
    const target = await userAccounts.getAccount(userType, targetId, false);
    if (target && target.Role === 'Admin') {
      return res.status(403).json({ error: 'An admin cannot ban another admin' });
    }

    const banned = await userAccounts.banUser(userType, targetId, reason, req.user.id);
    if (!banned) {
      return res.status(409).json({ error: 'User is already banned' });
    }

    // Kick the banned user out: their very next request is rejected, and their
    // existing sessions/refresh tokens are invalidated immediately.
    await sessionStore.revokeAllSessions(userType, targetId);

    res.json({ message: 'User banned' });
  } catch (err) {
    next(err);
  }
};

// Unban a user
exports.unbanUser = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const userType = type === 'guest' ? 'Guest' : 'Employee';
    const targetId = Number(id);

    const unbanned = await userAccounts.unbanUser(userType, targetId);
    if (!unbanned) {
      return res.status(409).json({ error: 'User is not banned' });
    }
    res.json({ message: 'User unbanned' });
  } catch (err) {
    next(err);
  }
};

// Who am I according to the database (authoritative, not the token)?
exports.getMyPermissions = async (req, res, next) => {
  try {
    const rbac = require('../utils/rbac');
    const userType = userTypeOf(req);
    const role = await userAccounts.getRole(userType, req.user.id, req.user.role);
    const banned = await userAccounts.isBanned(userType, req.user.id);
    res.json({
      user: { id: req.user.id, type: userType },
      role,
      banned,
      permissions: rbac.ROLES[role] || []
    });
  } catch (err) {
    next(err);
  }
};
