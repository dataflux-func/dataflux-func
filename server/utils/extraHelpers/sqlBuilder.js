'use strict';

/* Built-in Modules */
var util = require('util');

/* 3rd-party Modules */
var moment = require('moment-timezone');

/* Project Modules */
var toolkit = require('../toolkit');

// SQL escape map
var COMMON_SQL_ESCAPE_MAP = {
  '\0'  : '\\0',
  '\b'  : '\\b',
  '\t'  : '\\t',
  '\n'  : '\\n',
  '\r'  : '\\r',
  '\x1a': '\\Z',
  '"'   : '\\"',
  '\''  : '\\\'',
  '\\'  : '\\\\',
}

var POSTGRESQL_ESCAPE_MAP = {
  '\0'  : '\\0',
  '\b'  : '\\b',
  '\t'  : '\\t',
  '\n'  : '\\n',
  '\r'  : '\\r',
  '\x1a': '\\Z',
  '\''  : '\\\'',
  '\\'  : '\\\\',
}

function commonSQLEscape(v, escapeMap) {
  escapeMap = escapeMap || COMMON_SQL_ESCAPE_MAP;

  if (v === null) {
    return 'NULL';

  } else {
    switch(typeof v) {
      case 'boolean':
        v = `${v}`.toUpperCase();
        return v;

      case 'string':
        v = v.split('').map(function(c) {
          return escapeMap[c] || c;
        }).join('');
        v = `'${v}'`;
        return v;

      case 'number':
        return `${v}`;

      default:
        return `'${v}'`;
    }
  }
};

function mysqlEscape(v) {
  return commonSQLEscape(v);
};

function postgresqlEscape(v) {
  if ('string' === typeof v) {
    return `E${commonSQLEscape(v, POSTGRESQL_ESCAPE_MAP)}`;
  } else {
    return commonSQLEscape(v, POSTGRESQL_ESCAPE_MAP);
  }
};

function formatSQL(sql, sqlParams, options) {
  options = options || {};
  var pretty    = options.pretty    || false;
  var sqlEscape = options.sqlEscape || commonSQLEscape;

  // Inspired by https://github.com/mysqljs/sqlstring/blob/master/lib/SqlString.js
  if (toolkit.isNothing(sqlParams)) {
    return sql.trim();
  }

  if (!Array.isArray(sqlParams)) {
    sqlParams = [ sqlParams ];
  }

  var result        = '';
  var placeholerRe  = new RegExp('\\?+', 'g');
  var chunkIndex    = 0;
  var sqlParamIndex = 0;

  var m;
  while (m = placeholerRe.exec(sql)) {
    if (sqlParamIndex >= sqlParams.length) {
      break;
    }

    var placeholder = m[0];
    if (placeholder.length > 2) {
      continue;
    }

    var sqlParam = sqlParams[sqlParamIndex];

    var escapedSQLParam = `${sqlParam}`;
    if (placeholder === '?') {
      if (Array.isArray(sqlParam)) {
        // List -> 'value1', 'value2', ...
        var expressions = [];
        sqlParam.forEach(function(x) {
          if (Array.isArray(x)) {
            var values = x.map(function(v) {
              return sqlEscape(v);
            })
            expressions.push(`(${values.join(', ')})`);

          } else {
            expressions.push(sqlEscape(x));
          }
        });

        escapedSQLParam = expressions.join(pretty ? ',\n  ' : ', ');

      } else if ('object' === typeof sqlParam) {
        // Dict -> field = 'value', ...
        var expressions = [];
        for (var k in sqlParam) {
          var v = sqlParam[k];

          if (v === null) {
            expressions.push(`${k} = NULL`);
          } else {
            expressions.push(`${k} = ${sqlEscape(v)}`);
          }
        }

        escapedSQLParam = expressions.join(pretty ? ',\n  ' : ', ');

      } else {
        // Other -> 'value'
        escapedSQLParam = sqlEscape(sqlParam);
      }
    }

    result += sql.slice(chunkIndex, m.index) + escapedSQLParam;
    chunkIndex = placeholerRe.lastIndex;
    sqlParamIndex++;
  }

  if (chunkIndex === 0) {
    return sql.trim();
  } else if (chunkIndex < sql.length) {
    return (result + sql.slice(chunkIndex)).trim();
  } else {
    return result.trim();
  }
};
exports.formatSQL = formatSQL;

// SQL Token
class SQLBaseToken {
  constructor(alias) {
    this._quoteChar = '';
    this._timezone  = null;
    this._sqlEscape = commonSQLEscape;

    this.alias = alias || null;
  }

