import time
import json
import random
from datetime import datetime

LARGE_DATA_LENGTH = 100000

def gen_large_data(with_datetime_field=False):
    data = []
    for i in range(LARGE_DATA_LENGTH):
        d = { 'id': i, 'value': random.uniform(0, 10000) }
        if with_datetime_field:
            d['date'] = datetime.now()
        data.append(d)
    return data

@DFF.API('Test Func', category='testCate1', tags=['testTag1', 'testTag2'])
def test_func(x, y):
    '''
    Test Func

    Inputed x, y are numbers, returns the sum of them
    '''
    return float(x) + float(y)

@DFF.API('Test Func with cache', cache_result=30)
def test_func_with_cache():
    time.sleep(3)
    return 'OK'

@DFF.API('Large Data', api_timeout=180, timeout=180)
def test_func_large_data(use_feature=False, with_datetime_field=False):
    data = gen_large_data(with_datetime_field)
    if use_feature:
        return DFF.RESP_LARGE_DATA(data)
    else:
        return data

@DFF.API('Large Data with cache', api_timeout=180, timeout=180, cache_result=30)
def test_func_large_data_with_cache(with_datetime_field=False):
    data = gen_large_data(with_datetime_field)
    return DFF.RESP_LARGE_DATA(data)

@DFF.API('Func Auth')
def test_func_auth(req):
    return req['headers']['x-my-token'] == '<TOKEN>'
