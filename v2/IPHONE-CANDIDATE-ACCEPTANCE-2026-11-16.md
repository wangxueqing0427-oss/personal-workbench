# 独立加密候选：Safari / iPhone / PWA 验收

日期：2026-11-16（Asia/Shanghai）。只用合成资料；真机状态为 **BLOCKED / NOT_RUN**，不能用桌面 WebKit 模拟结果替代。

## 已核实基线与隔离决策

- 分支：`dev/v2-preview-isolated-20261111`；本轮读取基线 `e4b45e8fde68542ec4e5d294af46919a2f151763`，提交内容为候选 PNG 图标白名单与离线缓存修复。
- 基线构建 [43777478278](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43777478278) 为 SUCCESS，Chromium / WebKit 两个 job 成功。未过期产物：`14186707753` / `14186758729`，各 65,372 bytes，到期时间为 2026-11-22 23:57 UTC 附近；产物存在不等于已部署。
- 最近部署 [43776649147](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43776649147) 的日志显示专用 Token 为空，在非空检查处失败；构建、Cloudflare 预检、部署均未执行。本轮不重试该阻塞。当前 Secret 是否后来配置、其权限范围和套餐状态均未取得可验证证据。
- 仓库树未见 Pages 部署配置。已有 Workers 静态候选配置可复用：固定 `personal-workbench-v2-encrypted-candidate`，独立 `candidate-public`，无脚本、数据绑定、路由或迁移。Pages 不会减少凭据核验要求，故不新增第二套入口。
- 旧 `personal-workbench-v2-preview` / `personal-workbench-v2-staging` 配置带 Durable Object 与同步脚本，不适合作为本轮测试入口。其配置、工作流和站点不改动；两个部署 trigger 文件不改动。

## 本轮新增

- `iphone-diagnostics.html` / `.js` 加入候选构建输入、SHA256 清单、完整性安装和离线缓存；工作台锁定页面亦有入口。诊断页不加载业务库、不读取 IndexedDB / localStorage，不记录文件名、媒体内容或业务内容。
- 检查安全上下文、独立窗口、相机 / 麦克风权限查询、语音接口和候选 Service Worker。查询不支持、设备不可用、权限拒绝与策略阻挡分开说明；不把 API 存在当成实测通过。
- 只有点击才请求相机或麦克风，两个请求分离；不录音、不拍照，获取流后立即停止全部轨道。页面离开、授权迟到和超时后到达的流亦停止；未答复的权限弹窗记为待定，不自动重试。
- 原生文件拍摄和相册选择只记录选择事件，随即解除选择，不读取文件字节。实际照片应在工作台用空白纸拍摄并验收加密保存。
- Safari 分享安装说明、iOS 独立窗口信号和离线控制状态。无法从标签页可靠判断其他窗口是否已安装；无安装提示事件不等于无法安装。诊断 JSON 始终保留 `realDeviceAcceptance: NOT_RUN` 和手动安装 / 离线重启待验字段。
- 部署工作流另加专用 `V2_ENCRYPTED_CANDIDATE_SCOPE_CONFIRMED` / `V2_ENCRYPTED_CANDIDATE_FREE_PLAN_CONFIRMED` 门禁，配置改为顶层与资产字段白名单。不依赖旧 preview 的确认标记来证明新项目凭据隔离。普通源码修改只触发无部署构建 CI。

## 部署前必须取得的证据

本轮 **停止部署**。Token 名称、能读取目标 Worker、目标零绑定、HTTP 403 或一次成功部署，都不能证明 Token 无权触达生产；不通过探测生产接口来验证。

账户持有人仅需一次性完成：创建上述名称的专用空 Worker，确认免费套餐与 workers.dev；创建 **Workers Editor、Specified Workers 仅该 Worker** 的新 Token，保存为 `CLOUDFLARE_ENCRYPTED_CANDIDATE_API_TOKEN`。提供不含 Token 值的权限策略证明（角色、唯一资源、无账户级或其他资源授权），经核对后再开启上述两项专用门禁。不要发送密钥到聊天，不修改旧 Token，也不授予账户级 Workers Admin。新 Worker 不绑定数据资源、变量、自定义域名或生产路由。

