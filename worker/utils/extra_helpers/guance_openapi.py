# -*- coding: utf-8 -*-

# Built-in Modules
import traceback

# 3rd-party Modules
import requests

# Project Modules
from worker.utils import toolkit
from . import parse_http_resp

class GuanceOpenAPI(object):
    OPENAPI_FUNC_PATH = '/api/v1/outer_function/execute'

    def __init__(self, url, api_key_id, api_key, timeout=10):
        self.url        = url
        self.api_key_id = api_key_id
        self.api_key    = api_key
        self.timeout    = timeout

        self._workspace = None

    @property
    def auth_header(self):
        header = { 'DF-API-KEY': self.api_key_id }
        return header

    @property
    def is_api_key_valid(self):
        try:
            access_key_list = self.do_get(f'/api/v1/workspace/accesskey/list')['content']
            matched_data = filter(lambda d: d['ak'] == self.api_key_id and d['sk'] == self.api_key, access_key_list)
            return len(list(matched_data)) > 0

        except Exception as e:
            return False

    @property
    def is_api_key_match(self):
        '''
        NOTE compatibility: `.is_api_key_match` changed to `.is_api_key_valid`
        '''
        return self.is_api_key_valid

    @property
    def workspace(self):
        '''
        Workspace
        '''
        if not self._workspace:
            self._workspace = self.do_get('/api/v1/workspace/get')['content']

        return self._workspace

    @property
    def workspace_uuid(self):
        '''
        Workspace ID
        '''
        return self.workspace['uuid']

    @property
    def workspace_token(self):
        '''
        Workspace Token
        '''
        return self.workspace['token']

    @property
    def workspace_language(self):
        '''
        Workspace language
        '''
        return self.workspace.get('language') or 'zh'

    def do_get(self, path, query=None):
        '''
        Send GET request
        '''
        url = self.url + path
        resp = requests.get(url=url, params=query, headers=self.auth_header, timeout=self.timeout)
        if resp.status_code >= 400:
            e = Exception(resp.status_code, resp.text)
            raise e

        return resp.json()

    def do_list_get(self, path, query=None, **field_value):
        '''
        Handle some APIs that don't have a corresponding list parameter as get APIs.
        '''
        page_index = 1
        page_size  = 100

        for _ in range(100):
            resp_data = self.do_get(path=path, query=query)

            # Pick `resp.content.data` to `resp.content`
            if isinstance(resp_data['content'], dict):
                resp_data['content'] = resp_data['content']['data']

            # Check data
            for d in resp_data['content']:
                is_matched = True
                for k, v in field_value.items():
                    if d[k] != v:
                        is_matched = False

                if is_matched:
                    return d

            # Paging end
            if len(resp_data['content']) < page_size or not resp_data['content']:
                break

        return None

    def do_post(self, path, query=None, body=None):
        '''
        Send POST request
        '''
        url = self.url + path
        resp = requests.post(url=url, params=query, json=body, headers=self.auth_header, timeout=self.timeout)
        if resp.status_code >= 400:
            e = Exception(resp.status_code, resp.text)
            raise e

        return resp.json()

    def do_func(self, name, **kwargs):
        '''
        Call OpenAPI Func
        '''
        path = self.OPENAPI_FUNC_PATH
        url  = self.url + path
        body = {
            'funcId'  : f'guance__openapi.{name}',
            'funcBody': { 'kwargs': kwargs or {} }
        }
        resp = requests.post(url=url, json=body, headers=self.auth_header, timeout=self.timeout)
        if resp.status_code >= 400:
            e = Exception(resp.status_code, resp.text)
            raise e

        func_resp = resp.json()['content']
        if func_resp['error'] > 200:
            # Calling failed
            e = Exception(func_resp['error'], func_resp['message'], toolkit.json_dumps(func_resp['detail'], ensure_ascii=False))
            raise e

        return func_resp['data']['result']
