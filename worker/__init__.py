# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import socket
import multiprocessing
import signal
import time
import traceback

# 3rd-party Modules
import psutil
import timeout_decorator

# Project Modules
from worker.utils import yaml_resources, toolkit

# Init
BASE_PATH  = os.path.dirname(os.path.abspath(__file__))
CONFIG     = yaml_resources.load_config(os.path.join(BASE_PATH, '../config.yaml'))
CONST      = yaml_resources.load_file('CONST', os.path.join(BASE_PATH, '../const.yaml'))
IMAGE_INFO = yaml_resources.load_file('IMAGE_INFO', os.path.join(BASE_PATH, '../image-info.json'))

# Must be imported after Config, Const is loaded.
from worker.utils.log_helper import LogHelper
from worker.utils.extra_helpers import RedisHelper, FuncMySQLHelper, FuncPostgreSQLHelper

def get_sys_helpers():
    logger = LogHelper()

    cache_db  = RedisHelper(logger=logger)
    cache_db.skip_log = CONFIG['MODE'] == 'prod'

    db = None
    if CONFIG.get('DB_ENGINE') == 'postgresql':
        db = FuncPostgreSQLHelper(logger=logger)
    else:
        db = FuncMySQLHelper(logger=logger)

    db.skip_log = CONFIG['MODE'] == 'prod'

    return logger, cache_db, db

LOGGER, CACHE_DB, DB = get_sys_helpers()

# Listinging queues
LISTINGING_QUEUES = []

# System monitor
WORKER_ID         = None
MAIN_PROCESS      = None
CHILD_PROCESS_MAP = {} # PID -> Process
HEARTBEAT_COUNT   = 0

exec_filename = os.path.basename(sys.argv[0])
if exec_filename == 'app.py':
    LISTINGING_QUEUES = sys.argv[1:]
    if not LISTINGING_QUEUES:
        LISTINGING_QUEUES = list(range(CONFIG['_WORKER_QUEUE_COUNT']))

    LISTINGING_QUEUES = list(set(map(lambda x: int(x), LISTINGING_QUEUES)))
    LISTINGING_QUEUES.sort()

    WORKER_ID = f'WORKER-{toolkit.gen_time_serial_seq()}'

class SysRedisCheckException(Exception):
    pass

class SysDBCheckException(Exception):
    pass

@timeout_decorator.timeout(CONFIG['_SYS_REDIS_CHECK_TIMEOUT'], timeout_exception=SysRedisCheckException)
def check_sys_redis(logger, cache_db, interval=None):
    # Limit
    if interval and not toolkit.TriggerLimit.is_free('sysRedisCheck', interval):
        return

    try:
        if cache_db:
            cache_db.check()

    except Exception as e:
        # Wrap error
        e = SysRedisCheckException(f'System Redis check failed: {repr(e)}')
        raise e

@timeout_decorator.timeout(CONFIG['_SYS_DB_CHECK_TIMEOUT'], timeout_exception=SysDBCheckException)
def check_sys_db(logger, db, interval=None):
    # Limit
    if interval and not toolkit.TriggerLimit.is_free('sysDBCheck', interval):
        return

    try:
        if db:
            db.check()

    except Exception as e:
        # Wrap error
        e = SysDBCheckException(f'System DB check failed: {repr(e)}')
        raise e

def check_restart_flag(global_context):
    # Limit
    if not toolkit.TriggerLimit.is_free('restartFlag', CONFIG['_RESTART_FLAG_CHECK_INTERVAL']):
        return

    # Non-duplication of checks
    if global_context.get('shutdownEvent'):
        return

    cache_key = toolkit.get_global_cache_key('tempFlag', 'restartAllWorkersAndBeat')
    restart_flag_time = CACHE_DB.get(cache_key)

    if not restart_flag_time:
        return

    restart_flag_time = int(restart_flag_time)
    if restart_flag_time <= toolkit.sys_start_time():
        return

    LOGGER.warning(f'Flag `restartAllWorkersAndBeat` is set at {toolkit.to_iso_datetime(restart_flag_time)}, all Workers and Beat will exit soon...')
    global_context['shutdownEvent'] = 'restartFlag'

