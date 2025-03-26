# -*- coding: utf-8 -*-

# Built-in Modules
import os
import socket
import traceback
import pprint

# 3rd-party Modules
import arrow
from retry.api import retry_call

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.utils.log_helper import LogHelper
from worker.utils.extra_helpers import FuncMySQLHelper, FuncPostgreSQLHelper, MySQLHelper, PostgreSQLHelper, RedisHelper, FileSystemHelper
from worker.utils.extra_helpers.dataway import DataWay

HOSTNAME = socket.gethostname()

CONST      = yaml_resources.get('CONST')
CONFIG     = yaml_resources.get('CONFIG')
IMAGE_INFO = yaml_resources.get('IMAGE_INFO')

SYSTEM_SETTING_LOCAL_CACHE = toolkit.LocalCache(expires=15)

GUANCE_DATA_STATUS_DEFAULT = 'info'
GUANCE_DATA_STATUS_MAP = {
    'success': 'ok',
    'failure': 'critical',
    'timeout': 'error',
    'skip'   : 'warning',
    'expire' : 'warning',
    'pending': 'info',
    'waiting': 'info',
}

class PreviousTaskNotFinished(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__('Previous task not finished, skip current task')

class TaskTimeout(BaseException):
    # NOTE To ensure that TaskTimeout errors are not caught by try ... except Exception,
    #      TaskTimeout needs to inherit from BaseException class.
    def __init__(self, *args, **kwargs):
        super().__init__('Task execution takes too much time and has been interrupted by force')

class TaskExpired(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__('Task waited takes too much time and has been skipped')

class BaseTask(object):
    '''
    Base task class
    '''
    # Name
    name = None

    # Default Queue
    default_queue = CONFIG['_TASK_QUEUE_DEFAULT']

    # Default expires
    default_expires = CONFIG['_TASK_EXPIRES_DEFAULT']

    # Default timeout
    default_timeout = CONFIG['_TASK_TIMEOUT_DEFAULT']

    # Default Task Record limit
    default_task_record_limit = CONFIG['_TASK_RECORD_LIMIT_DEFAULT']

    # Default ignore result or not
    default_ignore_result = True

    def __init__(self,
                 task_id=None,
                 kwargs=None,
                 trigger_time=None,
                 eta=None,
                 delay=None,
                 queue=None,
                 timeout=None,
                 expires=None,
                 ignore_result=None,
                 task_record_limit=None):

        # Components
        self.logger = LogHelper(self)

        if CONFIG.get('DB_ENGINE') == 'postgresql':
            self.db     = FuncPostgreSQLHelper(self.logger)
            self.raw_db = PostgreSQLHelper(self.logger)
        else:
            self.db     = FuncMySQLHelper(self.logger)
            self.raw_db = MySQLHelper(self.logger)

        self.cache_db     = RedisHelper(self.logger)
        self.file_storage = FileSystemHelper(self.logger)

        # Attrs
        self.task_id = task_id or toolkit.gen_task_id()
        self.kwargs  = kwargs or dict()

        now = self.cache_db.get_timestamp(3)
        self.trigger_time = min(now, trigger_time or now)
        self.start_time   = None
        self.end_time     = None

        self.result    = None
        self.exception = None
        self.traceback = None
        self.status    = 'waiting'

        # Default configs
        self.eta               = None
        self.delay             = 0
        self.queue             = self.default_queue
        self.timeout           = self.default_timeout
        self.expires           = self.default_expires
        self.ignore_result     = self.default_ignore_result
        self.task_record_limit = self.default_task_record_limit

        # Specified configs
        if eta is not None:
            self.eta = eta

        if delay is not None:
            self.delay = delay

        if queue is not None:
            self.queue = queue

        if timeout is not None:
            self.timeout = timeout

        if expires is not None:
            self.expires = expires

        if ignore_result is not None:
            self.ignore_result = ignore_result

        if task_record_limit is not None:
            self.task_record_limit = task_record_limit

        # Task lock
        self._lock_key   = None
        self._lock_value = None

        # Task info
        log_attrs = [
            'trigger_time',
            'eta',
            'delay',
            'queue',
            'timeout',
            'expires',
            'ignore_result',
            'task_record_limit',
        ]
        self.logger.debug(f"[INIT TASK] {', '.join([f'{a}=`{getattr(self, a)}`' for a in log_attrs])}")

        # Guance, TrueWatch data uploading errors
        self.guance_data_upload_errors = []

    @property
    def trigger_time_ms(self):
        if self.trigger_time is None:
            return None
        else:
            return int(self.trigger_time * 1000)

    @property
    def trigger_time_iso(self):
        if self.trigger_time is None:
            return None
        else:
            return arrow.get(self.trigger_time).to(CONFIG['TIMEZONE']).isoformat()

    @property
    def start_time_ms(self):
        if self.start_time is None:
            return None
        else:
            return int(self.start_time * 1000)

    @property
    def start_time_iso(self):
        if self.start_time is None:
            return None
        else:
            return arrow.get(self.start_time).to(CONFIG['TIMEZONE']).isoformat()

    @property
    def end_time_ms(self):
        if self.end_time is None:
            return None
        else:
            return int(self.end_time * 1000)

    @property
    def end_time_iso(self):
        if self.end_time is None:
            return None
        else:
            return arrow.get(self.end_time).to(CONFIG['TIMEZONE']).isoformat()

    @property
    def wait_cost(self):
        if not self.start_time_ms:
            return None

        return self.start_time_ms - self.trigger_time_ms

    @property
    def run_cost(self):
        if not self.end_time_ms or not self.start_time_ms:
            return None

        return self.end_time_ms - self.start_time_ms

    @property
    def total_cost(self):
        if not self.end_time_ms:
            return None

        return self.end_time_ms - self.trigger_time_ms

    @property
    def system_settings(self):
        global SYSTEM_SETTING_LOCAL_CACHE

        # Read from Cache
        data = SYSTEM_SETTING_LOCAL_CACHE['data']
        if data:
            return data

        # Read from DB
        ids = [
            'LOCAL_FUNC_TASK_RECORD_ENABLED',
            'GUANCE_DATA_UPLOAD_ENABLED',
            'GUANCE_DATA_UPLOAD_URL',
            'GUANCE_DATA_SITE_NAME',
        ]
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'id',
            'value',
        ])
        sql.FROM('wat_main_system_setting')
        sql.WHERE({
            'id': ids
        })

        db_res = self.db.query(sql)

        data = {}

        # Default values
        for _id in ids:
            data[_id] = CONST['systemSettings'][_id]

        # User settings
        for d in db_res:
            data[d['id']] = toolkit.json_loads(d['value'])

        # Add to cache
        SYSTEM_SETTING_LOCAL_CACHE['data'] = data

        return data

    @property
    def is_local_func_task_record_enabled(self):
        return self.system_settings.get('LOCAL_FUNC_TASK_RECORD_ENABLED') or False

    @property
    def guance_data_upload_url(self):
        guance_data_upload_enabled = self.system_settings.get('GUANCE_DATA_UPLOAD_ENABLED') or False
        guance_data_upload_url     = self.system_settings.get('GUANCE_DATA_UPLOAD_URL')     or None

        if guance_data_upload_enabled and guance_data_upload_url:
            return guance_data_upload_url

    @property
    def exception_type(self):
        return toolkit.exception_type(self.exception)

    @property
    def exception_text(self):
        return toolkit.exception_text(self.exception)

    @property
    def non_critical_errors(self):
        parts = []

        if self.guance_data_upload_errors:
            parts.append('')
            parts.append('[Guance Data Upload Errors]')
            parts.extend(map(lambda x: str(x), self.guance_data_upload_errors))

        if not parts:
            return None
        else:
            return '\n'.join(parts[1:])

    def lock(self, max_age=None):
        max_age = int(max_age or 30)

        lock_key   = toolkit.get_cache_key('lock', 'task', tags=[ 'task', self.name ])
        lock_value = toolkit.gen_uuid()

        if not self.cache_db.lock(lock_key, lock_value, max_age):
            raise PreviousTaskNotFinished()

        self._lock_key   = lock_key
        self._lock_value = lock_value

        self.logger.debug(f'[LOCK] Task Locked: `{lock_key}`')

    def unlock(self):
        if self._lock_key and self._lock_value:
            if self.cache_db.unlock(self._lock_key, self._lock_value):
                self.logger.debug(f'[LOCK] Task Unlocked')

        self._lock_key   = None
        self._lock_value = None

    def create_task_record_data(self):
        data = {
            'id'            : self.task_id,
            'name'          : self.name,
            'kwargsJSON'    : toolkit.json_dumps(self.kwargs),
            'triggerTimeMs' : self.trigger_time_ms,
            'startTimeMs'   : self.start_time_ms,
            'endTimeMs'     : self.end_time_ms,
            'eta'           : self.eta,
            'delay'         : self.delay,
            'queue'         : self.queue,
            'timeout'       : self.timeout,
            'expires'       : self.expires,
            'ignoreResult'  : self.ignore_result,
            'resultJSON'    : toolkit.json_dumps(self.result, keep_none=True),
            'status'        : self.status,
            'exceptionType' : self.exception_type,
            'exceptionTEXT' : self.exception_text,
            'tracebackTEXT' : self.traceback,
        }
        return data

    def create_task_record_guance_data(self):
        if not self.guance_data_upload_url:
            return None

        log_data = [ f"[{line['meta']['timestampShort']}] [+{line['meta']['diffTime']}] [{line['meta']['costTime']}] {line['message']}" for line in self.logger._staged_logs ]
        if self.traceback:
            log_data.append(' Traceback '.center(30, '-'))
            log_data.append(self.traceback)

        log_text = '\n'.join(log_data)

        data = {
            'measurement': CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_TASK_RECORD'],
            'tags': {
                'id'         : self.task_id,
                'name'       : self.name,
                'queue'      : str(self.queue),
                'task_status': self.status,
            },
            'fields': {
                'message'         : log_text,
                'kwargs'          : toolkit.json_dumps(self.kwargs),
                'eta'             : self.eta,
                'delay'           : self.delay,
                'timeout'         : self.timeout,
                'expires'         : self.expires,
                'ignore_result'   : self.ignore_result,
                'result'          : toolkit.json_dumps(self.result, keep_none = True),
                'exception_type'  : self.exception_type,
                'exception'       : self.exception_text,
                'traceback'       : self.traceback,
                'trigger_time_iso': self.trigger_time_iso,
                'start_time_iso'  : self.start_time_iso,
                'end_time_iso'    : self.end_time_iso,
                'wait_cost'       : self.wait_cost,
                'run_cost'        : self.run_cost,
                'total_cost'      : self.total_cost,
            },
            'timestamp': int(self.trigger_time),
        }
        return data

    def buff_task_record(self):
        '''
        To improve performance,
        the Task Record is written to the Redis queue first, not to the DB directly.
        '''
        data = self.create_task_record_data()
        if data:
            cache_key = toolkit.get_cache_key('dataBuffer', 'taskRecord')
            self.cache_db.push(cache_key, toolkit.json_dumps(data))

            self.logger.debug(f'[TASK RECORD] Buffered: `{cache_key}`')

        data = self.create_task_record_guance_data()
        if data:
            cache_key = toolkit.get_cache_key('dataBuffer', 'taskRecordGuance')
            self.cache_db.push(cache_key, toolkit.json_dumps(data))

            self.logger.debug(f'[TASK RECORD] Buffered: `{cache_key}`')

    def upload_guance_data(self, category, data):
        try:
            if not self.guance_data_upload_url:
                return

            if not data:
                return

            data = toolkit.as_array(data)

            self.logger.debug(f'[UPLOAD GUANCE DATA]: {len(data)} {category} point(s)')

            # Prepare data
            for p in data:
                p['tags']   = p.get('tags')   or {}
                p['fields'] = p.get('fields') or {}

                # Add `tags.version`
                version = IMAGE_INFO.get('VERSION')
                if version:
                    p['tags']['DFF_version'] = version

                # Add `tags.site_name`
                site_name = self.system_settings.get('GUANCE_DATA_SITE_NAME')
                if site_name:
                    p['tags']['site_name'] = site_name

                # Add `tags.hostname`
                p['tags']['hostname'] = HOSTNAME

                # Add `status` for Guance, TrueWatch according to `task_status`
                if 'status' not in p['tags'] and 'task_status' in p['tags']:
                    try:
                        p['tags']['status'] = GUANCE_DATA_STATUS_MAP[p['tags']['task_status']]
                    except Exception as e:
                        p['tags']['status'] = GUANCE_DATA_STATUS_DEFAULT

                # Ensure `message` field for logging data
                if category == 'logging' and p['fields'].get('message') is None:
                    p['fields']['message'] = ''

            # Upload data
            dataway = DataWay(url=self.guance_data_upload_url)

            if category == 'logging':
                # Since logging data is large
                # Each piece of data is uploaded and splited separately
                for single_point in data:
                    # Try to get and split `message`
                    logging_message = single_point['fields']['message'] or ''
                    try:
                        logging_message = toolkit.str_split_by_bytes(logging_message, page_bytes=CONFIG['_SELF_MONITOR_GUANCE_LOGGING_SPLIT_BYTES'])

                    except Exception as e:
                        for line in traceback.format_exc().splitlines():
                            self.logger.warning(line)

                        self.guance_data_upload_errors.append(e)

                    if logging_message:
                        # Found `message`, split and write
                        base_timestamp = single_point['timestamp'] * 1000 * 1000
                        logging_message_parts = toolkit.as_array(logging_message)
                        for i, _message in enumerate(logging_message_parts):
                            single_point['fields']['message'] = toolkit.limit_text(_message, show_length='newLine', max_length=CONFIG['_SELF_MONITOR_GUANCE_LOGGING_SPLIT_BYTES'])
                            single_point['fields']['message_page_count']  = len(logging_message_parts)
                            single_point['fields']['message_page_number'] = i + 1
                            single_point['timestamp'] = base_timestamp + i # Keep order
                            fkwargs = {
                                'path'  : f'/v1/write/{category}',
                                'points': single_point,
                            }
                            try:
                                retry_call(dataway.post_line_protocol, fkwargs=fkwargs, tries=3, delay=1)

                            except Exception as e:
                                for line in traceback.format_exc().splitlines():
                                    self.logger.warning(line)

                                self.guance_data_upload_errors.append(e)

                    else:
                        # No `message`, write directly
                        fkwargs = {
                            'path'  : f'/v1/write/{category}',
                            'points': single_point,
                        }
                        try:
                            retry_call(dataway.post_line_protocol, fkwargs=fkwargs, tries=3, delay=1)
                        except Exception as e:
                            for line in traceback.format_exc().splitlines():
                                self.logger.warning(line)

                            self.guance_data_upload_errors.append(e)

            else:
                # Upload other category of data directly
                fkwargs = {
                    'path'  : f'/v1/write/{category}',
                    'points': data,
                }
                try:
                    retry_call(dataway.post_line_protocol, fkwargs=fkwargs, tries=3, delay=1)
                except Exception as e:
                    for line in traceback.format_exc().splitlines():
                        self.logger.warning(line)

                    self.guance_data_upload_errors.append(e)

        except Exception as e:
            # Do not panic
            for line in traceback.format_exc().splitlines():
                self.logger.warning(line)

            self.guance_data_upload_errors.append(e)

    def response(self, task_resp):
        task_resp_topic = toolkit.get_global_cache_key('task', 'response')
        task_resp_dumps = toolkit.json_dumps(task_resp, ignore_nothing=True, indent=None)

        self.cache_db.publish(task_resp_topic, task_resp_dumps)

        self.logger.debug(f'[TASK RESP] Published to: `{task_resp_topic}`')

    def create_task_request(self):
        task_req = {
            'name'  : self.name,
            'id'    : self.task_id,
            'kwargs': self.kwargs,

            'triggerTime': self.trigger_time,

            'queue'          : self.queue,
            'eta'            : self.eta,
            'delay'          : self.delay,
            'timeout'        : self.timeout,
            'expires'        : self.expires,
            'ignoreResult'   : self.ignore_result,
            'taskRecordLimit': self.task_record_limit,
        }
        return task_req

    def create_task_resp(self):
        task_resp =  {
            'name': self.name,
            'id'  : self.task_id,

            'triggerTime': self.trigger_time,
            'startTime'  : self.start_time,
            'endTime'    : self.end_time,

            'result'       : self.result if not self.ignore_result else 'IGNORED',
            'status'       : self.status,
            'exception'    : self.exception_text,
            'exceptionType': self.exception_type,
            'traceback'    : self.traceback,
        }
        return task_resp

    @classmethod
    def from_task_request(cls, task_req):
        task_inst = cls(task_id=task_req.get('id'),
                            kwargs=task_req.get('kwargs'),
                            trigger_time=task_req.get('triggerTime'),
                            queue=task_req.get('queue'),
                            eta=task_req.get('eta'),
                            delay=task_req.get('delay'),
                            timeout=task_req.get('timeout'),
                            expires=task_req.get('expires'),
                            ignore_result=task_req.get('ignoreResult'),
                            task_record_limit=task_req.get('taskRecordLimit'))
        return task_inst

    def start(self):
        # Task info
        self.status     = 'pending'
        self.start_time = self.cache_db.get_timestamp(3)
        self.logger.debug(f'[START TIME] `{self.start_time}` ({toolkit.get_datetime_string_cn(self.start_time)})')

        # Call `run()` of subclass
        try:
            # Check if Task is expired or not
            if self.expires and self.wait_cost and self.wait_cost > self.expires * 1000:
                raise TaskExpired()

            self.logger.info(f'[START] {self.name}')
            self.result = self.run(**self.kwargs)

        except PreviousTaskNotFinished as e:
            # Skip if prev Task not finished
            self.status = 'skip'
            self.exception = e

            self.logger.warning(self.exception)

        except TaskExpired as e:
            # Task is expired
            self.status = 'expire'
            self.exception = e

            self.logger.warning(self.exception)

        except TaskTimeout as e:
            # Task is timeout
            self.status = 'timeout'

            # Replace exception / traceback
            self.exception = self.exception or e
            self.traceback = self.traceback or traceback.format_exc()

            for line in self.traceback.splitlines():
                self.logger.error(line)

        except Warning as e:
            # Warning
            self.status = 'skip'
            self.exception = e

            # Replace exception / traceback
            self.exception = self.exception or e
            self.traceback = self.traceback or traceback.format_exc()

            for line in self.traceback.splitlines():
                self.logger.warning(line)

        except Exception as e:
            # Other Exceptions
            self.status = 'failure'

            # Replace exception / traceback
            self.exception = self.exception or e
            self.traceback = self.traceback or traceback.format_exc()

            for line in self.traceback.splitlines():
                self.logger.error(line)

        else:
            # Success
            self.status = 'success'
            self.logger.debug(f'[RESULT] `{self.result}`')

        finally:
            self.end_time = self.cache_db.get_timestamp(3)
            self.logger.debug(f'[END TIME] `{self.end_time}` ({toolkit.get_datetime_string_cn(self.start_time)})')
            self.logger.debug(f'[STATUS] `{self.status}`')

            # Buff Task Record
            self.buff_task_record()

            # Send Task result response
            if not self.ignore_result:
                task_resp = self.create_task_resp()
                self.response(task_resp)

            # Unlock
            self.unlock()

    def run(self, **kwargs):
        self.logger.info(f'[RUN] Task Name: `{self.name}`')
