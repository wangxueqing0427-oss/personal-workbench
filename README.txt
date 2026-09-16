个人工作台 V0.5.2 AI响应超时修正版

修复：
- 302.AI / GPT 响应时间可能超过30秒，前端原先会主动中止请求并显示 Fetch is aborted。
- AI 请求等待上限从30秒调整为120秒。
- 超时后显示更明确的中文提示。
- Service Worker 缓存升级为 v052，避免手机继续加载旧 app.js。
- AI加载提示改为“首次回答可能需要30–90秒”。

说明：Cloudflare Worker 和 302.AI 配置无需重新修改。
部署：覆盖 GitHub Pages 根目录文件。
