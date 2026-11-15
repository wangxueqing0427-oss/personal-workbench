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
