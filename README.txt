个人工作台 V0.5.4「行动卡精修版」

发布内容：index.html、app.js、style.css、manifest.json、sw.js。

本版重点：
1. AI行动卡清理顶部残留编号和多余Markdown符号。
2. 默认只显示“要做什么 / 为什么现在做 / 建议话术”，详细分析折叠。
3. 三个动作按钮按主次分层，并在操作后显示成功反馈。
4. 未来雷达和本周跟进均先确认日期；本周跟进默认给出未来7天内日期且可修改。
5. 保留同一 localStorage 数据容器、AI Worker设置、备份和认证兼容入口。
6. Service Worker升级为 personal-workbench-v054-action-cards。

部署：将 ZIP 内文件覆盖 GitHub Pages 根目录。Worker 地址仍填写原来的地址，不需要改 302.AI 或 GPT-5.5 配置。
验证：打开 ?v=054，进入 AI助理，输入“主任说下个月增加光纤采购量，我现在下一步应该做什么？”，测试三种按钮并在执行/未来雷达中核对落库结果。
