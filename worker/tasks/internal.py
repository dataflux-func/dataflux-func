# -*- coding: utf-8 -*-

'''
Internal Tasks
Includes various cleanup tasks, various data sync tasks, connector checking/debugging tasks, and so on.
'''

# Built-in Modules
import os
import time
import traceback
import pprint
import textwrap
import zipfile

# 3rd-party Modules
import arrow
from croniter import croniter
from datasize import DataSize
import parse_args

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.utils.extra_helpers import format_sql
from worker.tasks import BaseTask
from worker.tasks.func import CONNECTOR_HELPER_CLASS_MAP, decipher_connector_config

CONFIG     = yaml_resources.get('CONFIG')
IMAGE_INFO = yaml_resources.get('IMAGE_INFO')

class BaseInternalTask(BaseTask):
    def debug_call(self, func, *args, **kwargs):
        try:
            return func(*args, **kwargs)

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

            raise

class SystemMetric(BaseInternalTask):
    '''
    System Metric
    '''
    name = 'Internal.SystemMetric'

    def collect_service_info(self):
        guance_data = []

        # Service info
        cache_key = toolkit.get_monitor_cache_key('heartbeat', 'serviceInfo')
        service_info_map = self.cache_db.hgetall_expires(cache_key, CONFIG['_MONITOR_REPORT_EXPIRES'])

        for service_info_key, service_info in service_info_map.items():
            service = toolkit.parse_colon_tags(service_info_key)

            guance_data.append({
                'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_SERVICE_INFO'],
                'tags': {
                    'name'    : service_info.get('name'),
                    'version' : service_info.get('version'),
                    'edition' : service_info.get('edition'),
                    'hostname': service.get('hostname'),
                    'pid'     : service.get('pid'),
                },
                'fields': {
                    'uptime': service_info.get('uptime') or 0,
                },
                'timestamp': self.trigger_time,
            })

        if self.guance_data_upload_url and guance_data:
            self.upload_guance_data('logging', guance_data)

    def collect_metric_queue(self):
        guance_data = []

        for queue in list(range(CONFIG['_WORKER_QUEUE_COUNT'])):
            # Delayed queue
            delay_queue        = toolkit.get_delay_queue(queue)
            delay_queue_length = int(self.cache_db.run('zcard', delay_queue) or 0)

            cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'delayQueueLength', 'queue', queue])
            self.cache_db.ts_add(cache_key, delay_queue_length, timestamp=self.trigger_time)

            # Worker queue
            worker_queue        = toolkit.get_worker_queue(queue)
            worker_queue_length = int(self.cache_db.llen(worker_queue) or 0)

            cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'workerQueueLength', 'queue', queue])
            self.cache_db.ts_add(cache_key, worker_queue_length, timestamp=self.trigger_time)

            # Guance, TrueWatch
            if self.guance_data_upload_url:
                guance_data.append({
                    'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_DELAY_QUEUE'],
                    'tags': {
                        'queue'    : str(queue),
                        'redis_key': delay_queue,
                    },
                    'fields': {
                        'length' : delay_queue_length,
                    },
                    'timestamp': self.trigger_time,
                })

                guance_data.append({
                    'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_WORKER_QUEUE'],
                    'tags': {
                        'queue'    : str(queue),
                        'redis_key': worker_queue,
                    },
                    'fields': {
                        'length' : worker_queue_length,
                    },
                    'timestamp': self.trigger_time,
                })

        if self.guance_data_upload_url and guance_data:
            self.upload_guance_data('metric', guance_data)

    def collect_metric_cache_db(self):
        cache_res = self.cache_db.info()
        db_info   = cache_res.get(f"db{CONFIG['REDIS_DATABASE'] or 0}") or {}

        key_count   = db_info.get('keys')          or 0
        used_memory = cache_res.get('used_memory') or 0

        # Built-in monitor
        cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'cacheDBKeyUsed'])
        self.cache_db.ts_add(cache_key, key_count, timestamp=self.trigger_time)

        cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'cacheDBMemoryUsed'])
        self.cache_db.ts_add(cache_key, used_memory, timestamp=self.trigger_time)

        # Guance, TrueWatch
        if self.guance_data_upload_url:
            guance_data = {
                'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_CACHE_DB'],
                'tags': {
                    'target': f"{CONFIG['REDIS_HOST']}:{CONFIG['REDIS_PORT']}/{CONFIG['REDIS_DATABASE']}",
                },
                'fields': {
                    'keys'       : key_count,
                    'used_memory': used_memory,
                },
                'timestamp': self.trigger_time,
            }

            self.upload_guance_data('metric', guance_data)

    def collect_metric_db(self):
        guance_data = []

        table_status = self.db.table_status()
        for t in table_status.values():
            # Built-in monitor
            cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'dbTableDataSize', 'table', t['name']])
            self.cache_db.ts_add(cache_key, t['dataSize'], timestamp=self.trigger_time)

            cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'dbTableIndexSize', 'table', t['name']])
            self.cache_db.ts_add(cache_key, t['indexSize'], timestamp=self.trigger_time)

            cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'dbTableTotalSize', 'table', t['name']])
            self.cache_db.ts_add(cache_key, t['totalSize'], timestamp=self.trigger_time)

            # Guance, TrueWatch
            if self.guance_data_upload_url:
                guance_data.append({
                    'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_DB_TABLE'],
                    'tags': {
                        'name': t['name'],
                    },
                    'fields': {
                        'rows'        : t.get('rows')       or 0,
                        'data_size'   : t.get('dataSize')   or 0,
                        'index_size'  : t.get('indexSize')  or 0,
                        'total_size'  : t.get('totalSize')  or 0,
                        'avg_row_size': t.get('avgRowSize') or 0,
                    },
                    'timestamp': self.trigger_time,
                })

        if self.guance_data_upload_url and guance_data:
            self.upload_guance_data('metric', guance_data)

    def collect_entity_count(self):
        # Only for System Setting: GUANCE_DATA_UPLOAD_ENABLED=true
        if not self.guance_data_upload_url:
            return

        guance_data = []

        entity_map = {
            'scriptSet'       : 'biz_main_script_set',
            'script'          : 'biz_main_script',
            'func'            : 'biz_main_func',
            'connector'       : 'biz_main_connector',
            'envVariable'     : 'biz_main_env_variable',
            'syncAPI'         : 'biz_main_sync_api',
            'asyncAPI'        : 'biz_main_async_api',
            'cronJob'         : 'biz_main_cron_job',
            'fileService'     : 'biz_main_file_service',
            'user'            : 'wat_main_user',
            'syncAPI_enabled' : 'biz_main_sync_api',
            'asyncAPI_enabled': 'biz_main_async_api',
            'cronJob_enabled' : 'biz_main_cron_job',
        }

        entity_count_map = {}
        for entity_name, table in entity_map.items():
            sql = self.db.create_sql_builder()
            sql.SELECT([
                sql.VALUE(f'{entity_name}_count', 'name'),
                sql.FUNC('COUNT', sql.FIELD('*'), 'value'),
            ])
            sql.FROM(table)

            if entity_name.endswith('_enabled'):
                sql.WHERE({
                    'isDisabled': False,
                })

            db_res = self.db.query(sql)
            for d in db_res:
                value = d['value']
                entity, field = d['name'].split('_', 1)

                if entity not in entity_count_map:
                    entity_count_map[entity] = {}

                entity_count_map[entity][field] = value

        # Guance, TrueWatch
        for entity, fields in entity_count_map.items():
            guance_data = {
                'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_ENTITY'],
                'tags': {
                    'entity': entity,
                },
                'fields': fields,
                'timestamp': self.trigger_time,
            }
            self.upload_guance_data('metric', guance_data)

    def collect_cron_job_trigger_count(self):
        # Only for System Setting: GUANCE_DATA_UPLOAD_ENABLED=true
        if not self.guance_data_upload_url:
            return

        # Get all Cron Jobs
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'cron.id',
            'cron.cronExpr',
            'func.extraConfigJSON',
        ])
        sql.FROM('biz_main_cron_job', 'cron')
        sql.JOIN('biz_main_func', 'func', {
            'cron.funcId': 'func.id',
        })
        sql.WHERE({
            'cron.isDisabled': False,
        })

        cron_jobs = self.db.query(sql)
        if not cron_jobs:
            return

        # Cron Job dynamic cron expression
        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        dynamic_cron_expr_map = self.cache_db.hgetall(cache_key)

        # Cron Job pause flag
        cache_key = toolkit.get_global_cache_key('cronJob', 'pause')
        pause_expire_time_map = self.cache_db.hgetall(cache_key)

        now = int(time.time())

        trigger_count_map = {}
        total_trigger_count = 0

        for c in cron_jobs:
            # Check Cron Job pause flag
            c['isPaused'] = False

            pause_expire_time = pause_expire_time_map.get(c['id'])
            if pause_expire_time:
                pause_expire_time = int(pause_expire_time)

                if pause_expire_time and pause_expire_time > now:
                    continue

            # Add Cron Job dynamic cron expression
            c['dynamicCronExpr'] = None

            dynamic_cron_expr = dynamic_cron_expr_map.get(c['id'])
            if dynamic_cron_expr:
                dynamic_cron_expr = toolkit.json_loads(dynamic_cron_expr)

                if dynamic_cron_expr['expireTime'] and dynamic_cron_expr['expireTime'] > now:
                    c['dynamicCronExpr'] = dynamic_cron_expr['value']

            # Compute trigger time in next 24 hours
            c['extraConfigJSON'] = c.get('extraConfigJSON') or {}
            cron_expr = c.get('dynamicCronExpr') or c['extraConfigJSON'].get('fixedCronExpr') or c['cronExpr']
            if not cron_expr:
                continue

            # No repeat computing for the same expression
            if cron_expr in trigger_count_map:
                total_trigger_count += trigger_count_map[cron_expr]
            else:
                start_time = now
                end_time   = start_time + 24 * 3600

                cron = croniter(cron_expr, start_time=start_time)
                curr_time = cron.next()

                trigger_count = 0
                while curr_time < end_time:
                    curr_time = cron.next()
                    trigger_count += 1

                total_trigger_count += trigger_count

                trigger_count_map[cron_expr] = trigger_count

        trigger_count_per_day    = float(total_trigger_count)
        trigger_count_per_hour   = float(round(total_trigger_count / 24, 1))
        trigger_count_per_minute = float(round(total_trigger_count / (24 * 60), 1))
        trigger_count_per_second = float(round(total_trigger_count / (24 * 3600), 1))

        # Guance, TrueWatch
        guance_data = {
            'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_CRON_JOB'],
            'tags': {
                'bizMetric': 'cronJobTriggerCount',
            },
            'fields': {
                'trigger_count_per_day'   : trigger_count_per_day,
                'trigger_count_per_hour'  : trigger_count_per_hour,
                'trigger_count_per_minute': trigger_count_per_minute,
                'trigger_count_per_second': trigger_count_per_second,
            },
            'timestamp': self.trigger_time,
        }
        self.upload_guance_data('metric', guance_data)

    def run(self, **kwargs):
        # Lock
        self.lock()

        # Collect Service info
        self.debug_call(self.collect_service_info)

        # Collect metric for queue
        self.debug_call(self.collect_metric_queue)

        # Collect metric for Cache DB
        self.debug_call(self.collect_metric_cache_db)

        # Collect metric for DB
        self.debug_call(self.collect_metric_db)

        # Collect Entity count
        self.debug_call(self.collect_entity_count)

        # Collect Cron Job trigger count
        self.debug_call(self.collect_cron_job_trigger_count)

