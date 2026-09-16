个人工作台 V0.5.0 AI个人助理版
================================

这是基于 V0.4.4“健康与 ChatGPT 免费桥接版”的增量升级。

【现在就能用（不需要 API）】
- 首页新增“AI个人助理”。
- 可以直接问：今天先做什么 / 本月重点 / 逾期到期 / 商机下一步。
- 未连接 API 时，用本机日期、未来雷达和规则先给可执行排序建议。
- 工作/商机记录入库后，会先生成本地“下一步建议”。

【接入 OpenAI API 后】
- 工作台先在手机本地筛选最相关的工作和商机，再把小段摘要发给安全后端。
- AI 可以回答“我这个月最需要重点跟进什么”等问题。
- 智能随口记确认入库后，可自动调用 AI 生成更具体的下一步建议。
- 默认使用 GPT-5.6 Luna，降低成本。

【隐私】
- OpenAI API Key 不保存在 GitHub Pages / app.js。
- Key 只放 Cloudflare Worker Secret。
- 财务、健康默认不发送给 AI；必须在“设置 → AI个人助理”里主动开启。
- 本机上传的 PDF/Word/图片不会自动发给 AI。

【文件】
根目录 6 个文件继续覆盖 GitHub Pages：
- index.html
- app.js
- style.css
- manifest.json
- sw.js
- README.txt

cloudflare-worker 文件夹是 AI 安全后端，不是 GitHub Pages 前端文件。

【版本兼容】
继续使用原来的 pw_v04_data，本机已有 V0.4.x 数据不需要迁移。