官方依据：[Workers 资源级权限](https://developers.cloudflare.com/workers/authorization/workers/)、[单 Worker 授权说明](https://developers.cloudflare.com/changelog/post/2026-09-15-granular-worker-permissions/)。创建新 Worker 和给已存在的单个 Worker 部署是不同权限；助手不申请扩大账户权限。

拿到并核实范围证明后才允许触发一次候选部署，检查预检、静态资产 SHA、响应头与远端 Chromium / WebKit；成功后再把实际 HTTPS 链接交给用户。此文档中的候选域名是配置目标，**不是已上线证明**。不启用付费服务、不迁移、不接入真实数据。

## 用户最终真机最少三组动作（HTTPS 验证成功后）

|组|操作|通过标准 / 记录|
|---|---|---|
|1 Safari 权限|用 Safari 打开助手验过的精确候选链接；进入检查页，先拒绝相机 / 麦克风，再从网站 / 系统设置允许并重试；拍空白纸、选合成图片；返回工作台新建测试密码与“合成测试医院”，附件处重复拍摄 / 相册保存。|拒绝不崩溃，手工记录可继续；允许后诊断显示设备已释放，系统占用指示消失；工作台附件可打开。选择取消不算失败。不拍人、票据或业务资料。|
|2 语音草稿与加密|“＋记录”说“合成测试，下周二跟进”；不支持则用键盘麦克风；编辑文字后留草稿，切换应用再返回，锁定 / 重开，先试错误密码再正确解锁。|文字可编辑；拒绝语音权限可手输；草稿保留；错误密码不解锁；重开先出现密码页。仅说合成语句，系统识别可能走系统服务。|
|3 安装与断网|Safari 分享 → 添加到主屏幕（如有“作为 Web App 打开”保持开启），从新候选图标启动并打开检查页；联网等离线就绪，再飞行模式关闭并从图标重启、解锁；恢复网络。生成并复制诊断结果，附 iOS 版本及三组成功 / 失败。|独立窗口为“是”；飞行模式仍可启动到锁定页、解锁并看到刚才合成记录 / 附件 / 草稿。Safari 与独立窗口数据是否共享必须观察，若出现空库只新建合成库，不导入旧数据、不清缓存。|

补充记录：首次提示文案、拒绝后重试结果、相机与相册取消行为、语音实际路径、Safari / PWA 数据是否共享、飞行模式启动与前后台切换。无需卸载、修改或重新验收旧站点；不删除旧主屏幕图标。Face ID / WebAuthn 未实现，不能声称可用。

安装依据：[WebKit Safari 26 Web App 行为](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)。手动“添加到主屏幕”与实际独立窗口行为仍以用户 iOS 版本为准。

## 验证记录

- 本机从连接器按基线取回所需文本；普通 Git clone 网络失败，因此本机是**部分重建验证快照**，不是远端分支的完整 clone，未改写远端历史。构建器原有“必须等于本地 HEAD 输入”约束保留，不伪装源码 SHA。
- 本机使用已安装 Edge 的 Chromium 引擎与宿主 Playwright；新诊断边界 12 项、完整候选业务及离线诊断、Service Worker 完整性 8 项执行结果见后续交接。该结果不是固定版本 Linux CI，更不是 iPhone 真机。
- CI 将继续用既有 Playwright 1.56.1、Linux Chromium / WebKit 跑完整候选、离线完整性和新诊断测试。新提交的实际结果须读取 Actions 后记录，不能沿用基线绿灯。

状态：准备工作可无凭据完成；远端 HTTPS 与真实 iPhone 为 BLOCKED。未读取真实业务数据、未部署、未修改 main / V1.5.7 / 旧站点、未启用付费服务。

## 本轮最终 CI 证据

- 代码提交：`50632b1d5da41f48719c1c9ec195d47d8be1ce9f`。构建 [43779408305](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43779408305) 已完成 SUCCESS（2026-11-16 08:17，Asia/Shanghai）。
- Chromium：候选 27 + Service Worker 8 + 新诊断 12 = 47 项；WebKit：候选 29 + Service Worker 8 + 新诊断 12 = 49 项。合计 **96 PASS / 0 FAIL**；真 iPhone、Safari 系统权限、主屏幕安装和物理断网重启仍为 **BLOCKED / NOT_RUN**。
- releaseId：`e082be181307842397b4f8f1f3c0dfd9a0ed6b74d6e8f6e71ee0831623ae465c`。清单 12 个资产（含 SW），离线缓存 11 个资产；完整性失败继续保留旧有效资源。
- Chromium 产物 `14186749920`、WebKit 产物 `14188005310`，各 70,262 bytes，2026-11-23 08:17（Asia/Shanghai）附近到期；本轮只核实产物元数据和成功构建日志，未下载 ZIP，不把产物说成在线站点。
- 本机验证为 47 PASS；配置门禁另验证合法配置可通过，未知 env / services、额外 assets binding 和启用 observability 共 4 种不允许配置均被拒绝。本机快照 SHA 仅用于本机验证，不用作 GitHub 代码 SHA。
- 新代码仅触发无部署构建工作流；未写入任何部署 trigger，未发起 Cloudflare 请求或部署。最终交接文档提交只更新本文件和 CURRENT，不改变已验过的候选输入，不需重复业务测试。
