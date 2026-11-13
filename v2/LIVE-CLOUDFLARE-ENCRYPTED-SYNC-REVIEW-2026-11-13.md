# V2.0｜真实 Cloudflare 独立 Worker 加密同步验收记录（2026-11-13）

## 最终核验结论

**真实 Cloudflare 独立 Preview Worker + 两个独立的自动化手机浏览器 + 加密记录/原件已闭环；限合成数据和一次性测试身份。** 这不是正式业务上线、常驻设备配对，也不是用户真实 iPhone 已通过验收。

- 真实云端专项成功：[GitHub Actions #43401928008](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43401928008)，Chromium **39 PASS / 0 FAIL**，WebKit **39 PASS / 0 FAIL**，合计 **78项通过、0失败**。本次新增真实云端专项测试不是此前本机模拟的额外业务场景，仅表明相同协议确实在独立 Cloudflare Worker 上运行通过。
- 完整本机回归也已重新绿色完成：[GitHub Actions #43402174571](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43402174571)，Chromium 169 PASS + WebKit 169 PASS，合计**338项通过/0失败**，包含基础 AES-GCM、加密库备份、只读影子迁移、原业务界面、分块附件、逐对象记录、增量队列和双设备本机仿真等全部原有回归。**338项与78项分属两套验收，不宜当作416个完全不同业务场景。**
- 远端验收实际执行了两个相互隔离的随机测试命名空间，各自形成 **6个已提交云端历史版本**、**122次加密分片写入**、**2次重复分片幂等确认**；使用固定的 **`personal-workbench-v2-preview`** Preview Worker，不是原 `personal-workbench-v2-staging`，不曾连接正式生产 V1.5.7。
- GitHub 工作流中 **`TEST_TOKEN` 先检查不存在，再随机生成一轮用临时密钥，通过 `wrangler secret put` 写入指定 Preview Worker，测试结束后即 `wrangler secret delete`，最后通过 secret list 核查 TEST_TOKEN 不再存在**；日志明确出现 `PREVIEW_ENCRYPTED_E2E_TEST_SECRET_REVOKED`，匿名 `/sync` 仍返回401：`LIVE_PREVIEW_ANONYMOUS_SYNC_BLOCKED`。密钥没有出现在浏览器端，也未写入仓库。测试 Runner 本地秘密文件在 finally 清理。
- 所有真实 Worker API 访问均带两个条件：**服务端临时 TEST_TOKEN** 和每轮由 `crypto.randomUUID()` 生成的独立测试头 `X-Workbench-Test-Run`。请求进入部署的 `TestSync` 独立 DO 命名空间；验证另一个随机命名空间仍为空。
- 真实云端测试时，浏览器只访问独立 localhost 页面与 `/sync`；本机 Node 临时代理才持有 Cloudflare 临时 Token，将请求固定转发到上述唯一 Worker 地址，禁止更换 URL 或访问其他 Cloudflare 资源。浏览器只持有随机的合成口令与传输密钥，不见真实云端临时授权值。
- **未运行任何正式部署**，没有更改业务首页、V1/生产 `main`、原 V2 staging 或真实数据。此轮只新建独立测试代码/工作流和修改独立开发分支的 CI 白名单；原预览应用资源保持已发布的19项合成资源。

## 经过真实 Cloudflare API 校验的行为

1. 第一台浏览器把医院和 **512KiB+21B** 的合成原件打包成本机加密档案，再使用独立 AES-GCM 传输密钥二次加密；以多个密文分片上传，服务端收集并进行 SHA-256 内容校验与 `expectedRevision + expectedHash` CAS，完整提交后只生成一个远端修订号。
2. 第二台独立浏览器用正确恢复口令与传输密钥解密，把第一台的医院和原件**恢复到全新隔离本地数据库**，确认逐字节 SHA-256 一致；未经显式 `approved:true` 无法接受远端版本。
3. 第一台模拟断网后继续修改医院，第二台联网写另一所医院；第一台联网发现分叉，先保留本地与云端**两套独立加密库**，合成测试中明确授权后只对无重叠的对象合并，并用最新云端 CAS 提交。两台原有数据库均不被静默覆盖。
4. 两台设备对**同一医院ID**给出不一致内容时，自动合并明确失败，双方独立加密副本保留，等待人工逐字段确认（目前没有正式用户交互界面）。
5. 上传结束但确认消息被模拟丢弃时，再次读取云端并通过相同密文 Hash 证实成功，不新增重复历史版本。**模拟中途断网**时重发已存储的分片；原 Worker 按上传ID/索引验证完全相同内容可以幂等确认，不能用不同分片替换，最终只新增一个有效版本。
6. 远端历史修订 **1和5** 都可以用 `/sync/history/:revision` 恢复到新库，原有本机最新状态保持不变。
7. 匿名同步请求、错误 bearer、错误传输密钥、错误远端摘要、跨域/非白名单端点都被拒绝，本机已写入的记录与队列不会自动删除；新版客户端不把待同步数据假报为“已备份”。
8. 每个测试轮次最后独立请求真正的 Worker `/sync/diagnostics`、`/sync` 和 `/sync/history/1`，验证**真实 SQLite Durable Object 六个已提交历史版本、最终哈希、初始历史密文及另一随机命名空间的隔离性**。不是只检查测试脚本内部模拟变量。

## 追加：临时密钥撤销的真实请求验证（最终强化门禁）

- [最新真实云端强化复测 #43402890786](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43402890786) 绿色，源码 SHA `b23a6677226d61509c5543d10d5ed749a4d02de5`。
- Chromium **39项通过 / 0失败**，WebKit **39项通过 / 0失败**；同样分别实测6个不可变历史版本、122次加密分片及2次重复幂等确认。
- 在此前成功的 Secret List 删除审计与匿名 401 的基础上，本轮**额外从测试CI进程实际使用已被删除的旧Bearer Token请求 Cloudflare Worker**，最多等待传播30次，最终确实收到401，日志为 `LIVE_PREVIEW_PREVIOUS_TOKEN_REVOKED`；匿名请求也实际收到401，日志为 `LIVE_PREVIEW_ANONYMOUS_SYNC_BLOCKED`；最后确认 `PREVIEW_ENCRYPTED_E2E_TEST_SECRET_REVOKED`。这比单凭配置里看不到密钥更严格。
- 若 `secret put` 在一部分过程成功、随后步骤报告失败，清理步骤现在也会检查并清除存在的 TEST_TOKEN；不再只依据步骤标记成功才尝试撤销。**若整个授权流程未开始，则不会写入新Token。**
- 本轮日志确认从始至终只作用于 `personal-workbench-v2-preview`；生产 `main`、原 staging、用户手机数据未被访问。正式身份与完整业务上线仍按本报告阻断项处理。

## 本轮排错和复测经过

- [#43401768957](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43401768957)：本机 CI 的旧规则禁止任何文件出现 Preview 域名，新远端联调脚本需要一个经过审计的固定地址，故被安全扫描阻断（代码测试未执行）。
- [#43402079131](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43402079131)：首次拆分白名单后，精确字符串匹配使用了 shell 转义字面量导致校验失败（仍属 CI 规则，不是业务数据失败）。
- [#43402174571](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43402174571)：修复为精确固定地址匹配后，Chromium 与 WebKit 本机全部338项通过，保留域名白名单和禁止任何 staging/生产源引用的规则。
- [#43401928008](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43401928008)：独立真实云端完整成功，临时密钥确认撤销。

## 不能称作正式交付的阻断项

- **持久安全身份/设备配对尚未交付**。测试使用临时 Worker 管理密钥与随机令牌，不能替代可长期使用的用户端身份、可撤销的设备登录、传输密钥封装/轮换与丢失手机恢复。
- **浏览器真实设备密钥保管与 Face ID 解锁尚未交付**。平台 WebAuthn 验证 ≠ 本机加密密钥解封；没有真实 iPhone Safari/PWA 的 Face ID+安全恢复、后台自动锁、离线、磁盘空间及主屏幕安装全链验收。
- **当前测试每次上传完整加密归档**（本机虽然已是增量日志）；尚没有真正的云端对象级增量上传、多文件按内容寻址、缓存垃圾回收或大容量配额方案。
- **冲突处理尚需正式交互**。新旧同ID的不同更改以及远端新增未知文件，不允许在没有核对原件与逐字段人工确认的情况下自动覆盖；目前只验证了拒绝和保存双方。
- **单设备密文库原型仍有容量和性能上限**；不是医疗信息系统的合规、安全评估或生产可用保证。真实用户迁移还需逐设备、逐域名、逐附件的备份和源数据完整性核验。
- 原正式版、原 staging、生产 `main`、已有真实医院/耗材/联系人/附件数据仍保持不变。后续任何生产迁移、正式上线、长期身份授权、收费服务使用均须用户单独批准。

## 下一道技术门禁

先继续在隔离合成环境设计并验证**长期的最小权限设备凭据、凭据撤销、密钥封装与换机恢复**，同时加入加密对象云端差量上传的协议完整性测试和冲突逐项确认路径。所有自动化完成后才安排一次真实 iPhone Safari / 主屏幕最终验收；最终真实数据迁移必须用户明确授权。
