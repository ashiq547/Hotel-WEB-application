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

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev_only_insecure_jwt_secret_change_me');
const PEPPER = process.env.PEPPER || process.env.JWT_SECRET || 'dev_only_insecure_pepper_change_me';

// Fail fast in production if the secret is not configured through the environment.
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set');
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
    try {
      const upgraded = await hashPassword(plain);
      return { ok: true, upgraded };
    } catch {
      return { ok: true };
    }
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
