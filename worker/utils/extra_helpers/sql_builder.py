# Built-in Modules
import json
import datetime

# 3rd-party Modules
import arrow

# Project Modules
from worker.utils import toolkit
from worker.utils.extra_helpers import format_sql, common_sql_escape, mysql_escape, postgresql_escape

# SQL Token
class SQLBaseToken(object):
    def __init__(self, alias=None):
        self._quote_char = ''
        self._timezone   = None
        self._sql_escape = common_sql_escape

        self.alias = alias or None

    def set_options(self, quote_char=None, timezone=None, sql_escape=None):
        if quote_char:
            self._quote_char = quote_char

        if timezone:
            self._timezone = timezone

        if sql_escape:
            self._sql_escape = sql_escape

        return self

    def get_quoted(self, token):
        token_parts = []
        for p in token.split('.'):
            if p == '*':
                token_parts.append(p)
            else:
                token_parts.append(f'{self._quote_char}{p}{self._quote_char}')

        return '.'.join(token_parts)

    def as_alias(self):
        s = str(self)
        if self.alias:
            s += f' AS {self._quote_char}{self.alias}{self._quote_char}'

        return s

    def to_json(self):
        return json.dumps(self.__dict__)

class SQLRaw(SQLBaseToken):
    def __init__(self, raw_sql, alias=None):
        super().__init__(alias)

        self.raw_sql = raw_sql

    def __str__(self):
        return self.raw_sql

class SQLTable(SQLBaseToken):
    def __init__(self, name, alias=None):
        super().__init__(alias)

        self.name = name

    def __str__(self):
        return self.get_quoted(self.name)

class SQLField(SQLBaseToken):
    def __init__(self, name, alias=None):
        super().__init__(alias)

        self.name = name

    def __str__(self):
        return self.get_quoted(self.name)

class SQLOrder(SQLBaseToken):
    def __init__(self, name, method=None):
        super().__init__()

        self.name   = name
        self.method = method

    def __str__(self):
        quoted_name = self.get_quoted(self.name)

        if self.method:
            return f'{quoted_name} {self.method.upper()}'
        else:
            return f'{quoted_name} ASC'

class SQLValue(SQLBaseToken):
    def __init__(self, value, alias=None):
        super().__init__(alias)

        self.value = value

    def to_like_pattern(self, mode=None):
        if isinstance(mode, str):
            mode = mode.lower()

        if '%' in self.value:
            return self._sql_escape(self.value)
        elif mode == 'prelike':
            return self._sql_escape(f"{self.value}%")
        elif mode == 'suflike':
            return self._sql_escape(f"%{self.value}")
        else:
            return self._sql_escape(f"%{self.value}%")

    def to_value_list(self):
        return list(map(lambda v: v if isinstance(v, self.__class__) else self.__class__(v), toolkit.as_array(self.value)))

    def __str__(self):
        token = None

        if isinstance(self.value, bool):
            # token = 'TRUE' if self.value else 'FALSE'
            token = '1' if self.value else '0'

        elif isinstance(self.value, (int, float)):
            token = f'{self.value}'

        elif isinstance(self.value, str):
            token = self._sql_escape(self.value)

        else:
            if self.value is None:
                # NULL
                token = 'NULL'

            elif isinstance(self.value, (list, tuple, set)):
                # List
                _value_list = map(lambda v: str(v), self.to_value_list())
                token = ', '.join(_value_list)

            elif isinstance(self.value, (arrow.Arrow, datetime.datetime)):
                # Date time
                _value = arrow.get(self.value)
                if self._timezone is not None:
                    _value = _value.to(self._timezone)
                token = self._sql_escape(_value.format('YYYY-MM-DD HH:mm:ss'))

            else:
                # Other
                token = self._sql_escape(self.value)

        return token

class SQLFunc(SQLBaseToken):
    def __init__(self, func, exprs=None, alias=None):
        super().__init__(alias)

        self.func  = func
        self.exprs = exprs or []

    def __str__(self):
        token_list = map(lambda expr: str(expr), self.exprs)
        return f"{self.func.upper()}({', '.join(token_list)})"

