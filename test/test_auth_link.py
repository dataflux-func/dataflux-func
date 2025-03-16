# -*- coding: utf-8 -*-

import time
import json

import pytest
from requests.auth import HTTPBasicAuth, HTTPDigestAuth

from . import BaseTestSuit, AssertDesc, gen_test_id

class TestSuitAuthLink(BaseTestSuit):
    API_PATH_ROOT = '/api/v1/auth-links'

    def setup_class(self):
        self.prepare_func()

    def teardown_class(self):
        self.do_teardown_class()

    def test_add__with_id(self):
        data = {
            'id'    : gen_test_id(),
            'funcId': self.get_pre_func_id('test_func'),
            'funcCallKwargsJSON': {
                'x': 'INPUT_BY_CALLER',
                'y': 'INPUT_BY_CALLER',
            },
            'tagsJSON': ['testTag1', 'testTag2'],
            'note'    : 'Test note',
        }
        self.do_test_add(data)

    def test_add__without_id(self):
        data = {
            'funcId': self.get_pre_func_id('test_func'),
            'funcCallKwargsJSON': {
                'x': 'INPUT_BY_CALLER',
                'y': 'INPUT_BY_CALLER',
            },
            'tagsJSON': ['testTag1', 'testTag2'],
            'note'    : 'Test note',
        }
        self.do_test_add(data)

    def test_modify(self):
        data = {
            'funcCallKwargsJSON': {
                'x': 1,
                'y': 'INPUT_BY_CALLER',
            },
            'tagsJSON': ['testTag3', 'testTag4'],
            'note'    : 'Test note (modify)',
        }
        self.do_test_modify(data)

    def test_list(self):
        self.do_test_list()

    @pytest.mark.order(-1)
    def test_delete(self):
        self.do_test_delete()

    #------------#
    # Extra Case #
    #------------#

    def _create_api_auth(self, api_auth_type):
        # Prepare
        data = { 'type': api_auth_type }
        auth_opt = None

        if api_auth_type == 'fixedField':
            data['configJSON'] = {
                'fields': [
                    {
                        'location': 'header',
                        'name'    : 'x-test-token-1',
                        'value'   : '<TOKEN-1>'
                    },
                    {
                        'location': 'header',
                        'name'    : 'x-test-token-2',
                        'value'   : '<TOKEN-2>'
                    }
                ]
            }

            _field = data['configJSON']['fields'][1]
            auth_opt = {
                'key' : _field['location'],
                'data': { _field['name']: _field['value'] }
            }

        elif api_auth_type == 'httpBasic':
            data['configJSON'] = {
                'users': [
                    {
                        'username': 'test-user-1',
                        'password': '<PASSWORD-1>'
                    },
                    {
                        'username': 'test-user-2',
                        'password': '<PASSWORD-2>'
                    }
                ]
            }

            _user = data['configJSON']['users'][1]
            auth_opt = {
                'key' : 'auth',
                'data': HTTPBasicAuth(_user['username'], _user['password'])
            }

        elif api_auth_type == 'httpDigest':
            data['configJSON'] = {
                'users': [
                    {
                        'username': 'test-user-3',
                        'password': '<PASSWORD-3>'
                    },
                    {
                        'username': 'test-user-4',
                        'password': '<PASSWORD-4>'
                    }
                ]
            }

            _user = data['configJSON']['users'][1]
            auth_opt = {
                'key' : 'auth',
                'data': HTTPDigestAuth(_user['username'], _user['password'])
            }

        elif api_auth_type == 'func':
            data['configJSON'] = {
                'funcId': self.get_pre_func_id('test_func_auth')
            }

            auth_opt = {
                'key' : 'header',
                'data': { 'x-my-token': '<TOKEN>' },
            }

        # Create API Auth
        body = { 'data': data }
        status_code, resp = self.API.post('/api/v1/api-auth/do/add', body=body)
        assert status_code == 200, AssertDesc.bad_resp(resp)

        return resp['data']['id'], auth_opt

    def _clear_api_auth(self, api_auth_id):
        # Clear API Auth
        params = { 'id': api_auth_id }
        status_code, resp = self.API.get('/api/v1/api-auth/:id/do/delete', params=params)
        assert status_code == 200, AssertDesc.bad_resp(resp)

    def _merge_auth_opt(self, auth_opt, query, body, form, headers, auth):
        if not auth_opt:
            return query, body, form, headers, auth

        if auth_opt['key'] == 'query':
            query = query or {}
            query.update(auth_opt['data'])

        elif auth_opt['key'] == 'body':
            if body is not None:
                body.update(auth_opt['data'])
            if form is not None:
                form.update(auth_opt['data'])

        elif auth_opt['key'] in ('header', 'headers'):
            headers = headers or {}
            headers.update(auth_opt['data'])

        elif auth_opt['key'] == 'auth':
            auth = auth_opt['data']

        return query, body, form, headers, auth

    def _call_func(self, func_id, func_kwargs=None, call_kwargs=None, method=None, call_format=None, api_auth_type=None):
        func_kwargs = func_kwargs or {}
        call_kwargs = call_kwargs or {}
        method      = method      or 'get'
        call_format = call_format or 'normal'

        # Create API Auth
        api_auth_id = None
        auth_opt    = None
        if api_auth_type:
            api_auth_id, auth_opt = self._create_api_auth(api_auth_type)

        # Prepare
        data = {
            'id'                : gen_test_id(),
            'funcId'            : func_id,
            'funcCallKwargsJSON': func_kwargs,
            'apiAuthId'         : api_auth_id,
        }
        test_id = self.do_test_add(data)

        params = { 'id': test_id }

        url     = None
        query   = None
        body    = None
        form    = None
        headers = None
        auth    = None
        if call_format == 'normal':
            url = '/api/v1/al/:id'

            if method == 'get':
                query = { 'kwargs': json.dumps(call_kwargs) }

            elif method == 'post':
                body = { 'kwargs': call_kwargs }

        elif call_format == 'simplified':
            url = '/api/v1/al/:id/simplified'

            if method == 'get':
                query = call_kwargs

            elif method == 'post':
                body = call_kwargs

        # Merge Auth info
        if auth_opt:
            query, body, form, headers, auth = self._merge_auth_opt(auth_opt, query, body, form, headers, auth)

        # Call
        if method == 'get':
            status_code, resp = self.API.get(url, params=params, query=query, headers=headers, auth=auth)
        elif method == 'post':
            status_code, resp = self.API.post(url, params=params, body=body, form=form, headers=headers, auth=auth)

        # Clear API Auth
        if api_auth_id:
            self._clear_api_auth(api_auth_id)

        assert status_code == 200, AssertDesc.bad_resp(resp)

        return resp

    # Call format + API Auth
    def _test_call_func(self, method, call_format, api_auth_type=None):
        # Prepare
        func_id = self.get_pre_func_id('test_func')
        func_kwargs = {
            'x': 'INPUT_BY_CALLER',
            'y': 'INPUT_BY_CALLER',
        }
        call_kwargs = {
            'x': 10,
            'y': 20,
        }

        # Call
        resp = self._call_func(func_id, func_kwargs, call_kwargs, method, call_format, api_auth_type)

        # Verify result
        assert str(resp) == str(call_kwargs['x'] + call_kwargs['y']), AssertDesc.bad_value()

    def test_call_func__get_normal(self):
        self._test_call_func('get', 'normal')

    def test_call_func__post_normal(self):
        self._test_call_func('post', 'normal')

    def test_call_func__get_simplified(self):
        self._test_call_func('get', 'simplified')

    def test_call_func__post_simplified(self):
        self._test_call_func('post', 'simplified')

    def test_call_func__get_normal__api_auth_fixed_fields(self):
        self._test_call_func('get', 'normal', api_auth_type='fixedField')

    def test_call_func__post_normal__api_auth_fixed_fields(self):
        self._test_call_func('post', 'normal', api_auth_type='fixedField')

    def test_call_func__get_simplified__api_auth_fixed_fields(self):
        self._test_call_func('get', 'simplified', api_auth_type='fixedField')

    def test_call_func__post_simplified__api_auth_fixed_fields(self):
        self._test_call_func('post', 'simplified', api_auth_type='fixedField')

    def test_call_func__get_normal__api_auth_http_basic(self):
        self._test_call_func('get', 'normal', api_auth_type='httpBasic')

    def test_call_func__post_normal__api_auth_http_basic(self):
        self._test_call_func('post', 'normal', api_auth_type='httpBasic')

    def test_call_func__get_simplified__api_auth_http_basic(self):
        self._test_call_func('get', 'simplified', api_auth_type='httpBasic')

    def test_call_func__post_simplified__api_auth_http_basic(self):
        self._test_call_func('post', 'simplified', api_auth_type='httpBasic')

    def test_call_func__get_normal__api_auth_http_digest(self):
        self._test_call_func('get', 'normal', api_auth_type='httpDigest')

    def test_call_func__post_normal__api_auth_http_digest(self):
        self._test_call_func('post', 'normal', api_auth_type='httpDigest')

    def test_call_func__get_simplified__api_auth_http_digest(self):
        self._test_call_func('get', 'simplified', api_auth_type='httpDigest')

    def test_call_func__post_simplified__api_auth_http_digest(self):
        self._test_call_func('post', 'simplified', api_auth_type='httpDigest')

    def test_call_func__get_normal__api_auth_func(self):
        self._test_call_func('get', 'normal', api_auth_type='func')

    def test_call_func__post_normal__api_auth_func(self):
        self._test_call_func('post', 'normal', api_auth_type='func')

    def test_call_func__get_simplified__api_auth_func(self):
        self._test_call_func('get', 'simplified', api_auth_type='func')

    def test_call_func__post_simplified__api_auth_func(self):
        self._test_call_func('post', 'simplified', api_auth_type='func')

    # Calling performance
    def _test_call_func_performance(self, feature_name, func_id, func_kwargs=None):
        func_kwargs = func_kwargs or (None, None)

        feature_off_cost = 0
        feature_on_cost  = 0

        # Call 1st time
        t1 = time.time()
        resp_1 = self._call_func(func_id, func_kwargs[0])
        feature_off_cost = time.time() - t1

        # Call 2nd time (should hit cache)
        t1 = time.time()
        resp_2 = self._call_func(func_id, func_kwargs[1])
        feature_on_cost = time.time() - t1

        assert feature_on_cost < feature_off_cost, f"Become slower with `{feature_name}` feature enabled!"

        performance_up = (feature_off_cost - feature_on_cost) / feature_off_cost * 100
        print(f"Become faster with `{feature_name}` feature enabled ({performance_up:.2f}% up)")
        print(f"-> {feature_off_cost:.2f} s -> {feature_on_cost:.2f} s")

        return resp_1, resp_2

    def test_call_func__with_cache(self):
        resp_1, resp_2 = self._test_call_func_performance(
            feature_name='DFF.API(cache_result)',
            func_id=self.get_pre_func_id('test_func_with_cache'))

        assert resp_1 == resp_2, 'Return values not match after feature enabled'

    def test_call_func__large_data(self):
        func_kwargs = [
            { 'use_feature': False },
            { 'use_feature': True },
        ]
        resp_1, resp_2 = self._test_call_func_performance(
            feature_name='DFF.RESP_LARGE_DATA(...)',
            func_id=self.get_pre_func_id('test_func_large_data'),
            func_kwargs=func_kwargs)

        assert len(resp_1) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct before feature enabled'
        assert len(resp_2) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct after feature enabled'

    def test_call_func__large_data_with_cache(self):
        resp_1, resp_2 = self._test_call_func_performance(
            feature_name='DFF.API(cache_result) ON DFF.RESP_LARGE_DATA(...)',
            func_id=self.get_pre_func_id('test_func_large_data_with_cache'))

        assert len(resp_1) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct before feature enabled'
        assert len(resp_2) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct after feature enabled'

    def test_call_func__large_data__with_datetime(self):
        func_kwargs = [
            { 'use_feature': False, 'with_datetime_field': True },
            { 'use_feature': True, 'with_datetime_field': True },
        ]
        resp_1, resp_2 = self._test_call_func_performance(
            feature_name='DFF.RESP_LARGE_DATA(...)',
            func_id=self.get_pre_func_id('test_func_large_data'),
            func_kwargs=func_kwargs)

        assert len(resp_1) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct before feature enabled'
        assert len(resp_2) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct after feature enabled'

    def test_call_func__large_data_with_cache__with_datetime(self):
        func_kwargs = [
            { 'with_datetime_field': True },
            { 'with_datetime_field': True },
        ]
        resp_1, resp_2 = self._test_call_func_performance(
            feature_name='DFF.API(cache_result) ON DFF.RESP_LARGE_DATA(...)',
            func_id=self.get_pre_func_id('test_func_large_data_with_cache'),
            func_kwargs=func_kwargs)

        assert len(resp_1) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct before feature enabled'
        assert len(resp_2) == self.PRE_LARGE_DATA_LENGTH, 'Data count no correct after feature enabled'
