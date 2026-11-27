// Smoke test: in-memory MySQL stub for the session store + auth refresh flow.
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test_secret';
process.env.PEPPER = 'test_pepper';

const rows = new Map(); // Token_Hash -> row
let nextId = 1;

const makeConn = (sql, params) => {
  sql = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  if (sql.startsWith('CREATE TABLE')) return [[]];
  if (sql.startsWith('INSERT INTO REFRESH_TOKEN')) {
    const [type, uid, hash, ua, ip, expires] = params;
    rows.set(hash, { Token_ID: nextId++, User_Type: type, User_ID: uid, Token_Hash: hash, User_Agent: ua, IP_Address: ip, Expires_At: expires, Revoked_At: null, Replaced_By: null });
    return [{ affectedRows: 1, insertId: nextId - 1 }];
  }
  if (sql.startsWith('SELECT * FROM REFRESH_TOKEN WHERE TOKEN_HASH')) {
    const row = rows.get(params[0]);
    return [row ? [row] : []];
  }
  if (sql.startsWith('UPDATE REFRESH_TOKEN SET REVOKED_AT = NOW(), REPLACED_BY')) {
    // rotate: mark old revoked
    for (const r of rows.values()) if (r.Token_ID === params[1]) { r.Revoked_At = new Date(); r.Replaced_By = params[0]; }
    return [{ affectedRows: 1 }];
  }
  if (sql.startsWith('UPDATE REFRESH_TOKEN SET REVOKED_AT = NOW() WHERE TOKEN_ID')) {
    for (const r of rows.values()) if (r.Token_ID === params[0] && r.User_Type === params[1] && r.User_ID === params[2] && !r.Revoked_At) r.Revoked_At = new Date();
    return [{ affectedRows: 1 }];
  }
  if (sql.startsWith('UPDATE REFRESH_TOKEN SET REVOKED_AT = NOW() WHERE USER_TYPE')) {
    let n = 0;
    for (const r of rows.values()) if (r.User_Type === params[0] && r.User_ID === params[1] && !r.Revoked_At) { r.Revoked_At = new Date(); n++; }
    return [{ affectedRows: n }];
  }
  if (sql.startsWith('UPDATE REFRESH_TOKEN SET REVOKED_AT = NOW() WHERE TOKEN_HASH')) {
    const r = rows.get(params[0]);
    if (r && !r.Revoked_At) { r.Revoked_At = new Date(); return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 0 }];
  }
  if (sql.startsWith('SELECT TOKEN_ID, USER_AGENT')) {
    const list = [];
    for (const r of rows.values()) if (r.User_Type === params[0] && r.User_ID === params[1] && !r.Revoked_At && new Date(r.Expires_At) > new Date()) list.push(r);
    return [list];
  }
  if (sql.startsWith('UPDATE REFRESH_TOKEN SET LAST_USED_AT')) return [[]];
  if (sql.startsWith('DELETE FROM REFRESH_TOKEN')) return [[]];
  return [[]];
};

const Module = require('module');
const dbPath = require.resolve('E:/hotel/Hotel-WEB-application/server/config/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql, params) => makeConn(sql, params), execute: async (sql, params) => makeConn(sql, params) } };

(async () => {
  const store = require('../utils/sessionStore');

  // 1. Create session
  const s1 = await store.createSession('Employee', 1, 'test-agent', '127.0.0.1');
  console.log('1. createSession: got raw token =', s1.raw.length === 64);

  // 2. Find it
  const row = await store.findSession(s1.raw);
  console.log('2. findSession: found =', !!row);

  // 3. Rotate
  const s2 = await store.rotateSession(row, 'agent2', 'ip2');
  const oldRow = await store.findSession(s1.raw);
  console.log('3. rotate: old now invalid =', oldRow === null);
  const newRow = await store.findSession(s2.raw);
  console.log('4. rotated token valid =', !!newRow);

  // 5. Reuse detection: revoked old token has Replaced_By set
  const reuseRow = (() => {
    for (const r of rows.values()) if (r.Token_Hash === require('crypto').createHash('sha256').update(s1.raw).digest('hex')) return r;
  })();
  console.log('5. reuse detection: Replaced_By set =', !!reuseRow.Replaced_By);

  // 6. Revoke
  await store.revokeByRawToken(s2.raw);
  console.log('6. revokeByRawToken works:', (await store.findSession(s2.raw)) === null);

  // 7. List sessions
  const s3 = await store.createSession('Guest', 7, 'guest-agent', '10.0.0.1');
  const list = await store.listSessions('Guest', 7);
  console.log('7. listSessions: count =', list.length);

  // 8. Revoke all for that user
  const n = await store.revokeAllSessions('Guest', 7);
  console.log('8. revokeAllSessions: revoked =', n, 'list now =', (await store.listSessions('Guest', 7)).length);

  console.log('\nALL SESSION-STORE TESTS DONE');
})();