class SQLPlaceholder(SQLBaseToken):
    def __init__(self, is_keyword):
        super().__init__()

        self.is_keyword = is_keyword

    def __str__(self):
        return f'{self._quote_char}??{self._quote_char}' if self.is_keyword else '?'

# SQL condition builder
class BaseSQLConditionBuilder(object):
    def __init__(self, sql_builder):
        self.sql_builder = sql_builder

    @property
    def OP_ALIAS(self):
        return {
            '=' : 'eq',
            '>' : 'gt',
            '<' : 'lt',
            '>=': 'ge',
            '<=': 'le',
            '!=': 'ne',
            '<>': 'ne',
        }

    def gen_condition(self, c):
        c = toolkit.as_array(c)

        parts = []
        for _c in c:
            op = (_c.get('OP') or 'eq').lower()
            op = self.OP_ALIAS.get(op) or op
            op = '_' + op

            if not hasattr(self, op):
                e = Exception(f"Unsupported operation: {_c.get('OP')}")
                raise e

            left  = _c.get('LEFT')
            right = _c.get('RIGHT')

            parts.append(f'({getattr(self, op)(left, right)})')

        if len(parts) > 1:
            return f"({' OR '.join(parts)})"
        else:
            return parts[0]

    def _raw(self, f, v):
        return str(v)

    def _isnull(self, f, v=None):
        if v is None:
            v = True

        if toolkit.to_boolean(v):
            return f'{f} IS NULL'
        else:
            return f'{f} IS NOT NULL'

    def _isnotnull(self, f, v=None):
        if v is None:
            v = True

        return self._isnull(f, not toolkit.to_boolean(v))

    def _eq(self, f, v):
        if isinstance(v, SQLValue) and v.value is None:
            return self._isnull(f, True)
        elif isinstance(v, SQLValue) and isinstance(v.value, (list, tuple, set)):
            return self._in(f, v)
        else:
            return f'{f} = {v}'

    def _ne(self, f, v):
        if isinstance(v, SQLValue) and v.value is None:
            return self._isnotnull(f, True)
        elif isinstance(v, SQLValue) and isinstance(v.value, (list, tuple, set)):
            return this._notin(f, v)
        else:
            return f'{f} != {v}'

    def _gt(self, f, v):
        return f'{f} > {v}'

    def _lt(self, f, v):
        return f'{f} < {v}'

    def _ge(self, f, v):
        return f'{f} >= {v}'

    def _le(self, f, v):
        return f'{f} <= {v}'

    def _like(self, f, v):
        return f"{f} LIKE {v.to_like_pattern()}"

    def _notlike(self, f, v):
        return f"{f} NOT LIKE {v.to_like_pattern()}"

    def _prelike(self, f, v):
        return f"{f} LIKE {v.to_like_pattern('prelike')}"

    def _suflike(self, f, v):
        return f"{f} LIKE {v.to_like_pattern('suflike')}"

    def _in(self, f, v):
        return f'{f} IN ({v})'

    def _notin(self, f, v):
        return f'{f} NOT IN ({v})'

    def _fuzzysearch(self, f, v):
        f = toolkit.as_array(f)

        sql_parts = []
        for _f in f:
            sql_parts.append(self._like(_f, v))

        return ' OR '.join(sql_parts)

    def _boolean(self, f, v=None):
        if v is None:
            v = True

        if toolkit.to_boolean(v):
            return f'{f} = 1'
        else:
            return f'{f} != 1'

    def _jsonarrayhas(self, f, v):
        raise NotImplementedError()

    def _jsonarrayhasall(self, f, v):
        values = toolkit.as_array(v.value)
        sql_parts = []
        for value in values:
            sql_parts.append(self._jsonarrayhas(f, self.sql_builder.VALUE(value)))

        return ' AND '.join(sql_parts)

    def _jsonarrayhasany(self, f, v):
        values = toolkit.as_array(v.value)
        sql_parts = []
        for value in values:
            sql_parts.append(self._jsonarrayhas(f, self.sql_builder.VALUE(value)))

        return ' OR '.join(sql_parts)