  setOptions(opt) {
    opt = opt || {};

    if (opt.quoteChar) {
      this._quoteChar = opt.quoteChar;
    }

    if (opt.timezone) {
      this._timezone = opt.timezone;
    }

    if (opt.sqlEscape) {
      this._sqlEscape = opt.sqlEscape;
    }

    return this;
  }

  getQuoted(token) {
    var self = this;

    var tokenParts = [];
    token.split('.').forEach(function(p) {
      if (p === '*') {
        tokenParts.push(p);
      } else {
        tokenParts.push(`${self._quoteChar}${p}${self._quoteChar}`);
      }
    });

    return tokenParts.join('.');
  }

  asAlias() {
    var s = this.toString();
    if (this.alias) {
      s += ` AS ${this._quoteChar}${this.alias}${this._quoteChar}`;
    }
    return s;
  }
};

class SQLRaw extends SQLBaseToken {
  constructor(rawSQL, alias) {
    super(alias);

    this.rawSQL = rawSQL;
  }

  toString() {
    return this.rawSQL;
  }
};

class SQLTable extends SQLBaseToken {
  constructor(name, alias) {
    super(alias);

    this.name = name;
  }

  toString() {
    return this.getQuoted(this.name);
  }
};

class SQLField extends SQLBaseToken {
  constructor(name, alias) {
    super(alias);

    this.name = name;
  }

  toString() {
    return this.getQuoted(this.name);
  }
};

class SQLOrder extends SQLBaseToken {
  constructor(name, method) {
    super();

    this.name   = name;
    this.method = method;
  }

  toString() {
    var quotedName = this.getQuoted(this.name);

    if (this.method) {
      return `${quotedName} ${this.method.toUpperCase()}`;
    } else {
      return `${quotedName} ASC`;
    }
  }
};

class SQLValue extends SQLBaseToken {
  constructor(value, alias) {
    super(alias);

    this.value = value;
  }

  toLikePattern(mode) {
    if ('string' === typeof mode) {
      mode = mode.toLowerCase();
    }

    if (this.value.indexOf('%') >= 0) {
      return this._sqlEscape(this.value);
    } else if (mode === 'prelike') {
      return this._sqlEscape(`${this.value}%`);
    } else if (mode === 'suflike') {
      return this._sqlEscape(`%${this.value}`);
    } else {
      return this._sqlEscape(`%${this.value}%`);
    }
  }

  toValueList() {
    var self = this;

    var valueList = toolkit.asArray(this.value).map(function(v) {
      return v instanceof self.constructor ? v : new self.constructor(v);
    });

    return valueList;
  }

  toString() {
    var token = null;

    switch(typeof this.value) {
      case 'boolean':
        // token = this.value ? 'TRUE' : 'FALSE';
        token = this.value ? '1' : '0';
        break;

      case 'number':
        token = `${this.value}`;
        break;

      case 'string':
        token = this._sqlEscape(this.value);
        break;

      default:
        if (this.value === null) {
          // NULL
          token = 'NULL';

        } else if (Array.isArray(this.value)) {
          // List
          var _valueList = this.toValueList().map(function(v) {
            return `${v}`;
          });
          token = `${_valueList.join(', ')}`;

        } else if (util.types.isDate(this.value)) {
          // Date time
          var _value = moment(this.value);
          if (toolkit.notNothing(this._timezone)) {
            _value.utcOffset(this._timezone);
          }
          token = this._sqlEscape(_value.format('YYYY-MM-DD HH:mm:ss'));

        } else {
          // Other
          token = this._sqlEscape(this.value);
        }
        break;
    }

    return token;
  }
};

class SQLFunc extends SQLBaseToken {
  constructor(func, exprs, alias) {
    super(alias);

    this.func  = func;
    this.exprs = exprs || [];
  }

  toString() {
    return `${this.func.toUpperCase()}(${this.exprs.join(', ')})`;
  }
};

class SQLPlaceholder extends SQLBaseToken {
  constructor(isKeyword) {
    super();

    this.isKeyword = isKeyword;
  }

  toString() {
    return this.isKeyword ? `${this._quoteChar}??${this._quoteChar}` : '?';
  }
};

// SQL condition builder
class BaseSQLConditionBuilder {
  constructor(sqlBuilder) {
    this.sqlBuilder = sqlBuilder;
  }

