const jwt = require('jsonwebtoken');
const db = require('../config/db');
const sessionStore = require('../utils/sessionStore');
const userAccounts = require('../utils/userAccounts');
const auditLog = require('../utils/auditLog');
const { getLoginLockout } = require('../utils/loginProtection');
const {
  JWT_SECRET,
  TOKEN_TTL,
  hashPassword,
  verifyPassword,
  signAccessToken
} = require('../utils/passwordSecurity');

/**
 * Auth controller.
 *
 * Security rules:
 * - Passwords are hashed with bcrypt (+ server-side pepper), never stored in plain text.
 * - Access tokens are signed JWTs with a short lifetime (<= 15 min), containing user id and role.
 * - No hardcoded credentials, no plaintext fallback passwords, no bypass shortcuts.
 * - Failed logins return a generic 401; repeated failures are temporarily blocked.
 */

const GENERIC_ERROR = 'Invalid credentials';

// In-memory failed password-change attempts: key = userType:id:ip
const failedAttempts = new Map();
setInterval(() => failedAttempts.clear(), 30 * 60 * 1000).unref?.();

/** Issue a short-lived access token containing user id and role. */
const issueToken = (id, role, type, extra = {}) =>
  signAccessToken({ id, role, type, ...extra });

const REFRESH_COOKIE = 'hms_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/auth'
};

const setRefreshCookie = (res, raw, expires) =>
  res.cookie(REFRESH_COOKIE, raw, { ...COOKIE_OPTS, expires });
const clearRefreshCookie = (res) =>
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_OPTS.path });

