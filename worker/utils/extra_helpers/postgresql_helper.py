# -*- coding: utf-8 -*-

# Built-in Modules
import re
import time
import traceback

# 3rd-party Modules
import arrow
import psycopg2
from dbutils.pooled_db import PooledDB
import sqlparse

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.utils.extra_helpers import format_sql, postgresql_escape, table_to_guance_dql_like_result
from worker.utils.extra_helpers import to_dict_rows
from worker.utils.extra_helpers.sql_builder import PostgreSQLBuilder

CONFIG = yaml_resources.get('CONFIG')

def get_config(c):
    _encoding = c.get('encoding') or c.get('charset') or 'utf8'

    config = {
        'host'           : c.get('host') or '127.0.0.1',
        'port'           : c.get('port') or 5432,
        'user'           : c.get('user'),
        'password'       : c.get('password'),
        'dbname'         : c.get('dbname') or c.get('database'),
        'client_encoding': _encoding,

        'connect_timeout': CONFIG['_DB_CONN_TIMEOUT'],
        'maxusage'       : CONFIG['_DB_POOL_MAX_USAGE'],
        'maxconnections': c.get('maxconnections') or 1,
    }
    return config

CLIENT_CREATE_TIME = 0
CLIENT_CONFIG      = None
CLIENT             = None

