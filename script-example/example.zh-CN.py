# 基础演示
#
# 使用装饰器为函数命名为 '两数相加'，并允许外部调用本函数
# 额外的配置包括：
#   category='math'
#       指定分类为 "math"
#
#   tags=['basic', 'simple']
#       指定 2 个标签：'basic', 'simple'
#
#   cache_result=300
#       指定处理结果缓存 300 秒。
#       首次调用成功后，后续使用完全相同的参数进行 API 调用时，系统将直接返回结果而不需要重新运行
#
#   timeout=10
#       指定函数执行超时时间为 10 秒
#       当函数执行超过 10 秒时，将强制中断并退出
#
# (更多额外配置请参考脚本开发手册 https://func.guance.com/doc/development-guide-builtin-features-dff-api/)

@DFF.API('两数相加', category='math', tags=['math', 'simple'], cache_result=300, timeout=10)
def plus(x, y):
    '''
    两数相加

    输入参数 x, y 均为数字类型，返回结果为两者之和
    '''
    print('INPUT: x = {}, y = {}'.format(x, y))

    _x = float(x)
    _y = float(y)
    result = _x + _y
    if isinstance(x, int) and isinstance(y, int):
        result = int(result)

    print('\tRESULT: {}'.format(result))
    return result

# 测试函数不需要装饰器
def test_plus():
    assert plus(1, 1) == 2
    assert plus(1, 1.1) == 2.1
    assert plus(1.1, 1.2) == 2.3
    return 'OK'