  get OP_ALIAS() {
    return {
      '=' : 'eq',
      '>' : 'gt',
      '<' : 'lt',
      '>=': 'ge',
      '<=': 'le',
      '!=': 'ne',
      '<>': 'ne',
    }
  }

  genCondition(c) {
    var self = this;

    c = toolkit.asArray(c);

    var parts = []
    c.forEach(function(_c) {
      var op = (_c.OP || 'eq').toLowerCase();
      op = self.OP_ALIAS[op] || op;
      op = '_' + op;

      if (!self[op]) {
        var e = Error(`Unsupported operation: ${_c.OP}`);
        throw e;
      }

      var left  = _c.LEFT;
      var right = _c.RIGHT;

      parts.push(`(${self[op](left, right)})`);
    });

    if (parts.length > 1) {
      return `(${parts.join(' OR ')})`;
    } else {
      return parts[0];
    }
  }

  _raw(f, v) { return `${v}`; }

  _isnull(f, v) {
    if (toolkit.isNullOrUndefined(v)) {
      v = true;
    }

    if (toolkit.toBoolean(v)) {
      return `${f} IS NULL`;
    } else {
      return `${f} IS NOT NULL`;
    }
  }

  _isnotnull(f, v) {
    if (toolkit.isNullOrUndefined(v)) {
      v = true;
    }

    return this._isnull(f, !toolkit.toBoolean(v));
  }

  _eq(f, v) {
    if (v instanceof SQLValue && v.value === null) {
      return this._isnull(f, true);
    } else if (v instanceof SQLValue && Array.isArray(v.value)) {
      return this._in(f, v);
    } else {
      return `${f} = ${v}`;
    }
  }

  _ne(f, v) {
    if (v instanceof SQLValue && v.value === null) {
      return this._isnotnull(f, true);
    } else if (v instanceof SQLValue && Array.isArray(v.value)) {
      return this._notin(f, v);
    } else {
      return `${f} != ${v}`;
    }
  }

  _gt(f, v)           { return `${f} > ${v}`; }
  _lt(f, v)           { return `${f} < ${v}`; }
  _ge(f, v)           { return `${f} >= ${v}`; }
  _le(f, v)           { return `${f} <= ${v}`; }
  _like(f, v)         { return `${f} LIKE ${v.toLikePattern()}`; }
  _notlike(f, v)      { return `${f} NOT LIKE ${v.toLikePattern()}`; };
  _prelike(f, v)      { return `${f} LIKE ${v.toLikePattern('prelike')}`; }
  _suflike(f, v)      { return `${f} LIKE ${v.toLikePattern('suflike')}`; }
  _in(f, v)           { return `${f} IN (${v})`; }
  _notin(f, v)        { return `${f} NOT IN (${v})`; }

  _fuzzysearch(f, v) {
    var self = this;

    f = toolkit.asArray(f);

    var sqlParts = [];
    f.forEach(function(_f) {
      sqlParts.push(self._like(_f, v));
    });

    return sqlParts.join(' OR ');
  }

  _boolean(f, v) {
    if (toolkit.isNullOrUndefined(v)) {
      v = true;
    }

    if (toolkit.toBoolean(v)) {
      return `${f} = 1`;
    } else {
      return `${f} != 1`;
    }
  }

  _jsonarrayhas(f, v) {
    throw new Error('Not Implemented');
  }

  _jsonarrayhasall(f, v) {
    var self = this;

    var values = toolkit.asArray(v.value);
    var sqlParts = [];
    values.forEach(function(value) {
      sqlParts.push(self._jsonarrayhas(f, self.sqlBuilder.VALUE(value)));
    });

    return sqlParts.join(' AND ');
  }

  _jsonarrayhasany(f, v) {
    var self = this;

    var values = toolkit.asArray(v.value);
    var sqlParts = [];
    values.forEach(function(value) {
      sqlParts.push(self._jsonarrayhas(f, self.sqlBuilder.VALUE(value)));
    });

    return sqlParts.join(' OR ');
  }
}

// SQL builder
class BaseSQLBuilder {
  constructor(rawSQL) {
    this.rawSQL = rawSQL;
    this.meta = {
      comment        : null,
      type           : null,
      selectDistinct : false,
      totalCount     : false,
      table          : null,
      joinTables     : null,
      whereConditions: null,
      groups         : null,
      orders         : null,
      limit          : null,
      offset         : null,
      selectItems    : null,
      data           : null,
      params         : null,
      forceNoWhere   : false,
    }

    this._timezone = '+08:00';
    this._sqlConditionBuilder = new this.CONDITION_BUILDER_CLASS(this);
  }

