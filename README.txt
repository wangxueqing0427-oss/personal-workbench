个人工作台 V0.5.3 AI行动闭环版

本次升级：
- AI回答不再直接显示 **、### 等原始 Markdown 符号，改为手机友好的格式。
- AI回答顶部默认提取“最重要的3件事”，详细分析折叠显示。
- 每条AI建议新增三个执行按钮：加入今日任务 / 设为本周跟进 / 加入未来雷达。
- 点击按钮后会真实写入现有本地数据，并立刻出现在首页、工作中心或未来雷达。
- 继续兼容现有随口记、财务、生活、健康、备考、Passkey、备份和AI设置。
- Service Worker 缓存升级到 v053，避免手机继续加载旧脚本。

AI后端：
- 现有 Cloudflare + 302.AI 配置可继续使用，无需重新填写API Key。
- cloudflare-worker/worker.js 已同步为 302.AI + gpt-5.5，供以后重建后端时使用；当前线上Worker无需重复修改。

部署：
1. 覆盖 GitHub Pages 根目录的 index.html、app.js、style.css、manifest.json、sw.js、README.txt。
2. 等 GitHub Pages 部署完成。
3. 手机打开：https://wangxueqing0427-oss.github.io/personal-workbench/?v=053
4. 进入 AI个人助理测试。
