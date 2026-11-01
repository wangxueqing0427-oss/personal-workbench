# V2 开发管理体系交付

目标：仅建立管理规范、可运行的管理质量检查和Draft审查闭环，不修改应用业务代码。

## 基线与实现

- 基线 `6c70c706ce9dec666040b20c41e68b825209be9c`；独立分支 `dev/v2-development-protocol-20261101`；PR只面向 `dev/v2-safe-candidate-20261028`，不面向main或旧历史分支。
- 更新AGENTS长期入口；CURRENT和ROADMAP明确最新状态与旧记录的优先级，保留原有严格安全规则。
- 新增开发协议，规定三方职责、单任务生命周期、风险测试矩阵、两次同类失败停止、发布独立授权、证据分类和交接停止条件。
- 新增统一报告模板，不建立重复的最新状态文档。
- 新增Node管理检查器及12项纯合成拒绝/接受自测，使用内置依赖，不安装软件、不连接云端。
- 新增非部署PR工作流，最小只读权限、固定checkout提交、不保存凭据、无secrets/Cloudflare调用。PR比较基线来自事件的完整base SHA，同时验证安全候选祖先，不因后续候选已有合法业务改动而把它误算成本PR改动。

## 修改文件

AGENTS.md、CURRENT.md、ROADMAP.md、本报告、开发协议、任务模板、scripts/v2-management-check.cjs、.github/workflows/v2-management-gate.yml。

## 本地验证

```text
node --check scripts/v2-management-check.cjs
node scripts/v2-management-check.cjs --management-only
node scripts/v2-management-check.cjs --self-test
git diff --check
```

- 管理门禁5项PASS / 0 FAIL / 0 BLOCKED：文件、变更范围/生产应用保护、敏感模式、相对链接、非部署工作流。
- 自测12项PASS / 0 FAIL / 0 BLOCKED：允许管理文件和相对路径，拒绝业务/生产文件、凭据、私人路径及高权限/部署工作流等。
- 首次自测1项失败是把返回数组误与数字0比较；改为检查数组长度，未降低拒绝断言、未改应用代码。最终结果以复测为准。
- 本轮没有重跑无关浏览器/备份/同步测试。应用、Worker、生产文件相对安全基线无差异；不触碰现有构建和旧归档。
- 机器原始结果位于本地忽略目录 `.tools/management-check-20261101.json`、`.tools/management-self-test-20261101.json`。提交SHA由提交历史及PR提供，不用循环改报告冒充后续HEAD已重新构建。

## 边界和待证

- 本地门禁已运行；远端CI须在Draft PR创建后独立核对结果。不把配置存在当作远端PASS。没有设置required-check或修改仓库保护规则。
- 这些是管理/隐私模式检查，不是全面密钥检测、任意敏感信息证明或业务安全验收。未来业务CI、自动风险选择、定时报告、ChatGPT自动独立审核连接仍是方案，不宣称实现。
- Cloud检出、完整活动版本与安全回滚等既有BLOCKED未解决；历史WebKit限制保留。
- 用户已明确要求本轮提交和Draft PR，故仅交付新管理分支；不合并、不部署、不操作真实或合成云端数据。

下一步：用户与ChatGPT审核本PR并决定是否合并到安全开发分支；Codex停止，后续仅执行获批准的单项P0。管理通过不等于试运行或生产批准。
