import { DatabaseSync } from 'node:sqlite';

export const removeProps = (obj, props) => {
  const instCopy = {};
  Object.entries(obj).forEach((item) => {
    if (!props.includes(item[0])) {
      instCopy[item[0]] = item[1];
    }
  });
  return instCopy;
}

export class DbObject {
  static dbInstance = null;

  static setDb(path) {
    if (!this.dbInstance) {
      this.dbInstance = new DatabaseSync(path);
    };
  };

  static get database() {
    return this.dbInstance;
  };

  constructor(results) {
    if (results) {
      this.constructor.fieldNames.forEach(fieldname => {
        this[fieldname] = results[fieldname];
      })
    }
  }

  static getAll = function () {
    const query = this.database.prepare(`SELECT ${this.fieldNames.join(', ')} FROM ${this.tableName} ORDER BY id`);
    return query.all().map(res => new this(res));
  }

  static getByFilter = function (filter) {
    // filter: { firstName: 'Jack', lastName: 'Shephard' }
    if (!filter) {
      return [];
    }
    const conditions = Object.keys(filter).map(field => `${field} = ?`).join(' AND ');
    const values = Object.values(filter);
    const query = this.database.prepare(`SELECT ${this.fieldNames.join(', ')} FROM ${this.tableName} WHERE ${conditions} ORDER BY id`);
    return query.all(...values).map(res => new this(res));
  }

  static create = function (item) {
    let fieldNames = this.fieldNames;
    if (!item['id']) {
      fieldNames = this.fieldNames.slice(0, -1);
    }
    const query = `INSERT INTO ${this.tableName} (${Object.keys(item).join(', ')}) VALUES (${fieldNames.map(() => '?').join(', ')})`;
    const prepared = this.database.prepare(query);
    const lastId = prepared.run(...Object.values(item)).lastInsertRowid;
    return this.getByFilter({ id: lastId })[0];
  }

  save = function () {
    const instCopy = removeProps(this, ['save']);

    let id = this.id;

    if (id) {
      const query = `UPDATE ${this.constructor.tableName} SET ${Object.keys(instCopy).map((fieldName) => `${fieldName} = ?`).join(', ')}${id ? ' WHERE id = ?' : ''}`;
      const prepared = this.constructor.database.prepare(query);
      prepared.run(...Object.values(instCopy), this.id);
      const filterQuery = this.constructor.database.prepare(`SELECT ${this.constructor.fieldNames.join(', ')} FROM ${this.constructor.tableName} WHERE id = ? ORDER BY id`);
      return filterQuery.all(id).map(res => new this.constructor(res))[0];
    } else {
      return this.constructor.create(instCopy);
    }

  }
};
