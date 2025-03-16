# -*- coding: utf-8 -*-

'''
Run Func in Debug Mode
For Script pre-check, run Func in DataFlux Func code editor
'''

# Built-in Modules
import pprint
import traceback
import tracemalloc

# 3rd-party Modules

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.tasks import TaskTimeout
from worker.tasks.func import FuncBaseTask, BaseFuncResponse, FuncResponse

CONFIG = yaml_resources.get('CONFIG')

class FuncDebugger(FuncBaseTask):
    name = 'Func.Debugger'

    def __init__(self, *args, **kwargs):
        # Trace memory usage
        tracemalloc.start()

        super().__init__(*args, **kwargs)

        self.logger.debug('[INIT] Func Debugger')

    def run(self, **kwargs):
        super().run(**kwargs)

        # Pre-check task will never fails because it needs to return the logs, results and errors to the caller.
        # The `_status` here is for user Func result.
        # API side should determine if the pre-check passed according to the `result.result`,
        # return the wrapped error to the caller.
        _status = 'failure'

        # Error info
        _exception  = None
        _traceback = None

        ### Task start
        func_resp = None
        try:
            # Run Func
            func_resp = self.apply(use_code_draft=True)

        except Exception as e:
            _status = 'failure'
            if isinstance(e, TaskTimeout):
                _status = 'timeout'

            # Since the Task never fails, log traceback manually is necessary (use warning level)
            for line in traceback.format_exc().splitlines():
                self.logger.warning(line)

            # Collect errors
            only_in_script = CONFIG['MODE'] != 'dev'

            _exception      = e
            _exception_type = toolkit.exception_type(e)
            _exception_text = toolkit.exception_text(e)
            _traceback      = self.get_traceback(only_in_script)

        else:
            _status = 'success'

        finally:
            return_value     = None
            response_control = None

            if self.func_name and func_resp:
                # NOTE only `repr` result is accepted in Client
                return_value = pprint.saferepr(func_resp.data)

                # Response control
                response_control = func_resp.make_response_control()

            # Make result
            result = {
                'returnValue'    : return_value,
                'responseControl': response_control,

                'apiFuncs' : self.api_funcs,
                'printLogs': self.print_log_lines,

                'status'         : _status,
                'exception'      : None if _exception is None else _exception_text,
                'exceptionType'  : None if _exception is None else _exception_type,
                'traceback'      : _traceback,
                'cost'           : round(toolkit.get_timestamp(None, 3) - self.start_time, 3),
                'peakMemroyUsage': None,
            }

            # Clean up
            self.clean_up()

            # Compute peak memory usage
            result['peakMemroyUsage'] = tracemalloc.get_traced_memory()[1]
            tracemalloc.stop()

            return result
