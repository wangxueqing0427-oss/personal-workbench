个人工作台 V0.3 — 手机可安装版
================================

新增能力：
- PWA manifest
- Service Worker 离线缓存（仅 HTTPS 下生效）
- Face ID / Passkey WebAuthn 框架（仅 HTTPS 正式域名下使用）
- IndexedDB 本机资料库，可保存上传文件本体
- 拍照后保存到资料库
- JSON 数据导出 / 导入备份
- 立即锁定
- 设置页与资料库页

重要安全说明：
1. 本地直接双击 index.html 时，Passkey 和 Service Worker 不会完整工作。
2. 必须部署到 HTTPS 地址后，再在 iPhone Safari 中打开并添加到主屏幕。
3. Passkey 使用系统生物识别/设备验证；在支持 Face ID 的 iPhone 上通常会调用 Face ID。
4. 当前业务数据和上传文件都主要保存在当前设备浏览器里。清除网站数据可能会删除它们，所以请定期导出备份。
5. V0.3 仍是个人单机版，不做云同步。云同步和 AI 自动分类后续再加。

推荐下一步：
- 将此文件夹部署到 GitHub Pages / Cloudflare Pages / Netlify 等 HTTPS 静态托管。
- 在 iPhone Safari 打开部署网址。
- 注册 Passkey。
- Safari 分享菜单 -> 添加到主屏幕。
