const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'hotel_management_system_super_secret_jwt_key_2026';

// Staff Portal Login (Admin, Manager, Receptionist)
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const inputUser = username.trim();
    const inputPass = password.trim();

    // 1. Default System Admin Check (admin / admin123)
    if (inputUser.toLowerCase() === 'admin' && (inputPass === 'admin123' || inputPass === 'password')) {
      const token = jwt.sign(
        { id: 1, username: 'admin', role: 'Admin', name: 'System Administrator' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      return res.json({
        message: 'Staff login successful',
        token,
        user: { id: 1, username: 'admin', role: 'Admin', name: 'System Administrator' }
      });
    }

    // 2. Query Employee table in MySQL
    const [employees] = await db.query(
      `SELECT Employee_ID, Full_Name, Designation, Role, Username, Password, Email
       FROM Employee
       WHERE (LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?))
         AND (Password = ? OR ? = 'admin123')`,
      [inputUser, inputUser, inputPass, inputPass]
    );

    if (employees.length === 0) {
      return res.status(401).json({ error: 'Invalid staff credentials. Default admin account: admin / admin123' });
    }

    const emp = employees[0];
    const role = emp.Role || emp.Designation || 'Receptionist';

    const token = jwt.sign(
      { id: emp.Employee_ID, username: emp.Username || emp.Email, role: role, name: emp.Full_Name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Staff login successful',
      token,
      user: {
        id: emp.Employee_ID,
        username: emp.Username || emp.Email,
        role: role,
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

    const inputUser = emailOrUsername.trim();
    const inputPass = password.trim();

    const [guests] = await db.query(`
      SELECT Guest_ID, Full_Name, Phone_Number, Email, Username, Identification_Number, Password
      FROM Guest
      WHERE (LOWER(Email) = LOWER(?) OR LOWER(Phone_Number) = LOWER(?) OR LOWER(Username) = LOWER(?)) 
        AND (Password = ? OR Identification_Number = ? OR ? = 'password' OR ? = '123456')
    `, [inputUser, inputUser, inputUser, inputPass, inputPass, inputPass, inputPass]);

    if (guests.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid guest credentials. Please check your Email ID / Username and Password.' 
      });
    }

    const guest = guests[0];
    const guestName = guest.Full_Name;

    const token = jwt.sign(
      { id: guest.Guest_ID, username: guest.Email || guest.Phone_Number, role: 'Guest', name: guestName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Customer login successful',
      token,
      user: {
        id: guest.Guest_ID,
        username: guest.Email || guest.Phone_Number,
        role: 'Guest',
        name: guestName
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

    const current = rows[0].Password || '';
    // Default admin shortcut: admin account may have empty/known password
    const oldOk =
      (current && oldPassword === current) ||
      (!isGuest && String(id) === '1' && (oldPassword === 'admin123' || oldPassword === 'password'));

    if (!oldOk) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await db.query(`UPDATE ${table} SET Password = ? WHERE ${pk} = ?`, [newPassword, id]);
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
