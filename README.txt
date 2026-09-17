Personal Workbench V0.6.2 - AI Business Q&A

AI assistant now supports read-only business questions over the structured local context: hospitals and contacts, opportunities, unfinished tasks, and future radar. Query examples include a hospital's current matters, contacts needing follow-up this month, and opportunities to advance within 30 days. If the Worker is unavailable, local records are summarized without mutation.

Deploy index.html, app.js, style.css, manifest.json, sw.js, and worker.js to GitHub Pages. Keep the configured Cloudflare Worker URL. The Worker continues to use 302.AI and GPT-5.5; the API key stays in Worker secrets. Existing local records and backup fields are preserved.