// Staff Portal Login (Admin, Manager, Receptionist)
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const inputUser = String(username).trim();
    const inputPass = String(password);
    const lockout = await getLoginLockout(req, inputUser);
    if (lockout.locked) {
      res.set('Retry-After', String(lockout.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many failed login attempts. Try again later.' });
    }

    // Look the employee up by username or email, then verify the password hash in code.
    const [employees] = await db.query(
      `SELECT Employee_ID, Full_Name, Designation, Role, Username, Password, Email
       FROM Employee
       WHERE LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?)`,
      [inputUser, inputUser]
    );

    if (employees.length === 0) {
      await auditLog.record(req, 'login.failed', {
        userType: 'Employee',
        attemptHash: auditLog.hashIdentifier(inputUser),
        details: 'Invalid staff credentials'
      });
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const emp = employees[0];

    const verified = await verifyPassword(inputPass, emp.Password);
    const ok = verified === true || (verified && verified.ok);
    if (!ok) {
      await auditLog.record(req, 'login.failed', {
        userType: 'Employee',
        userId: emp.Employee_ID,
        attemptHash: auditLog.hashIdentifier(inputUser),
        details: 'Invalid staff credentials'
      });
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Transparently upgrade legacy plain-text passwords to hashed values.
    if (verified && verified.upgraded) {
      await db.query('UPDATE Employee SET Password = ? WHERE Employee_ID = ?', [verified.upgraded, emp.Employee_ID]);
    }

    // Banned users are refused at login and on every subsequent request.
    if (await userAccounts.isBanned('Employee', emp.Employee_ID)) {
      return res.status(403).json({ error: 'Your account is banned' });
    }

    // The DB-stored role (User_Account) is authoritative, falling back to the
    // Employee table's Role column.
    let account = await userAccounts.getAccount('Employee', emp.Employee_ID, false);
    if (!account) {
      account = await userAccounts.getAccount(
        'Employee',
        emp.Employee_ID,
        true,
        emp.Role || emp.Designation || 'Receptionist'
      );
    }
    const role = account.Role;
    // Start a server-side session (httpOnly refresh cookie)
    const session = await sessionStore.createSession(
      'Employee', emp.Employee_ID,
      req.headers['user-agent'], req.ip
    );
    const token = issueToken(emp.Employee_ID, role, 'Employee', {
      sid: session.id,
      username: emp.Username || emp.Email,
      name: emp.Full_Name
    });
    setRefreshCookie(res, session.raw, session.expires);
    await auditLog.record(req, 'login.success', {
      userType: 'Employee',
      userId: emp.Employee_ID
    });

    res.json({
      message: 'Staff login successful',
      token,
      user: {
        id: emp.Employee_ID,
        username: emp.Username || emp.Email,
        role,
        name: emp.Full_Name
      }
    });
  } catch (err) {
    next(err);
  }
};

// Customer / Guest Login using Email ID or Username & Password
exports.guestLogin = async (req, res, next) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'Email ID / Username and Password are required' });
    }

    const inputUser = String(emailOrUsername).trim();
    const inputPass = String(password);
    const lockout = await getLoginLockout(req, inputUser);
    if (lockout.locked) {
      res.set('Retry-After', String(lockout.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many failed login attempts. Try again later.' });
    }

    const [guests] = await db.query(
      `SELECT Guest_ID, Full_Name, Phone_Number, Email, Username, Password
       FROM Guest
       WHERE LOWER(Email) = LOWER(?) OR LOWER(Phone_Number) = LOWER(?) OR LOWER(Username) = LOWER(?)`,
      [inputUser, inputUser, inputUser]
    );

    if (guests.length === 0) {
      await auditLog.record(req, 'login.failed', {
        userType: 'Guest',
        attemptHash: auditLog.hashIdentifier(inputUser),
        details: 'Invalid guest credentials'
      });
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const guest = guests[0];

    const verified = await verifyPassword(inputPass, guest.Password);
    const ok = verified === true || (verified && verified.ok);
    if (!ok) {
      await auditLog.record(req, 'login.failed', {
        userType: 'Guest',
        userId: guest.Guest_ID,
        attemptHash: auditLog.hashIdentifier(inputUser),
        details: 'Invalid guest credentials'
      });
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Transparently upgrade legacy plain-text passwords to hashed values.
    if (verified && verified.upgraded) {
      await db.query('UPDATE Guest SET Password = ? WHERE Guest_ID = ?', [verified.upgraded, guest.Guest_ID]);
    }

    // Banned users are refused at login and on every subsequent request.
    if (await userAccounts.isBanned('Guest', guest.Guest_ID)) {
      return res.status(403).json({ error: 'Your account is banned' });
    }

    // Start a server-side session (httpOnly refresh cookie)
    const session = await sessionStore.createSession(
      'Guest', guest.Guest_ID,
      req.headers['user-agent'], req.ip
    );
    const token = issueToken(guest.Guest_ID, 'Guest', 'Guest', {
      sid: session.id,
      username: guest.Email || guest.Phone_Number,
      name: guest.Full_Name
    });
    setRefreshCookie(res, session.raw, session.expires);
    await auditLog.record(req, 'login.success', {
      userType: 'Guest',
      userId: guest.Guest_ID
    });

    res.json({
      message: 'Customer login successful',
      token,
      user: {
        id: guest.Guest_ID,
        username: guest.Email || guest.Phone_Number,
        role: 'Guest',
        name: guest.Full_Name
      }
    });
  } catch (err) {
    next(err);
  }
};

// Helper: make sure Profile_Image column exists on both tables
const ensureImageColumn = async () => {
  for (const table of ['Employee', 'Guest']) {
    const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'Profile_Image'`);
    if (!columns.length) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN Profile_Image LONGTEXT`);
    }
  }
};

