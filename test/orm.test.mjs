import fs from 'fs';
import { test, mock } from 'node:test';
import assert from 'node:assert';
import { DbObject } from '../src/orm.mjs';

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
  insert.run('Boone', 'Carlyle', 'm');
  insert.run('Claire', 'Littleton', 'f');
  insert.run('Sun-Hwa', 'Kwon', 'f');
}

initDb();

class User extends DbObject {
  static tableName = 'data';
  static fieldNames = ['id', 'firstName', 'lastName', 'gender'];

  static getById(id) {
    return this.getByFilter({ id: id })[0];
  }
}

test('get all', (_t) => {
  const users = User.getAll();
  assert.deepEqual(users[0].props(), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
  assert.deepEqual(users[5].props(), { firstName: 'Sun-Hwa', lastName: 'Kwon', gender: 'f', id: 6 });
});

test('get by filter, id', (_t) => {
  const users = User.getByFilter({id: 3});
  assert.equal(users.length, 1);
  assert.deepEqual(users[0].props(), { firstName: 'Kate', lastName: 'Austen', gender: 'f', id: 3 });
});

test('get by filter, multiple results', (_t) => {
  const users = User.getByFilter({ gender: 'm' });
  assert.equal(users.length, 3);
  assert.deepEqual(users[0].props(), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
  assert.deepEqual(users[1].props(), { firstName: 'Hugo', lastName: 'Reyes', gender: 'm', id: 2 });
  assert.deepEqual(users[2].props(), { firstName: 'Boone', lastName: 'Carlyle', gender: 'm', id: 4 });
});


test('get by filter, multiple results, first', (_t) => {
  const users = User.getByFilter({ gender: 'f' }, { extremum: 'first' });
  assert.deepEqual(users.props(), { firstName: 'Kate', lastName: 'Austen', gender: 'f', id: 3 });
});

test('get by filter, multiple results, last', (_t) => {
  const users = User.getByFilter({ gender: 'm' }, { extremum: 'last' });
  assert.deepEqual(users.props(), { firstName: 'Boone', lastName: 'Carlyle', gender: 'm', id: 4 });
});

test('get by filter, firstName and gender', (_t) => {
  const users = User.getByFilter({ firstName: 'Claire', gender: 'f' });
  assert.equal(users.length, 1);
  assert.deepEqual(users[0].props(), { firstName: 'Claire', lastName: 'Littleton', gender: 'f', id: 5 });
});

test('get by filter, order by', (_t) => {
  const users = User.getByFilter({ gender: 'm' }, { orderBy: 'lastName' });
  assert.equal(users.length, 3);

  assert.deepEqual(users[0].props(), { firstName: 'Boone', lastName: 'Carlyle', gender: 'm', id: 4 });
  assert.deepEqual(users[1].props(), { firstName: 'Hugo', lastName: 'Reyes', gender: 'm', id: 2 });
  assert.deepEqual(users[2].props(), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
});

test('get by filter, order by, descending', (_t) => {
  const users = User.getByFilter({ gender: 'm' }, { orderBy: 'lastName', sortOrder: 'DESC' });
  assert.equal(users.length, 3);

  assert.deepEqual(users[0].props(), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
  assert.deepEqual(users[1].props(), { firstName: 'Hugo', lastName: 'Reyes', gender: 'm', id: 2 });
  assert.deepEqual(users[2].props(), { firstName: 'Boone', lastName: 'Carlyle', gender: 'm', id: 4 });
});

test('get by filter, order by, ascending, first', (_t) => {
  const user = User.getByFilter({ gender: 'm' }, { orderBy: 'lastName', extremum: 'first' });
  assert.deepEqual(user.props(), { firstName: 'Boone', lastName: 'Carlyle', gender: 'm', id: 4 });
});

test('get by filter, order by, descending, first', (_t) => {
  const user = User.getByFilter({ gender: 'm' }, { orderBy: 'lastName', sortOrder: 'DESC', extremum: 'first' });
  assert.deepEqual(user.props(), { firstName: 'Jack', lastName: 'Shephard', gender: 'm', id: 1 });
});

test('create', (_t) => {
  assert.equal(User.getAll().length, 6);
  const user = User.create({ firstName: 'Michel', lastName: 'Dawson', gender: 'm', id: 7 });
  assert.equal(User.getAll().length, 7);
  // Typo in firstName is intended. Will bei fixed in next test.
  assert.deepEqual(user.props(), { firstName: 'Michel', lastName: 'Dawson', gender: 'm', id: 7 });
});

test('save existing user', (_t) => {
  const user = User.getByFilter({id: 7})[0];
  assert.deepEqual(user.props(), { firstName: 'Michel', lastName: 'Dawson', gender: 'm', id: 7 });
  user.firstName = 'Michael';
  const updatedUser = user.save();
  assert.deepEqual(updatedUser.props(), { firstName: 'Michael', lastName: 'Dawson', gender: 'm', id: 7 });
  // Self referencing..
  assert.deepEqual(user.props(), { firstName: 'Michael', lastName: 'Dawson', gender: 'm', id: 7 });
});

test('save new user', (_t) => {
  let user = new User();
  user.firstName = 'Desmond';
  user.lastName = 'Hume';
  user.gender = 'm';
  user = user.save();
  assert.deepEqual(user.props(), { firstName: 'Desmond', lastName: 'Hume', gender: 'm', id: 8 });
});

test('delete', (_t) => {
  let users = User.getByFilter({ firstName: 'Boone' });
  assert.equal(users.length, 1);
  users[0].delete();

  users = User.getByFilter({ firstName: 'Boone' });
  assert.equal(users.length, 0);
});

test('overwritten class method, more an example than a test', () => {
  const user = User.getById(2);
  assert.deepEqual(user.props(), { firstName: 'Hugo', lastName: 'Reyes', gender: 'm', id: 2 });
})