class FlushDataBuffer(BaseInternalTask):
    '''
    Flush Data Buffer
    '''
    name = 'Internal.FlushDataBuffer'

    default_timeout = CONFIG['_TASK_FLUSH_DATA_TIMEOUT']

    TASK_RECORD_LIMIT_BY_ORIGIN_MAP = {
        'direct'     : CONFIG['_TASK_RECORD_FUNC_LIMIT_DIRECT'],
        'integration': CONFIG['_TASK_RECORD_FUNC_LIMIT_INTEGRATION'],
        'connector'  : CONFIG['_TASK_RECORD_FUNC_LIMIT_CONNECTOR'],
    }

    def _flush_data_buffer(self, cache_key):
        data = []
        for i in range(CONFIG['_TASK_FLUSH_DATA_BUFFER_BULK_COUNT']):
            cache_res = self.cache_db.pop(cache_key)
            if not cache_res:
                break

            data.append(cache_res)

        data = list(map(lambda x: toolkit.json_loads(x), data))
        return data

    def flush_task_record(self):
        cache_key = toolkit.get_cache_key('dataBuffer', 'taskRecord')

        # Collect data
        cache_res = self._flush_data_buffer(cache_key)
        if not cache_res:
            return 0

        # Write to local DB
        for d in cache_res:
            sql = self.db.create_sql_builder()
            sql.INSERT_INTO('biz_main_task_record')
            sql.VALUES(d)

            self.db.query(sql)

        # Roll DB data
        sql = self.db.create_sql_builder()
        sql.SELECT('seq', 'expiredMaxSeq')
        sql.FROM('biz_main_task_record')
        sql.ORDER_BY('seq', 'DESC')
        sql.LIMIT(1, CONFIG['_TASK_RECORD_LIMIT_DEFAULT'])

        db_res = self.db.query(sql)

        if db_res:
            expired_max_seq = db_res[0]['expiredMaxSeq']

            sql = self.db.create_sql_builder()
            sql.DELETE_FROM('biz_main_task_record')
            sql.WHERE({
                'LEFT': 'seq', 'OP': '<=', 'RIGHT': expired_max_seq,
            })

            self.db.query(sql)

        return len(cache_res)

    def flush_task_record_func(self):
        cache_key = toolkit.get_cache_key('dataBuffer', 'taskRecordFunc')

        # Clear automatically if not enabled
        if not self.is_local_func_task_record_enabled:
            self.cache_db.delete(cache_key)

            self.db.clear_table('biz_main_task_record_func')
            return 0

        # Collect data
        cache_res = self._flush_data_buffer(cache_key)
        if not cache_res:
            return 0

        # Write to local DB
        origin_limit_map = {}
        for d in cache_res:
            origin    = d.get('origin')
            origin_id = d.get('originId')

            # Get rolling limit
            limit = d.pop('_taskRecordLimit', None)

            if limit is None:
                limit = self.TASK_RECORD_LIMIT_BY_ORIGIN_MAP.get(origin)

            if limit is None:
                limit = 0

            origin_limit_map[origin_id] = limit

            # Write to DB
            if limit > 0:
                sql = self.db.create_sql_builder()
                sql.INSERT_INTO('biz_main_task_record_func')
                sql.VALUES(d)

                self.db.query(sql)

        # Roll DB data
        for origin_id, limit in origin_limit_map.items():
            sql = self.db.create_sql_builder()
            sql.SELECT('seq', 'expiredMaxSeq')
            sql.FROM('biz_main_task_record_func')
            sql.WHERE({
                'originId': origin_id,
            })
            sql.ORDER_BY('seq', 'DESC')
            sql.LIMIT(1, limit)

            db_res = self.db.query(sql)

            if db_res:
                expired_max_seq = db_res[0]['expiredMaxSeq']

                sql = self.db.create_sql_builder()
                sql.DELETE_FROM('biz_main_task_record_func')
                sql.WHERE([
                    { 'LEFT': 'originId', 'OP': '=',  'RIGHT': origin_id },
                    { 'LEFT': 'seq',      'OP': '<=', 'RIGHT': expired_max_seq },
                ])

                self.db.query(sql)

        return len(cache_res)

    def flush_task_record_guance(self):
        cache_key = toolkit.get_cache_key('dataBuffer', 'taskRecordGuance')

        # Clear automatically if not enabled
        if not self.guance_data_upload_url:
            self.cache_db.delete(cache_key)
            return 0

        # Collect data
        cache_res = self._flush_data_buffer(cache_key)
        if not cache_res:
            return 0

        self.upload_guance_data('logging', cache_res)

        return len(cache_res)

    def flush_func_call_count(self):
        cache_key = toolkit.get_cache_key('dataBuffer', 'funcCallCount')

        # Collect data
        cache_res = self._flush_data_buffer(cache_key)
        if not cache_res:
            return 0

        # Count map
        count_map   = {}
        guance_data = []
        for d in cache_res:
            func_id   = d['funcId']
            timestamp = d['timestamp']

            # Align timestamp by minute (reduce Redis TS storage amount)
            aligned_timestamp = int(int(timestamp) / 60) * 60

            pk = f'{func_id}~{aligned_timestamp}'
            if pk not in count_map:
                count_map[pk] = {
                    'funcId'   : func_id,
                    'count'    : 0,
                    'timestamp': aligned_timestamp,
                }

            count_map[pk]['count'] += 1

            # Gen Guance, TrueWatch data
            if self.guance_data_upload_url:
                guance_data.append({
                    'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_FUNC_CALL'],
                    'tags': {
                        'script_set_id' : d['scriptSetId'],
                        'script_id'     : d['scriptId'],
                        'func_id'       : func_id,
                        'origin'        : d['origin'],
                        'origin_id'     : d['originId'],
                        'queue'         : d['queue'],
                        'task_status'   : d['status'],

                        'script_set_title': d.get('scriptSetTitle') or 'UNTITLED',
                        'script_title'    : d.get('scriptTitle')    or 'UNTITLED',
                        'func_title'      : d.get('funcTitle')      or 'UNTITLED',
                    },
                    'fields': {
                        'wait_cost' : d['waitCost'],
                        'run_cost'  : d['runCost'],
                        'total_cost': d['totalCost'],
                    },
                    'timestamp': d['timestamp'],
                })

        # Write to built-in Redis TS storage
        if count_map:
            for pk, c in count_map.items():
                cache_key = toolkit.get_monitor_cache_key('monitor', 'recentCalledFuncIds')
                self.cache_db.hset(cache_key, c['funcId'], toolkit.json_dumps({ 'ts': c['timestamp'] }))

                cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', ['metric', 'funcCallCount', 'funcId', c['funcId']])
                self.cache_db.ts_add(cache_key, c['count'], timestamp=c['timestamp'], mode='addUp')

        # Write to Guance, TrueWatch
        if self.guance_data_upload_url and guance_data:
            self.upload_guance_data('metric', guance_data)

        return len(cache_res)

    def run(self, **kwargs):
        # Lock
        self.lock()

        flush_finish_map = {
            'flush_task_record'       : False,
            'flush_task_record_func'  : False,
            'flush_task_record_guance': False,
            'flush_func_call_count'   : False,
        }

        for i in range(CONFIG['_TASK_FLUSH_DATA_BUFFER_TIMES']):
            finish_set = []

            for flush_func_name, is_finished in flush_finish_map.items():
                if is_finished:
                    continue

                flush_func = getattr(self, flush_func_name)
                flushed_count = self.debug_call(flush_func) or 0
                if flushed_count < CONFIG['_TASK_FLUSH_DATA_BUFFER_BULK_COUNT']:
                    flush_finish_map[flush_func_name] = True

            if all(flush_finish_map.values()):
                break

