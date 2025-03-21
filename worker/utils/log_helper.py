# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import time
import logging
import socket
import re
import pathlib

# 3rd-party Modules
import arrow

# Project Modules
from worker.utils import yaml_resources, toolkit
from worker.utils.colors import colors

CONFIG = yaml_resources.get('CONFIG')

# Init
HOSTNAME = socket.gethostname()
MAIN_PID = os.getpid()

LOG_LEVELS = {
    'levels': {
        'ALL'    : 4,
        'DEBUG'  : 3,
        'INFO'   : 2,
        'WARNING': 1,
        'ERROR'  : 0,
        'NONE'   : -1,
    },
    'colors': {
        'ALL'    : 'blue',
        'DEBUG'  : 'cyan',
        'INFO'   : 'green',
        'WARNING': 'yellow',
        'ERROR'  : 'red',
    }
}
LOG_TEXT_FIELDS = [
    # 'appName',
    # 'subAppName',
    'subAppNameShort',
    # 'processType',
    'processTypeShort',
    # 'pid',
    # 'timestamp',
    # 'timestampMs',
    # 'timestampHumanized',
    'timestampShort',
    'lineNo',
    # 'upTime',
    # 'level',
    'levelShort',
    'hostname',
    'queue',
    # 'taskId',
    'taskIdShort',
    'task',
    # 'origin',
    # 'userId',
    # 'userIdShort',
    # 'username',
    # 'clientIP',
    # 'clientId',
    'diffTime',
    'costTime',
]
LOG_TEXT_COLOR_MAP = {
    'appName'           : True,
    'subAppName'        : True,
    'subAppNameShort'   : True,
    'processType'       : True,
    'processTypeShort'  : True,
    'pid'               : True,
    'timestamp'         : True,
    'timestampMs'       : True,
    'timestampHumanized': True,
    'timestampShort'    : True,
    'lineNo'            : True,
    'upTime'            : True,
    'level'             : True,
    'levelShort'        : True,
    'hostname'          : True,
    'queue'             : 'yellow',
    'queueShort'        : 'yellow',
    'taskId'            : 'yellow',
    'taskIdShort'       : 'yellow',
    'task'              : 'yellow',
    'origin'            : 'yellow',
    'userId'            : 'cyan',
    'userIdShort'       : 'cyan',
    'username'          : 'cyan',
    'clientId'          : 'green',
    'clientIP'          : 'green',
    'diffTime'          : 'cyan',
    'costTime'          : 'cyan',
}
LOG_JSON_FIELD_MAP = {
    'appName'           : 'app',
    'subAppName'        : 'sub_app',
    # 'subAppNameShort'   : 'sub_app_short',
    # 'processType'       : 'process_type',
    'processTypeShort'  : 'process_type_short',
    'pid'               : 'pid',
    # 'timestamp'         : 'timestamp',
    'timestampMs'       : 'timestamp',
    'timestampHumanized': 'timestamp_humanized',
    # 'timestampShort'    : 'timestamp_short',
    'lineNo'            : 'line_no',
    'upTime'            : 'up_time',
    'level'             : 'level',
    # 'levelShort'        : 'level_short',
    'hostname'          : 'hostname',
    'queue'             : 'queue',
    'queueShort'        : 'queue_short',
    'taskId'            : 'task_id',
    # 'taskIdShort'       : 'task_id_short',
    'task'              : 'task',
    'origin'            : 'origin',
    'userId'            : 'user_id',
    # 'userIdShort'       : 'user_id_short',
    'username'          : 'username',
    'clientId'          : 'client_id',
    'clientIP'          : 'client_ip',
    'diffTime'          : 'diff_time',
    'costTime'          : 'cost_time',
}
MAX_STAGED_LOGS = 3000

class LoggingFormatter(logging.Formatter):
    def __init__(self, fmt=None, datefmt=None, **options):
        super().__init__(fmt, datefmt)

        self.options = options or {}

    def format(self, record):
        message = record.msg['message']
        meta    = record.msg['meta']

        output_content = None

        if self.options.get('json'):
            log_content_json = {}
            for field, k in LOG_JSON_FIELD_MAP.items():
                log_content_json[k] = meta[field]

            log_content_json['message'] = message

            output_content = toolkit.json_dumps(log_content_json)

        else:
            log_content_arr = [];
            for field in LOG_TEXT_FIELDS:
                # Detect field color
                field_color = LOG_TEXT_COLOR_MAP[field]
                if meta['level'] == 'ERROR':
                    field_color = LOG_LEVELS['colors']['ERROR']
                elif field_color is True:
                    field_color = LOG_LEVELS['colors'][meta['level']]

                # Pretty field
                field_value = meta.get(field) or ''
                if field == 'pid':
                    field_value = f'PID:{field_value}'

                elif field == 'lineNo':
                    field_value = f"L{str(field_value).rjust(4, '0')}"

                elif field == 'upTime':
                    field_value = f'UP {field_value or 0}s'

                elif field == 'costTime':
                    field_value = f'{field_value or 0}ms'

                elif field == 'diffTime':
                    field_value = f'+{field_value or 0}ms'

                elif field == 'userId' or field == 'userIdShort':
                    field_value = field_value or 'NON_USER_ID'

                elif field == 'username':
                    field_value = f'@{field_value or "NON_USERNAME"}'

                field_value = f'[{field_value}]'

                # Add color
                if self.options.get('color') and hasattr(colors, field_color):
                    field_value = str(colors.__getattr__(field_color)(field_value))

                log_content_arr.append(field_value)

            log_content_arr.append(message)

            output_content = ' '.join(log_content_arr)

        return output_content

