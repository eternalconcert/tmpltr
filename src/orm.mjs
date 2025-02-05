import { DatabaseSync } from 'node:sqlite';

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

  props = (includeUndefined = true) => {
    const instCopy = {};
    this.constructor.fieldNames.forEach((field) => {
      if (includeUndefined || this[field]) {
        instCopy[field] = this[field];
      }
    });
    return instCopy;
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
    if (this.id) {
      const query = `UPDATE ${this.constructor.tableName} SET ${Object.keys(this.props(false)).map((fieldName) => `${fieldName} = ?`).join(', ')}${this.id ? ' WHERE id = ?' : ''}`;
      const prepared = this.constructor.database.prepare(query);
      prepared.run(...Object.values(this.props(false)), this.id);
      const filterQuery = this.constructor.database.prepare(`SELECT ${this.constructor.fieldNames.join(', ')} FROM ${this.constructor.tableName} WHERE id = ? ORDER BY id`);
      return filterQuery.all(this.id).map(res => new this.constructor(res))[0];
    } else {
      return this.constructor.create(this.props(false));
    }
  }

  delete = function () {
    if (!this.id) {
      throw Error('No ID prop found!');
    }
    const query = `DELETE FROM ${this.constructor.tableName} WHERE id = ?`;
    const prepared = this.constructor.database.prepare(query);
    prepared.run(this.id);
    return true;
  }

};
