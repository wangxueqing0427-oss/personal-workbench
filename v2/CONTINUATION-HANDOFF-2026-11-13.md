# 01｜个人工作台 V2.0 — 续聊接管索引（2026-11-13）

> 此文件为聊天长度限制下的压缩交接，不是重新立项指令。最新源码和自动化结果以仓库开发分支及Actions为准。

## 项目与用户工作方式

- 仓库：`wangxueqing0427-oss/personal-workbench`；唯一允许继续开发的源码分支：`dev/v2-preview-isolated-20261111`。
- V1.5.7 正式版、原 V2 staging、`main`、真实医院/设备/耗材/联系人/附件数据，不迁移、不覆盖、不擅自发布。
- 合成数据公开预览地址：`https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`。仅供预览，公开可访问，**禁止输入真实业务资料**。
- **用户最新决定**：自己单人使用，优先**实用、稳定、视觉舒服、手机顺手**；不用继续把复杂PKI/设备身份体系当作下一阶段重点。保留已有最小必要安全护栏：备份和恢复校验、照片原件、断网数据防丢、防静默覆盖、独立环境隔离。
- Assistant 负责代码、自动化、修复和审核，用户只做最终 iPhone 真机验收；节省聊天篇幅，不分阶段让用户复制复杂指令给Codex。
- 设计方向：轻商务、低噪音、深海军蓝+青蓝、舒服留白、清晰信息层级、拇指可点的44px以上操作、高频入口显眼；保持五个底部导航。

## 近期已验证主线

- 本机逐记录加密、附件分块、增量离线队列、双浏览器云端模拟、真实独立Cloudflare合成E2E等已经做过大量自动化验证，**不是正式生产授权**。历史报告在`v2/*REVIEW*.md`。
- 最近独立合成预览曾成功部署至Cloudflare，并做过两浏览器来源固定、PIN遮罩、原件/备份/离线验收。
- 搜索医院、项目状态、设备型号和联系人、保留医院改名旧别名、耗材订单拍照上传与关联，已经在之前独立预览投入合成演示。

## 本轮“手机视觉舒适度+快捷跟进”开发

- `v2/business-ui.js`：首页深色重点摘要区（今日/逾期/等待反馈/本周）、四个快捷入口、项目高对比扫读卡片与快捷按钮；医院搜索/医院档案清晰卡片；项目详情重点下一步、设备节点、进展时间线；新`quick-project`表单允许在一页修改状态、跟进日期、下一步、等待对象并可选记录进展，使用`saveProject`和`storage.commit`完成单次真实持久化，不是假按钮；耗材采购KPI和直接拍照上传单据、流程操作折叠。
- `v2/business.css`：iPhone优先轻商务设计系统，柔和背景/深色hero/卡片阴影/筛选/状态标签/时间线/44px点击区/底部导航/安全区适配/减少动画选项。
- `v2/test-mobile-business-ux.cjs`：新增视觉布局检查与快捷编辑实存检查；**Chromium 37/37 + WebKit 37/37 = 74项成功**，见 [Actions 43415383358](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43415383358)。
- `v2/privacy-device-trust-poc.js`：之前兼容性回归偶发本机测试库删除被未关闭的IndexedDB句柄阻塞，仅对该实验模块改为“读取事务结束+关闭连接后才resolve”，用于防止测试清理竞态；与真实业务界面无关。随后需要按最新工作流`v2-local-crypto-poc.yml`结果确认回归。
- 独立 Preview preflight [43415747388](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43415747388)成功。**视觉升级已发布到独立合成数据预览，并已通过发布后双浏览器实测**：[Actions 43416203965](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43416203965)，Chromium 121/121、WebKit 117/117，合计238项通过、0失败。部署源提交 `3c82fb61c94dd715650eb38ab7d067504b1c7b4c`，19项静态资源一致性通过，releaseId `9fb98c940f6451fe846c568a2e6fff42b1385061931e948a0662094b068ca570`。**这不等于 V1.5.7 正式版更新或真实 iPhone 终验**。

## 下一阶段连续推进

1. 上述浏览器回归与独立预览线上验收均已完成，不要重复旧阶段。旧本机测试库删除句柄竞态已修复，最新兼容回归 [43415747194](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43415747194) Chromium+WebKit 均绿色。
2. 继续迭代首页项目卡片的单手操作、快捷跟进与日期变更，再优先改进拍照附带简短进展备注的交互；每次在合成区先测试，不对 V1/正式数据写入。
3. 继续优先打磨“首页今天要办 -> 快速编辑跟进 -> 联系人反馈 -> 关联照片”和日常耗材未开票/未回款项目的显示；不展开新的复杂身份系统。
4. 未来用户亲自iPhone验收时再决定是否发布到正式版本，绝不把合成预览演示当成已有真实记录。

## 每轮结束用四个简短项目回报

`当前状态：`、`下一步：`、`谁来做：`、`我现在要做什么：`。聊天已接近长度限制时，优先更新本文件，不要重复完整历史或让用户重述项目。

## 本轮新增：拍照备注与次日跟进（2026-11-13）

