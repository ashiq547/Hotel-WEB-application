/**
 * Server-side refresh token / session store.
 *
 * - Refresh tokens are 256-bit random values sent to clients in an httpOnly cookie.
 * - Only a SHA-256 hash of each token is stored server-side, so a database leak
 *   does not expose usable refresh tokens.
 * - Each refresh rotates the token: the old one is revoked and a new one issued.
 * - Logout revokes the current session; users can list and revoke their sessions.
 */
const crypto = require('crypto');
const db = require('../config/db');

const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TTL_DAYS || '7', 10);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Make sure the refresh token table exists. */
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS Refresh_Token (
      Token_ID INT AUTO_INCREMENT PRIMARY KEY,
      User_Type VARCHAR(20) NOT NULL,
      User_ID INT NOT NULL,
      Token_Hash CHAR(64) NOT NULL UNIQUE,
      User_Agent VARCHAR(255),
      IP_Address VARCHAR(64),
      Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      Last_Used_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      Expires_At DATETIME NOT NULL,
      Revoked_At DATETIME NULL,
      Replaced_By CHAR(64) NULL,
      INDEX idx_user (User_Type, User_ID),
      INDEX idx_hash (Token_Hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

/**
 * Create a new session. Returns the raw token (to put in the cookie) —
 * only the hash is persisted.
 */
async function createSession(userType, userId, userAgent, ip) {
  await ensureTable();
  const raw = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(raw);
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [result] = await db.query(
    `INSERT INTO Refresh_Token (User_Type, User_ID, Token_Hash, User_Agent, IP_Address, Expires_At)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userType, userId, tokenHash, String(userAgent || '').slice(0, 255), String(ip || '').slice(0, 64), expires]
  );
  return { id: result.insertId, raw, tokenHash, expires };
}

async function findActiveSession(sessionId, userType, userId) {
  await ensureTable();
  const [rows] = await db.query(
    `SELECT Token_ID FROM Refresh_Token
     WHERE Token_ID = ? AND User_Type = ? AND User_ID = ?
       AND Revoked_At IS NULL AND Expires_At > NOW()`,
    [sessionId, userType, userId]
  );
  return rows.length > 0;
}

/** Look up a raw refresh token. Returns the row or null when unknown/expired/revoked. */
async function findSession(rawToken) {
  if (!rawToken) return null;
  await ensureTable();
  const [rows] = await db.query(
    `SELECT * FROM Refresh_Token WHERE Token_Hash = ?`,
    [sha256(rawToken)]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.Revoked_At) return null;
  if (new Date(row.Expires_At).getTime() < Date.now()) return null;
  return row;
}

/**
 * Rotate a session: revoke the current token and issue a fresh one.
 * Returns the new raw token + expiry, or null if the session is not valid.
 */
async function rotateSession(row, userAgent, ip) {
  await ensureTable();
  const next = await createSession(row.User_Type, row.User_ID, userAgent, ip);
  await db.query(
    `UPDATE Refresh_Token SET Revoked_At = NOW(), Replaced_By = ? WHERE Token_ID = ?`,
    [next.tokenHash, row.Token_ID]
  );
  return next;
}

/** Revoke one session by its token hash row id (only if it belongs to the user). */
async function revokeSessionById(tokenId, userType, userId) {
  await ensureTable();
  const [result] = await db.query(
    `UPDATE Refresh_Token SET Revoked_At = NOW()
     WHERE Token_ID = ? AND User_Type = ? AND User_ID = ? AND Revoked_At IS NULL`,
    [tokenId, userType, userId]
  );
  return result.affectedRows > 0;
}

/** Revoke every active session of a user ("log out everywhere"). */
async function revokeAllSessions(userType, userId) {
  await ensureTable();
  const [result] = await db.query(
    `UPDATE Refresh_Token SET Revoked_At = NOW()
     WHERE User_Type = ? AND User_ID = ? AND Revoked_At IS NULL`,
    [userType, userId]
  );
  return result.affectedRows;
}

/** Revoke a session by its raw cookie value (used by logout). */
async function revokeByRawToken(rawToken) {
  if (!rawToken) return false;
  await ensureTable();
  const [result] = await db.query(
    `UPDATE Refresh_Token SET Revoked_At = NOW() WHERE Token_Hash = ? AND Revoked_At IS NULL`,
    [sha256(rawToken)]
  );
  return result.affectedRows > 0;
}

/** List the active sessions of a user. */
async function listSessions(userType, userId) {
  await ensureTable();
  const [rows] = await db.query(
    `SELECT Token_ID, User_Agent, IP_Address, Created_At, Last_Used_At, Expires_At
     FROM Refresh_Token
     WHERE User_Type = ? AND User_ID = ? AND Revoked_At IS NULL AND Expires_At > NOW()
     ORDER BY Token_ID DESC`,
    [userType, userId]
  );
  return rows;
}

/** Touch Last_Used_At when a token is successfully used. */
async function touchSession(tokenId) {
  await db.query('UPDATE Refresh_Token SET Last_Used_At = NOW() WHERE Token_ID = ?', [tokenId]);
}

/** Delete expired / revoked rows older than 30 days (housekeeping). */
async function cleanup() {
  await ensureTable();
  await db.query('DELETE FROM Refresh_Token WHERE Expires_At < NOW() - INTERVAL 30 DAY');
}

module.exports = {
  REFRESH_TTL_DAYS,
  createSession,
  findActiveSession,
  findSession,
  rotateSession,
  revokeSessionById,
  revokeAllSessions,
  revokeByRawToken,
  listSessions,
  touchSession,
  cleanup
};