# SQL builder
class BaseSQLBuilder(object):
    def __init__(self, raw_sql=None):
        self.raw_sql = raw_sql
        self.meta = {
            'comment'        : None,
            'type'           : None,
            'selectDistinct' : False,
            'totalCount'     : False,
            'table'          : None,
            'joinTables'     : None,
            'whereConditions': None,
            'groups'         : None,
            'orders'         : None,
            'limit'          : None,
            'offset'         : None,
            'selectItems'    : None,
            'data'           : None,
            'params'         : None,
            'forceNoWhere'   : False,
        }

        self._timezone = '+08:00'
        self._sqlConditionBuilder = self.CONDITION_BUILDER_CLASS(self)

    def check_safty(self):
        if self.meta.get('type') in ( 'UPDATE', 'DELETE' ) \
            and not self.meta.get('whereConditions') \
            and not self.meta.get('forceNoWhere'):
            raise Exception(f'UPDATE or DELETE SQL without WHERE conditions is not allowed: {str(self)}')

        return self

    def set_timezone(self, tz):
        self._timezone = tz
        return self

    @property
    def ENGINE(self):
        return 'BASE'

    @property
    def CONDITION_BUILDER_CLASS(self):
        return BaseSQLConditionBuilder

    def RAW(self, raw_sql, alias=None):
        return SQLRaw(raw_sql, alias).set_options(timezone=self._timezone)

    def TABLE(self, name, alias=None):
        return SQLTable(name, alias).set_options(timezone=self._timezone)

    def ORDER(self, name, method=None):
        return SQLOrder(name, method).set_options(timezone=self._timezone)

    def FIELD(self, name, alias=None):
        return SQLField(name, alias).set_options(timezone=self._timezone)

    def VALUE(self, value, alias=None):
        return SQLValue(value, alias).set_options(timezone=self._timezone)

    def PLACEHOLDER(self, is_keyword=False):
        return SQLPlaceholder(is_keyword).set_options(timezone=self._timezone)

    def EXPR(self, conditions, alias=None):
        _condition = self._prepare_conditions(conditions, 'FIELD', 'VALUE')

        parts = []
        for index, c in enumerate(_condition):
            if index > 0:
                parts.append('AND')

            parts.append(self._sqlConditionBuilder.gen_condition(c))

        return self.RAW(f"({self._join_sql_parts(parts)})", alias)

    def FUNC(self, func, exprs=None, alias=None):
        _exprs = toolkit.as_array(exprs or [])
        _exprs = list(map(lambda expr: expr if isinstance(expr, SQLBaseToken) else self.VALUE(expr), _exprs))

        return SQLFunc(func, _exprs, alias)

    def _prepare_conditions(self, conditions, default_left, default_right):
        # Simplified writing, e.g:
        #   { 'id': 123 }
        #   { LEFT: 'id', RIGHT: 123 }
        # Convert to standard writing:
        #   { LEFT: 'id', OP: '=', RIGHT: 123 }
        prepared_conditions = []
        for c in toolkit.as_array(conditions):
            if isinstance(c, (list, tuple, set)):
                # Array condition list
                prepared_conditions.append(self._prepare_conditions(c, default_left, default_right))

            elif isinstance(c, dict):
                # General conditions
                if ('LEFT' not in c) and ('OP' not in c) and ('RIGHT' not in c):
                    for _left, _right in c.items():
                        if not isinstance(_left, SQLBaseToken):
                            _left = getattr(self, default_left)(_left)
                        if not isinstance(_right, SQLBaseToken):
                            _right = getattr(self, default_right)(_right)

                        prepared_conditions.append({
                            'LEFT' : _left,
                            'OP'   : 'eq',
                            'RIGHT': _right,
                        })

                else:
                    if 'LEFT' in c and not isinstance(c['LEFT'], SQLBaseToken):
                        if isinstance(c['LEFT'], (list, tuple, set)):
                            c['LEFT'] = list(map(lambda _f: self.FIELD(_f) if not isinstance(_f, SQLBaseToken) else _f, c['LEFT']))
                        else:
                            c['LEFT'] = getattr(self, default_left)(c['LEFT'])

                    if 'RIGHT' in c and not isinstance(c['RIGHT'], SQLBaseToken):
                        c['RIGHT'] = getattr(self, default_right)(c['RIGHT'])

                    c['OP'] = (c.get('OP') or 'eq').lower()

                    prepared_conditions.append(c)

            else:
                e = TypeError(f'Invalid conditions: `{json.dumps(conditions, default=str)}`')
                raise e

        return prepared_conditions

    def COMMENT(self, comment):
        self.meta['comment'] = comment

        return self

    def FROM(self, table, alias=None):
        if not isinstance(table, SQLBaseToken):
            table = self.TABLE(table, alias)

        self.meta['table'] = table

        return self

    def DISTINCT(self):
        self.meta['selectDistinct'] = True
        return self

    def SELECT(self, select_item, alias=None, replace_mode=False):
        self.meta['type'] = 'SELECT'

        if replace_mode:
            self.meta['selectItems'] = []
        else:
            self.meta['selectItems'] =self.meta.get('selectItems') or []

        if not isinstance(select_item, (list, tuple, set, SQLBaseToken)):
            select_item = self.FIELD(select_item, alias)

        for item in toolkit.as_array(select_item):
            if not isinstance(item, SQLBaseToken):
                item = self.FIELD(item)

            self.meta['selectItems'].append(item)

        return self

    def SELECT_COUNT(self):
        return self.SELECT(self.FUNC('COUNT', self.FIELD('*'), 'count'))

    def SELECT_DISTINCT(self, select_item, alias=None):
        return self.SELECT(select_item, alias).DISTINCT()

    def _join(self, join_type, table, alias=None, conditions=None):
        if isinstance(alias, dict):
            conditions = alias
            alias      = None

        if not isinstance(table, SQLBaseToken):
            table = self.TABLE(table, alias)

        self.meta['joinTables'] = self.meta.get('joinTables') or []

        # All expressions in a JOIN condition default to fields
        conditions = self._prepare_conditions(conditions, 'FIELD', 'FIELD')

        self.meta['joinTables'].append({
            'type'     : join_type,
            'table'    : table,
            'conditions': conditions,
        })

        return self

    def JOIN(self, table, alias=None, conditions=None):
        return self._join(None, table, alias=alias, conditions=conditions)

    def LEFT_JOIN(self, table, alias=None, conditions=None):
        return self._join('LEFT', table, alias=alias, conditions=conditions)

    def RIGHT_JOIN(self, table, alias=None, conditions=None):
        return self._join('RIGHT', table, alias=alias, conditions=conditions)

    def INSERT_INTO(self, table):
        self.meta['type'] = 'INSERT'

        if not isinstance(table, SQLBaseToken):
            table = self.TABLE(table)

        self.meta['table'] = table

        return self

    def INSERT(self, table):
        return self.INSERT_INTO(table)

    def VALUES(self, data):
        if self.meta.get('type') != 'INSERT':
            e = Exception('Only INSERT SQL supports VALUES operation')
            raise e

        self.meta['data'] = self.meta.get('data') or []

        for d in toolkit.as_array(data):
            row = {}
            for f, v in d.items():
                row[f] = v if isinstance(v, SQLBaseToken) else self.VALUE(v)

            self.meta['data'].append(row)

        return self

    def UPDATE_VALUES(self, data, skip_exists=False):
        if self.meta.get('type') != 'INSERT':
            e = Exception('Only INSERT SQL supports VALUES operation')
            raise e

        self.meta['data'] = self.meta.get('data') or []

        for row in self.meta['data']:
            for f, v in data.items():
                if skip_exists and f in row:
                    continue

                row[f] = v if isinstance(v, SQLBaseToken) else self.VALUE(v)

        return self

    def UPDATE(self, table):
        self.meta['type'] = 'UPDATE'

        if not isinstance(table, SQLBaseToken):
            table = self.TABLE(table)

        self.meta['table'] = table

        return self

    def SET(self, data):
        if self.meta.get('type') != 'UPDATE':
            e = Exception('Only UPDATE SQL supports SET operation')
            raise e

        self.meta['data'] = self.meta.get('data') or []

        if len(self.meta['data']) <= 0:
            self.meta['data'].append({})

        set_data = self.meta['data'][0]
        for d in toolkit.as_array(data):
            for f, v in d.items():
                set_data[f] = v if isinstance(v, SQLBaseToken) else self.VALUE(v)

        return self

    def DELETE_FROM(self, table):
        self.meta['type'] = 'DELETE'

        if table:
            self.FROM(table)

        return self

    def DELETE(self, table):
        return self.DELETE_FROM(table)

    def DROP_TABLE(self, table):
        self.meta['type'] = 'DROP_TABLE'
        return self.FROM(table)

    def TRUNCATE(self, table):
        self.meta['type'] = 'TRUNCATE'
        return self.FROM(table)

    def FORCE_NO_WHERE(self):
        self.meta['forceNoWhere'] = True
        return self

    def WHERE(self, conditions):
        self.meta['whereConditions'] = self.meta.get('whereConditions') or []

        # In a WHERE condition, the left expression defaults to the field and the right expression defaults to the value
        conditions = self._prepare_conditions(conditions, 'FIELD', 'VALUE')

        self.meta['whereConditions'].extend(conditions)

        return self

    def GROUP_BY(self, field):
        self.meta['groups'] = self.meta.get('groups') or []

        for f in toolkit.as_array(field):
            f = f if isinstance(f, SQLBaseToken) else self.FIELD(f)
            self.meta['groups'].append(f)

        return self

    def ORDER_BY(self, field, method=None):
        self.meta['orders'] = self.meta.get('orders') or []

        for f in toolkit.as_array(field):
            f = f if isinstance(f, SQLBaseToken) else self.ORDER(f, method)
            self.meta['orders'].append(f)

        return self

    def LIMIT(self, limit, offset=None):
        self.meta['limit']  = None if limit  is None else int(limit)
        self.meta['offset'] = None if offset is None else int(offset)

        return self

    def PAGING(self, paging=None, **kwargs):
        paging = paging or kwargs

        if not paging or not paging.get('pagingStyle'):
            return self

        page_number = paging.get('pageNumber') or 1
        page_size   = paging.get('pageSize')   or 10
        page_index  = (page_number - 1) * page_size

        if paging.get('pagingStyle') == 'normal':
            self.meta['totalCount'] = True

        self.LIMIT(page_size, page_index)

        return self

    def PARAM(self, param):
        self.meta['params'] = self.meta.get('params') or []

        for p in toolkit.as_array(param):
            self.meta['params'].append(p)

        return self

    def _append_sql(self, parts, sql):
        if sql:
            if sql.startswith(';'):
                parts[-1] += ';'
                sql = sql[1:].strip()

            parts.append(sql)

        return parts

    def _join_sql_parts(self, parts):
        parts_to_join = []
        for p in parts:
            if p is not None and p != '':
                parts_to_join.append(str(p))

        return ' '.join(parts_to_join).strip()

    def _gen_join_clause(self):
        if not self.meta.get('joinTables'):
            return

        parts = []

        for join in self.meta['joinTables']:
            if join.get('type'):
                parts.append(join['type'])

            parts.append('JOIN')
            parts.append(join['table'].as_alias())

            if join.get('conditions'):
                parts.append('ON')

                for index, c in enumerate(join['conditions']):
                    if index > 0:
                        parts.append('AND')

                    parts.append(self._sqlConditionBuilder.gen_condition(c))

        return self._join_sql_parts(parts)

    def _gen_where_clause(self):
        if self.meta.get('forceNoWhere'):
            return

        if not self.meta.get('whereConditions'):
            return

        parts = [ 'WHERE' ]

        for index, c in enumerate(self.meta['whereConditions']):
            if index > 0:
                parts.append('AND')

            parts.append(self._sqlConditionBuilder.gen_condition(c))

        return self._join_sql_parts(parts)

    def _gen_group_by_clause(self):
        if not self.meta.get('groups'):
            return

        parts = [ 'GROUP BY' ]

        for index, f in enumerate(self.meta['groups']):
            _token = str(f)
            if index < len(self.meta['groups']) - 1:
                _token += ','

            parts.append(_token)

        return self._join_sql_parts(parts)

    def _gen_order_by_clause(self):
        if not self.meta.get('orders'):
            return

        parts = [ 'ORDER BY' ]

        for index, o in enumerate(self.meta['orders']):
            _token = str(o)
            if index < len(self.meta['orders']) - 1:
                _token += ','

            parts.append(_token)

        return self._join_sql_parts(parts)

    def _gen_limit_clause(self):
        if self.meta.get('limit') is None:
            return

        parts = [ 'LIMIT', self.meta['limit'] ]

        if self.meta.get('offset') is not None:
            parts.append('OFFSET')
            parts.append(self.meta['offset'])

        return self._join_sql_parts(parts)

    def _gen_select_sql(self):
        parts = [ 'SELECT' ]

        # DISTINCT
        if self.meta.get('selectDistinct'):
            parts.append('DISTINCT')

        # FIELDS
        if self.meta.get('selectItems'):
            for index, f in enumerate(self.meta['selectItems']):
                _token = f.as_alias()
                if index < len(self.meta['selectItems']) - 1:
                    _token += ','

                parts.append(_token)
        else:
            parts.append('*')

        # FROM TABLE
        parts.append('FROM')
        parts.append(self.meta['table'].as_alias())

        # JOIN
        parts.append(self._gen_join_clause())

        # WHERE
        parts.append(self._gen_where_clause())

        # GROUP BY
        parts.append(self._gen_group_by_clause())

        # ORDER BY
        parts.append(self._gen_order_by_clause())

        # LIMIT
        parts.append(self._gen_limit_clause())

        # totalCount
        if self.meta['totalCount']:
            parts.append('; SELECT')

            # DISTINCT
            if self.meta.get('selectDistinct'):
                parts.append('DISTINCT')

            # FIELDS
            parts.append(self.FUNC('COUNT', '*', 'totalCount').as_alias())

            # FROM TABLE
            parts.append('FROM')
            parts.append(self.meta['table'].as_alias())

            # JOIN
            parts.append(self._gen_join_clause())

            # WHERE
            parts.append(self._gen_where_clause())

        return self._join_sql_parts(parts)

    def _gen_insert_sql(self):
        parts = [ 'INSERT INTO' ]

        # TABLE
        parts.append(str(self.meta['table']))

        # COLUMNS
        columns = []
        for row in self.meta['data']:
            for col in row:
                if col not in columns:
                    columns.append(col)

        column_tokens = map(lambda col: str(self.FIELD(col)), columns)
        parts.append(f"({', '.join(column_tokens)})")

        # VALUES
        parts.append('VALUES')
        for index, row in enumerate(self.meta['data']):
            values = []
            for col in columns:
                if col in row:
                    values.append(str(row[col]))
                else:
                    values.append('NULL')

            _sep = ''
            if index < len(self.meta['data']) - 1:
                _sep = ','
            parts.append(f"({', '.join(values)}){_sep}")

        return self._join_sql_parts(parts)

    def _gen_update_sql(self):
        parts = [ 'UPDATE' ]

        # TABLE
        parts.append(str(self.meta['table']))

        # SET
        parts.append('SET')

        merged_data = {}
        for d in self.meta['data']:
            merged_data.update(d)

        fields = list(merged_data.keys())
        for index, f in enumerate(fields):
            _sep = ''
            if index < len(fields) - 1:
                _sep = ','
            parts.append(f'{self.FIELD(f)} = {merged_data[f]}{_sep}')

        # WHERE
        parts.append(self._gen_where_clause())

        return self._join_sql_parts(parts)

    def _gen_delete_sql(self):
        parts = [ 'DELETE' ]

        # FROM TABLE
        parts.append('FROM')
        parts.append(str(self.meta['table']))

        # WHERE
        parts.append(self._gen_where_clause())

        return self._join_sql_parts(parts)

    def _gen_drop_table_sql(self):
        parts = [
            'DROP TABLE IF EXISTS',
            str(self.meta['table']),
        ]
        return self._join_sql_parts(parts)

    def _gen_truncate_sql(self):
        parts = [
            'TRUNCATE TABLE',
            str(self.meta['table']),
        ]
        return self._join_sql_parts(parts)

    def format_sql(self, sql, sql_params):
        return format_sql(sql, sql_params, sql_escape=common_sql_escape)

    def __str__(self):
        if self.raw_sql:
            return self.raw_sql

        sql = None
        sql_type = self.meta.get('type')

        try:
            if sql_type == 'SELECT':
                sql = self._gen_select_sql()

            elif sql_type == 'INSERT':
                sql = self._gen_insert_sql()

            elif sql_type == 'UPDATE':
                sql = self._gen_update_sql()

            elif sql_type == 'DELETE':
                sql = self._gen_delete_sql()

            elif sql_type == 'DROP_TABLE':
                sql = self._gen_drop_table_sql()

            elif sql_type == 'TRUNCATE':
                sql = self._gen_truncate_sql()

            else:
                e = Exception('No SQL type specified')
                raise e

        except Exception as e:
            dump_data = {
                'ENGINE' : self.ENGINE,
                'raw_sql': self.raw_sql,
                'meta'   : self.meta,
            }
            # print('SQLBuilder.__str__() >>>>>', json.dumps(dump_data, indent=2, default=lambda obj: obj.to_json()))
            raise

        if self.meta.get('params'):
            sql = self.format_sql(sql, self.meta['params'])

        sql += ';'
        return sql

