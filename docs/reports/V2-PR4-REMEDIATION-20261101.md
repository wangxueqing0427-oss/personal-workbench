# PR #4 独立审核整改证据

范围：仅 scripts/v2-automation.cjs、scripts/v2-management-check.cjs、只读PR工作流及本报告。基线290a18b0df30f4f2948c07f69f7a1f916b97c153，分支dev/v2-development-protocol-20261101。

## 结果分类

子测试非零退出（包括2）、信号、超时、执行错误、缺失报告、损坏JSON、错误类型、缺失/不一致字段全部FAIL。HTTP要求原18断言和非生产标志；远端发现要求12条完整场景、状态计数一致；备份要求原双尺寸、每组28断言、99合同及11业务项目与完成标志。不降低既有测试断言。BLOCKED仅由运行前已有Playwright/浏览器环境探测产生，不信任子报告自称BLOCKED。未知运行器异常保守FAIL。原始stdout/stderr及非法报告仍保存在各次独立目录，不覆盖首次证据。

## 管理门禁

扫描所有受跟踪/候选.github/workflows下YAML文件。权限仅接受保守子集中的read/none，write、write-all、flow/标量权限与不支持的别名/标签/合并均拒绝；触发仅允许既定PR映射，拒绝push、schedule、workflow_dispatch、pull_request_target及其他事件。外部Action必须完整40位SHA。当前工作流只读、无Secrets、无部署命令，新增分类自测步骤。

这不是通用YAML解析器；超出受支持子集时拒绝并要求审查，而不是猜测安全。现有唯一工作流已覆盖；不表示任何任意shell脚本都已被静态证明无风险。

## 首次失败保留

首次门禁执行：4 PASS / 1 FAIL / 0 BLOCKED；首次管理自测27 PASS / 1 FAIL。原因：别名检查匹配到已批准路径docs/**中的星号，误报unsupported YAML alias/tag/merge。原始执行输出保留在本次Codex工具记录，未删除。已改为YAML token边界识别；原有接受/拒绝断言均保留。随后门禁5 PASS、自测28 PASS，0 FAIL / 0 BLOCKED。分类自测初次11 PASS，之后补充两项环境阻塞验证。

## 最终精确提交取证方式

先提交最终运行器、工作流和本报告，再在该精确HEAD执行：

- node scripts/v2-management-check.cjs --management-only
- node scripts/v2-management-check.cjs --self-test
- node scripts/v2-automation.cjs --self-test
- node scripts/v2-automation.cjs --profile smoke

最后一次smoke的完整脱敏summary、源码SHA、运行器SHA256、四组数量、场景结果及日志哈希直接提交至PR #4 Conversation，作为可公开审阅证据；不为补写同一SHA而再制造提交循环。此文档不预先宣称尚未执行的最终smoke通过，结果以PR评论和Actions链接为准。

未修改v2、Worker、生产根文件、数据库或备份；不访问Cloudflare、不装依赖、不部署。旧Windows WebKit持久离线BLOCKED仍保留，本轮WebKit备份通过不替代它。下一唯一任务：ChatGPT独立复审本PR。

## 2026-11-10 本地交付冲刺补充（优先于上述推送计划）

当前授权仅本地候选，不推送或更新GitHub评论。原三个修改及未跟踪报告已逐字节备份到独立忽略目录并记录SHA256，未丢弃原成果。本轮只修补报告分类、环境阻塞识别及管理门禁；补充HTTP矛盾字段拒绝、未知预检错误FAIL、CRLF自测一致性、Secrets括号访问和异常触发缩进拒绝。

安全候选6c70c706与原PR #3完整814173a分别从各自已有本地仓库读取树对象比较，不依赖共同祖先：31个运行资源/测试文件中22个对象完全相同，包含offline-sync.js、business-store.js、sync-controller.js、Worker及test-remote-discovery.cjs（具体名单见本地pr3-file-comparison.json）。9个测试脚本差异已逐条查看：改用已有Playwright模块、跨平台浏览器channel/临时路径，或用14份固定旧资源代替读取旧Git历史；没有删除场景断言。本轮不改v2代码。

最终候选提交后运行四组smoke，机器证据保存至独立.tools/autonomy目录，源码SHA与运行器SHA256写入summary；本轮不预填PASS。最终本地验收摘要及场景结果另存忽略目录供审核，不为记录测试后SHA而修改已测源码。当前不存在本轮GitHub Actions结果，不把旧290a18b的CI借用作新提交证据。

进入合成HTTPS验收仍需先审核本候选、明确活动版本及资产/回滚依据，再单独批准测试部署；本地通过不等于部署许可。Cloudflare管理权限未检查，旧历史链UNPROVEN、Windows WebKit持久离线历史BLOCKED继续保留。同步原件、备份、事务与远端变化安全仍以既有专项和本轮实际smoke分开报告。
