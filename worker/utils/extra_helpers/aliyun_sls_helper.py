# -*- coding: utf-8 -*-

# Built-in Modules
import traceback

# 3rd-party Modules
import arrow

# Project Modules
from worker.utils import toolkit, yaml_resources

CONFIG = yaml_resources.get('CONFIG')

def get_config(c):
    config = {
        'endpoint'   : 'cn-hangzhou.log.aliyuncs.com',
        'accessKeyId': c.get('accessKeyId'),
        'accessKey'  : c.get('accessKeySecret'),
    }
    return config

class AliyunSLSHelper(object):
    def __init__(self, logger, config, *args, **kwargs):
        from aliyun.log import LogClient

        self.logger = logger

        self.config = config
        self.client = LogClient(**get_config(config))

    def __del__(self):
        if not self.client:
            return

        self.client = None

    def check(self):
        try:
            self.client.list_project()

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

            raise

    def list_projects(self):
        projects = self.client.list_project().projects
        projects = list(map(lambda x: x['projectName'], projects))
        return projects

    def list_logstores(self, project):
        logstores = self.client.list_logstore(project).logstores
        return logstores

    def query(self, *args, **kwargs):
        res = self.client.get_log(*args, **kwargs)
        logs = res.get_logs()
        logs = list(map(lambda x: { 'contents': x.contents, 'timestamp': x.timestamp }, logs))
        return logs

    def guance_dql_like_list_projects(self):
        projects = self.list_projects()

        # Convert format
        values = []
        for p in projects:
            values.append([ p ])

        guance_dql_like_res = {
            'series': [
                {
                    'columns': [ 'project' ],
                    'values' : values,
                }
            ],

            'executedQueryStatement': f"ListProjects",
        }
        return guance_dql_like_res

    def guance_dql_like_list_logstores(self, project):
        logstores = self.list_logstores(project)

        # Convert format
        values = []
        for l in logstores:
            values.append([ project, l ])

        guance_dql_like_res = {
            'series': [
                {
                    'columns': [ 'project', 'logstore' ],
                    'values' : values,
                }
            ],

            'executedQueryStatement': f"ListLogstores {project}",
        }
        return guance_dql_like_res

    def guance_dql_like_query(self, query_statement, options=None):
        # Special query
        if query_statement == 'CALL:list_projects':
            return self.guance_dql_like_list_projects()

        elif query_statement == 'CALL:list_logstores' or query_statement.startswith('CALL:list_logstores:'):
            # Extract `project` directly from the query statement
            call_parts = query_statement.split(':')
            if len(call_parts) >= 3:
                options['aliyunSLS_project'] = call_parts[2]

            if not options.get('aliyunSLS_project'):
                e = Exception('Parameter `aliyunSLS_project` is required')
                raise e

            return self.guance_dql_like_list_logstores(options['aliyunSLS_project'])

        options = options or {}

        # Check options
        if not options.get('aliyunSLS_project'):
            e = Exception('Parameter `aliyunSLS_project` is required')
            raise e

        if not options.get('aliyunSLS_logstore'):
            e = Exception('Parameter `aliyunSLS_logstore` is required')
            raise e

        # Build query request
        kwargs = {
            'project'  : options['aliyunSLS_project'],
            'logstore' : options['aliyunSLS_logstore'],
            'from_time': int(options['start'] / 1000),
            'to_time'  : int(options['end']   / 1000),
            'query'    : query_statement,
            'size'     : CONFIG['GUANCE_DQL_LIKE_QUERY_LIMIT'],
        }

        # Run query
        res = self.query(**kwargs)

        # Convert format
        series_map = {}
        for r in res:
            tags      = {}
            value_map = { 'time': r['timestamp'] * 1000 }

            for k, v in r['contents'].items():
                if k.startswith('__'):
                    # Internal field
                    if k == '__topic__':
                        # Topic
                        if v:
                            tags['topic'] = v

                    elif k.startswith('__tag__:'):
                        # Tag
                        tag_k = k.split(':')[1]
                        if not tag_k.startswith('__'):
                            tags[tag_k] = v

                else:
                    # Common fields
                    if k not in value_map:
                        value_map[k] = v

            tags_dumps = toolkit.json_dumps(tags)
            if tags_dumps not in series_map:
                series_map[tags_dumps] = []

            series_map[tags_dumps].append(value_map)

        series_list = []
        for tags_dumps, value_map_list in series_map.items():
            s = {
                'columns': [ 'time' ],
                'tags'   : toolkit.json_loads(tags_dumps),
                'values' : [],
            }

            for value_map in value_map_list:
                # Collect fields
                for k in value_map.keys():
                    if k not in s['columns']:
                        s['columns'].append(k)

                # Collect values
                point = []
                for col in s['columns']:
                    point.append(value_map.get(col))

                s['values'].append(point)

            series_list.append(s)

        guance_dql_like_res = {
            'series': [ series_list ],

            'executedQueryStatement': f"GetLogs {toolkit.json_dumps(kwargs)}",
        }

        return guance_dql_like_res
