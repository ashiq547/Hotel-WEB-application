const test = require('node:test');
const assert = require('node:assert/strict');

const state = { memberRole: null, ownerId: 99 };

const db = {
  async query(sql, params = []) {
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
