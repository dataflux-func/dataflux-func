# 基本デモ
#
# デコレーターを使って関数名を「add two numbers」とし、外部からの呼び出しを許可する。
# その他の設定は以下の通り：
#   category='math'
#       カテゴリーを 「math」 と指定する
#
#   tags=['basic', 'simple']
#       タグを2つ指定する： 'basic', 'simple'
#
#   cache_result=300
#       結果を300秒間キャッシュするように指定する。
#       最初の呼び出しが成功した後、まったく同じパラメーターを指定してAPIを呼び出すと、APIを再実行することなく結果が直接返される。
#
#   timeout=10
#       関数実行のタイムアウトを10秒に指定する。
#       関数の実行が10秒を超えると、強制的に中断して終了する。
#
# (その他の設定については以下のスクリプト開発マニュアルを参照してください https://func.guance.com/doc/development-guide-builtin-features-dff-api/)

@DFF.API('足し算', category='math', tags=['math', 'simple'], cache_result=300, timeout=10)
def plus(x, y):
    '''
    2つの数字の足し算

    入力パラメータ x, y は数値で、戻り値は2つの和である。
    '''
    print('INPUT: x = {}, y = {}'.format(x, y))

    _x = float(x)
    _y = float(y)
    result = _x + _y
    if isinstance(x, int) and isinstance(y, int):
        result = int(result)

    print('\tRESULT: {}'.format(result))
    return result

# テスト関数にデコレーターは必要ない
def test_plus():
    assert plus(1, 1) == 2
    assert plus(1, 1.1) == 2.1
    assert plus(1.1, 1.2) == 2.3
    return 'OK'
