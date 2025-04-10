# -*- coding: utf-8 -*-

import os
import uuid
import time
import random
import re
from urllib.parse import urlparse, urlencode, quote

import pytest
import requests
import json
import nanoid

base_path = os.path.dirname(os.path.abspath(__file__))

# Config
HOST_ENV      = 'DATAFLUX_FUNC_HOST'
TEST_USERNAME = 'admin'
TEST_PASSWORD = 'admin'
TEST_HOST     = os.environ.get(HOST_ENV) or 'localhost:8088'

# Colored print
def cprint(s):
    print(f"\033[33m{s}\033[0m")

# Assert description
class AssertDesc(object):
    @classmethod
    def bad_resp(cls, api_res=None):
        api_res_dumps = ''
        if api_res:
            api_res_str = json.dumps(api_res, indent=2, ensure_ascii=False)
            api_res_dumps = f": {api_res_str}"

        return 'API Error: ' +  api_res_dumps

    @classmethod
    def bad_value(cls):
        return 'Unexpected value from API responsed'

    @classmethod
    def bad_count(cls):
        return 'Data count in API response does not match'

# API Client
class APIClient(object):
    def __init__(self, username=None, password=None, host=None):
        self.username = TEST_USERNAME
        self.password = TEST_PASSWORD
        self.host     = TEST_HOST

        cprint(f"* Target host: {self.host}")
        cprint(f"   (Use env `{HOST_ENV}` to change target host)")

        self.client = requests.Session()
        self.client.headers.update({
            'X-Dff-Client-Id': 'c_ui_test',
        })

        self.x_auth_token = None

        self.sign_in()

    def get_full_url(self, url, params=None):
        if params:
            for k, v in params.items():
                url = url.replace(f":{k}", v)

        url = f"http://{self.host}{url}"
        return url

    def sign_in(self):
        body = {
            'captchaToken': '<TEST>',
            'captcha'     : '0000',
            'signIn': {
                'username': self.username,
                'password': self.password,
            },
        }
        status_code, resp = self.post('/api/v1/auth/do/sign-in', body=body)
        if status_code >= 400:
            raise Exception(f"Sign-in failed: username={self.username}, password={self.password}, detail={resp}")

        x_auth_token = resp['data']['xAuthToken']

        self.client.headers.update({
            'X-Dff-Auth-Token': x_auth_token,
        })

        self.x_auth_token = x_auth_token

    def get(self, url, params=None, query=None, headers=None, auth=None):
        url = self.get_full_url(url, params)

        r = self.client.get(url, params=query, headers=headers, auth=auth)

        status_code = r.status_code
        resp = None
        try:
            resp = r.json()
        except Exception as e:
            resp = r.text
        return status_code, resp

    def post(self, url, params=None, query=None, body=None, form=None, headers=None, auth=None):
        url = self.get_full_url(url, params)

        r = self.client.post(url, params=query, json=body, data=form, headers=headers, auth=auth)

        status_code = r.status_code
        resp = None
        try:
            resp = r.json()
        except Exception as e:
            resp = r.text
        return status_code, resp

# Common
def gen_test_string(length=None, chars=None):
    if not length:
        length = 32
    if not chars:
        chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

    rand_string = ''
    for i in range(length):
        rand_string += ''.join(random.sample(chars, 1))

    return rand_string

def gen_test_id():
    return 'APITEST_ID_' + gen_test_string(16)

def get_sample_script():
    script_set_id = 'script_set_' + gen_test_string(6)
    script_id     = f"{script_set_id}__script"

    file_path = os.path.join(base_path, 'sample_code.py')
    with open(file_path, 'r') as _f:
        script_code = str(_f.read())

    return script_set_id, script_id, script_code

