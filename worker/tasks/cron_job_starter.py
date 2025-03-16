# -*- coding: utf-8 -*-

'''
Cron Starter
Trigger the Funcs according to the Cron Jobs
'''

# Built-in Modules
import time

# 3rd-party Modules

# Project Modules
from worker.utils import toolkit, yaml_resources
from worker.tasks import BaseTask

CONFIG = yaml_resources.get('CONFIG')

class CronJobStarter(BaseTask):
    name = 'CronJob.Starter'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self._worker_queue_availability = {}

    @property
    def is_paused(self):
        cache_key = toolkit.get_global_cache_key('tempFlag', 'pauseCronJobs')
        flag = self.cache_db.get(cache_key)
        return bool(flag)

    def is_worker_queue_available(self, queue):
        queue = str(queue)

        # Prefer to use loaded data
        if self._worker_queue_availability:
            return self._worker_queue_availability[queue]

        # Read cache
        cache_key = toolkit.get_global_cache_key('cache', 'workerQueueLimitCronJob')
        cache_res = self.cache_db.get(cache_key)

        worker_queue_limit_map = None
        if cache_res:
            worker_queue_limit_map = toolkit.json_loads(cache_res)

        # Check Worker Queue available
        active_queues = list(range(CONFIG['_WORKER_QUEUE_COUNT']))
        for q in active_queues:
            q = str(q)

            worker_queue_limit = worker_queue_limit_map.get(q)
            if not worker_queue_limit:
                # No limit
                self._worker_queue_availability[q] = True

            else:
                # Limited
                # Get current Worker Queue length
                worker_queue        = toolkit.get_worker_queue(q)
                worker_queue_length = int(self.cache_db.llen(worker_queue) or 0)

                self._worker_queue_availability[q] = worker_queue_length < worker_queue_limit

        return self._worker_queue_availability[queue]

    def prepare_cron_jobs(self, cron_jobs):
        cron_job_ids = [ c['id'] for c in cron_jobs]

        # Get pause flag
        cache_key = toolkit.get_global_cache_key('cronJob', 'pause')
        pause_map = self.cache_db.hmget(cache_key, cron_job_ids) or {}

        # Get dynamic cron expression
        cache_key = toolkit.get_global_cache_key('cronJob', 'dynamicCronExpr')
        dynamic_cron_expr_map = self.cache_db.hmget(cache_key, cron_job_ids) or {}

        for c in cron_jobs:
            # Pause flag
            pause_expire_time = pause_map.get(c['id'])
            if pause_expire_time and int(pause_expire_time) >= self.trigger_time:
                c['isPaused'] = True
            else:
                c['isPaused'] = False

            # Dynamic cron expression
            dynamic_cron_expr = dynamic_cron_expr_map.get(c['id'])
            if dynamic_cron_expr:
                dynamic_cron_expr = toolkit.json_loads(dynamic_cron_expr)
                if not dynamic_cron_expr.get('expireTime') or dynamic_cron_expr['expireTime'] >= self.trigger_time:
                    c['dynamicCronExpr'] = dynamic_cron_expr['value']

            # Parse JSON fields
            c['funcCallKwargs']  = c.get('funcCallKwargsJSON')  or {}
            c['funcExtraConfig'] = c.get('funcExtraConfigJSON') or {}

            # Detect finall cron expression
            final_cron_expr = c.get('dynamicCronExpr') or c['funcExtraConfig'].get('fixedCronExpr') or c.get('cronExpr')
            self.logger.debug(f"[PREPARE] CronJob ID: {c['id']}, Cron Expr: {final_cron_expr} <= Dynamic ({c.get('dynamicCronExpr')}) OR Fixed ({c['funcExtraConfig'].get('fixedCronExpr')}) OR Self ({c.get('cronExpr')})")

            c['cronExpr'] = final_cron_expr

        return cron_jobs

    def filter_cron_job(self, c):
        # Skip if is paused
        if c.get('isPaused'):
            return False

        # Skip if no cron expression / invalid cron expression
        cron_expr = c.get('cronExpr')
        if not cron_expr or not toolkit.is_valid_cron_expr(cron_expr):
            return False

        # Skip if cron expression not satisfied
        timezone = c.get('timezone') or CONFIG['TIMEZONE']
        if not toolkit.is_match_cron_expr(cron_expr, self.trigger_time, timezone):
            return False

        return True

    def get_integration_cron_job(self):
        sql = self.db.create_sql_builder()
        sql.SELECT([
            sql.FIELD('func.id',              'funcId'),
            sql.FIELD('func.extraConfigJSON', 'funcExtraConfigJSON'),

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
            'func.integration': 'autoRun',
        })
        sql.ORDER_BY('func.id')

        db_res = self.db.query(sql)

        # Get Integrated Cron Job
        cron_jobs = []
        for d in db_res:
            if not d.get('funcExtraConfigJSON'):
                continue

            cron_expr = None
            try:
                cron_expr = d['funcExtraConfigJSON']['integrationConfig']['cronExpr']
            except KeyError as e:
                pass

            if not cron_expr:
                continue

            # Get Integrated Cron Job cron expression
            d['cronExpr'] = cron_expr

            # Use Func ID as Integrated Cron Job ID
            d['id'] = f"autoRun.cronJob-{d['funcId']}"

            cron_jobs.append(d)

        # Prepare / filter Cron Jobs
        cron_jobs = self.prepare_cron_jobs(cron_jobs)
        cron_jobs = filter(self.filter_cron_job, cron_jobs)

        return cron_jobs

    def fetch_cron_jobs(self, next_seq):
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'cron.seq',
            'cron.id',
            'cron.funcCallKwargsJSON',
            'cron.cronExpr',
            'cron.taskRecordLimit',

            sql.FIELD('func.id',              'funcId'),
            sql.FIELD('func.extraConfigJSON', 'funcExtraConfigJSON'),

            sql.FIELD('sset.title', 'scriptSetTitle'),
            sql.FIELD('scpt.title', 'scriptTitle'),
            sql.FIELD('func.title', 'funcTitle'),
        ])
        sql.FROM('biz_main_cron_job', 'cron')
        sql.JOIN('biz_main_func', 'func', {
            'cron.funcId': 'func.id',
        })
        sql.JOIN('biz_main_script', 'scpt', {
            'scpt.id': 'func.scriptId',
        })
        sql.JOIN('biz_main_script_set', 'sset', {
            'sset.id': 'func.scriptSetId',
        })
        sql.WHERE([
            { 'LEFT': 'cron.seq',        'OP': '>', 'RIGHT': next_seq },
            { 'LEFT': 'cron.isDisabled', 'OP': '=', 'RIGHT': False },
        ])
        sql.WHERE([
            [
                { 'LEFT': 'cron.expireTime', 'OP': '=', 'RIGHT': None },
                { 'LEFT': 'cron.expireTime', 'OP': '>', 'RIGHT': self.trigger_time },
            ]
        ])
        sql.ORDER_BY('cron.seq', 'ASC')
        sql.LIMIT(CONFIG['_CRON_JOB_STARTER_FETCH_BULK_COUNT'])

        cron_jobs = self.db.query(sql)

        # Get seq cursor
        latest_seq = None
        if len(cron_jobs) > 0:
            latest_seq = cron_jobs[-1]['seq']

            # Prepare / filter Cron Jobs
            cron_jobs = self.prepare_cron_jobs(cron_jobs)
            cron_jobs = filter(self.filter_cron_job, cron_jobs)

        return cron_jobs, latest_seq

    def put_tasks(self, tasks, ignore_cron_job_delay=False):
        tasks = toolkit.as_array(tasks)
        if not tasks:
            return

        for g in toolkit.group_by_count(tasks, count=500):
            self.logger.debug(f"[PUT TASK] {', '.join([ t.get('originId') for t in g ])}")

        task_reqs = []
        for t in tasks:
            cron_job  = t.get('cronJob')
            origin    = t.get('origin')
            origin_id = t.get('originId')
            delay     = t.get('delay') or 0
            exec_mode = t.get('execMode', 'cronJob')

            # Timeout / expires
            timeout = cron_job['funcExtraConfig'].get('timeout') or CONFIG['_FUNC_TASK_TIMEOUT_DEFAULT']
            expires = cron_job['funcExtraConfig'].get('expires') or CONFIG['_FUNC_TASK_EXPIRES_DEFAULT']

            # Detect Worker Queue
            queue = cron_job['funcExtraConfig'].get('queue') or CONFIG['_FUNC_TASK_QUEUE_CRON_JOB']

            # Check if Worker Queue is available or not
            if not self.is_worker_queue_available(queue):
                continue

            # Delayed Cron Job
            cron_job_delay_list = cron_job['funcExtraConfig'].get('delayedCronJob')
            cron_job_delay_list = toolkit.as_array(cron_job_delay_list)
            if not cron_job_delay_list or ignore_cron_job_delay:
                cron_job_delay_list = [ 0 ]

            for cron_job_delay in cron_job_delay_list:
                # Lock for Cron Job
                cron_job_lock_key = toolkit.get_cache_key('lock', 'CronJob', tags=[
                        'cronJobId', cron_job['id'],
                        'funcId',    cron_job['funcId'],
                        'execMode',  exec_mode])

                cron_job_lock_value = f"{int(time.time())}-{toolkit.gen_uuid()}"

                # Task request
                task_reqs.append({
                    'name': 'Func.Runner',
                    'kwargs': {
                        'funcId'          : cron_job['funcId'],
                        'funcCallKwargs'  : cron_job['funcCallKwargs'],
                        'origin'          : origin,
                        'originId'        : origin_id,
                        'cronExpr'        : cron_job['cronExpr'],
                        'cronJobDelay'    : cron_job_delay,
                        'cronJobLockKey'  : cron_job_lock_key,   # Lock / unlock later in Func.Runner
                        'cronJobLockValue': cron_job_lock_value, # Lock / unlock later in Func.Runner
                        'cronJobExecMode' : exec_mode,

                        'scriptSetTitle': cron_job['scriptSetTitle'],
                        'scriptTitle'   : cron_job['scriptTitle'],
                        'funcTitle'     : cron_job['funcTitle'],
                    },

                    'triggerTime': self.trigger_time,

                    'queue'          : queue,
                    'delay'          : cron_job_delay + delay,
                    'timeout'        : timeout,
                    'expires'        : cron_job_delay + delay + expires,
                    'taskRecordLimit': cron_job.get('taskRecordLimit'),
                })

        if task_reqs:
            self.cache_db.put_tasks(task_reqs)

    def run(self, **kwargs):
        # All Cron Jobs are paused
        if self.is_paused:
            self.logger.debug(f"[FLAG] Cron Jobs paused.")
            return

        # Lock
        self.lock(max_age=60)

        ### Integrated Cron Job ###
        tasks = []
        for c in self.get_integration_cron_job():
            tasks.append({
                'cronJob' : c,
                'origin'  : 'integration',
                'originId': c['id']
            })

        # Send Task
        if tasks:
            self.put_tasks(tasks)

        ### Cron Jobs ###
        next_seq = 0
        while next_seq is not None:
            cron_jobs, next_seq = self.fetch_cron_jobs(next_seq)

            tasks = []
            for c in cron_jobs:
                # Distribute Tasks according to their seq
                delay = 0
                if CONFIG['_FUNC_TASK_DISTRIBUTION_RANGE'] > 0:
                    delay = c['seq'] % CONFIG['_FUNC_TASK_DISTRIBUTION_RANGE']

                tasks.append({
                    'cronJob' : c,
                    'origin'  : 'cronJob',
                    'originId': c['id'],
                    'delay'   : delay,
                })

            # Send Task
            if tasks:
                self.put_tasks(tasks)

