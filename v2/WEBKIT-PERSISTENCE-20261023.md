# Windows WebKit 持久离线阻塞定位与回归

日期：2026-10-23。开发分支 `dev/issue-1-staging-regression`，开始时 HEAD `f8fb8cc`。PR #2 已核对为 Draft，目标 `dev/v2-p0-data-safety`，未合并。工作区开始时干净。

## A. 原因与修复范围

### 1. 不依赖工作台的路径兼容问题

`probe-webkit-persistence.cjs` 建立新的本地 HTTP 服务及新的合成配置，只执行原生 IndexedDB / CacheStorage / File API，不加载工作台脚本。

| 持久 profile | 浏览器子进程 TEMP/TMP | 最小 IndexedDB 写入及重开 | CacheStorage |
| --- | --- | --- | --- |
| 默认用户目录，含中文 | 原默认目录 | `UnknownError: Unable to open database file on disk` | 未进入 |
| 纯 ASCII | 原含中文临时目录 | PASS | `Failed writing data to the file system` |
| 纯 ASCII | 纯 ASCII 临时目录 | PASS | PASS |
| 含中文 | 纯 ASCII 临时目录 | 同样 IndexedDB 错误 | 未进入 |

完整应用缓存测试还需要更短的 ASCII 路径；长的测试目录组合曾失败，缩短 profile/temp 目录后 CacheStorage 与 Service Worker 激活通过。本轮确定的是该 Windows WebKit 构建的路径兼容限制；没有定位到底层 C++ 行，也没有声称证明某个具体 MAX_PATH 阈值或修复引擎本身。

修复仅在测试工具内：Windows WebKit 创建短 ASCII 合成测试目录，浏览器子进程单独设置 TEMP/TMP；不更改 Windows 全局环境，不修改真实浏览器 profile，不删除原件、不迁移 IndexedDB。

### 2. 独立存在的离线模拟限制

同一最小页面、同一浏览器版本，读取一个新建的 **3 字节内存 File**：在线 PASS；`context.setOffline(true)` 后 `NotReadableError: The I/O read operation failed`；关闭离线模拟后再次 PASS。该复现不使用工作台、同步模块或真实文件。

因此原测试在读取待保存 File 时遇到的第二项阻塞，是此 Windows WebKit / Playwright 离线模拟组合的限制。不能通过删附件、跳过读校验、改业务代码自动覆盖，或把它改标为 PASS 来解决。

最终默认 WebKit `browser-emulation` 用例保留 **BLOCKED**，退出码 2。机器结果保留原始执行异常 `rawExecutionFailed=true`；只有同版本、无应用最小对照同时证明在线成功/离线失败/恢复后成功，才允许归类 BLOCKED。其他意外异常仍归 FAIL。