class AutoClean(BaseInternalTask):
    name = 'Internal.AutoClean'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Flag for is deprecated data already cleared
        self._is_deprecated_data_cleared = False

        # Get all tables
        self._all_tables = set(self.db.tables())

    def _delete_by_seq(self, table, seq, include=True):
        # Skip table that not exist
        if table not in self._all_tables:
            return

        if seq <= 0:
            return

        if not include:
            seq = seq - 1

        sql = self.db.create_sql_builder()
        sql.DELETE_FROM(table)
        sql.WHERE({
            'LEFT': 'seq', 'OP': '<=', 'RIGHT': seq,
        })

        self.db.query(sql)

    def clear_table_by_limit(self, table, limit):
        # Skip table that not exist
        if table not in self._all_tables:
            return

        sql = self.db.create_sql_builder()
        sql.SELECT([
            sql.FUNC('MAX', sql.FIELD('seq'), 'maxSeq'),
        ])
        sql.FROM(table)

        db_res = self.db.query(sql)
        if not db_res:
            return

        max_seq = db_res[0]['maxSeq'] or 0
        if not max_seq:
            return

        delete_from_seq = max(max_seq - limit, 0)
        self._delete_by_seq(table, delete_from_seq, include=True)

    def clear_table_by_expires(self, table, expires):
        # Skip table that not exist
        if table not in self._all_tables:
            return

        delete_from_seq = 0

        # Start SEQ
        sql = self.db.create_sql_builder()
        sql.SELECT([
            sql.FUNC('MIN', sql.FIELD('seq'), 'seq'),
        ])
        sql.FROM(table)

        res = self.db.query(sql)
        if not res:
            return

        start_seq = res[0]['seq'] or 0
        if not start_seq:
            return

        # End SEQ
        sql = self.db.create_sql_builder()
        sql.SELECT([
            sql.FUNC('MAX', sql.FIELD('seq'), 'seq'),
        ])
        sql.FROM(table)

        res = self.db.query(sql)
        if not res:
            return

        end_seq = res[0]['seq'] or 0
        if not end_seq:
            return

        # Query by group
        MAX_TRY = 30
        GROUPS  = 20

        check_seq_list = None
        for i in range(MAX_TRY):
            # Group sampling
            next_check_seq_list = list(range(start_seq, end_seq, int((end_seq - start_seq) / GROUPS) or 1))
            next_check_seq_list.extend([start_seq, end_seq])     # Include endpoints
            next_check_seq_list = list(set(next_check_seq_list)) # No duplication
            next_check_seq_list = sorted(next_check_seq_list)    # Sort

            if check_seq_list == next_check_seq_list:
                delete_from_seq = check_seq_list[0]
                break

            check_seq_list = next_check_seq_list

            sql = self.db.create_sql_builder()
            sql.SELECT([
                'seq',
                'createTime',
            ])
            sql.FROM(table)
            sql.WHERE({
                'seq': check_seq_list
            })
            sql.ORDER_BY('seq', 'ASC')

            res = self.db.query(sql)
            for d in res:
                elapse = toolkit.get_timestamp() - d['createTime']

                if elapse > expires:
                    if d['seq'] > start_seq:
                        start_seq = d['seq']
                else:
                    if d['seq'] < end_seq:
                        end_seq = d['seq']

        if not delete_from_seq and check_seq_list:
            delete_from_seq = check_seq_list[0]

        if delete_from_seq:
            self._delete_by_seq(table, delete_from_seq, include=False)

    def clear_table(self, table):
        # Skip table that not exist
        if table not in self._all_tables:
            return

        self.db.clear_table(table)

    def clear_cache_key(self, cache_key):
        self.cache_db.delete(cache_key)

    def clear_cache_key_pattern(self, pattern):
        self.cache_db.delete_pattern(pattern)

    def clear_temp_file(self, folder):
        limit_timestamp = f"{arrow.get().format('YYYYMMDDHHmmss')}_"

        temp_dir = os.path.join(CONFIG['RESOURCE_ROOT_PATH'], folder)
        if not os.path.exists(temp_dir):
            return

        for folder_path, _, file_names in os.walk(temp_dir):
            for file_name in file_names:
                if file_name < limit_timestamp:
                    file_path = os.path.join(folder_path, file_name)
                    os.remove(file_path)

    def clear_deprecated_data(self):
        if self._is_deprecated_data_cleared is True:
            return

        for table in CONFIG['_DEPRECATED_TABLE_LIST']:
            self.clear_table(table)

        for cache in CONFIG['_DEPRECATED_CACHE_KEY_LIST']:
            self.clear_cache_key(toolkit.get_cache_key(**cache))

        for cache in CONFIG['_DEPRECATED_CACHE_KEY_PATTERN_LIST']:
            self.clear_cache_key_pattern(toolkit.get_cache_key(**cache))

        self._is_deprecated_data_cleared = True

    def clear_expired_func_store(self):
        sql = self.db.create_sql_builder()
        sql.DELETE_FROM('biz_main_func_store')
        sql.WHERE({
            'LEFT': 'expireAt', 'OP': '<', 'RIGHT': toolkit.get_timestamp()
        })

        self.db.query(sql)

    def clear_expired_dynamic_cron_expr(self):
        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        cache_res = self.cache_db.hgetall(cache_key)
        if not cache_res:
            return

        cron_job_ids_to_delete = []
        for cron_job_id, temp_config in cache_res.items():
            temp_config = toolkit.json_loads(temp_config)
            if temp_config['expireTime'] and temp_config['expireTime'] < self.trigger_time:
                cron_job_ids_to_delete.append(cron_job_id)

        if cron_job_ids_to_delete:
            self.cache_db.hdel(cache_key, cron_job_ids_to_delete)

    def clear_expired_hset_cache(self):
        options = [
            # Expired X-Auth-Token
            ( toolkit.get_server_cache_key('token', 'xAuthToken'), CONFIG['_WEB_AUTH_EXPIRES']),

            # Worker / Process Count
            ( toolkit.get_monitor_cache_key('heartbeat', 'workerOnQueue'),       CONFIG['_MONITOR_REPORT_EXPIRES'] ),
            ( toolkit.get_monitor_cache_key('heartbeat', 'workerCountOnQueue'),  CONFIG['_MONITOR_REPORT_EXPIRES'] ),
            ( toolkit.get_monitor_cache_key('heartbeat', 'processCountOnQueue'), CONFIG['_MONITOR_REPORT_EXPIRES'] ),

            # Service (pod) list
            ( toolkit.get_monitor_cache_key('heartbeat', 'serviceInfo'), CONFIG['_MONITOR_REPORT_EXPIRES'] ),

            # Recent called Func ID list
            ( toolkit.get_monitor_cache_key('monitor', 'recentCalledFuncIds'), CONFIG['REDIS_TS_MAX_AGE'] ),
        ]

        for opt in options:
            cache_key, expires = opt
            cache_res = self.cache_db.hgetall(cache_key)

            expired_fields = []
            for field, cache_data in cache_res.items():
                cache_data = toolkit.json_loads(cache_data)
                ts = cache_data.get('ts') or cache_data.get('timestamp')
                if not ts or ts + expires < self.trigger_time:
                    expired_fields.append(field)

            if expired_fields:
                self.cache_db.hdel(cache_key, expired_fields)

    def clear_outdated_recent_triggered_data(self):
        origin_table_map = {
            'syncAPI' : 'biz_main_sync_api',
            'asyncAPI': 'biz_main_async_api',
            'cronJob' : 'biz_main_cron_job',
        }
        for origin, table in origin_table_map.items():
            cache_key = toolkit.get_global_cache_key('cache', 'recentTaskTriggered', [ 'origin', origin ])

            # Get all IDs
            sql = self.db.create_sql_builder()
            sql.SELECT('id')
            sql.FROM(table)

            db_res = self.db.query(sql)

            if not db_res:
                # Delete all
                self.cache_db.delete(cache_key)

            else:
                # Delete not existed
                all_ids = { d['id'] for d in db_res}
                cached_ids = set(self.cache_db.hkeys(cache_key))
                outdated_ids = cached_ids - all_ids

                if outdated_ids:
                    self.cache_db.hdel(cache_key, outdated_ids)

    def clear_outdated_task_record_func(self):
        # Collect current Origin IDs
        current_origin_ids = set()

        # Origin ID of Call directly
        current_origin_ids.add('direct')

        # Origin ID of Biz Entity
        entity_tables = [
            'biz_main_connector',
            'biz_main_sync_api',
            'biz_main_async_api',
            'biz_main_cron_job',
        ]
        for table in entity_tables:
            sql = self.db.create_sql_builder()
            sql.SELECT('id')
            sql.FROM(table)

            db_res = self.db.query(sql)
            for d in db_res:
                current_origin_ids.add(d['id'])

        # Origin ID of Integrated Func
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'id',
            'extraConfigJSON',
        ])
        sql.FROM('biz_main_func')

        db_res = self.db.query(sql)
        for d in db_res:
            # Skip Func without extra config
            if not d.get('extraConfigJSON'):
                continue

            # Skip Func without integration config
            integration_config = None
            try:
                integration_config = d['extraConfigJSON']['integrationConfig']
            except KeyError as e:
                continue

            if not integration_config:
                continue

            # Func as Cron Job
            if integration_config.get('cronExpr'):
                # Use Func ID as Cron Job ID
                current_origin_ids.add(f"autoRun.cronJob-{d['id']}")

            # Func triggered on System Launched
            if integration_config.get('integrationConfig'):
                current_origin_ids.add(f"autoRun.onSystemLaunch-{d['id']}")

            # Func triggered on Script Published
            if integration_config.get('onScriptPublish'):
                current_origin_ids.add(f"autoRun.onScriptPublish-{d['id']}")

        # Collect Origin ID in Task Records
        sql = self.db.create_sql_builder()
        sql.SELECT_DISTINCT('originId')
        sql.FROM('biz_main_task_record_func')

        db_res = self.db.query(sql)
        task_info_origin_ids = set()
        for d in db_res:
            task_info_origin_ids.add(d['originId'])

        # Outdated Origin ID
        outdated_origin_ids = task_info_origin_ids - current_origin_ids
        if outdated_origin_ids:
            sql = self.db.create_sql_builder()
            sql.DELETE_FROM('biz_main_task_record_func')
            sql.WHERE({
                'originId': outdated_origin_ids,
            })

            self.db.query(sql)

    def run(self, **kwargs):
        # Lock
        self.lock()

        # Rolling DB data
        table_limit_map = CONFIG['_DBDATA_TABLE_LIMIT_MAP']
        if table_limit_map:
            for table, limit in table_limit_map.items():
                self.debug_call(self.clear_table_by_limit, table=table, limit=int(limit))

        table_expire_map = CONFIG['_DBDATA_TABLE_EXPIRE_MAP']
        if table_expire_map:
            for table, expires in table_expire_map.items():
                self.debug_call(self.clear_table_by_expires, table=table, expires=int(expires))

        # Clear temp dir
        self.debug_call(self.clear_temp_file, CONFIG['UPLOAD_TEMP_FILE_DIR'])
        self.debug_call(self.clear_temp_file, CONFIG['DOWNLOAD_TEMP_FILE_DIR'])

        # Clear expired Func Store
        self.debug_call(self.clear_expired_func_store)

        # Clear expired dynamic cron expressions
        self.debug_call(self.clear_expired_dynamic_cron_expr)

        # Clear expired HSET cache
        self.debug_call(self.clear_expired_hset_cache)

        # Clear outdated recent triggered data
        self.debug_call(self.clear_outdated_recent_triggered_data)

        # Clear outdated Task Record for Func
        self.debug_call(self.clear_outdated_task_record_func)

        # Clear data for deprecated feature
        self.debug_call(self.clear_deprecated_data)

