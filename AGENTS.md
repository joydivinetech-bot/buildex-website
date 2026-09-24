# Buildex standalone development

Use this folder for future Buildex changes. The parent project is the retained Sites edition; do not update or deploy it unless requested.

- Public UI: HTML, CSS, and plain browser JavaScript in public/.
- Local backend: Node.js/SQLite in server/. Cloudflare backend: Pages Worker, D1 and R2 in cloudflare/. Production admin uses verified Cloudflare Access JWTs; no passwords in frontend code.
- Preserve the mobile layout and seven public pages, including About Us.
- The user explicitly requested the 40+ years of experience claim; retain it without inventing founding dates or project counts.
- Do not present stock images as completed Buildex projects.
- Only authenticated administrators may upload/manage project photos.
- Customer forms must persist inquiries and must not accept photo uploads.
- Keep data/, backups/, and .env out of source archives and Git.
- Use npm test for server changes. There is no frontend build step.
- A static preview is design-only; do not claim it has working submissions or administrator access.