- 业务目标：对单人手机使用场景，快速完成“现场拍照→备注→关联医院项目→回到时间线查看”；以及首页待办卡片“明天跟进”预填日期确认，不做一键静默修改。
- `v2/business-ui.js`：文件保存表单加可选1000字备注；在**同一存储commit事务**中写原件、文件元数据、项目文件关联、备注`notes`及项目`timeline`。无项目关联的备注进入收件箱；照片时间线提供查看/下载原件按钮。操作失败不写部分备注。明天快捷键先打开核对表单，必须确认后更新。
- `v2/business.css`：手机待办4个操作改为2列×2行大按钮，时间线附件展示与照片备注输入区优化。
- `v2/test-mobile-business-ux.cjs`：覆盖预填明天取消不修改、相机备注、原件Hash/原字节、项目时间线一对一关联、无项目文件进入收件箱、完整刷新后附件备注仍存在。
- [本机手机回归 #43430112054](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43430112054) Chromium47 + WebKit47，合计**94项通过/0失败**；[加密基础兼容回归 #43429913839](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43429913839) Chromium/WebKit均成功；[Preview预检 #43429913889](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43429913889)成功。
- `v2/test-preview-remote.cjs` 已补线上专项：预览首页快捷日期需人工确认，合成文件备注与项目时间线同存，原件不变。**部署后完整线上浏览器验收仍必须检查日志才能报成功**。
- 全部仅在隔离开发分支及公开合成测试环境；旧V1.5.7/原staging/正式main/真实资料不得写入。用户无需阶段性提供指令或重新开发。

## 真实预览已通过：拍照备注与次日跟进（2026-11-13最终）

- 独立合成数据Worker发布验收：[Actions #43430605005](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43430605005) **SUCCESS**，源提交 `8fe2c9bb865282f3792cac49f8bf1531c50a67ed`，releaseId `0c45e0137ca31a335e335f4c3020d1a97658517bbfa07474201211f48d6d3b32`，19项资源Hash核验成功。
- 发布后实际Chromium **125/125**、WebKit **121/121**，合计**246项通过、0失败**；新增检查“明天跟进”预填但不静默保存、“上传资料备注＋项目时间线原件关联”在真实独立Worker的浏览器客户端中完成同事务持久保存，原件与备份兼容。
- 本机真实UI [#43430112054](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43430112054) Chromium47+WebKit47，共94/94项通过；旧加密存储回归 [#43429913839](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43429913839) 两端均SUCCESS。
- 本轮未碰正式 `main`、V1.5.7、原staging及真实医院数据。公开预览仅可用合成示例，不得输入真实合同、发票、联系人。
- 下轮优先继续完善医院/项目移动端实际操作，避免无谓安全框架扩展。**聊天篇幅过长时，直接用本文件作为续聊接管依据，不重复前面几百条过程日志**。

## 2026-11-15｜首页智能待办分组已线上验收

- **用户路线不变**：单人 iPhone 工作台，先抓易用性、舒适视觉、稳定与不丢业务原件，不再优先开发复杂多设备身份或公开 SaaS。
- **改动**：`v2/business-core.js` 新增独立 `focusBoard`，保持旧 `dashboard` 兼容；把业务项目按 **逾期→今日→等待对方→未来7日** 划分为不重复的行动分组，已完成项目不进入待办；旧状态项目的备注/原件/附件不受影响。`v2/business-ui.js` 首页顺序对应调整，四个顶部数字直接点击滚动至对应的待办分组，0项不可点；`v2/business.css` 增加拇指易点击数字入口、温和逾期标记、减少动画支持。
- **本机验收**：[GitHub Actions #43692155740](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43692155740)，Chromium **51/51** + WebKit **51/51**，合计 **102项通过、0失败**；包含逾期/今天/等待/未来一周互斥、已完成排除、指标点击、原手机录入/拍照/备份流程回归。[旧加密兼容 #43692092311](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43692092311) 双引擎成功，[Preview preflight #43692092287](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43692092287) 成功。
- **已发布合成预览**：[GitHub Actions #43692359003](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43692359003) **SUCCESS**，Chromium **128项**、WebKit **124项**，最新线上 **252项通过、0失败**（是两套浏览器的检查数，不与旧轮次叠加）；新指标跳转、分组无重复、原件完整性均线上验证通过。源码 `70d4c274a6c0f1a98d2b9fe3293095cdc571ff8d`，releaseId `fe51fa160f381c5f01b8e813a64ee9ea0c81b2eba01576617c308d883feb2c54`，19项公开预览资源校验通过。
- 地址仍为 `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`，**只可用合成数据，不能填真实业务**。只更改独立开发分支和预览 Worker；正式V1.5.7、原 staging、main、真实资料未动。用户真机验收和正式上线仍未实施。
- **下一步**：优化等待反馈的最后沟通时间、今日项目的快捷完成/跟进、首页日期显示和具体医院/耗材关联体验。保持一轮一项的开发节奏、前端真实可点击、双浏览器验证，勿扩大安全项目。聊天达到长度限制时直接引用本文件接管。


## 2026-11-15｜等待反馈快捷记录与今日完成：合成预览发布成功

- **改动范围**：仅独立开发分支上的 `v2/business-ui.js`、`v2/business.css`、`v2/test-mobile-business-ux.cjs`，开发提交 [f2350965](https://github.com/wangxueqing0427-oss/personal-workbench/commit/f2350965b8b14b42f7bb2ab8121b70787adda002)。首页等待反馈项目按已有非附件时间线推导“最近沟通”日期；按钮“收到反馈”打开确认表单、建议从“等待对方”调整为“进行中”，可编辑下一步/日期/等待对象，要求填写本次反馈；首页今日待办“确认完成”也先要求填写完成情况、点击保存，不会直接改状态。
- **存储与兼容**：沿用现有 `saveProject + storage.commit` 一次性写入，新的反馈/完成结果各追加一条项目时间线和关联备注；编辑取消不产生写入，旧字段、设备资料、原件和附件保持原状，旧项目无需数据迁移。首页操作按钮调整为2列，每个点击区至少44px。
- **本机双浏览器测试**：[Actions #43697170959](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43697170959) **SUCCESS**，Chromium **59/59** + WebKit **59/59**，共**118项通过、0失败**；专项验证最近沟通日期、收到反馈建议与取消、单条时间线+备注持久化、确认完成/取消及不再进入待办。独立构建预检 [#43697171207](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43697171207) 和现有本机加密兼容 [#43697170914](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43697170914) 均 SUCCESS。
- **合成预览已部署并通过线上验收**：[Actions #43697387362](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43697387362) **SUCCESS**，线上 Chromium **128/128**、WebKit **124/124**，合计**252项通过、0失败**；源提交 `315f1854b92d628d990cf0f3ae9e1a05ddb721ed`，releaseId `364d8d461c65d5ed1af548588c5094820cfa7a40f9b25db65def362992d279ca`。地址仍为 `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`，**公开的合成数据预览，不能写真实医院/合同/客户资料**。部署的是预览 Worker，非正式 V1.5.7、非原 staging，`main` 和真实数据未动。iPhone 本人真机终验仍未进行。
- **下一步建议**：在手机上继续改善首页跟进日期可读性（今天/明天/已逾期），随后做耗材待开票、未回款业务的便捷筛选；不要重复已经通过的旧测试，也不要在未经用户批准前迁移或上线真实数据。本轮直接通过 GitHub 工具完成隔离分支变更和自动测试触发；后续仍遵循优先交给 Codex 开发、ChatGPT 审核、用户 iPhone 终验的分工。


## 2026-11-15｜首页跟进日期、耗材未开票/待回款快捷筛选（本轮已发布）

- **当前断点**：只对 `dev/v2-preview-isolated-20261111` 开发和部署已有合成预览，绝不合并 `main`，不得触碰 V1.5.7/原 staging/真实业务库。合成预览公开可访问，不能输入真实医院、客户、合同和文件。
- **首页日期**：`v2/business-core.js` 新增只读 `followupInfo(value,reference)`；显示已逾期N天/今天/明天/N天后/计划跟进/日期待定，始终保留原ISO精确日期；采用 UTC 日期差避免跨月、闰年和夏令时计数偏差，历史异常日期只标示需核对而不改写。首页显示当天日期，从后台跨天返回首页可刷新。项目详情与未来一周节点也同步改善日期可读性。开发提交 `2ce0f9deae253fcada734d3b29b51d1cee30bdd3`，对应测试中一处正则转义笔误已在 `1cb1f6cabc81f6010fd0c5c5558ed58afb8df8ba` 修复；[Actions #43699636355](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43699636355) 双浏览器 **SUCCESS**。
- **耗材筛选**：`v2/business-ui.js` 将三项顶部统计变成可点击筛选：全部、未开票、已开票待回款。严格使用现有 `core.finance` 订单状态判断，筛选不写入数据、不会把还未开票的订单算作应收；显示筛选命中数、原所属医院和项目，零结果清晰提示。纯前端不迁移数据、不增加服务。开发提交 `e4c5d94e482fa01a334ca73b4c4f171c38e4f0e4`。
- **合成数据自动测试**：[Actions #43699876311](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43699876311) Chromium **68/68**、WebKit **68/68**，共136通过、0失败，测试包含日期跨年闰年/页面展示、筛选零写入、未开票/已开票待回款隔离、医院项目展示和已有手机操作回归；[预览构建 #43699876319](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43699876319) 与[既有加密兼容 #43699876310](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43699876310) SUCCESS。
- **独立合成预览线上验收**：[Actions #43700021304](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43700021304) **SUCCESS**，Chromium **128/128**、WebKit **124/124**，合计252通过、0失败；发布源码提交 `4cf2ff9323485b3d772751a11c112c2f2e3a7e07`，releaseId `46bc976173d59c892781b2f45c80556683012d261e52a6c74e2eb5f8ba471470`，资源完整性验证通过。URL: `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`。注意线上通用E2E检查和本地新增功能专项测试是不同测试范围，不能把模拟器测试说成真实用户 iPhone 终验。
- **下一高价值功能**：耗材与维保回款横向简洁视图、未开票/未回款项目下一步跟进提醒（严格区别合同金额和订单金额、确认前不改写），或者等用户体验预览后处理iPhone真实反馈。不要重复旧阶段测试，不扩张复杂身份系统。后续仍为 ChatGPT 规划与审查、Codex 开发测试优先、用户重要授权和 iPhone 终验。报告沿用“当前状态/下一步/谁来做/我现在要做什么”。


## 2026-11-15｜耗材催办、核对开票和整单回款快捷处理（线上合成预览通过）

- **本轮范围**：继续在 `dev/v2-preview-isolated-20261111` 隔离开发，不改 `main`、正式 V1.5.7、原 V2 staging 或任何真实医院/业务记录，也没有购置付费服务。开发源码提交 [86bbbab4](https://github.com/wangxueqing0427-oss/personal-workbench/commit/86bbbab4ec36eed36e14262bd33da006e6ba91d7)；强化发票必填及自动测试提交 [f98a1682](https://github.com/wangxueqing0427-oss/personal-workbench/commit/f98a168211dd8cd06a7c468a6b44b44c4c4c6ce8)。
- **新增**：每张耗材订单在原列表直接“记录催办”，输入沟通结果、下一次跟进日期（可选），自动保存在订单历史＋关联医院项目时间线＋项目备注（同一个 ID，单次 `storage.commit`；失败不部分保存），并在订单卡片显示最近一条。此操作不会把未开票/未收款误改成已开票/已回款。对**已经处在库存阶段**的订单，提供必须输入发票编号并勾选核实的“确认开票”；对**已开票未收款**的订单，提供必须勾选整单实际到账的“确认整单回款”，明确**部分回款不支持一键认定全部到账**。两个确认均复用旧 `core.advanceOrder` 强制顺序规则，未满足阶段的订单无法跳转，取消无写入。不引入复杂应收会计模型或擅自归集合同金额。
- **合成数据自动测试**：[手机真浏览器自动验收 #43700724376](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43700724376) Chromium **81/81**＋WebKit **81/81**，共162项PASS、0 FAIL；覆盖催办取消、关联保存、日期、发票号必填、回款确认、整单到账提醒、流程顺序、筛选随状态变化，以及原有拍照/附件等测试。[独立预览打包预检 #43700724364](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43700724364) SUCCESS，[既有加密兼容 #43700724315](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43700724315) SUCCESS。
- **发布与线上验收**：[仅合成预览部署 #43700906681](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43700906681) **SUCCESS**，线上 Chromium **128/128**、WebKit **124/124**，合计252 PASS、0 FAIL；固定源码 `5b1dcf80bdd636599e281302ca8a561cf219adb2`，releaseId `e03c503bc067e5bb9dbec6f79976824792a7e78434799c016fc336f7a5200e1e`，20项构建资源校验通过（包括生成元数据；CI资产门禁为19项）。地址 `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`，这是公开、**仅合成数据**的预览，禁止录入真实客户、医院、合同、发票、耗材单据或原件。**手机 Safari 真实本人终验尚未做**；自动模拟器验证不能替代真机终验。
- **下一步最有价值**：先做用户iPhone真机预览体验（首页→催办记录→日期→订单筛选→取消/确认→退出再进、离线），利用实际手感反馈决定是否继续优化；在此前不建议盲目扩张新业务模块。真实历史库迁移和正式发布必须单独获得用户批准、先备份和可恢复验收，当前绝不可触碰。后续报告仍用“当前状态 / 下一步 / 谁来做 / 我现在要做什么”，节省聊天和Codex额度。


## 2026-11-15｜实测反馈：原生拍照与语音拆分（合成预览验收成功）

- **用户提出的新需求**：在 iPhone 测试时找不到直接“打开照相机”选项；希望离开医院后点麦克风说一段话，系统按医院、项目、进展和待办拆分，核对后保存。仍然不得擅自使用真实业务数据、上线 main、扩张复杂安全系统或付费服务。
- **相机修复**：`v2/business-ui.js` + `business.css` 将原来普通文件输入改为**原生可点触发区域**三选项（后摄像头 `<input name=photo accept=image/* capture=environment>`；相册 `name=gallery accept=image/*`；文件 `name=file`），拍摄/相册/文件互斥，显示本次所选文件名，保留原文件字节、上传备注、关联项目/耗材订单和原子提交。若 in-app WebView 未弹出相机，使用相册入口系统菜单或 Safari；无法模拟代替真实 iPhone 相机授权。相机提交 [e0f9bac](https://github.com/wangxueqing0427-oss/personal-workbench/commit/e0f9bac73d247ba6e4ccff017cd54de2a6bcb837)，修正原生触控区域及断言 [b3f372d](https://github.com/wangxueqing0427-oss/personal-workbench/commit/b3f372d4388696c4ca11f8146959902680a46548)。
- **语音整理**：`v2/business-ui.js` 增加“🎙 开始语音”与停止、中文 `SpeechRecognition/webkitSpeechRecognition` 浏览器渐进增强；不支持/权限不通过时提示改用 iPhone 键盘麦克风或 Safari。语音识别由手机浏览器或其在线服务完成，**音频可能发送给浏览器厂商，不能称为纯本机离线语音识别**；仅识别出的文字由本机规则拆分，未调用任何新增付费AI接口。 `business-core.js` `splitBriefing` 以标点和已知医院/别名识别多条事项、推测项目和日期，保留原文草稿；`confirmBriefing` 逐条选项目、编辑文字，可选勾选状态/日期/下一步，全部确认后在**单个 storage.commit** 写入项目时间线或收件箱。取消不写，未知医院/项目不乱挂靠，一次最多5000字/16条。语音开发提交 [8b0975b](https://github.com/wangxueqing0427-oss/personal-workbench/commit/8b0975bf5d63b4b2831e2b92d82a1c207a614574)。该功能是离线规则初版，不是可理解所有自然语言的真正AI语义系统。
- **自动测试**：[GitHub Actions #43702225424](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43702225424) **SUCCESS**：本机合成数据 Chromium **93/93**、WebKit **93/93**，共**186项通过、0失败**；测试包含语音结果模拟（**没有录到真实声音**）、双医院拆分/待办关联/取消/原子保存/重载、原生相机输入与图片选择，既有耗材/工作流无回归。预览独立构建 [#43702225321](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43702225321) **SUCCESS**，本地加密兼容 [#43702225350](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43702225350) **SUCCESS**。
- **线上发布追踪**：第一次合成预览发版 [#43702405020](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43702405020) 实际部署成功但**线上烟测失败**：旧脚本仍寻找旧的“随手记业务进展”页面；非应用崩溃。仅更新线上脚本以检测新语音拆分、收件箱、相机入口，代码提交 [ce3b56e](https://github.com/wangxueqing0427-oss/personal-workbench/commit/ce3b56e46b0fe6c30bcb14935ccb6ec20d781e6c)。第二轮 [#43702702600](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43702702600) **SUCCESS**：线上 Chromium **129/129**、WebKit **125/125**，共**254项通过、0失败**，19项资源门禁及20项构建资产一致；源码 `2ecd56e5b0dc5804d5f2c8526c56a9271fb0a860`，releaseId `8ab7adff24a58bf2166eb9d6e90700cc53b4f2b5f1b037b57c3e9badcf947f4e`，`productionAccessed=false`。预览 URL `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`。**仅合成数据，请勿录入真实医院/客户/发票/病患/报价资料**。正式 `main`、V1.5.7、原 staging、真实数据均未更新。
- **用户真机验收仍缺**：真实 iPhone Safari/WKWebView 相机系统弹窗/权限、麦克风开始与结束、语音识别在线服务可用性、相册替代、离线及重开操作手感。建议用户只用合成话术测试 ① 首页→“拍照/上传”→“立即拍照”或“相册/选照片”，② 底部“＋记录”→“🎙 开始语音”→中文模拟话术→“拆分事项并核对”→两项确认。后续优先解决 iPhone 真实反馈；不要继续扩建无关功能。


## 2026-11-15｜首页一键语音速记、口述日期和行动建议（独立预览已成功发布）

- **优先目标**：用户已明确要求「走出医院直接点击语音说一段话，自动整理拆分」。上轮曾新增二次点击语音听写＋合成数据拆分，本轮直接将首页4个常用按钮的首位更改为「🎙 语音速记」，点击后同步打开记录页面并启动 `SpeechRecognition/webkitSpeechRecognition`，不需再点页面麦克风。若浏览器不支持，明确提示并自动聚焦文本框，使用 iPhone 原生键盘听写；手动编辑时会停止流式识别，以用户修改为准。项目原五底栏、首页四快捷项、拍照上传、耗材和备注保留不变。
- **本地规则提取**：`business-core.js` 的 `resolveDate` 现能保守识别带年份/无年份月日、N天后、下下周星期，过去的无年份月日不猜下一年；`suggestNote` 适配 CT/MR/DSA/DR/加速器/合同/招标/质控/报价/回款/维修等词，给出可核对的下一步建议；若在唯一医院档案下只有一个项目，可建议预选，但用户仍需确认；`splitBriefing` 会根据已知医院切换和明确的「另外/还有/第二件」语气拆分同院多件事，未知医院不强行归档。**仍是本机规则，不是大模型全语义理解**；所有状态/跟进日/下步字段均必须用户勾选确认后一次原子提交，取消/单纯拆分不写数据。
- **代码提交**：[开发 0c10e571](https://github.com/wangxueqing0427-oss/personal-workbench/commit/0c10e5711365662522c6bdfa532448b76213c126)；测试定位修正 [5da3a224](https://github.com/wangxueqing0427-oss/personal-workbench/commit/5da3a22412ffdbd9af33c0d1203f6f58ebc9c019)；上线烟测导航修正 [6ac9f7dd](https://github.com/wangxueqing0427-oss/personal-workbench/commit/6ac9f7ddee94bfb7d1cbb3fa50b52de75c117c45)。这些更新只在 `dev/v2-preview-isolated-20261111`。
- **合成数据回归**：[手机 Chromium + WebKit #43705995305](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43705995305) **SUCCESS**，两引擎各**97/97 PASS**，合计194 PASS、0 FAIL；涵盖首页直接启动假造语音API、缺识别服务时键盘听写回退、中文日期、同院多事项拆分、项目关联、已存原件和订单流程等。预览预检 [#43705893958](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43705893958) 和本地加密兼容 [#43705893913](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43705893913) **SUCCESS**。
- **线上合成预览**：[最终线上 source-pinned 发布 #43706380739](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43706380739) **SUCCESS**，在线 Chromium **131/131**、WebKit **127/127**，合计258 PASS、0 FAIL，资源校验 `PREVIEW_ASSET_GATE_PASS`，`productionAccessed=false`。线上源码提交 `60469fac2f53b64abd6a77793870da6049e2014b`，releaseId `b1891f63f4a56d12f840380a0469e4fb9fd75f6596cf91d1968183e623f0866e`。公开的合成数据预览链接 `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`，**禁止填入真实客户、医院、报价、发票、合同和文件**。第一次本轮线上烟测脚本在项目详情页错误查找首页语音入口（并非生产应用故障），脚本已显式返回首页后重验，最终双引擎全绿。
- **未覆盖的现实测试**：没有使用用户实体 iPhone 的摄像头、麦克风、Apple Safari 或内置浏览器测试，不能声称真实硬件行为已验证。浏览器的 Web Speech 引擎可能联网调用识别厂商服务，不能承诺纯离线语音听写；识别失败时保留文字和系统键盘听写回退。下一阶段宜在用户iPhone真机上验证原生相机和一键语音能否弹出，再根据真实症状调整；无需额外建设复杂认证或接入付费API。正式版 `main`/V1.5.7、既有 staging 和真实数据均未改动；不开展迁移或正式发布，除非获得用户额外批准。


## 2026-11-15｜同医院多项目语音识别与反馈人确认（合成预览已发布）

- **用户意图**：进一步实现出医院一键语音说一段业务汇报，自动分别匹配同一家医院的多个项目、联系人、待跟进动作和日期；不擅自更新项目状态。
- **代码**：特性提交 \`6d50b9ac11eb42a3676d2cf752592b6e26d18261\`（\`v2/business-core.js\`、\`business-ui.js\`、\`business.css\`、手机回归测试）；测试仅修正折叠表单需要先展开再勾选 \`678fe82bef13d7cab27c5939f32d813813c0eb2d\`；发布及线上专项新断言 \`5c432c49bd35820f2a130a6a9db905a8a4bc7e2e\`。
- **逻辑**：先按显式医院正式名/别名继承医院上下文，按不同完整项目名、设备型号与专业词匹配；遇到「核磁」指向多条项目时不自动挂靠。能在同院逗号分句识别核磁维保、TOMO机房改造、核磁移机等多个项目并分开独立建议跟进日期和联系人；明确已存联系人优先，未存可能识别的联系人需人工确认。确认页面显示匹配依据、候选项目、建议行动和跟进日期，选填“联系人 / 等待对象”并勾选才同步写入 \`project.waitingOn\`。若跨医院错误挂项目，或选择同步日期但未确认日期，则整批拒绝提交，确保没有部分写入。
- **实测**：[合成手机双引擎 #43707935818](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43707935818) Chromium 101/101 + WebKit 101/101，合计**202通过、0失败**；涵盖三项目同院话术拆分、日期、联系人、歧义不挂靠、跨医院防错、收件箱与原子时间线、手工确认待反馈人，以及旧相机/耗材功能。预检 [#43707792334](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43707792334) 和旧加密兼容 [#43707792308](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43707792308) 成功。
- **最终已发布并线上验收**：[独立合成 Worker 线上运行 #43708111265](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43708111265) SUCCESS，**线上 Chromium 132/132 + WebKit 128/128，共260通过、0失败**，完整性门禁 \`PREVIEW_ASSET_GATE_PASS\`，真正发布后的 \`PREVIEW_LIVE_MOBILE_GATE_PASS\`；\`sourceCommit=5c432c49bd35820f2a130a6a9db905a8a4bc7e2e\`，\`releaseId=c3ae7afb33e60da30dc200857705e0b3392ff20f136881e4843e435be846ad1c\`，\`assets=20\`，\`productionAccessed=false\`。
- **独立预览** \`https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html\` 只许合成示例数据。尚无真实 iPhone 的相机/麦克风权限手动验收，不能声称该硬件行为已验证。网页语音识别是否支持受 iOS 浏览器和网络服务影响，保留系统键盘听写输入。尚非真正全面自然语言 AI 提取：条目需逐一核对。**main/V1.5.7、原 staging、用户真数据和文件未修改，未进行正式发布或付费服务**。


## 2026-11-15｜语音拆分后单条/批量采纳建议（独立合成预览已发布）

- **本轮目标**：在口述转为多个医院/项目事项后，降低逐项展开和勾选的摩擦；**保留最终人工确认，不自动修改状态、合同、开票、回款**。
- **功能**：\`v2/business-ui.js\` 在每条语音拆分待核对记录展示「采纳建议（下一步 / 日期）」「撤销采纳」，上方展示「采纳全部明确匹配的建议」。单条按钮只会在用户当前已经选中项目的前提下预选“下一步行动”和“已有明确日期”；批量只在项目的匹配依据为「已识别项目全名」或「项目关键词建议」、项目未被手动更换、具有具体日期时预选。**这些按钮完全不执行 storage.commit**，也绝不勾选状态或等待对象。用户手动变更关联项目会清空以前的待办更新勾选，要求重新核对；已排除条目不会被批量采纳。页面上显式呈现“当前已为N条事项勾选建议；尚未保存，最后仍须点击确认”，以及每条具体勾选字段。点击确认时仍通过原有 \`core.confirmBriefing\` 校验跨医院项目/日期等约束，在单次原子提交中保存。
- **代码**：特性提交 \`73b4902e89c13fd25e756a3be714e45a3c206702\`，修改 \`v2/business-ui.js\`、\`v2/business.css\`、本地回归和线上烟测。无 schema/加密存储/原件格式更改；旧订单、拍照及原有语音回退保留。
- **真实测试证据**：[本地 Chromium + WebKit #43709514257](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43709514257) SUCCESS：各109/109，**合计218通过、0失败**；验证初始记录模式不改待办、批量勾选、只更新下一步和日期、不改状态、无需写数据、换项目清空、撤销、筛选不保存及确认后的原子写入、再次打开留存。旧加密存储兼容 [#43709514259](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43709514259) SUCCESS，preview build [#43709514256](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43709514256) SUCCESS。
- **最终发布**：[线上合成 Worker 部署 + 发布后完整验收 #43709702601](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43709702601) SUCCESS，**Chromium 134/134 + WebKit 130/130，共264通过、0失败**。源码 SHA \`56b954495a2fd125461d5dbd4c6ae5c591d3b940\`，releaseId \`48e043f2aa6066f345758aef28ddee22b8fe19469f9a389b40833c7a28e6a49c\`，\`assets=20\`，\`PREVIEW_ASSET_GATE_PASS\`、\`PREVIEW_LIVE_MOBILE_GATE_PASS\`，\`productionAccessed=false\`。
- **链接**：\`https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html\`。这是公开**合成数据**预览；严格禁止输入任何真实医院、客户、维保项目、报价、发票、合同、文件。未在用户真实 iPhone 摄像头/麦克风做硬件权限验收，Web Speech 依赖浏览器可能不支持或联网；仍保留 iPhone 键盘麦克风方式。正式 \`main\`、V1.5.7、原 staging、真实记录、文件和付费服务都未改动。下一阶段应以真机实际体验问题和更有价值的业务闭环为导向，勿堆砌额外按钮。


## 2026-11-15｜医院口述中断恢复：本机草稿与原子确认（最新合成预览全绿）

- **用户授权方式**：用户只想上手使用，明确让 Assistant 完成能做的一切模拟测试、修复和独立预览发布；不要把 Playwright、CI、回归检查交给用户。实际 iPhone 硬件的相机/麦克风权限无法由模拟器替代，不要谎称已经真机测试。
- **新功能**：手机医院口述或键盘输入暂存到已有预览 IndexedDB 的独立 `draft:visit-note:v1` 键（`workbench-voice-draft-v1`，最长5000字），写入与主 `current` 业务快照隔离，**不创建 notes/revision/sync queue，不上传云端**。输入200ms 防抖，语音识别的最终转写、主动停止/页面隐藏时主动尝试落盘；应用重新加载后在 `+记录` 恢复完整原文，显示明确“已找回未完成记录”的状态。按“清空这段草稿”需二次确认；若未能写草稿，页面提示勿关闭或刷新。用户编辑文字时停止语音并忽略旧语音识别器的延迟回调，避免重新注入已经手改/清除的内容。完整备注与项目状态仍需核对后正式确认。
- **事务边界**：`business-store.js` 新增 `readDraft`/`writeDraft`，`commit(state,expectedRevision,file,{clearVisitDraft:true})` 会在原本一笔 IndexedDB `state+files` 事务中同时写当前业务快照、同步队列项和删除本机草稿。提交前等待暂存写队列，防止语音识别迟到的写入重新出现；业务提交失败会整笔回滚而保留未完成草稿。无需更改正式业务 schema、同步协议、附件原件格式。
- **代码**：核心特性提交 `8e245504cea4a78b0b4dea136e41b643385e409f`。因新增草稿异步持久化，需要待页面真正进入审核页，已修复自动化等待点 `20899f3c4f53e10e43bc47e20761e553fce18465`、`6851a2c5af29fb780fc414e186d2af8b17e8bd7d`，并适配分句自动去句末标点的预期 `62fc7ec8ee1991aa24fdaca64be0ae7912f44b25`。前两轮本地 CI 曾因新异步操作下测试立即读取未渲染页面而失败，最终已消除并通过双浏览器完整测试。
- **完整本地回归**：[V2 mobile synthetic #43713463623](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43713463623) SUCCESS，Chromium 120/120 + WebKit 120/120，**240通过、0失败**。专测误刷新、返回主页、快速连续编辑、审核中刷新、二次清空、旧草稿绝不复活、本机暂存不新增版本/笔记/同步任务、正式确认才单原子提交。同时原有医院、项目、耗材、图片原件、报销和其他移动流程回归。预览 build [#43712837857](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43712837857)、本地加密兼容 [#43712837890](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43712837890) SUCCESS。
- **已正式发布到独立合成预览并线上验收**：[Deploy isolated V2 preview #43713698902](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43713698902) SUCCESS。在线 Chromium **138/138**、WebKit **134/134**，共 **272通过、0失败**，`PREVIEW_ASSET_GATE_PASS`、`PREVIEW_LIVE_MOBILE_GATE_PASS`；source commit `c3e789cc0f167f31fae80c55b359e98dd8efabdc`，releaseId `25a7f3e2fb66ba5531f2055cdc7e7efe4d1e77450da9be9b289e101702c7b914`，20 build assets，`productionAccessed:false`。URL `https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`。
- **限制及方向**：独立预览公开且仅**合成数据**，用户绝对不要录入真实医院/病人/项目/联系人/财务/招投标资料或上传真实文件。草稿只在同一浏览器存储，没有跨设备同步；手动清空网站数据仍会丢失。SpeechRecognition 由浏览器支持及厂商服务决定，可能联网，不保证 iPhone 原生麦克风/相机可用。之前的正式 `main` SHA `c3d9ebec26b94ef056eaad649447b3ad2dba31bc` 未变，V1.5.7、旧 staging、真实业务数据和文件未动、无新增付费功能。用户无需运行技术测试；后续优先实际业务闭环的省操作、清晰任务与视觉体验，维持独立安全范围。


## 2026-11-15｜最近沟通首页直达与收件箱二次归档（已部署并验收）

- **优先目标**：用户明确表示所有可自动执行的测试、修复、模拟手机验收和预览部署都由 Assistant 负责，自己只做最终上手使用；此轮补上从医院语音记录之后真正回到业务项目的闭环，而不是只堆叠识别按钮。
- **功能**：`business-ui.js` 首页显示最近4条**已正式保存**的沟通（时间、医院、项目、摘要），有项目直接点开项目；无项目出现“待归档”数量与直达入口。原有“记录收件箱”不再只是 `<p>` 纯文本，改成清晰的记录卡，显示原始文字/日期/识别医院/原件状态，并提供“关联已有项目”。归档独立表单要求手动选项目、核对原文，取消不产生记录。
- **业务原子规则**：`business-core.js` 新增 `archiveInboxNote(state,noteId,projectId,today)`，只给已保存且尚无项目的笔记补充关联。识别到医院时禁止误入其他医院；禁止失效项目、重复归档、已有相同时间线ID，原件备注的文件如不存在/已关联其他项目则整笔拒绝。正常确认时只增加时间线引用，笔记原文及保存日期保留；如含未关联原件，一并建立原有文件记录与项目 fileIds 的关联，**不复制/修改二进制原件，也不创建重复笔记**。一笔现有 IndexedDB `storage.commit`，无任何项目状态、下一步、跟进日、发票、库存或款项的隐式变更。
- **代码提交**：特性 `f51c91516c45c1ef284d6efdc438e789fcfa2f41`；发布 source-pinned 触发 `72fcf96286cfd18533b49035acb085c20dfb80b8`，仅在 `dev/v2-preview-isolated-20261111` 分支。
- **本地独立合成手机回归**：[CI #43715387269](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43715387269) SUCCESS，Chromium 130/130 + WebKit 130/130，**260项通过、0失败**。涵盖同医院/跨医院判断、无效项目、重复笔记、文件原件关联、首页未归档提醒、收件箱记录导航、取消、一次关联、独立项目时间线、原始日期保留、整个项目 status/date/nextAction 不变、离线刷新保留。源代码预检 [#43715387202](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43715387202) SUCCESS，原有本地加密存储兼容 [#43715387287](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43715387287) SUCCESS。
- **已上线独立合成预览 + 发布后验收**：[Deploy isolated V2 preview #43715605656](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43715605656) SUCCESS，线上 Chromium 140/140 + WebKit 136/136，**276通过、0失败**；20文件完整性门禁 `PREVIEW_ASSET_GATE_PASS`、移动端全流程 `PREVIEW_LIVE_MOBILE_GATE_PASS`。实际部署 `sourceCommit=72fcf96286cfd18533b49035acb085c20dfb80b8`，`releaseId=61ee6bd340acaac09f4ed8932d0ce4b0d5483fbfa8bb1cdb75bb7e40b15bcfa4`，`productionAccessed=false`。
- **预览 URL**：`https://personal-workbench-v2-preview.wangxueqing0427.workers.dev/business.html`；它在公开的合成数据环境中，禁止录入真实医院客户、耗材、合同、发票、报价或上传真实原件。实际 iPhone 摄像头和麦克风权限不由模拟浏览器验证，仍需最终设备上手确认。正式 `main` 和 V1.5.7、旧 V2 staging、真实数据、资料原件保持不变，无付费API变更；目前还不是正式生产替换发布。


## 2026-11-15｜正式上线准备：旧版资料迁移只读检查与合成影子预演（未上线）

- **用户当前目标**：尽快完成正式 V2 交付、不要再无限扩充功能；所有代码、模拟测试、备份恢复试验均由 Assistant 自行完成，用户只做真实 iPhone 最终上手。不得擅自迁移任何真实资料、替换 V1.5.7、改原 staging/production/main 或使用公有合成预览录入业务信息。
- **核查到 V1 真实代码路径**：仓库旧版 app.js 从 localStorage 的 `personalWorkbench` 读取业务 JSON；app-v151t.js 把上传的原始文件保存在同源 IndexedDB `personal-workbench-originals/files`，收件箱 inbox 只是文件元信息；项目、行动、附件关联在 `contractProjectsV138`、`businessProjectsV140`、`contractActionsV139`、`projectFilesV150`。原始 V1.5.7 手机数据未读取。
- **查出真实代码缺口**：当前 `WorkbenchBusiness.fromLegacy` 只转换合同/业务医院项目，无法作为完整正式迁移工具；它没有复制 V1 inbox、原件字节、早期 notes/tasks/finance/health 等非项目内容。这是可证实的代码限制，未丢用户数据，因尚未运行真实迁移。
- **上线阻断门禁**：`v2/release-readiness-audit.cjs`、`v2/test-release-readiness.cjs`、`.github/workflows/v2-release-readiness.yml`；对完全虚构的旧版业务快照构造 SHA256、原件逐字节清单，审查多项目/附件引用、重复 ID、缺原件、错误长度、损坏备份；从不打开 localStorage、IndexedDB、生产网站。CI 成功只证明明确地**BLOCKED_NOT_FOR_PRODUCTION**，不是允许发布。
- **合成只读影子预演**：`v2/legacy-shadow-planner.cjs` 和 `v2/test-legacy-shadow-planner.cjs` 仅在 `syntheticOnly:true,origin:'synthetic-ci'` 下运行，建立**内存**候选业务档案、原件字节复制、旧版完整原始 JSON 存档、设备/合同/时间线元数据；自动阻断缺文件、重复/孤儿引用、转换器少项目、同一原件需归档到两家项目等情况。严格标记 `SHADOW_ONLY_REVIEW_REQUIRED`，**未进行持久化写入、独立库解密恢复、真正 iPhone 数据读取或正式迁移**。
- **自动化绿色证据**：[第一轮门禁 #43717207631](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43717207631) SUCCESS 19/19；[最新两个合成专项 #43717559251](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43717559251) SUCCESS，安全阻断 19项 + 可逆内存影子 15项，共34项通过、0失败。最新分支代码提交 `033e25e682e83ad9c7c8e57785de314b2845b634`。技术报告 `v2/RELEASE-READINESS-2026-11-15.md`。
- **目前正式上线阻断依旧**：真实 Safari/PWA/域名和 V2 来源审计；完整数据与原件导入；集成的实际本机加密和可靠身份；真实独立加密备份恢复/回滚；生产正式发布授权；真实 iPhone 相机/语音/离线/Face ID 核验。既有实验性分对象加密/跨设备同步有合成验证但尚未进入正式业务存储接口。**代码功能模拟绿色不等于真实用户资料可以上线。**
- **生产保持**：`main=c3d9ebec26b94ef056eaad649447b3ad2dba31bc`，没有改动正式主线，V1.5.7与既有 V2 staging/真实数据不变；本轮也没有部署合成 Worker、无新费用、无需用户运行技术验收。


## 2026-11-15｜用户正式改变上线策略：不迁移旧版，V2空白正式启用

- **用户最新明确决策（覆盖前面旧版数据迁移阻断路径）**：「不用迁移旧版数据，之前就用了一两次，正版上线后我重新开始使用导数据」。因此正式 V2.0 **全新独立地址/存储空白启动**；保留 V1.5.7 不删不改，不向 V2 复制旧医院/联系人/资料/财务和原始文件。用户届时自行重新录入/导入新工作信息。原有 `v2/legacy-shadow-planner.cjs` 等迁移研究仅留作历史，不再占用正式新启用发版通道。
- **代码已实现**：[feature `6e3dca4a608d42c7279a78a816f691f84f88db8a`](https://github.com/wangxueqing0427-oss/personal-workbench/commit/6e3dca4a608d42c7279a78a816f691f84f88db8a)：`business-ui.js` 首次调用 `seed()` 时默认 `WorkbenchBusiness.empty()`，只有 URL 真正属于 `personal-workbench-v2-preview.<account>.workers.dev` 或 localhost/127.0.0.1 的本地测试模式才填三个演示医院；即便在本机测试环境，`<html data-workbench-data-mode="fresh-empty">` 仍强制空白；已有 V2 记录始终优先读取，绝不因模式切换覆盖。首屏空白引导“从第一家医院开始”，直达新增医院/语音记录，不预装真实医院。
- **独立浏览器模拟**：[mobile CI #43720167639](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43720167639) SUCCESS：Chromium 136/136 + WebKit 136/136，**272通过、0失败**。验证全新模拟浏览器真实 IndexedDB 首启所有七类业务记录为零，且即使同源存在伪造 `localStorage.personalWorkbench` 也绝不读取/改动；新建首家合成医院、刷新保留、旧版数据键保持、同 origin 载入不同 demo 模式不会覆写已有 V2 记录。旧样例预览仍只使用合成数据。Cloudflare 预览构建预检 [#43720167667](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43720167667)、密文兼容原型 [#43720167684](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43720167684) SUCCESS。
- **新上线门禁已替换旧迁移路径**：[release gate commit `7be5f3396e4e0923fb51c6f8ac5f32ccdd3f2c70`](https://github.com/wangxueqing0427-oss/personal-workbench/commit/7be5f3396e4e0923fb51c6f8ac5f32ccdd3f2c70)、[CI #43720479900](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43720479900) SUCCESS，6项 fresh-start 专项断言通过，`requiresLegacyMigration=false`，`productionReady=false`。正式尚需生产独立入口与数据库、无演示数据、真实业务资料本机加密、可恢复备份及附件原件核验、持久设备认证/断网恢复、真机 Safari+PWA 终验、用户正式发布批准。详细文档 `v2/RELEASE-FRESH-START-2026-11-15.md`，之前 `RELEASE-READINESS-2026-11-15.md` 仅作旧迁移计划历史。
- **安全范围**：未部署生产或原 V2 staging；未迁移/读取/删除用户 V1 数据；未重置已存在的合成预览业务数据，亦未部署新代码到公开预览 Worker（该入口继续显示合成示例）。`main` 仍为 `c3d9ebec26b94ef056eaad649447b3ad2dba31bc`，正式用户数据、附件及现有图标原样保留。下一轮**不要再推进旧版迁移**，优先攻克全新正式版的安全存储、备份恢复、上线候选构建和手机可用性。


## 2026-11-15｜全新空白工作台跨设备加密备份恢复实验（双引擎通过、未发布）

- **用户当前目标不变**：V2.0全新空白正式启用，无需迁移只用一两次的V1.5.7数据；只让用户最终上手，不让用户做开发测试。当前仍**未获正式生产部署授权**，保留V1.5.7`main`/原V2 staging/真数据、资料与合成 preview Worker不动。
- **新实验代码（只限localhost合成测试）**：`v2/fresh-recovery-lab.js`、`v2/test-fresh-recovery-lab.cjs`、`.github/workflows/v2-fresh-recovery-lab.yml`、`v2/FRESH-RECOVERY-LAB-2026-11-15.md`，提交 `258a85896b4902cb146ed87525a951c49182bee6`。沿用已通过检验的`WorkbenchCryptoPOC` AES-GCM/PBKDF2高强度独立恢复密码，使用现有`WorkbenchBusinessStore`的真正业务schema及原件存储接口，不碰任何旧版数据或云服务。
- **端到端已证明（虚构资料）**：模拟手机A从空白V2开始新增医院、磁共振维保项目、状态/下一步、笔记、历史队列/本机修订和1MiB+17字节原件。备份前/后逐条及逐字节核对，认证加密备份不会泄露医院名称、笔记、原件名。模拟手机B独立空白IndexedDB：使用正确独立密码先解密并校验全部状态/历史队列/原件SHA256，再一笔事务写入初始空库，重新读回确认业务/原件一致，刷新页面后保持。错误密码、篡改密文、重复恢复和已经包含医院业务的第三台手机均全部拒绝，源手机也始终原样保留。
- **自动化证据**：[GitHub Actions 新全新手机加密恢复 #43722887876](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43722887876) SUCCESS，Chromium **14/14** + WebKit **14/14**，合计**28断言通过、0失败**，均仅自动访问本机127.0.0.1；公有Worker资产清单`build-preview.cjs`不包含该实验模块。
- **当前不能夸大**：这只是**可验证的加密备份/恢复实验模块**，没有真正的手机端“导出/恢复”按钮、没有替换生产的明文IndexedDB、没有绑定真实Face ID或系统硬件认证、也没有云端长期设备身份/授权。现有公共合成preview仍不能录入真实医院资料。正式仍需完成本地全量加密、可操作的恢复界面、正式身份和离线恢复/可退回、真实iPhone Safari/PWA确认，独立正式域名及用户发版许可；旧版迁移仍不在路线中。
- **生产范围复核**：`main=c3d9ebec26b94ef056eaad649447b3ad2dba31bc`保持未改，旧正式入口与独立预览没有部署新代码。本轮所有自动验收由Assistant完成，用户无须参与。下一阶段建议聚焦把这一跨设备恢复机制和正式本机加密存储连接，避免只重复PoC演示。


## 2026-11-15｜全新工作台：加密备份界面 + 草稿密文存储双阶段已回归

- **最新开发特性 A：合成数据的可操作备份与恢复UI**。代码提交 [114ce4f72064ad714bf111d602e0d027d7d4f3d0](https://github.com/wangxueqing0427-oss/personal-workbench/commit/114ce4f72064ad714bf111d602e0d027d7d4f3d0)，在真正的V2手机“更多”页面上（只在localhost单独加载`WorkbenchFreshRecoveryLab`且明确标记合成实验时）增加两个真实表单：输入两遍独立强恢复密码、浏览器下载AES-GCM加密JSON；在另一台空白模拟手机选择备份JSON、输入密码、明确确认后先验证密文及原件哈希，再将医院/项目/笔记/队列/原件写入一笔事务。损坏密文、错误密码、重复恢复和目标有一条医院记录都会失败，无覆盖。
- **特性 A 自动验收**：[CI #43723870620](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43723870620) SUCCESS，既有跨设备加密验证Chromium14项+WebKit14项，新增**实际触屏备份/文件上传恢复UI** Chromium14/14+WebKit14/14，全部绿色。新增UI专项总28项通过、0失败。
- **最新开发特性 B：AES-GCM增量队列中也加密未完成语音草稿**。提交 [c8c03de227cdd9213fd46b0fec9d4400c32223cb](https://github.com/wangxueqing0427-oss/personal-workbench/commit/c8c03de227cdd9213fd46b0fec9d4400c32223cb) 修改仅实验用`v2/privacy-delta-journal-poc.js`，新增`readDraft/writeDraft`，草稿作为独立加密state键，非业务修订/非云队列；`commit(...,{clearVisitDraft:true})`在加密业务对象、增量队列提交的同一事务清除草稿。加密备份包含认证草稿，恢复副本可找回未保存文字，提交成功之后备份不再包含草稿；草稿密文篡改会拒绝读取和备份，事务错误保留原草稿。
- **特性 B 自动验收**：[CI #43724482429](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43724482429) SUCCESS，新增实际V2手机语音流程连接增量AES-GCM存储，Chromium14/14 + WebKit14/14，专项28项通过；同时以前分块/对象/队列、合成云端与身份全部回归成功。合计本轮新增两个UI与加密草稿专项**56项通过、0失败**（非56项完全独立的用户功能）。
- **其他独立门禁**：新鲜空白正式版发布策略 [#43723870706](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43723870706) SUCCESS，原业务手机界面 [#43723870627](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43723870627) SUCCESS，预览构建不含实验脚本 [#43723870666](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43723870666) SUCCESS。真实Cloudflare**仅隔离合成命名空间**的加密传输专项 [#43724482398](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43724482398) SUCCESS，临时`TEST_TOKEN`已删除且验证旧令牌401及匿名401（`PREVIEW_ENCRYPTED_E2E_TEST_SECRET_REVOKED`）。
- **绝对不能误报正式上线**：实验UI脚本`fresh-recovery-lab.js`不包含在公有预览Worker发布资产中，实际公开预览依然只有合成数据且此次**没有重新部署**。原有`business-store.js`在现有预览内仍是**明文IndexedDB**，对象密文/加密草稿目前仅在独立的localhost随机合成实验库；长效设备身份、服务器强制鉴权、iPhone真实Safari/PWA与Face ID、完整生产安全存储及独立正式地址仍是上线阻断项。当前还不是正式版，不输入任何真实医院或报价文件。
- **用户授权与上线策略**：V2正式启用时用户从零录入，不迁移V1.5.7；只有正式生产发布/真实资料接入需要用户显式许可。所有代码、浏览器模拟、CI和报告由助手完成，用户无需自行测试技术部分。生产`main`仍为`c3d9ebec26b94ef056eaad649447b3ad2dba31bc`，原V1.5.7、旧staging、真实资料、预览应用不动。下一步应着力**真实V2 UI与正式加密业务存储的启用/解锁/持久恢复**，而不是再开展旧数据迁移或堆积额外UI按钮。


## 2026-11-15｜加密版正式候选的首次启动解锁流程（仅合成测试）

- **本轮下一步目标**：不再让实际V2业务界面直接启动明文本机库。新增`v2/fresh-encrypted-boot-lab.js`只在localhost + `__WORKBENCH_ENCRYPTED_BOOT_LAB__=true`创建随机AES-GCM增量加密库，页面在成功设置16字符以上恢复密码前不显示任何医院/项目UI。之后只持久化随机库名，**不存储恢复密码或数据解密密钥**。重载后显示锁定页面，输错恢复密码时不开启`business-ui.js`，输对才动态加载完整真实V2界面。
- **完整手机交互链**：在模拟手机A依次新建加密库、医院、核磁维保项目、1MiB+31B原件、未完成语音草稿；在“更多”点击真正的`data-export-encrypted-candidate`浏览器文件下载（经过AES-GCM认证且包括草稿、离线历史、原件密文），JSON不包含医院名/原件名/草稿明文；刷新后立即锁定，密码正确后所有内容恢复。模拟手机B从全新空白启动，选刚才下载的JSON并输入密码，先验证全部密文，再新建独立库，解密回读业务、历史队列、原件SHA256与草稿；密码错误或修改一字节密文不会建立业务身份。手机C有自建医院后无法从启动入口再覆盖。
- **测试证据**：[V2 encrypted first-use mobile UI #43725597855](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597855) SUCCESS，Chromium **18/18**、WebKit **18/18**，合计**36项通过、0失败**。此阶段代码提交 `37e17df7e3e5577451bb8ada9591286f699d3d30`；独立检查报告 `v2/ENCRYPTED-FRESH-BOOT-REVIEW-2026-11-15.md`。它使用真正V2手机业务UI及新的加密delta草稿store，但实验脚本本身不在公有Worker资源表内。
- **全面未破坏验证**：原手机端回归 [#43725597752](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597752) SUCCESS、之前加密备份/文件导入 [#43725597760](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597760) SUCCESS、已有加密本地业务/草稿/Cloud模拟回归 [#43725597781](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597781) SUCCESS、Cloudflare build-only预检 [#43725597730](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597730) SUCCESS、正式版无旧版迁移门禁 [#43725597896](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597896) SUCCESS。
- **不可混淆的上线边界**：实验启动页及加密runtime**仅合成本机测试**；原公有合成preview继续运行之前版本，没有部署本轮变更，现有公共端`business-store.js`仍是明文IndexedDB，不可录真实业务。即使实验加密已能通过WebKit，**它仍未具有正式长效账户鉴权/服务器强制设备授权/云端与离线身份恢复、真实iPhone Safari+主屏幕PWA、Face ID密钥解封和正式发布审批**。随机UUID对象ID、集合种类等元数据在本机仍可观察，不能称为完全硬件级数据保护。
- **旧版数据决定和分工**：用户明确不迁移V1.5.7，正式版从空白开始；用户只负责最终真机上手，自动开发、GitHub测试、兼容回归、合成加密及失败恢复均由助手处理。生产`main`保持`c3d9ebec26b94ef056eaad649447b3ad2dba31bc`，V1、原staging和真实数据/附件不变；无新付费服务。下一阶段需要将合成原型转为**可审计的独立正式候选构建与真实云端设备身份方案**，不可在这些缺口完成前把测试版变成正式版。
