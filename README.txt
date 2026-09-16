个人工作台 V0.5.5「AI任务提炼版」

部署文件：index.html、app.js、style.css、manifest.json、sw.js、worker.js。
本版保留 personalWorkbench 本地存储结构，兼容 notes、finance、life、health、study、tasks、followups、radar、ai、passkey 和备份数据。

使用：将前端文件覆盖 GitHub Pages 根目录，打开 ?v=055。AI 设置仍填写原 Cloudflare Worker 地址；Worker 继续使用 302.AI 的 gpt-5.5。
测试建议：输入“主任说下个月增加光纤采购量，10月底联系设备科，提前准备报价”，应得到确认采购量、联系设备科、准备报价等独立任务。