// Get unified profile info for the logged-in user (staff or guest)
exports.getProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (Number(id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only view your own profile' });
    }
    await ensureImageColumn();

    if (req.user.type === 'Employee') {
      const [rows] = await db.query(
        `SELECT Employee_ID AS id, Full_Name AS name, Username, Role, Designation, Email,
                Joining_Date AS joined, Employment_Status, Profile_Image
         FROM Employee WHERE Employee_ID = ?`,
        [id]
      );
      if (rows.length === 0) {
        return res.json({ profile: null });
      }
      const p = rows[0];
      return res.json({ profile: { ...p, role: p.Role, phone: null } });
    }

    const [rows] = await db.query(
      `SELECT Guest_ID AS id, Full_Name AS name, Username, Phone_Number AS phone, Email,
              Address, Nationality, Identification_Number AS identification,
              Registration_Date AS joined, Profile_Image
       FROM Guest WHERE Guest_ID = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.json({ profile: null });
    }
    return res.json({ profile: { ...rows[0], role: 'Guest' } });
  } catch (err) {
    next(err);
  }
};

// Change password using the old password (works for staff & guests)
exports.changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const { id, type } = req.user;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'oldPassword and newPassword are required' });
    }
    if (String(newPassword).length < 12 ||
        !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 12 characters and contain a letter and a number' });
    }

    const isGuest = type === 'Guest';
    const table = isGuest ? 'Guest' : 'Employee';
    const pk = isGuest ? 'Guest_ID' : 'Employee_ID';
    const userType = isGuest ? 'Guest' : 'Employee';

    // --- Failed-attempt tracking (server side, in-memory per account+IP) ---
    const key = `${userType}:${id}:${req.ip || 'unknown'}`;
    const attempt = failedAttempts.get(key) || { count: 0, firstAt: Date.now(), lockedUntil: 0 };

    // Lock out for 15 minutes after 5 failed attempts within 15 minutes.
    if (attempt.lockedUntil > Date.now()) {
      const mins = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} minute(s).` });
    }
    if (Date.now() - attempt.firstAt > 15 * 60 * 1000) {
      attempt.count = 0;
      attempt.firstAt = Date.now();
    }

    const [rows] = await db.query(`SELECT Password FROM ${table} WHERE ${pk} = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const verified = await verifyPassword(oldPassword, rows[0].Password);
    const oldOk = verified === true || (verified && verified.ok);
    if (!oldOk) {
      attempt.count += 1;
      if (attempt.count >= 5) {
        attempt.lockedUntil = Date.now() + 15 * 60 * 1000;
        attempt.count = 0;
      }
      failedAttempts.set(key, attempt);
      await auditLog.record(req, 'password.change.failed', {
        userType,
        userId: id,
        details: 'Incorrect current password'
      });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    failedAttempts.delete(key);

    // New password must not equal the current one and must meet minimum strength.
    if (String(newPassword) === String(oldPassword)) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }
    // Store the new password hashed (+ pepper), never in plain text.
    const hashed = await hashPassword(newPassword);
    await db.query(`UPDATE ${table} SET Password = ? WHERE ${pk} = ?`, [hashed, id]);

    // Security: a password change invalidates every existing session.
    const revoked = await sessionStore.revokeAllSessions(userType, id);
    clearRefreshCookie(res);
    await auditLog.record(req, 'password.change', { userType, userId: id });

    res.json({ message: 'Password updated successfully. Please log in again.', sessionsRevoked: revoked });
  } catch (err) {
    next(err);
  }
};

// Update profile: name and/or profile image (base64 data URL or URL string)
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, image } = req.body;
    const { id, type } = req.user;
    if (!name && image === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const isGuest = type === 'Guest';
    const table = isGuest ? 'Guest' : 'Employee';
    const pk = isGuest ? 'Guest_ID' : 'Employee_ID';
    const nameCol = 'Full_Name';

    await ensureImageColumn();

    const sets = [];
    const params = [];
    if (name) { sets.push(`${nameCol} = ?`); params.push(name); }
    if (image !== undefined) {
      if (image && image.length > 3_000_000) {
        return res.status(400).json({ error: 'Image is too large. Please use an image under ~2MB.' });
      }
      sets.push('Profile_Image = ?');
      params.push(image || null);
    }
    params.push(id);

    await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${pk} = ?`, params);
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    // Revoke the server-side session so the refresh cookie becomes useless.
    const raw = req.cookies && req.cookies[REFRESH_COOKIE];
    if (raw) {
      const session = await sessionStore.findSession(raw);
      await sessionStore.revokeByRawToken(raw);
      if (session) {
        await auditLog.record(req, 'logout', {
          userType: session.User_Type,
          userId: session.User_ID
        });
      }
    }
    clearRefreshCookie(res);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// Issue a fresh access token from the httpOnly refresh cookie (rotating the refresh token).
