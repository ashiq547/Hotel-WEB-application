const test = require('node:test');
const assert = require('node:assert/strict');

const state = {
  role: 'Guest',
  banned: false,
  queries: [],
  revoked: null,
  sessionActive: true
};

const db = {
  async query(sql, params = []) {
    state.queries.push({ sql, params });
    if (/SELECT Password FROM Guest/i.test(sql)) return [[{ Password: 'stored-hash' }]];
    if (/SELECT Guest_ID AS id/i.test(sql)) {
      return [[{ id: 5, name: 'Test Guest', Username: 'guest', role: 'Guest' }]];
    }
    if (/FROM Reservation r/i.test(sql) || /FROM Service_Record sr/i.test(sql)) return [[]];
    return [{ affectedRows: 1 }];
  }
};

const userAccounts = {
  async getRole() {
    return state.role;
  },
  async isBanned() {
    return state.banned;
  }
};

const sessionStore = {
  async findActiveSession() {
    return state.sessionActive;
  },
  async revokeAllSessions(type, id) {
    state.revoked = { type, id };
    return 1;
  }
};

const passwordSecurity = {
  verifyAccessToken(token) {
    return token === 'valid-token'
      ? { id: 5, role: 'Admin', type: 'Guest', sid: 12 }
      : null;
  },
  async verifyPassword() {
    return true;
  },
  async hashPassword() {
    return 'new-password-hash';
  }
};

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports
  };
}

mockModule('../config/db', db);
mockModule('../utils/userAccounts', userAccounts);
mockModule('../utils/sessionStore', sessionStore);
mockModule('../utils/passwordSecurity', passwordSecurity);

const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');
const guestController = require('../controllers/guestController');
const reservationController = require('../controllers/reservationController');
const serviceController = require('../controllers/serviceController');

function response() {
  return {
    statusCode: 200,
    body: null,
    cookie() { return this; },
    clearCookie() { return this; },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('authenticated middleware applies the current database role and rejects bans', async () => {
  state.role = 'Manager';
  state.banned = false;
  state.sessionActive = true;
  const req = { headers: { authorization: 'Bearer valid-token' } };
  const res = response();
  let nextCalled = false;

  await authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'Manager');
  assert.equal(req.user.type, 'Guest');

  state.banned = true;
  const bannedRes = response();
  nextCalled = false;
  await authenticateToken(
    { headers: { authorization: 'Bearer valid-token' } },
    bannedRes,
    () => { nextCalled = true; }
  );
  assert.equal(bannedRes.statusCode, 403);
  assert.equal(nextCalled, false);
  state.banned = false;

  state.sessionActive = false;
  const revokedRes = response();
  nextCalled = false;
  await authenticateToken(
    { headers: { authorization: 'Bearer valid-token' } },
    revokedRes,
    () => { nextCalled = true; }
  );
  assert.equal(revokedRes.statusCode, 401);
  assert.equal(nextCalled, false);
  state.sessionActive = true;
});

test('profile reads reject a different account id', async () => {
  state.queries.length = 0;
  const res = response();
  await authController.getProfile(
    { params: { id: '99' }, user: { id: 5, type: 'Guest' } },
    res,
    (err) => { throw err; }
  );

  assert.equal(res.statusCode, 403);
  assert.equal(state.queries.length, 0);
});

test('guest profile, reservation, and service reads stay within the authenticated guest', async () => {
  state.queries.length = 0;
  const guestRes = response();
  await guestController.getGuestProfile(
    { params: { id: '99' }, user: { id: 5, type: 'Guest', role: 'Guest' } },
    guestRes,
    (err) => { throw err; }
  );
  assert.equal(guestRes.statusCode, 404);
  assert.equal(state.queries.length, 0);

  await reservationController.getAllReservations(
    { query: { guestId: '99' }, user: { id: 5, type: 'Guest', role: 'Guest' } },
    response(),
    (err) => { throw err; }
  );
  const reservationQuery = state.queries.find(({ sql }) => /FROM Reservation r/i.test(sql));
  assert.ok(reservationQuery.sql.includes('r.Guest_ID = ?'));
  assert.deepEqual(reservationQuery.params, [5]);

  state.queries.length = 0;
  await serviceController.getGuestServiceRecords(
    { query: { guestId: '99' }, user: { id: 5, type: 'Guest', role: 'Guest' } },
    response(),
    (err) => { throw err; }
  );
  const serviceQuery = state.queries.find(({ sql }) => /FROM Service_Record sr/i.test(sql));
  assert.ok(serviceQuery.sql.includes('sr.Guest_ID = ?'));
  assert.deepEqual(serviceQuery.params, [5]);
});

test('profile updates and password changes use the authenticated account identity', async () => {
  state.queries.length = 0;
  await authController.updateProfile(
    {
      user: { id: 5, type: 'Guest' },
      body: { id: 99, role: 'Employee', name: 'Updated Name' }
    },
    response(),
    (err) => { throw err; }
  );

  const profileUpdate = state.queries.find(({ sql }) => /UPDATE Guest SET Full_Name/i.test(sql));
  assert.ok(profileUpdate);
  assert.equal(profileUpdate.params[1], 5);

  state.queries.length = 0;
  state.revoked = null;
  await authController.changePassword(
    {
      user: { id: 5, type: 'Guest' },
      body: {
        id: 99,
        role: 'Employee',
        oldPassword: 'current-password',
        newPassword: 'NewPassword123'
      },
      headers: {},
      ip: '127.0.0.1'
    },
    response(),
    (err) => { throw err; }
  );

  const passwordRead = state.queries.find(({ sql }) => /SELECT Password FROM Guest/i.test(sql));
  const passwordUpdate = state.queries.find(({ sql }) => /UPDATE Guest SET Password/i.test(sql));
  assert.ok(passwordRead);
  assert.equal(passwordRead.params[0], 5);
  assert.ok(passwordUpdate);
  assert.equal(passwordUpdate.params[1], 5);
  assert.deepEqual(state.revoked, { type: 'Guest', id: 5 });
});
