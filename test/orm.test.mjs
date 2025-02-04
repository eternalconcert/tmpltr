import fs from 'fs';
import { test, mock } from 'node:test';
import assert from 'node:assert';
import { DbObject, removeProps } from '../src/orm.mjs';

DbObject.setDb(':memory:');

const initDb = () => {
  DbObject.database.exec(`
    CREATE TABLE data(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT,
      lastName TEXT,
      gender TEXT
    ) STRICT
  `);
  const insert = DbObject.database.prepare('INSERT INTO data (firstName, lastName, gender) VALUES (?, ?, ?)');

  insert.run('Jack', 'Shephard', 'm');
  insert.run('Hugo', 'Reyes', 'm');
  insert.run('Kate', 'Austen', 'f');
  insert.run('Jin-Soo', 'Kwon', 'm');
  insert.run('Claire', 'Littleton', 'f');
  insert.run('Sun-Hwa', 'Kwon', 'f');
}

initDb();

class User extends DbObject {
  static tableName = 'data';
  static fieldNames = ['id', 'firstName', 'lastName', 'gender'];
}

test('get all', (_t) => {
  const users = User.getAll();
  assert.deepEqual(removeProps(users[0], ['save']), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
  assert.deepEqual(removeProps(users[5], ['save']), { firstName: 'Sun-Hwa', lastName: 'Kwon', gender: 'f', id: 6 });
});

test('get by filter, id', (_t) => {
  const users = User.getByFilter({id: 3});
  assert.equal(users.length, 1);
  assert.deepEqual(removeProps(users[0], ['save']), { firstName: 'Kate', lastName: 'Austen', gender: 'f', id: 3 });
});

test('get by filter, multiple results', (_t) => {
  const users = User.getByFilter({ gender: 'm' });
  assert.equal(users.length, 3);
  assert.deepEqual(removeProps(users[0], ['save']), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
  assert.deepEqual(removeProps(users[1], ['save']), { firstName: 'Hugo', lastName: 'Reyes', gender: 'm', id: 2 });
  assert.deepEqual(removeProps(users[2], ['save']), { firstName: 'Jin-Soo', lastName: 'Kwon', gender: 'm', id: 4 });
});

test('get by filter, firstName and gender', (_t) => {
  const users = User.getByFilter({ firstName: 'Claire', gender: 'f' });
  assert.equal(users.length, 1);
  assert.deepEqual(removeProps(users[0], ['save']), { firstName: 'Claire', lastName: 'Littleton', gender: 'f', id: 5 });
});

test('create', (_t) => {
  assert.equal(User.getAll().length, 6);
  const user = User.create({ firstName: 'Michel', lastName: 'Dawson', gender: 'm', id: 7 });
  assert.equal(User.getAll().length, 7);
  // Typo in firstName is intended. Will bei fixed in next test.
  assert.deepEqual(removeProps(user, ['save']), { firstName: 'Michel', lastName: 'Dawson', gender: 'm', id: 7 });
});

test('save existing user', (_t) => {
  const user = User.getByFilter({id: 7})[0];
  assert.deepEqual(removeProps(user, ['save']), { firstName: 'Michel', lastName: 'Dawson', gender: 'm', id: 7 });
  user.firstName = 'Michael';
  const updatedUser = user.save();
  assert.deepEqual(removeProps(updatedUser, ['save']), { firstName: 'Michael', lastName: 'Dawson', gender: 'm', id: 7 });
  // Self referencing..
  assert.deepEqual(removeProps(user, ['save']), { firstName: 'Michael', lastName: 'Dawson', gender: 'm', id: 7 });
});

test('save new user', (_t) => {
  let user = new User();
  user.firstName = 'Desmond';
  user.lastName = 'Hume';
  user.gender = 'm';
  user = user.save();
  assert.deepEqual(removeProps(user, ['save']), { firstName: 'Desmond', lastName: 'Hume', gender: 'm', id: 8 });
});
