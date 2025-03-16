# -*- coding: utf-8 -*-

# Built-in Modules
import os
import time
import math

# 3rd-party Modules
import arrow
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

from worker import LOGGER, CACHE_DB, run_background

# System Cron Jobs
from worker.tasks.example          import ExampleSuccess
from worker.tasks.cron_job_starter import CronJobStarter
from worker.tasks.internal         import SystemMetric, FlushDataBuffer, AutoClean, AutoBackupDB, ReloadDataMD5Cache, UpdateWorkerQueueLimit

BEAT_MASTER_LOCK_KEY   = None
BEAT_MASTER_LOCK_VALUE = None

SYSTEM_TASKS_META = [
    # {
    #     # Example
    #     'class'   : ExampleSuccess,
    #     'cronExpr': '*/3 * * * * *',
    # },
    {
        # User Cron Task Starter
        'class'   : CronJobStarter,
        'cronExpr': CONFIG['_CRON_EXPR_CRON_JOB_STARTER'],
    },
    {
        # System Metric
        'class'   : SystemMetric,
        'cronExpr': CONFIG['_CRON_EXPR_SYSTEM_METRIC'],
        'delay'   : 5,
    },
    {
        # Flush buffered data into DB
        'class'   : FlushDataBuffer,
        'cronExpr': CONFIG['_CRON_EXPR_FLUSH_DATA_BUFFER'],
    },
    {
        # Auto Clean
        'class'   : AutoClean,
        'cronExpr': CONFIG['_CRON_EXPR_AUTO_CLEAN'],
    },
    {
        # Auto Backup DB
        'class'   : AutoBackupDB,
        'cronExpr': CONFIG['_CRON_EXPR_AUTO_BACKUP_DB'],
    },
    {
        # Reload Data MD5 Cache
        'class'   : ReloadDataMD5Cache,
        'cronExpr': CONFIG['_CRON_EXPR_RELOAD_DATA_MD5_CACHE'],
        'kwargs'  : { 'lockTime': 15, 'all': True },
    },
    {
        # Work queue length limit for Cron Jobs
        'class'   : UpdateWorkerQueueLimit,
        'cronExpr': CONFIG['_CRON_EXPR_UPDATE_WORKER_QUEUE_LIMIT'],
    },
]

def is_master_beat():
    CACHE_DB.lock(BEAT_MASTER_LOCK_KEY, BEAT_MASTER_LOCK_VALUE, CONFIG['_BEAT_LOCK_EXPIRE'])

    try:
        CACHE_DB.extend_lock_time(BEAT_MASTER_LOCK_KEY, BEAT_MASTER_LOCK_VALUE, CONFIG['_BEAT_LOCK_EXPIRE'])
    except Exception as e:
        # Lock acquired by other process
        return False
    else:
        # Successful renewal of the lock
        return True

def create_system_tasks(t):
    tasks = []
    for meta in SYSTEM_TASKS_META:
        if not toolkit.is_valid_cron_expr(meta['cronExpr']):
            continue

        if toolkit.is_match_cron_expr(meta['cronExpr'], t, tz=CONFIG['TIMEZONE']):
            task = meta['class'](kwargs=meta.get('kwargs'), trigger_time=t, delay=meta.get('delay'), queue=meta.get('queue'))
            tasks.append(task)

    return tasks

class TickTimeout(Exception):
    pass

@timeout_decorator.timeout(60, timeout_exception=TickTimeout)
def tick(context):
    '''
    Timed triggers (triggered every second)

    1. Get registered tasks whose current time meets the Cron expression
    2. Delayed tasks that reach execution time enter the work queue
    '''
    now = CACHE_DB.get_timestamp(3)
    next_timestamp = math.ceil(now)

    # Wait until the whole time.
    if next_timestamp > now:
        time.sleep(next_timestamp - now)

    # Trigger time
    prev_tick_time = context.get('prev_tick_time') or (next_timestamp - 1)
    for tick_time in range(prev_tick_time, next_timestamp):
        tick_time += 1

        # Record the prev tick time
        context['prev_tick_time'] = tick_time

        # Prevent multiple Beat instances being triggered repeatedly
        if not is_master_beat():
            continue

        # Run the system tasks
        tasks = create_system_tasks(tick_time)
        for t in tasks:
            # Create a task request
            task_req = t.create_task_request()
            task_req_dumps = toolkit.json_dumps(task_req, ignore_nothing=True, indent=None)

            # Put Task into queue
            if task_req['delay']:
                # Delayed tasks
                delay_queue = toolkit.get_delay_queue(task_req['queue'])
                eta = task_req['triggerTime'] + task_req['delay']
                CACHE_DB.zadd(delay_queue, { task_req_dumps: eta })

            else:
                # Immediate tasks
                worker_queue = toolkit.get_worker_queue(task_req['queue'])
                CACHE_DB.push(worker_queue, task_req_dumps)

        # Put delayed task into the work queue
        for queue in range(CONFIG['_WORKER_QUEUE_COUNT']):
            src_cache_key  = toolkit.get_delay_queue(queue)
            dest_cache_key = toolkit.get_worker_queue(queue)

            while True:
                released_count = CACHE_DB.zpop_below_lpush_all(src_cache_key, dest_cache_key, tick_time)
                if released_count:
                    LOGGER.info(f'[DELAYED] Released {released_count} tasks (Queue #{queue})')
                else:
                    break

def main():
    # Print tips
    pid = os.getpid()

    print(f'Beat is running (Press CTRL+C to quit)')
    print(f'PID: {pid}')
    print('Have fun!')

    # App init
    app_init.prepare()

    # Beat lock
    global BEAT_MASTER_LOCK_KEY
    global BEAT_MASTER_LOCK_VALUE
    BEAT_MASTER_LOCK_KEY   = toolkit.get_cache_key('lock', 'beatMaster')
    BEAT_MASTER_LOCK_VALUE = toolkit.gen_rand_string()

    # Run background
    run_background(func=tick, max_tasks=3600)

if __name__ == '__main__':
    main()
