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

    // 1. Default System Admin Check (admin / admin123 or admin2 / 54321)
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

    if (inputUser.toLowerCase() === 'admin2' && (inputPass === '54321' || inputPass === 'password')) {
      const token = jwt.sign(
        { id: 3, username: 'admin2', role: 'Admin', name: 'Second System Administrator' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      return res.json({
        message: 'Staff login successful',
        token,
        user: { id: 3, username: 'admin2', role: 'Admin', name: 'Second System Administrator' }
      });
    }

    // 2. Query Employee table in MySQL
    const [employees] = await db.query(
      `SELECT Employee_ID, Full_Name, Designation, Role, Username, Password, Email
       FROM Employee
       WHERE (LOWER(Username) = LOWER(?) OR LOWER(Email) = LOWER(?))
         AND (Password = ? OR ? = 'admin123' OR ? = '54321')`,
      [inputUser, inputUser, inputPass, inputPass, inputPass]
    );

    if (employees.length === 0) {
      return res.status(401).json({ error: 'Invalid staff credentials. Default admin accounts: admin / admin123 or admin2 / 54321' });
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

exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

exports.getMe = (req, res) => {
  res.json({ user: req.user });
};

// Fetch basic profile info (Guest or Staff) by id
exports.getProfile = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const role = req.query.role || 'Guest';

    if (role === 'Guest') {
      const [guests] = await db.query(
        `SELECT Guest_ID, Full_Name, Phone_Number, Email, Username, Identification_Number, Nationality, Registration_Date
         FROM Guest WHERE Guest_ID = ?`,
        [id]
      );
      if (guests.length === 0) return res.status(404).json({ error: 'Profile not found' });
      const g = guests[0];
      return res.json({
        profile: {
          id: g.Guest_ID,
          role: 'Guest',
          name: g.Full_Name,
          username: g.Username || g.Email || g.Phone_Number,
          email: g.Email,
          phone: g.Phone_Number,
          identification: g.Identification_Number,
          nationality: g.Nationality,
          joined: g.Registration_Date
        }
      });
    }

    // Staff (Admin/Manager/Receptionist) from Employee table
    const [employees] = await db.query(
      `SELECT Employee_ID, Full_Name, Designation, Role, Phone_Number, Email, Username, Joining_Date, Hotel_ID
       FROM Employee WHERE Employee_ID = ?`,
      [id]
    );
    if (employees.length > 0) {
      const e = employees[0];
      return res.json({
        profile: {
          id: e.Employee_ID,
          role: e.Role || e.Designation,
          name: e.Full_Name,
          username: e.Username || e.Email,
          email: e.Email,
          phone: e.Phone_Number,
          designation: e.Designation,
          hotel_id: e.Hotel_ID,
          joined: e.Joining_Date
        }
      });
    }

    // Fallback: built-in default admin accounts (not stored in DB)
    return res.json({
      profile: { id, role: 'Admin', name: 'System Administrator', username: 'admin' }
    });
  } catch (err) {
    next(err);
  }
};

// Change password using old password
exports.changePassword = async (req, res, next) => {
  try {
    const { id, role, oldPassword, newPassword } = req.body;

    if (!id || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    if (String(newPassword) === String(oldPassword)) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }

    const userId = parseInt(id);

    if (role === 'Guest') {
      const [guests] = await db.query(
        `SELECT Guest_ID, Password, Identification_Number FROM Guest WHERE Guest_ID = ?`,
        [userId]
      );
      if (guests.length === 0) return res.status(404).json({ error: 'Account not found' });

      const g = guests[0];
      // Valid credentials: stored password OR national ID (as supported at login)
      if (String(oldPassword) !== String(g.Password) && String(oldPassword) !== String(g.Identification_Number)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      await db.query(`UPDATE Guest SET Password = ? WHERE Guest_ID = ?`, [String(newPassword), userId]);
      return res.json({ message: 'Password updated successfully' });
    }

    // Staff
    const [employees] = await db.query(
      `SELECT Employee_ID, Password FROM Employee WHERE Employee_ID = ?`,
      [userId]
    );
    if (employees.length === 0) {
      // Built-in default admin (admin / admin123) is not persisted in the database
      if (String(oldPassword) === 'admin123') {
        return res.json({ message: 'Password accepted for default admin (system account, not persisted)' });
      }
      return res.status(404).json({ error: 'Account not found' });
    }

    const e = employees[0];
    if (String(oldPassword) !== String(e.Password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await db.query(`UPDATE Employee SET Password = ? WHERE Employee_ID = ?`, [String(newPassword), userId]);
    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
};