LOGGER = logging.getLogger(CONFIG['APP_NAME'])
LOGGER.setLevel(logging.DEBUG)
LOGGER.propagate = False

# Add console logger
console_handler = logging.StreamHandler(stream=sys.stdout)
console_handler.setFormatter(LoggingFormatter(color=CONFIG['LOG_CONSOLE_COLOR'], json=False))
LOGGER.addHandler(console_handler)

# Add file logger
if CONFIG['LOG_FILE_PATH']:
    log_dir = os.path.dirname(CONFIG['LOG_FILE_PATH'])
    os.makedirs(log_dir, exist_ok=True)
    pathlib.Path(CONFIG['LOG_FILE_PATH']).touch()

    file_handler = logging.FileHandler(filename=CONFIG['LOG_FILE_PATH'])
    file_handler.setFormatter(LoggingFormatter(color=False, json=CONFIG['LOG_FILE_FORMAT'] == 'json'))
    LOGGER.addHandler(file_handler)

def get_sub_app_name(short=False):
    exec_name = os.path.basename(sys.argv[0])
    if exec_name == 'app.py':
        return 'Worker' if short is False else 'WRK'
    elif exec_name == 'beat.py':
        return 'Beat' if short is False else 'BEAT'
    else:
        return 'UKWN'

class LogHelper(object):
    '''
    Logger helper
    '''
    def __init__(self, task=None):
        self.task = task or toolkit.FakeTask()

        self.level = CONFIG['LOG_LEVEL']

        self._line_no       = 0
        self._base_time     = int(time.time() * 1000)
        self._prev_log_time = None
        self._staged_logs   = []

    def log(self, level, message):
        if not isinstance(level, str) or level.upper() not in LOG_LEVELS['levels']:
            if level:
                level = 'ERROR'
            else:
                level = 'INFO'
        else:
            level = level.upper()

        self._line_no += 1

        now_ms    = int(time.time() * 1000)
        now       = int(now_ms / 1000)
        now_str   = arrow.get(now).to(CONFIG['TIMEZONE']).format('YYYY-MM-DD HH:mm:ss')
        now_short = now_str[5:]

        pid = os.getpid()
        process_type = 'MAIN' if pid == MAIN_PID else 'SUB'

        message = toolkit.mask_auth_url(f'{message}')

        log_line = {
            'message': message,
            'meta': {
                'pid'               : pid,
                'appName'           : CONFIG['APP_NAME'],
                'subAppName'        : get_sub_app_name(),
                'subAppNameShort'   : get_sub_app_name(short=True),
                'processType'       : process_type,
                'processTypeShort'  : process_type[0],
                'upTime'            : toolkit.sys_up_time(),
                'level'             : level,
                'levelShort'        : level[0],
                'timestamp'         : now,
                'timestampMs'       : now_ms,
                'timestampHumanized': now_str,
                'timestampShort'    : now_short,
                'lineNo'            : self._line_no,
                'hostname'          : HOSTNAME,
                'queue'             : f'#{self.task.queue}',
                # 'clientIP'          : meta_extra.get('clientIP'),
                # 'clientId'          : meta_extra.get('clientId'),
                'taskId'            : self.task.task_id,
                'taskIdShort'       : toolkit.get_short_id(self.task.task_id),
                'task'              : self.task.name,
                'diffTime'          : now_ms - (self._prev_log_time or self._base_time),
                'costTime'          : now_ms - self._base_time,
                # 'userId'            : meta_extra.get('userId'),
                # 'userIdShort'       : toolkit.get_short_id(meta_extra.get('userId', '')) or None,
                # 'username'          : meta_extra.get('username'),
            }
        }

        self._prev_log_time = now_ms

        if self.level == 'ALL':
            self._output(log_line)
            self._stage(log_line)

        else:
            if LOG_LEVELS['levels'][level] > LOG_LEVELS['levels'][self.level]:
                self._stage(log_line)

            elif level != 'ERROR':
                self._output(log_line)
                self._stage(log_line)

            else:
                self._recur()
                self._output(log_line)

                self.level = 'ALL'

    def __getattr__(self, level):
        if level.upper() not in LOG_LEVELS['levels']:
            raise AttributeError(f"'{self.__class__.__name__}' does not support the level '{level}'")

        def _f(*args):
            return self.log(level, *args)

        return _f

    def _stage(self, log_line):
        self._staged_logs.append(log_line)
        if len(self._staged_logs) > MAX_STAGED_LOGS:
            self._staged_logs = self._staged_logs[-1 * MAX_STAGED_LOGS:]

    def _recur(self):
        for log_line in self._staged_logs:
            log_line['message'] =  '[RECUR] ' + log_line.get('message', '')
            self._output(log_line)

        self._staged_logs = []

    def _output(self, log_line):
        return LOGGER.log(
                logging.__getattribute__(log_line['meta']['level']),
                log_line)
