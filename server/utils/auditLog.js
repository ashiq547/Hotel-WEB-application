const crypto = require('crypto');
const db = require('../config/db');

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS Audit_Log (
      Audit_ID BIGINT AUTO_INCREMENT PRIMARY KEY,
      Event_Type VARCHAR(50) NOT NULL,
      User_Type VARCHAR(20) NULL,
      User_ID INT NULL,
      Target_Type VARCHAR(30) NULL,
      Target_ID INT NULL,
      Attempt_Hash CHAR(64) NULL,
      Details VARCHAR(500) NULL,
      IP_Address VARCHAR(64) NULL,
      User_Agent VARCHAR(255) NULL,
      Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_event_time (Event_Type, Created_At),
      INDEX idx_audit_ip_time (IP_Address, Created_At),
      INDEX idx_audit_attempt_time (Attempt_Hash, Created_At)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

async function record(req, eventType, fields = {}) {
  await ensureTable();
  await db.query(
    `INSERT INTO Audit_Log
      (Event_Type, User_Type, User_ID, Target_Type, Target_ID, Attempt_Hash, Details, IP_Address, User_Agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventType,
      fields.userType || null,
      fields.userId || null,
      fields.targetType || null,
      fields.targetId || null,
      fields.attemptHash || null,
      fields.details ? String(fields.details).slice(0, 500) : null,
      String(req.ip || '').slice(0, 64) || null,
      String(req.headers['user-agent'] || '').slice(0, 255) || null
    ]
  );
}

function hashIdentifier(identifier) {
  return crypto.createHmac('sha256', process.env.PEPPER)
    .update(String(identifier || '').trim().toLowerCase())
    .digest('hex');
}

module.exports = { ensureTable, record, hashIdentifier };
