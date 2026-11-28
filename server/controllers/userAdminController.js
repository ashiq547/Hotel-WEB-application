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
const auditLog = require('../utils/auditLog');
const rbac = require('../utils/rbac');

const VALID_ROLES = ['Guest', 'Receptionist', 'Manager', 'Admin'];

/** Resolve the DB user-type for an acting user (guest vs employee). */
function userTypeOf(req) {
  return req.user.type;
}

async function findTarget(type, id) {
  if (!['guest', 'employee'].includes(type)) return null;
  const isGuest = type === 'guest';
  const userType = isGuest ? 'Guest' : 'Employee';
  const table = isGuest ? 'Guest' : 'Employee';
  const key = isGuest ? 'Guest_ID' : 'Employee_ID';
  const [rows] = await db.query(
    `SELECT ${key}${isGuest ? '' : ', Role'} FROM ${table} WHERE ${key} = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  await userAccounts.getAccount(
    userType,
    Number(id),
    true,
    isGuest ? 'Guest' : (rows[0].Role || 'Receptionist')
  );
  return userType;
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
    const targetId = Number(id);
    const userType = await findTarget(type, targetId);
    if (!userType || !Number.isInteger(targetId) || targetId < 1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validRoles = userType === 'Guest'
      ? ['Guest']
      : VALID_ROLES.filter((candidate) => candidate !== 'Guest');
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${validRoles.join(', ')}` });
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
    if (userType === 'Employee') {
      await db.query('UPDATE Employee SET Role = ? WHERE Employee_ID = ?', [role, targetId]);
    }

    // Role change takes effect immediately: revoke the target's sessions so
    // their next request re-authenticates with the new role.
    await sessionStore.revokeAllSessions(userType, targetId);
    await auditLog.record(req, 'role.change', {
      userType: userTypeOf(req),
      userId: req.user.id,
      targetType: userType,
      targetId,
      details: `Role changed to ${role}`
    });

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
    const targetId = Number(id);
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 255) {
      return res.status(400).json({ error: 'A ban reason of 1 to 255 characters is required' });
    }
    const userType = await findTarget(type, targetId);
    if (!userType || !Number.isInteger(targetId) || targetId < 1) {
      return res.status(404).json({ error: 'User not found' });
    }

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
    await auditLog.record(req, 'user.ban', {
      userType: userTypeOf(req),
      userId: req.user.id,
      targetType: userType,
      targetId,
      details: reason
    });

    res.json({ message: 'User banned' });
  } catch (err) {
    next(err);
  }
};

// Unban a user
exports.unbanUser = async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const targetId = Number(id);
    const userType = await findTarget(type, targetId);
    if (!userType || !Number.isInteger(targetId) || targetId < 1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const unbanned = await userAccounts.unbanUser(userType, targetId);
    if (!unbanned) {
      return res.status(409).json({ error: 'User is not banned' });
    }
    await auditLog.record(req, 'user.unban', {
      userType: userTypeOf(req),
      userId: req.user.id,
      targetType: userType,
      targetId
    });
    res.json({ message: 'User unbanned' });
  } catch (err) {
    next(err);
  }
};

exports.getAuditLog = async (req, res, next) => {
  try {
    await auditLog.ensureTable();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
    const offset = (page - 1) * pageSize;
    const { event, search } = req.query;
    const filters = [];
    const params = [];
    if (event) {
      filters.push('a.Event_Type = ?');
      params.push(String(event).slice(0, 50));
    }
    if (search) {
      const term = `%${String(search).slice(0, 100)}%`;
      filters.push('(a.IP_Address LIKE ? OR a.Details LIKE ? OR CAST(a.User_ID AS CHAR) LIKE ?)');
      params.push(term, term, term);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM Audit_Log a ${where}`, params);
    const [events] = await db.query(
      `SELECT a.Audit_ID, a.Event_Type, a.User_Type, a.User_ID, a.Target_Type, a.Target_ID,
              a.Details, a.IP_Address, a.User_Agent, a.Created_At
       FROM Audit_Log a ${where}
       ORDER BY a.Audit_ID DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ events, page, pageSize, total: count.total });
  } catch (err) {
    next(err);
  }
};