def heartbeat():
    # Limit
    if not toolkit.TriggerLimit.is_free('heartbeat', CONFIG['_HEARTBEAT_INTERVAL']):
        return

    global MAIN_PROCESS
    global HEARTBEAT_COUNT

    HEARTBEAT_COUNT += 1
    LOGGER.debug(f'[HEARTBEAT] Count: {HEARTBEAT_COUNT}')

    # Init
    now      = toolkit.get_timestamp()
    hostname = socket.gethostname()

    if MAIN_PROCESS is None:
        MAIN_PROCESS = psutil.Process()
        MAIN_PROCESS.cpu_percent(interval=1)

    # Record host, PID, started services
    service_name = sys.argv[0].split('/').pop()
    if 'beat.py' == service_name:
        service_name = 'beat'
    elif 'app.py' == service_name:
        service_name = 'worker'

    redis_timestamp_ms = CACHE_DB.get_timestamp_ms()
    local_timestamp_ms = toolkit.get_timestamp_ms()

    service_info = {
        'ts'        : now,
        'name'      : service_name,
        'version'   : IMAGE_INFO['VERSION'],
        'edition'   : IMAGE_INFO['EDITION'],
        'uptime'    : toolkit.sys_up_time(),
        'timeDiffMs': local_timestamp_ms - redis_timestamp_ms
    }

    if service_name == 'worker':
        service_info['queues'] = LISTINGING_QUEUES

    cache_key   = toolkit.get_monitor_cache_key('heartbeat', 'serviceInfo')
    cache_field = toolkit.get_colon_tags([ 'hostname', hostname, 'pid', os.getpid() ])
    CACHE_DB.hset(cache_key, cache_field, toolkit.json_dumps(service_info))

    # Record the number of workers/processes per queue
    if LISTINGING_QUEUES and WORKER_ID:
        for q in LISTINGING_QUEUES:
            # Record the number of worker processes in this queue.
            cache_key = toolkit.get_monitor_cache_key('heartbeat', 'workerOnQueue')
            queue_worker_id = toolkit.get_colon_tags(['workerQueue', q, 'workerId', WORKER_ID])
            cache_data = { 'ts': now, 'processCount': CONFIG['_WORKER_CONCURRENCY'] }
            CACHE_DB.hset(cache_key, queue_worker_id, toolkit.json_dumps(cache_data))

            # Reload the number of processes of all workers in this queue.
            queue_worker_id_pattern = toolkit.get_colon_tags(['workerQueue', q, 'workerId', '*'])
            worker_process_count_map = CACHE_DB.hget_pattern_expires(cache_key, queue_worker_id_pattern, CONFIG['_MONITOR_REPORT_EXPIRES'])
            if not worker_process_count_map:
                continue

            # Compute the number of workers / work processes in the current queue.
            worker_count  = 0
            process_count = 0
            for queue_worker_id, cache_data in worker_process_count_map.items():
                worker_count  += 1
                process_count += cache_data.get('processCount') or 0

            # Compute and cache the number of workers per queue.
            # NOTE Fixed number of members, can be filtered when getting, no need to clean up expired, expired data
            cache_key = toolkit.get_monitor_cache_key('heartbeat', 'workerCountOnQueue')
            cache_data = { 'ts': now, 'workerCount': worker_count }
            CACHE_DB.hset(cache_key, q, toolkit.json_dumps(cache_data))

            # Compute and cache the number of worker processes per queue.
            # NOTE Fixed number of members, can be filtered when getting, no need to clean up expired, expired data
            cache_key = toolkit.get_monitor_cache_key('heartbeat', 'processCountOnQueue')
            cache_data = { 'ts': now, 'processCount': process_count }
            CACHE_DB.hset(cache_key, q, toolkit.json_dumps(cache_data))

    # Record usage of CPU / Memory
    total_cpu_percent = MAIN_PROCESS.cpu_percent()
    total_memory_pss  = MAIN_PROCESS.memory_full_info().pss

    # Update the child-process list
    child_process_map = dict([(p.pid, p) for p in MAIN_PROCESS.children()])

    # Remove child-processes that no longer exist
    for pid in list(CHILD_PROCESS_MAP.keys()):
        if pid not in child_process_map:
            CHILD_PROCESS_MAP.pop(pid, None)

    # Add new child-processes
    for pid in list(child_process_map.keys()):
        if pid not in CHILD_PROCESS_MAP:
            p = child_process_map[pid]
            p.cpu_percent(interval=1)
            CHILD_PROCESS_MAP[pid] = p

    # Statistics
    for p in CHILD_PROCESS_MAP.values():
        try:
            total_cpu_percent += p.cpu_percent()
            total_memory_pss  += p.memory_full_info().pss

        except psutil.ZombieProcess as e:
            pass

    hostname          = socket.gethostname()
    total_cpu_percent = round(total_cpu_percent, 2)

    cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', [ 'metric', 'workerCPUPercent', 'hostname', hostname ])
    CACHE_DB.ts_add(cache_key, total_cpu_percent, timestamp=now)

    cache_key = toolkit.get_monitor_cache_key('monitor', 'systemMetrics', [ 'metric', 'workerMemoryPSS', 'hostname', hostname ])
    CACHE_DB.ts_add(cache_key, total_memory_pss, timestamp=now)

