/**
 * Reusable RBAC module.
 *
 * - Permission constants are declared once, grouped by domain.
 * - ROLES maps each role to the set of permissions it holds.
 * - Roles are stored in the database (User_Account table) and re-checked on
 *   EVERY request — the JWT role claim is only a hint. A demotion or ban
 *   takes effect on the next request even while the access token is valid.
 * - requirePermission / requireAnyPermission are Express middlewares (used like
 *   dependencies/decorators on routes) — never scattered role checks.
 * - Ownership is enforced with assertOwnership / ownershipFilter helpers.
 * - Hotel membership gives fine-grained permissions inside shared hotels:
 *   members can create/update rooms and reservations; managers can assign
 *   services and manage reservations; only the hotel owner can delete, rename
 *   the hotel or manage members.
 */
const userAccounts = require('./userAccounts');
const db = require('../config/db');

// ---------------------------------------------------------------------------
// Permission constants (fine-grained)
// ---------------------------------------------------------------------------
const PERMISSIONS = {
  // Profile
  PROFILE_READ_SELF: 'profile:read:self',
  PROFILE_UPDATE_SELF: 'profile:update:self',

  // Guests directory
  GUEST_READ_ALL: 'guest:read:all',
  GUEST_UPDATE_ANY: 'guest:update:any',
  GUEST_DELETE_ANY: 'guest:delete:any',

  // Employees
  EMPLOYEE_READ_ALL: 'employee:read:all',
  EMPLOYEE_CREATE: 'employee:create',
  EMPLOYEE_UPDATE_ANY: 'employee:update:any',
  EMPLOYEE_DELETE_ANY: 'employee:delete:any',

  // Hotels — shared resource with membership semantics
  HOTEL_CREATE: 'hotel:create',
  HOTEL_UPDATE_ANY: 'hotel:update:any',      // rename / edit details (owner)
  HOTEL_DELETE_ANY: 'hotel:delete:any',      // owner only
  HOTEL_READ_MEMBERS: 'hotel:read:members',
  HOTEL_MANAGE_MEMBERS: 'hotel:manage:members', // owner only

  // Rooms
  ROOM_READ_ALL: 'room:read:all',
  ROOM_CREATE: 'room:create',
  ROOM_UPDATE_OWNED: 'room:update:owned',    // staff of the hotel that owns the room
  ROOM_UPDATE_ANY: 'room:update:any',        // owner/admin
  ROOM_DELETE_OWNED: 'room:delete:owned',
  ROOM_DELETE_ANY: 'room:delete:any',

  // Reservations
  RESERVATION_READ_OWN: 'reservation:read:own',   // guests see only their own
  RESERVATION_READ_ALL: 'reservation:read:all',
  RESERVATION_CREATE_SELF: 'reservation:create:self', // guests book for themselves
  RESERVATION_CREATE_ANY: 'reservation:create:any',
  RESERVATION_UPDATE_OWN: 'reservation:update:own',
  RESERVATION_UPDATE_ANY: 'reservation:update:any',
  RESERVATION_DELETE_OWN: 'reservation:delete:own',
  RESERVATION_DELETE_ANY: 'reservation:delete:any',

  // Bills
  BILL_READ_OWN: 'bill:read:own',
  BILL_READ_ALL: 'bill:read:all',
  BILL_CREATE: 'bill:create',
  BILL_UPDATE: 'bill:update',

  // Services
  SERVICE_READ: 'service:read',
  SERVICE_CREATE: 'service:create',
  SERVICE_UPDATE: 'service:update',
  SERVICE_DELETE: 'service:delete',
  SERVICE_ASSIGN: 'service:assign',

  // Reports
  REPORT_READ_BASIC: 'report:read:basic',
  REPORT_READ_SALARY: 'report:read:salary',

  // Administration
  USER_READ_ALL: 'user:read:all',
  USER_SET_ROLE: 'user:set:role',
  USER_BAN: 'user:ban',
  USER_UNBAN: 'user:unban',

  // Session management (self-service, every role)
  SESSION_READ_SELF: 'session:read:self',
  SESSION_REVOKE_SELF: 'session:revoke:self'
};

