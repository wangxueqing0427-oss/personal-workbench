# V2 独立加密候选 HTTPS 测试部署说明（2026-11-16）

## 目标

把通过本机加密与离线验收的V2 fresh-start候选包，部署到一个与生产、V1.5.7、旧V2 staging和旧合成preview完全隔离的Workers静态测试入口，供真实iPhone Safari/PWA验收。

目标Worker：`personal-workbench-v2-encrypted-candidate`

目标地址：`https://personal-workbench-v2-encrypted-candidate.wangxueqing0427.workers.dev/`

## 设计边界

- Cloudflare Worker仅提供静态文件；Wrangler配置无Worker脚本入口、无数据库、无KV、无R2、无Durable Objects、无环境变量、无自定义路由。
- 医院、项目、笔记、文件、语音草稿、AES-GCM密文与备份回执仅存在访问者自己设备的浏览器IndexedDB；服务器不接收业务记录、不提供同步API。
- HTTPS测试页面是公开静态页面，不是用户登录系统。每个浏览器本机库彼此独立，但任何人都可以打开测试页面。noindex不等于访问控制。禁止录入真实医院/客户/报价/合同/发票资料。
- 相机和麦克风的Permissions-Policy仅允许同源页面使用；仍需iOS Safari系统权限。语音识别依赖浏览器能力，不支持时回退到iPhone键盘麦克风。是否支持、是否走系统云端识别，必须以真机实际行为为准。
- 该测试入口不接入原工作台的云端同步、历史数据库、旧V1.5.7或其他Worker。

## 已完成的代码与自动化

- `v2/build-encrypted-candidate.cjs`：构建器只允许localhost、127.0.0.1和上述唯一Worker域名；生成noindex、安全响应头和同源相机/麦克风策略。
- `v2/wrangler.encrypted-preview.jsonc`：纯静态资产Worker配置。
- `v2/test-encrypted-candidate.cjs`：本机fresh-start、医院/项目、语音回退、相机入口、AES-GCM、备份回执、恢复、断网与Service Worker完整性验收。
- `v2/test-encrypted-candidate-remote.cjs`：部署后验证真实HTTPS地址、8个资产SHA256、响应头、PWA scope、业务首启、相机入口、语音回退和离线启动。
- `.github/workflows/v2-encrypted-candidate-preview.yml`：只允许指定隔离分支、固定Worker名称和纯静态配置；部署前核对现有Worker无数据绑定并启用workers.dev；部署后必须跑远端Chromium/WebKit测试。

最新本地CI：[Run #43775914123](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43775914123) SUCCESS：Chromium 25浏览器断言+8个Service Worker断言；WebKit 26浏览器断言+8个Service Worker断言；总计67项通过。源提交`95a70ae2154e80d22b242fdae60166beea05ca50`，releaseId `068236667a5cd8186a6f795f06acbaa1944b2a82596729a64a15dbc574952a10`。

## Cloudflare权限：最小范围，不使用账户级Admin

Cloudflare官方说明：
- [Workers权限模型](https://developers.cloudflare.com/workers/authorization/workers/)：创建新Worker需要Workers产品级Admin；已有Worker可授予单个Worker范围Editor并部署。
- [Workers API脚本接口](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/)：可读取Worker settings与workers.dev subdomain状态。

因此先由账户持有人在Dashboard创建专用空Worker，再生成仅限该Worker的Editor Token。GitHub Actions部署不需要读取任何业务数据。

## 用户只需完成的准备

1. 打开Cloudflare Dashboard → Workers & Pages → Create → Worker。
2. 名称准确填写：`personal-workbench-v2-encrypted-candidate`。
3. 创建后确认`workers.dev`已启用；不添加KV、D1、R2、Durable Objects、变量、Secrets、Custom Domains或Routes。不要创建或绑定任何生产数据资源。
4. 在Cloudflare API Tokens创建新Token，权限选择Account/Workers → **该单个Worker的Workers Editor**，不要给整个账户Workers Admin。
5. 打开GitHub仓库 `wangxueqing0427-oss/personal-workbench` → Settings → Secrets and variables → Actions，新增Repository Secret：
   - Name：`CLOUDFLARE_ENCRYPTED_CANDIDATE_API_TOKEN`
   - Secret：刚生成的Token
6. 保留现有`CLOUDFLARE_ACCOUNT_ID`；不要修改或覆盖`CLOUDFLARE_PREVIEW_API_TOKEN`。
7. 完成后告诉助手“专用Worker和新Token已准备”。助手再触发部署与远端验收，不需要用户复制命令或手工上传文件。

## 失败记录与纠正

- Run #43775767960的9106由工作流作者将GitHub表达式错误转义导致，CI传递了字面占位符；后续提交已移除转义。不能把该次错误归因于用户Token过期。
- Run #43776312936修复表达式后，Cloudflare正确识别请求，但返回403 `No access to the specified resource`：现有Token不能访问尚未创建的专用Worker。部署在Wrangler deploy之前停止，未创建、覆盖或修改任何Worker。
- 后续工作流改为独立Secret和单Worker Editor权限，且仅由单独trigger文件或workflow_dispatch启动。新Worker必须先存在并且零绑定、workers.dev启用才会进入部署。

## 尚未完成

- Cloudflare专用Worker创建和新Token配置（需用户一次性操作）。
- 真正HTTPS部署与远端资产/浏览器冒烟验收。
- 用户iPhone Safari添加到主屏幕、首次加密库创建、相机拍摄、相册选择、语音识别/键盘麦克风、锁定解锁、离线重启的真机验收。
- Face ID/WebAuthn尚未实现或验收，不得声称已支持原生Face ID。
- 正式发布批准尚未发生；不得把本测试Worker升级为生产，不得迁移V1数据或录入真实资料。
