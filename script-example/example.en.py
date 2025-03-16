# Basic Demo
#
# Use a decorator to name the function 'add two numbers' and allow external calls to this function
# Additional configurations include:
#   category='math'
#       Specify the category as “math”
#
#   tags=['basic', 'simple']
#       Specify 2 tags: 'basic', 'simple'
#
#   cache_result=300
#       Specify to cache the result for 300 seconds.
#       After the first successful call, subsequent API calls with the exact same parameters will return the results directly without rerunning the API
#
#   timeout=10
#       Specify a timeout of 10 seconds for function execution.
#       When function execution exceeds 10 seconds, it will force a break and exit.
#
# (For more additional configurations please refer to the script development manual at https://func.guance.com/doc/development-guide-builtin-features-dff-api/)

@DFF.API('Adding two numbers', category='math', tags=['math', 'simple'], cache_result=300, timeout=10)
def plus(x, y):
    '''
    Adding two numbers

    The input parameters x, y are numeric and the return result is the sum of the two.
    '''
    print('INPUT: x = {}, y = {}'.format(x, y))

    _x = float(x)
    _y = float(y)
    result = _x + _y
    if isinstance(x, int) and isinstance(y, int):
        result = int(result)

    print('\tRESULT: {}'.format(result))
    return result

# Test functions don't need a decorator
def test_plus():
    assert plus(1, 1) == 2
    assert plus(1, 1.1) == 2.1
    assert plus(1.1, 1.2) == 2.3
    return 'OK'