# MySQL
class MySQLConditionBuilder(BaseSQLConditionBuilder):
    def _jsonarrayhas(self, f, v):
        return f'JSON_CONTAINS({f}, JSON_QUOTE({v}))'

class MySQLBuilder(BaseSQLBuilder):
    @property
    def ENGINE(self):
        return 'MySQL'

    @property
    def CONDITION_BUILDER_CLASS(self):
        return MySQLConditionBuilder

    def RAW(self, rawSQL, alias=None):
        return super().RAW(rawSQL, alias).set_options(quote_char='`')

    def TABLE(self, name, alias=None):
        return super().TABLE(name, alias).set_options(quote_char='`')

    def FIELD(self, name, alias=None):
        return super().FIELD(name, alias).set_options(quote_char='`')

    def ORDER(self, name, method=None):
        return super().ORDER(name, method).set_options(quote_char='`')

    def VALUE(self, value, alias=None):
        return super().VALUE(value, alias).set_options(quote_char='`')

    def PLACEHOLDER(self, isKeyword=None):
        return super().PLACEHOLDER(isKeyword).set_options(quote_char='`')

    def EXPR(self, conditions, alias=None):
        return super().EXPR(conditions, alias).set_options(quote_char='`')

    def FUNC(self, func, exprs=None, alias=None):
        return super().FUNC(func, exprs, alias).set_options(quote_char='`')

    def BYTE_SIZE(self, item, alias=None):
        return self.FUNC('LENGTH', item, alias)

    def format_sql(self, sql, sql_params):
        return format_sql(sql, sql_params, sql_escape=mysql_escape)