exports.getSecuritySummary = async (req, res, next) => {
  try {
    await auditLog.ensureTable();
    const [byIp] = await db.query(`
      SELECT IP_Address, COUNT(*) AS Failed_Logins, MAX(Created_At) AS Last_Attempt
      FROM Audit_Log
      WHERE Event_Type = 'login.failed' AND Created_At >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY IP_Address
      ORDER BY Failed_Logins DESC
      LIMIT 50
    `);
    const [byAccount] = await db.query(`
      SELECT Attempt_Hash, COUNT(*) AS Failed_Logins, MAX(Created_At) AS Last_Attempt
      FROM Audit_Log
      WHERE Event_Type = 'login.failed' AND Created_At >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY Attempt_Hash
      ORDER BY Failed_Logins DESC
      LIMIT 50
    `);
    res.json({ byIp, byAccount });
  } catch (err) {
    next(err);
  }
};

exports.bulkUpdateUsers = async (req, res, next) => {
  try {
    const { action, users, reason } = req.body;
    if (!['ban', 'unban'].includes(action) || !Array.isArray(users) || users.length < 1 || users.length > 100) {
      return res.status(400).json({ error: 'Provide an action and between 1 and 100 users' });
    }
    if (action === 'ban' && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 255)) {
      return res.status(400).json({ error: 'A ban reason of 1 to 255 characters is required' });
    }

    const targets = [];
    for (const candidate of users) {
      const id = Number(candidate.id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Each user must have a valid numeric id' });
      }
      const type = String(candidate.type || '').toLowerCase();
      const userType = await findTarget(type, id);
      if (!userType) {
        return res.status(404).json({ error: `User ${type}:${id} not found` });
      }
      const account = await userAccounts.getAccount(userType, id, false);
      if (action === 'ban' && account.Role === 'Admin') {
        return res.status(403).json({ error: 'An admin cannot ban another admin' });
      }
      targets.push({ type: userType, id });
    }

    const uniqueTargets = [...new Map(targets.map((target) => [`${target.type}:${target.id}`, target])).values()];
    const results = [];
    for (const target of uniqueTargets) {
      const changed = action === 'ban'
        ? await userAccounts.banUser(target.type, target.id, reason.trim(), req.user.id)
        : await userAccounts.unbanUser(target.type, target.id);
      if (changed) {
        await sessionStore.revokeAllSessions(target.type, target.id);
        await auditLog.record(req, action === 'ban' ? 'user.ban' : 'user.unban', {
          userType: userTypeOf(req),
          userId: req.user.id,
          targetType: target.type,
          targetId: target.id,
          details: action === 'ban' ? reason.trim() : 'Bulk unban'
        });
      }
      results.push({ ...target, changed });
    }
    res.json({ results });
  } catch (err) {
    next(err);
  }
};

exports.getUserDetail = async (req, res, next) => {
  try {
    const { type } = req.params;
    const id = Number(req.params.id);
    const userType = await findTarget(type, id);
    if (!userType || !Number.isInteger(id) || id < 1) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile;
    let records;
    let groups = [];
    if (userType === 'Guest') {
      const [[row]] = await db.query(
        'SELECT Guest_ID AS id, Full_Name, Email, Username, Phone_Number, Registration_Date FROM Guest WHERE Guest_ID = ?',
        [id]
      );
      profile = row;
      const [rows] = await db.query(
        `SELECT Reservation_ID, Room_ID, Check_In_Date, Check_Out_Date, Reservation_Status
         FROM Reservation WHERE Guest_ID = ? ORDER BY Reservation_ID DESC LIMIT 100`,
        [id]
      );
      records = rows;
    } else {
      const [[row]] = await db.query(
        'SELECT Employee_ID AS id, Full_Name, Email, Username, Role, Designation, Hotel_ID, Joining_Date FROM Employee WHERE Employee_ID = ?',
        [id]
      );
      profile = row;
      groups = await rbac.memberOfHotels(id);
      records = [];
    }
    const sessions = await sessionStore.listSessions(userType, id);
    await auditLog.ensureTable();
    const [activity] = await db.query(
      `SELECT Audit_ID, Event_Type, Details, IP_Address, Created_At
       FROM Audit_Log WHERE (User_Type = ? AND User_ID = ?)
          OR (Target_Type = ? AND Target_ID = ?)
       ORDER BY Audit_ID DESC LIMIT 25`,
      [userType, id, userType, id]
    );
    res.json({ profile, records, groups, sessions, activity });
  } catch (err) {
    next(err);
  }
};