class FuncPostgreSQLHelper(object):
    db_name = 'PostgreSQL'

    def __init__(self, logger, config=None, database=None, pool_size=None, *args, **kwargs):
        self.logger = logger

        self.skip_log = False

        if config:
            if database:
                config['database'] = database

            if pool_size:
                config['maxconnections'] = pool_size

            self.config = config
            self.client = PooledDB(psycopg2, **get_config(config))

        else:
            global CLIENT_CREATE_TIME
            global CLIENT_CONFIG
            global CLIENT

            if CLIENT and time.time() - CLIENT_CREATE_TIME > CONFIG['_DB_POOL_RECYCLE_TIMEOUT']:
                # TODO Close the connection pool?
                CLIENT.close()

                CLIENT_CREATE_TIME = None
                CLIENT             = None

            if not CLIENT:
                CLIENT_CREATE_TIME = time.time()
                CLIENT_CONFIG = {
                    'host'          : CONFIG['POSTGRESQL_HOST'],
                    'port'          : CONFIG['POSTGRESQL_PORT'],
                    'user'          : CONFIG['POSTGRESQL_USER'],
                    'password'      : CONFIG['POSTGRESQL_PASSWORD'],
                    'database'      : CONFIG['POSTGRESQL_DATABASE'],
                    'encoding'      : CONFIG['_POSTGRESQL_ENCODING'],
                    'maxconnections': CONFIG['_DB_POOL_SIZE_WORKER'],
                }
                CLIENT = PooledDB(psycopg2, **get_config(CLIENT_CONFIG))

            self.config = CLIENT_CONFIG
            self.client = CLIENT

    def __del__(self):
        # Do not close the default DB connection/pool
        if not self.client or self.client is CLIENT or not isinstance(self.client, PooledDB):
            return

        try:
            self.client.close()

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

        finally:
            self.client = None

    @classmethod
    def format_sql(cls, sql, sql_params=None, pretty=False):
        return format_sql(sql, sql_params, pretty, sql_escape=postgresql_escape)

    @property
    def timezone(self):
        return self.config.get('timezone') or CONFIG.get('TIMEZONE')

    def check(self):
        try:
            sql = self.create_sql_builder('SELECT 1')
            self.query(sql)

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

            raise

    def tables(self):
        sql = self.create_sql_builder('''
            SELECT
                relname AS name
            FROM
                pg_stat_user_tables
            ORDER BY
                relname ASC
        ''')

        db_res = self.query(sql)

        tables = list(map(lambda x: x['name'], db_res))
        return tables

    def table_status(self):
        sql = self.create_sql_builder('''
            SELECT
                relname    AS name,
                n_live_tup AS rows,

                pg_table_size(relid)   AS data_length,
                pg_indexes_size(relid) AS index_length
            FROM
                pg_stat_user_tables
            ORDER BY
                relname ASC
        ''')

        db_res = self.query(sql)

        table_status = {}
        for d in db_res:
            total_size   = (d['data_length'] or 0) + (d['index_length'] or 0)
            avg_row_size = int(total_size / d['rows']) if d.get('rows') else 0

            t = {
                'name'   : d['name'],
                'rows'   : d.get('rows') or 0,

                'dataSize'  : d.get('data_length')  or 0,
                'indexSize' : d.get('index_length') or 0,
                'totalSize' : total_size,
                'avgRowSize': avg_row_size,
            }

            table_status[d['name']] = t

        return table_status

    def clear_table(self, table):
        # Check if table exists
        sql = self.create_sql_builder('''
            SELECT
                relname
            FROM
                pg_stat_user_tables
            WHERE
                relname = ?
        ''')
        sql_params = [ table ]

        db_res = self.query(sql, sql_params)
        if not db_res:
            self.logger.debug(f'[POSTGRESQL] The table `{table}` is not exist, skip clearing')
            return

        # Check if data exists
        sql = self.create_sql_builder('SELECT * FROM ?? LIMIT 1')
        sql_params = [ table ]

        has_data = bool(self.query(sql, sql_params))
        if not has_data:
            self.logger.debug(f'[POSTGRESQL] The table `{table}` has no data, skip clearing')
            return

        # Do truncate
        sql = self.create_sql_builder()
        sql.TRUNCATE(table)

        self.query(sql)

    def start_trans(self):
        if not self.skip_log:
            self.logger.debug('[POSTGRESQL] Trans START')

        conn = self.client.connection()
        cur  = conn.cursor()

        trans_conn = {
            'conn': conn,
            'cur' : cur,
        }

        return trans_conn

    def commit(self, trans_conn):
        if not trans_conn:
            return

        if not self.skip_log:
            self.logger.debug('[POSTGRESQL] Trans COMMIT')

        conn = trans_conn.get('conn')
        cur  = trans_conn.get('cur')

        conn.commit()

        cur.close()
        conn.close()

    def rollback(self, trans_conn):
        if not trans_conn:
            return

        if not self.skip_log:
            self.logger.debug('[POSTGRESQL] Trans ROLLBACK')

        conn = trans_conn.get('conn')
        cur  = trans_conn.get('cur')

        conn.rollback()

        cur.close()
        conn.close()

    def _convert_types(self, db_res):
        for d in db_res:
            for k, v in d.items():
                # JSON Fields to Objects
                if k.endswith('JSON') and isinstance(v, str):
                    try:
                        d[k] = toolkit.json_loads(v)
                    except Exception as e:
                        pass

                # Time Fields to Arrow Objects
                if self.timezone and k.endswith('Time') and isinstance(v, (int, float)):
                    try:
                        d[k] = arrow.get(v, self.timezone)
                    except Exception as e:
                        pass

        return db_res

    def _prepare_sql(self, sql):
        sqls = []
        for _sql in toolkit.as_array(sql):
            if self.client is CLIENT:
                # Special processing for system DB

                # Force using SQLBuilder
                if not isinstance(_sql, PostgreSQLBuilder):
                    e = Exception(f'SQL is not a instance of PostgreSQLBuilder: {_sql}')
                    raise e

                # Check SQL security
                _sql.check_safty()

                # Add updateTime / createTime automatically
                now_timestamp = toolkit.get_timestamp()
                if _sql.meta['type'] == 'INSERT':
                    _sql.UPDATE_VALUES({
                        'createTime': now_timestamp,
                        'updateTime': now_timestamp,
                    }, True)

                elif _sql.meta['type'] == 'UPDATE':
                    _sql.SET({
                        'updateTime': now_timestamp,
                    })

            # Convert to string and add semicolon
            _sql = str(_sql).strip()
            if not _sql.endswith(';'):
                _sql += ';'

            sqls.append(_sql)

        return ' '.join(sqls)

    def _trans_execute(self, trans_conn, sql, sql_params=None):
        sql       = self._prepare_sql(sql)
        sql       = self.format_sql(sql, sql_params)
        debug_sql = toolkit.to_debug_text(sql)

        if not trans_conn:
            raise Exception('Transaction not started')

        conn = trans_conn['conn']
        cur  = trans_conn['cur']

        try:
            dt = toolkit.DiffTimer()

            cur.execute(sql)
            count = cur.rowcount

            db_res = None
            try:
                db_res = cur.fetchall()
            except psycopg2.ProgrammingError as e:
                if str(e) == 'no results to fetch':
                    pass
                else:
                    raise

            if not self.skip_log:
                self.logger.debug(f'[POSTGRESQL] Trans Query `{debug_sql}` (Cost: {dt.tick()} ms)')

            db_res = list(db_res or [])
            if db_res:
                db_res = to_dict_rows(cur, db_res)
                db_res = self._convert_types(db_res)

            return db_res, count

        except Exception as e:
            self.logger.error(f'[POSTGRESQL] Trans Query `{debug_sql}` (Cost: {dt.tick()} ms)')
            raise

    def _execute(self, sql, sql_params=None):
        sql       = self._prepare_sql(sql)
        sql       = self.format_sql(sql, sql_params)
        debug_sql = toolkit.to_debug_text(sql)

        conn = None
        cur  = None

        try:
            dt = toolkit.DiffTimer()

            conn = self.client.connection()
            cur  = conn.cursor()

            cur.execute(sql)
            count = cur.rowcount

            db_res = None
            try:
                db_res = cur.fetchall()
            except psycopg2.ProgrammingError as e:
                if str(e) == 'no results to fetch':
                    pass
                else:
                    raise

            conn.commit()

            if not self.skip_log:
                self.logger.debug(f'[POSTGRESQL] Query `{debug_sql}` (Cost: {dt.tick()} ms)')

            db_res = list(db_res or [])
            if db_res:
                db_res = to_dict_rows(cur, db_res)
                db_res = self._convert_types(db_res)

            return db_res, count

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

            if conn:
                conn.rollback()

            self.logger.error(f'[POSTGRESQL] Query `{debug_sql}` (Cost: {dt.tick()} ms)')
            raise

        finally:
            if cur:
                cur.close()

            if conn:
                conn.close()

    def trans_query(self, trans_conn, sql, sql_params=None):
        result, count = self._trans_execute(trans_conn, sql, sql_params)
        return result

    def trans_non_query(self, trans_conn, sql, sql_params=None):
        result, count = self._trans_execute(trans_conn, sql, sql_params)
        return count

    def query(self, sql, sql_params=None):
        result, count = self._execute(sql, sql_params)
        return result

    def non_query(self, sql, sql_params=None):
        result, count = self._execute(sql, sql_params)
        return count

    def create_sql_builder(self, raw_sql=None):
        return PostgreSQLBuilder(raw_sql).set_timezone(self.timezone)

    def trans_query_raw(self, trans_conn, sql, sql_params=None):
        sql = self.create_sql_builder(sql)
        return self.trans_query(trans_conn, sql, sql_params)

    def trans_non_query_raw(self, trans_conn, sql, sql_params=None):
        sql = self.create_sql_builder(sql)
        return self.trans_non_query(trans_conn, sql, sql_params)
        return count

    def query_raw(self, sql, sql_params=None):
        sql = self.create_sql_builder(sql)
        return self.query(sql, sql_params)

    def non_query_raw(self, sql, sql_params=None):
        sql = self.create_sql_builder(sql)
        return self.non_query(sql, sql_params)

    def guance_dql_like_query(self, query_statement, options=None):
        options = options or {}

        # Run only the first statement.
        sql = sqlparse.split(query_statement)[0].strip().strip(';')

        # Checks if SELECT
        parsed_sql = sqlparse.parse(sql)[0]
        if parsed_sql.get_type() != 'SELECT':
            e = Exception('Only SELECT SQL is allowed in DQL-like query')
            raise e

        # SQL wrap
        sql = f'SELECT * FROM ({sql}) AS "main"'

        # Check If time field exists
        has_time_col = False
        for col in list(parsed_sql.get_sublists())[0].get_sublists():
            if col.get_name() == 'time':
                has_time_col = True
                break

        # Add time range filter (WHERE time...) only if time field exists
        if has_time_col:
            where_conditions = [
                f'"time" >= {options["start"]}',
                f'"time" < {options["end"]}',
            ]
            sql += f" WHERE {' AND '.join(where_conditions)}"

        # Add a query limit (LIMIT)
        sql += f" LIMIT {CONFIG['GUANCE_DQL_LIKE_QUERY_LIMIT']}"

        # Run SQL
        db_res = self.query(sql)

        # Convert format
        guance_dql_like_res = table_to_guance_dql_like_result(db_res)
        guance_dql_like_res['executedQueryStatement'] = sql
        return guance_dql_like_res

class PostgreSQLHelper(FuncPostgreSQLHelper):
    def _prepare_sql(self, sql):
        if isinstance(sql, str):
            sql = self.create_sql_builder(sql)

        return super()._prepare_sql(sql)
