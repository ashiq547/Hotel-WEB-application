const jwt = require('jsonwebtoken');
const db = require('../config/db');
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
 * - Failed logins always return 401 with a generic message.
 */

const GENERIC_ERROR = 'Invalid credentials';

/** Issue a short-lived access token containing user id and role. */
const issueToken = (id, role, extra = {}) =>
  signAccessToken({ id, role, ...extra });

// Staff Portal Login (Admin, Manager, Receptionist)
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const inputUser = String(username).trim();
    const inputPass = String(password);

    // Look the employee up by username or email, then verify the password hash in code.
    const [employees] = await db.query(
      `SELECT Employee_ID, Full_Name, Designation, Role, Username, Password, Email
       FROM Employee
       WHERE LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?)`,
      [inputUser, inputUser]
    );

    if (employees.length === 0) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const emp = employees[0];

    const verified = await verifyPassword(inputPass, emp.Password);
    const ok = verified === true || (verified && verified.ok);
    if (!ok) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Transparently upgrade legacy plain-text passwords to hashed values.
    if (verified && verified.upgraded) {
      await db.query('UPDATE Employee SET Password = ? WHERE Employee_ID = ?', [verified.upgraded, emp.Employee_ID]);
    }

    const role = emp.Role || emp.Designation || 'Receptionist';
    const token = issueToken(emp.Employee_ID, role, {
      username: emp.Username || emp.Email,
      name: emp.Full_Name
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

    const [guests] = await db.query(
      `SELECT Guest_ID, Full_Name, Phone_Number, Email, Username, Password
       FROM Guest
       WHERE LOWER(Email) = LOWER(?) OR LOWER(Phone_Number) = LOWER(?) OR LOWER(Username) = LOWER(?)`,
      [inputUser, inputUser, inputUser]
    );

    if (guests.length === 0) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const guest = guests[0];

    const verified = await verifyPassword(inputPass, guest.Password);
    const ok = verified === true || (verified && verified.ok);
    if (!ok) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // Transparently upgrade legacy plain-text passwords to hashed values.
    if (verified && verified.upgraded) {
      await db.query('UPDATE Guest SET Password = ? WHERE Guest_ID = ?', [verified.upgraded, guest.Guest_ID]);
    }

    const token = issueToken(guest.Guest_ID, 'Guest', {
      username: guest.Email || guest.Phone_Number,
      name: guest.Full_Name
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
  try { await db.query('ALTER TABLE Employee ADD COLUMN Profile_Image LONGTEXT'); } catch (e) {}
  try { await db.query('ALTER TABLE Guest ADD COLUMN Profile_Image LONGTEXT'); } catch (e) {}
};

// Get unified profile info for the logged-in user (staff or guest)
exports.getProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = req.query.role || (req.user && req.user.role) || 'Guest';
    await ensureImageColumn();

    if (String(role).toLowerCase() !== 'guest') {
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
    const { id, role, oldPassword, newPassword } = req.body;
    if (!id || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'id, oldPassword and newPassword are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const isGuest = String(role).toLowerCase() === 'guest';
    const table = isGuest ? 'Guest' : 'Employee';
    const pk = isGuest ? 'Guest_ID' : 'Employee_ID';

    const [rows] = await db.query(`SELECT Password FROM ${table} WHERE ${pk} = ?`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const verified = await verifyPassword(oldPassword, rows[0].Password);
    const oldOk = verified === true || (verified && verified.ok);
    if (!oldOk) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Store the new password hashed (+ pepper), never in plain text.
    const hashed = await hashPassword(newPassword);
    await db.query(`UPDATE ${table} SET Password = ? WHERE ${pk} = ?`, [hashed, id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
};

// Update profile: name and/or profile image (base64 data URL or URL string)
exports.updateProfile = async (req, res, next) => {
  try {
    const { id, role } = req.body;
    const { name, image } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!name && image === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const isGuest = String(role).toLowerCase() === 'guest';
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

exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

exports.getMe = (req, res) => {
  res.json({ user: req.user });
};
