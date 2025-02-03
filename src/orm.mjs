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
    this.constructor.fieldNames.forEach(fieldname => {
      this[fieldname] = results[fieldname];
    })
  }
  static getAll = function () {
    const query = this.database.prepare(`SELECT ${this.fieldNames.join(', ')} FROM ${this.tableName} ORDER BY id`);
    return query.all().map(res => new this(res));
  }

  static getByFilter = function (filter) {
    // filter: { firstName: 'Jack', lastName: 'Shephard' }
    const filterStrings = Object.entries(filter).map(item => `${item[0]}='${item[1]}'`);
    const query = this.database.prepare(`SELECT ${this.fieldNames.join(', ')} FROM ${this.tableName} WHERE ${filterStrings.join(' AND ')} ORDER BY id`);
    return query.all().map(res => new this(res));
  }
};