  checkSafty() {
    if ([ 'UPDATE', 'DELETE' ].indexOf(this.meta.type) >= 0
      && toolkit.isNothing(this.meta.whereConditions)
      && !this.meta.forceNoWhere) {
      throw Error(`UPDATE or DELETE SQL without WHERE conditions is not allowed: ${this}`);
    }

    return this;
  }

  setTimezone(tz) {
    this._timezone = tz;
    return this;
  }

  get ENGINE() { return 'BASE'; }

  get CONDITION_BUILDER_CLASS() { return BaseSQLConditionBuilder; }

  RAW(rawSQL, alias)       { return new SQLRaw(rawSQL, alias).setOptions({     timezone: this._timezone }); }
  TABLE(name, alias)       { return new SQLTable(name, alias).setOptions({     timezone: this._timezone }); }
  ORDER(name, method)      { return new SQLOrder(name, method).setOptions({    timezone: this._timezone }); }
  FIELD(name, alias)       { return new SQLField(name, alias).setOptions({     timezone: this._timezone }); }
  VALUE(value, alias)      { return new SQLValue(value, alias).setOptions({    timezone: this._timezone }); }
  PLACEHOLDER(isKeyword)   { return new SQLPlaceholder(isKeyword).setOptions({ timezone: this._timezone }); }

  EXPR(conditions, alias) {
    var self = this;

    var _conditions = this._prepareConditions(conditions, 'FIELD', 'VALUE');

    var parts = []
    _conditions.forEach(function(c, index) {
      if (index > 0) {
        parts.push('AND');
      }

      parts.push(self._sqlConditionBuilder.genCondition(c));
    });

    return this.RAW(`(${this._joinSQLParts(parts)})`, alias);
  }

  FUNC(func, exprs, alias) {
    var self = this;

    var _exprs = toolkit.asArray(exprs || []);
    _exprs = _exprs.map(function(expr) {
      return expr instanceof SQLBaseToken ? expr : self.VALUE(expr);
    });

    return new SQLFunc(func, _exprs, alias);
  }

  _prepareConditions(conditions, defaultLeft, defaultRight) {
    // Simplified writing, e.g:
    //   { 'id': 123 }
    //   { LEFT: 'id', RIGHT: 123 }
    // Convert to standard writing:
    //   { LEFT: 'id', OP: '=', RIGHT: 123 }
    var self = this;

    var preparedConditions = [];
    toolkit.asArray(conditions).forEach(function(c) {
      if (Array.isArray(c)) {
        // Array condition list
        preparedConditions.push(self._prepareConditions(c, defaultLeft, defaultRight));

      } else if ('object' === typeof c) {
        // General conditions
        if (!('LEFT' in c) && !('OP' in c) && !('RIGHT' in c)) {
          for (var _left in c) {
            var _right = c[_left];

            if (!(_left instanceof SQLBaseToken)) {
              _left = self[defaultLeft](_left);
            }
            if (!(_right instanceof SQLBaseToken)) {
              _right = self[defaultRight](_right);
            }

            preparedConditions.push({
              LEFT : _left,
              OP   : 'eq',
              RIGHT: _right,
            });
          }

        } else {
          if ('LEFT' in c && !(c.LEFT instanceof SQLBaseToken)) {
            if (Array.isArray(c.LEFT)) {
              c.LEFT = c.LEFT.map(function(_f) {
                if (!(_f instanceof SQLBaseToken)) {
                  _f = self.FIELD(_f);
                }
                return _f;
              });

            } else {
              c.LEFT = self[defaultLeft](c.LEFT);
            }
          }

          if ('RIGHT' in c && !(c.RIGHT instanceof SQLBaseToken)) {
            c.RIGHT = self[defaultRight](c.RIGHT);
          }

          c.OP = (c.OP || 'eq').toLowerCase();

          preparedConditions.push(c);
        }
      } else {
        var e = new Error(`Invalid conditions: \`${JSON.stringify(conditions)}\``);
        throw e;
      }
    });

    return preparedConditions;
  }

  COMMENT(comment) {
    this.meta.comment = comment;

    return this;
  }

  FROM(table, alias) {
    if (!(table instanceof SQLBaseToken)) {
      table = this.TABLE(table, alias);
    }
    this.meta.table = table;

    return this;
  }

  DISTINCT() {
    this.meta.selectDistinct = true;
    return this;
  }