class AutoBackupDB(BaseInternalTask):
    name = 'Internal.AutoBackupDB'

    SQL_STR_TYPE_KEYWORDS = { 'char', 'text', 'blob' }

    def get_table_dump_parts(self, table):
        table_dumps_parts = []

        # Drop table
        sql = self.db.create_sql_builder()
        sql.DROP_TABLE(table)

        table_dumps_parts.append(str(sql))

        # Get create table SQL
        sql = '''SHOW CREATE TABLE `??`'''
        sql_params = [ table ]
        db_res = self.db.query(sql, sql_params)
        if not db_res:
            return

        table_dumps_parts.append(db_res[0]['Create Table'] + ';')

        # Do not backup the tables with limit / expire
        if table in CONFIG['_DBDATA_TABLE_LIMIT_MAP'] \
            or table in CONFIG['_DBDATA_TABLE_EXPIRE_MAP']:
            return table_dumps_parts

        # Skip backuping data if no data in table
        sql = '''SELECT * FROM `??` LIMIT 1'''
        sql_params = [ table ]
        db_res = self.db.query(sql, sql_params)
        if not db_res:
            return table_dumps_parts

        # Get table schema
        field_type_map = {}

        sql = '''DESCRIBE `??`'''
        sql_params = [ table ]
        db_res = self.db.query(sql, sql_params)
        for d in db_res:
            field      = d['Field']
            field_type = d['Type'].lower()
            if field_type == 'json':
                field_type_map[field] = 'json'
            else:
                for type_keyword in self.SQL_STR_TYPE_KEYWORDS:
                    if type_keyword in field_type:
                        field_type_map[field] = 'hexStr'
                        break
                else:
                    field_type_map[field] = 'normal'

        # Backup data
        table_dumps_parts.append('')

        sql = '''LOCK TABLES `??` WRITE'''
        sql_params = [ table ]
        table_dumps_parts.append(format_sql(sql, sql_params) + ';')

        select_fields = []
        for f, t in field_type_map.items():
            if t == 'hexStr':
                select_fields.append('HEX(`{0}`) AS `{0}`'.format(f))
            else:
                select_fields.append(f)

        select_fields_sql = ', '.join(select_fields)

        seq = 0
        while True:
            sql = '''
                SELECT ??
                FROM `??`
                WHERE
                    `seq` > ?
                ORDER BY
                    `seq` ASC
                LIMIT 20
            '''
            sql_params = [ select_fields_sql, table, seq ]
            db_res = self.db.query(sql, sql_params)
            if not db_res:
                table_dumps_parts.append('''UNLOCK TABLES;''')
                break

            values = []
            for d in db_res:
                _d = []
                for f in field_type_map.keys():
                    v = d[f]
                    t = field_type_map[f]
                    if v is None:
                        _d.append(None)

                    elif isinstance(v, arrow.Arrow):
                        _d.append(v.format('YYYY-MM-DD HH:mm:ss'))

                    else:
                        if t == 'hexStr':
                            _d.append(v)
                        else:
                            _d.append(v)

                values.append(_d)

            insert_fields = []
            for f in field_type_map.keys():
                insert_fields.append('`{0}`'.format(f))

            insert_fields_sql = ', '.join(insert_fields)

            sql = '''INSERT INTO `??` (??)\nVALUES\n  ?'''
            sql_params = [ table, insert_fields_sql, values ]
            table_dumps_parts.append(format_sql(sql, sql_params, pretty=True) + ';')

            seq = db_res[-1]['seq']

        return table_dumps_parts

    def limit_backups(self):
        backup_dir = CONFIG['DB_AUTO_BACKUP_FOLDER_PATH']
        if not os.path.exists(backup_dir):
            return

        # Remove first, Backup later, real limit should - 1
        backup_limit = CONFIG['DB_AUTO_BACKUP_LIMIT'] - 1

        # Get backup file name
        zip_file_names = []
        sql_file_names = []
        with os.scandir(backup_dir) as _dir:
            for _f in _dir:
                if not _f.is_file():
                    continue
                if not _f.name.startswith(CONFIG['_DB_AUTO_BACKUP_FILE_PREFIX']):
                    continue

                if _f.name.endswith('.zip'):
                    zip_file_names.append(_f.name)
                elif _f.name.endswith('.sql'):
                    sql_file_names.append(_f.name)

        # Rolling remove backup files
        zip_file_names.sort()
        if len(zip_file_names) > backup_limit:
            for file_name in zip_file_names[0:-backup_limit]:
                file_path = os.path.join(backup_dir, file_name)
                os.remove(file_path)

        # Remove temp .sql files
        for file_name in sql_file_names:
            file_path = os.path.join(backup_dir, file_name)
            os.remove(file_path)

    def limit_backup_size(self):
        backup_dir = CONFIG['DB_AUTO_BACKUP_FOLDER_PATH']
        if not os.path.exists(backup_dir):
            return

        # Backup total size limit
        limit_size = DataSize(CONFIG['DB_AUTO_BACKUP_SIZE_LIMIT'])

        zip_file_names = []
        with os.scandir(backup_dir) as _dir:
            for _f in _dir:
                if not _f.is_file():
                    continue
                if not _f.name.startswith(CONFIG['_DB_AUTO_BACKUP_FILE_PREFIX']):
                    continue

                if _f.name.endswith('.zip'):
                    zip_file_names.append(_f.name)

        # Compute size and rolling remove backup files
        backup_size = 0
        is_full     = False
        zip_file_names.sort(reverse=True)
        for file_name in zip_file_names:
            file_path = os.path.join(backup_dir, file_name)
            file_size = os.path.getsize(file_path)

            if not is_full and backup_size + file_size < limit_size:
                backup_size += file_size
            else:
                is_full = True
                os.remove(file_path)

    def run_backup(self):
        # Ensure dir
        backup_dir = CONFIG['DB_AUTO_BACKUP_FOLDER_PATH']
        os.makedirs(backup_dir, exist_ok=True)

        # Prepare
        now      = arrow.get().to(CONFIG['TIMEZONE'])
        date_str = now.format('YYYYMMDD-HHmmss')

        # Create temp .sql file to .zip
        sql_file_name = f"{CONFIG['_DB_AUTO_BACKUP_FILE_PREFIX']}{date_str}.sql"
        sql_file_path = os.path.join(backup_dir, sql_file_name)

        with open(sql_file_path, 'a') as _f:
            _f.write(textwrap.dedent(f'''
                    -- {'-' * 50}
                    -- DataFlux Func DB Backup
                    -- Date: {now.format('YYYY-MM-DD HH:mm:ss')}
                    -- Version: {IMAGE_INFO['VERSION']}
                    -- {'-' * 50}
                ''').lstrip())

            tables = self.db.tables()
            for t in tables:
                table_dump_parts = self.get_table_dump_parts(t)
                if table_dump_parts:
                    table_dumps = '\n'.join(table_dump_parts) + '\n\n'
                    _f.write(table_dumps)

        # Create .zip file
        zip_file_name = f"{CONFIG['_DB_AUTO_BACKUP_FILE_PREFIX']}{date_str}.zip"
        zip_file_path = os.path.join(backup_dir, zip_file_name)

        with zipfile.ZipFile(zip_file_path, 'w', compression=zipfile.ZIP_DEFLATED) as _z:
            _z.write(sql_file_path, arcname=sql_file_name)

        # Remove temp .sql file
        os.remove(sql_file_path)

    def run(self, **kwargs):
        if CONFIG['_DISABLE_DB_AUTO_BACKUP']:
            self.logger.warning('DB Auto Backup Disabled.')
            return

        # Lock
        self.lock(max_age=60)

        # Rolling remove prev backup files
        self.debug_call(self.limit_backups)
        self.debug_call(self.limit_backup_size)

        # Do backup
        # TODO Auto Backup DB Feature should be redesigned
        # self.debug_call(self.run_backup)