# Base Test Suit
class BaseTestSuit(object):
    API = APIClient()
    STATE_STORE = {}

    API_PATH_ROOT = None
    TEST_ID       = None

    PRE_FUNC          = False
    PRE_SCRIPT_SET_ID = None
    PRE_SCRIPT_ID     = None
    PRE_SCRIPT_CODE   = None

    @classmethod
    def _ensure_state_store(cls):
        test_suit = cls.__name__
        if test_suit not in cls.STATE_STORE:
            cls.STATE_STORE[test_suit] = {}

        return cls.STATE_STORE[test_suit]

    @classmethod
    def state(cls, key, *args):
        store = cls._ensure_state_store()

        if len(args) <= 0:
            return store.get(key)
        else:
            store[key] = args[0]

    @classmethod
    def state_push(cls, key, item):
        store = cls._ensure_state_store()

        if key not in store:
            store[key] = [ item ]
        else:
            store[key].append(item)

    @classmethod
    def prepare_func(cls):
        # Pre Func data
        cls.PRE_FUNC = True

        SCRIPT_SET_ID, SCRIPT_ID, SCRIPT_CODE = get_sample_script()
        cls.PRE_SCRIPT_SET_ID = SCRIPT_SET_ID
        cls.PRE_SCRIPT_ID     = SCRIPT_ID
        cls.PRE_SCRIPT_CODE   = SCRIPT_CODE

        # Get LARGE_DATA_LENGTH from Sample code
        m = re.search('^LARGE_DATA_LENGTH = (\\d+)', SCRIPT_CODE, re.M)
        cls.PRE_LARGE_DATA_LENGTH = int(m[1])

        # Create Script Set
        body = { 'data': { 'id': cls.PRE_SCRIPT_SET_ID } }
        status_code, resp = cls.API.post('/api/v1/script-sets/do/add', body=body)
        assert status_code == 200, AssertDesc.bad_resp(resp)

        # Create Script
        body = { 'data': { 'id': cls.PRE_SCRIPT_ID, 'codeDraft': cls.PRE_SCRIPT_CODE } }
        status_code, resp = cls.API.post('/api/v1/scripts/do/add', body=body)
        assert status_code == 200, AssertDesc.bad_resp(resp)

        # Publish Script
        params = { 'id': cls.PRE_SCRIPT_ID }
        body   = { 'wait': True }
        status_code, resp = cls.API.post('/api/v1/scripts/:id/do/publish', params=params, body=body)
        assert status_code == 200, AssertDesc.bad_resp(resp)

    @classmethod
    def get_pre_func_id(cls, func_name):
        return cls.PRE_SCRIPT_ID + '.' + func_name

    @classmethod
    def do_teardown_class(cls):
        # Clear data
        test_ids = cls.state('testAddedIds')
        if test_ids:
            for test_id in test_ids:
                params = { 'id': test_id }
                cls.API.get(cls.API_PATH_ROOT + '/:id/do/delete', params=params)

        # Clear Pre Func data
        if cls.PRE_FUNC:
            params = { 'id': cls.PRE_SCRIPT_SET_ID }
            cls.API.get('/api/v1/script-sets/:id/do/delete', params=params)

        cls.PRE_FUNC          = False
        cls.PRE_SCRIPT_SET_ID = None
        cls.PRE_SCRIPT_ID     = None
        cls.PRE_FUNC_ID       = None
        cls.PRE_SCRIPT_CODE   = None

    def do_test_add(self, data, field_check_ignore=None):
        # Do test
        body = { 'data': data }
        status_code, resp = self.API.post(self.API_PATH_ROOT + '/do/add', body=body)

        assert status_code == 200, AssertDesc.bad_resp(resp)
        data_id = data.get('id')
        if data_id:
            assert resp['data']['id'] == data_id, AssertDesc.bad_value()

        # Current ID
        test_id = resp['data']['id']
        self.state_push('testAddedIds', test_id)

        # Verify data
        query = { 'id': test_id }
        status_code, resp = self.API.get(self.API_PATH_ROOT + '/do/list', query=query)

        assert status_code == 200,               AssertDesc.bad_resp(resp)
        assert len(resp['data']) == 1,           AssertDesc.bad_count()
        assert resp['data'][0]['id'] == test_id, AssertDesc.bad_value()

        for f_name, f_value in data.items():
            if isinstance(field_check_ignore, (list, tuple)) and f_name in field_check_ignore:
                continue

            if isinstance(f_value, (int, float, str, bool)):
                assert resp['data'][0][f_name] == f_value, AssertDesc.bad_value()

        return test_id

    def do_test_modify(self, data, target_id=None, field_check_ignore=None):
        test_ids = self.state('testAddedIds')
        if not test_ids or (target_id and target_id not in test_ids):
            pytest.skip(f"No test data to run this case")

        test_id = target_id or test_ids[0]

        # Do test
        params = { 'id': test_id }
        body   = { 'data': data }
        status_code, resp = self.API.post(self.API_PATH_ROOT + '/:id/do/modify', params=params, body=body)

        assert status_code == 200,            AssertDesc.bad_resp(resp)
        assert resp['data']['id'] == test_id, AssertDesc.bad_value()

        # Verify data
        query = { 'id': test_id }
        status_code, resp = self.API.get(self.API_PATH_ROOT + '/do/list', query=query)

        assert status_code == 200,               AssertDesc.bad_resp(resp)
        assert len(resp['data']) == 1,           AssertDesc.bad_count()
        assert resp['data'][0]['id'] == test_id, AssertDesc.bad_value()

        for f_name, f_value in data.items():
            if isinstance(field_check_ignore, (list, tuple)) and f_name in field_check_ignore:
                continue

            if isinstance(f_value, (int, float, str, bool)):
                assert resp['data'][0][f_name] == f_value, AssertDesc.bad_value()

        return test_id

    def do_test_list(self):
        # Do test
        status_code, resp = self.API.get(self.API_PATH_ROOT + '/do/list')
        assert status_code == 200, AssertDesc.bad_resp(resp)

        return resp['data']

    def do_test_delete(self, target_id=None):
        test_ids = self.state('testAddedIds')
        if not test_ids or (target_id and target_id not in test_ids):
            pytest.skip(f"No test data to run this case")

        test_id = target_id or test_ids[0]

        # Do test
        params = { 'id': test_id }
        status_code, resp = self.API.get(self.API_PATH_ROOT + '/:id/do/delete', params=params)

        assert status_code == 200,            AssertDesc.bad_resp(resp)
        assert resp['data']['id'] == test_id, AssertDesc.bad_value()

        # Verify data
        query = { 'id': test_id }
        status_code, resp = self.API.get(self.API_PATH_ROOT + '/do/list', query=query)

        assert status_code == 200,     AssertDesc.bad_resp(resp)
        assert len(resp['data']) == 0, AssertDesc.bad_count()

        return test_id
