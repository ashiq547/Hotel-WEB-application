const { verifyAccessToken } = require('../utils/passwordSecurity');

/**
 * Authentication middleware.
 *
 * - Missing, malformed, tampered, invalid or expired tokens always return 401.
 * - The token payload must contain a user id and role.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const user = verifyAccessToken(token);
  if (!user || user.id === undefined || !user.role) {
    // Covers missing, invalid, tampered and expired tokens alike.
    return res.status(401).json({ error: 'Invalid, tampered or expired token' });
  }

  req.user = user;
  next();
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access forbidden: Insufficient permissions for role ' + (req.user ? req.user.role : 'Guest')
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles
};