# PostgreSQL
class PostgreSQLConditionBuilder(BaseSQLConditionBuilder):
    def _jsonarrayhas(self, f, v):
        return f'{f}::jsonb ? {v}'

class PostgreSQLBuilder(BaseSQLBuilder):
    @property
    def ENGINE(self):
        return 'PostgreSQL'

    @property
    def CONDITION_BUILDER_CLASS(self):
        return PostgreSQLConditionBuilder

    def RAW(self, rawSQL, alias=None):
        return super().RAW(rawSQL, alias).set_options(quote_char='"', sql_escape=postgresql_escape)

    def TABLE(self, name, alias=None):
        return super().TABLE(name, alias).set_options(quote_char='"', sql_escape=postgresql_escape)

    def FIELD(self, name, alias=None):
        return super().FIELD(name, alias).set_options(quote_char='"', sql_escape=postgresql_escape)

    def ORDER(self, name, method=None):
        return super().ORDER(name, method).set_options(quote_char='"', sql_escape=postgresql_escape)

    def VALUE(self, value, alias=None):
        return super().VALUE(value, alias).set_options(quote_char='"', sql_escape=postgresql_escape)

    def PLACEHOLDER(self, isKeyword=None):
        return super().PLACEHOLDER(isKeyword).set_options(quote_char='"', sql_escape=postgresql_escape)

    def EXPR(self, conditions, alias=None):
        return super().EXPR(conditions, alias).set_options(quote_char='"', sql_escape=postgresql_escape)

    def FUNC(self, func, exprs=None, alias=None):
        return super().FUNC(func, exprs, alias).set_options(quote_char='"', sql_escape=postgresql_escape)

    def BYTE_SIZE(self, item, alias=None):
        return self.FUNC('OCTET_LENGTH', item, alias)

    def format_sql(self, sql, sql_params):
        return format_sql(sql, sql_params, sql_escape=postgresql_escape)