class CronJobManualStarter(CronJobStarter):
    name = 'CronJob.ManualStarter'

    def get_cron_job(self, cron_job_id):
        sql = self.db.create_sql_builder()
        sql.SELECT([
            'cron.seq',
            'cron.id',
            'cron.funcCallKwargsJSON',
            'cron.cronExpr',
            'cron.taskRecordLimit',

            sql.FIELD('func.id',              'funcId'),
            sql.FIELD('func.extraConfigJSON', 'funcExtraConfigJSON'),

            sql.FIELD('sset.title', 'scriptSetTitle'),
            sql.FIELD('scpt.title', 'scriptTitle'),
            sql.FIELD('func.title', 'funcTitle'),
        ])
        sql.FROM('biz_main_cron_job', 'cron')
        sql.JOIN('biz_main_func', 'func', {
            'cron.funcId': 'func.id',
        })
        sql.JOIN('biz_main_script', 'scpt', {
            'scpt.id': 'func.scriptId',
        })
        sql.JOIN('biz_main_script_set', 'sset', {
            'sset.id': 'func.scriptSetId',
        })
        sql.WHERE({
            'cron.id': cron_job_id,
        })
        sql.LIMIT(1)

        cron_jobs = self.db.query(sql)
        if not cron_jobs:
            return None

        cron_jobs = self.prepare_cron_jobs(cron_jobs)
        return cron_jobs[0]

    def run(self, **kwargs):
        cron_job_id = kwargs.get('cronJobId')

        # Get Cron Job to trigger
        cron_job = self.get_cron_job(cron_job_id)

        # Send Task
        task = {
            'cronJob' : cron_job,
            'origin'  : 'cronJob',
            'originId': cron_job['id'],
            'execMode': 'manual',
        }
        self.put_tasks(task, ignore_cron_job_delay=True)
