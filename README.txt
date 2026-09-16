个人工作台 V0.5.1 AI连接修正版

修复：
- iPhone Safari / PWA 可能仍加载旧 app.js，导致“保存 AI 设置”“测试连接”按钮无反应。
- index.html 对 app.js / style.css 增加版本参数。
- Service Worker 缓存升级为 v051，并对页面导航优先请求网络。

部署：覆盖 GitHub Pages 根目录文件。