exports.refresh = async (req, res, next) => {
  try {
    const raw = req.cookies && req.cookies[REFRESH_COOKIE];
    const row = await sessionStore.findSession(raw);

    if (!row) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Reuse of an already-rotated token is treated as theft — revoke everything.
    if (raw && row.Replaced_By) {
      await sessionStore.revokeAllSessions(row.User_Type, row.User_ID);
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Session reuse detected; all sessions revoked' });
    }

    await sessionStore.touchSession(row.Token_ID);

    // Look up the current role/name so the new access token is accurate.
    const isGuest = row.User_Type === 'Guest';
    const table = isGuest ? 'Guest' : 'Employee';
    const pk = isGuest ? 'Guest_ID' : 'Employee_ID';
    const [users] = await db.query(
      `SELECT ${pk} AS id, Full_Name AS name, ${isGuest ? "Email" : "Username, Email, Role, Designation"} FROM ${table} WHERE ${pk} = ?`,
      [row.User_ID]
    );
    if (users.length === 0) {
      await sessionStore.revokeByRawToken(raw);
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Account no longer exists' });
    }

    // A banned user is rejected on the very next refresh.
    const userType = isGuest ? 'Guest' : 'Employee';
    if (await userAccounts.isBanned(userType, row.User_ID)) {
      await sessionStore.revokeAllSessions(userType, row.User_ID);
      clearRefreshCookie(res);
      return res.status(403).json({ error: 'Your account is banned' });
    }

    const u = users[0];
    // DB-stored role is authoritative on refresh too.
    let account = await userAccounts.getAccount(userType, row.User_ID, false);
    if (!account) {
      account = await userAccounts.getAccount(
        userType,
        row.User_ID,
        true,
        isGuest ? 'Guest' : (u.Role || u.Designation || 'Receptionist')
      );
    }
    const role = account.Role;
    // Rotate: revoke this refresh token, issue a new one.
    const next = await sessionStore.rotateSession(row, req.headers['user-agent'], req.ip);
    setRefreshCookie(res, next.raw, next.expires);
    const token = issueToken(u.id, role, userType, {
      sid: next.id,
      username: isGuest ? (u.Email || '') : (u.Username || u.Email),
      name: u.name
    });

    res.json({
      token,
      user: { id: u.id, role, name: u.name, username: isGuest ? (u.Email || '') : (u.Username || u.Email) }
    });
  } catch (err) {
    next(err);
  }
};

// List the logged-in user's active sessions (other devices).

exports.getMe = (req, res) => {
  res.json({ user: req.user });
};

// List the logged-in user's active sessions (other devices).
exports.listSessions = async (req, res, next) => {
  try {
    const isGuest = req.user.type === 'Guest';
    const sessions = await sessionStore.listSessions(
      isGuest ? 'Guest' : 'Employee', req.user.id
    );
    // Flag the session matching the current refresh cookie.
    const currentRaw = req.cookies && req.cookies[REFRESH_COOKIE];
    let currentId = null;
    if (currentRaw) {
      const row = await sessionStore.findSession(currentRaw);
      currentId = row ? row.Token_ID : null;
    }
    res.json({
      sessions: sessions.map((s) => ({
        id: s.Token_ID,
        device: s.User_Agent,
        ip: s.IP_Address,
        created: s.Created_At,
        lastUsed: s.Last_Used_At,
        expires: s.Expires_At,
        current: s.Token_ID === currentId
      }))
    });
  } catch (err) {
    next(err);
  }
};

// Revoke one of the user's own sessions.
exports.revokeSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isGuest = req.user.type === 'Guest';
    const revoked = await sessionStore.revokeSessionById(
      id, isGuest ? 'Guest' : 'Employee', req.user.id
    );
    if (!revoked) {
      return res.status(404).json({ error: 'Session not found or already revoked' });
    }
    // If the user revoked their own current session, drop the cookie too.
    const currentRaw = req.cookies && req.cookies[REFRESH_COOKIE];
    if (currentRaw) {
      const row = await sessionStore.findSession(currentRaw);
      if (!row) clearRefreshCookie(res);
    }
    res.json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
};

// Revoke every active session of the logged-in user ("log out everywhere").
exports.revokeAllSessions = async (req, res, next) => {
  try {
    const isGuest = req.user.type === 'Guest';
    const count = await sessionStore.revokeAllSessions(
      isGuest ? 'Guest' : 'Employee', req.user.id
    );
    clearRefreshCookie(res);
    res.json({ message: `Revoked ${count} session(s)` });
  } catch (err) {
    next(err);
  }
};
