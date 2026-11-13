# V2.0 独立预览 · 2026-11-13 自动化验收证据

> **状态：内部合成测试通过；非正式环境、非真实 iPhone 终验，禁止接入真实医院数据。**

## 目标和隔离边界
- 仓库：`wangxueqing0427-oss/personal-workbench`
- 仅使用开发分支：`dev/v2-preview-isolated-20261111`
- 独立预览 Worker：`personal-workbench-v2-preview`，`TEST_ENVIRONMENT=synthetic-only`。
- 原 V1.5.7、`main`、原 `personal-workbench-v2-staging` 和真实客户数据不在本轮部署及测试范围内。
- 无付费套餐升级；使用已有 Workers Free。
- 云端测试使用随机 UUID 分隔的合成测试数据。临时 `TEST_TOKEN` 由 GitHub Actions 创建，仅用于单轮测试，测试后自动删除并检查不存在。云端实测由脚本自动完成，不将 API 密钥、测试令牌、加密密钥写入 Git。

## 已完成且有运行证据的自动化检查

### 预览版实际发布
- GitHub Actions： https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43354672412
- 18 个资源完整性 SHA-256 校验，通过；最终 Worker version `5f61e2cb-e923-4ac5-992f-77f9bf7ea410`，预览首页 iPhone 截图显示布局正常。
- 预览页面源码标记：`0246bafd0ea1dfd3dfa143703c0c5de1f7bc30d7`。

### 已部署的手机界面 / 加密备份
- Chromium（390×844）：87 PASS / 0 FAIL。
- WebKit（Safari 内核模拟，390×844）：83 PASS / 0 FAIL。
- GitHub Actions： https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43357429435
- 实测：UI 导航、医院业务、耗材、记录确认、文件原件读取、刷新后持久化、加密下载、备份篡改拒绝、隔离恢复前后现有数据与原件一致；Chromium 另验证 Service Worker 离线重新打开。

### 真实独立 Cloudflare 云端 · 接口级
- 35 PASS / 0 FAIL（加密同步、512KiB 原件字节级完整性、分片幂等、冲突拒绝覆盖、双方显式合并、历史密文保留、设备授权一次性、隔离命名空间、权限与认证检查）。
- GitHub Actions： https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43358701880

### 真实独立 Cloudflare 云端 · 双设备实际浏览器 UI
- 26 PASS / 0 FAIL，两个完全独立的 Chromium 手机模拟浏览器会话、同一仅合成测试命名空间。
- GitHub Actions： https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43358701880
- 实测：从工作台界面接入测试身份、A 端合成医院和文件上传、断网添加记录与联网补传、B 端发现原有云端版本冲突而不覆盖、逐项核对草稿不改云端、B 显式确认合并后保留双方记录、B 可读 A 原始文件字节、A 发现更新而保持本机记录不变。
- 单轮合计：61 PASS / 0 FAIL（35 接口 + 26 双端 UI）。
- 同一 CI 的 `Revoke temporary test secret` 和 `Remove temporary token` 步骤均 PASS，日志具有 `PREVIEW_TEST_SECRET_REVOKED`。

**以上三类最新有效结果合计：87+83+35+26=231 项通过，0 项失败。** 这是 4 组测试断言，不是 231 个相互独立的实际业务场景。

## 尚未达到正式投入使用的条件
1. 当前公开预览站点的长期测试身份**未启用**：自动化脚本使用的单轮 `TEST_TOKEN` 已安全撤销；普通浏览器首页有“待同步”本地队列不代表云端连接完成。
2. 需要安全、可撤销的手机最终验收身份接入方式；不得在聊天、仓库、URL 公开长期身份和密钥。
3. 需要用户在单次最终 iPhone Safari / 添加到主屏幕模式验收真实设备差异，自动化 WebKit ≠ 真正 iOS 实机。
4. `V2.0` 正式环境和真实资料迁移尚未获批，也未执行；Face ID 隐私锁等正式需求未据本轮自动化验收宣称完成。
5. 需在准备正式版前独立审查数据迁移、性能上限、隐私控制、灾备恢复与长期稳定性；先证据、后发布。

## 分工
- 助手负责：代码、回归、自动化、发现问题后修改和复测、准备最终验收条件。
- 用户负责：最终 iPhone 验收、任何正式部署或真实数据迁移的明确批准。
