# -*- coding: utf-8 -*-

# Built-in Modules
import re
import time
import datetime
import traceback

# 3rd-party Modules
import arrow
import pymysql
from pymysql.cursors import DictCursor
from pymysql.constants import CLIENT as CLIENT_FLAG
from dbutils.pooled_db import PooledDB
import sqlparse

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.utils.extra_helpers import format_sql, table_to_guance_dql_like_result
from worker.utils.extra_helpers.sql_builder import MySQLBuilder

CONFIG = yaml_resources.get('CONFIG')

def get_config(c):
    _charset = c.get('charset') or 'utf8mb4'

    config = {
        'host'    : c.get('host') or '127.0.0.1',
        'port'    : c.get('port') or 3306,
        'user'    : c.get('user'),
        'password': c.get('password'),
        'database': c.get('database'),
        'charset' : _charset,

        'connect_timeout': CONFIG['_DB_CONN_TIMEOUT'],
        'maxusage'       : CONFIG['_DB_POOL_MAX_USAGE'],
        'maxconnections': c.get('maxconnections') or 1,

        'cursorclass'  : DictCursor,
        'init_command' : "SET NAMES '{0}'".format(_charset),
        'client_flag'  : CLIENT_FLAG.MULTI_STATEMENTS,
        'read_timeout' : CONFIG['_MYSQL_READ_TIMEOUT'],
        'write_timeout': CONFIG['_MYSQL_WRITE_TIMEOUT'],
        'blocking'     : True,
        'ping'         : 7,
    }
    return config

CLIENT_CREATE_TIME = 0
CLIENT_CONFIG      = None
CLIENT             = None