// ---------------------------------------------------------------------------
// Role → permission map. Roles live in the DB; this declares what each means.
// ---------------------------------------------------------------------------
const ROLES = {
  Guest: [
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF,
    PERMISSIONS.RESERVATION_READ_OWN,
    PERMISSIONS.RESERVATION_CREATE_SELF,
    PERMISSIONS.RESERVATION_UPDATE_OWN,
    PERMISSIONS.RESERVATION_DELETE_OWN,
    PERMISSIONS.BILL_READ_OWN,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SESSION_READ_SELF,
    PERMISSIONS.SESSION_REVOKE_SELF
  ],
  Receptionist: [
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF,
    PERMISSIONS.GUEST_READ_ALL,
    PERMISSIONS.GUEST_UPDATE_ANY,
    PERMISSIONS.ROOM_READ_ALL,
    PERMISSIONS.ROOM_UPDATE_OWNED,
    PERMISSIONS.RESERVATION_READ_ALL,
    PERMISSIONS.RESERVATION_CREATE_ANY,
    PERMISSIONS.RESERVATION_UPDATE_ANY,
    PERMISSIONS.BILL_READ_ALL,
    PERMISSIONS.BILL_CREATE,
    PERMISSIONS.BILL_UPDATE,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_ASSIGN,
    PERMISSIONS.REPORT_READ_BASIC,
    PERMISSIONS.SESSION_READ_SELF,
    PERMISSIONS.SESSION_REVOKE_SELF
  ],
  Manager: [
    PERMISSIONS.PROFILE_READ_SELF,
    PERMISSIONS.PROFILE_UPDATE_SELF,
    PERMISSIONS.GUEST_READ_ALL,
    PERMISSIONS.GUEST_UPDATE_ANY,
    PERMISSIONS.EMPLOYEE_READ_ALL,
    PERMISSIONS.EMPLOYEE_CREATE,
    PERMISSIONS.EMPLOYEE_UPDATE_ANY,
    PERMISSIONS.HOTEL_CREATE,
    PERMISSIONS.HOTEL_READ_MEMBERS,
    PERMISSIONS.ROOM_READ_ALL,
    PERMISSIONS.ROOM_CREATE,
    PERMISSIONS.ROOM_UPDATE_OWNED,
    PERMISSIONS.ROOM_UPDATE_ANY,
    PERMISSIONS.ROOM_DELETE_OWNED,
    PERMISSIONS.RESERVATION_READ_ALL,
    PERMISSIONS.RESERVATION_CREATE_ANY,
    PERMISSIONS.RESERVATION_UPDATE_ANY,
    PERMISSIONS.BILL_READ_ALL,
    PERMISSIONS.BILL_CREATE,
    PERMISSIONS.BILL_UPDATE,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_CREATE,
    PERMISSIONS.SERVICE_UPDATE,
    PERMISSIONS.SERVICE_ASSIGN,
    PERMISSIONS.REPORT_READ_BASIC,
    PERMISSIONS.REPORT_READ_SALARY,
    PERMISSIONS.SESSION_READ_SELF,
    PERMISSIONS.SESSION_REVOKE_SELF
  ],
  Admin: Object.values(PERMISSIONS) // admin holds everything
};

// ---------------------------------------------------------------------------
// Core checks
// ---------------------------------------------------------------------------

/** Authoritative permission check against the DB-stored role. */
async function hasPermission(userType, userId, tokenRole, permission) {
  const role = await userAccounts.getRole(userType, userId, tokenRole);
  if (role === 'Banned') return false;
  const perms = ROLES[role];
  return Array.isArray(perms) && perms.includes(permission);
}

/** Rejected on the very next request when banned. */
async function isBanned(userType, userId) {
  return userAccounts.isBanned(userType, userId);
}

// ---------------------------------------------------------------------------
// Express middleware (dependency / decorator style)
// ---------------------------------------------------------------------------

