# 个人工作台 V2.0｜离线加密候选包（仅构建、不可发布）

## 这一步的目标

把此前分散于本机实验中的加密存储、解锁和真实 V2 手机业务界面，整理成**独立、可重现、具备离线缓存和文件完整性清单的构建产物**。

仍采用用户明确的**V2空白开始，不迁移V1.5.7数据**。旧 V1.5.7、云端 staging、公开合成 preview、业务资料原件与 main 均不得变更。

## 可自动验证的工作

- 源头：只接受 GitHub HEAD 中已提交的核心业务逻辑、手机界面、AES-GCM 对象加密存储、加密启动模块及构建脚本；任何工作区输入未提交则拒绝打包。
- 打包：移除演示医院/旧版迁移代码；密文业务及设备标识单独命名空间；屏蔽明文 business-store.js、旧 offline-sync.js、staging 和预览隐私覆盖脚本；拒绝未列入白名单的资源。
- 全新安装：先输入至少16字符恢复密码建立独立加密库；在此之前 UI 不读取或展示任何医院项目。重新载入要求再次解锁。
- 本机加密：AES-GCM业务对象/增量离线队列/附件原件分块加密；未完成口述草稿也为密文；16MB单份原件上限与试验用200次修订限制仍适用，不会擅自放大限额。
- 备份恢复：手机“更多”触屏实际下载完整加密JSON，新浏览器从其恢复；逐条与SHA-256原件校验，不允许恢复覆盖已有记录。
- 完整性：构建产物包含 SHA-256 + 字节大小文件清单、源提交SHA、独立 releaseId，供GitHub Actions二次核验。
- 离线：仅在localhost允许服务工作线程安装，静态资源缓存使断网后重新打开及解锁继续访问加密记录。
- 只读CI：Chromium及WebKit分别构建、校验资源、首次录入、离线打开、加密下载和跨设备恢复；不携带Cloudflare令牌、不使用生产仓库分支，不发布。
- **保护边界**：产物被锁定为 localhost / 127.0.0.1，只接受虚构测试数据。build-info.json明确记载 syntheticOnly=true、localhostOnly=true、deployAllowed=false、productionReady=false。即使构建通过，也不是获准上线。

## 正式上线仍待完成

真实用户的安全登录/可靠设备身份与撤销、真正可恢复的云端密文备份、iPhone Safari与主屏幕PWA真机摄像头/语音/隐私锁/离线验收、正式地址及用户明确发布许可。Face ID可作为便捷解锁，但不能直接替代长期安全备份。

**这一步不是旧版迁移，也不会删除/覆盖任何已有医院资料。** 


## 2026-11-15｜独立离线加密上线候选包已构建并通过两套移动浏览器

