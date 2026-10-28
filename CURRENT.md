# 当前可靠交接入口

## 安全候选覆盖说明（2026-10-28）

本文件下方保留整理时的来源记录；候选的最新状态以本节和 `v2/SAFE-BASELINE-20261028.md` 为准。

- 当前为独立本地仓库的 `dev/v2-safe-delivery-candidate`；采用无父提交快照，不带入旧Git对象或私人路径历史。原仓库/原分支/四份未提交文档完整保留。
- 源码完整取自 `814173aabc3b26cc29659e050c15ea0eed326c59`；业务、同步、Worker、PWA、生产文件字节不变，只修复测试依赖/路径及旧缓存测试的历史资源读取。
- 旧资源取自4986fd5，以14份字节一致、带来源和SHA-256的测试副本替代读取旧Git对象。此副本只用于隔离缓存测试，不运行生产数据。
- 候选尚未推送；GitHub PR #3仍814173a，目标开发分支仍4986fd5。Cloud实际检出版本未知，未更新。
- 下一步：人工批准后仅推送新候选分支，并在Cloud显式检出完整SHA验证；不得合并旧PR将私人路径历史重新接入候选，也不得强改旧公开历史。
- 历史Windows WebKit BLOCKED、Cloudflare管理权限及原生iPhone新版本升级验证限制继续保留。本轮不部署或重复旧手机验收。

核验日期：2026-10-28（Asia/Shanghai）。本轮只整理流程文档，无业务代码修改、推送、合并、部署、云端数据操作或测试重跑。

## 本轮实查基线

- 本地分支 `dev/v2-remote-discovery-review`，HEAD `814173aabc3b26cc29659e050c15ea0eed326c59`；修改文档前工作区干净。
- GitHub [Draft PR #3](https://github.com/wangxueqing0427-oss/personal-workbench/pull/3) 仍 open、未合并；实时 GET 核实 HEAD 同上，目标 `dev/v2-p0-data-safety`，base `4986fd5771ee3db83de3c93a0c6147709d43703b`。
- 本地 origin 跟踪引用仅显示旧 base；普通 Git 网络访问失败，已用 GitHub 连接器只读核实 PR，未 fetch 或改引用。Git 所有权提示通过单次 `-c safe.directory` 处理，没有修改全局配置。
- 本轮范围未发现已有 AGENTS / ROADMAP / CURRENT；复用现有报告，不改写旧计划及测试记录。

## 关键差异：当前清理不等于安全替代历史

- 原提交 `0d3d37b23d79319ffd15352b880437b417a86520` 仍是 HEAD 祖先（`git merge-base --is-ancestor 0d3d37b HEAD` 返回 0）。
- `f8551fe9c435ed9dda0d21074a9e507293ac1e8a` 为后续测试路径清理提交；见 [现有审查交接](v2/REMOTE-DISCOVERY-REVIEW.md)。GitHub PR 正文也明确旧历史保留。
- 当前修复已在 GitHub 审查分支，但**未证明已有排除旧私人路径历史的替代提交**；不能将 f8551fe 称为干净替代历史。本轮不改写、强推或另建替代分支。
- `personal-workbench-dev` Cloud 基础验证为用户交接信息；本轮没有该环境的检出/运行证据，实际 SHA、是否更新均 BLOCKED，不猜测它已等同本地或 PR。

## 已有关键证据（非本轮重跑）

|能力|可信证据|已记录结果/范围|
|---|---|---|
|空队列安全发现远端|[审查](v2/REMOTE-DISCOVERY-REVIEW.md)、[逐项结果](v2/remote-discovery-results.json)|12 PASS；HTTP 18 项断言 PASS；先核验再暂存，显式确认合并|
|资源混用暂停及整组升级|[审查](v2/CACHE-PROTOCOL-FIX-REVIEW-20261025.md)、[结果](v2/release-compat-results.json)|11 PASS；本地隔离浏览器|
|PWA稳定身份/两组升级|[审查](v2/PWA-STABLE-ENTRY-REVIEW-20261025.md)、[结果](v2/pwa-upgrade-results.json)|8 PASS；相关 P0 两尺寸各 28 项断言 PASS；非原生 iPhone 安装测试|
|iPhone同步及原件|[服务端验收](v2/IPHONE-FINAL-ACCEPTANCE-20261023.md)|既有验收通过，不重复要求用户测试；非当前云端状态的新证明|
|Windows WebKit限制|[报告](v2/WEBKIT-PERSISTENCE-20261023.md)|历史汇总 236 PASS / 0 最终 FAIL / 1 BLOCKED，不能改称通过|

## 风险及边界

- Cloudflare 管理只读核验此前 401、后续设备授权超时；本轮未重新授权或请求 Cloudflare，当前活动版本、免费套餐、代码/资源回滚就绪仍未确认。
- 云端版本 10、35 条记录及两份 524288 字节原件为既有取证基线，不是本轮现况。版本 10 可恢复加密快照不等于完整历史数据库备份。旧历史链缺口继续 UNPROVEN。
- Linux/Cloud 测试实际执行未核实；本地模拟 PWA 不等于 iPhone 原生安装升级验收。
- 当前文档变更未提交；本轮 HEAD 保持不变。main 和生产不在本轮修改范围。

## 下一步唯一任务

按 [ROADMAP](ROADMAP.md) P0-1 完成安全替代历史的交付方案审查与 Cloud 实际基线核验。待用户下一轮授权再实施；不得原样把含私人路径的旧历史当作新安全交付。不要重复实现已有远端发现功能或重跑无关测试。