exports.getModerationContent = async (req, res, next) => {
  try {
    const { kind, search = '' } = req.query;
    const term = `%${String(search).slice(0, 100)}%`;
    if (kind === 'reservations') {
      const [records] = await db.query(
        `SELECT r.Reservation_ID AS id, r.Reservation_Status AS status, r.Check_In_Date, r.Check_Out_Date,
                g.Full_Name AS guest, h.Hotel_Name AS hotel, rm.Room_Number
         FROM Reservation r JOIN Guest g ON r.Guest_ID = g.Guest_ID
         JOIN Room rm ON r.Room_ID = rm.Room_ID JOIN Hotel h ON rm.Hotel_ID = h.Hotel_ID
         WHERE g.Full_Name LIKE ? OR h.Hotel_Name LIKE ? OR CAST(r.Reservation_ID AS CHAR) LIKE ?
         ORDER BY r.Reservation_ID DESC LIMIT 200`,
        [term, term, term]
      );
      return res.json({ kind, records });
    }
    if (kind === 'hotels') {
      const [records] = await db.query(
        `SELECT Hotel_ID AS id, Hotel_Name AS name, City,
                (SELECT COUNT(*) FROM Room r WHERE r.Hotel_ID = h.Hotel_ID) AS rooms
         FROM Hotel h WHERE Hotel_Name LIKE ? OR City LIKE ?
         ORDER BY Hotel_ID DESC LIMIT 200`,
        [term, term]
      );
      return res.json({ kind, records });
    }
    return res.status(400).json({ error: 'kind must be reservations or hotels' });
  } catch (err) {
    next(err);
  }
};

