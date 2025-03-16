# -*- coding: utf-8 -*-

# Built-in Modules
import os
import sys
import socket
import ssl
import urllib

# 3rd-party Modules
import timeout_decorator

# Disable InsecureRequestWarning
import requests
from requests.packages.urllib3.exceptions import InsecureRequestWarning
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

# Project Modules
from worker.utils import yaml_resources, toolkit

# Init
from worker import app_init

CONFIG = yaml_resources.get('CONFIG')

from worker import LOGGER, CACHE_DB, LISTINGING_QUEUES, run_background
from worker.tasks import TaskTimeout

from worker.tasks.example          import ExampleSuccess, ExampleFailure, ExampleTimeout
from worker.tasks.cron_job_starter import CronJobStarter, CronJobManualStarter
from worker.tasks.func.debugger    import FuncDebugger
from worker.tasks.func.runner      import FuncRunner
from worker.tasks.internal         import SystemMetric, FlushDataBuffer, AutoClean, AutoBackupDB, ReloadDataMD5Cache, CheckConnector, QueryConnector, AutoRun, UpdateWorkerQueueLimit, MigrationDataFix

TASK_CLS_MAP = {
    # Example
    ExampleSuccess.name: ExampleSuccess,
    ExampleFailure.name: ExampleFailure,
    ExampleTimeout.name: ExampleTimeout,

    # Cron Job Tasks
    CronJobStarter.name      : CronJobStarter,
    CronJobManualStarter.name: CronJobManualStarter,

    # Func Running Tasks
    FuncDebugger.name: FuncDebugger,
    FuncRunner.name  : FuncRunner,

    # Internal Tasks
    SystemMetric.name          : SystemMetric,
    FlushDataBuffer.name       : FlushDataBuffer,
    AutoClean.name             : AutoClean,
    AutoBackupDB.name          : AutoBackupDB,
    ReloadDataMD5Cache.name    : ReloadDataMD5Cache,
    CheckConnector.name        : CheckConnector,
    QueryConnector.name        : QueryConnector,
    AutoRun.name               : AutoRun,
    UpdateWorkerQueueLimit.name: UpdateWorkerQueueLimit,
    MigrationDataFix.name      : MigrationDataFix,
}

class BadTaskReq(Exception):
    pass

def consume(context):
    '''
    Consume tasks in the queue
    '''
    # Get the task
    cache_keys = list(map(lambda q: toolkit.get_worker_queue(q), LISTINGING_QUEUES))
    cache_res = CACHE_DB.bpop(cache_keys, timeout=CONFIG['_WORKER_FETCH_TASK_TIMEOUT'])
    if not cache_res:
        return

    worker_queue, task_req_dumps = cache_res
    task_req = toolkit.json_loads(task_req_dumps)

    # Generate task objects
    if not isinstance(task_req, dict):
        e = BadTaskReq(repr(task_req))
        raise e

    task_name = task_req['name']
    task_cls = TASK_CLS_MAP.get(task_name)
    if not task_cls:
        LOGGER.warning(f'No such task: {task_name}')
        return

    task_inst = task_cls.from_task_request(task_req)

    # Run task
    @timeout_decorator.timeout(task_inst.timeout, timeout_exception=TaskTimeout)
    def start_task():
        task_inst.start()

    start_task()

def main():
    # Print tips
    queues = ', '.join(map(lambda q: f'#{q}', LISTINGING_QUEUES))
    pid = os.getpid()

    print(f'Worker is listening on queues {queues} (Press CTRL+C to quit)')
    print(f'PID: {pid}')
    print('Have fun!')

    # App init
    app_init.prepare()

    # Run background
    run_background(func=consume,
                   pool_size=CONFIG['_WORKER_CONCURRENCY'],
                   max_tasks=CONFIG['_WORKER_PROCESS_CONSUME_LIMIT'])
if __name__ == '__main__':
    main()
