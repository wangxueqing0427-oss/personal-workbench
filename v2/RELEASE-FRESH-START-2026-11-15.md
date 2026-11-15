# 01｜个人工作台 V2.0：正式启用采用全新空白数据（2026-11-15）

**用户最新决定：V1.5.7只用过一两次，不要求数据迁移。V2.0正式上线后从零开始使用，再自行录入业务资料。**

## 当前交付策略

1. **取消 V1→V2 正式上线的迁移前置条件**：无需旧版生产 localStorage/IndexedDB 提取、旧附件转化、历史日志合并。先前的迁移审计代码仅保留为开发历史，不再进入新的正式上线验收门禁。
2. **全新独立入口及空白库**：未知/正式域名首次启动调用 `WorkbenchBusiness.empty()`，空医院、空项目、空文件、空订单；清楚显示“从第一家医院开始”。只在专用合成 preview Worker 或本机测试页展示演示医院。V2有已保存内容时，改变启动模式也不会覆盖既有记录。
3. **保留现有 V1.5.7**：不清空旧版，不覆盖已有主屏幕图标，不连接或读取旧版数据；用户新录的医院、项目、耗材、维保资料属于 V2 体系。也**不预装真实医院名单**。
4. **已自动回归**：独立浏览器上下文伪造一份旧版 `localStorage.personalWorkbench`，新 V2 首启仍为空白；可添加第一家合成医院，保存、刷新后保留，并确认旧版键值未被修改；预览版演示数据行为与既有测试保持兼容。
5. **不擅自正式部署**：当前开发分支仍是隔离 synthetic-only Worker；V1.5.7/生产 main/旧 staging/真实资料未动；候选版的正式网址/权限、加密存储及可恢复备份尚需验收并经用户最终发布确认。

## 新正式上线阻断项（不包含历史迁移）

- 新的独立正式域名和数据库隔离已核验；
- 正式构建无示例医院、客户及合成文件；
- 真实医院业务数据的本机加密与安全密钥保护；
- 可恢复的完整备份与原件字节核对；
- 可持续使用的设备身份/云端认证与断网恢复；
- 真正 iPhone Safari/PWA 的相机、语音、锁定和离线测试；
- 正式发布前用户明确授权。

`fresh-start-readiness.cjs` 与 CI `v2-release-readiness.yml` 将此策略设为标准上线门禁。**旧版数据迁移不再拖延发布，但仍不能把公有合成预览误认为可以放入真实医院资料的正式系统。**


## 2026-11-15｜全新工作台：加密备份界面 + 草稿密文存储双阶段已回归

本轮将恢复实验推进到可在**实际V2手机界面**操作的合成导出/恢复页（不进入公开预览），并将**未完成语音草稿**加入对象增量AES-GCM加密原型、同事务清理及认证备份。

- 用户不必迁移V1.5.7，正式版必须继续空白启用。实验导出／导入在隔离localhost运行，不允许在公共Worker或生产使用。
- [手机真实点击备份/导入专项 #43723870620](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43723870620) Chromium14 + WebKit14 新UI断言全部通过；[草稿密文/事务/恢复专项 #43724482429](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43724482429) Chromium14 + WebKit14 新加密草稿断言全部通过，新增56断言0失败。
- 加密实验无法替代目前业务UI仍使用的明文本机`business-store.js`；缺安全启用/解锁、永久设备身份、可信云端备份、真实iPhone及Face ID验证。**productionReady=false**。不在此时开放真实资料或发布正式域名。
- 工程细节及完整限制参见`v2/FRESH-RECOVERY-LAB-2026-11-15.md`、`v2/DELTA-JOURNAL-REVIEW-2026-11-13.md`，完整交接参见`v2/CONTINUATION-HANDOFF-2026-11-13.md`。


## 2026-11-15｜加密版正式候选的首次启动解锁流程（仅合成测试）

- **本轮下一步目标**：不再让实际V2业务界面直接启动明文本机库。新增`v2/fresh-encrypted-boot-lab.js`只在localhost + `__WORKBENCH_ENCRYPTED_BOOT_LAB__=true`创建随机AES-GCM增量加密库，页面在成功设置16字符以上恢复密码前不显示任何医院/项目UI。之后只持久化随机库名，**不存储恢复密码或数据解密密钥**。重载后显示锁定页面，输错恢复密码时不开启`business-ui.js`，输对才动态加载完整真实V2界面。
- **完整手机交互链**：在模拟手机A依次新建加密库、医院、核磁维保项目、1MiB+31B原件、未完成语音草稿；在“更多”点击真正的`data-export-encrypted-candidate`浏览器文件下载（经过AES-GCM认证且包括草稿、离线历史、原件密文），JSON不包含医院名/原件名/草稿明文；刷新后立即锁定，密码正确后所有内容恢复。模拟手机B从全新空白启动，选刚才下载的JSON并输入密码，先验证全部密文，再新建独立库，解密回读业务、历史队列、原件SHA256与草稿；密码错误或修改一字节密文不会建立业务身份。手机C有自建医院后无法从启动入口再覆盖。
- **测试证据**：[V2 encrypted first-use mobile UI #43725597855](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597855) SUCCESS，Chromium **18/18**、WebKit **18/18**，合计**36项通过、0失败**。此阶段代码提交 `37e17df7e3e5577451bb8ada9591286f699d3d30`；独立检查报告 `v2/ENCRYPTED-FRESH-BOOT-REVIEW-2026-11-15.md`。它使用真正V2手机业务UI及新的加密delta草稿store，但实验脚本本身不在公有Worker资源表内。
- **全面未破坏验证**：原手机端回归 [#43725597752](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597752) SUCCESS、之前加密备份/文件导入 [#43725597760](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597760) SUCCESS、已有加密本地业务/草稿/Cloud模拟回归 [#43725597781](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597781) SUCCESS、Cloudflare build-only预检 [#43725597730](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597730) SUCCESS、正式版无旧版迁移门禁 [#43725597896](https://github.com/wangxueqing0427-oss/personal-workbench/actions/runs/43725597896) SUCCESS。
- **不可混淆的上线边界**：实验启动页及加密runtime**仅合成本机测试**；原公有合成preview继续运行之前版本，没有部署本轮变更，现有公共端`business-store.js`仍是明文IndexedDB，不可录真实业务。即使实验加密已能通过WebKit，**它仍未具有正式长效账户鉴权/服务器强制设备授权/云端与离线身份恢复、真实iPhone Safari+主屏幕PWA、Face ID密钥解封和正式发布审批**。随机UUID对象ID、集合种类等元数据在本机仍可观察，不能称为完全硬件级数据保护。
- **旧版数据决定和分工**：用户明确不迁移V1.5.7，正式版从空白开始；用户只负责最终真机上手，自动开发、GitHub测试、兼容回归、合成加密及失败恢复均由助手处理。生产`main`保持`c3d9ebec26b94ef056eaad649447b3ad2dba31bc`，V1、原staging和真实数据/附件不变；无新付费服务。下一阶段需要将合成原型转为**可审计的独立正式候选构建与真实云端设备身份方案**，不可在这些缺口完成前把测试版变成正式版。
