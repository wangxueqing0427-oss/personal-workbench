# 独立 Linux 打包验证

仅针对候选 `6c70c706ce9dec666040b20c41e68b825209be9c`，不修改应用，不部署。

独立分支 `ci/v2-wrangler-dry-run-20261110` 的 Draft PR 只面向安全候选分支。工作流仅响应初次 `opened`，并检查同仓库、明确head分支及固定base SHA；不接受push、synchronize、reopened、dispatch或pull_request_target。应用从固定候选对象创建新临时worktree，不能以PR HEAD替换应用源码。PR只允许列明的六项CI文件差异；运行前核验。

本PR工作流/验证脚本本身仍是需要独立审查的内容，不声称能防止拥有仓库写权限的人今后篡改工作流。未来修改不能借本轮授权自动重跑。

标准ubuntu-latest，Node固定24.22.1、Wrangler固定4.149.0，复用已有依赖锁并把根依赖收紧为精确版本。npm ci仅在临时目录运行，禁用依赖安装脚本、审计和缓存Action；不安装全局软件。外部Actions均固定完整SHA。仅contents:read，不引用Secrets，不保留checkout凭据，不使用Cloudflare凭据。

候选构建器原样运行，校验已审查的18资源期望清单及完整releaseId。Wrangler使用显式--cwd/--config/--outdir和--dry-run，隔离用户配置、清理子进程环境、关闭遥测，运行时Node网络保护阻止外部连接。此保护不是操作系统级网络隔离；没有凭据或任何实际发布分支。失败保留脱敏日志，不能改成PASS。

Artifacts仅上传JSON、Markdown和日志，保留1天，不上传Worker包、依赖或业务资料，不自动发布。没有安装或读取任何生产资料。旧Windows WebKit离线BLOCKED、云端回滚及费用即时核验不因本次打包结果而消除。

自动部署关联依据用户提供的官方页面只读核验及证据：
- https://agent.tinyfish.ai/runs/0a243564-cf8f-4ce0-aaa8-6b895a3a9a68
- https://agent.tinyfish.ai/runs/07dae3a8-a81f-430b-9363-dde98efd815f

已检查关联允许本次新分支推送；未知外部独立脚本仍不能绝对排除。现有分支、PR #3/#4、main保持不变。不合并、不部署、不回滚。
