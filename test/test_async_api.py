# -*- coding: utf-8 -*-

import pytest

from . import BaseTestSuit, AssertDesc, gen_test_id

class TestSuitAsyncAPI(BaseTestSuit):
    API_PATH_ROOT = '/api/v1/async-apis'

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

    def test_call(self):
        # TODO Test Case: Call and verify result
        pass