  SELECT(selectItem, alias, replaceMode) {
    var self = this;

    this.meta.type = 'SELECT';

    if (replaceMode) {
      this.meta.selectItems = [];
    } else {
      this.meta.selectItems = this.meta.selectItems || [];
    }

    if (!Array.isArray(selectItem) && !(selectItem instanceof SQLBaseToken)) {
      selectItem = this.FIELD(selectItem, alias);
    }

    toolkit.asArray(selectItem).forEach(function(item) {
      if (!(item instanceof SQLBaseToken)) {
        item = self.FIELD(item);
      }
      self.meta.selectItems.push(item);
    });

    return this;
  }

  SELECT_COUNT() {
    return this.SELECT(this.FUNC('COUNT', this.FIELD('*'), 'count'));
  }

  SELECT_DISTINCT(selectItem, alias) {
    return this.SELECT(selectItem, alias).DISTINCT();
  }

  _join(joinType, table, alias, conditions) {
    if ('object' === typeof alias) {
      conditions = alias;
      alias      = undefined;
    }

    if (!(table instanceof SQLBaseToken)) {
      table = this.TABLE(table, alias);
    }

    this.meta.joinTables = this.meta.joinTables || [];

    // All expressions in a JOIN condition default to fields
    conditions = this._prepareConditions(conditions, 'FIELD', 'FIELD');

    this.meta.joinTables.push({
      type      : joinType,
      table     : table,
      conditions: conditions,
    })

    return this;
  }

  JOIN(table, alias, conditions) {
    return this._join(null, table, alias, conditions);
  }

  LEFT_JOIN(table, alias, conditions) {
    return this._join('LEFT', table, alias, conditions);
  }

  RIGHT_JOIN(table, alias, conditions) {
    return this._join('RIGHT', table, alias, conditions);
  }

  INSERT_INTO(table) {
    this.meta.type = 'INSERT';

    if (!(table instanceof SQLBaseToken)) {
      table = this.TABLE(table);
    }
    this.meta.table = table;

    return this;
  }

  INSERT(table) {
    return this.INSERT_INTO(table);
  }

  VALUES(data) {
    if (this.meta.type !== 'INSERT') {
      var e = Error(`Only INSERT SQL supports VALUES operation`);
      throw e;
    }

    var self = this;

    this.meta.data = this.meta.data || [];

    toolkit.asArray(data).forEach(function(d) {
      var row = {};
      for (var f in d) {
        var v = d[f];
        row[f] = v instanceof SQLBaseToken ? v : self.VALUE(v);
      }

      self.meta.data.push(row);
    });

    return this;
  }

  UPDATE_VALUES(data, skipExists) {
    if (this.meta.type !== 'INSERT') {
      var e = Error(`Only INSERT SQL supports VALUES operation`);
      throw e;
    }

    var self = this;

    this.meta.data = this.meta.data || [];

    this.meta.data.forEach(function(row) {
      for (var f in data) {
        var v = data[f];

        if (skipExists && f in row) {
          continue;
        }

        row[f] = v instanceof SQLBaseToken ? v : self.VALUE(v);
      }
    });

    return this;
  }

  UPDATE(table) {
    this.meta.type = 'UPDATE';

    if (!(table instanceof SQLBaseToken)) {
      table = this.TABLE(table);
    }
    this.meta.table = table;

    return this;
  }

  SET(data) {
    if (this.meta.type !== 'UPDATE') {
      var e = Error(`Only UPDATE SQL supports SET operation`);
      throw e;
    }

    var self = this;

    this.meta.data = this.meta.data || [];

    if (this.meta.data.length <= 0) {
      this.meta.data.push({});
    }

    var setData = this.meta.data[0];
    toolkit.asArray(data).forEach(function(d) {
      for (var f in d) {
        setData[f] = d[f] instanceof SQLBaseToken ? d[f] : self.VALUE(d[f]);
      }
    });

    return this;
  }

  DELETE_FROM(table) {
    this.meta.type = 'DELETE';

    if (table) this.FROM(table);

    return this;
  }

  DELETE(table) {
    return this.DELETE_FROM(table);
  }

  DROP_TABLE(table) {
    this.meta.type = 'DROP_TABLE';
    return this.FROM(table)
  }

  TRUNCATE(table) {
    this.meta.type = 'TRUNCATE';
    return this.FROM(table)
  }

  FORCE_NO_WHERE() {
    this.meta.forceNoWhere = true;
    return this;
  }

