# V2.0 独立 Cloudflare 测试部署

日期：2026-10-10。仅合成数据，不是生产发布。

## 免费和隔离

- 用户在官方后台确认 Workers Free / $0 / Current plan。官方规则允许 Free 使用 SQLite Durable Objects，超额操作报错；没有升级套餐、绑定付费服务或执行付款操作。未读取账单，不能代替实际账单审计。
- Worker：personal-workbench-v2-staging。部署前该名称返回404，不覆盖已有服务。
- SQLite namespace：personal-workbench-v2-staging_TestSync，API确认 use_sqlite=true。
- 绑定只有 ASSETS、TEST_SYNC、synthetic-only 标记、独立 TEST_TOKEN。没有生产数据库、KV、R2、生产密钥或自定义生产路由。
- 测试业务及附件合成生成；云端保存AES-GCM密文。加密密钥只在测试客户端和本地忽略目录，不写入Worker或Git。
- .tools、.dev.vars、.wrangler、staging-public均排除Git；未推送、未合并main。

## 访问

https://personal-workbench-v2-staging.wangxueqing0427.workers.dev/business.html

本地独立身份位于 v2/.tools/synthetic-test-identity.json，含token和key。不要提交、截图公开或上传到生产。两端在“查看同步队列 / 核对冲突”输入同一测试token/key，地址使用同源 /sync。初次不同端的合成种子也可能触发冲突，需核对后明确选择保留双方。

## 回归与限制

最终实际云端回归：15项通过、0项失败。认证、跨源拒绝、私有文件不可访问、合成数据读写、512KiB分片上传及逐字节完整性、在线刷新、断网刷新后队列保留、恢复网络同步、第二设备冲突拒绝覆盖、冲突确认界面、显式合并及第一设备记录保留均已通过。另重跑Node SQLite模拟20项和本地HTTP18项，全部通过。本轮上述三个最终测试集共53项通过、0项失败，不代表此前全部测试重跑。

中间云端离线测试发现.html跳转问题，修复后通过；冲突按钮测试曾在异步界面绘制前断言，增加等待可见后通过。最终Worker部署版本a7a0f4ac-5002-4ee0-973a-25bb75cdc9b4（独立secret通过官方secret接口配置，不进入源码）。

- cloud-test-results.json记录实际HTTPS测试结果；workerd-test-results.json为本地运行时测试，不混为iPhone验收。
- 云端部署期间发现静态资产默认去除.html导致离线缓存地址不匹配；已设置html_handling=none，仅作用于测试站点。
- 桌面Edge模拟390×844不是iPhone Safari实机。iPhone须由用户验收。
- 当前只在前台/重新打开后重试，不保证iOS关闭APP时后台同步。首次在线缓存完成后才能离线打开。
- 同步包编码明文上限12MiB，分片64KiB；测试SQLite累计50MiB限额和每分钟180次请求。超限保留本地原件及失败队列，不自动扩容。

## iPhone验收

1. Safari打开以上地址，仅使用合成项目；不要清理生产站点或删除原生产图标。
2. 使用独立身份接入同步，添加独立“工作台测试”主屏幕图标。
3. 记录合成事项、拍摄非业务测试图片并查看原件。
4. 断网新增记录，退出重开确认资料与等待同步队列存在；联网重开确认同步。
5. 手机电脑修改同一合成项目，确认冲突提示，逐项核对后合并，检查双方时间线和附件保留。
6. 完整加密备份在隔离工具验证恢复；不得恢复到真实数据库。