class FuncMySQLHelper(object):
    db_name = 'MySQL'

    def __init__(self, logger, config=None, database=None, pool_size=None, *args, **kwargs):
        self.logger = logger

        self.skip_log = False

        if config:
            if database:
                config['database'] = database

            if pool_size:
                config['maxconnections'] = pool_size

            self.config = config
            self.client = PooledDB(pymysql, **get_config(config))

        else:
            global CLIENT_CREATE_TIME
            global CLIENT_CONFIG
            global CLIENT

            if CLIENT and time.time() - CLIENT_CREATE_TIME > CONFIG['_DB_POOL_RECYCLE_TIMEOUT']:
                CLIENT.close()

                CLIENT_CREATE_TIME = None
                CLIENT             = None

            if not CLIENT:
                CLIENT_CREATE_TIME = time.time()
                CLIENT_CONFIG = {
                    'host'          : CONFIG['MYSQL_HOST'],
                    'port'          : CONFIG['MYSQL_PORT'],
                    'user'          : CONFIG['MYSQL_USER'],
                    'password'      : CONFIG['MYSQL_PASSWORD'],
                    'database'      : CONFIG['MYSQL_DATABASE'],
                    'charset'       : CONFIG['_MYSQL_CHARSET'],
                    'maxconnections': CONFIG['_DB_POOL_SIZE_WORKER'],
                }
                CLIENT = PooledDB(pymysql, **get_config(CLIENT_CONFIG))

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
        sql = self.create_sql_builder('SHOW TABLES')

        db_res = self.query(sql)

        tables = list(map(lambda x: list(x.values())[0], db_res))
        return tables

    def table_status(self):
        sql = self.create_sql_builder('SHOW TABLE STATUS')

        db_res = self.query(sql)

        table_status = {}
        for d in db_res:
            total_size   = (d['Data_length'] or 0) + (d['Index_length'] or 0)
            avg_row_size = int(total_size / d['Rows']) if d.get('Rows') else 0

            t = {
                'name': d['Name'],
                'rows': d.get('Rows') or 0,

                'dataSize'  : d.get('Data_length')  or 0,
                'indexSize' : d.get('Index_length') or 0,
                'totalSize' : total_size,
                'avgRowSize': avg_row_size,
            }

            table_status[d['Name']] = t

        return table_status

    def clear_table(self, table):
        # Check if table exists
        sql = self.create_sql_builder('SHOW TABLE STATUS LIKE ?')
        sql_params = [ table ]

        db_res = self.query(sql, sql_params)
        if not db_res:
            self.logger.debug(f'[MYSQL] The table `{table}` is not exist, skip clearing')
            return

        # Check if data exists
        sql = self.create_sql_builder('SELECT * FROM ?? LIMIT 1')
        sql_params = [ table ]

        has_data = bool(self.query(sql, sql_params))
        if not has_data:
            self.logger.debug(f'[MYSQL] The table `{table}` has no data, skip clearing')
            return

        # Do truncate
        sql = self.create_sql_builder()
        sql.TRUNCATE(table)

        self.query(sql)

    def start_trans(self):
        try:
            dt = toolkit.DiffTimer()

            conn = self.client.connection()
            cur  = conn.cursor()

            trans_conn = {
                'conn': conn,
                'cur' : cur,
            }

            if not self.skip_log:
                self.logger.debug(f'[MYSQL] Trans START (Cost: {dt.tick()} ms)')

            return trans_conn

        except Exception as e:
            self.logger.error(f'[MYSQL] Trans START (Cost: {dt.tick()} ms)')
            raise

    def commit(self, trans_conn):
        if not trans_conn:
            return

        conn = trans_conn.get('conn')
        cur  = trans_conn.get('cur')

        try:
            dt = toolkit.DiffTimer()

            conn.commit()

            cur.close()
            conn.close()

            if not self.skip_log:
                self.logger.debug(f'[MYSQL] Trans COMMIT (Cost: {dt.tick()} ms)')

        except Exception as e:
            self.logger.error(f'[MYSQL] Trans COMMIT (Cost: {dt.tick()} ms)')
            raise

    def rollback(self, trans_conn):
        if not trans_conn:
            return

        conn = trans_conn.get('conn')
        cur  = trans_conn.get('cur')

        try:
            dt = toolkit.DiffTimer()

            conn.rollback()

            cur.close()
            conn.close()

            if not self.skip_log:
                self.logger.debug(f'[MYSQL] Trans ROLLBACK (Cost: {dt.tick()} ms)')

        except Exception as e:
            self.logger.error(f'[MYSQL] Trans ROLLBACK (Cost: {dt.tick()} ms)')
            raise

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
                if not isinstance(_sql, MySQLBuilder):
                    e = Exception(f'SQL is not a instance of MySQLBuilder: {_sql}')
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
        sql       = format_sql(sql, sql_params)
        debug_sql = toolkit.to_debug_text(sql)

        if not trans_conn:
            raise Exception('Transaction not started')

        conn = trans_conn['conn']
        cur  = trans_conn['cur']

        try:
            dt = toolkit.DiffTimer()

            count  = cur.execute(sql)
            db_res = cur.fetchall()

            if not self.skip_log:
                self.logger.debug(f'[MYSQL] Trans Query {debug_sql} (Cost: {dt.tick()} ms)')

            db_res = list(db_res or [])
            if db_res:
                db_res = self._convert_types(db_res)

            return db_res, count

        except Exception as e:
            self.logger.error(f'[MYSQL] Trans Query {debug_sql} (Cost: {dt.tick()} ms)')
            raise

    def _execute(self, sql, sql_params=None):
        sql       = self._prepare_sql(sql)
        sql       = format_sql(sql, sql_params)
        debug_sql = toolkit.to_debug_text(sql)

        conn = None
        cur  = None

        try:
            dt = toolkit.DiffTimer()

            conn = self.client.connection()
            cur  = conn.cursor()

            count  = cur.execute(sql)
            db_res = cur.fetchall()

            conn.commit()

            if not self.skip_log:
                self.logger.debug(f'[MYSQL] Query `{debug_sql}` (Cost: {dt.tick()} ms)')

            db_res = list(db_res or [])
            if db_res:
                db_res = self._convert_types(db_res)

            return db_res, count

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

            if conn:
                conn.rollback()

            self.logger.error(f'[MYSQL] Query `{debug_sql}` (Cost: {dt.tick()} ms)')
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
        return MySQLBuilder(raw_sql).set_timezone(self.timezone)

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
        sql = f'SELECT * FROM ({sql}) AS `main`'

        # Check If time field exists
        has_time_col = False
        for col in list(parsed_sql.get_sublists())[0].get_sublists():
            if col.get_name() == 'time':
                has_time_col = True
                break

        # Add time range filter (WHERE time...) only if time field exists
        if has_time_col:
            where_conditions = [
                f'`time` >= {options["start"]}',
                f'`time` < {options["end"]}',
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

class MySQLHelper(FuncMySQLHelper):
    def _prepare_sql(self, sql):
        if isinstance(sql, str):
            sql = self.create_sql_builder(sql)

        return super()._prepare_sql(sql)
