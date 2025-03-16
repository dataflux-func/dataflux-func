<i18n locale="zh-CN" lang="yaml">
Fold Code   : 折叠代码
Fold Level 2: 折叠层级 2
Fold Level 3: 折叠层级 3
Unfold All  : 全部展开

'Script is under editing in other client, please wait...'                   : '其他客户端正在编辑此脚本，请等待...'
'Script is under editing by other user ({user}), please wait...'            : '其他用户（{user}）正在编辑此脚本，请等待...'
'Script is under editing in your other tab, please close it and continue'   : '您的其他标签页或窗口正在编辑此脚本，请关闭后继续'
'Script is under editing in you other browser, please close it and continue': '您的其他浏览器正在编辑此脚本，请关闭后继续'

Select Target                                                                        : 选择跳转目标
Viewport are too narrow                                                              : 当前可视宽度太窄
Writing test cases to test your Func is recommended                                  : 建议编写测试用例来测试您的函数
Args                                                                                 : 参数
'Arguments should be inputed like { "arg": value }.'                                 : '参数以 { "参数名": 参数值 } 方式填写。'
'Leave blank or {} when no argument'                                                 : '没有参数的不用填写，或保留 {}'
'Arguments (JSON)'                                                                   : 参数（JSON格式）
Run selected Func                                                                    : 执行指定的函数
Shortcut                                                                             : 快捷键
Save Script draft                                                                    : 保存草稿
Show code diff                                                                       : 查看差异
DIFF                                                                                 : 差异
Save and publish Script                                                              : 保存并发布
Recover code to latest published version                                             : 恢复代码为上次发布的版本
End editing                                                                          : 结束编辑
Code Editor setting                                                                  : 代码编辑器设置
This is a built-in Script, code will be reset when the system restarts               : 这是一个内置脚本，代码会在系统重启后复位
This Script is locked by other user ({user})                                         : 当前脚本被其他用户（{user}）锁定
Script is modified but NOT published yet                                             : 脚本已修改但尚未发布
Script is published                                                                  : 脚本已发布
Diff between published and previously published                                      : 发布前后差异
Copy All                                                                             : 复制全部
Copy Last One                                                                        : 复制最后一次
Clear                                                                                : 清除
Output                                                                               : 输出
Func exection result or log message will be shown here                               : 函数执行结果与日志信息将显示在此处

Confirm Before Publishing                                   : 发布前确认
The Script to be published now include the following CHANGES: 即将发布的脚本包含如下改动

Operating too frequently or Script is modified in other tab                            : 操作过于频繁，或脚本已经在其他窗口被修改。
Do you want to download current editing Script?                                        : 是否下载当前正在编辑的脚本？
Saving Script failed                                                                   : 保存脚本失败
Current editing Script has been downloaded                                             : 当前正在编辑的脚本已经下载
Script saved successfully                                                              : 脚本保存成功
You can continue with other operations                                                 : 你可以继续进行其他操作
Published Code                                                                         : 已发布的代码
Saved Draft Code                                                                       : 已保存的草稿代码
Script will take effect after been published immediately,                              : 发布后新的脚本将立即生效，
Funcs with {html} decorator will be available to be accessed                           : 被{html}装饰的函数可被访问
Publish Script                                                                         : 发布脚本
Script saved                                                                           : 脚本已保存
Script published, new Script is in effect immediately                                  : 脚本已发布，新脚本立即生效
Reset draft to the last published version, changes not published will lost             : '复位脚本草稿到上次发布时的状态，未发布的草稿将丢失'
Are you sure you want to reset the Script?                                             : 是否确认复位此脚本？
Script has been reset to previous version                                              : 脚本已经复位到上一个版本
Reset Script                                                                           : 复位脚本
The parameter is not a valid JSON                                                      : 调用参数不是有效的JSON格式
Invalid argument format                                                                : 参数格式不正确
Check input                                                                            : 输入检查
Executed Func                                                                          : 执行函数
This Script is not published, it will take effect after the Script is published        : 当前脚本尚未发布，脚本只有发布后才会生效
Do you want to publish the Script now?                                                 : 是否现在发布？
Script not published                                                                   : 脚本未发布
Publish Now                                                                            : 立即发布
Skip Publishing                                                                        : 跳过发布
Time Cost                                                                              : 函数执行耗时
Peak Memory Allocated                                                                  : 内存分配峰值
It took too much time for running (more than 3s), may not be suitable for synchronous calling scenario: 耗时较长（大于 3 秒），可能不适合需要响应速度较高的场景
'Logs by print(...)'                                                                   : print(...) 日志
'Return Value (pprint.saferepr)'                                                       : 返回值（pprint.saferepr）
Stack                                                                                  : 调用堆栈

Publish Failed                                                                                                                     : 发布失败
Script Error                                                                                                                       : 脚本错误
Waiting Timeout                                                                                                                    : 等待超时
Duplicated Func names                                                                                                              : 函数名重复
Script publishing failed. Please check your code                                                                                   : 脚本发布失败，请检查代码是否存在错误
Script executing failed. Please check your code                                                                                    : 脚本执行失败，请检查代码是否存在错误
Worker no response, please check the status of this system                                                                         : 工作单元没有响应，请检查系统状态
Detail information is shown in the output box bellow                                                                               : 详细信息可在下方输出窗口中查看
Script publishing timeout, please make sure that no time-consuming code in global scope                                            : 脚本发布预检查超时，请注意不要再全局范围内编写耗时代码
If this issue persists, please contact the administrator to report this issue                                                      : 如果问题持续出现，请联系管理员排查问题
Waiting Func response timeout                                                                                                      : 等待函数响应超时
There is a {seconds} time limit when calling Funcs in Code Editor                                                                  : 在编辑器中运行函数时，最多允许执行{seconds}，超时会自动中断执行
It is not recommended for synchronous calling Funcs that response slowly                                                           : 正式使用时应注意响应过慢的函数不适合同步方式调用
Can not parse return value                                                                                                         : 函数返回值无法解析
Func returned a value that can not been parsed as JSON. Please check your code                                                     : 函数返回了无法使用 JSON 表示的数据，请检查代码
'In general, common used types are safe (e.g. list, dict, int, float, str, bool, None).'                                           : 一般来说，Python 常用基本类型都能正常解析，如 list、dict、int、float、str、bool、None 等。
Some math lib may return complicated values, like numpy.NaN. These values should be converted to common used types before returning: 但一些数学库可能返回复杂的数字对象，如 numpy.NaN。这些数字对象需要在函数返回前处理成 Python 的基本类型
Duplicated names of Funcs decorated by @DFF.API(...)                                                                               : 被@DFF.API(...)装饰的函数存在重名
Please check the code and try again                                                                                                : 请检查代码，修改后再试一次

Publishing Script, it will be finished in a few seconds. If the page is not responding for a long time, please try refreshing.  : 脚本发布中，正常几秒就能完成。如长时间无响应请尝试刷新页面
Func is running. If it is not responding for a long time, please try refreshing.                                                : 函数执行中，长时间无响应后再尝试刷新页面
Func is running. It will wait at most {seconds} for the result. If it is not responding for a long time, please try refreshing. : 函数执行中，执行最多等待 {seconds}，长时间无响应后再尝试刷新页面
</i18n>