  WHERE(conditions) {
    var self = this;

    this.meta.whereConditions = this.meta.whereConditions || [];

    // In a WHERE condition, the left expression defaults to the field and the right expression defaults to the value
    conditions = this._prepareConditions(conditions, 'FIELD', 'VALUE');

    self.meta.whereConditions = self.meta.whereConditions.concat(conditions);

    return this;
  }

  GROUP_BY(field) {
    var self = this;

    this.meta.groups = this.meta.groups || [];

    toolkit.asArray(field).forEach(function(f) {
      f = f instanceof SQLBaseToken ? f : self.FIELD(f);
      self.meta.groups.push(f);
    })

    return this;
  }

  ORDER_BY(field, method) {
    var self = this;

    this.meta.orders = this.meta.orders || [];

    toolkit.asArray(field).forEach(function(f) {
      f = f instanceof SQLBaseToken ? f : self.ORDER(f, method);
      self.meta.orders.push(f);
    });

    return this;
  }

  LIMIT(limit, offset) {
    this.meta.limit  = toolkit.isNullOrUndefined(limit)  ? null : parseInt(limit);
    this.meta.offset = toolkit.isNullOrUndefined(offset) ? null : parseInt(offset);

    return this;
  }

  PAGING(paging) {
    if (!paging || !paging.pagingStyle) return this;

    var pageNumber = paging.pageNumber || 1;
    var pageSize   = paging.pageSize   || 10;
    var pageIndex = (pageNumber - 1) * pageSize;

    if (paging.pagingStyle === 'normal') {
      this.meta.totalCount = true;
    }

    this.LIMIT(pageSize, pageIndex);

    return this;
  }

  PARAM(param) {
    var self = this;

    this.meta.params = this.meta.params || [];

    toolkit.asArray(param).forEach(function(p) {
      self.meta.params.push(p);
    });

    return this;
  }

  _appendSQL(parts, sql) {
    if (sql) {
      if (toolkit.startsWith(sql, ';')) {
        parts[parts.length - 1] += ';';
        sql = sql.slice(1).trim();
      }

      parts.push(sql);
    }

    return parts;
  }

  _joinSQLParts(parts) {
    var partsToJoin = []
    parts.forEach(function(p) {
      if (toolkit.notNothing(p)) {
        partsToJoin.push(`${p}`);
      }
    });

    return partsToJoin.join(' ').trim();
  }

  _genJoinClause() {
    if (toolkit.isNothing(this.meta.joinTables)) {
      return null;
    }

    var self = this;

    var parts = [];

    this.meta.joinTables.forEach(function(join) {
      if (join.type) {
        parts.push(join.type);
      }

      parts.push('JOIN');
      parts.push(join.table.asAlias());

      if (join.conditions) {
        parts.push('ON');

        join.conditions.forEach(function(c, index) {
          if (index > 0) {
            parts.push('AND');
          }

          parts.push(self._sqlConditionBuilder.genCondition(c));
        })
      }
    });

    return this._joinSQLParts(parts);
  }

  _genWhereClause() {
    if (this.meta.forceNoWhere) return null;
    if (toolkit.isNothing(this.meta.whereConditions)) return null;

    var self = this;

    var parts = [ 'WHERE' ];

    this.meta.whereConditions.forEach(function(c, index) {
      if (index > 0) {
        parts.push('AND');
      }

      parts.push(self._sqlConditionBuilder.genCondition(c));
    });

    return this._joinSQLParts(parts);
  }

  _genGroupByClause() {
    if (toolkit.isNothing(this.meta.groups)) return null;

    var self = this;

    var parts = [ 'GROUP BY' ];

    this.meta.groups.forEach(function(f, index) {
      var _expr = f.toString();
      if (index < self.meta.groups.length - 1) {
        _expr += ',';
      }

      parts.push(_expr);
    });

    return this._joinSQLParts(parts);
  }

  _genOrderByClause() {
    if (toolkit.isNothing(this.meta.orders)) return null;

    var self = this;

    var parts = [ 'ORDER BY' ];

    this.meta.orders.forEach(function(o, index) {
      var _expr = o.toString();
      if (index < self.meta.orders.length - 1) {
        _expr += ',';
      }

      parts.push(_expr);
    });

    return this._joinSQLParts(parts);
  }

  _genLimitClause() {
    if (toolkit.isNothing(this.meta.limit)) return null;

    var parts = [ 'LIMIT', this.meta.limit ];

    if (toolkit.notNothing(this.meta.offset)) {
      parts.push('OFFSET')
      parts.push(this.meta.offset);
    }

    return this._joinSQLParts(parts);
  }

