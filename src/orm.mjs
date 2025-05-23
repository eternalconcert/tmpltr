import { DatabaseSync } from 'node:sqlite';

export class ResultError extends Error { };

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
    return this.getByFilter({});
  }

  static getByFilter = function (filter, config = {}) {
    // filter: { firstName: 'Jack', lastName: 'Shephard' }
    let conditions = Object.keys(filter).map(field => {
      if (field.split('__').length > 1) {
        const splitted = field.split('__');
        const fieldName = splitted[0];
        const operator = splitted[1];
        if (operator === 'lte') {
          return `${fieldName} <= ?`
        } else if (operator === 'gte') {
          return `${fieldName} >= ?`
        } else if (operator === 'lt') {
          return `${fieldName} < ?`
        } else if (operator === 'gt') {
          return `${fieldName} > ?`
        } else if (operator === 'like') {
          return `${fieldName} LIKE ?`
        } else if (operator === 'not') {
          return `${fieldName} NOT LIKE ?`
        } else if (operator === 'in') {
          return `${fieldName} IN (${filter[field].map(() => '?').join(', ')})`
        } else if (operator === 'notin') {
          return `${fieldName} NOT IN (${filter[field].map(() => '?').join(', ')})`
        }
      }
      return `${field} = ?`
    }).join(' AND ');
    let values = Object.values(filter);
    if (filter && typeof filter === 'object' && Object.keys(filter).length === 0) {
      conditions = '1 = 1';
      values = [];
    }
    const { extremum, orderBy, sortOrder } = config;
    let orderPart = ` ORDER BY ${orderBy ? orderBy : 'id'}`
    let direction = (sortOrder && sortOrder.toUpperCase() === 'DESC') ? ' DESC' : ' ASC';
    let limitPart = ''
    if (extremum) {
      limitPart = ' LIMIT 1'
      if (extremum === 'last') {
        direction = ' DESC';
      }
    }
    const query = this.database.prepare(`SELECT ${this.fieldNames.join(', ')} FROM ${this.tableName} WHERE ${conditions}${orderPart}${direction}${limitPart}`);
    const result = query.all(...values).map(res => new this(res));
    return extremum ? result[0] : result;
  }

  static first = function (filter, config = {}) {
    return this.getByFilter(filter, config)[0];
  }

  static create = function (item) {
    let fieldNames = this.fieldNames;
    let props = Object.keys(item);
    if (!item['id']) {
      fieldNames = this.fieldNames.slice(0, -1);
      props = props.filter(prop => prop !== 'id');
    }
    const query = `INSERT INTO ${this.tableName} (${props.join(', ')}) VALUES (${fieldNames.map(() => '?').join(', ')})`;
    const prepared = this.database.prepare(query);
    let objectValues = Object.values(item);
    if (!item['id']) {
      objectValues = objectValues.slice(1);
    }
    const lastId = prepared.run(...objectValues).lastInsertRowid;
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
