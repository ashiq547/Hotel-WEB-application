const db = require('../config/db');
const auditLog = require('./auditLog');

const WINDOW_MINUTES = 15;
const ACCOUNT_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 20;

function secondsUntilWindowExpires(lastAttempt) {
  const lastAttemptAt = new Date(lastAttempt).getTime();
  if (!Number.isFinite(lastAttemptAt)) return WINDOW_MINUTES * 60;
  return Math.max(1, Math.ceil((lastAttemptAt + WINDOW_MINUTES * 60 * 1000 - Date.now()) / 1000));
}

async function getLoginLockout(req, identifier) {
  await auditLog.ensureTable();

  const attemptHash = auditLog.hashIdentifier(identifier);
  const ipAddress = String(req.ip || '').slice(0, 64);
  const [rows] = await db.query(
    `SELECT
       SUM(CASE WHEN Attempt_Hash = ? THEN 1 ELSE 0 END) AS Account_Attempts,
       MAX(CASE WHEN Attempt_Hash = ? THEN Created_At END) AS Account_Last_Attempt,
       SUM(CASE WHEN IP_Address = ? THEN 1 ELSE 0 END) AS IP_Attempts,
       MAX(CASE WHEN IP_Address = ? THEN Created_At END) AS IP_Last_Attempt
     FROM Audit_Log
     WHERE Event_Type = 'login.failed'
       AND Created_At >= DATE_SUB(NOW(), INTERVAL ${WINDOW_MINUTES} MINUTE)
       AND (Attempt_Hash = ? OR IP_Address = ?)`,
    [attemptHash, attemptHash, ipAddress, ipAddress, attemptHash, ipAddress]
  );

  const counts = rows[0] || {};
  const lockouts = [];
  if (Number(counts.Account_Attempts) >= ACCOUNT_FAILURE_LIMIT) {
    lockouts.push(secondsUntilWindowExpires(counts.Account_Last_Attempt));
  }
  if (ipAddress && Number(counts.IP_Attempts) >= IP_FAILURE_LIMIT) {
    lockouts.push(secondsUntilWindowExpires(counts.IP_Last_Attempt));
  }

  return {
    locked: lockouts.length > 0,
    retryAfterSeconds: lockouts.length ? Math.max(...lockouts) : 0
  };
}

module.exports = { getLoginLockout };
