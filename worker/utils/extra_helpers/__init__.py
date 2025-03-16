# -*- coding: utf-8 -*-

# Built-in Modules
import re

# 3rd-party Modules
import six
import xmltodict
import requests

# Project Modules
from worker.utils import toolkit

COMMON_SQL_ESCAPE_MAP = {
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

POSTGRESQL_ESCAPE_MAP = {
    '\0'  : '\\0',
    '\b'  : '\\b',
    '\t'  : '\\t',
    '\n'  : '\\n',
    '\r'  : '\\r',
    '\x1a': '\\Z',
    '\''  : '\\\'',
    '\\'  : '\\\\',
}

def common_sql_escape(v, escape_map=None):
    escape_map = escape_map or COMMON_SQL_ESCAPE_MAP

    if v is None:
        return 'NULL'

    elif v in (True, False):
        v = str(v).upper()
        return v

    elif isinstance(v, str):
        v = ''.join(escape_map.get(c, c) for c in list(v))
        v = f"'{v}'"
        return v

    elif isinstance(v, (int, float)):
        return str(v)

    else:
        v = f"'{str(v)}'"
        return v

def mysql_escape(v):
    return common_sql_escape(v)

def postgresql_escape(v):
    if isinstance(v, str):
        return f"E{common_sql_escape(v, escape_map=POSTGRESQL_ESCAPE_MAP)}"
    else:
        return common_sql_escape(v, escape_map=POSTGRESQL_ESCAPE_MAP)

def format_sql(sql, sql_params=None, pretty=False, sql_escape=None):
    sql_escape = sql_escape or common_sql_escape

    # Inspired by https://github.com/mysqljs/sqlstring/blob/master/lib/SqlString.js
    if not sql_params:
        return sql.strip()

    if not isinstance(sql_params, (list, tuple)):
        sql_params = [ sql_params ]

    result          = ''
    placeholder_re  = re.compile('\?+', re.M)
    chunk_index     = 0
    sql_param_index = 0

    for m in re.finditer(placeholder_re, sql):
        if sql_param_index >= len(sql_params):
            break

        placeholder = m.group()
        if len(placeholder) > 2:
            continue

        sql_param = sql_params[sql_param_index]

        escaped_sql_param = str(sql_param)
        if placeholder == '?':
            if isinstance(sql_param, (tuple, list, set)):
                # Tuple, List -> 'value1', 'value2', ...
                expressions = []
                for x in sql_param:
                    if isinstance(x, (tuple, list, set)):
                        values = [ sql_escape(v) for v in x ]
                        expressions.append(f"({', '.join(values)})")
                    else:
                        expressions.append(sql_escape(x))

                escaped_sql_param = (',\n  ' if pretty else ', ').join(expressions)

            elif isinstance(sql_param, dict):
                # Dict -> field = 'value', ...
                expressions = []
                for k, v in sql_param.items():
                    if v is None:
                        expressions.append(f'{k} = NULL')
                    else:
                        expressions.append(f'{k} = {sql_escape(v)}')

                escaped_sql_param = (',\n  ' if pretty else ', ').join(expressions)

            else:
                # Other -> 'value'
                escaped_sql_param = sql_escape(sql_param)

        start_index, end_index = m.span()
        result += sql[chunk_index:start_index] + escaped_sql_param
        chunk_index = end_index
        sql_param_index += 1

    if chunk_index == 0:
        return sql.strip()
    elif chunk_index < len(sql):
        return (result + sql[chunk_index:]).strip()
    else:
        return result.strip()

def to_dict_rows(cur, db_res):
    fields = [desc[0] for desc in cur.description]
    db_res_dict = None
    if db_res:
        db_res_dict = [dict(zip(fields, row)) for row in db_res]

    return db_res_dict or db_res

def table_to_guance_dql_like_result(db_res):
    series_map = {}

    for d in db_res:
        # Identify data series
        series_key_obj = {
            'columns': [],
            'tags'   : {},
        }
        for k, v in d.items():
            if k == 'time':
                pass

            elif k.startswith('tag_'):
                tag_key = k[len('tag_'):]
                if v is None:
                    series_key_obj['tags'][tag_key] = 'NULL'
                else:
                    series_key_obj['tags'][tag_key] = str(v)

            else:
                series_key_obj['columns'].append(k)

        series_key_obj['columns'] = [ 'time' ] + sorted(series_key_obj['columns'])
        series_key = toolkit.json_dumps(series_key_obj)

        if series_key not in series_map:
            series_map[series_key] = []

        # Collect column values
        values = []
        for col in series_key_obj['columns']:
            values.append(d.get(col))

        series_map[series_key].append(values)

    # Extend data series
    series_list = []
    for series_key, values in series_map.items():
        series = toolkit.json_loads(series_key)
        series['values'] = values

        series_list.append(series)

    dql_like_res = {
        'series': [ series_list ]
    }
    return dql_like_res

def parse_http_resp(response):
    resp_content_type = response.headers.get('content-type') or ''
    resp_content_type = resp_content_type.lower().split(';')[0].strip()

    if resp_content_type == 'application/json':
        # return response.json()
        return toolkit.json_loads(response.text)

    elif resp_content_type == 'text/xml':
        return xmltodict.parse(response.text)

    else:
        try:
            return toolkit.json_loads(response.text)

        except ValueError:
            try:
                return xmltodict.parse(response.text)

            except xmltodict.expat.ExpatError:
                return response.content

            except:
                raise

        except:
            raise

from .guance_helper          import GuanceHelper
from .datakit_helper         import DataKitHelper
from .dataway_helper         import DataWayHelper
from .sidecar_helper         import SidecarHelper
from .influxdb_helper        import InfluxDBHelper
from .mysql_helper           import FuncMySQLHelper, MySQLHelper
from .redis_helper           import RedisHelper
from .memcached_helper       import MemcachedHelper
from .clickhouse_helper      import ClickHouseHelper
from .postgresql_helper      import FuncPostgreSQLHelper, PostgreSQLHelper
from .mongodb_helper         import MongoDBHelper
from .elasticsearch_helper   import ElasticSearchHelper
from .nsqlookupd_helper      import NSQLookupHelper
from .mqtt_helper            import MQTTHelper
from .kafka_helper           import KafkaHelper
from .prometheus_helper      import PrometheusHelper
from .aliyun_sls_helper      import AliyunSLSHelper

from .oracle_database_helper import OracleDatabaseHelper
from .sqlserver_helper       import SQLServerHelper

from .ding_helper        import DingHelper
from .file_system_helper import FileSystemHelper
from .http_helper        import HTTPHelper
from .shell_helper       import ShellHelper