/**
 * Gate a route behind one permission. Resolves the authoritative role from the
 * database on every call. Banned users are rejected here on the next request.
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const userType = req.user.type;
      if (await isBanned(userType, req.user.id)) {
        return res.status(403).json({ error: 'Your account is banned' });
      }
      if (!(await hasPermission(userType, req.user.id, req.user.role, permission))) {
        return res.status(403).json({ error: `Access forbidden: missing permission "${permission}"` });
      }
      req.rbac = req.rbac || {};
      req.rbac.userType = userType;
      req.rbac.role = await userAccounts.getRole(userType, req.user.id, req.user.role);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Gate a route behind ANY of the given permissions. */
function requireAnyPermission(...permissions) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const userType = req.user.type;
      if (await isBanned(userType, req.user.id)) {
        return res.status(403).json({ error: 'Your account is banned' });
      }
      for (const p of permissions) {
        if (await hasPermission(userType, req.user.id, req.user.role, p)) {
          req.rbac = req.rbac || {};
          req.rbac.userType = userType;
          req.rbac.role = await userAccounts.getRole(userType, req.user.id, req.user.role);
          return next();
        }
      }
      return res.status(403).json({ error: `Access forbidden: missing one of permissions [${permissions.join(', ')}]` });
    } catch (err) {
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Ownership helpers — a user can only touch their own records.
// ---------------------------------------------------------------------------

/** Admin/staff (non-guest) users bypass ownership (they have '*:any' rights). */
function isStaff(req) {
  return req.user && req.user.type === 'Employee';
}

/**
 * Assert that the requester owns the record (or is staff with override rights).
 * ownershipUserId: the record's owner user id (Guest_ID).
 * Returns true if allowed, false if the caller must send 403/404.
 */
function assertOwnership(req, ownershipUserId, { hide = true } = {}) {
  if (!req.user) return false;
  if (isStaff(req)) return true;
  if (Number(req.user.id) === Number(ownershipUserId)) return true;
  // Other users' records: respond 404 (hide) or 403.
  if (hide) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  const err = new Error('Access forbidden: you do not own this record');
  err.status = 403;
  throw err;
}

/**
 * Build a SQL ownership filter for guests: staff see everything, guests only
 * their own rows. Returns { clause, params } to append to the WHERE section.
 */
function ownershipFilter(req, column = 'r.Guest_ID') {
  if (isStaff(req)) return { clause: '', params: [] };
  return { clause: ` AND ${column} = ?`, params: [req.user.id] };
}

// ---------------------------------------------------------------------------
// Hotel membership — fine-grained permissions inside a shared resource.
// ---------------------------------------------------------------------------

let memberTableReady = false;
let ownerColumnReady = false;

async function ensureHotelOwnerColumn() {
  if (ownerColumnReady) return;
  const [columns] = await db.query("SHOW COLUMNS FROM Hotel LIKE 'Owner_Employee_ID'");
  if (!columns.length) {
    await db.query('ALTER TABLE Hotel ADD COLUMN Owner_Employee_ID INT NULL');
  }
  await db.query(`
    UPDATE Hotel h
    SET Owner_Employee_ID = (
      SELECT e.Employee_ID FROM Employee e
      WHERE e.Hotel_ID = h.Hotel_ID
      ORDER BY CASE WHEN e.Role = 'Admin' THEN 0 ELSE 1 END, e.Employee_ID
      LIMIT 1
    )
    WHERE Owner_Employee_ID IS NULL
  `);
  ownerColumnReady = true;
}

async function isHotelOwner(hotelId, employeeId) {
  await ensureHotelOwnerColumn();
  const [rows] = await db.query(
    'SELECT Hotel_ID FROM Hotel WHERE Hotel_ID = ? AND Owner_Employee_ID = ?',
    [hotelId, employeeId]
  );
  return rows.length > 0;
}

async function ensureMemberTable() {
  if (memberTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS Hotel_Member (
      Member_ID INT AUTO_INCREMENT PRIMARY KEY,
      Hotel_ID INT NOT NULL,
      Employee_ID INT NOT NULL,
      Member_Role VARCHAR(30) NOT NULL DEFAULT 'Member',
      Added_By INT NULL,
      Added_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_member (Hotel_ID, Employee_ID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  memberTableReady = true;
}

/** Check whether an employee is a member of a hotel (any level). */
async function isHotelMember(hotelId, employeeId) {
  await ensureMemberTable();
  const [rows] = await db.query(
    'SELECT Member_Role FROM Hotel_Member WHERE Hotel_ID = ? AND Employee_ID = ?',
    [hotelId, employeeId]
  );
  return rows.length > 0 ? rows[0].Member_Role : null;
}

/**
 * Permission inside a hotel:
 * - Member: can create/update rooms and create reservations.
 * - Manager-member: can also manage reservations, delete rooms, edit hotel
 *   details and assign services.
 * - Only the hotel owner can delete/rename the hotel or manage members.
 */
async function hotelPermission(hotelId, employeeId, action) {
  const memberRole = await isHotelMember(hotelId, employeeId);
  const isMember = !!memberRole;
  const isOwner = await isHotelOwner(hotelId, employeeId);

  switch (action) {
    case 'room:create':
    case 'room:update':
    case 'reservation:create':
      return isMember || isOwner; // any member or owner
    case 'reservation:update':
    case 'reservation:delete':
    case 'service:assign':
      return isOwner || (isMember && memberRole === 'Manager');
    case 'room:delete':
      return isOwner || (isMember && memberRole === 'Manager');
    case 'hotel:rename':
    case 'hotel:delete':
    case 'members:manage':
      return isOwner;
    case 'hotel:update':
      return isOwner || (isMember && memberRole === 'Manager');
    default:
      return false;
  }
}

/** List members of a hotel (join employee names). */
async function listHotelMembers(hotelId) {
  await ensureMemberTable();
  const [rows] = await db.query(
    `SELECT hm.Member_ID, hm.Hotel_ID, hm.Employee_ID, hm.Member_Role, hm.Added_At,
            e.Full_Name, e.Email, e.Role AS Job_Role
     FROM Hotel_Member hm
     JOIN Employee e ON hm.Employee_ID = e.Employee_ID
     WHERE hm.Hotel_ID = ?
     ORDER BY hm.Member_ID DESC`,
    [hotelId]
  );
  return rows;
}

/** Add a member to a hotel. */
async function addHotelMember(hotelId, employeeId, memberRole, addedBy) {
  await ensureMemberTable();
  await db.query(
    `INSERT IGNORE INTO Hotel_Member (Hotel_ID, Employee_ID, Member_Role, Added_By)
     VALUES (?, ?, ?, ?)`,
    [hotelId, employeeId, memberRole || 'Member', addedBy || null]
  );
}

/** Update an existing member's hotel role. */
async function updateHotelMemberRole(hotelId, employeeId, memberRole) {
  await ensureMemberTable();
  const [result] = await db.query(
    'UPDATE Hotel_Member SET Member_Role = ? WHERE Hotel_ID = ? AND Employee_ID = ?',
    [memberRole, hotelId, employeeId]
  );
  return result.affectedRows > 0;
}

/** Remove a member. Returns true when a row was removed. */
async function removeHotelMember(hotelId, employeeId) {
  await ensureMemberTable();
  const [result] = await db.query(
    'DELETE FROM Hotel_Member WHERE Hotel_ID = ? AND Employee_ID = ?',
    [hotelId, employeeId]
  );
  return result.affectedRows > 0;
}

/** Which hotels is an employee a member of? */
async function memberOfHotels(employeeId) {
  await ensureMemberTable();
  const [rows] = await db.query(
    'SELECT Hotel_ID, Member_Role FROM Hotel_Member WHERE Employee_ID = ?',
    [employeeId]
  );
  return rows;
}

module.exports = {
  PERMISSIONS,
  ROLES,
  hasPermission,
  isBanned,
  requirePermission,
  requireAnyPermission,
  assertOwnership,
  ownershipFilter,
  isStaff,
  isHotelMember,
  ensureHotelOwnerColumn,
  isHotelOwner,
  hotelPermission,
  listHotelMembers,
  addHotelMember,
  updateHotelMemberRole,
  removeHotelMember,
  memberOfHotels
};