def run_background(func, pool_size=1, max_tasks=-1):
    manager = multiprocessing.Manager()
    global_context = manager.dict()

    try:
        # Signal handler
        def signal_handler(signum, frame):
            signal_name = signal.Signals(signum).name
            LOGGER.warning(f'Received {signal_name}')

            global_context['shutdownEvent'] = 'signal'
            global_context['signalName']    = signal_name

        signal.signal(signal.SIGTERM, signal_handler)

        # Func wrap
        def func_wrap(context):
            _LOGGER, _CACHE_DB, _DB = get_sys_helpers()

            # Restarting the process after running a number of tasks
            ran_tasks = 0
            while max_tasks <= 0 or ran_tasks <= max_tasks:
                try:
                    # Check system Redis
                    check_sys_redis(_LOGGER, _CACHE_DB)

                    # Check system DB
                    check_sys_db(_LOGGER, _DB)

                    # Check stop events
                    if global_context.get('shutdownEvent'):
                        _LOGGER.warning('Shutdown Event is set, Task Loop exit')
                        break

                    # Run the specified Func
                    ran_tasks += 1
                    func(context)

                except KeyboardInterrupt as e:
                    global_context['shutdownEvent'] = 'keyboard'

                except SysRedisCheckException as e:
                    global_context['shutdownEvent'] = 'sysRedisCheck'

                except SysDBCheckException as e:
                    global_context['shutdownEvent'] = 'sysDBCheck'

                except Exception as e:
                    raise

        # Keep the number of running processes
        pool = []
        worker_process_seq = 0
        while True:
            # Check system Redis
            check_sys_redis(LOGGER, CACHE_DB, interval=CONFIG['_SYS_REDIS_CHECK_INTERVAL'])

            # Check restart flag
            check_restart_flag(global_context)

            # Heartbeat
            heartbeat()

            if global_context.get('shutdownEvent'):
                LOGGER.warning('Shutdown Event is set, Process Pool Loop exit')
                break

            for p in pool:
                if not p.is_alive():
                    p.join(10)
                    pool.remove(p)

            while len(pool) < pool_size:
                p = multiprocessing.Process(name=f'WorkerProc-{worker_process_seq}', target=func_wrap, args=[ global_context ])
                p.start()
                pool.append(p)

                worker_process_seq += 1

            # Wait
            time.sleep(1)

    except KeyboardInterrupt as e:
        global_context['shutdownEvent'] = 'keyboard'

    except SysRedisCheckException as e:
        global_context['shutdownEvent'] = 'sysRedisCheck'

    except SysDBCheckException as e:
        global_context['shutdownEvent'] = 'sysDBCheck'

    except Exception as e:
        global_context['shutdownEvent'] = 'unexpectedError'

        LOGGER.error(f'Unexpected: {repr(e)}')
        for line in traceback.format_exc().splitlines():
            LOGGER.error(line)

        raise

    finally:
        # Clean up
        for p in pool:
            LOGGER.warning(f'Kill Process: {p}')
            p.kill()

        # NOTE Get data before Manager is closed
        shutdown_event = global_context.get('shutdownEvent')
        signal_name    = global_context.get('signalName')

        # Close Manager
        manager.shutdown()

        # Restart handling
        shutdown_event_handler_map = {
            # Restart flag
            'restartFlag': {
                'logLevel'  : 'warning',
                'logMessage': 'Restart Flag is set, worker will restart soon...',
                'exitMethod': 'sys_exit_restart',
                'delay'     : 0,
            },
            # On signal
            'signal': {
                'logLevel'  : 'warning',
                'logMessage': f'Signal {signal_name} is received, worker exit',
                'exitMethod': 'sys_exit_ok',
            },
            # On keyboard interrupted
            'keyboard': {
                'logLevel'  : 'warning',
                'logMessage': 'Interrupted by keyboard, worker exit',
                'exitMethod': 'sys_exit_ok',
            },
            # Redis check failed
            'sysRedisCheck': {
                'logLevel'    : 'error',
                'logMessage'  : 'System Redis check failed, worker will restart soon...',
                'exitMethod'  : 'sys_exit_restart',
                'restartDelay': 3,
            },
            # DB check failed
            'sysDBCheck': {
                'logLevel'    : 'error',
                'logMessage'  : 'System DB check failed worker will restart soon...',
                'exitMethod'  : 'sys_exit_restart',
                'restartDelay': 3,
            },
            # Unexpected error
            'unexpectedError': {
                'logLevel'  : 'error',
                'logMessage': 'Unexpected error occured, worker exit',
                'exitMethod': 'sys_exit_error',
            },
        }

        handler = shutdown_event_handler_map.get(shutdown_event)
        if not handler:
            handler = shutdown_event_handler_map['unexpectedError']

        getattr(LOGGER, handler['logLevel'])(handler['logMessage'])

        if handler['exitMethod'] == 'sys_exit_restart':
            toolkit.sys_exit_restart(handler.get('restartDelay'))
        else:
            getattr(toolkit, handler['exitMethod'])()