- **源码与完全独立的候选产物**：build-only 功能提交 `089a356088329d3dfbb585e91ba0a9805269f27a`；修复硬编码语音示例 `209671a72b0110cdf55c5f0584c9edb0f7003fa1`；修正候选备份UI与WebKit离线测试 `ffdcc1407ca5191f0235c1c020b4dd97bf185272`；WebKit不使用有问题的DevTools断网API，改测试服务端503且确认**没有任何网络请求抵达服务器** `dba5dcc8c2cf43d8ae54a278eeddb04aaaa8abb3`。所有改动限于 `dev/v2-preview-isolated-20261111`，V1生产 `main` 保持`c3d9ebec26b94ef056eaad649447b3ad2dba31bc`。
- **经验证的输出**：`node v2/build-encrypted-candidate.cjs` 在 GitHub Actions 从当前提交读入并核对所有代码哈希，仅生成本地目录 `v2/candidate-public/`。内含8个白名单静态资产及 `build-info.json`，9个文件；原源码不改。加密启动使用候选专用随机库名前缀，严禁明文`business-store.js`及旧`offline-sync.js`，不包含示例医院、旧版迁移/公有Worker预览资源。所有静态资源各自 SHA-256及字节数，构建关联原始提交SHA和不可变releaseId。
- **安全约束未突破**：生成的 `encrypted-store.js` 与 `encrypted-boot.js` **仅在localhost/127.0.0.1下启用**，`build-info.json`明确 `syntheticOnly:true`, `localhostOnly:true`, `cloudConnected:false`, `productionReady:false`, `deployAllowed:false`。绝不可把这个输出部署到公开站点或录入真实医院资料。无云端账号或密文同步功能。
- **测试第一轮识别并修复了真实问题**：加密备份入口仍带旧实验标志，导致无法下载；语音输入占位提示仍带演示医院；WebKit模拟断网使用DevTools代理方式引发浏览器内部导航错误。已分别修复并保留独立 CI 失败记录（不能将首次失败声称为通过）。
- **最终双浏览器自动测试成功**：[构建及上线候选手机验收 #43730959602](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43730959602) SUCCESS。Chromium **15/15** + WebKit **16/16** = **31项全部通过、0失败**。资源SHA-256校验、仅加密存储、零演示/旧版资料、全新空白首次进入、医院项目录入、语音未完成草稿、AES-GCM原件/增量历史、离线缓存、重新打开解锁、加密备份下载、第二台独立浏览器恢复原件SHA256及队列历史、再次锁定、无外部网络均成功。Chromium是Playwright浏览器真正`setOffline(true)`；WebKit是源HTTP服务器返回503并验证业务页面完全由服务工作线程缓存提供，不能混称物理设备真正断网。
- **最终验收发布源提交**：`dba5dcc8c2cf43d8ae54a278eeddb04aaaa8abb3`，`releaseId=8f8134dc9d65d7ba9ffb5265f32a6262d16692595cdb7286697f3446d0a80c4c`。文档后续提交会改变构建器中与完整提交SHA关联的releaseId；已验证的是上述源码提交。
- **正式版仍不能放行**：没有真正生产域名、正式云端长期身份与设备许可及撤销机制、真实跨设备云端自动备份、iPhone原生Face ID/WebAuthn与Safari添加到主屏幕的最终验收。候选打包仅证明可复现的**本机加密独立候选**，不等于已经完成云端正式版本或获得用户发布批准。正式版要从零启用，不迁移V1.5.7；正式生产和真实数据仍禁止自动访问、清空、迁移或覆盖。


## 2026-11-15｜加密备份状态、离线更新回滚、可复验候选安装包

- **本轮要解决的实际问题**：原“导出密文JSON”只触发浏览器下载，并不证明文件存在，也没有提示新增医院记录或未完成口述后老备份已过期。新增`WorkbenchDeltaCryptoPOC.backupStatus()/confirmExternalBackup()`：人工确认的外部备份回执以AES-GCM密文写入设备本机`meta:verified-external-backup:v1`，没有云端同步，也不计入医院业务修订；下载按钮只报告“已触发下载”，必须单独由使用者明确确认文件在手机文件App中存在，才能显示“本版本已人工确认备份”。原笔记草稿密文或业务修订变化后回执失效，首页/更多出现需更新提示；恢复到另一台设备时不复制回执，因此新设备不伪称已经有第二份外部备份。没有自动云端备份，不应告知用户“完全受保护”。
- **移动端与加密候选源码**：`v2/privacy-delta-journal-poc.js`、`v2/business-ui.js`、`v2/business.css`、`v2/test-encrypted-candidate.cjs`。首个功能提交`dffb9554a14eefd61bfe39b91b723b140ea9ba03`，随后修复端到端测试等待异步加密回执完成的竞争条件，最终稳定测试见下。注意只有加密候选或localhost实验库会出现备份状态；旧预览明文存储和正式V1均未接入。
- **安装失败保护**：`v2/build-encrypted-candidate.cjs`的服务工作线程不再直接缓存任意HTTP 200资源，首次install先逐个核对7个离线资产的SHA-256和长度后才允许skipWaiting；资源内容被篡改、脚本缺失或体积不符时拒绝安装，删除不完整新版本缓存并保留之前已验证版本。更新通过后才激活与清理旧缓存。新`v2/test-encrypted-candidate-sw.cjs`在无网络的Node VM里模拟正常安装、SHA验证、已有缓存使用、损坏JS、缺少加密脚本、旧版本保留和跨源请求不拦截。修复提交依次为`39b4ee2e32649c2228c09e794c178a2df4822ca0`、`9d8e2e9d174d836c41a7d9a3927c4fa10d6eefee`和`8166fe515bb6c53a320d658dbf6973204439d3e7`；中途失败是开发测试错误，最终已纠正并运行成功。
- **最终CI验收**：[GitHub Actions #43733834032](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43733834032) SUCCESS，Chromium手机浏览器20/20 + 离线完整性8/8；WebKit手机浏览器21/21 + 离线完整性8/8，合计**57项通过、0失败**。最新经过源提交哈希核对的代码为`acfead358405f25f83e5ca65db3d33ee3330276d`，`releaseId=af9df70588ce644ce02133eaad64905e2be22d3ca59814751cdf6fcda8a2454c`。Chromium使用Playwright断网，WebKit使用故障源HTTP服务器及Service Worker离线缓存，不代表真实iPhone已经测试通过。
- **可复验构建输出已经保存在GitHub Actions产物**：成功后在工作流上传两个浏览器矩阵各自通过验证的相同候选静态包：Chromium artifact ID`14169890520`、WebKit artifact ID`14169700494`，各约57.8KB；均包含加密业务脚本、密码首启、离线缓存、SHA/字节清单的`candidate-public`静态内容，2026-11-22 UTC到期。仅作为发布候选源码归档与审计，不支持直接在iPhone安装成正式App。它们在GitHub内部不是生产部署。
- **生产边界**：`main=c3d9ebec26b94ef056eaad649447b3ad2dba31bc`，V1.5.7、原V2 staging、公开合成preview和全部真实医院/报价/发票/文件均未改动。候选仅在localhost/127.0.0.1运行，明确标记`productionReady:false`、`deployAllowed:false`，**尚不能在正式站点录入真实资料**。
- **后续剩余阻断（按用户时间优先）**：将可复验候选适配为真实iPhone可访问的**独立测试入口**进行Safari/PWA硬件实测（不打通生产、不录真实业务），必要时完成可信设备身份与实际云端密文恢复；在发布前执行最终稳定性/备份恢复和回退演练，并由用户确认正式上线。用户已经明确**不要迁移旧版V1数据，正式从零录入**；不要反复将旧版迁移重新列为门槛或无限扩展安全PoC。开发和自动测试都由助手处理，用户只需设备上手阶段参与。
