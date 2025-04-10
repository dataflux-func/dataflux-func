# -*- coding: utf-8 -*-

'''
Run Func
'''

# Built-in Modules
import pprint
import traceback

# 3rd-party Modules

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.tasks import PreviousTaskNotFinished
from worker.tasks.func import FuncBaseTask, BaseFuncResponse, FuncResponse, FuncResponseLargeData

CONFIG = yaml_resources.get('CONFIG')

class FuncRunner(FuncBaseTask):
    name = 'Func.Runner'

    # No default Task Record limit for Func Task
    default_task_record_limit = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.__full_print_log_lines = None
        self.__reduced_print_logs   = None

    @property
    def return_value(self):
        if not self.result:
            return None

        return self.result['returnValue']

    @property
    def response_control(self):
        if not self.result:
            return None

        return self.result['responseControl']

    def __make_full_print_log_lines(self):
        # Full `print` logs is only for Guance, TrueWatch data uploading,
        # and the logs will splited locally for correct line breaking.
        # So keep list here
        lines = []
        if self.print_log_lines:
            lines.extend(self.print_log_lines)

        if self.traceback:
            lines.append(f'[Traceback]\n{self.traceback}')

        self.__full_print_log_lines = lines

    @property
    def full_print_log_lines(self):
        if self.script_scope is None:
            return None

        if not self.print_log_lines and not self.traceback:
            return None

        if not self.__full_print_log_lines:
            self.__make_full_print_log_lines()

        return self.__full_print_log_lines

    def __make_reduced_print_logs(self):
        lines = []
        for line in self.print_log_lines:
            lines.append(toolkit.limit_text(line, CONFIG['_TASK_RECORD_PRINT_LOG_LINE_LIMIT'], show_length=True))

        reduced_logs = '\n'.join(lines).strip()

        length = len(reduced_logs)
        if length > CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_HEAD'] + CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_TAIL']:
            reduce_tip = f"!!! Content too long, only FIRST {CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_HEAD']} chars and LAST {CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_TAIL']} are saved !!!"
            first_part = reduced_logs[:CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_HEAD']] + '...'
            skip_tip   = f"<skipped {length - CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_HEAD'] - CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_TAIL']} chars>"
            last_part  = '...' + reduced_logs[-CONFIG['_TASK_RECORD_PRINT_LOG_TOTAL_LIMIT_TAIL']:]
            reduced_logs = '\n\n'.join([ reduce_tip, first_part, skip_tip, last_part ])

        self.__reduced_print_logs = reduced_logs

    @property
    def reduced_print_logs(self):
        if self.script_scope is None:
            return None

        if not self.print_log_lines:
            return None

        if not self.__reduced_print_logs:
            self.__make_reduced_print_logs()

        return self.__reduced_print_logs

    def cache_recent_cron_job_triggered(self):
        try:
            # Get recent triggered time cache
            cache_key = toolkit.get_global_cache_key('cache', 'recentTaskTriggered', [ 'origin', self.origin ])
            cache_value = self.cache_db.hget(cache_key, self.origin_id)
            if cache_value:
                cache_value = toolkit.json_loads(cache_value)

            if not isinstance(cache_value, dict):
                cache_value = {}

            # Decode data
            for _exec_mode in list(cache_value.keys()):
                cache_value[_exec_mode] = toolkit.delta_of_delta_decode(toolkit.repeat_decode(cache_value[_exec_mode]))

            # [Compatibility] `crontab` was changed to `cronJob`
            if 'crontab' in cache_value:
                cache_value['cronJob'] = cache_value.pop('crontab') or []

            # Add data
            exec_mode = self.kwargs.get('cronJobExecMode')
            if exec_mode not in cache_value:
                cache_value[exec_mode] = []

            cache_value[exec_mode].append(self.trigger_time)

            # Remove expired data and encode data
            for _exec_mode in list(cache_value.keys()):
                cache_value[_exec_mode] = list(filter(lambda ts: ts > self.trigger_time - CONFIG['_RECENT_CRON_JOB_TRIGGERED_EXPIRES'], cache_value[_exec_mode]))
                cache_value[_exec_mode] = toolkit.repeat_encode(toolkit.delta_of_delta_encode(cache_value[_exec_mode]))

            # Write back to cache
            self.cache_db.hset(cache_key, self.origin_id, toolkit.json_dumps(cache_value))

        except Exception as e:
            # Do not panic
            for line in traceback.format_exc().splitlines():
                self.logger.warning(line)

            if CONFIG['MODE'] == 'dev':
                raise

    def cache_last_task_status(self, status, exception=None):
        if self.origin not in ( 'syncAPI', 'asyncAPI', 'cronJob' ):
            return

        cache_key = toolkit.get_global_cache_key('cache', 'lastTaskStatus', [ 'origin', self.origin ])
        cache_value = {
            'status'   : status,
            'timestamp': int(self.trigger_time),
        }
        if exception:
            cache_value.update({
                'exceptionType': toolkit.exception_type(exception),
                'exceptionTEXT': toolkit.exception_text(exception),
            })

        self.cache_db.hset(cache_key, self.origin_id, toolkit.json_dumps(cache_value))

    # Overwrite parent class method
    def create_task_record_guance_data(self):
        if not self.guance_data_upload_url:
            return None

        data = []

        data_template = {
            'tags': {
                'id'           : self.task_id,
                'name'         : self.name,
                'queue'        : str(self.queue),
                'task_status'  : self.status,
                'root_task_id' : self.root_task_id,
                'script_set_id': self.script_set_id,
                'script_id'    : self.script_id,
                'func_id'      : self.func_id,
                'func_name'    : self.func_name,
                'origin'       : self.origin,
                'origin_id'    : self.origin_id,

                'script_set_title': self.script_set_title or 'UNTITLED',
                'script_title'    : self.script_title     or 'UNTITLED',
                'func_title'      : self.func_title       or 'UNTITLED',
            },
            'fields': {
                'func_call_kwargs': toolkit.json_dumps(self.func_call_kwargs),
                'cron_expr'       : self.kwargs.get('cronExpr'),
                'call_chain'      : toolkit.json_dumps(self.call_chain, keep_none=True),
                'return_value'    : toolkit.json_dumps(self.return_value, keep_none=True),
                'delay'           : self.delay,
                'timeout'         : self.timeout,
                'expires'         : self.expires,
                'ignore_result'   : self.ignore_result,
                'exception_type'  : self.exception_type,
                'exception'       : self.exception_text,
                'trigger_time_iso': self.trigger_time_iso,
                'start_time_iso'  : self.start_time_iso,
                'end_time_iso'    : self.end_time_iso,
                'wait_cost'       : self.wait_cost,
                'run_cost'        : self.run_cost,
                'total_cost'      : self.total_cost,
            },
            'timestamp': int(self.trigger_time),
        }

        # Extra Guance, TrueWatch Tags and Fields
        for k, v in self.extra_guance_data.tags.items():
            if k not in data_template['tags']:
                data_template['tags'][k] = v

        for k, v in self.extra_guance_data.fields.items():
            if k not in data_template['fields']:
                data_template['fields'][k] = v

        # Task Record for Func
        _data = toolkit.json_copy(data_template)

        _data['measurement'] = CONFIG['_SELF_MONITOR_GUANCE_MEASUREMENT_TASK_RECORD_FUNC']
        _data['fields']['message'] = self.full_print_log_lines

        data.append(_data)

        # More data
        if self.extra_guance_data.more_data:
            for d in self.extra_guance_data.more_data:
                _data = toolkit.json_copy(data_template)

                _data['measurement'] = d['measurement']

                # Allow to override Tags and Fields
                if d['tags']:
                    _data['tags'].update(d['tags'])

                if d['fields']:
                    _data['fields'].update(d['fields'])

                data.append(_data)

        return data

    def _buff_task_record_func(self):
        if not self.is_local_func_task_record_enabled:
            return

        data = {
            '_taskRecordLimit': self.task_record_limit,

            'id'                   : self.task_id,
            'rootTaskId'           : self.root_task_id,
            'scriptSetId'          : self.script_set_id,
            'scriptId'             : self.script_id,
            'funcId'               : self.func_id,
            'funcCallKwargsJSON'   : toolkit.json_dumps(self.func_call_kwargs),
            'origin'               : self.origin,
            'originId'             : self.origin_id,
            'cronExpr'             : self.kwargs.get('cronExpr'),
            'callChainJSON'        : toolkit.json_dumps(self.call_chain, keep_none=True),
            'triggerTimeMs'        : self.trigger_time_ms,
            'startTimeMs'          : self.start_time_ms,
            'endTimeMs'            : self.end_time_ms,
            'delay'                : self.delay,
            'queue'                : self.queue,
            'timeout'              : self.timeout,
            'expires'              : self.expires,
            'ignoreResult'         : self.ignore_result,
            'status'               : self.status,
            'exceptionType'        : self.exception_type,
            'exceptionTEXT'        : self.exception_text,
            'tracebackTEXT'        : self.traceback,
            'nonCriticalErrorsTEXT': self.non_critical_errors,
            'printLogsTEXT'        : self.reduced_print_logs,
            'returnValueJSON'      : toolkit.json_dumps(self.return_value, keep_none=True),
            'responseControlJSON'  : toolkit.json_dumps(self.response_control, keep_none=True),
        }
        cache_key = toolkit.get_cache_key('dataBuffer', 'taskRecordFunc')
        self.cache_db.push(cache_key, toolkit.json_dumps(data))

    def _buff_func_call_count(self):
        data = {
            'scriptSetId': self.script_set_id,
            'scriptId'   : self.script_id,
            'funcId'     : self.func_id,
            'origin'     : self.origin,
            'originId'   : self.origin_id,
            'queue'      : str(self.queue),
            'status'     : self.status,
            'timestamp'  : int(self.trigger_time),
            'waitCost'   : self.wait_cost,
            'runCost'    : self.run_cost,
            'totalCost'  : self.total_cost,

            'scriptSetTitle': self.script_set_title,
            'scriptTitle'   : self.script_title,
            'funcTitle'     : self.func_title,
        }
        cache_key = toolkit.get_cache_key('dataBuffer', 'funcCallCount')
        self.cache_db.push(cache_key, toolkit.json_dumps(data))

    # Overwrite parent class method
    def buff_task_record(self):
        # Since Func Tasks may be very many and contain large logs,
        # Upload to Guance, TrueWatch directly instead of buffing
        data = self.create_task_record_guance_data()
        if self.guance_data_upload_url and data:
            self.upload_guance_data('logging', data)

        # Task Record for Func
        self._buff_task_record_func()

        # Func call count
        self._buff_func_call_count()

    # Add processing to parent class methods
    def response(self, task_resp):
        super().response(task_resp)

        # Cache Func result
        if self.cache_result and self.cache_result_key:
            task_resp_dumps = toolkit.json_dumps(task_resp)
            self.cache_db.set(self.cache_result_key, task_resp_dumps, expires=self.cache_result)

    def run(self, **kwargs):
        super().run(**kwargs)

        ### Start Task
        # Record Cron Job trigger time
        if self.is_root_task and self.origin == 'cronJob':
            self.cache_recent_cron_job_triggered()

        func_resp = None
        try:
            # Cron Job lock
            cron_job_lock_key   = kwargs.get('cronJobLockKey')
            cron_job_lock_value = kwargs.get('cronJobLockValue')

            if cron_job_lock_key and cron_job_lock_value:
                if not self.cache_db.lock(cron_job_lock_key, cron_job_lock_value, self.timeout):
                    raise PreviousTaskNotFinished()

            # Cache Task status
            self.cache_last_task_status(status='started')

            # Run Func
            func_resp = self.apply()

            # When responsing large data, result should be cached as a file
            if isinstance(func_resp, FuncResponseLargeData):
                cache_result_expires = 0
                try:
                    cache_result_expires = self.script['funcExtraConfig'][self.func_id]['cacheResult']
                except (KeyError, TypeError) as e:
                    pass

                func_resp.cache_to_file(cache_result_expires or 0)

        except Exception as e:
            # Cache Task status
            self.cache_last_task_status(status='failure', exception=e)

            # Replace traceback
            self.traceback = self.get_traceback()

            raise

        else:
            # Cache Task status
            self.cache_last_task_status(status='success')

            # Prepare Func result
            return_value     = func_resp.data
            response_control = func_resp.make_response_control()

            result = {
                'returnValue'    : return_value,
                'responseControl': response_control,
            }
            return result

        finally:
            # Cron Job unlock
            if cron_job_lock_key and cron_job_lock_value:
                self.cache_db.unlock(cron_job_lock_key, cron_job_lock_value)

            # Clean up
            self.clean_up()
