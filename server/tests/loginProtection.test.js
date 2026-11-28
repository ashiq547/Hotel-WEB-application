const test = require('node:test');
const assert = require('node:assert/strict');

const state = { result: {}, ensureCalls: 0, query: null };
const db = {
  async query(sql, params) {
    state.query = { sql, params };
    return [[state.result]];
  }
};
const auditLog = {
  async ensureTable() {
    state.ensureCalls += 1;
  },
  hashIdentifier(identifier) {
    return `hash:${String(identifier).trim().toLowerCase()}`;
  }
};

function mockModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

mockModule('../config/db', db);
mockModule('../utils/auditLog', auditLog);
const { getLoginLockout } = require('../utils/loginProtection');

test('login lockout reads persistent failures and blocks a repeatedly targeted account', async () => {
  state.ensureCalls = 0;
  state.result = {
    Account_Attempts: 5,
    Account_Last_Attempt: new Date(Date.now() - 5 * 60 * 1000),
    IP_Attempts: 5,
    IP_Last_Attempt: new Date(Date.now() - 5 * 60 * 1000)
  };

  const lockout = await getLoginLockout({ ip: '192.0.2.10' }, ' User@Example.com ');

  assert.equal(lockout.locked, true);
  assert.ok(lockout.retryAfterSeconds > 0 && lockout.retryAfterSeconds <= 10 * 60 + 1);
  assert.equal(state.ensureCalls, 1);
  assert.match(state.query.sql, /Event_Type = 'login\.failed'/);
  assert.match(state.query.sql, /DATE_SUB\(NOW\(\), INTERVAL 15 MINUTE\)/);
  assert.deepEqual(state.query.params, [
    'hash:user@example.com',
    'hash:user@example.com',
    '192.0.2.10',
    '192.0.2.10',
    'hash:user@example.com',
    '192.0.2.10'
  ]);
});

test('login attempts below the configured thresholds are not blocked', async () => {
  state.result = {
    Account_Attempts: 4,
    Account_Last_Attempt: new Date(),
    IP_Attempts: 19,
    IP_Last_Attempt: new Date()
  };

  const lockout = await getLoginLockout({ ip: '192.0.2.11' }, 'guest@example.com');

  assert.deepEqual(lockout, { locked: false, retryAfterSeconds: 0 });
});

test('repeated failures from one IP trigger the shared source threshold', async () => {
  state.result = {
    Account_Attempts: 1,
    Account_Last_Attempt: new Date(),
    IP_Attempts: 20,
    IP_Last_Attempt: new Date(Date.now() - 2 * 60 * 1000)
  };

  const lockout = await getLoginLockout({ ip: '192.0.2.12' }, 'another-account');

  assert.equal(lockout.locked, true);
  assert.ok(lockout.retryAfterSeconds > 0 && lockout.retryAfterSeconds <= 13 * 60 + 1);
});