  _genSelectSQL() {
    var self = this;

    var parts = [ 'SELECT' ];

    // DISTINCT
    if (this.meta.selectDistinct) {
      parts.push('DISTINCT');
    }

    // FIELDS
    if (toolkit.notNothing(this.meta.selectItems)) {
      this.meta.selectItems.forEach(function(f, index) {
        var _selectItem = f.asAlias();
        if (index < self.meta.selectItems.length - 1) {
          _selectItem += ',';
        }

        parts.push(_selectItem);
      });

    } else {
      parts.push('*');
    }

    // FROM TABLE
    parts.push('FROM');
    parts.push(this.meta.table.asAlias());

    // JOIN
    parts.push(this._genJoinClause());

    // WHERE
    parts.push(this._genWhereClause());

    // GROUP BY
    parts.push(this._genGroupByClause());

    // ORDER BY
    parts.push(this._genOrderByClause());

    // LIMIT
    parts.push(this._genLimitClause());

    // totalCount
    if (this.meta.totalCount) {
      parts.push('; SELECT');

      // DISTINCT
      if (this.meta.selectDistinct) {
        parts.push('DISTINCT');
      }

      // FIELDS
      parts.push(this.FUNC('COUNT', '*', 'totalCount').asAlias());

      // FROM TABLE
      parts.push('FROM');
      parts.push(this.meta.table.asAlias());

      // JOIN
      parts.push(this._genJoinClause());

      // WHERE
      parts.push(this._genWhereClause());
    }

    return this._joinSQLParts(parts);
  }

  _genInsertSQL() {
    var self = this;

    var parts = [ 'INSERT INTO' ];

    // TABLE
    parts.push(this.meta.table.toString());

    // COLUMNS
    var columeMap = {};
    this.meta.data.forEach(function(row) {
      for (var f in row) {
        columeMap[f] = true;
      }
    });

    var columes = Object.keys(columeMap);
    var columnTokens = columes.map(function(col) {
      return self.FIELD(col).toString();
    })
    parts.push(`(${columnTokens.join(', ')})`);

    // VALUES
    parts.push('VALUES')
    this.meta.data.forEach(function(row, index) {
      var values = [];
      columes.forEach(function(col) {
        if (col in row) {
          values.push(row[col].toString());
        } else {
          values.push('NULL');
        }
      });

      var _sep = '';
      if (index < self.meta.data.length - 1) {
        _sep = ',';
      }
      parts.push(`(${values.join(', ')})${_sep}`);
    });

    return this._joinSQLParts(parts);
  }

  _genUpdateSQL() {
    var self = this;

    var parts = [ 'UPDATE' ];

    // TABLE
    parts.push(this.meta.table.toString());

    // SET
    parts.push('SET');

    var mergedData = {};
    this.meta.data.forEach(function(d) {
      Object.assign(mergedData, d);
    });

    var fields = Object.keys(mergedData);
    fields.forEach(function(f, index) {
      var _sep = '';
      if (index < fields.length - 1) {
        _sep = ',';
      }
      parts.push(`${self.FIELD(f)} = ${mergedData[f]}${_sep}`);
    })

    // WHERE
    parts.push(this._genWhereClause());

    return this._joinSQLParts(parts);
  }

  _genDeleteSQL() {
    var parts = [ 'DELETE' ];

    // FROM TABLE
    parts.push('FROM');
    parts.push(this.meta.table.toString());

    // WHERE
    parts.push(this._genWhereClause());

    return this._joinSQLParts(parts);
  }

  _genDropTableSQL() {
    var parts = [
      'DROP TABLE IF EXISTS',
      this.meta.table.toString(),
    ];
    return this._joinSQLParts(parts);
  }

  _genTruncateSQL() {
    var parts = [
      'TRUNCATE TABLE',
      this.meta.table.toString(),
    ];
    return this._joinSQLParts(parts);
  }

  formatSQL(sql, sqlParam) {
    return formatSQL(sql, sqlParam, { sqlEscape: commonSQLEscape })
  }

