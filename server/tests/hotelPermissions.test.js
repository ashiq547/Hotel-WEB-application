const test = require('node:test');
const assert = require('node:assert/strict');

const state = { memberRole: null, ownerId: 99, queries: [] };

const db = {
  async query(sql, params = []) {
    state.queries.push({ sql, params });
    if (/SHOW COLUMNS FROM Hotel/i.test(sql)) {
      return [[{ Field: 'Owner_Employee_ID' }]];
    }
    if (/SELECT Member_Role FROM Hotel_Member/i.test(sql)) {
      return [state.memberRole ? [{ Member_Role: state.memberRole }] : []];
    }
    if (/SELECT Hotel_ID FROM Hotel WHERE Hotel_ID = \? AND Owner_Employee_ID = \?/i.test(sql)) {
      return [Number(params[1]) === state.ownerId ? [{ Hotel_ID: params[0] }] : []];
    }
    return [{ affectedRows: 1 }];
  }
};

const userAccounts = {};
const dbPath = require.resolve('../config/db');
const accountsPath = require.resolve('../utils/userAccounts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
require.cache[accountsPath] = {
  id: accountsPath,
  filename: accountsPath,
  loaded: true,
  exports: userAccounts
};

const rbac = require('../utils/rbac');
const hotelController = require('../controllers/hotelController');

function response() {
  return {
    statusCode: 200,
    body: null,
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

test('hotel member roles grant distinct reservation, room, and service permissions', async () => {
  state.memberRole = 'Member';
  assert.equal(await rbac.hotelPermission(1, 10, 'room:create'), true);
  assert.equal(await rbac.hotelPermission(1, 10, 'reservation:create'), true);
  assert.equal(await rbac.hotelPermission(1, 10, 'reservation:update'), false);
  assert.equal(await rbac.hotelPermission(1, 10, 'service:assign'), false);
  assert.equal(await rbac.hotelPermission(1, 10, 'hotel:rename'), false);

  state.memberRole = 'Manager';
  assert.equal(await rbac.hotelPermission(1, 11, 'reservation:update'), true);
  assert.equal(await rbac.hotelPermission(1, 11, 'service:assign'), true);
  assert.equal(await rbac.hotelPermission(1, 11, 'hotel:update'), true);
  assert.equal(await rbac.hotelPermission(1, 11, 'hotel:rename'), false);

  state.memberRole = null;
  assert.equal(await rbac.hotelPermission(1, state.ownerId, 'hotel:rename'), true);
  assert.equal(await rbac.hotelPermission(1, state.ownerId, 'members:manage'), true);
});

test('only the hotel owner can change a member role, and only to a supported role', async () => {
  const forbidden = response();
  await hotelController.updateMemberRole(
    { params: { id: '1', employeeId: '10' }, body: { memberRole: 'Manager' }, user: { id: 10 } },
    forbidden,
    (err) => { throw err; }
  );
  assert.equal(forbidden.statusCode, 403);

  const invalid = response();
  await hotelController.updateMemberRole(
    { params: { id: '1', employeeId: '10' }, body: { memberRole: 'Owner' }, user: { id: state.ownerId } },
    invalid,
    (err) => { throw err; }
  );
  assert.equal(invalid.statusCode, 400);

  state.queries.length = 0;
  const updated = response();
  await hotelController.updateMemberRole(
    { params: { id: '1', employeeId: '10' }, body: { memberRole: 'Manager' }, user: { id: state.ownerId } },
    updated,
    (err) => { throw err; }
  );
  assert.equal(updated.statusCode, 200);
  assert.ok(state.queries.some(({ sql, params }) =>
    /UPDATE Hotel_Member SET Member_Role/.test(sql) &&
    params[0] === 'Manager' && params[1] === '1' && params[2] === '10'
  ));
});