<!-- Generated by OpenCC START -->
<i18n locale="zh-HK" lang="yaml">
Are you sure you want to reset the Script?: 是否確認復位此腳本？
Args: 參數
Arguments (JSON): 參數（JSON格式）
'Arguments should be inputed like { "arg": value }.': '參數以 { "參數名": 參數值 } 方式填寫。'
Can not parse return value: 函數返回值無法解析
Check input: 輸入檢查
Clear: 清除
Code Editor setting: 代碼編輯器設置
Confirm Before Publishing: 發佈前確認
Copy All: 複製全部
Copy Last One: 複製最後一次
Current editing Script has been downloaded: 當前正在編輯的腳本已經下載
DIFF: 差異
Detail information is shown in the output box bellow: 詳細信息可在下方輸出窗口中查看
Diff between published and previously published: 發佈前後差異
Do you want to download current editing Script?: 是否下載當前正在編輯的腳本？
Do you want to publish the Script now?: 是否現在發佈？
Duplicated Func names: 函數名重複
Duplicated names of Funcs decorated by @DFF.API(...): 被@DFF.API(...)裝飾的函數存在重名
End editing: 結束編輯
Executed Func: 執行函數
Fold Code: 摺疊代碼
Fold Level 2: 摺疊層級 2
Fold Level 3: 摺疊層級 3
Func exection result or log message will be shown here: 函數執行結果與日誌信息將顯示在此處
Func is running. If it is not responding for a long time, please try refreshing.: 函數執行中，長時間無響應後再嘗試刷新頁面
? Func is running. It will wait at most {seconds} for the result. If it is not responding for a long time, please try refreshing.
: 函數執行中，執行最多等待 {seconds}，長時間無響應後再嘗試刷新頁面
Func returned a value that can not been parsed as JSON. Please check your code: 函數返回了無法使用 JSON 表示的數據，請檢查代碼
Funcs with {html} decorator will be available to be accessed: 被{html}裝飾的函數可被訪問
If this issue persists, please contact the administrator to report this issue: 如果問題持續出現，請聯繫管理員排查問題
In general, common used types are safe (e.g. list, dict, int, float, str, bool, None).: 一般來説，Python 常用基本類型都能正常解析，如 list、dict、int、float、str、bool、None 等。
Invalid argument format: 參數格式不正確
It is not recommended for synchronous calling Funcs that response slowly: 正式使用時應注意響應過慢的函數不適合同步方式調用
It took too much time for running (more than 3s), may not be suitable for synchronous calling scenario: 耗時較長（大於 3 秒），可能不適合需要響應速度較高的場景
Leave blank or {} when no argument: 沒有參數的不用填寫，或保留 {}
Logs by print(...): print(...) 日誌
Operating too frequently or Script is modified in other tab: 操作過於頻繁，或腳本已經在其他窗口被修改。
Output: 輸出
Peak Memory Allocated: 內存分配峯值
Please check the code and try again: 請檢查代碼，修改後再試一次
Publish Failed: 發佈失敗
Publish Now: 立即發佈
Publish Script: 發佈腳本
Published Code: 已發佈的代碼
? Publishing Script, it will be finished in a few seconds. If the page is not responding for a long time, please try refreshing.
: 腳本發佈中，正常幾秒就能完成。如長時間無響應請嘗試刷新頁面
Recover code to latest published version: 恢復代碼為上次發佈的版本
Reset Script: 復位腳本
Reset draft to the last published version, changes not published will lost: 復位腳本草稿到上次發佈時的狀態，未發佈的草稿將丟失
Return Value (pprint.saferepr): 返回值（pprint.saferepr）
Run selected Func: 執行指定的函數
Save Script draft: 保存草稿
Save and publish Script: 保存併發布
Saved Draft Code: 已保存的草稿代碼
Saving Script failed: 保存腳本失敗
Script Error: 腳本錯誤
Script executing failed. Please check your code: 腳本執行失敗，請檢查代碼是否存在錯誤
Script has been reset to previous version: 腳本已經復位到上一個版本
Script is modified but NOT published yet: 腳本已修改但尚未發佈
Script is published: 腳本已發佈
Script is under editing by other user ({user}), please wait...: 其他用户（{user}）正在編輯此腳本，請等待...
Script is under editing in other client, please wait...: 其他客户端正在編輯此腳本，請等待...
Script is under editing in you other browser, please close it and continue: 您的其他瀏覽器正在編輯此腳本，請關閉後繼續
Script is under editing in your other tab, please close it and continue: 您的其他標籤頁或窗口正在編輯此腳本，請關閉後繼續
Script not published: 腳本未發佈
Script published, new Script is in effect immediately: 腳本已發佈，新腳本立即生效
Script publishing failed. Please check your code: 腳本發佈失敗，請檢查代碼是否存在錯誤
Script publishing timeout, please make sure that no time-consuming code in global scope: 腳本發佈預檢查超時，請注意不要再全局範圍內編寫耗時代碼
Script saved: 腳本已保存
Script saved successfully: 腳本保存成功
Script will take effect after been published immediately,: 發佈後新的腳本將立即生效，
Select Target: 選擇跳轉目標
Shortcut: 快捷鍵
Show code diff: 查看差異
Skip Publishing: 跳過發佈
? Some math lib may return complicated values, like numpy.NaN. These values should be converted to common used types before returning
: 但一些數學庫可能返回複雜的數字對象，如 numpy.NaN。這些數字對象需要在函數返回前處理成 Python 的基本類型
Stack: 調用堆棧
The Script to be published now include the following CHANGES: 即將發佈的腳本包含如下改動
The parameter is not a valid JSON: 調用參數不是有效的JSON格式
There is a {seconds} time limit when calling Funcs in Code Editor: 在編輯器中運行函數時，最多允許執行{seconds}，超時會自動中斷執行
This Script is locked by other user ({user}): 當前腳本被其他用户（{user}）鎖定
This Script is not published, it will take effect after the Script is published: 當前腳本尚未發佈，腳本只有發佈後才會生效
This is a built-in Script, code will be reset when the system restarts: 這是一個內置腳本，代碼會在系統重啓後復位
Time Cost: 函數執行耗時
Unfold All: 全部展開
Viewport are too narrow: 當前可視寬度太窄
Waiting Func response timeout: 等待函數響應超時
Waiting Timeout: 等待超時
Worker no response, please check the status of this system: 工作單元沒有響應，請檢查系統狀態
Writing test cases to test your Func is recommended: 建議編寫測試用例來測試您的函數
You can continue with other operations: 你可以繼續進行其他操作
</i18n>
<i18n locale="zh-TW" lang="yaml">
Are you sure you want to reset the Script?: 是否確認復位此指令碼？
Args: 引數
Arguments (JSON): 引數（JSON格式）
'Arguments should be inputed like { "arg": value }.': '引數以 { "引數名": 引數值 } 方式填寫。'
Can not parse return value: 函式返回值無法解析
Check input: 輸入檢查
Clear: 清除
Code Editor setting: 程式碼編輯器設定
Confirm Before Publishing: 釋出前確認
Copy All: 複製全部
Copy Last One: 複製最後一次
Current editing Script has been downloaded: 當前正在編輯的指令碼已經下載
DIFF: 差異
Detail information is shown in the output box bellow: 詳細資訊可在下方輸出視窗中檢視
Diff between published and previously published: 釋出前後差異
Do you want to download current editing Script?: 是否下載當前正在編輯的指令碼？
Do you want to publish the Script now?: 是否現在釋出？
Duplicated Func names: 函式名重複
Duplicated names of Funcs decorated by @DFF.API(...): 被@DFF.API(...)裝飾的函式存在重名
End editing: 結束編輯
Executed Func: 執行函式
Fold Code: 摺疊程式碼
Fold Level 2: 摺疊層級 2
Fold Level 3: 摺疊層級 3
Func exection result or log message will be shown here: 函式執行結果與日誌資訊將顯示在此處
Func is running. If it is not responding for a long time, please try refreshing.: 函式執行中，長時間無響應後再嘗試重新整理頁面
? Func is running. It will wait at most {seconds} for the result. If it is not responding for a long time, please try refreshing.
: 函式執行中，執行最多等待 {seconds}，長時間無響應後再嘗試重新整理頁面
Func returned a value that can not been parsed as JSON. Please check your code: 函式返回了無法使用 JSON 表示的資料，請檢查程式碼
Funcs with {html} decorator will be available to be accessed: 被{html}裝飾的函式可被訪問
If this issue persists, please contact the administrator to report this issue: 如果問題持續出現，請聯絡管理員排查問題
In general, common used types are safe (e.g. list, dict, int, float, str, bool, None).: 一般來說，Python 常用基本型別都能正常解析，如 list、dict、int、float、str、bool、None 等。
Invalid argument format: 引數格式不正確
It is not recommended for synchronous calling Funcs that response slowly: 正式使用時應注意響應過慢的函式不適合同步方式呼叫
It took too much time for running (more than 3s), may not be suitable for synchronous calling scenario: 耗時較長（大於 3 秒），可能不適合需要響應速度較高的場景
Leave blank or {} when no argument: 沒有引數的不用填寫，或保留 {}
Logs by print(...): print(...) 日誌
Operating too frequently or Script is modified in other tab: 操作過於頻繁，或指令碼已經在其他視窗被修改。
Output: 輸出
Peak Memory Allocated: 記憶體分配峰值
Please check the code and try again: 請檢查程式碼，修改後再試一次
Publish Failed: 釋出失敗
Publish Now: 立即釋出
Publish Script: 釋出指令碼
Published Code: 已釋出的程式碼
? Publishing Script, it will be finished in a few seconds. If the page is not responding for a long time, please try refreshing.
: 指令碼釋出中，正常幾秒就能完成。如長時間無響應請嘗試重新整理頁面
Recover code to latest published version: 恢復程式碼為上次釋出的版本
Reset Script: 復位指令碼
Reset draft to the last published version, changes not published will lost: 復位指令碼草稿到上次釋出時的狀態，未釋出的草稿將丟失
Return Value (pprint.saferepr): 返回值（pprint.saferepr）
Run selected Func: 執行指定的函式
Save Script draft: 儲存草稿
Save and publish Script: 儲存併發布
Saved Draft Code: 已儲存的草稿程式碼
Saving Script failed: 儲存指令碼失敗
Script Error: 指令碼錯誤
Script executing failed. Please check your code: 指令碼執行失敗，請檢查程式碼是否存在錯誤
Script has been reset to previous version: 指令碼已經復位到上一個版本
Script is modified but NOT published yet: 指令碼已修改但尚未釋出
Script is published: 指令碼已釋出
Script is under editing by other user ({user}), please wait...: 其他使用者（{user}）正在編輯此指令碼，請等待...
Script is under editing in other client, please wait...: 其他客戶端正在編輯此指令碼，請等待...
Script is under editing in you other browser, please close it and continue: 您的其他瀏覽器正在編輯此指令碼，請關閉後繼續
Script is under editing in your other tab, please close it and continue: 您的其他標籤頁或視窗正在編輯此指令碼，請關閉後繼續
Script not published: 指令碼未釋出
Script published, new Script is in effect immediately: 指令碼已釋出，新指令碼立即生效
Script publishing failed. Please check your code: 指令碼釋出失敗，請檢查程式碼是否存在錯誤
Script publishing timeout, please make sure that no time-consuming code in global scope: 指令碼釋出預檢查超時，請注意不要再全域性範圍內編寫耗時程式碼
Script saved: 指令碼已儲存
Script saved successfully: 指令碼儲存成功
Script will take effect after been published immediately,: 釋出後新的指令碼將立即生效，
Select Target: 選擇跳轉目標
Shortcut: 快捷鍵
Show code diff: 檢視差異
Skip Publishing: 跳過釋出
? Some math lib may return complicated values, like numpy.NaN. These values should be converted to common used types before returning
: 但一些數學庫可能返回複雜的數字物件，如 numpy.NaN。這些數字物件需要在函式返回前處理成 Python 的基本型別
Stack: 呼叫堆疊
The Script to be published now include the following CHANGES: 即將釋出的指令碼包含如下改動
The parameter is not a valid JSON: 呼叫引數不是有效的JSON格式
There is a {seconds} time limit when calling Funcs in Code Editor: 在編輯器中執行函式時，最多允許執行{seconds}，超時會自動中斷執行
This Script is locked by other user ({user}): 當前指令碼被其他使用者（{user}）鎖定
This Script is not published, it will take effect after the Script is published: 當前指令碼尚未釋出，指令碼只有釋出後才會生效
This is a built-in Script, code will be reset when the system restarts: 這是一個內建指令碼，程式碼會在系統重啟後復位
Time Cost: 函式執行耗時
Unfold All: 全部展開
Viewport are too narrow: 當前可視寬度太窄
Waiting Func response timeout: 等待函式響應超時
Waiting Timeout: 等待超時
Worker no response, please check the status of this system: 工作單元沒有響應，請檢查系統狀態
Writing test cases to test your Func is recommended: 建議編寫測試用例來測試您的函式
You can continue with other operations: 你可以繼續進行其他操作
</i18n>
<!-- Generated by OpenCC END -->