class ReloadDataMD5Cache(BaseInternalTask):
    '''
    Reload Data MD5 Cache
    '''
    name = 'Internal.ReloadDataMD5Cache'

    CACHE_CONFIG = {
        'script': {
            'table'   : 'biz_main_script',
            'md5Field': 'codeMD5',
        },
        'connector': {
            'table'      : 'biz_main_connector',
            'fieldsToMD5': 'configJSON',
        },
        'envVariable': {
            'table'      : 'biz_main_env_variable',
            'fieldsToMD5': [ 'valueTEXT', 'autoTypeCasting' ],
        },
    }

    def cache_data_md5(self, data_type, data_id=None):
        cache_config = self.CACHE_CONFIG.get(data_type)

        sql = self.db.create_sql_builder()
        sql.SELECT('id')

        if 'md5Field' in cache_config:
            # Use current MD5
            sql.SELECT(cache_config['md5Field'], 'md5')

        elif 'fieldsToMD5' in cache_config:
            # Compute MD5 using field values
            for index, f in enumerate(toolkit.as_array(cache_config['fieldsToMD5'])):
                sql.SELECT(f, f'fieldToMD5_{index}')

        sql.FROM(cache_config['table'])

        if data_id:
            data_id = toolkit.as_array(data_id)

            sql.WHERE({
                'id': data_id
            })

        db_res = self.db.query(sql)
        for d in db_res:
            if 'md5' in d:
                # Write "x" when no MD5
                if not d.get('md5'):
                    d['md5'] = 'x'

            else:
                # Compute MD5
                values_to_md5 = []
                for f in sorted(d.keys()):
                    if not f.startswith('fieldToMD5_'):
                        continue

                    value = d[f]
                    if isinstance(value, (list, tuple, dict)):
                        value = toolkit.json_dumps(value)

                    values_to_md5.append(value)

                d['md5'] = toolkit.get_md5(values_to_md5)

        data_md5_map       = dict([ ( d['id'], d['md5'] ) for d in db_res ])
        data_md5_cache_key = toolkit.get_cache_key('cache', 'dataMD5Cache', ['dataType', data_type])

        # Re-compute all if no ID specified
        if not data_id:
            self.cache_db.delete(data_md5_cache_key)

        if data_md5_map:
            # Create cache if data exists
            self.cache_db.hmset(data_md5_cache_key, data_md5_map)

        elif data_id:
            # Clear cache if specified ID and no data
            self.cache_db.hdel(data_md5_cache_key, data_id)

    def run(self, **kwargs):
        lock_time  = kwargs.get('lockTime') or 0
        reload_all = kwargs.get('all')      or False
        data_type  = kwargs.get('type')
        data_id    = kwargs.get('id')

        # Lock according to parameters
        if isinstance(lock_time, (int, float)) and lock_time > 0:
            self.lock(max_age=lock_time)

        # Write MD5 to Redis
        if reload_all:
            for data_type in self.CACHE_CONFIG.keys():
                self.cache_data_md5(data_type)

        else:
            self.cache_data_md5(data_type, data_id)