exports.deleteModerationContent = async (req, res, next) => {
  let connection;
  try {
    const { kind, ids } = req.body;
    if (!['reservations', 'hotels'].includes(kind) || !Array.isArray(ids) || ids.length < 1 || ids.length > 100) {
      return res.status(400).json({ error: 'Provide a supported content kind and 1 to 100 ids' });
    }
    const targetIds = [...new Set(ids.map(Number))];
    if (targetIds.some((id) => !Number.isInteger(id) || id < 1)) {
      return res.status(400).json({ error: 'Content ids must be positive integers' });
    }

    connection = await db.getConnection();
    const deleted = [];
    const blocked = [];
    for (const id of targetIds) {
      await connection.beginTransaction();
      try {
        if (kind === 'reservations') {
          const [rows] = await connection.query('SELECT Room_ID FROM Reservation WHERE Reservation_ID = ?', [id]);
          if (!rows.length) {
            blocked.push({ id, reason: 'not found' });
            await connection.rollback();
            continue;
          }
          const [[counts]] = await connection.query(
            `SELECT
              (SELECT COUNT(*) FROM Bill WHERE Reservation_ID = ?) AS bills,
              (SELECT COUNT(*) FROM Service_Record sr
               JOIN Bill b ON sr.Bill_ID = b.Bill_ID
               WHERE b.Reservation_ID = ?) AS services`,
            [id, id]
          );
          if (counts.bills || counts.services) {
            blocked.push({ id, reason: 'linked billing or service history' });
            await connection.rollback();
            continue;
          }
          await connection.query('DELETE FROM Reservation WHERE Reservation_ID = ?', [id]);
          await connection.query("UPDATE Room SET Availability_Status = 'Available' WHERE Room_ID = ?", [rows[0].Room_ID]);
        } else {
          const [[counts]] = await connection.query(
            `SELECT
              (SELECT COUNT(*) FROM Employee WHERE Hotel_ID = ?) AS employees,
              (SELECT COUNT(*) FROM Reservation r JOIN Room rm ON r.Room_ID = rm.Room_ID WHERE rm.Hotel_ID = ?) AS reservations`,
            [id, id]
          );
          if (!counts || counts.employees || counts.reservations) {
            blocked.push({ id, reason: counts ? 'hotel still has employees or reservations' : 'not found' });
            await connection.rollback();
            continue;
          }
          await connection.query('DELETE FROM Room WHERE Hotel_ID = ?', [id]);
          await connection.query('DELETE FROM Hotel WHERE Hotel_ID = ?', [id]);
        }
        await connection.commit();
        deleted.push(id);
        await auditLog.record(req, 'content.delete', {
          userType: userTypeOf(req),
          userId: req.user.id,
          targetType: kind,
          targetId: id
        });
      } catch (err) {
        await connection.rollback();
        throw err;
      }
    }
    res.json({ deleted, blocked });
  } catch (err) {
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const csvValue = (value) => {
      let text = String(value == null ? '' : value);
      if (/^[\t\r\n=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const { kind } = req.params;
    let headers;
    let rows;
    if (kind === 'users') {
      rows = await userAccounts.listAccounts();
      const { search, role, status } = req.query;
      if (search) {
        const term = String(search).toLowerCase();
        rows = rows.filter((row) =>
          [row.Name, row.Email, row.User_Ref_ID].some((value) => String(value || '').toLowerCase().includes(term))
        );
      }
      if (role) rows = rows.filter((row) => row.Role === role);
      if (status === 'active' || status === 'banned') {
        rows = rows.filter((row) => Boolean(row.Banned) === (status === 'banned'));
      }
      headers = ['User_Type', 'User_Ref_ID', 'Name', 'Email', 'Role', 'Banned', 'Ban_Reason'];
    } else if (kind === 'records') {
      const [records] = await db.query(
        `SELECT r.Reservation_ID, r.Guest_ID, r.Room_ID, r.Check_In_Date, r.Check_Out_Date, r.Reservation_Status
         FROM Reservation r
         WHERE (? = '' OR r.Reservation_Status = ?)
           AND (? = '' OR CAST(r.Reservation_ID AS CHAR) LIKE ? OR CAST(r.Guest_ID AS CHAR) LIKE ?)
         ORDER BY r.Reservation_ID DESC LIMIT 5000`,
        [
          String(req.query.status || ''),
          String(req.query.status || ''),
          String(req.query.search || ''),
          `%${String(req.query.search || '').slice(0, 100)}%`,
          `%${String(req.query.search || '').slice(0, 100)}%`
        ]
      );
      rows = records;
      headers = ['Reservation_ID', 'Guest_ID', 'Room_ID', 'Check_In_Date', 'Check_Out_Date', 'Reservation_Status'];
    } else if (kind === 'activity') {
      await auditLog.ensureTable();
      const event = String(req.query.event || '');
      const search = `%${String(req.query.search || '').slice(0, 100)}%`;
      const [events] = await db.query(
        `SELECT Event_Type, User_Type, User_ID, Target_Type, Target_ID, Details, IP_Address, User_Agent, Created_At
         FROM Audit_Log
         WHERE (? = '' OR Event_Type = ?)
           AND (? = '%%' OR IP_Address LIKE ? OR Details LIKE ? OR CAST(User_ID AS CHAR) LIKE ?)
         ORDER BY Audit_ID DESC LIMIT 5000`,
        [event, event, search, search, search, search]
      );
      rows = events;
      headers = ['Event_Type', 'User_Type', 'User_ID', 'Target_Type', 'Target_ID', 'Details', 'IP_Address', 'User_Agent', 'Created_At'];
    } else {
      return res.status(400).json({ error: 'kind must be users, records, or activity' });
    }
    const csv = [
      headers.map(csvValue).join(','),
      ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))
    ].join('\r\n');
    await auditLog.record(req, 'export.csv', {
      userType: userTypeOf(req),
      userId: req.user.id,
      details: kind
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    next(err);
  }
};

// Who am I according to the database (authoritative, not the token)?
exports.getMyPermissions = async (req, res, next) => {
  try {
    const userType = userTypeOf(req);
    const role = await userAccounts.getRole(userType, req.user.id, req.user.role);
    const banned = await userAccounts.isBanned(userType, req.user.id);
    let hotelAccess = [];
    if (userType === 'Employee') {
      await rbac.ensureHotelOwnerColumn();
      const [ownedHotels] = await db.query(
        'SELECT Hotel_ID FROM Hotel WHERE Owner_Employee_ID = ?',
        [req.user.id]
      );
      const memberships = await rbac.memberOfHotels(req.user.id);
      const ownerIds = new Set(ownedHotels.map((hotel) => Number(hotel.Hotel_ID)));
      const membershipIds = new Set(memberships.map((membership) => Number(membership.Hotel_ID)));
      hotelAccess = [
        ...memberships.map((membership) => ({
          Hotel_ID: membership.Hotel_ID,
          Member_Role: membership.Member_Role,
          Is_Owner: ownerIds.has(Number(membership.Hotel_ID))
        })),
        ...ownedHotels
          .filter((hotel) => !membershipIds.has(Number(hotel.Hotel_ID)))
          .map((hotel) => ({
          Hotel_ID: hotel.Hotel_ID,
          Member_Role: null,
          Is_Owner: true
          }))
      ];
    }
    res.json({
      user: { id: req.user.id, type: userType },
      role,
      banned,
      permissions: rbac.ROLES[role] || [],
      hotelAccess
    });
  } catch (err) {
    next(err);
  }
};
