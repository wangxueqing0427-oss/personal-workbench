# 第四阶段本地准备（未部署）

基线6be6a17，独立分支dev/v2-phase2-business。main和V1.5.7不变。

## 已完成与边界

- 同步队列界面展示本地版本、重试次数、失败原因，可手工重试。
- 已保存冲突可解密校验，按项目字段显示两端差异；人工选择只保存核对草稿，不应用到项目、不消除冲突。
- 401明确提示身份失效并保留队列及原件。
- 尚未完成：经过确认的安全合并写回、重新认证界面、分片/断点传输、Cloudflare实现及iPhone实机验收。
- 当前12MB同步包限制仍保留；大文件不会丢失，但不能同步。不是第四阶段全部完成。

## 独立Cloudflare方案及待批准操作

本轮测试：P0桌面/手机模拟各28、P1各35、真实本地HTTP18、持久离线与冲突界面20，共164项核心校验。冲突界面点击与草稿不覆盖测试已加入离线套件。一次界面断言因异步保存未等待而失败，改为等待实际保存完成后重跑。无iPhone实机测试。

计划独立Worker personal-workbench-v2-staging，独立SQLite Durable Object命名空间，仅合成测试记录；不绑定生产KV、D1、R2或Worker。
使用独立workers.dev HTTPS域名，同源静态测试页面；只发布明确允许的前端文件，不发布整个项目目录、测试结果或业务文件。
客户端AES-GCM加密，独立测试密钥，服务器只保存密文；服务端版本+哈希CAS控制并发。附件分片及幂等校验需先补完本地实现再部署。
测试鉴权采用单独随机测试凭证，通过官方授权窗口配置Worker secret；不使用生产密码/Token。不应将长期管理Token放入APP。
需要账号对Workers脚本、静态资源、Durable Objects及测试Secret的管理权限；优先官方登录，由用户输入密码。不要求GitHub写权限，可从已审计本地构建部署。
预计免费额度内费用0元，必须先核实账户套餐；不启用付费计划、R2或AI。若免费额度/CPU不满足，暂停而非自动升级。
官方依据：https://developers.cloudflare.com/workers/platform/pricing/ 和 https://developers.cloudflare.com/durable-objects/platform/pricing/ 。免费DO仅SQLite；实际额度上线前再核对。
需要一次批准：官方账号登录、创建上述独立测试资源与Secret、部署仅合成数据测试页面。远程Git推送另行列出内容并批准，不合并main。

## iPhone验收准备

现在只有电脑localhost地址，iPhone上的127.0.0.1不是电脑，不能用作手机验收入口。批准测试部署后提供唯一HTTPS测试地址。
使用独立测试域名和明确“测试版”名称，不删除生产主屏幕图标或清除Safari数据。
测试：Safari打开→添加独立测试图标→合成拍照/文件上传→断网记录→关闭重开→联网同步→双端编辑同项目→核对双方→备份隔离恢复。
当前Edge390px模拟并非Safari、iPhone或设备重启验收。
