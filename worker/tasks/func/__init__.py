# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import inspect
import traceback
import linecache
from types import ModuleType
import time
import importlib
import functools
import concurrent
import urllib.parse

# 3rd-party Modules
import six
import arrow
import funcsigs

# Project Modules
from worker.tasks import BaseTask
from worker.utils import yaml_resources, toolkit
from worker.utils.extra_helpers import format_sql
from worker.utils.extra_helpers import GuanceHelper, DataKitHelper, DataWayHelper, SidecarHelper
from worker.utils.extra_helpers import InfluxDBHelper, MySQLHelper, RedisHelper, MemcachedHelper, ClickHouseHelper
from worker.utils.extra_helpers import PostgreSQLHelper, MongoDBHelper, ElasticSearchHelper, NSQLookupHelper, MQTTHelper, KafkaHelper
from worker.utils.extra_helpers import PrometheusHelper, AliyunSLSHelper
from worker.utils.extra_helpers import SQLServerHelper, OracleDatabaseHelper
from worker.utils.extra_helpers.guance_openapi import GuanceOpenAPI
from worker.utils.extra_helpers.datakit import DataKit
from worker.utils.extra_helpers.dataway import DataWay

CONST  = yaml_resources.get('CONST')
CONFIG = yaml_resources.get('CONFIG')

# Integration
FIX_INTEGRATION_KEY_MAP = {
    # Func for DataFlux Func sign-in
    # Will be called by `POST /api/v1/func/integration/sign-in`
    # Add options to DataFlux Func sign-in page
    # Must be defined as `def func(username, password)`
    #   Return `True` for success
    #   Return `False` or raise `Exception('<Error Message>')` for failure
    # No config
    'signin' : 'signIn',
    'sign_in': 'signIn',
    'login'  : 'signIn',
    'log_in' : 'signIn',

    # Auto-run Func
    # Will be Triggered according `cronExpr` option and no need to create a Cron Job for it
    # Muse be defined as `def func()` (No parameters)
    # Configs:
    #   cronExpr       : cron expression
    #   onSystemLaunch : if triggered on system launched (`True` / `False`)
    #   onScriptPublish: if triggered on Script published (`True` / `False`)
    'autorun' : 'autoRun',
    'auto_run': 'autoRun',
}

INTEGRATION_CONFIG_KEY_ALIAS_MAP = {
    'cronexpr' : 'cronExpr',
    'cron_expr': 'cronExpr',
    'crontab'  : 'cronExpr',

    'onsystemlaunch'  : 'onSystemLaunch',
    'on_system_launch': 'onSystemLaunch',
    'onlaunch'        : 'onSystemLaunch',
    'on_launch'       : 'onSystemLaunch',

    'onscriptpublish'  : 'onScriptPublish',
    'on_script_publish': 'onScriptPublish',
    'onpublish'        : 'onScriptPublish',
    'on_publish'       : 'onScriptPublish',
}

# Helper class for Connectors
CONNECTOR_HELPER_CLASS_MAP = {
    'guance'       : GuanceHelper,
    'truewatch'    : GuanceHelper,
    'df_dataway'   : DataWayHelper,
    'df_datakit'   : DataKitHelper,
    'dff_sidecar'  : SidecarHelper,
    'influxdb'     : InfluxDBHelper,
    'mysql'        : MySQLHelper,
    'redis'        : RedisHelper,
    'memcached'    : MemcachedHelper,
    'clickhouse'   : ClickHouseHelper,
    'oracle'       : OracleDatabaseHelper,
    'sqlserver'    : SQLServerHelper,
    'postgresql'   : PostgreSQLHelper,
    'mongodb'      : MongoDBHelper,
    'elasticsearch': ElasticSearchHelper,
    'nsq'          : NSQLookupHelper,
    'mqtt'         : MQTTHelper,
    'kafka'        : KafkaHelper,
    'prometheus'   : PrometheusHelper,
    'aliyunSLS'    : AliyunSLSHelper,
}

# Auto type casting func for Env Variables
ENV_VARIABLE_AUTO_TYPE_CASTING_FUNC_MAP = {
    'integer'   : int,
    'float'     : float,
    'boolean'   : toolkit.to_boolean,
    'json'      : toolkit.json_loads,
    'commaArray': lambda x: x.split(','),
}

# Thread pool for Func
FUNC_THREAD_POOL       = None
FUNC_THREAD_POOL_SIZE  = None
FUNC_THREAD_RESULT_MAP = {}

# Local cache for Script
SCRIPT_LOCAL_CACHE = toolkit.LocalCache(expires=30)
USER_SCRIPT_ID_BLACK_LIST = [
    '__future__'
]

# Local cache for Env Variable
ENV_VARIABLE_LOCAL_CACHE = toolkit.LocalCache(expires=30)

# Extra Python import path
extra_import_paths = [
    CONFIG.get('RESOURCE_ROOT_PATH'),
    # User uploaded package folder
    os.path.join(CONFIG.get('RESOURCE_ROOT_PATH'), CONFIG.get('_USER_PYTHON_PACKAGE_DIR')),
    # PIP Tool install folder
    os.path.join(CONFIG.get('RESOURCE_ROOT_PATH'), CONFIG.get('_EXTRA_PYTHON_PACKAGE_INSTALL_DIR')),
]
for p in extra_import_paths:
    os.makedirs(p, exist_ok=True)
    sys.path.append(p)

# Upload / download tmp folder
temp_file_folders = [
    os.path.join(CONFIG.get('RESOURCE_ROOT_PATH'), CONFIG.get('UPLOAD_TEMP_FILE_DIR')),
    os.path.join(CONFIG.get('RESOURCE_ROOT_PATH'), CONFIG.get('DOWNLOAD_TEMP_FILE_DIR')),
]

for _dir in (extra_import_paths + temp_file_folders):
    os.makedirs(_dir, exist_ok=True)

class DataFluxFuncBaseException(Exception):
    pass

class EntityNotFound(DataFluxFuncBaseException):
    pass

class BadEntityCall(DataFluxFuncBaseException):
    pass

class FuncCircularCall(DataFluxFuncBaseException):
    pass

class FuncCallChainTooLong(DataFluxFuncBaseException):
    pass

class DuplicatedFuncName(DataFluxFuncBaseException):
    pass

class DuplicatedThreadResultKey(DataFluxFuncBaseException):
    pass

class ConnectorNotSupport(DataFluxFuncBaseException):
    pass

class InvalidConnectorConfig(DataFluxFuncBaseException):
    pass

class InvalidAPIOption(DataFluxFuncBaseException):
    pass

class DFFWraper(object):
    def __init__(self, inject_objs=None):
        self.api_func_set    = set()
        self.api_funcs       = []
        self.print_log_lines = []

        self.inject_objs = inject_objs or {}

        # Add lower case alias
        for obj_name in list(self.inject_objs.keys()):
            obj_name_lower = obj_name.lower()
            self.inject_objs[obj_name_lower] = self.inject_objs[obj_name]

    def __getattr__(self, name):
        if not self.inject_objs:
            return None
        else:
            return self.inject_objs.get(name)

def decipher_connector_config(connector_id, config):
    '''
    Decipher fields
    '''
    config = toolkit.json_copy(config)

    for f in CONST['cipherFields']:
        f_cipher = f'{f}Cipher'

        if config.get(f_cipher):
            try:
                salt = connector_id
                config[f] = toolkit.decipher_by_aes(config[f_cipher], CONFIG['SECRET'], salt)

            except UnicodeDecodeError as e:
                raise Exception('Decipher by AES failed. SECRET maybe wrong or changed')

            config.pop(f_cipher, None)

    return config

def get_resource_path(file_path):
    abs_path = os.path.join(CONFIG['RESOURCE_ROOT_PATH'], file_path.lstrip('/'))
    return abs_path

def get_sign(*args):
    str_to_sign = CONFIG['SECRET'] + '\n' + '\n'.join(map(str, args))
    return toolkit.get_md5(str_to_sign)

class FuncContextHelper(object):
    def __init__(self, task):
        self._task = task

        self.__data = {}

    def __call__(self, *args, **kwargs):
        return self.get(*args, **kwargs)

    def has(self, key):
        return key in self.__data

    def get(self, key):
        return toolkit.json_copy(self.__data.get(key))

    def get_all(self):
        return toolkit.json_copy(self.__data)

    def set(self, key, value):
        self.__data[key] = value

    def delete(self, key):
        return self.__data.pop(key, None)

    def clear(self):
        return self.__data.clear()

class FuncConnectorHelper(object):
    def __init__(self, task):
        self._task = task

    def __call__(self, *args, **kwargs):
        return self.get(*args, **kwargs)

    def get(self, connector_id, **helper_kwargs):
        # Same connector may get different configs (e.g. specified different database)
        helper_kwargs = toolkit.no_none_or_whitespace(helper_kwargs)

        global CONNECTOR_HELPER_CLASS_MAP

        # Get Connector from DB
        self._task.logger.debug(f"[LOAD connector] load `{connector_id}` from DB")

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'id',
            'type',
            'configJSON',
        ])
        sql.FROM('biz_main_connector')
        sql.WHERE({
            'id': connector_id,
        })
        sql.LIMIT(1)

        connector = self._task.db.query(sql)
        if not connector:
            e = EntityNotFound(f'Connector not found: `{connector_id}`')
            raise e

        connector = connector[0]

        # Get helper class for Connector
        helper_type  = connector['type']
        helper_class = CONNECTOR_HELPER_CLASS_MAP.get(helper_type)
        if not helper_class:
            e = ConnectorNotSupport(f'Connector type not support: `{helper_type}`')
            raise e

        # Create helper instance for Connector
        config = decipher_connector_config(connector['id'], connector['configJSON'])

        helper = helper_class(self._task.logger, config, pool_size=CONFIG['_FUNC_TASK_CONNECTOR_POOL_SIZE'], **helper_kwargs)
        return helper

    def reload_config_md5(self, connector_id):
        cache_key = toolkit.get_cache_key('cache', 'dataMD5Cache', ['dataType', 'connector'])

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'id',
            'configJSON',
        ])
        sql.FROM('biz_main_connector')
        sql.WHERE({
            'id': connector_id,
        })
        sql.LIMIT(1)

        connector = self._task.db.query(sql)
        if not connector:
            return

        connector = connector[0]

        connector_config_md5 = toolkit.get_md5(connector['configJSON'])
        self._task.cache_db.hset(cache_key, connector_id, connector_config_md5)

    def save(self, connector_id, connector_type, config, title=None, description=None):
        if connector_type not in CONNECTOR_HELPER_CLASS_MAP:
            e = ConnectorNotSupport(f'Connector type `{connector_type}` not supported')
            raise e

        if not config:
            config = {}

        if not isinstance(config, dict):
            raise InvalidConnectorConfig('Connector config should be a dict')

        # Cipher fields
        for k in CONST['cipherFields']:
            v = config.get(k)
            if v is not None:
                salt = connector_id
                config[f'{k}Cipher'] = toolkit.cipher_by_aes(v, CONFIG['SECRET'], salt)

            config.pop(k, None)

        config_json = toolkit.json_dumps(config)

        # Check if exists
        sql = self._task.db.create_sql_builder()
        sql.SELECT('id')
        sql.FROM('biz_main_connector')
        sql.WHERE({
            'id': connector_id,
        })
        sql.LIMIT(1)

        db_res = self._task.db.query(sql)

        if len(db_res) > 0:
            # Update if exists
            sql = self._task.db.create_sql_builder()
            sql.UPDATE('biz_main_connector')
            sql.SET({
                'title'      : title,
                'description': description,
                'type'       : connector_type,
                'configJSON' : config_json,
            })
            sql.WHERE({
                'id': connector_id,
            })
            sql.LIMIT(1)

            self._task.db.query(sql)

        else:
            # Insert if not exist
            sql = self._task.db.create_sql_builder()
            sql.INSERT_INTO('biz_main_connector')
            sql.VALUES({
                'id'         : connector_id,
                'title'      : title,
                'description': description,
                'type'       : connector_type,
                'configJSON' : config_json,
            })

            self._task.db.query(sql)

        self.reload_config_md5(connector_id)

    def delete(self, connector_id):
        sql = self._task.db.create_sql_builder()
        sql.DELETE_FROM('biz_main_connector')
        sql.WHERE({
            'id': connector_id,
        })
        sql.LIMIT(1)

        self._task.db.query(sql)

        self.reload_config_md5(connector_id)

    def query(self, connector_type=None):
        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'id',
            'title',
            'type',
        ])
        sql.FROM('biz_main_connector')

        if connector_type:
            sql.WHERE({
                'type': toolkit.as_array(connector_type),
            })

        db_res = self._task.db.query(sql)
        return db_res

