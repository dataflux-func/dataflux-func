# -*- coding: utf-8 -*-

import time

import pytest

from . import BaseTestSuit, AssertDesc, get_sample_script

SCRIPT_SET_ID, SCRIPT_ID, SCRIPT_CODE = get_sample_script()

class TestSuitScript(BaseTestSuit):
    API_PATH_ROOT = '/api/v1/scripts'

    def setup_class(self):
        # Add pre-data
        body = { 'data': { 'id': SCRIPT_SET_ID } }
        status_code, resp = self.API.post('/api/v1/script-sets/do/add', body=body)
        assert status_code == 200, AssertDesc.bad_resp(resp)

    def teardown_class(self):
        # Clear data
        test_id = self.state('testAddedId')
        if test_id:
            params = { 'id': test_id }
            self.API.get('/api/v1/scripts/:id/do/delete', params=params)

        params = { 'id': SCRIPT_SET_ID }
        self.API.get('/api/v1/script-sets/:id/do/delete', params=params)

    def test_add(self):
        data = {
            'id'         : SCRIPT_ID,
            'title'      : 'Test title',
            'description': 'Test description',
            'codeDraft'  : SCRIPT_CODE,
        }
        self.do_test_add(data, field_check_ignore=['codeDraft'])

    def test_modify(self):
        data = {
            'title'      : 'Test title (modify)',
            'description': 'Test description (modify)',
        }
        self.do_test_modify(data, target_id=SCRIPT_ID)

    def test_list(self):
        self.do_test_list()

    @pytest.mark.order(-1)
    def test_delete(self):
        self.do_test_delete(target_id=SCRIPT_ID)

    #------------#
    # Extra Case #
    #------------#

    def get_func_id(self, func_name):
        return SCRIPT_ID + '.' + func_name

    def test_publish(self):
        if SCRIPT_ID not in self.state('testAddedIds'):
            pytest.skip(f"No test data to run this case")

        # Data
        data = { 'note': 'Test publish' }

        # Call
        params = { 'id': SCRIPT_ID }
        body   = { 'wait': True, 'data': data }
        status_code, resp = self.API.post('/api/v1/scripts/:id/do/publish', params=params, body=body)

        assert status_code == 200, AssertDesc.bad_resp(resp)

        # Verify result
        query = { 'id': self.get_func_id('test_func') }
        status_code, resp = self.API.get('/api/v1/funcs/do/list', query=query)

        assert status_code == 200,                                     AssertDesc.bad_resp(resp)
        assert len(resp['data']) == 1,                                 AssertDesc.bad_count()
        assert resp['data'][0]['id'] == self.get_func_id('test_func'), AssertDesc.bad_value()

    def test_call_func(self):
        if SCRIPT_ID not in self.state('testAddedIds'):
            pytest.skip(f"No test data to run this case")

        # Data
        x = 10
        y = 20

        # Call
        params = { 'funcId': self.get_func_id('test_func') }
        body = {
            'kwargs': {'x': x, 'y': y }
        }
        status_code, resp = self.API.post('/api/v1/func/:funcId', params=params, body=body)

        assert status_code == 200, AssertDesc.bad_resp(resp)
        assert resp['data']['result'] == (x + y), AssertDesc.bad_value()
