# -*- coding: utf-8 -*-

import pytest

from . import BaseTestSuit, AssertDesc

class TestSuitAPIAuth(BaseTestSuit):
    API_PATH_ROOT = '/api/v1/api-auth'

    def setup_class(self):
        self.prepare_func()

    def teardown_class(self):
        self.do_teardown_class()

    def test_add__fixedField(self):
        data = {
            'name': 'Test name',
            'type': 'fixedField',
            'configJSON': {
                'fields': [
                    {
                        'location': 'header',
                        'name'    : 'x-my-token',
                        'value'   : '<TOKEN>'
                    },
                    {
                        'location': 'header',
                        'name'    : 'x-your-token',
                        'value'   : '<TOKEN>'
                    }
                ]
            },
            'note': 'Test note',
        }
        self.do_test_add(data)

    def test_add__httpBasic(self):
        data = {
            'name': 'Test name',
            'type': 'httpBasic',
            'configJSON': {
                'users': [
                    {
                        'username': 'zhang3',
                        'password': '<PASSWORD>'
                    },
                    {
                        'username': 'li4',
                        'password': '<PASSWORD>'
                    }
                ]
            },
            'note': 'Test note',
        }
        self.do_test_add(data)

    def test_add__httpDigest(self):
        data = {
            'name': 'Test name',
            'type': 'httpDigest',
            'configJSON': {
                'users': [
                    {
                        'username': 'zhang3',
                        'password': '<PASSWORD>'
                    },
                    {
                        'username': 'li4',
                        'password': '<PASSWORD>'
                    }
                ]
            },
            'note': 'Test note',
        }
        self.do_test_add(data)

    def test_add__func(self):
        data = {
            'name': 'Test name',
            'type': 'func',
            'configJSON': {
                'funcId': self.get_pre_func_id('test_func_auth')
            },
            'note': 'Test note',
        }
        self.do_test_add(data)

    def test_modify(self):
        data = {
            'name': 'Test name (modify)',
            'note': 'Test note (modify)',
        }
        self.do_test_modify(data)

    def test_list(self):
        self.do_test_list()

    @pytest.mark.order(-1)
    def test_delete(self):
        self.do_test_delete()