class FuncEnvVariableHelper(object):
    '''
    Load Env Variables
    1. Check if the MD5 in local cache (with 60s expire) and the one cached in Redis are matched
        a. Matched: use local cache
        b. Not Matched: Read from DB and update MD5 in Redis
    2. Load only once in one Task
    '''
    def __init__(self, task):
        self._task = task

        self.__loaded_env_variable_cache = toolkit.LocalCache()

    def __call__(self, *args, **kwargs):
        return self.get(*args, **kwargs)

    def keys(self):
        sql = self._task.db.create_sql_builder()
        sql.SELECT('id')
        sql.FROM('biz_main_env_variable')

        db_res = self._task.db.query(sql)

        return [ d['id'] for d in db_res]

    def get(self, env_variable_id):
        env_variable = self.__loaded_env_variable_cache[env_variable_id]
        if env_variable:
            return toolkit.json_copy(env_variable['castedValue'])

        global ENV_VARIABLE_AUTO_TYPE_CASTING_FUNC_MAP
        global ENV_VARIABLE_LOCAL_CACHE

        remote_md5_cache_key = toolkit.get_cache_key('cache', 'dataMD5Cache', ['dataType', 'envVariable'])
        remote_md5           = None

        env_variable = ENV_VARIABLE_LOCAL_CACHE[env_variable_id]
        if env_variable:
            # Check the MD5 cached in Redis
            remote_md5 = self._task.cache_db.hget(remote_md5_cache_key, env_variable_id)
            if remote_md5:
                remote_md5 = six.ensure_str(remote_md5)

            # Refresh local cache time and return cached value if MD5 not changed
            if env_variable['valueMD5'] == remote_md5:
                self._task.logger.debug(f'[LOAD ENV VARIABLE] load `{env_variable_id}` from Cache')

                # Refresh local cache
                ENV_VARIABLE_LOCAL_CACHE.refresh(env_variable_id)

                # Cache Env Variable
                self.__loaded_env_variable_cache[env_variable_id] = env_variable
                return toolkit.json_copy(env_variable['castedValue'])

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'id',
            'autoTypeCasting',
            'valueTEXT',
        ])
        sql.FROM('biz_main_env_variable')
        sql.WHERE({
            'id': env_variable_id,
        })
        sql.LIMIT(1)

        env_variable = self._task.db.query(sql)
        if not env_variable:
            self._task.logger.debug(f"[LOAD ENV VARIABLE] `{env_variable_id}` not found")
            return None

        # Get Env Variable form DB
        self._task.logger.debug(f"[LOAD ENV VARIABLE] load `{env_variable_id}` from DB")

        env_variable = env_variable[0]

        # Compute MD5
        env_variable['valueMD5'] = toolkit.get_md5(env_variable['valueTEXT'] or '')

        # Decipher password
        if env_variable['autoTypeCasting'] == 'password':
            salt = env_variable['id']
            env_variable['valueTEXT'] = toolkit.decipher_by_aes(env_variable['valueTEXT'], CONFIG['SECRET'], salt)

        # Auto type casting
        auto_type_casting = env_variable['autoTypeCasting']
        if auto_type_casting in ENV_VARIABLE_AUTO_TYPE_CASTING_FUNC_MAP:
            env_variable['castedValue'] = ENV_VARIABLE_AUTO_TYPE_CASTING_FUNC_MAP[auto_type_casting](env_variable['valueTEXT'])
        else:
            env_variable['castedValue'] = env_variable['valueTEXT']

        # Cache Env Variable MD5
        self._task.cache_db.hset(remote_md5_cache_key, env_variable_id, env_variable['valueMD5'])
        ENV_VARIABLE_LOCAL_CACHE[env_variable_id] = env_variable

        # Cache Env Variable
        self.__loaded_env_variable_cache[env_variable_id] = env_variable

        return toolkit.json_copy(env_variable['castedValue'])

class FuncStoreHelper(object):
    def __init__(self, task, default_scope):
        self._task = task

        self.default_scope = default_scope

    def __call__(self, *args, **kwargs):
        return self.get(*args, **kwargs)

    def _get_id(self, key, scope):
        '''
        Compute Func Store ID
        '''
        str_to_md5 = '-'.join([key, scope])

        store_id = 'fnst-' + toolkit.get_md5(str_to_md5)
        return store_id

    def _convert_pattern(self, pattern):
        return pattern.replace('%', '\%').replace('_', '\_').replace('*', '%').replace('?', '_')

    def set(self, key, value, expires=None, not_exists=False, expire=None, scope=None):
        expires = expires or expire
        expire_at = None
        if expires:
            expire_at = toolkit.get_timestamp() + expires

        if scope is None:
            scope = self.default_scope

        if len(key) > 256:
            e = Exception('`key` is too long. Length of `key` should be less then 256')
            raise e
        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        value_json = toolkit.json_dumps(value)
        store_id   = self._get_id(key, scope)

        # Check if exists
        sql = self._task.db.create_sql_builder()
        sql.SELECT('seq')
        sql.FROM('biz_main_func_store')
        sql.WHERE({
            'id': store_id,
        })
        sql.LIMIT(1)

        db_res = self._task.db.query(sql)

        # Insert if not exist
        if db_res and not_exists:
            return

        if db_res:
            # Update if exists
            sql = self._task.db.create_sql_builder()
            sql.UPDATE('biz_main_func_store')
            sql.SET({
                'valueJSON': value_json,
                'expireAt' : expire_at,
            })
            sql.WHERE({
                'id': store_id,
            })
            sql.LIMIT(1)

            self._task.db.query(sql)

        else:
            # Insert if not exist
            sql = self._task.db.create_sql_builder()
            sql.INSERT_INTO('biz_main_func_store')
            sql.VALUES({
                'id'       : store_id,
                'key'      : key,
                'valueJSON': value_json,
                'scope'    : scope,
                'expireAt' : expire_at,
            })

            self._task.db.query(sql)

    def mset(self, key_values, expires=None, not_exists=False, expire=None, scope=None):
        expires = expires or expire
        expire_at = None
        if expires:
            expire_at = toolkit.get_timestamp() + expires

        if scope is None:
            scope = self.default_scope

        for key in key_values.keys():
            if len(key) > 256:
                e = Exception('`key` is too long. Length of `key` should be less then 256')
                raise e

        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        # Get current Func Store IDs
        sql = self._task.db.create_sql_builder()
        sql.SELECT('id')
        sql.FROM('biz_main_func_store')
        sql.WHERE({
            'scope': scope,
        })

        db_res = self._task.db.query(sql)

        current_store_ids = set(map(lambda x: x['id'], db_res))

        # Save to DB
        for key, value in key_values.items():
            store_id   = self._get_id(key, scope)
            value_json = toolkit.json_dumps(value)

            if store_id in current_store_ids and not_exists:
                continue

            if store_id in current_store_ids:
                # Update if exists
                sql = self._task.db.create_sql_builder()
                sql.UPDATE('biz_main_func_store')
                sql.SET({
                    'valueJSON': value_json,
                    'expireAt' : expire_at,
                })
                sql.WHERE({
                    'id': store_id,
                })
                sql.LIMIT(1)

                self._task.db.query(sql)

            else:
                # Insert if not exist
                sql = self._task.db.create_sql_builder()
                sql.INSERT_INTO('biz_main_func_store')
                sql.VALUES({
                    'id'       : store_id,
                    'key'      : key,
                    'valueJSON': value_json,
                    'scope'    : scope,
                    'expireAt' : expire_at,
                })

                self._task.db.query(sql)

    def keys(self, pattern='*', scope=None):
        if scope is None:
            scope = self.default_scope

        pattern = self._convert_pattern(pattern)

        sql = self._task.db.create_sql_builder()
        sql.SELECT('key')
        sql.FROM('biz_main_func_store')
        sql.WHERE([
            { 'LEFT': 'key', 'OP': 'like', 'RIGHT': pattern },
            { 'LEFT': 'scope', 'RIGHT': scope },
            [
                { 'LEFT': 'expireAt', 'OP': 'isNull' },
                { 'LEFT': 'expireAt', 'OP': '>=', 'RIGHT': toolkit.get_timestamp() },
            ]
        ])

        db_res = self._task.db.query(sql)

        ret = [ d['key'] for d in db_res ]
        return ret

    def get(self, key, scope=None):
        if scope is None:
            scope = self.default_scope

        if len(key) > 256:
            e = Exception('`key` is too long. Length of `key` should be less then 256')
            raise e
        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        store_id = self._get_id(key, scope)

        sql = self._task.db.create_sql_builder()
        sql.SELECT('valueJSON')
        sql.FROM('biz_main_func_store')
        sql.WHERE([
            { 'LEFT': 'id', 'RIGHT': store_id },
            [
                { 'LEFT': 'expireAt', 'OP': 'isNull' },
                { 'LEFT': 'expireAt', 'OP': '>=', 'RIGHT': toolkit.get_timestamp() },
            ]
        ])

        db_res = self._task.db.query(sql)
        if not db_res:
            return None

        value = db_res[0]['valueJSON']
        return value

    def mget(self, keys, scope=None):
        if scope is None:
            scope = self.default_scope

        if not keys:
            return {}

        keys = toolkit.as_array(keys)
        for key in keys:
            if len(key) > 256:
                e = Exception('`key` is too long. Length of `key` should be less then 256')
                raise e

        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        store_ids = list(map(lambda k: self._get_id(k, scope), keys))

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'key',
            'valueJSON'
        ])
        sql.FROM('biz_main_func_store')
        sql.WHERE([
            { 'LEFT': 'id', 'RIGHT': store_ids },
            [
                { 'LEFT': 'expireAt', 'OP': 'isNull' },
                { 'LEFT': 'expireAt', 'OP': '>=', 'RIGHT': toolkit.get_timestamp() },
            ]
        ])

        db_res = self._task.db.query(sql)

        result = dict([ (k, None) for k in keys ])
        for d in db_res:
            k = d['key']
            v = d['valueJSON']
            result[k] = v

        return result

    def getall(self, scope=None):
        if scope is None:
            scope = self.default_scope

        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'key',
            'valueJSON'
        ])
        sql.FROM('biz_main_func_store')
        sql.WHERE([
            { 'LEFT': 'scope', 'RIGHT': scope },
            [
                { 'LEFT': 'expireAt', 'OP': 'isNull' },
                { 'LEFT': 'expireAt', 'OP': '>=', 'RIGHT': toolkit.get_timestamp() },
            ]
        ])

        db_res = self._task.db.query(sql)

        result = {}
        for d in db_res:
            k = d['key']
            v = d['valueJSON']
            result[k] = v

        return result

    def get_pattern(self, pattern='*', scope=None):
        if pattern == '*':
            return self.getall(scope=scope)

        if scope is None:
            scope = self.default_scope

        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        pattern = self._convert_pattern(pattern)

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'key',
            'valueJSON'
        ])
        sql.FROM('biz_main_func_store')
        sql.WHERE([
            { 'LEFT': 'key', 'OP': 'like', 'RIGHT': pattern },
            { 'LEFT': 'scope', 'RIGHT': scope },
            [
                { 'LEFT': 'expireAt', 'OP': 'isNull' },
                { 'LEFT': 'expireAt', 'OP': '>=', 'RIGHT': toolkit.get_timestamp() },
            ]
        ])

        db_res = self._task.db.query(sql)

        result = {}
        for d in db_res:
            k = d['key']
            v = d['valueJSON']
            result[k] = v

        return result

    def delete(self, key, scope=None):
        if scope is None:
            scope = self.default_scope

        if len(key) > 256:
            e = Exception('`key` is too long. Length of `key` should be less then 256')
            raise e
        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        store_id = self._get_id(key, scope)

        sql = self._task.db.create_sql_builder()
        sql.DELETE_FROM('biz_main_func_store')
        sql.WHERE({
            'id': store_id,
        })
        sql.LIMIT(1)

        self._task.db.query(sql)

    def delete_pattern(self, pattern='*', scope=None):
        if scope is None:
            scope = self.default_scope

        if len(scope) > 256:
            e = Exception('`scope` is too long. Length of `scope` should be less then 256')
            raise e

        pattern = self._convert_pattern(pattern)

        sql = self._task.db.create_sql_builder()
        sql.DELETE_FROM('biz_main_func_store')
        sql.WHERE([
            { 'LEFT': 'key', 'OP': 'like', 'RIGHT': pattern },
            { 'LEFT': 'scope', 'RIGHT': scope },
        ])

        self._task.db.query(sql)