<template>
  <transition name="fade-s">
    <split-pane v-on:resize="resizeVueSplitPane" ref="vueSplitPane" :min-percent="0" :default-percent="100" split="horizontal" v-show="$store.state.isLoaded">
      <template slot="paneL">
        <el-container
          v-loading.fullscreen.lock="fullScreenLoading"
          element-loading-spinner="el-icon-loading"
          :element-loading-text="workerRunningTipTitle">
          <!-- Operation area -->
          <el-header class="code-editor" style="height: unset !important">
            <div class="code-editor-action-left">
              <code class="code-editor-action-title">
                <i class="fa fa-file-code-o"></i>
                {{ data.id }}
              </code>
            </div>
            <div class="code-editor-action-breaker hidden-lg-and-up"></div>
            <div class="code-editor-action-right">
              <div v-if="conflictInfo" class="conflict-info">
                <i class="fa fa-fw fa-exclamation-triangle"></i>
            <span v-if="conflictInfo.user.username !== userInfo.username">
              <template v-if="!conflictUser">
                {{ $t('Script is under editing in other client, please wait...') }}
              </template>
              <template v-else>
                {{ $t('Script is under editing by other user ({user}), please wait...', { user: conflictUser }) }}
              </template>
            </span>
            <span v-else-if="conflictInfo.scope === 'sameClientOtherTab'">{{ $t('Script is under editing in your other tab, please close it and continue') }}</span>
            <span v-else-if="conflictInfo.scope === 'otherClient'">{{ $t('Script is under editing in you other browser, please close it and continue') }}</span>
              </div>

              <div>
                <el-dropdown split-button size="mini" @click="foldCode(1)" @command="foldCode">
                  {{ $t('Fold Code') }}
                  <el-dropdown-menu slot="dropdown">
                    <el-dropdown-item :command="2">{{ $t('Fold Level 2') }}</el-dropdown-item>
                    <el-dropdown-item :command="3">{{ $t('Fold Level 3') }}</el-dropdown-item>
                    <el-dropdown-item :command="-1" divided>{{ $t('Unfold All') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </el-dropdown>
              </div>

              <div>
                <el-select
                  style="width: 150px"
                  popper-class="code-font"
                  v-model="selectedItemId"
                  size="mini"
                  filterable default-first-option
                  @keyup.native.enter="redoSelectedItem(selectedItemId)"
                  :placeholder="$t('Select Target')">
                  <el-option v-for="item in selectableItems" :key="item.id" :label="item.name" :value="item.id">
                    <div @click="redoSelectedItem(item.id)">
                      <el-tag v-if="item.type === 'todo'"
                        size="mini"
                        class="select-todo-tag" :type="C.TODO_TYPE_MAP.get(item.todoType).tagType">
                        <i class="fa fa-fw" :class="C.TODO_TYPE_MAP.get(item.todoType).icon"></i>
                        {{ item.todoType }}
                      </el-tag>
                      <el-tag v-else class="select-item-tag" type="info" size="mini">{{ item.type }}</el-tag>
                      {{ item.name }}
                    </div>
                  </el-option>
                </el-select>
              </div>

              <template v-if="!conflictInfo">
                <div class="hidden-lg-and-up">
                  <el-tooltip placement="bottom" :enterable="false">
                    <div slot="content">
                      {{ $t('Viewport are too narrow') }}<br>
                      {{ $t('Writing test cases to test your Func is recommended') }}
                    </div>
                    <el-tag type="info" size="medium">{{ $t('Args') }}</el-tag>
                  </el-tooltip>
                </div>

                <div class="hidden-md-and-down">
                  <el-popover placement="bottom" trigger="hover" width="380" :disabled="!isFuncSelected">
                    <div>
                      <el-input
                        type="textarea"
                        resize="none"
                        :autosize="{ minRows: 3, maxRows: 15 }"
                        :clearable="true"
                        :placeholder="$t('Arguments (JSON)')"
                        v-model="funcCallKwargsJSON"
                        class="code-editor-call-func-kwargs-json">
                      </el-input>
                      <InfoBlock type="error" v-if="!isValidFuncCallKwargsJSON" :title="$t('Invalid argument format')" />
                      <InfoBlock type="info" :title="$t('Arguments should be inputed like { &quot;arg&quot;: value }.') + '\n' + $t('Leave blank or {} when no argument')" />
                      <InfoBlock type="info" :title="$t('Writing test cases to test your Func is recommended')" />
                    </div>
                    <el-input slot="reference"
                      style="width: 150px; text-overflow: ellipsis;"
                      size="mini"
                      :readonly="true"
                      :placeholder="$t('Arguments (JSON)')"
                      :value="funcCallKwargsShowValue"
                      :disabled="!isFuncSelected"
                      class="code-editor-call-func-kwargs-json">
                    </el-input>
                  </el-popover>
                </div>

                <div>
                  <el-tooltip placement="bottom" :enterable="false">
                    <div slot="content">
                      {{ $t('Run selected Func') }}<br>
                      {{ $t('Shortcut') }}{{ $t(':') }}<kbd>{{ T.getSuperKeyName() }}</kbd> + <kbd>B</kbd>
                    </div>
                    <el-button
                      v-prevent-re-click @click="callFuncDraft"
                      type="primary" plain
                      size="mini"
                      :disabled="!(!!selectedItemId && !workerRunning && isFuncSelected)">
                      <i class="fa fa-fw fa-play"></i> {{ $t('Run') }}
                    </el-button>
                  </el-tooltip>
                </div>

                <div v-if="canEditCode">
                  <el-button-group>
                    <el-tooltip placement="bottom" :enterable="false">
                      <div slot="content">
                        {{ $t('Save Script draft') }}<br>
                        {{ $t('Shortcut') }}{{ $t(':') }}<kbd>{{ T.getSuperKeyName() }}</kbd> + <kbd>S</kbd>
                      </div>
                      <el-button
                        v-prevent-re-click @click="saveScript()"
                        :disabled="workerRunning"
                        plain
                        size="mini">
                        <i class="fa fa-fw fa-save"></i> <span class="hidden-lg-and-down">{{ $t('Save') }}</span>
                      </el-button>
                    </el-tooltip>

                    <el-tooltip placement="bottom" :enterable="false">
                      <div slot="content">
                        {{ $t('Show code diff') }}
                      </div>
                      <el-button
                        @click="showDiff()"
                        :disabled="workerRunning"
                        plain
                        size="mini">
                        <i class="fa fa-fw fa-code"></i> <span class="hidden-lg-and-down">{{ $t('DIFF') }}</span>
                      </el-button>
                    </el-tooltip>

                    <el-tooltip placement="bottom" :enterable="false">
                      <div slot="content">
                        {{ $t('Save and publish Script') }}<br>
                      </div>
                      <el-button
                        @click="publishScript('confirm')"
                        :disabled="workerRunning"
                        plain
                        class="text-main"
                        size="mini">
                        <i class="fa fa-fw fa-coffee"></i> {{ $t('Publish') }}
                      </el-button>
                    </el-tooltip>
                  </el-button-group>
                </div>
              </template>

              <div>
                <el-button-group>
                  <template v-if="!conflictInfo && canEditCode">
                    <el-tooltip :content="$t('Recover code to latest published version')" placement="bottom" :enterable="false">
                      <el-button
                        @click="resetScript"
                        :disabled="workerRunning"
                        plain
                        size="mini"><i class="fa fa-fw fa-history"></i></el-button>
                    </el-tooltip>
                  </template>

                  <el-tooltip :content="$t('End editing')" placement="bottom" :enterable="false">
                    <el-button
                      @click="endEdit"
                      :disabled="workerRunning"
                      plain
                      size="mini"><i class="fa fa-fw fa-sign-out"></i> {{ $t('Exit') }}</el-button>
                  </el-tooltip>
                </el-button-group>
              </div>

              <div>
                <el-button-group>
                  <el-tooltip :content="$t('Code Editor setting')" placement="bottom" :enterable="false">
                    <el-button
                      @click="$refs.codeEditorSetting.open()"
                      :disabled="workerRunning"
                      plain
                      size="mini"><i class="fa fa-fw fa-cog"></i></el-button>
                  </el-tooltip>
                </el-button-group>
              </div>
            </div>

            <InfoBlock v-if="isLockedByOther" :type="canEditCode ? 'warning' : 'error'" :title="$t('This Script is locked by other user ({user})', { user: lockedByUser })" />
            <InfoBlock v-if="data.sset_origin === 'builtin'" type="warning" :title="$t('This is a built-in Script, code will be reset when the system restarts')" />
          </el-header>

          <!-- Code area -->
          <el-main id="editorContainer_CodeEditor" :style="$store.getters.codeMirrorSettings.style">
            <textarea id="editor_CodeEditor"></textarea>
          </el-main>

          <!-- Publish confirm -->
          <el-dialog
            id="PublishConfirm"
            :visible.sync="showPublishingConfirm"
            min-width="1000px">
            <template slot="title">
              {{ $t('Confirm Before Publishing') }}
              <span class="press-esc-to-close-tip">{{ $t('Press ESC to close') }}</span>
            </template>
            <div>
              <p class="text-bad">{{ $t('The Script to be published now include the following CHANGES') }}{{ $t(':') }}</p>
              <textarea id="diff_publishingConfirm"></textarea>
            </div>
            <span slot="footer" class="dialog-footer">
              <el-button type="primary" @click="publishScript('publish')">
                <i class="fa fa-fw fa-coffee"></i>
                {{ $t('Publish Script') }}
              </el-button>
            </span>
          </el-dialog>

          <!-- Monkey patch tips -->
          <FeatureNoticeDialog
            featureKey="codeEditor.monkeyPatch"
            :description="$t('FeatureNotice_monkeyPatch')"
            icon="fa-warning"
            :image="img_noticeMonkeyPatch" />

          <LongTextDialog :title="$t('Diff between published and previously published')" mode="diff" ref="longTextDialog" />
          <CodeEditorSetting :codeMirror="codeMirror" ref="codeEditorSetting" />
        </el-container>
      </template>

      <!-- Output area -->
      <template slot="paneR">
        <div class="code-editor-output">
          <div class="code-editor-output-close">
            <CopyButton :title="$t('Copy Last One')" :content="this.scriptOutputLastOneText" tip-placement="bottom" />
            <CopyButton :title="$t('Copy All')" :content="this.scriptOutputText" tip-placement="bottom" />
            <div class="clear-script-output">
              <el-link
                type="info"
                :underline="false"
                @click.stop="clearScriptOutput()">
                <i class="fa fa-eraser"></i> {{ $t('Clear') }}
              </el-link>
            </div>
          </div>
          <el-tabs tab-position="left" type="border-card">
            <el-tab-pane :label="`${$t('Output')} ${funcCallSeq > 0 ? `#${funcCallSeq}` : ''}`" ref="codeEditorTextOutput">
              <pre v-html.trim="this.scriptOutputHTML || $t('Func exection result or log message will be shown here')"></pre>
            </el-tab-pane>
          </el-tabs>
        </div>
      </template>
    </split-pane>
  </transition>
</template>

<script>
// @ is an alias to /src
import CodeEditorSetting from '@/components/Development/CodeEditorSetting'
import LongTextDialog from '@/components/LongTextDialog'
import { createPatch } from 'diff'
import FileSaver from 'file-saver';
import * as htmlEscaper from 'html-escaper';

import FeatureNoticeDialog from '@/components/FeatureNoticeDialog'
import img_noticeMonkeyPatch from '@/assets/img/notice-monkey-patch.png'

export default {
  name: 'CodeEditor',
  components: {
    FeatureNoticeDialog,
    CodeEditorSetting,
    LongTextDialog,
  },
  watch: {
    $route: {
      immediate: true,
      async handler(to, from) {
        // Mark as newly loaded file, should not trigger CodeMirror change event
        this.isNewLoaded = true;

        await this.loadData();
      }
    },
    conflictInfo: {
      immediate: true,
      handler(val) {
        this.T.setCodeMirrorReadOnly(this.codeMirror, val);
      }
    },
    splitPanePercent(val) {
      this.resizeVueSplitPane(val);
    },
    codeMirrorTheme(val) {
      this.codeMirror.setOption('theme', val);
    },
    selectedItemId(val) {
      this.$store.commit('updateEditor_selectedItemId', val);
      this.highlightQuickSelectItem();

      // Fill kwargs automatically
      this.autoFillFuncCallKwargsJSON(val);
    },
    funcCallKwargsJSON(val) {
      if (!this.selectedItemId) return;

      this.$set(this.funcCallKwargsJSONHistory, this.selectedItemId, val);
    },
    '$store.state.Editor_selectedItemId'(val) {
      if (this.selectedItemId !== val) {
        this.selectedItemId = val;
      }
    },
    '$store.state.shortcutAction'(val) {
      switch(val.action) {
        case 'codeEditor.save':
          this.saveScript();
          break;

        case 'codeEditor.run':
          this.callFuncDraft();
          break;
      }
    },
  },
  methods: {
    _refreshAside() {
      // Updating the list of Funcs
      this.updateSelectableItems();
      // Update the left side list
      this.$store.commit('updateScriptListSyncTime');
    },
    _downloadEditingCodeDraft(codeContent) {
      let blob = new Blob([codeContent], {type: 'text/plain'});
      let fileName = `${this.scriptId}.${this.M().format('YYYYMMDD_HHmmss')}.py.DRAFT`;
      FileSaver.saveAs(blob, fileName);

      return fileName;
    },
    async _saveCodeDraft(options) {
      // Wait for save flag to prevent multiple saves
      while (this.isSavingCodeDraft) {
        await this.T.sleep(1000);
      }
      this.isSavingCodeDraft = true;

      let res = null;
      try {
        return await this._saveCodeDraftImpl(options);
      } catch(err) {
        // nope
      } finally {
        this.isSavingCodeDraft = false;
      }
    },
    async _saveCodeDraftImpl(options) {
      options = options || {};

      if (!this.canEditCode) return;
      if (!this.codeMirror) return;

      let prevCodeDraftMD5 = this.prevCodeDraftMD5;
      let codeDraft        = this.codeMirror.getValue();

      // Format on save
      codeDraft = codeDraft.trimRight().split('\n').map(l => {
        l = l.replace(/\t/g, ' '.repeat(4)); // Tab to 4 space
        l = l.trimRight();                   // Remove trailing spaces
        return l;
      }).join('\n').trimRight();

      // Add ending blank line
      if (codeDraft) codeDraft += '\n';

      // Passing code using Base64
      let codeDraftBase64 = this.T.getBase64(codeDraft);

      let apiRes = await this.T.callAPI('post', '/api/v1/scripts/:id/do/modify', {
        params  : { id: this.scriptId },
        body    : { data: { codeDraftBase64 }, prevCodeDraftMD5: prevCodeDraftMD5 },
        feedback: { okMessage: options.mute ? null : this.$t('Script saved'), muteError: true }, // Error messages are handled specially below
      });

      if (!apiRes.ok) {
        // Save failed, handle error in detail
        switch(apiRes.reason) {
          // Optimistic Lock Conflict
          case 'EBizRequestConflict.scriptDraftAlreadyChanged':
            if (await this.T.confirm(`${this.$t('Operating too frequently or Script is modified in other tab')}
                <br><span class="text-main">${this.$t('Do you want to download current editing Script?')}</span>`, 'error')) {

              this._downloadEditingCodeDraft(codeDraft);
            }

            this.endEdit();

            break;

          default:
            this.T.alert(`${this.$t('Saving Script failed')}</span>
                <br><span class="text-good">${this.$t('Current editing Script has been downloaded')}</span>`);

            this._downloadEditingCodeDraft(codeDraft);

            break;
        }

      } else {
        // Save Successfully

        // Update page status
        this.data.codeDraft = codeDraft;
        this.prevCodeDraftMD5 = apiRes.data.codeDraftMD5;

        // Refresh Sidebar
        this._refreshAside();
      }

      return apiRes;
    },
    async loadData(options) {
      options = options || {};
      options.codeField = options.codeField || 'codeDraft';

      let apiRes = await this.T.callAPI_getOne('/api/v1/scripts/do/list', this.scriptId, {
        query: { _withCode: true, _withCodeDraft: true },
      });
      if (!apiRes.ok || !apiRes.data) {
        // Redirect to the Intro page if it fails to fetch the script.
        this.$router.push({ name: 'intro' });
        return;
      };

      this.data = apiRes.data;
      this.prevCodeDraftMD5 = apiRes.data.codeDraftMD5;

      // Redirect to the lock reminder page if no permission is granted
      if (!this.canEditCode) {
        this.$router.push({ name: 'script-locked' });
        return;
      }

      this.$store.commit('updateLoadStatus', true);

      setImmediate(() => {
        // Load code
        this.codeMirror.setValue('');
        this.codeMirror.setValue(this.data[options.codeField] || '');
        this.codeMirror.refresh();
        this.codeMirror.focus();

        // Lock editor
        if (this.conflictInfo || !this.canEditCode) {
          this.T.setCodeMirrorReadOnly(this.codeMirror, true);
        }

        // Updating the list of Funcs
        this.updateSelectableItems();

        if (this.$store.state.Editor_selectedItemId) {
          // Highlight the selected Func
          this.selectedItemId = this.$store.state.Editor_selectedItemId;
          this.highlightQuickSelectItem();
        } else {
          // Previous line
          let cursor = this.$store.state.Editor_scriptCursorMap[this.scriptId];
          this.T.jumpToCodeMirrorLine(this.codeMirror, cursor);
        }

        this.isReady = true;
      });

      // Hidden by default
      this.closeVueSplitPane();
    },
    async saveScript() {
      if (!this.canEditCode) return;
      if (!this.codeMirror) return;

      await this._saveCodeDraft();
    },
    foldCode(level) {
      this.T.foldCode(this.codeMirror, level);
    },
    redoSelectedItem(selectedItemId) {
      if (selectedItemId !== this.selectedItemId) return;

      this.selectedItemId = null;
      this.$nextTick(() => {
        this.selectedItemId = selectedItemId;
      });
    },
    _getDiff() {
      let fileTitle = this.data.title ? ` (${this.data.title})` : '';
      let fileName  = `${this.scriptId}${fileTitle}`;
      let oldStr    = this.data.code      || '';
      let newStr    = this.data.codeDraft || '';
      let oldHeader = this.$t('Published Code');
      let newHeader = this.$t('Saved Draft Code');
      let diffPatch = createPatch(fileName, oldStr, newStr, oldHeader, newHeader);

      return diffPatch
    },
    async showDiff() {
      if (this.canEditCode && this.codeMirror) {
        // Save
        let apiRes = await this._saveCodeDraft({ mute: true });
        if (!apiRes || !apiRes.ok) return;
      }

      let diff = this._getDiff();
      let createTimeStr = this.M().format('YYYYMMDD_HHmmss');
      let diffName = `${this.data.id}.diff.${createTimeStr}`;
      this.$refs.longTextDialog.update(diff, diffName);
    },
    async publishScript(action) {
      if (!this.canEditCode) return;
      if (!this.codeMirror) return;

      // Save
      let apiRes = await this._saveCodeDraft({ mute: true });
      if (!apiRes || !apiRes.ok) return;

      switch(action) {
        case 'confirm':
          let diff = this._getDiff();
          this.showPublishingConfirm = true;

          setImmediate(() => {
            // Init diff
            if (!this.codeMirror_publishingConfirm) {
              let opt = { mode: 'diff' };
              this.codeMirror_publishingConfirm = this.T.initCodeMirror('diff_publishingConfirm', opt);
              this.codeMirror_publishingConfirm.setOption('theme', this.T.getCodeMirrorThemeName());
              this.T.setCodeMirrorReadOnly(this.codeMirror_publishingConfirm, true);
            }

            // Load diff
            this.codeMirror_publishingConfirm.setValue(diff);
            this.codeMirror_publishingConfirm.refresh();

            this.codeMirror_publishingConfirm.focus();
          });
          break;

        case 'publish':
          // Clear all highlights
          this.updateHighlightLineConfig('selectedFuncLine', null);
          this.updateHighlightLineConfig('exceptionLine', null);

          // Script publishing in process
          this.workerRunning         = true;
          this.workerRunningTipTitle = this.$t('Publishing Script, it will be finished in a few seconds. If the page is not responding for a long time, please try refreshing.');
          let delayedLoadingT = setTimeout(() => {
            this.fullScreenLoading = true;
          }, 200);

          // Publish
          apiRes = await this.T.callAPI('post', '/api/v1/scripts/:id/do/publish', {
            params  : { id: this.scriptId },
            body    : { data: { note: 'Published by Code Editor'} },
            feedback: { okMessage: this.$t('Script published, new Script is in effect immediately'),  muteError: true },
          });

          // Script publishing finished
          clearTimeout(delayedLoadingT);
          this.fullScreenLoading     = false;
          this.workerRunning         = false;
          this.showPublishingConfirm = false;

          // Output results
          if (apiRes.detail && apiRes.detail.result) {
            this.outputResult('publish', this.scriptId, apiRes.detail.result);
          }

          // error pop-up
          if (!apiRes.ok) {
            this.alertOnError(apiRes);
            return;
          }

          // Refresh Sidebar
          this._refreshAside();

          // Synchronized Published / Draft
          this.data.code = this.data.codeDraft;
          break;
      }
    },
    async callFuncDraft() {
      if (!this.codeMirror) return;

      // Clear all highlights
      this.updateHighlightLineConfig('selectedFuncLine', null);
      this.updateHighlightLineConfig('exceptionLine', null);

      // Save
      if (this.canEditCode) {
        // Editable only
        let apiRes = await this._saveCodeDraft({ mute: true });
        if (!apiRes || !apiRes.ok) return;
      }

      let funcCallKwargs = null;
      try {
        funcCallKwargs = JSON.parse(this.funcCallKwargsJSON || '{}');
      } catch(err) {
        return this.T.alert(`${this.$t('Invalid argument format')}<br>${err.toString()}`);
      }

      // Func running
      const updateCountDownTipTitle = (countDown) => {
        let tipTitle = this.$t('Func is running. If it is not responding for a long time, please try refreshing.');
        if (countDown > 0) {
          tipTitle = this.$t('Func is running. It will wait at most {seconds} for the result. If it is not responding for a long time, please try refreshing.', { seconds: this.$tc('nSeconds', countDown) });
        }
        this.workerRunningTipTitle = tipTitle;
      }

      this.workerRunning = true;

      if (this.countDownTimer) {
        clearInterval(this.countDownTimer);
        this.countDownTimer = null;
      }

      let leftSeconds = this.$store.getters.SYSTEM_INFO('_FUNC_TASK_TIMEOUT_DEBUGGER');
      updateCountDownTipTitle(leftSeconds);

      this.countDownTimer = setInterval(() => {
        leftSeconds--;
        if (leftSeconds <= 0 || !this.workerRunning) {
          clearInterval(this.countDownTimer);
        }

        updateCountDownTipTitle(leftSeconds);
      }, 1000);

      let delayedLoadingT = setTimeout(() => {
        this.fullScreenLoading = true;
      }, 500);

      let apiRes = null;
      try {
        apiRes = await this.T.callAPI('post', '/api/v1/func-draft/:funcId', {
          params      : { funcId: this.selectedItemId },
          body        : { kwargs: funcCallKwargs },
          feedback    : { muteError: true },
          extraOptions: { noCountProcessing: true },
        });

      } catch(err) {
        return console.error(err);

      } finally {
        clearTimeout(delayedLoadingT);
        this.fullScreenLoading = false;
        this.workerRunning     = false;
      }

      // Output results
      if (apiRes.data && apiRes.data.result) {
        let argParts = [];
        for (let k in funcCallKwargs) if (funcCallKwargs.hasOwnProperty(k)) {
          let v = funcCallKwargs[k];
          if (v === null) {
            v = 'None';
          } else if (v === true) {
            v = 'True';
          } else if (v === false) {
            v = 'False';
          } else {
            v = JSON.stringify(v);
          }

          argParts.push(`${k}=${v}`);
        }
        let argStr = argParts.join(', ');
        this.outputResult('execute', `${this.selectedItemId}(${argStr})`, apiRes.data.result);
      }

      // Mark the Func ran (wait for the output panel is popped up and then execute it)
      setImmediate(() => {
        this.highlightQuickSelectItem();
      });

      this.alertOnError(apiRes);
    },
    async resetScript() {
      if (!this.canEditCode) return;
      if (!this.codeMirror) return;

      if (!await this.T.confirm(this.$t('Are you sure you want to reset the Script?'))) return;

      this.updateHighlightLineConfig('exceptionLine', null);

      await this.loadData({codeField: 'code'});

      // pop-up box tip
      this.T.notify(this.$t('Script has been reset to previous version'));
    },
    clearScriptOutput() {
      this.scriptOutput = [];

      this.updateHighlightLineConfig('selectedFuncLine', null);
      this.updateHighlightLineConfig('exceptionLine', null);

      this.resizeVueSplitPane(100);
    },
    outputResult(type, name, result) {
      this.funcCallSeq++;

      let status          = result.status;
      let peakMemroyUsage = result.peakMemroyUsage;
      let cost            = result.cost;
      let printLogs       = result.printLogs;
      let returnValue     = result.returnValue;
      let exception       = result.exception;
      let exceptionType   = result.exceptionType;
      let traceback       = result.traceback;

      // Add format for logs
      let printLogsHTML = printLogs.map(l => {
        // Since the beginning of the log is in a fixed format, it is handled directly with a string instead of a regular expression.
        let lineParts = l.split(' ');
        let timeTag      = `<span class="text-main">${lineParts[0]} ${lineParts[1]}</span>`
        let timeDiffTag  = `<span class="text-good">${lineParts[2]}</span>`
        let timeTotalTag = `<span class="text-good">${lineParts[3]}</span>`
        let logContent = htmlEscaper.escape(lineParts.slice(4).join(' '));

        return [timeTag, timeDiffTag, timeTotalTag, logContent].join(' ');
      });
      printLogs     = printLogs.join('\n')     || null;
      printLogsHTML = printLogsHTML.join('\n') || null;

      let output = {
        seq            : this.funcCallSeq,
        type           : type,
        name           : name,
        peakMemroyUsage: peakMemroyUsage,
        cost           : cost,
        printLogs      : printLogs,
        printLogsHTML  : printLogsHTML,
        returnValue    : returnValue,
        traceback      : traceback,
      };
      this.scriptOutput.push(output);

      this.openVueSplitPane();

      // Output box scrolls to the bottom
      setImmediate(() => {
        let $outputSeqs = document.getElementsByClassName('code-editor-output-seq');
        let $lastOutputSeq = $outputSeqs[$outputSeqs.length - 1];
        let $textOutputContainer = this.$refs.codeEditorTextOutput.$el.parentElement;
        let $outputPanel = $textOutputContainer.parentElement;
        $textOutputContainer.scrollTo({ left: 0, top: $lastOutputSeq.offsetTop - $outputPanel.scrollHeight + 35 });
        $textOutputContainer.scrollTo({ left: 0, top: $textOutputContainer.scrollHeight, behavior: 'smooth' });
      });

      // Mark the error line
      if (status !== 'success') {
        setImmediate(() => {
          // Get error line number
          let _re = new RegExp(`^\\s*File "${this.scriptId}", line (\\d+)(, in (\\w+))?$`, 'gm');
          let _m  = [...traceback.matchAll(_re)];
          let exceptionLine = parseInt(_m.pop()[1]) - 1;

          // Highlight error line
          this.updateHighlightLineConfig('exceptionLine', {
            line            : exceptionLine,
            scroll          : 1,
            marginType      : 'prev',
            textClass       : 'highlight-text',
            backgroundClass : 'exception-line-background highlight-code-line-blink',
            lineWidgetConfig: {
              type     : 'exceptionLine',
              innerHTML: `<span class="exception-info">
                            <i class="fa fa-fw fa-times-circle"></i>
                            <span>${exceptionType}</span>
                          </span> `,
            },
          });
        });
      }
    },
    autoFillFuncCallKwargsJSON(draftFuncId) {
      if (!this.selectedItem) return;

      if (this.funcCallKwargsJSONHistory[this.selectedItemId]) {
        // Fill the last input by default
        this.funcCallKwargsJSON = this.funcCallKwargsJSONHistory[this.selectedItemId];
      } else {
        // Fill default value
        if (this.selectedItem.type === 'def' && this.selectedItem.id === draftFuncId) {
          this.funcCallKwargsJSON = JSON.stringify(this.selectedItem.kwargs, null, 2);
        }
      }
    },
    endEdit(options) {
      options = options || {};

      let toRoute = {
        name  : 'code-viewer',
        params: { id: this.scriptId },
      };

      this.$router.push(toRoute);
    },
    resizeVueSplitPane(percent) {
      if (percent >= this.SPLIT_PANE_CLOSE_PERCENT) {
        // Simply close the window without recording the position
        this.$refs.vueSplitPane.percent = percent;
        return;
      }

      if (percent > this.SPLIT_PANE_MAX_PERCENT) {
        percent = this.SPLIT_PANE_MAX_PERCENT;
      } else if (percent < this.SPLIT_PANE_MIN_PERCENT) {
        percent = this.SPLIT_PANE_MIN_PERCENT;
      }

      this.$refs.vueSplitPane.percent = percent;
      this.debouncedUpdatePanePercent(this.$store, percent);
    },
    updateSelectableItems() {
      this.selectableItems = this.common.getPythonCodeSelectableItems(this.data.codeDraft, this.scriptId);
    },
    openVueSplitPane() {
      this.$refs.vueSplitPane.percent = this.splitPanePercent;
    },
    closeVueSplitPane() {
      this.$refs.vueSplitPane.percent = this.SPLIT_PANE_CLOSE_PERCENT;
    },
    alertOnError(apiRes, isPublish) {
      let title   = null;
      let message = null;
      switch(apiRes.reason) {
        case 'EWorkerNoResponse':
          this.T.alert(`${this.$t('Worker no response, please check the status of this system')}`);
          break;

        case 'EFuncTimeout':
          // this.T.alert(`${this.$t('Script publishing timeout, please make sure that no time-consuming code in global scope')}
          //     <br>${this.$t('If this issue persists, please contact the administrator to report this issue')}`);
          this.T.alert(`${this.$t('Waiting Func response timeout')}
              <span class="text-main">
                <br>${this.$t('There is a {seconds} time limit when calling Funcs in Code Editor', { seconds: this.$tc('nSeconds', this.$store.getters.SYSTEM_INFO('_FUNC_TASK_TIMEOUT_DEBUGGER')) })}
                <br>${this.$t('It is not recommended for synchronous calling Funcs that response slowly')}</small>
              </span>`);
          break;

        case 'EScriptPublishFailed':
          this.T.alert(`${this.$t('Script publishing failed. Please check your code')}
              <br>${this.$t('Detail information is shown in the output box bellow')}`);
          break;

        case 'EFuncFailed':
          this.T.alert(`${this.$t('Script executing failed. Please check your code')}
              <br>${this.$t('Detail information is shown in the output box bellow')}`);
          break;

        case 'EFuncResultParsingFailed':
          this.T.alert(`${this.$t('Func returned a value that can not been parsed as JSON. Please check your code')}
                <br>${this.$t('In general, common used types are safe (e.g. list, dict, int, float, str, bool, None).')}
                <br>${this.$t('Some math lib may return complicated values, like numpy.NaN. These values should be converted to common used types before returning')}`);
          break;

        case 'EClientDuplicated':
          this.T.alert(`${this.$t('Duplicated names of Funcs decorated by @DFF.API(...)')}
                <br>${this.$t('Please check the code and try again')}`);
          break;
      }

      if (this.scriptOutput.length > 0) {
        this.openVueSplitPane();
      }
    },
    _clearLineHighlight(line) {
      try {
        this.codeMirror.removeLineClass(line, 'text');
        this.codeMirror.removeLineClass(line, 'background');
        this.codeMirror.removeLineClass(line, 'wrap');

        let widgets = this.codeMirror.lineInfo(line).widgets;
        if (Array.isArray(widgets)) {
          widgets.forEach((w) => {
            w.clear();
          });
        }

      } catch(err) {
        // Nope
      }
    },
    _setLineHighlight(options) {
      if (!this.codeMirror) return null;

      options = options || {};

      // Add style
      if (options.textClass) {
        this.codeMirror.addLineClass(options.line, 'text', options.textClass);
      }
      if (options.backgroundClass) {
        this.codeMirror.addLineClass(options.line, 'background', options.backgroundClass);
      }
      if (options.wrapClass) {
        this.codeMirror.addLineClass(options.line, 'wrap', options.wrapClass);
      }

      // Add extras
      if (options.lineWidgetConfig) {
        let config = options.lineWidgetConfig;

        let div = null;
        switch(config.type) {
          case 'exceptionLine':
            div = document.createElement('div');
            div.classList.add('exception-line-text');
            div.classList.add('highlight-text');

            const editorStyle = this.$store.getters.codeMirrorSettings.style;
            div.style.top        = `-${parseInt(editorStyle.fontSize) * editorStyle.lineHeight}px`;
            div.style.fontSize   = `${editorStyle.fontSize}`;
            div.style.lineHeight = editorStyle.lineHeight;
            div.innerHTML        = config.innerHTML;
            break;
        }

        if (div) {
          this.codeMirror.addLineWidget(options.line, div);
        }
      }

      this.T.jumpToCodeMirrorLine(this.codeMirror, options.line);

      return this.codeMirror.lineInfo(options.line);
    },
    updateHighlightLineConfig(key, config) {
      let nextHighlightedLineConfigMap = this.T.jsonCopy(this.$store.state.codeEditor_highlightedLineConfigMap) || {};

      if (config === null) {
        // Clear highlighting
        if (nextHighlightedLineConfigMap[this.scriptId]) {
          delete nextHighlightedLineConfigMap[this.scriptId][key];
        }

      } else {
        // Set highlighting
        if (!nextHighlightedLineConfigMap[this.scriptId]) {
          nextHighlightedLineConfigMap[this.scriptId] = {};
        }
        nextHighlightedLineConfigMap[this.scriptId][key] = config;
      }

      if (!this.codeMirror) return;

      // Remove all old highlighting
      for (let scriptId in this.highlightedLineInfoMap) if (this.highlightedLineInfoMap.hasOwnProperty(scriptId)) {
        let lineInfoMap = this.highlightedLineInfoMap[scriptId];
        for (let key in lineInfoMap) if (lineInfoMap.hasOwnProperty(key)) {
          let lineInfo = lineInfoMap[key];
          this._clearLineHighlight(lineInfo.handle.lineNo());
        }
      }

      // Re-set highlighting
      let nextHighlightedInfoMap = {};
      let configMap = nextHighlightedLineConfigMap[this.scriptId] || {};
      for (let key in configMap) if (configMap.hasOwnProperty(key)) {
        let config = configMap[key];
        let lineInfo = this._setLineHighlight(config);
        if (lineInfo) {
          if (!nextHighlightedInfoMap[this.scriptId]) {
            nextHighlightedInfoMap[this.scriptId] = {};
          }
          nextHighlightedInfoMap[this.scriptId][key] = lineInfo;
        }
      }
      this.highlightedLineInfoMap = nextHighlightedInfoMap;

      this.$store.commit('updateCodeEditor_highlightedLineConfigMap', nextHighlightedLineConfigMap);
    },
    highlightQuickSelectItem() {
      if (!this.$store.state.isLoaded) return;
      if (!this.codeMirror) return;
      if (!this.selectedItem) return;

      // Clear previous selections
      this.updateHighlightLineConfig('selectedFuncLine', null);

      // Locate the selection line
      this.updateHighlightLineConfig('selectedFuncLine', {
        line           : this.selectedItem.line,
        marginType     : 'next',
        textClass      : 'highlight-text',
        backgroundClass: 'current-func-background highlight-code-line-blink',
      });
    },
    _convertScriptOutputToMarkdown(o) {
      // Separator line
      let divider = `# #${o.seq}`;

      // Title
      let titleLabel = '';
      switch(o.type) {
        case 'publish':
          titleLabel = this.$t('Publish Script') + this.$t(':');
          break;

        case 'execute':
          titleLabel = this.$t('Executed Func') + this.$t(':');
          break;
      }
      let title = `${titleLabel}\`${o.name}\``;

      // Logs
      let printLogs = '\`\`\`\n' + o.printLogs + '\n\`\`\`';

      // Memory consumption for execution
      let peakMemoryUsageInfo = '';
      if (o.peakMemroyUsage) {
        peakMemoryUsageInfo = `${this.$t('Peak Memory Allocated')}${this.$t(':')}${this.T.byteSizeHuman(o.peakMemroyUsage)}`;
      }

      // Run cost
      let costInfo = '';
      if (o.cost) {
        costInfo = `${this.$t('Time Cost')}${this.$t(':')}${this.$tc('nSeconds', o.cost)}`;
        if (o.cost > 3) {
          costInfo += `\n\n> ${this.$t('It took too much time for running (more than 3s), may not be suitable for synchronous calling scenario')}`;
        }
      }

      // Func return value
      let returnValueInfo = null;
      let returnValue = o.returnValue;
      if (returnValue) {
        returnValueInfo = `${this.$t('Return Value (pprint.saferepr)')}${this.$t(':')}\n\n\`\`\`\n${returnValue}\n\`\`\``;
      }

      // Call stack
      let tracebackTitle = null;
      let traceback = o.traceback;
      if (traceback) {
        tracebackTitle = `${this.$t('Stack')}`;
        traceback = '\`\`\`\n' + traceback + '\n\`\`\`';
      }

      let section = [ divider, title ]
      if (printLogs) {
        section.push(printLogs);
      }
      if (costInfo || peakMemoryUsageInfo) {
        if (peakMemoryUsageInfo) section.push(peakMemoryUsageInfo);
        if (costInfo)            section.push(costInfo);
      }
      if (returnValueInfo) {
        section.push(returnValueInfo);
      }
      if (tracebackTitle) {
        section.push(tracebackTitle,  traceback);
      }

      // Filter blank content
      section = section.filter(x => 'string' === typeof x).join('\n\n').trimStart();

      return section;
    }
  },
  computed: {
    SPLIT_PANE_MAX_PERCENT  : () => 80,
    SPLIT_PANE_MIN_PERCENT  : () => 30,
    SPLIT_PANE_CLOSE_PERCENT: () => 100,
    TEXT_OUTPUT_LIMIT       : () => 500,

    userInfo() {
      if (!this.$store.getters.isSignedIn) return {};
      return {
        username: this.$store.state.userProfile.username,
        name    : this.$store.state.userProfile.name,
      };
    },

    codeMirrorTheme() {
      return this.T.getCodeMirrorThemeName();
    },
    scriptId() {
      return this.$route.params.id;
    },
    scriptSetId() {
      return this.scriptId.split('__')[0];
    },
    conflictInfo() {
      return this.$store.getters.getConflictInfo(this.$route);
    },
    conflictUser() {
      if (!this.conflictInfo) return null;
      return this.conflictInfo.user.name || this.conflictInfo.user.username || 'Unknown';
    },

    funcCallKwargsShowValue() {
      if (this.T.isNothing(this.funcCallKwargsJSON)) return '';

      try {
        return Object.keys(JSON.parse(this.funcCallKwargsJSON)).join(', ');
      } catch(err) {
        return this.$t('Invalid argument format');
      }
    },

    lockedByUserId() {
      return this.data.sset_lockedByUserId || this.data.lockedByUserId;
    },
    lockedByUser() {
      if (this.data.sset_lockedByUserId) {
        return `${this.data.sset_lockedByUserName || this.data.sset_lockedByUsername}`
      } else if (this.data.lockedByUserId) {
        return `${this.data.lockedByUserName || this.data.lockedByUsername}`
      }
    },
    isLockedByMe() {
      return this.lockedByUserId === this.$store.getters.userId
    },
    isLockedByOther() {
      return this.lockedByUserId && !this.isLockedByMe;
    },

    canReadCode() {
      return this.common.lockConfigCan( this.data.lockedByUserId, this.data.lockConfigMemberAllowMap, [
          'scriptSet_readScriptCode',
          'scriptSet_editScriptCode',
          'script_readCode',
          'script_editCode']);
    },
    canEditCode() {
      return this.common.lockConfigCan(this.data.lockedByUserId, this.data.lockConfigMemberAllowMap, [
          'scriptSet_editScriptCode',
          'script_editCode' ]);
    },

    splitPanePercent() {
      return this.$store.state.codeEditor_splitPanePercent || this.$store.getters.DEFAULT_STATE.codeEditor_splitPanePercent;
    },
    codeLines() {
      return (this.data.code || '').split('\n').length;
    },
    codeDraftLines() {
      return (this.data.codeDraft || '').split('\n').length;
    },
    scriptOutputLastOneText() {
      if (this.scriptOutput.length <= 0) return '';

      let outputText = this._convertScriptOutputToMarkdown(this.scriptOutput.slice(-1)[0]);
      return outputText;
    },
    scriptOutputText() {
      let sections = [];
      this.scriptOutput.forEach(o => {
        let section = this._convertScriptOutputToMarkdown(o);
        sections.push(section);
      });

      let outputText = sections.join('\n\n');
      return outputText;
    },
    scriptOutputHTML() {
      let sections = [];
      this.scriptOutput.forEach(o => {
        // Separator line
        let divider = `<span class="code-editor-output-info">#<span class="code-editor-output-seq">${o.seq}</span></span>`;

        // Title
        let titleLabel = '';
        switch(o.type) {
          case 'publish':
            titleLabel = this.$t('Publish Script') + this.$t(':');
            break;

          case 'execute':
            titleLabel = this.$t('Executed Func') + this.$t(':');
            break;
        }
        let title = `<span class="code-editor-output-info">${titleLabel} <code>${o.name}</code></span>`;

        // Log
        let printLogsHTML = o.printLogsHTML;

        // Memory consumption for execution
        let peakMemoryUsageInfo = '';
        if (o.peakMemroyUsage) {
          peakMemoryUsageInfo = `<span class="code-editor-output-info">${this.$t('Peak Memory Allocated')}${this.$t(':')}${this.T.byteSizeHuman(o.peakMemroyUsage)}</span>`;
        }

        // Run cost
        let costInfo = '';
        if (o.cost) {
          costInfo = `<span class="code-editor-output-info">${this.$t('Time Cost')}${this.$t(':')}${this.$tc('nSeconds', o.cost)}</span>`;
          if (o.cost > 3) {
            costInfo += `<br>&#12288;<span class="text-watch">${this.$t('It took too much time for running (more than 3s), may not be suitable for synchronous calling scenario')}</span>`;
          }
        }

        // Func return value
        let returnValueInfo = null;
        let returnValue = o.returnValue;
        if (returnValue) {
          // HTML escaping
          returnValue = htmlEscaper.escape(returnValue);

          returnValueInfo = `<span class="code-editor-output-info">${this.$t('Return Value (pprint.saferepr)')}${this.$t(':')}</span><br><code>${returnValue}</code>`;
        }

        // Call stack
        let tracebackTitle = null;
        let traceback = o.traceback;
        if (traceback) {
          tracebackTitle = `<span class="code-editor-output-info">${this.$t('Stack')}${this.$t(':')}</span>`

          // HTML escaping, adding styles
          traceback = traceback
          .split('\n')
          .map(line => {
            return `<code class="code-editor-output-traceback">${htmlEscaper.escape(line)}</code>`;
          })
          .join('\n');
        }

        let section = [ divider, title ]
        if (printLogsHTML) {
          section.push('', printLogsHTML);
        }
        if (costInfo || peakMemoryUsageInfo) {
          section.push('');
          if (peakMemoryUsageInfo) section.push(peakMemoryUsageInfo);
          if (costInfo)            section.push(costInfo);
        }
        if (returnValueInfo) {
          section.push('', returnValueInfo);
        }
        if (tracebackTitle) {
          section.push('', tracebackTitle,  traceback);
        }

        // Filter blank content
        section = section.filter(x => 'string' === typeof x).join('\n').trimStart();

        sections.push(section);
      });

      let outputHTML = sections.join('\n\n');

      // Limit total output
      let lines = outputHTML.split('\n');
      if (lines.length > this.TEXT_OUTPUT_LIMIT) {
        outputHTML = lines.slice(-1 * this.TEXT_OUTPUT_LIMIT).join('\n');
      }

      return outputHTML;
    },

    isValidFuncCallKwargsJSON() {
      // Allow blanks
      if (this.funcCallKwargsJSON.trim() === '') {
        return true;
      }

      // Must be a dict
      if (this.funcCallKwargsJSON.trim()[0] !== '{') {
        return false;
      }

      // Must be parsable JSON
      let _parsed = null
      try {
        _parsed = JSON.parse(this.funcCallKwargsJSON)
      } catch(e) {
        return false;
      }

      return true;
    },

    selectedItem() {
      if (!this.selectedItemId) return null;

      for (let i = 0; i < this.selectableItems.length; i++) {
        let _item = this.selectableItems[i];
        if (_item.id === this.selectedItemId) {
          return _item;
        }
      }
    },
    isFuncSelected() {
      if (!this.selectedItem) return false;
      return this.selectedItem.type === 'def';
    },
  },
  props: {
  },
  data() {
    return {
      isReady: false,
      isNewLoaded: true,
      codeMirror: null,
      codeMirror_publishingConfirm: null,

      highlightedLineInfoMap: {},

      currentErrorLineInfo: null,

      data     : {},
      scriptSet: {},

      selectableItems: [],
      selectedItemId : '',

      funcCallSeq              : 0,
      funcCallKwargsJSON       : '',
      funcCallKwargsJSONHistory: {},

      countDownTimer       : null,
      fullScreenLoading    : false,
      workerRunning        : false,
      workerRunningTipTitle: '',

      // text output
      scriptOutput: [],

      // for optimistic locking
      prevCodeDraftMD5: null,

      // Code saving flag
      isSavingCodeDraft: false,

      // Monkey patch tips
      img_noticeMonkeyPatch: img_noticeMonkeyPatch,

      // Code editor settings
      showEditorSetting: false,

      // Confirm before publishing
      showPublishingConfirm: false,
    }
  },
  created() {
    this.debouncedUpdatePanePercent = this.T.debounce((store, nextPercent) => {
      store.commit('updateCodeEditor_splitPanePercent', nextPercent);
    }, 100);
  },
  mounted() {
    setImmediate(() => {
      // Init editor
      this.codeMirror = this.T.initCodeMirror('editor_CodeEditor');
      this.codeMirror.setOption('theme', this.codeMirrorTheme);
      this.codeMirror.on('cursorActivity', () => {
        if (!this.isReady) return;

        let cursorInfo = {
          scriptId: this.scriptId,
          cursor  : this.codeMirror.getCursor(),
        };
        this.$store.commit('updateEditor_scriptCursorMap', cursorInfo);
      });

      // Save automatically
      let autoSaveFuncCreator = (scriptId) => {
        return this.T.debounce((editor, change) => {
          if (scriptId !== this.scriptId) return;
          if (!this.canEditCode) return;
          if (!this.codeMirror) return;

          if (this.isNewLoaded) {
            this.isNewLoaded = false;
            return;
          }

          let codeDraft = this.codeMirror.getValue();

          /* When auto-save, check the number of changed rows, and do not auto-save if the change is too large. */
          // Code is not auto-saved when emptied
          if (!codeDraft.trim()) return;

          // Skip auto-save if more than 30 lines, or 30%, are modified at one time
          let draftDiffInfo = this.T.getDiffInfo(this.data.codeDraft, codeDraft);
          let changedCount = Math.max(draftDiffInfo.addedCount, draftDiffInfo.removedCount);
          if (changedCount > 30 || (changedCount / draftDiffInfo.srcTotalCount > 0.3)) return;

          // Auto-save as quiet save
          this._saveCodeDraft({ mute: true });
        }, 1 * 1000);
      }

      this.codeMirror.on('change', autoSaveFuncCreator(this.scriptId));
    })
  },
  beforeDestroy() {
    this.T.destoryCodeMirror(this.codeMirror);
  },
  async beforeRouteLeave(to, from, next) {
    // Clear all highlighting
    this.updateHighlightLineConfig('selectedFuncLine', null);
    this.updateHighlightLineConfig('exceptionLine', null);

    if (!this.canEditCode) {
      return next();
    }
    if (!this.codeMirror) {
      return next();
    }
    if (!this.$store.getters.isSignedIn) {
      return next();
    }
    if (this.T.isNothing(this.data)) {
      return next();
    }

    // Save
    let apiRes = await this._saveCodeDraft({ mute: true });
    if (apiRes && apiRes.ok) {
      return next();
    }
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.select-todo-tag {
  width: 62px;
  text-align: left;
}
.select-item-tag {
  width: 42px;
  text-align: center;
}
#editor_CodeEditor {
  display: none;
}
.conflict-info {
  color: var(--danger);
  font-size: 12px;
}
.el-header {
  box-shadow: 5px 5px 5px var(--base-light);
  z-index: 5;
}
.code-editor {
  padding-right: 5px;
}
.code-editor-action-title {
  font-size: 22px;
}
.code-editor-action-title i.fa {
  font-size: 18px;
}
.code-editor-action-left {
  padding: 10px 25px 10px 0;
  position: absolute;
  background-image: linear-gradient(to left, var(--base-transparent) 0%, var(--base) 20px);
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.code-editor-action-left:hover {
  z-index: 1;
}
.code-editor-action-breaker {
  height: 50px;
}
.code-editor-action-right {
  float: right;
  padding: 10px 0 10px 25px;
  background-image: linear-gradient(to right, var(--base-transparent) 0%, var(--base) 20px);
  position: relative;
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.code-editor-action-right > div {
  margin-right: 10px;
}
</style>
<style>
#editorContainer_CodeEditor {
  padding: 1px 0 0 5px;
  position: relative;
}
#editorContainer_CodeEditor .CodeMirror {
  height: 100% !important;
  position: absolute !important;
  top: 0;
  left: 5px;
  right: 0;
}
#editorContainer_CodeEditor .CodeMirror-wrap {
  border: none !important;
}
.CodeMirror .highlight-text {
  text-shadow: var(--text-shadow);
}
.CodeMirror .exception-info {
  max-width: 15vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  background-color: var(--danger);
  color: var(--text-carving);
  display: block;
  padding: 0 5px;
}

.CodeMirror .current-func-background {
  border: 2px solid;
  border-image: linear-gradient(to right, var(--primary) 30%, var(--primary-transparent) 100%) 1 1;
  border-right: none;
}
.CodeMirror .exception-line-background {
  border: 2px solid;
  border-image: linear-gradient(to left, var(--danger) 10%, var(--danger-transparent) 100%) 1 1;
  border-left: none;
}

.CodeMirror .exception-line-text {
  position: absolute;
  color: var(--danger);
  right: 0;
}

.code-editor-call-func-kwargs-json {
  font-size: 12px;
}
.code-editor-output {
  height: 100%;
  overflow: hidden;
  position: relative;
}
.code-editor-output pre {
  margin: 0;
  padding-bottom: 70px;
  padding-right: 10px;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 14px;
}
.code-editor-output .el-tabs {
  height: 100%;
  margin-left: 5px;
  margin-top: 5px;
  border: none;
}
.code-editor-output .el-tabs__content {
  height: 100%;
  overflow: auto;
}
.code-editor-output-close {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  right: 0;
  top: 5px;
  z-index: 100;
  background-color: var(--base);
  padding: 0 10px 5px 10px;
  border-radius: 3px;
}
.code-editor-output-close >* {
  margin: 0 10px;
}
.code-editor-output-close .clear-script-output * {
  font-size: 12px;
}
pre .code-editor-output-info {
  color: grey;
}
.code-editor-output-info + .code-editor-output-info:last-child {
  margin-bottom: 10px;
}
pre .code-editor-output-seq {
  font-size:large
}
pre .code-editor-output-traceback {
  color: var(--danger);
}
</style>
