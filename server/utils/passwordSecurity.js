/**
 * Central password + token security helpers.
 *
 * - Passwords are always hashed with bcrypt (10 salt rounds), never stored in plain text.
 * - A server-side pepper (PEPPER) is appended before hashing. It never leaves the server
 *   and is NOT stored in the database, so a leaked database alone is not enough to crack
 *   passwords offline.
 * - Access tokens are short-lived signed JWTs (15 minutes) containing user id and role.
 * - JWT_SECRET and PEPPER must come from environment variables.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '15m';

const JWT_SECRET = process.env.JWT_SECRET;
const PEPPER = process.env.PEPPER;

const ttlMatch = /^(\d+)(s|m|h|d)$/.exec(TOKEN_TTL);
const ttlSeconds = ttlMatch
  ? Number(ttlMatch[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 })[ttlMatch[2]]
  : NaN;

if (!Number.isFinite(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 15 * 60) {
  throw new Error('JWT_EXPIRES_IN must be a duration of 15 minutes or less');
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters');
}
if (!PEPPER || PEPPER.length < 32) {
  throw new Error('PEPPER must be set to at least 32 characters');
}

/** Hash a plain password with bcrypt + pepper. */
async function hashPassword(plain) {
  return bcrypt.hash(String(plain) + PEPPER, BCRYPT_ROUNDS);
}

/**
 * Verify a plain password against a stored hash.
 * Supports legacy plain-text rows by transparently re-hashing them after a successful match.
 */
async function verifyPassword(plain, stored) {
  const attempt = String(plain) + PEPPER;
  if (!stored) return false;

  // bcrypt hashes are $2a$/$2b$/$2y$...
  if (/^\$2[aby]\$/.test(stored)) {
    return bcrypt.compare(attempt, stored);
  }

  // Legacy plain-text / non-bcrypt stored value
  if (stored === String(plain)) {
    const upgraded = await hashPassword(plain);
    return { ok: true, upgraded };
  }
  return false;
}

/** Sign a short-lived access token. payload should contain { id, role } plus optional claims. */
function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Verify a token. Returns the payload or null when missing/invalid/tampered/expired. */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = {
  PEPPER,
  JWT_SECRET,
  TOKEN_TTL,
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken
};