  toString() {
    if (this.rawSQL) return this.rawSQL;

    var sql = null;

    try {
      switch (this.meta.type) {
        case 'SELECT':
          sql = this._genSelectSQL();
          break;

        case 'INSERT':
          sql = this._genInsertSQL();
          break;

        case 'UPDATE':
          sql = this._genUpdateSQL();
          break;

        case 'DELETE':
          sql = this._genDeleteSQL();
          break;

        case 'DROP_TABLE':
          sql = this._genDropTableSQL();
          break;

        case 'TRUNCATE':
          sql = this._genTruncateSQL();
          break;

        default:
          var e = new Error('No SQL type specified');
          throw e;
      }

    } catch(err) {
      var dumpData = {
        ENGINE: this.ENGINE,
        rawSQL: this.rawSQL,
        meta  : this.meta,
      }
      // console.log('SQLBuilder.toString() >>>>>', JSON.stringify(dumpData, null, 2))
      throw err;
    }

    if (this.meta.params) {
      sql = this.formatSQL(sql, this.meta.params);
    }

    sql += ';';
    return sql;
  }
};

exports.BaseSQLBuilder = BaseSQLBuilder;

// MySQL
class MySQLConditionBuilder extends BaseSQLConditionBuilder {
  _jsonarrayhas(f, v) {
    return `JSON_CONTAINS(${f}, JSON_QUOTE(${v}))`;
  }
};

class MySQLBuilder extends BaseSQLBuilder {
  get ENGINE() { return 'MySQL'; }

  get CONDITION_BUILDER_CLASS() { return MySQLConditionBuilder; }

  RAW(rawSQL, alias)       { return super.RAW(rawSQL, alias).setOptions({       quoteChar: '`' }); }
  TABLE(name, alias)       { return super.TABLE(name, alias).setOptions({       quoteChar: '`' }); }
  FIELD(name, alias)       { return super.FIELD(name, alias).setOptions({       quoteChar: '`' }); }
  ORDER(name, method)      { return super.ORDER(name, method).setOptions({      quoteChar: '`' }); }
  VALUE(value, alias)      { return super.VALUE(value, alias).setOptions({      quoteChar: '`' }); }
  PLACEHOLDER(isKeyword)   { return super.PLACEHOLDER(isKeyword).setOptions({   quoteChar: '`' }); }
  EXPR(conditions, alias)  { return super.EXPR(conditions, alias).setOptions({  quoteChar: '`' }); }
  FUNC(func, exprs, alias) { return super.FUNC(func, exprs, alias).setOptions({ quoteChar: '`' }); }

  BYTE_SIZE(item, alias) {
    return this.FUNC('LENGTH', item, alias);
  }

  formatSQL(sql, sqlParam) {
    return formatSQL(sql, sqlParam, { sqlEscape: mysqlEscape })
  }
};

exports.MySQLBuilder = MySQLBuilder;

// PostgreSQL
class PostgreSQLConditionBuilder extends BaseSQLConditionBuilder {
  _jsonarrayhas(f, v) {
    return `${f}::jsonb ? ${v}`;
  }
};

class PostgreSQLBuilder extends BaseSQLBuilder {
  get ENGINE() { return 'PostgreSQL'; };

  get CONDITION_BUILDER_CLASS() { return PostgreSQLConditionBuilder; }

  RAW(rawSQL, alias)       { return super.RAW(rawSQL, alias).setOptions({       quoteChar: '"', sqlEscape: postgresqlEscape }); }
  TABLE(name, alias)       { return super.TABLE(name, alias).setOptions({       quoteChar: '"', sqlEscape: postgresqlEscape }); }
  FIELD(name, alias)       { return super.FIELD(name, alias).setOptions({       quoteChar: '"', sqlEscape: postgresqlEscape }); }
  ORDER(name, method)      { return super.ORDER(name, method).setOptions({      quoteChar: '"', sqlEscape: postgresqlEscape }); }
  VALUE(value, alias)      { return super.VALUE(value, alias).setOptions({      quoteChar: '"', sqlEscape: postgresqlEscape }); }
  PLACEHOLDER(isKeyword)   { return super.PLACEHOLDER(isKeyword).setOptions({   quoteChar: '"', sqlEscape: postgresqlEscape }); }
  EXPR(conditions, alias)  { return super.EXPR(conditions, alias).setOptions({  quoteChar: '"', sqlEscape: postgresqlEscape }); }
  FUNC(func, exprs, alias) { return super.FUNC(func, exprs, alias).setOptions({ quoteChar: '"', sqlEscape: postgresqlEscape }); }

  BYTE_SIZE(item, alias) {
    return this.FUNC('OCTET_LENGTH', item, alias);
  }

  formatSQL(sql, sqlParam) {
    return formatSQL(sql, sqlParam, { sqlEscape: postgresqlEscape })
  }
}

exports.PostgreSQLBuilder = PostgreSQLBuilder;