class CheckConnector(BaseInternalTask):
    name = 'Internal.CheckConnector'

    default_timeout = CONFIG['_CONNECTOR_CHECK_TASK_TIMEOUT']

    def run(self, **kwargs):
        connector_type   = kwargs.get('type')
        connector_config = kwargs.get('config')

        # Check Connector
        if connector_type not in CONNECTOR_HELPER_CLASS_MAP:
            e = Exception('Unsupported Connector type: `{}`'.format(connector_type))
            raise e

        connector_helper_class = CONNECTOR_HELPER_CLASS_MAP[connector_type]
        if connector_helper_class:
            connector_helper = connector_helper_class(self.logger, config=connector_config)
            connector_helper.check()

class QueryConnector(BaseInternalTask):
    name = 'Internal.QueryConnector'

    default_timeout = CONFIG['_CONNECTOR_QUERY_TASK_TIMEOUT']

    def _preapre_guance_dql_like_options(self, options):
        now = int(time.time() * 1000)

        # Ensure time range exists
        start = options.get('start')
        if not isinstance(start, int):
            start = now - 3600

        end = options.get('end')
        if not isinstance(end, int):
            end = now

        # Ensure start / end time order
        start, end = sorted([ start, end ])
        options['start'] = start
        options['end']   = end

        return options

    def run(self, **kwargs):
        connector_id            = kwargs.get('id')
        command                 = kwargs.get('command')
        command_args            = kwargs.get('commandArgs')   or []
        command_kwargs          = kwargs.get('commandKwargs') or {}
        query_statement         = kwargs.get('queryStatement')
        database                = kwargs.get('database')
        return_type             = kwargs.get('returnType') or 'json'
        guance_dql_like_options = kwargs.get('guanceDQLLikeOptions') or {}

        connector = None

        # Get Connector
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'type',
            'configJSON',
        ])
        sql.FROM('biz_main_connector')
        sql.WHERE({
            'id': connector_id,
        })

        db_res = self.db.query(sql)
        if len(db_res) > 0:
            connector = db_res[0]

        if not connector:
            e = Exception('No such Connector')
            raise e

        connector_type   = connector.get('type')
        connector_config = connector.get('configJSON')
        connector_config = decipher_connector_config(connector_id, connector_config)

        connector_helper_class = CONNECTOR_HELPER_CLASS_MAP.get(connector_type)
        if not connector_helper_class:
            e = Exception(f'Unsupported Connector type: `{connector_type}`')
            raise e

        if return_type == 'guanceDQLLike':
            # Force to `guance_dql_like_query` method if using Guance DQL-Like return type
            command        = 'guance_dql_like_query'
            command_args   = [ query_statement ]
            command_kwargs = { 'options': self._preapre_guance_dql_like_options(guance_dql_like_options) }

        elif not command:
            # Prase query command
            if connector_type in ( 'influxdb', 'mysql', 'clickhouse', 'oracle', 'sqlserver', 'postgresql', 'elasticsearch', 'prometheus', 'aliyunSLS' ):
                command      = 'query'
                command_args = toolkit.as_array(query_statement)

            elif connector_type in ( 'redis', 'memcached' ):
                command      = 'query'
                command_args = parse_args.get(query_statement)

            elif connector_type == 'mongodb':
                command = 'run_command'
                command_kwargs = toolkit.json_loads(query_statement)

            else:
                e = Exception(f'Querying is unsupported on the connector type: `{connector_type}`')
                raise e

        # Specify database
        if database:
            if connector_type == 'influxdb':
                command_kwargs['database'] = database

        # Run Connector commnd
        connector_helper = connector_helper_class(self.logger, config=connector_config)
        db_res = getattr(connector_helper, command)(*command_args, **command_kwargs)

        ret = None
        if return_type == 'repr':
            ret = pprint.pformat(db_res, width=100)
        else:
            ret = db_res

        return ret

