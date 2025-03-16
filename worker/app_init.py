# -*- coding: utf-8 -*-

# Built-in Modules
import os

# Project Modules
from worker import LOGGER, CACHE_DB
from worker.utils import toolkit, yaml_resources
from worker.tasks.internal import SystemMetric, AutoBackupDB, ReloadDataMD5Cache, AutoRun, AutoClean, UpdateWorkerQueueLimit, MigrationDataFix

CONFIG = yaml_resources.get('CONFIG')

def prepare():
    # Init toolkit
    APP_NAME_SERVER  = CONFIG['APP_NAME'] + '-server'
    APP_NAME_WORKER  = CONFIG['APP_NAME'] + '-worker'
    APP_NAME_MONITOR = CONFIG['APP_NAME'] + '-monitor'
    APP_NAME_GLOBAL  = CONFIG['APP_NAME'] + '-global'

    def get_cache_key(topic, name, tags=None, app_name=None):
        cache_key = toolkit._get_cache_key(topic, name, tags)

        # Add app name to cache key
        app_name = app_name or APP_NAME_WORKER
        cache_key_with_app_name = f'{app_name}#{cache_key}'
        return cache_key_with_app_name

    toolkit.get_cache_key = get_cache_key

    def get_server_cache_key(topic, name, tags=None):
        return toolkit.get_cache_key(topic, name, tags, APP_NAME_SERVER)

    toolkit.get_server_cache_key = get_server_cache_key

    def get_monitor_cache_key(topic, name, tags=None):
        return toolkit.get_cache_key(topic, name, tags, APP_NAME_MONITOR)

    toolkit.get_monitor_cache_key = get_monitor_cache_key

    def get_global_cache_key(topic, name, tags=None):
        return toolkit.get_cache_key(topic, name, tags, APP_NAME_GLOBAL)

    toolkit.get_global_cache_key = get_global_cache_key

    def parse_cache_key(cache_key):
        cache_key_info = toolkit._parse_cache_key(cache_key)

        app_name_topic_parts = cache_key_info['topic'].split('#')
        cache_key_info['appName'] = app_name_topic_parts[0]
        cache_key_info['topic']   = app_name_topic_parts[1]

        return cache_key_info

    toolkit.parse_cache_key = parse_cache_key

    def get_worker_queue(name):
        worker_queue = f'{APP_NAME_WORKER}#{toolkit._get_worker_queue(name)}'
        return worker_queue

    toolkit.get_worker_queue = get_worker_queue

    def get_delay_queue(name):
        worker_queue = f'{APP_NAME_WORKER}#{toolkit._get_delay_queue(name)}'
        return worker_queue

    toolkit.get_delay_queue = get_delay_queue

    # Run automatically on startup
    if not CONFIG['_DISABLE_STARTUP_TASKS']:
        CACHE_DB.put_tasks([
            { 'name': SystemMetric.name },
            { 'name': UpdateWorkerQueueLimit.name },
            { 'name': MigrationDataFix.name },
            { 'name': ReloadDataMD5Cache.name, 'kwargs': { 'lockTime': 15, 'all': True } },
            { 'name': AutoRun.name,   'delay': 5 },
            { 'name': AutoClean.name, 'delay': 15 },
        ])