class FuncCacheHelper(object):
    def __init__(self, task, default_scope):
        self._task = task

        self.default_scope = default_scope

    def __call__(self, *args, **kwargs):
        return self.get(*args, **kwargs)

    def _get_scoped_key(self, key, scope):
        if scope is None:
            scope = self.default_scope

        if isinstance(key, (list, tuple)):
            key = list(map(lambda k: toolkit.get_cache_key('funcCache', scope, tags=['key', k]), key))
        else:
            key = toolkit.get_cache_key('funcCache', scope, tags=['key', key])

        return key

    def _get_origin_key(self, key, scope):
        if scope is None:
            scope = self.default_scope

        key_template = self._get_scoped_key('\n', scope)
        a, b = map(len, key_template.splitlines())
        return key[a:-b]

    def run(self, cmd, key, *args, **kwargs):
        scope = kwargs.pop('scope', None)
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.run(cmd, key, *args, **kwargs)

    # Generic
    def ping(self):
        return self._task.cache_db.ping()

    def info(self):
        return self._task.cache_db.info()

    def dbsize(self):
        return self._task.cache_db.dbsize()

    def type(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.type(key)

    def keys(self, pattern='*', scope=None):
        pattern = self._get_scoped_key(pattern, scope)
        res = self._task.cache_db.keys(pattern)
        res = list(map(lambda x: self._get_origin_key(x, scope), res))
        return res

    def exists(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.exists(key)

    def expire(self, key, expires, expire=None, scope=None):
        expires = expires or expire

        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.expire(key, expires)

    def expireat(self, key, timestamp, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.expireat(key, timestamp)

    def ttl(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.ttl(key)

    def pttl(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.pttl(key)

    def delete(self, key, scope=None):
        keys = toolkit.as_array(key)
        keys = self._get_scoped_key(keys, scope)
        return self._task.cache_db.delete(keys)

    # String
    def set(self, key, value, expires=None, not_exists=False, exists=False, expire=None, scope=None):
        expires = expires or expire

        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.set(key, value, expires=expires, not_exists=not_exists, exists=exists)

    def mset(self, key_values, scope=None):
        key_values = dict([ (self._get_scoped_key(k, scope), v) for k, v in key_values.items() ])
        return self._task.cache_db.mset(key_values)

    def get(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.get(key)

    def mget(self, keys, scope=None):
        keys = self._get_scoped_key(keys, scope)
        res = self._task.cache_db.mget(keys)
        res = dict([ (self._get_origin_key(k, scope), v) for k, v in res.items() ])
        return res

    def getset(self, key, value, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.getset(key, value)

    def incr(self, key, step=1, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.incrby(key, step)

    def incrby(self, key, step, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.incrby(key, step)

    # Hash
    def hkeys(self, key, pattern='*', with_values=False, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hkeys(key, pattern, with_values)

    def hset(self, key, field, value, not_exists=False, scope=None):
        key = self._get_scoped_key(key, scope)
        if not not_exists:
            return self._task.cache_db.hset(key, field, value)
        else:
            return self._task.cache_db.hsetnx(key, field, value)

    def hmset(self, key, field_values, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hmset(key, field_values)

    def hsetnx(self, key, field, value, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hsetnx(key, field, value)

    def hget(self, key, field, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hget(key, field)

    def hmget(self, key, fields, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hmget(key, fields)

    def hgetall(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hgetall(key)

    def hincr(self, key, field, step=1, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hincrby(key, field, step)

    def hincrby(self, key, field, step, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hincrby(key, field, step)

    def hdel(self, key, field, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.hdel(key, field)

    # List
    def lpush(self, key, value, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.lpush(key, value)

    def rpush(self, key, value, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.rpush(key, value)

    def lpop(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.lpop(key)

    def rpop(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.rpop(key)

    def blpop(self, key, timeout=0, scope=None):
        key = self._get_scoped_key(key, scope)
        real_key, value = self._task.cache_db.blpop(key, timeout)
        return [ self._get_origin_key(real_key, scope), value ]

    def brpop(self, key, timeout=0, scope=None):
        key = self._get_scoped_key(key, scope)
        real_key, value = self._task.cache_db.brpop(key, timeout)
        return [ self._get_origin_key(real_key, scope), value ]

    def rpoplpush(self, key, dest_key=None, scope=None, dest_scope=None):
        dest_key   = dest_key   or key
        dest_scope = dest_scope or scope

        key      = self._get_scoped_key(key, scope)
        dest_key = self._get_scoped_key(dest_key, dest_scope)
        return self._task.cache_db.rpoplpush(key, dest_key)

    def brpoplpush(self, key, dest_key=None, timeout=0, scope=None, dest_scope=None):
        dest_key   = dest_key   or key
        dest_scope = dest_scope or scope

        key      = self._get_scoped_key(key, scope)
        dest_key = self._get_scoped_key(dest_key, dest_scope)
        return self._task.cache_db.brpoplpush(key, dest_key, timeout)

    def llen(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.llen(key)

    def lrange(self, key, start=0, stop=-1, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.lrange(key, start, stop)

    def ltrim(self, key, start, stop, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.ltrim(key, start, stop)

    # List alias
    def push(self, *args, **kwargs):
        return self.lpush(*args, **kwargs)

    def pop(self, *args, **kwargs):
        return self.rpop(*args, **kwargs)

    def bpop(self, *args, **kwargs):
        return self.brpop(*args, **kwargs)

    # Set
    def sadd(self, key, member, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.sadd(key, member)

    def srem(self, key, member, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.srem(key, member)

    def scard(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.scard(key)

    def smembers(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.smembers(key)

    def sismember(self, key, member, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.sismember(key, member)

    # ZSet
    def zadd(self, key, member_scores, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.zadd(key, member_scores)

    def zrem(self, key, member, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.zrem(key, member)

    def zcard(self, key, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.zcard(key)

    def zrange(self, key, start=0, stop=-1, with_scores=False, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.zrange(key, start, stop, with_scores=with_scores)

    def zrangebyscore(self, key, min_score='-inf', max_score='+inf', with_scores=False, scope=None):
        key = self._get_scoped_key(key, scope)
        return self._task.cache_db.zrangebyscore(key, min_score, max_score, with_scores=with_scores)

    # Pub
    def publish(self, topic, message, scope=None):
        topic = self._get_scoped_key(topic, scope)
        return self._task.cache_db.publish(topic, message)

    # Extend
    def get_pattern(self, pattern, scope=None):
        pattern = self._get_scoped_key(pattern, scope)
        res = self._task.cache_db.get_pattern(pattern)
        res = dict([ (self._get_origin_key(k, scope), v) for k, v in res.items() ])
        return res

    def delete_pattern(self, pattern, scope=None):
        pattern = self._get_scoped_key(pattern, scope)
        return self._task.cache_db.delete_pattern(pattern)

class FuncConfigHelper(object):
    MASKED_CONFIG = toolkit.json_mask(CONFIG)

    def __init__(self, task):
        self._task = task

    def __call__(self, *args, **kwargs):
        return self.get(*args, **kwargs)

    def get(self, key, default=None, unmask=False):
        if key in self.MASKED_CONFIG:
            if unmask and key.startswith('CUSTOM_'):
                return toolkit.json_copy(CONFIG[key])
            else:
                return toolkit.json_copy(self.MASKED_CONFIG[key])
        else:
            return toolkit.json_copy(default)

    def query(self, all_configs=False, unmask=False, list_output=False):
        res = {}
        for k in self.MASKED_CONFIG.keys():
            if not all_configs and not k.startswith('CUSTOM_'):
                continue

            res[k] = self.get(k, unmask=unmask)

        if list_output:
            res = list([ { 'key': k, 'value': v } for k, v in res.items() ])

        return res

class BaseFuncResponse(object):
    def __init__(self,
                 data=None,
                 file_path=None,
                 status_code=None,
                 content_type=None,
                 headers=None,
                 allow_304=False,
                 auto_delete=False,
                 download=True):
        self.data         = data          # Data to return
        self.file_path    = file_path     # File to send (rel path from resource folder)
        self.status_code  = status_code   # HTTP status code
        self.content_type = content_type  # HTTP response content type
        self.headers      = headers or {} # HTTP header
        self.allow_304    = allow_304     # Allow 304 or not
        self.auto_delete  = auto_delete   # if remove file to send after responsed or not
        self.download     = download      # if response as download file or not

        # Check if the file to send exists
        if self.file_path:
            if not os.path.isfile(get_resource_path(self.file_path)):
                e = Exception(f'No such file in Resource folder: {self.file_path}')
                raise e

    def make_response_control(self):
        response_control = {
            'statusCode' : self.status_code,
            'contentType': self.content_type,
            'headers'    : self.headers,
            'allow304'   : self.allow_304,
            'download'   : self.download,
        }

        if self.file_path:
            response_control['filePath']   = self.file_path
            response_control['autoDelete'] = self.auto_delete

        response_control = toolkit.no_none_or_whitespace(response_control)

        return response_control

class FuncResponse(BaseFuncResponse):
    def __init__(self,
                 data,
                 status_code=None,
                 content_type=None,
                 headers=None,
                 allow_304=False,
                 download=False):
        try:
            # Try to dump response data
            toolkit.json_dumps(data, indent=None)
        except Exception as e:
            data = Exception(f'Func Response cannot been serialized: {e}')

        super().__init__(data=data,
                         status_code=status_code,
                         content_type=content_type,
                         headers=headers,
                         allow_304=allow_304,
                         download=download)

class FuncResponseFile(BaseFuncResponse):
    def __init__(self,
                 file_path,
                 status_code=None,
                 headers=None,
                 allow_304=False,
                 auto_delete=False,
                 download=True):
        super().__init__(file_path=file_path,
                         status_code=status_code,
                         headers=headers,
                         allow_304=allow_304,
                         auto_delete=auto_delete,
                         download=download)

class FuncResponseLargeData(BaseFuncResponse):
    def __init__(self, data, content_type=None):
        if not content_type:
            if isinstance(data, (dict, list, tuple)):
                content_type = 'json'
            else:
                content_type = 'txt'

        if not isinstance(data, str):
            data = toolkit.json_dumps(data)

        self.tmp_file_ext  = content_type
        self.tmp_file_data = data

        super().__init__(auto_delete=True, download=False)

    def cache_to_file(self, cache_expires=0):
        # Ensure at least 60s for cache
        if not isinstance(cache_expires, (int, float)) or cache_expires < 60:
            cache_expires = 60

        tmp_dir    = CONFIG['DOWNLOAD_TEMP_FILE_DIR']
        expire_tag = arrow.get(time.time() + cache_expires).format('YYYYMMDDHHmmss')
        rand_tag   = toolkit.gen_rand_string(16)

        tmp_file_path = f"{tmp_dir}/{expire_tag}_{rand_tag}_api-resp.{self.tmp_file_ext}"
        with open(get_resource_path(tmp_file_path), 'w') as _f:
            _f.write(self.tmp_file_data)

        self.file_path = tmp_file_path

class FuncRedirect(FuncResponse):
    def __init__(self, url):
        if not isinstance(url, str):
            raise TypeError(f'URL should be a str, not {type(url)}')

        quoted_url = ''.join(map(lambda c: c if len(c.encode('utf8')) == 1 else urllib.parse.quote(c), url))
        data       = f'<a href="{quoted_url}">Redirect</a>'
        headers    = { 'Location': quoted_url }

        super().__init__(data=data,
                         status_code=302,
                         content_type='html',
                         headers=headers)

class FuncThreadResult(object):
    def __init__(self, key, value, error=None):
        self.key   = key
        self.value = value
        self.error = error

class FuncThreadHelper(object):
    def __init__(self, task):
        self._task = task

    @property
    def is_all_finished(self):
        global FUNC_THREAD_RESULT_MAP

        if not FUNC_THREAD_RESULT_MAP:
            return True

        return all([ future_res.done() for key, future_res in FUNC_THREAD_RESULT_MAP.items() ])

    @property
    def pool_size(self):
        global FUNC_THREAD_POOL_SIZE
        return FUNC_THREAD_POOL_SIZE

    def set_pool_size(self, pool_size):
        global FUNC_THREAD_POOL
        global FUNC_THREAD_POOL_SIZE

        if FUNC_THREAD_POOL:
            _msg = f"[THREAD POOL] Cannot set thread pool size after task submitted, skip"
            self._task.logger.info(_msg)
            self._task._log(self._task.script_scope, _msg)
            return

        # Check pool size
        try:
            pool_size = int(pool_size)
            if pool_size <= 0:
                raise ValueError()

        except Exception as e:
            e = Exception('Invalid pool size, should be an integer which is greater than 0')
            raise e

        FUNC_THREAD_POOL_SIZE = pool_size

    def create_pool(self):
        global FUNC_THREAD_POOL
        global FUNC_THREAD_POOL_SIZE

        if FUNC_THREAD_POOL:
            _msg = f"[THREAD POOL] Thread pool is already created, skip"
            self._task.logger.info(_msg)
            self._task._log(self._task.script_scope, _msg)
            return

        pool_size = FUNC_THREAD_POOL_SIZE or CONFIG['_FUNC_TASK_THREAD_POOL_SIZE_DEFAULT']
        FUNC_THREAD_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=pool_size)

        _msg = f"[THREAD POOL] Pool created (size={pool_size})"
        self._task.logger.debug(_msg)
        self._task._log(self._task.script_scope, _msg)

    def submit(self, fn, *args, **kwargs):
        global FUNC_THREAD_POOL
        global FUNC_THREAD_RESULT_MAP

        if not FUNC_THREAD_POOL:
            self.create_pool()

        key = toolkit.gen_data_id('thread-result')
        self._task.logger.debug(f'[THREAD POOL] Submit Key=`{key}`')

        if key in FUNC_THREAD_RESULT_MAP:
            e = DuplicatedThreadResultKey(f'Thread result key already existed: `{key}`')
            raise e

        args   = args   or []
        kwargs = kwargs or {}
        FUNC_THREAD_RESULT_MAP[key] = FUNC_THREAD_POOL.submit(fn, *args, **kwargs)

        return key

    def _get_result(self, key=None, wait=True):
        global FUNC_THREAD_RESULT_MAP

        if not FUNC_THREAD_RESULT_MAP:
            return None

        collected_res = {}

        keys = key or list(FUNC_THREAD_RESULT_MAP.keys())
        for k in toolkit.as_array(keys):
            k = str(k)

            collected_res[k] = None

            future_res = FUNC_THREAD_RESULT_MAP.get(k)
            if future_res is None:
                continue

            if not future_res.done() and not wait:
                continue

            value = None
            error = None
            try:
                value = future_res.result()
            except Exception as e:
                error = e
            finally:
                collected_res[k] = FuncThreadResult(key=k, value=value, error=error)

        if key:
            return collected_res.get(key)
        else:
            return collected_res

    def get_result(self, key, wait=True):
        return self._get_result(key=key, wait=wait)

    def get_all_results(self, wait=True):
        return self._get_result(wait=wait).values()

    def pop_result(self, wait=True):
        global FUNC_THREAD_RESULT_MAP

        if not FUNC_THREAD_RESULT_MAP:
            return None

        finished_key = None
        while True:
            # Find the result that is done
            for key, future_res in FUNC_THREAD_RESULT_MAP.items():
                if future_res.done():
                    finished_key = key
                    break

            # Not found, wait
            if not finished_key and wait:
                for _ in concurrent.futures.wait(FUNC_THREAD_RESULT_MAP.values(), return_when=concurrent.futures.FIRST_COMPLETED):
                    break
                continue

            break

        if finished_key is None:
            return None

        future_res = FUNC_THREAD_RESULT_MAP.pop(finished_key)

        value = None
        error = None
        try:
            value = future_res.result()
        except Exception as e:
            error = e
        finally:
            return FuncThreadResult(key=finished_key, value=value, error=error)

    def wait_all_finished(self):
        self._get_result(wait=True)

class BaseFuncEntityHelper(object):
    _table         = None
    _entity_origin = None

    _entity_queue_default   = CONFIG['_FUNC_TASK_QUEUE_DEFAULT']
    _entity_timeout_default = CONFIG['_FUNC_TASK_TIMEOUT_DEFAULT']
    _entity_expires_default = CONFIG['_FUNC_TASK_EXPIRES_DEFAULT']

    def __init__(self, task):
        self._task = task

    def __call__(self, *args, **kwargs):
        return self.call(*args, **kwargs)

    def resolve_entity_id(self, entity_id=None):
        if not entity_id:
            if self._task.origin == self._entity_origin:
                return self._task.origin_id
            else:
                return None

        return entity_id

    def get(self, entity_id=None):
        resolved_entity_id = self.resolve_entity_id(entity_id)

        sql = self._task.db.create_sql_builder()
        sql.SELECT([
            'entity.*',
            sql.FIELD('sset.title', 'scriptSetTitle'),
            sql.FIELD('scpt.title', 'scriptTitle'),
            sql.FIELD('func.title', 'funcTitle'),

            sql.FIELD('func.extraConfigJSON', 'funcExtraConfigJSON'),
        ])
        sql.FROM(self._table, 'entity')
        sql.LEFT_JOIN('biz_main_func', 'func', {
            'func.id': 'entity.funcId',
        })
        sql.LEFT_JOIN('biz_main_script', 'scpt', {
            'scpt.id': 'func.scriptId',
        })
        sql.LEFT_JOIN('biz_main_script_set', 'sset', {
            'sset.id': 'func.scriptSetId',
        })
        sql.WHERE({
            'entity.id': resolved_entity_id,
        })
        sql.LIMIT(1)

        db_res = self._task.db.query(sql)
        if db_res:
            return db_res[0]

        return None

    def save(self, entity_id, data):
        # Check if exists
        sql = self._task.db.create_sql_builder()
        sql.SELECT('id')
        sql.FROM(self._table)
        sql.WHERE({
            'id': entity_id,
        })
        sql.LIMIT(1)

        db_res = self._task.db.query(sql)

        if len(db_res) > 0:
            # Update if exists
            sql = self._task.db.create_sql_builder()
            sql.UPDATE(self._table)
            sql.SET(data)
            sql.WHERE({
                'id': entity_id,
            })
            sql.LIMIT(1)

            self._task.db.query(sql)

        else:
            # Insert if not exist
            _insert_data = toolkit.json_copy(data)
            _insert_data['id'] = entity_id

            sql = self._task.db.create_sql_builder()
            sql.INSERT_INTO(self._table)
            sql.VALUES(_insert_data)

            self._task.db.query(sql)

    def query(self, fields=None, filters=None):
        fields = toolkit.as_array(fields) or '*'

        sql = self._task.db.create_sql_builder()
        sql.SELECT(fields)
        sql.FROM(self._table)

        if filters:
            for field, conditions in filters.items():
                for op, value in conditions.items():
                    sql.WHERE({
                        'LEFT' : field,
                        'OP'   : op,
                        'RIGHT': value,
                    })

        db_res = self._task.db.query(sql)
        return db_res

    def call(self, entity_id, kwargs=None, trigger_time=None, queue=None, timeout=None, expires=None):
        entity = self.get(entity_id)

        func_extra_config = entity.get('funcExtraConfigJSON') or {}

        # Task request
        task_req = {
            'name': 'Func.Runner',
            'kwargs': {
                'funcId'         : entity['funcId'],
                'funcCallKwargs' : kwargs,
                'origin'         : self._entity_origin,
                'originId'       : entity_id,

                'scriptSetTitle': entity.get('scriptSetTitle'),
                'scriptTitle'   : entity.get('scriptTitle'),
                'funcTitle'     : entity.get('funcTitle'),
            },

            'triggerTime'    : trigger_time,
            'queue'          : None,
            'timeout'        : None,
            'expires'        : None,
            'taskRecordLimit': entity['taskRecordLimit'],
        }

        # Further config
        # NOTE Same to mainAPICtrl.js#createFuncRunnerTaskReq(...)

        #  Queue: taskReq.queue
        #    Priority: Specify directly > Func config > Default
        if queue is not None:
            # Specified directly
            queue_number = int(queue)
            if queue_number < 1 or queue_number > 9:
                e = BadEntityCall('Invalid options, queue should be an integer between 1 and 9')
                raise e

            task_req['queue'] = queue_number

        elif func_extra_config.get('queue') is not None:
            # Func config
            task_req['queue'] = int(func_extra_config['queue'])

        else:
            # Default
            task_req['queue'] = self._entity_queue_default

        # Task run timeout: taskReq.timeout
        #    Priority: Specified directly > Func config > Default
        if timeout is not None:
            # Specified directly
            timeout = int(timeout)

            if timeout < CONFIG['_FUNC_TASK_TIMEOUT_MIN']:
                e = BadEntityCall('Invalid options, timeout is too small')
                raise e

            elif timeout > CONFIG['_FUNC_TASK_TIMEOUT_MAX']:
                e = BadEntityCall('Invalid options, timeout is too large')
                raise e

            task_req['timeout'] = timeout

        elif func_extra_config.get('timeout') is not None:
            # Func config
            task_req['timeout'] = int(func_extra_config['timeout'])

        else:
            # Default
            task_req['timeout'] = self._entity_timeout_default

        # Task run expires: taskReq.expires
        #    Priority: Specified directly > Func config > Default
        if expires is not None:
            # Specified directly
            expires = int(expires)

            if expires < CONFIG['_FUNC_TASK_EXPIRES_MIN']:
                e = BadEntityCall('Invalid options, expires is too small')
                raise e

            elif expires > CONFIG['_FUNC_TASK_EXPIRES_MAX']:
                e = BadEntityCall('Invalid options, expires is too large')
                raise e

            task_req['expires'] = expires

        elif func_extra_config.get('expires') is not None:
            # Func config
            task_req['expires'] = int(func_extra_config['expires'])

        else:
            # Default
            if self._entity_origin in ('syncAPI', 'asyncAPI'):
                # Sync / Async API have the same default expires and timeout
                task_req['expires'] = task_req.get('timeout') or self._entity_expires_default
            else:
                task_req['expires'] = self._entity_expires_default

        # Return type: taskReq.returnType
        # NOTE All Biz Entity callings inside Func are async, nothing to do with return values

        self._task.cache_db.put_tasks(task_req)

class FuncSyncAPIHelper(BaseFuncEntityHelper):
    _table         = 'biz_main_sync_api'
    _entity_origin = 'syncAPI'

class FuncAsyncAPIHelper(BaseFuncEntityHelper):
    _table         = 'biz_main_async_api'
    _entity_origin = 'asyncAPI'

    _entity_queue_default   = CONFIG['_FUNC_TASK_QUEUE_ASYNC_API']
    _entity_timeout_default = CONFIG['_FUNC_TASK_TIMEOUT_ASYNC_API']

class FuncCronJobHelper(BaseFuncEntityHelper):
    _table         = 'biz_main_cron_job'
    _entity_origin = 'cronJob'

    _entity_queue_default = CONFIG['_FUNC_TASK_QUEUE_CRON_JOB']

    # [Compatibility] `crontab` was changed to `cronExpr`
    _field_remap = {
        'crontab': 'cronExpr',
    }

    def query(self, fields=None, filters=None):
        # [Compatibility] Some field are renamed
        if fields:
            next_fields = []
            for f in fields:
                next_fields.append(self._field_remap.get(f, f))

            fields = next_fields

        if filters:
            next_filters = {}
            for f, v in filters.items():
                next_filters[self._field_remap.get(f, f)] = v

            filters = next_filters

        return super().query(fields, filters)

    def set_cron_expr(self, cron_expr, expires=None, entity_id=None):
        entity_id = self.resolve_entity_id(entity_id)
        if not entity_id:
            return

        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        cache_value = {
            'expireTime': None if not expires else int(time.time()) + expires,
            'value'     : cron_expr,
        }
        self._task.cache_db.hset(cache_key, entity_id, toolkit.json_dumps(cache_value))

    def get_cron_expr(self, entity_id=None):
        entity_id = self.resolve_entity_id(entity_id)
        if not entity_id:
            return

        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        dynamic_cron_expr = self._task.cache_db.hget(cache_key, entity_id)
        if not dynamic_cron_expr:
            return None

        dynamic_cron_expr = toolkit.json_loads(dynamic_cron_expr)
        if dynamic_cron_expr['expireTime'] and dynamic_cron_expr['expireTime'] < int(time.time()):
            return None

        return dynamic_cron_expr['value']

    def get_all_cron_expr(self):
        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        dynamic_cron_expr_map = self._task.cache_db.hgetall(cache_key)
        if not dynamic_cron_expr_map:
            return {}

        for entity_id in list(dynamic_cron_expr_map.keys()):
            dynamic_cron_expr = toolkit.json_loads(dynamic_cron_expr_map[entity_id])
            if dynamic_cron_expr['expireTime'] and dynamic_cron_expr['expireTime'] < int(time.time()):
                dynamic_cron_expr_map.pop(entity_id, None)
            else:
                dynamic_cron_expr_map[entity_id] = dynamic_cron_expr['value']

        return dynamic_cron_expr_map

    def clear_cron_expr(self, entity_id=None):
        entity_id = self.resolve_entity_id(entity_id)
        if not entity_id:
            return

        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        self._task.cache_db.hdel(cache_key, entity_id)

    def pause(self, expires, entity_id=None):
        entity_id = self.resolve_entity_id(entity_id)
        if not entity_id:
            return

        # Expires is required, Permanent pause is not allowed
        cache_key = toolkit.get_global_cache_key('cronJob', 'pause')
        cache_value = int(time.time()) + expires
        self._task.cache_db.hset(cache_key, entity_id, cache_value)

    # [Compatibility] `crontab` was changed to `cron_expr`
    def set_crontab(self, *args, **kwargs):
        return self.set_cron_expr(*args, **kwargs)
    def get_crontab(self, *args, **kwargs):
        return self.get_cron_expr(*args, **kwargs)
    def get_all_crontab(self, *args, **kwargs):
        return self.get_all_cron_expr(*args, **kwargs)
    def clear_crontab(self, *args, **kwargs):
        return self.clear_cron_expr(*args, **kwargs)

    def set_temp_crontab(self, *args, **kwargs):
        return self.set_cron_expr(*args, **kwargs)
    def get_temp_crontab(self, *args, **kwargs):
        return self.get_cron_expr(*args, **kwargs)
    def get_all_temp_crontab(self, *args, **kwargs):
        return self.get_all_cron_expr(*args, **kwargs)
    def clear_temp_crontab(self, *args, **kwargs):
        return self.clear_cron_expr(*args, **kwargs)

class FuncExtraGuanceDataHelper(object):
    def __init__(self, task):
        self._task = task

        self._tags   = {}
        self._fields = {}

        self._more_data = []

    @property
    def tags(self):
        return toolkit.json_copy(self._tags) or {}

    @property
    def fields(self):
        return toolkit.json_copy(self._fields) or {}

    @property
    def more_data(self):
        return toolkit.json_copy(self._more_data) or []

    def set_tags(self, tags):
        for k, v in tags.items():
            if v in ( None, '' ):
                continue

            self._tags[k] = str(v)

    def delete_tags(self, *keys):
        for k in keys:
            self._tags.pop(k, None)

    def set_fields(self, fields):
        for k, v in fields.items():
            if v in ( None, '' ):
                continue

            self._fields[k] = v

    def incr_field(self, field, step=1):
        v = self._fields.get(field) or 0
        self._fields[field] = v + step

    def delete_fields(self, *keys):
        for k in keys:
            self._fields.pop(k, None)

    def add_more_data(self, measurement, tags=None, fields=None):
        self._more_data.append({
            'measurement': measurement,
            'tags'       : tags,
            'fields'     : fields,
        })

class ToolkitWrap(object):
    gen_uuid               = toolkit.gen_uuid
    json_find              = toolkit.json_find
    json_find_safe         = toolkit.json_find_safe
    json_smart_find        = toolkit.json_smart_find
    json_override          = toolkit.json_override
    json_pick              = toolkit.json_pick
    json_dumps             = toolkit.json_dumps
    json_loads             = toolkit.json_loads
    json_copy              = toolkit.json_copy
    get_arrow              = toolkit.get_arrow
    get_date_string        = toolkit.get_date_string
    get_time_string        = toolkit.get_time_string
    get_datetime_string    = toolkit.get_datetime_string
    get_datetime_string_cn = toolkit.get_datetime_string_cn
    to_unix_timestamp      = toolkit.to_unix_timestamp
    to_unix_timestamp_ms   = toolkit.to_unix_timestamp_ms
    to_iso_datetime        = toolkit.to_iso_datetime
    to_boolean             = toolkit.to_boolean
    get_days_from_now      = toolkit.get_days_from_now
    get_md5                = toolkit.get_md5
    get_sha1               = toolkit.get_sha1
    get_sha256             = toolkit.get_sha256
    get_sha512             = toolkit.get_sha512
    cipher_by_aes          = toolkit.cipher_by_aes
    decipher_by_aes        = toolkit.decipher_by_aes
    get_base64             = toolkit.get_base64
    from_base64            = toolkit.from_base64
    gen_rand_string        = toolkit.gen_rand_string
    as_array               = toolkit.as_array
    as_array_str           = toolkit.as_array_str
    match_wildcard         = toolkit.match_wildcard
    match_wildcards        = toolkit.match_wildcards

class FuncBaseTask(BaseTask):
    ROOT_TASK_ID_OF_ROOT_TASK = 'ROOT'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.__context_helper = FuncContextHelper(self)

        self.__loaded_script_cache   = toolkit.LocalCache()
        self.__imported_module_cache = toolkit.LocalCache()

        self.__prev_log_time = 0

        # Func ID
        self.func_id = self.kwargs.get('funcId')

        # Func calling kwargs
        self.func_call_kwargs = self.kwargs.get('funcCallKwargs') or {}

        # Script Set ID, Script ID, Script name, Func name
        if '.' in self.func_id:
            self.script_id, self.func_name = self.func_id.split('.', maxsplit=1)
        else:
            self.script_id, self.func_name = self.func_id, None

        self.script_set_id, self.script_name = self.script_id.split('__', maxsplit=1)

        # Script Set, Script, Func title
        self.script_set_title = self.kwargs.get('scriptSetTitle')
        self.script_title     = self.kwargs.get('scriptTitle')
        self.func_title       = self.kwargs.get('funcTitle')

        # Task origin
        self.origin    = self.kwargs.get('origin')
        self.origin_id = self.kwargs.get('originId')

        # Root Task ID
        self.root_task_id = self.kwargs.get('rootTaskId') or self.ROOT_TASK_ID_OF_ROOT_TASK

        # Call chain
        self.call_chain = self.kwargs.get('callChain') or []
        self.call_chain.append(self.func_id)

        # HTTP request
        self.http_request = self.kwargs.get('httpRequest') or {}
        if 'headers' in self.http_request:
            self.http_request['headers'] = toolkit.IgnoreCaseDict(self.http_request['headers'])

        # Func result cache
        self.cache_result     = self.kwargs.get('cacheResult') or False
        self.cache_result_key = self.kwargs.get('cacheResultKey')

        # Script / Script scope
        self.script       = None
        self.script_scope = None

        # `print` log lines
        self.__print_log_lines = None

        # Extra data for Guance, TrueWatch
        self.extra_guance_data = FuncExtraGuanceDataHelper(self)

        log_attrs = [
            'func_id',
            'script_id',
            'func_name',
            'script_set_id',
            'script_name',
            'origin',
            'origin_id',
            'root_task_id',
            'call_chain',
            'cache_result',
            'cache_result_key',
        ]
        self.logger.debug(f"[INIT FUNC TASK] {', '.join([f'{a}: `{getattr(self, a)}`' for a in log_attrs])}")

    @property
    def is_root_task(self):
        return self.root_task_id == self.ROOT_TASK_ID_OF_ROOT_TASK

    @property
    def api_funcs(self):
        if not self.script_scope:
            return []

        return self.script_scope['DFF'].api_funcs or []

    def __make_print_log_lines(self):
        lines = self.script_scope['DFF'].print_log_lines or []

        mask_strings = []

        env_helper = self.script_scope['DFF'].inject_objs.get('ENV')
        if env_helper:
            all_envs = env_helper._FuncEnvVariableHelper__loaded_env_variable_cache.get_all()
            mask_strings = [ env['valueTEXT'] for env in all_envs if env['autoTypeCasting'] == 'password' ]
            mask_strings.sort(key=len, reverse=True)

        formated_lines = []
        for l in lines:
            if mask_strings:
                for ms in mask_strings:
                    l['message'] = l['message'].replace(ms, '*****')

            formated_lines.append(f"[{l['time']}] [+{l['delta']}ms] [{l['total']}ms] {l['message']}")

        self.__print_log_lines = formated_lines

    @property
    def print_log_lines(self):
        if not self.script_scope:
            return []

        if not self.__print_log_lines:
            self.__make_print_log_lines()

        return self.__print_log_lines

    def _get_func_defination(self, F):
        f_co   = six.get_function_code(F)
        # f_name = f_co.co_name
        f_name = F.__name__
        if f_name:
            f_name = f_name.strip()

        f_doc  = F.__doc__
        if f_doc:
            f_doc = inspect.cleandoc(f_doc)

        f_sig = funcsigs.signature(F)
        f_def = f'{f_name}{f_sig}'.strip()

        f_argspec = None
        f_args    = None
        f_kwargs  = {}
        if six.PY3:
            f_argspec = inspect.getfullargspec(F)
        else:
            f_argspec = inspect.getargspec(F)

        f_args = f_argspec.args
        if f_argspec.varargs:
            f_args.append(f'*{f_argspec.varargs}')
        if f_argspec.varkw:
            f_args.append(f'**{f_argspec.varkw}')

        for arg_name, args_info in f_sig.parameters.items():
            if str(args_info.kind) == 'VAR_POSITIONAL':
                f_kwargs[f'*{arg_name}'] = {}

            elif str(args_info.kind) == 'VAR_KEYWORD':
                f_kwargs[f'**{arg_name}'] = {}

            elif str(args_info.kind) == 'POSITIONAL_OR_KEYWORD':
                f_kwargs[arg_name] = {}

                if args_info.default is not funcsigs._empty:
                    arg_default = '<Complex Object>'
                    try:
                        arg_default = toolkit.json_copy(args_info.default)
                    except Exception as e:
                        pass
                    finally:
                        f_kwargs[arg_name]['default'] = arg_default

        return (f_name, f_def, f_args, f_kwargs, f_doc)

    def _resolve_fromlist(self, module, fromlist, globals):
        if not all([module, fromlist, globals]):
            return

        for import_name in fromlist:
            if import_name in module.__dict__:
                globals[import_name] = module.__dict__[import_name]
            else:
                e = Exception(f'CustomImport: Cannot import name `{import_name}`')
                raise e

    def _custom_import(self, name, globals=None, locals=None, fromlist=None, level=0, parent_scope=None):
        '''
        Importing user Scripts is based on the `scriptset__script` naming style
        Importing general 3rd party modules keeps the original way
        '''
        entry_script_id = globals.get('__name__')

        import_script_id = name
        import_script    = None

        # Only user Scripts support relative name to
        # use "__scriptname" instead of "scriptsetname__scriptname" to import
        if name.startswith('__') and name not in USER_SCRIPT_ID_BLACK_LIST:
            import_script_id = entry_script_id.split('__')[0] + name

        # Do import
        import_script = self.load_script(import_script_id)
        if import_script:
            # Import user Script
            _module = self.__imported_module_cache[import_script_id]
            if _module:
                # self.logger.debug(f'[CUSTOM IMPORT] user script `{import_script_id}` already imported')
                pass

            else:
                # self.logger.debug(f'[CUSTOM IMPORT] import user script `{import_script_id}`')

                try:
                    _module = ModuleType(import_script_id)
                    _module.__dict__.clear()

                    module_scope = self.create_safe_scope(import_script_id)
                    if parent_scope:
                        module_scope['DFF'].print_log_lines = parent_scope['DFF'].print_log_lines

                        for k, v in parent_scope.items():
                            if k.startswith('_DFF_'):
                                module_scope[k] = v

                    _module.__dict__.update(module_scope)

                    script_code_obj = import_script['codeObj']
                    exec(script_code_obj, _module.__dict__)

                    self.__imported_module_cache[import_script_id] = _module

                except Exception as e:
                    raise

            # Do not add module it self to context
            self._resolve_fromlist(_module, fromlist, globals)

            return _module

        else:
            # Use original way to import general 3rd party module
            # self.logger.debug(f'[CUSTOM IMPORT] import non-user module `{import_script_id}`')

            return importlib.__import__(name, globals=globals, locals=locals, fromlist=fromlist, level=level)

    def _export_as_api(self, safe_scope, title,
                    # Configs for controls
                    fixed_cron_expr=None, delayed_cron_job=None, timeout=None, expires=None, cache_result=None, queue=None,
                    # Configs for marking
                    category=None, tags=None,
                    # Configs for integration
                    integration=None, integration_config=None,
                    # Configs for doc
                    is_hidden=False,
                    # [Compatibility] `fixed_crontab`, `delayed_crontab`
                    #         were changed to `fixed_cron_expr`, `delayed_cron_job`
                    fixed_crontab=None, delayed_crontab=None,
                    # [Compatibility] `api_timeout` is deprecated
                    api_timeout=None):

        # [Compatibility] `fixed_crontab` was changed to `fixed_cron_expr`
        fixed_cron_expr  = fixed_cron_expr  or fixed_crontab
        delayed_cron_job = delayed_cron_job or delayed_crontab

        ### Check / prepare configs ###
        extra_config = {}

        # Func title
        if title is not None and not isinstance(title, (six.string_types, six.text_type)):
            e = InvalidAPIOption('`title` should be a string or unicode')
            raise e

        ########################
        # Configs for controls #
        ########################

        # Fixed cron expression
        # [Compatibility] `fixed_crontab` was changed to `fixed_cron_expr`
        if fixed_crontab is not None:
            if not toolkit.is_valid_cron_expr(fixed_crontab):
                e = InvalidAPIOption('`fixed_crontab` is not a valid cron expression')
                raise e

            if len(fixed_crontab.split(' ')) > 5:
                e = InvalidAPIOption('`fixed_crontab` does not support second part')
                raise e

        if fixed_cron_expr is not None:
            if not toolkit.is_valid_cron_expr(fixed_cron_expr):
                e = InvalidAPIOption('`fixed_cron_expr` is not a valid cron expression')
                raise e

            if len(fixed_cron_expr.split(' ')) > 5:
                e = InvalidAPIOption('`fixed_cron_expr` does not support second part')
                raise e

            extra_config['fixedCronExpr'] = fixed_cron_expr

        # Delayed Cron Job (second, multiple)
        # [Compatibility] `delayed_crontab` was changed to `delayed_cron_job`
        if delayed_crontab is not None:
            delayed_crontab = toolkit.as_array(delayed_crontab)

            for d in delayed_crontab:
                if not isinstance(d, int):
                    e = InvalidAPIOption('All elements of `delayed_crontab` should be int')
                    raise e

        if delayed_cron_job is not None:
            delayed_cron_job = toolkit.as_array(delayed_cron_job)
            delayed_cron_job = list(set(delayed_cron_job))
            delayed_cron_job.sort()

            for d in delayed_cron_job:
                if not isinstance(d, int):
                    e = InvalidAPIOption('All elements of `delayed_cron_job` should be int')
                    raise e

            extra_config['delayedCronJob'] = delayed_cron_job

        # Timeout for Task
        # [Compatibility] `api_timeout` is deprecated
        timeout = timeout or api_timeout
        if timeout is not None:
            if not isinstance(timeout, six.integer_types):
                e = InvalidAPIOption('`timeout` should be an integer or long')
                raise e

            _min_timeout = CONFIG['_FUNC_TASK_TIMEOUT_MIN']
            _max_timeout = CONFIG['_FUNC_TASK_TIMEOUT_MAX']
            if not (_min_timeout <= timeout <= _max_timeout):
                e = InvalidAPIOption(f'`timeout` should be between `{_min_timeout}` and `{_max_timeout}` (seconds)')
                raise e

            extra_config['timeout'] = timeout

        # Expires for Task
        if expires is not None:
            if not isinstance(expires, six.integer_types):
                e = InvalidAPIOption('`expires` should be an integer or long')
                raise e

            _min_expires = CONFIG['_FUNC_TASK_EXPIRES_MIN']
            _max_expires = CONFIG['_FUNC_TASK_EXPIRES_MAX']
            if not (_min_expires <= expires <= _max_expires):
                e = InvalidAPIOption(f'`expires` should be between `{_min_expires}` and `{_max_expires}` (seconds)')
                raise e

            extra_config['expires'] = expires

        # Result caching
        if cache_result is not None:
            if not isinstance(cache_result, (int, float)):
                e = InvalidAPIOption('`cache_result` should be an int or a float')
                raise e

            extra_config['cacheResult'] = cache_result

        # Specifying Queue
        if queue is not None:
            if queue == 0:
                e = InvalidAPIOption("`queue` can't be 0 because the #0 queue is a system queue")
                raise e

            available_queues = list(range(CONFIG['_WORKER_QUEUE_COUNT']))
            if queue not in available_queues:
                e = InvalidAPIOption(f'`queue` should be one of {toolkit.json_dumps(available_queues)}')
                raise e

            extra_config['queue'] = queue

        #######################
        # Configs for marking #
        #######################

        # Func category
        if category is not None and not isinstance(category, (six.string_types, six.text_type)):
            e = InvalidAPIOption('`category` should be a string or unicode')
            raise e

        if category is None:
            category = 'general'

        # Func tags
        if tags is not None:
            if not isinstance(tags, (tuple, list)):
                e = InvalidAPIOption('`tags` should be a tuple or a list')
                raise e

            for tag in tags:
                if not isinstance(tag, (six.string_types, six.text_type)):
                    e = InvalidAPIOption('Element of `tags` should be a string or unicode')
                    raise e

            tags = list(set(tags))
            tags.sort()

        ###########################
        # Configs for integration #
        ###########################

        # Integration
        if integration is not None:
            if not isinstance(integration, (six.string_types, six.text_type)):
                e = InvalidAPIOption('`integration` should be a string or unicode')
                raise e

            integration_lower = integration.lower()
            if integration_lower not in FIX_INTEGRATION_KEY_MAP:
                e = InvalidAPIOption(f'Unsupported `integration` value: {integration}')
                raise e

            integration = FIX_INTEGRATION_KEY_MAP[integration_lower]

        # Integration configs
        if integration is not None:
            fixed_integration_config = {}

            integration_config = integration_config or {}
            for k, v in integration_config.items():
                k_lower = k.lower()
                if k_lower not in INTEGRATION_CONFIG_KEY_ALIAS_MAP:
                    e = InvalidAPIOption(f'Unsupported `integration_config` name: {k}')
                    raise e

                fixed_k = INTEGRATION_CONFIG_KEY_ALIAS_MAP[k_lower]
                fixed_integration_config[fixed_k] = v

            extra_config['integrationConfig'] = fixed_integration_config

        ###################
        # Configs for doc #
        ###################

        # Hide Func (do not show in doc)
        # [Compatibility] `extraConfigJSON.isHidden` was changed to DB table column
        # if is_hidden is True:
        #     extra_config['isHidden'] = True

        # @DFF decorater
        def decorater(F):
            f_name, f_def, f_args, f_kwargs, f_doc = self._get_func_defination(F)

            # Add to API Func set
            if f_name in safe_scope['DFF'].api_func_set:
                e = DuplicatedFuncName(f'Two or more functions named `{f_name}`')
                raise e

            safe_scope['DFF'].api_func_set.add(f_name)
            safe_scope['DFF'].api_funcs.append({
                'name'         : f_name,
                'title'        : title,
                'description'  : f_doc,
                'definition'   : f_def,
                'args'         : f_args,
                'kwargs'       : f_kwargs,
                'extraConfig'  : extra_config,
                'category'     : category,
                'integration'  : integration,
                'tags'         : tags,
                'defOrder'     : len(safe_scope['DFF'].api_funcs),
                'isHidden'     : toolkit.to_boolean(is_hidden),
            })

            @functools.wraps(F)
            def dff_api_F(*args, **kwargs):
                return F(*args, **kwargs)

            # Set configs to Func obj attr
            for _f in (F, dff_api_F):
                _f.__setattr__('_DFF_FUNC_ID'         , f'{_f.__module__}.{f_name}')
                _f.__setattr__('_DFF_FUNC_NAME'       , f_name)
                _f.__setattr__('_DFF_FUNC_TITLE'      , title)
                _f.__setattr__('_DFF_FUNC_DESCRIPTION', f_doc)
                _f.__setattr__('_DFF_FUNC_DEFINITION' , f_def)
                _f.__setattr__('_DFF_FUNC_CATEGORY'   , category)
                _f.__setattr__('_DFF_FUNC_TAGS'       , tags)
                _f.__setattr__('_DFF_FUNC_ARGS'       , f_args)
                _f.__setattr__('_DFF_FUNC_KWARGS'     , f_kwargs)

            return dff_api_F
        return decorater

    def _log(self, safe_scope, message):
        now = self.cache_db.get_timestamp(3)

        # Current time tag
        message_time = arrow.get(now).to(CONFIG['TIMEZONE']).format('MM-DD HH:mm:ss')

        # Compute time diff / total cost
        if not self.__prev_log_time:
            self.__prev_log_time = self.start_time

        delta = int((now - self.__prev_log_time) * 1000)
        total = int((now - self.start_time) * 1000)

        self.__prev_log_time = now

        safe_scope['DFF'].print_log_lines.append({
            'time'   : message_time,
            'delta'  : delta,
            'total'  : total,
            'message': message,
        })

    def _print(self, safe_scope, *args, **kwargs):
        try:
            value_list = []
            for arg in args:
                value_list.append(f'{arg}')

            sep = kwargs.get('sep') or ' '
            message = sep.join(value_list)

            self._log(safe_scope, message)

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

    def _call_func(self, safe_scope, func_id, kwargs=None, queue=None, timeout=None, expires=None):
        call_chain = safe_scope.get('_DFF_FUNC_CHAIN') or []
        call_chain_info = ' -> '.join(map(lambda x: f'`{x}`', call_chain))

        # Check length of Func chain
        if len(call_chain) >= CONFIG['_FUNC_TASK_CALL_CHAIN_LIMIT']:
            e = FuncCallChainTooLong(call_chain_info)
            raise e

        # Check repeat calling
        if func_id in call_chain:
            e = FuncCircularCall(f'{call_chain_info} -> [{func_id}]')
            raise e

        # Check and get Func info
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'func.*',

            sql.FIELD('sset.title', 'scriptSetTitle'),
            sql.FIELD('scpt.title', 'scriptTitle'),
            sql.FIELD('func.title', 'funcTitle'),
        ])
        sql.FROM('biz_main_func', 'func')
        sql.JOIN('biz_main_script', 'scpt', {
            'scpt.id': 'func.scriptId',
        })
        sql.JOIN('biz_main_script_set', 'sset', {
            'sset.id': 'func.scriptSetId',
        })
        sql.WHERE({
            'func.id': func_id,
        })
        sql.LIMIT(1)

        db_res = self.db.query(sql)
        if len(db_res) <= 0:
            e = EntityNotFound(f'Function not found: `{func_id}`')
            raise e

        func = db_res[0]
        func_extra_config = func.get('extraConfigJSON') or {}

        # Sub Task - queue
        if not queue:
            if func_extra_config.get('queue'):
                queue = func_extra_config['queue']
            else:
                queue = safe_scope.get('_DFF_QUEUE')

        # Sub Task - timeout
        if not timeout:
            if func_extra_config.get('timeout'):
                timeout = func_extra_config['timeout']
            else:
                timeout = CONFIG['_FUNC_TASK_TIMEOUT_DEFAULT']

        # Sub Task - expires
        if not expires:
            if func_extra_config.get('expires'):
                expires = func_extra_config['expires']
            else:
                expires = CONFIG['_FUNC_TASK_EXPIRES_DEFAULT']

        # Task request
        task_req = {
            'name': 'Func.Runner',
            'kwargs': {
                'rootTaskId'    : self.task_id,
                'funcId'        : func_id,
                'funcCallKwargs': kwargs,
                'origin'        : safe_scope.get('_DFF_ORIGIN'),
                'originId'      : safe_scope.get('_DFF_ORIGIN_ID'),
                'cronExpr'      : safe_scope.get('_DFF_CRON_EXPR'),
                'callChain'     : call_chain,

                'scriptSetTitle': func.get('scriptSetTitle'),
                'scriptTitle'   : func.get('scriptTitle'),
                'funcTitle'     : func.get('funcTitle'),
            },
            'triggerTime'    : safe_scope.get('_DFF_TRIGGER_TIME'),
            'queue'          : queue,
            'timeout'        : timeout,
            'expires'        : expires,
            'taskRecordLimit': self.task_record_limit,
        }
        self.cache_db.put_tasks(task_req)

    def run(self, **kwargs):
        self.logger.info(f'[RUN] Func ID: `{self.func_id}`')

    def load_script(self, script_id, draft=False):
        '''
        Load Script
        1. For draft Script, always read from DB
        2. For published Script, check if the MD5 in local cache (60s expires) and in Redis matches
            a. If matches, use local cached Script directly
            b. Otherwise, read Script from DB and update Redis cache
        '''
        # Only those with `__` in their name are likely to be user Scripts
        if '__' not in script_id:
            return None

        script = self.__loaded_script_cache[script_id]
        if script:
            return script

        global SCRIPT_LOCAL_CACHE

        remote_md5_cache_key = toolkit.get_cache_key('cache', 'dataMD5Cache', ['dataType', 'script'])
        remote_md5           = None

        if not draft:
            script = SCRIPT_LOCAL_CACHE[script_id]
            if script:
                # Check Script MD5 in Redis
                remote_md5 = self.cache_db.hget(remote_md5_cache_key, script_id)
                if remote_md5:
                    remote_md5 = six.ensure_str(remote_md5)

                # Refresh local cache and return if MD5 not changed
                if script['codeMD5'] == remote_md5:
                    self.logger.debug(f'[LOAD SCRIPT] loaded `{script_id}` from Cache')

                    # Refresh local cache
                    SCRIPT_LOCAL_CACHE.refresh(script_id)

                    # Cache Script
                    self.__loaded_script_cache[script_id] = script
                    return script

        code_field     = 'scpt.code'
        code_md5_field = 'scpt.codeMD5'
        if draft == True:
            code_field     = 'scpt.codeDraft'
            code_md5_field = 'scpt.codeDraftMD5'

        sql = self.db.create_sql_builder()
        sql.SELECT([
            'scpt.seq',
            'scpt.id',
            'scpt.publishVersion',

            sql.FIELD(code_field,     'code'),
            sql.FIELD(code_md5_field, 'codeMD5'),
            sql.FIELD('sset.id', 'scriptSetId'),
        ])
        sql.FROM('biz_main_script_set', 'sset')
        sql.JOIN('biz_main_script', 'scpt', {
            'sset.id': 'scpt.scriptSetId',
        })
        sql.WHERE({
            'scpt.id': script_id,
        })
        sql.ORDER_BY('scpt.seq', 'ASC')

        script = self.db.query(sql)
        if not script:
            self.logger.debug(f"[LOAD SCRIPT] `{script_id}` not found")
            return None

        script = script[0]
        script['code']    = script.get('code')    or ''
        script['codeMD5'] = script.get('codeMD5') or ''

        # Get Script from DB
        self.logger.debug(f"[LOAD SCRIPT] loaded `{script_id}`{ ' (DRAFT)' if draft else '' } from DB")

        # Get extra configs for Func
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'id',
            'scriptId',
            'extraConfigJSON',
        ])
        sql.FROM('biz_main_func')
        sql.WHERE({
            'scriptId': script_id,
        })

        funcs = self.db.query(sql)

        self.logger.debug(f"[LOAD FUNC EXTRA CONFIG] loaded `{script_id}`{ ' (DRAFT)' if draft else '' } from DB")

        # Compile Script code
        script_code = script.get('code') or ''
        script_code_obj = compile(script_code, script_id, 'exec')
        script['codeObj'] = script_code_obj

        # Func configs
        script['funcExtraConfig'] = {}
        for f in funcs:
            func_id           = f['id']
            func_extra_config = f['extraConfigJSON']

            script['funcExtraConfig'][func_id] = func_extra_config

        # Only published Script will be cached
        if not draft:
            # Cache Script MD5
            self.cache_db.hset(remote_md5_cache_key, script_id, script['codeMD5'])
            SCRIPT_LOCAL_CACHE[script_id] = script

        # Cache Script
        self.__loaded_script_cache[script_id] = script

        return script

    def create_safe_scope(self, script_name=None, debug=False):
        '''
        Create safe scope
        '''
        safe_scope = {
            '__name__' : script_name or '<script>',
            '__file__' : script_name or '<script>',

            # DataFlux Func builtin variables
            '_DFF_DEBUG'             : debug,
            '_DFF_TASK_ID'           : self.task_id,
            '_DFF_ROOT_TASK_ID'      : self.root_task_id,
            '_DFF_SCRIPT_SET_ID'     : self.script_set_id,
            '_DFF_SCRIPT_ID'         : self.script_id,
            '_DFF_FUNC_ID'           : self.func_id,
            '_DFF_FUNC_NAME'         : self.func_name,
            '_DFF_FUNC_CHAIN'        : self.call_chain,
            '_DFF_ORIGIN'            : self.origin,
            '_DFF_ORIGIN_ID'         : self.origin_id,
            '_DFF_TRIGGER_TIME'      : int(self.trigger_time),
            '_DFF_TRIGGER_TIME_MS'   : int(self.trigger_time_ms),
            '_DFF_START_TIME'        : int(self.start_time),
            '_DFF_START_TIME_MS'     : int(self.start_time_ms),
            '_DFF_ETA'               : self.eta,
            '_DFF_DELAY'             : self.delay,
            '_DFF_CRON_EXPR'         : self.kwargs.get('cronExpr'),
            '_DFF_CRON_JOB_DELAY'    : self.kwargs.get('cronJobDelay') or 0,
            '_DFF_CRON_JOB_EXEC_MODE': self.kwargs.get('cronJobExecMode'),
            '_DFF_QUEUE'             : self.queue,
            '_DFF_HTTP_REQUEST'      : self.http_request,

            # [Compatibility] `_DFF_CRONTAB`, `_DFF_CRONTAB_DELAY`, `_DFF_CRONTAB_EXEC_MODE`
            #         were changed to `_DFF_CRON_EXPR`, `_DFF_CRON_JOB_DELAY`, `_DFF_CRON_JOB_EXEC_MODE`
            '_DFF_CRONTAB'          : self.kwargs.get('cronExpr'),
            '_DFF_CRONTAB_DELAY'    : self.kwargs.get('cronJobDelay') or 0,
            '_DFF_CRONTAB_EXEC_MODE': self.kwargs.get('cronJobExecMode'),
        }

        # Add DataFlux Func builtin method / obj
        __connector_helper    = FuncConnectorHelper(self)
        __env_variable_helper = FuncEnvVariableHelper(self)
        __store_helper        = FuncStoreHelper(self, default_scope=script_name)
        __cache_helper        = FuncCacheHelper(self, default_scope=script_name)
        __config_helper       = FuncConfigHelper(self)
        __thread_helper       = FuncThreadHelper(self)
        __sync_api_helper     = FuncSyncAPIHelper(self)
        __async_api_helper    = FuncAsyncAPIHelper(self)
        __cron_job_helper     = FuncCronJobHelper(self)

        def __print(*args, **kwargs):
            return self._print(safe_scope, *args, **kwargs)

        def __print_var(*args, **kwargs):
            for v in args:
                __print(f"[VAR] type=`{type(v)}`, value=`{str(v)}`, obj_size=`{toolkit.get_obj_size(v)}`")

            for name, v in kwargs.items():
                __print(f"[VAR] {name}: type=`{type(v)}`, value=`{str(v)}`, obj_size=`{toolkit.get_obj_size(v)}`")

        def __eval(*args, **kwargs):
            return eval(*args, **kwargs)

        def __exec(*args, **kwargs):
            return exec(*args, **kwargs)

        def __export_as_api(title=None, **extra_config):
            return self._export_as_api(safe_scope, title, **extra_config)

        def __call_func(func_id, kwargs=None, queue=None):
            return self._call_func(safe_scope, func_id, kwargs, queue)

        def __call_blueprint(blueprint_id, kwargs=None, queue=None):
            return self._call_func(safe_scope, f'_bp_{blueprint_id}__main.run', kwargs, queue)

        def __custom_import(name, globals=None, locals=None, fromlist=None, level=0):
            return self._custom_import(name, globals, locals, fromlist, level, safe_scope)

        inject_objs = {
            'LOG': __print,     # Print log
            'VAR': __print_var, # print variable

            'EVAL': __eval, # Eval Python expression
            'EXEC': __exec, # Exec Python code

            'API'   : __export_as_api,       # Export as API
            'CONN'  : __connector_helper,    # Connector helper
            'ENV'   : __env_variable_helper, # Env Variable helper
            'CTX'   : self.__context_helper, # Context helper
            'STORE' : __store_helper,        # Func Store helper
            'CACHE' : __cache_helper,        # Func Cache helper
            'CONFIG': __config_helper,       # Config helper

            'SQL' : format_sql,        # Format SQL
            'RSRC': get_resource_path, # Get resource folder path
            'SIGN': get_sign,          # Sign data

            'RESP'           : FuncResponse,          # Func response
            'RESP_FILE'      : FuncResponseFile,      # Func response for file
            'RESP_LARGE_DATA': FuncResponseLargeData, # Func response for large data
            'REDIRECT'       : FuncRedirect,          # Func response for redirect

            'FUNC'     : __call_func,      # Call Func (new Task)
            'BLUEPRINT': __call_blueprint, # Call Blueprint (new Task)
            'THREAD'   : __thread_helper,  # Thread helper (in same Task)

            'TASK'        : self,          # Current Task
            'SYS_DB'      : self.raw_db,   # DataFlux Func system DB
            'SYS_CACHE_DB': self.cache_db, # DataFlux Func system Cache DB

            'SYNC_API' : __sync_api_helper,  # Sync API helper
            'ASYNC_API': __async_api_helper, # Async API helper
            'CRON_JOB' : __cron_job_helper,  # Cron Job helper

            # Direct-use connector
            'GUANCE_OPENAPI': GuanceOpenAPI,
            'DATAKIT'       : DataKit,
            'DATAWAY'       : DataWay,

            # Toolkit
            'TOOLKIT': ToolkitWrap,

            # Extra data for Guance, TrueWatch data uploading
            'EXTRA_GUANCE_DATA': self.extra_guance_data,

            # [Compatibility] Data Source, Auth Link, Batch, Crontab Config
            #         were changed to Connector, Sync API, Async API, Cron Job
            'SRC'           : __connector_helper, # Data Source helper
            'AUTH_LINK'     : __sync_api_helper,  # Auth Link helper
            'BATCH'         : __async_api_helper, # Batch helper
            'CRONTAB_CONFIG': __cron_job_helper,  # Crontab Config helper
        }
        safe_scope['DFF'] = DFFWraper(inject_objs=inject_objs)

        # Inject builtin obj / functions
        safe_scope['__builtins__'] = {}
        for name in dir(six.moves.builtins):
            # Skip:
            #   Builtin import function, use `custom_import` instead
            #   BaseException, avoid exception raised from user code cannot be catched
            if name in ('import', 'BaseException'):
                continue

            safe_scope['__builtins__'][name] = six.moves.builtins.__getattribute__(name)

        # Replace builtin obj / functions
        safe_scope['__builtins__']['__import__'] = __custom_import
        safe_scope['__builtins__']['print']      = __print
        safe_scope['__builtins__']['print_var']  = __print_var

        # self.logger.debug('[SAFE SCOPE] Created')

        return safe_scope

    def safe_exec(self, script_code_obj, globals=None, locals=None):
        safe_scope = globals or self.create_safe_scope()
        exec(script_code_obj, safe_scope)

        # self.logger.debug('[SAFE EXEC] Finished')

        return safe_scope

    def apply(self, use_code_draft=False):
        self.logger.debug(f"[APPLY SCRIPT] `{self.script_id}`{ ' (DRAFT)' if use_code_draft else '' }")

        # Prepare Script
        self.script = self.load_script(self.script_id, draft=use_code_draft)
        if not self.script:
            e = EntityNotFound(f'Script not found: `{self.script_id}`')
            raise e

        # Run Script
        debug = use_code_draft
        _safe_scope = self.create_safe_scope(self.script_id, debug=debug)
        self.script_scope = self.safe_exec(self.script['codeObj'], globals=_safe_scope)

        # Run Func in Script
        func_return = None
        if self.func_name:
            entry_func = self.script_scope.get(self.func_name)
            if not entry_func:
                e = EntityNotFound(f'Function not found: `{self.script_id}.{self.func_name}`')
                raise e

            # Call Func
            self.logger.info(f'[CALL ENTRY FUNC] `{self.func_id}`')
            func_return = entry_func(**self.func_call_kwargs)

            if not isinstance(func_return, BaseFuncResponse):
                func_return = FuncResponse(func_return)

            if isinstance(func_return.data, Exception):
                raise func_return.data

        # self.logger.debug(f'[FUNC RETURN] `{func_return}`')
        return func_return

    def get_traceback(self, only_in_script=True):
        try:
            exc_type, exc_obj, tb = sys.exc_info()

            header         = 'Traceback (most recent call last *in User Script*):'
            exception_info = ''.join(traceback.format_exception_only(exc_type, exc_obj)).strip()
            stack = []

            # Collect traceback
            while tb is not None:
                frame  = tb.tb_frame
                line_number = tb.tb_lineno

                filename = frame.f_code.co_filename
                funcname = frame.f_code.co_name

                is_in_script = not filename.endswith('.py') and '__' in filename

                line_code = ''
                if is_in_script:
                    # Get code line from user Script if in user Script
                    script_code = (self.load_script(filename) or {}).get('code')
                    script_code_lines = []

                    if script_code:
                        script_code_lines = script_code.splitlines()

                    if script_code_lines and len(script_code_lines) >= line_number:
                        line_code = script_code_lines[line_number - 1]

                else:
                    # Get code line in general way if not in user Script
                    linecache.checkcache(filename)
                    line_code = linecache.getline(filename, line_number, frame.f_globals)

                if line_code:
                    line_code = line_code.strip()

                compacted_filename = filename.replace(os.getcwd(), f'<{CONFIG["APP_NAME"]}>')
                formatted_location = f'File "{compacted_filename}", line {line_number}, in {funcname}'

                stack_item = {
                    'filename'         : filename,
                    'funcname'         : funcname,
                    'lineNumber'       : line_number,
                    'lineCode'         : line_code,
                    'formattedLocation': formatted_location,
                    'isInScript'       : is_in_script,
                }
                stack.append(stack_item)

                tb = tb.tb_next

            # Format traceback
            lines = []
            lines.append(header)

            for s in stack:
                if only_in_script and not s['isInScript']:
                    continue

                lines.append('  ' + s['formattedLocation'])
                lines.append('    ' + s['lineCode'].strip())

            lines.append(exception_info)

            return '\n'.join(lines)

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

        finally:
            exc_type = exc_obj = tb = None

    def clean_up(self):
        global FUNC_THREAD_POOL
        global FUNC_THREAD_POOL_SIZE
        global FUNC_THREAD_RESULT_MAP

        if FUNC_THREAD_POOL:
            FUNC_THREAD_POOL.shutdown(wait=True)
            self.logger.debug(f"[THREAD POOL] Pool Shutdown")

        FUNC_THREAD_POOL       = None
        FUNC_THREAD_POOL_SIZE  = None
        FUNC_THREAD_RESULT_MAP = {}

    def buff_task_record(self, *args, **kwargs):
        # Task Record for Func implemented in sub class
        pass