class AutoRun(BaseInternalTask):
    name = 'Internal.AutoRun'

    def run(self, **kwargs):
        # Lock
        self.lock()

        sql = self.db.create_sql_builder()
        sql.SELECT([
            'id',
            'extraConfigJSON',
        ])
        sql.FROM('biz_main_func')
        sql.WHERE([
            { 'integration': 'autoRun' },
        ])

        db_res = self.db.query(sql)

        # Get auto-run Funcs
        funcs = []
        for d in db_res:
            # Skip Func without extra config
            if not d.get('extraConfigJSON'):
                continue

            # Skip Func without integration config
            integration_config = None
            try:
                integration_config = d['extraConfigJSON']['integrationConfig']
            except KeyError as e:
                continue

            if integration_config.get('onSystemLaunch') or integration_config.get('onLaunch'):
                d['timeout'] = d['extraConfigJSON'].get('timeout')
                d['expires'] = d['extraConfigJSON'].get('expires')
                funcs.append(d)

        for f in funcs:
            timeout = CONFIG['_FUNC_TASK_TIMEOUT_DEFAULT']
            if f['timeout']:
                timeout = int(f['timeout'])

            expires = CONFIG['_FUNC_TASK_EXPIRES_DEFAULT']
            if f['expires']:
                expires = int(f['expires'])

            task_req = {
                'name': 'Func.Runner',
                'kwargs': {
                    'funcId'  : f['id'],
                    'origin'  : 'integration',
                    'originId': f"autoRun.onSystemLaunch-{f['id']}",
                },
                'queue'  : CONFIG['_FUNC_TASK_QUEUE_DEFAULT'],
                'timeout': timeout,
                'expires': expires,
            }
            self.cache_db.put_tasks(task_req)

