Personal Workbench V0.5.6 - AI Smart Task Splitting

This version splits records into independent action tasks, with action-first titles, semantic due dates, priority, and recognized hospital, department, contact, and project fields.
Deploy index.html, app.js, style.css, manifest.json, sw.js, and worker.js to GitHub Pages. Keep the existing Cloudflare Worker address. The Worker continues to call 302.AI with gpt-5.5 and never exposes the API key in the frontend.
Test with: "主任说下个月增加光纤采购量，10月底联系设备科，提前准备报价". Expected tasks include confirming model and quantity, confirming procurement path, preparing quotation and inventory, and setting a follow-up before procurement.
