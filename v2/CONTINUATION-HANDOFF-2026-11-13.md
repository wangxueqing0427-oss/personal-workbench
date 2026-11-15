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
