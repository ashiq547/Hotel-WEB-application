/**
 * Server-side user account state: roles and bans.
 *
 * Roles are stored in the database, not just in JWTs, so a demotion or ban
 * takes effect on the very next request even if the access token is still valid.
 * The JWT role claim is treated only as a hint; the authoritative role always
 * comes from here.
 */
const db = require('../config/db');

let tableReady = false;
async function ensureTables() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS User_Account (
      User_Account_ID INT AUTO_INCREMENT PRIMARY KEY,
      User_Type VARCHAR(20) NOT NULL,
      User_Ref_ID INT NOT NULL,
      Role VARCHAR(30) NOT NULL DEFAULT 'Guest',
      Banned TINYINT(1) NOT NULL DEFAULT 0,
      Banned_At DATETIME NULL,
      Ban_Reason VARCHAR(255) NULL,
      Banned_By INT NULL,
      UNIQUE KEY uniq_account (User_Type, User_Ref_ID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

/** Get (creating on demand) the account row for a user. */
async function getAccount(userType, userId, createIfMissing = false, defaultRole = null) {
  await ensureTables();
  const [rows] = await db.query(
    'SELECT * FROM User_Account WHERE User_Type = ? AND User_Ref_ID = ?',
    [userType, userId]
  );
  if (rows.length > 0) return rows[0];
  if (!createIfMissing) return null;
  const role = defaultRole || (userType === 'Guest' ? 'Guest' : 'Receptionist');
  await db.query(
    'INSERT IGNORE INTO User_Account (User_Type, User_Ref_ID, Role) VALUES (?, ?, ?)',
    [userType, userId, role]
  );
  const [created] = await db.query(
    'SELECT * FROM User_Account WHERE User_Type = ? AND User_Ref_ID = ?',
    [userType, userId]
  );
  return created[0] || null;
}

/** Authoritative role for a user (falls back to the token hint if no row exists). */
async function getRole(userType, userId, tokenHint) {
  const account = await getAccount(userType, userId);
  if (account) return account.Role;
  return tokenHint || (userType === 'Guest' ? 'Guest' : 'Receptionist');
}

/** True if the user is currently banned. */
async function isBanned(userType, userId) {
  const account = await getAccount(userType, userId);
  return !!(account && account.Banned);
}

/** Ban a user. Returns false if the user was already banned. */
async function banUser(userType, userId, reason, byAdminId) {
  await getAccount(userType, userId, true, userType === 'Guest' ? 'Guest' : 'Receptionist');
  const [result] = await db.query(
    `UPDATE User_Account SET Banned = 1, Banned_At = NOW(), Ban_Reason = ?, Banned_By = ?
     WHERE User_Type = ? AND User_Ref_ID = ? AND Banned = 0`,
    [reason || null, byAdminId || null, userType, userId]
  );
  return result.affectedRows > 0;
}

/** Lift a ban. Returns false if the user was not banned. */
async function unbanUser(userType, userId) {
  const [result] = await db.query(
    `UPDATE User_Account SET Banned = 0, Banned_At = NULL, Ban_Reason = NULL, Banned_By = NULL
     WHERE User_Type = ? AND User_Ref_ID = ? AND Banned = 1`,
    [userType, userId]
  );
  return result.affectedRows > 0;
}

/** Change a user's role. Banned users keep their role until unbanned. */
async function setRole(userType, userId, newRole) {
  await getAccount(userType, userId, true, newRole);
  await db.query(
    'UPDATE User_Account SET Role = ? WHERE User_Type = ? AND User_Ref_ID = ?',
    [newRole, userType, userId]
  );
}

/** List all accounts (for the admin user-management panel). */
async function listAccounts() {
  await ensureTables();
  const [rows] = await db.query(
    `SELECT ua.User_Account_ID, ua.User_Type, ua.User_Ref_ID, ua.Role, ua.Banned,
            ua.Banned_At, ua.Ban_Reason,
            COALESCE(g.Full_Name, e.Full_Name) AS Name,
            COALESCE(g.Email, e.Email) AS Email
     FROM User_Account ua
     LEFT JOIN Guest g ON ua.User_Type = 'Guest' AND ua.User_Ref_ID = g.Guest_ID
     LEFT JOIN Employee e ON ua.User_Type = 'Employee' AND ua.User_Ref_ID = e.Employee_ID
     ORDER BY ua.User_Account_ID DESC`
  );
  return rows;
}

module.exports = {
  ensureTables,
  getAccount,
  getRole,
  isBanned,
  banUser,
  unbanUser,
  setRole,
  listAccounts
};
