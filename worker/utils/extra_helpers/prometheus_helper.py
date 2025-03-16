# -*- coding: utf-8 -*-

# Built-in Modules
import urllib
import traceback

# 3rd-party Modules
import requests
import arrow

# Project Modules
from . import parse_http_resp

def get_config(c):
    config = {
        'host'    : c.get('host') or '127.0.0.1',
        'port'    : c.get('port') or 9090,
        'user'    : c.get('user'),
        'password': c.get('password'),
        'protocol': c.get('protocol') or 'http',
    }
    return config

class PrometheusHelper(object):
    def __init__(self, logger, config=None, *args, **kwargs):
        self.logger = logger

        config = get_config(config)
        session = requests.Session()

        if config['user'] and config['password']:
            session.auth   = requests.auth.HTTPBasicAuth(config['user'], config['password'])
            session.verify = False

        self.config = config
        self.client = session

    def __del__(self):
        if not self.client:
            return

        try:
            self.client.close()

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

        finally:
            self.client = None

    def check(self):
        try:
            query = {
                'query': 'up',
                'start': arrow.get().isoformat(),
                'end'  : arrow.get().shift(seconds=-1).isoformat(),
                'step' : '15s'
            }
            self.query('get', '/api/v1/query_range', query=query)

        except Exception as e:
            for line in traceback.format_exc().splitlines():
                self.logger.error(line)

            raise

    def query(self, method, path=None, query=None, body=None):
        if path is None:
            method, path = method.split(' ', 1)

        if not path.startswith('/'):
            path = '/' + path

        url = '{protocol}://{host}:{port}'.format(**self.config) + path

        params = {}
        if query:
            params.update(query)

        # Adjust start, end automatically
        if 'start' in params and 'end' in params:
            start = params['start']
            end   = params['end']

            try:
                start_value = arrow.get(start).float_timestamp
                end_value   = arrow.get(end).float_timestamp

            except Exception as e:
                pass

            else:
                start_value, end_value = sorted([ start_value, end_value ])

                params['start'] = arrow.get(start_value).isoformat()
                params['end']   = arrow.get(end_value).isoformat()

        r = self.client.request(method=method, url=url, params=params, json=body)
        parsed_resp = parse_http_resp(r)

        if r.status_code >= 400:
            e = Exception(r.status_code, r.text)
            raise e

        return parsed_resp

    def guance_dql_like_query(self, query_statement, options=None):
        options = options or {}

        # Build query statements
        query = {
            'query': query_statement,
            'start': arrow.get(options['start'] / 1000).isoformat(),
            'end'  : arrow.get(options['end']   / 1000).isoformat(),
            'step' : options.get('prometheus_step') or CONFIG['GUANCE_DQL_LIKE_QUERY_PROMETHEUS_STEP_DEFAULT'],
        }

        # Run query
        res = self.query('GET', '/api/v1/query_range', query=query)

        # Convert
        series_list = []
        for r in res['data']['result']:
            col  = r['metric'].pop('__name__')
            tags = r['metric']

            s = {
                'columns': [ 'time', col ],
                'tags'   : tags,
                'values' : r['values'],
            }

            # Convert time to milliseconds
            for v in s['values']:
                v[0] = int(v[0] * 1000)

            series_list.append(s)

        guance_dql_like_res = {
            'series': [ series_list ],

            'executedQueryStatement': f"GET /api/v1/query_range?{urllib.parse.urlencode(query)}",
        }
        return guance_dql_like_res
