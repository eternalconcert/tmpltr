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
  insert.run('Jin-Soo', 'Kwon', 'm');
  insert.run('Kate', 'Austen', 'f');
  insert.run('Claire', 'Littleton', 'f');
  insert.run('Sun-Hwa', 'Kwon', 'f');
}

initDb();

class User extends DbObject {
  static tableName = 'data';
  static fieldNames = ['id', 'firstName', 'lastName', 'gender'];
}

test('simple dbobject', (t) => {

  const users = User.getAll();
  console.log(users)
});