相关上游背景：[Playwright #42775](https://github.com/microsoft/playwright/issues/42775) 记录了 WebKit `setOffline` 阻断不需要网络的 Service Worker 导航。其平台、API 及版本不完全相同，**只能作为背景，不能作为本地 File API 故障的直接证明**；本报告判断依据是提交的最小复现结果。未升级共享 Playwright、浏览器或安装新软件。

### 3. 独立停机对照，不冒充原用例

增加显式 `WB_OUTAGE_MODE=origin-stopped`：停止测试页面源站和本地合成同步后端，关闭整个浏览器，再在服务仍停止时用相同新 profile 打开缓存页面；恢复两个服务的原端口后触发合成 online 事件，检验应用监听及重试。这个对照不使用 `setOffline`，也不代表真实设备网络状态。

首次恢复等待窗口 60 秒不足，曾出现 4 项 PASS 后恢复断言 FAIL；现保留该过程说明。既有单请求超时可达 60 秒，测试等待扩为 120 秒、总上限 360 秒，使首次超时及后续重试都有完成机会；不修改应用超时或重试算法，不跳过断言。

本地后端夹具支持可选固定端口及关闭自己创建的连接，以便在同一 URL 上重启。所有状态、密钥、附件均为新生成合成数据。

## B. 本轮测试结果

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| 原始含中文 profile 的底层 DB 问题 | 可重复复现；测试路径规避后 DB 重开 PASS | `webkit-persistence-probe-results.json` |
| 默认 WebKit `setOffline(true)` 完整用例 | **BLOCKED**，不是 PASS | `offline-webkit-browser-emulation-results.json` |
| WebKit 源站/同步后端停止对照 | **PASS 25 项** | `offline-webkit-origin-stopped-results.json` |
| Edge 原始离线模拟完整用例 | **PASS 25 项** | `offline-test-results.json` |
| WebKit 备份/隔离恢复，两种宽度 | **PASS 56 项** | `test-safety.cjs` 本轮运行输出 |
| WebKit 业务界面，两种宽度 | **PASS 70 项** | `phase2-webkit-results.json` |
| 本地 HTTP 同步 | **PASS 18 项** | `sync-http-results.json` |
| Worker 鉴权/CAS/分片/隔离会话模拟 | **PASS 42 项** | `test-staging.cjs` 本轮运行输出 |

完整套件断言合计 **236 PASS，最终未解决 FAIL 0，BLOCKED 1 个完整用例**。最小探针包含预期失败的环境对照，不混入通过断言数量。中间失败和原始 BLOCKED 执行都没有被隐藏：较早缓存诊断失败保留于 `offline-webkit-test-results.json`，不是最终完整用例结果。

两个完整对照套件均涵盖：

- 新增离线业务记录、队列与三份原件；整个浏览器关闭重开仍保留。
- 恢复可用连接后自动处理队列，本地测试后端正确获得五个持久任务。
- 三份合成原件（2 MiB、128 KiB、128 KiB）的数量、关联、长度与 SHA-256 验证。
- 最终响应丢失后保留队列，再读服务器确认成功，不重复增长版本。
- 备份与隔离恢复、事务中断及 QuotaExceeded 注入，记录/原件/队列一起回滚。
- 双端冲突、核对草稿不写数据、旧核对不能覆盖新编辑、显式合并保留两端历史和原件。
- 分片中断进度保存，刷新重开续传；超容量 13 MiB 原件留在本地、不产生部分云端提交。

## C. 复现命令

使用项目已有 Node/Playwright；`PLAYWRIGHT_BROWSERS_PATH` 指向项目忽略目录中的 `v2/.tools/browsers`。PowerShell 环境变量只在各命令子进程有效。

```powershell
$env:WB_BROWSER='webkit'
node v2/probe-webkit-persistence.cjs
node v2/test-offline.cjs # 原生模拟：预期 BLOCKED / exit 2，不是通过
$env:WB_OUTAGE_MODE='origin-stopped'
node v2/test-offline.cjs # 独立源站停止对照
```

在另一个新进程运行 Edge，避免继承前面的对照模式：

```powershell
$env:WB_BROWSER='edge'
$env:WB_OUTAGE_MODE='browser-emulation'
node v2/test-offline.cjs
node v2/test-sync-http.cjs
node v2/test-staging.cjs
```

WebKit 必要页面回归为 `WB_BROWSER=webkit node v2/test-safety.cjs` 和 `node v2/test-phase2.cjs`（Windows 按上例设置环境变量）。

## D. 数据安全、剩余风险及用户操作

- 本轮测试没有访问 Cloudflare：共享 35 条数据及两份原件没有被本轮读取、写入、恢复或破坏性测试。只读 iPhone 服务端验收仍以既有 `f8fb8cc` 报告为证，不声称今天重新校验了服务器哈希。
- 没有修改应用运行源码或部署配置，没有构建/部署；main / 生产 V1.5.7 保持不变。仅更新原隔离分支和现有 Draft PR，不合并。
- 用户已通过的 iPhone 合成验收不受上述 Windows 自动化限制推翻；不要求重复 iPhone 测试。
- 原生 `setOffline` 用例仍受阻，需上游修复或未来隔离验证另一个引擎版本；没有把停机对照替换成其 PASS。
- 本轮并不证明所有 iOS 版本、系统重启或长时间存储回收均安全。正式发布和真实资料接入仍需独立授权。
- **当前不需要用户操作。**