class UpdateWorkerQueueLimit(BaseInternalTask):
    name = 'Internal.UpdateWorkerQueueLimit'

    def run(self, **kwargs):
        # Lock
        self.lock()

        # Make { "Func ID": "Worker Queue" } map
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'id',
            'extraConfigJSON',
        ])
        sql.FROM('biz_main_func')

        db_res = self.db.query(sql)

        func_queue_map = {}
        for d in db_res:
            extra_config = d['extraConfigJSON'] or {}

            func_id = d['id']
            queue   = str(extra_config.get('queue') or CONFIG['_FUNC_TASK_QUEUE_CRON_JOB'])

            func_queue_map[func_id] = queue

        # Make { "Worker Queue": "Cron Job Task Count" } map
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'funcId',
            sql.FUNC('COUNT', sql.FIELD('*'), 'count'),
        ])
        sql.FROM('biz_main_cron_job')
        sql.WHERE({
            'isDisabled': False,
        })
        sql.GROUP_BY('funcId')

        db_res = self.db.query(sql)

        queue_count_map = {}
        for d in db_res:
            func_id = d['funcId']

            queue = func_queue_map.get(func_id)
            if not queue:
                continue

            if queue not in queue_count_map:
                queue_count_map[queue] = 0

            queue_count_map[queue] += d['count']

        # Iterate through the Worker Queues
        worker_queue_limit_map ={}
        for queue in list(range(CONFIG['_WORKER_QUEUE_COUNT'])):
            queue = str(queue)

            if not queue_count_map:
                # Cache not created, default to no limit
                worker_queue_limit_map[queue] = None
                continue

            count = queue_count_map.get(queue)
            if not count:
                # No Cron Job on Worker Queue, default to no limit
                worker_queue_limit_map[queue] = None
                continue

            # Limit Worker Queue length
            worker_queue_limit = max(count * CONFIG['_WORKER_QUEUE_LIMIT_SCALE_CRON_JOB'], CONFIG['_WORKER_QUEUE_LIMIT_MIN'])
            worker_queue_limit_map[queue] = worker_queue_limit

        # Create Cache
        cache_key = toolkit.get_global_cache_key('cache', 'workerQueueLimitCronJob')
        self.cache_db.set(cache_key, toolkit.json_dumps(worker_queue_limit_map))

class MigrationDataFix(BaseInternalTask):
    name = 'Internal.MigrationDataFix'

    def migrate_crontab_config_to_cron_job(self):
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'id',
            'extraConfigJSON',
        ])
        sql.FROM('biz_main_func')

        funcs = self.db.query(sql)
        for f in funcs:
            extra_config = f['extraConfigJSON']
            if not extra_config:
                continue

            # extraConfigJSON.integrationConfig.crontab -> cronExpr
            try:
                integration_config_crontab = extra_config['integrationConfig']['crontab']
            except KeyError as e:
                pass
            else:
                if integration_config_crontab:
                    extra_config['integrationConfig']['cronExpr'] = extra_config['integrationConfig'].pop('crontab')

            # extraConfigJSON.fixedCrontab -> fixedCronExpr
            try:
                fixed_crontab = extra_config['fixedCrontab']
            except KeyError as e:
                pass
            else:
                if fixed_crontab:
                    extra_config['fixedCronExpr'] = extra_config.pop('fixedCrontab')

            # extraConfigJSON.delayedCrontab -> delayedCronJob
            try:
                delayed_crontab = extra_config['delayedCrontab']
            except KeyError as e:
                pass
            else:
                if delayed_crontab:
                    extra_config['delayedCronJob'] = extra_config.pop('delayedCrontab')

            # Write back
            sql = self.db.create_sql_builder()
            sql.UPDATE('biz_main_func')
            sql.SET({
                'extraConfigJSON': toolkit.json_dumps(extra_config)
            })
            sql.WHERE({
                'id': f['id'],
            })

            self.db.query(sql)

    def run(self, **kwargs):
        # Lock
        self.lock()

        # Migration
        self.debug_call(self.migrate_crontab_config_to_cron_job)
