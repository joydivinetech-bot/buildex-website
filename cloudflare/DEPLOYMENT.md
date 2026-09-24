# Cloudflare deployment and administration

## What is implemented

- Static public HTML/CSS/JS served by Pages. No frontend framework or build runtime in visitors' browsers.
- A separate administrator hostname, protected with Cloudflare Access. The Worker also verifies the Access JWT signature, issuer, expiry, audience, and administrator email allowlist.
- D1 for projects, photo metadata, inquiries, settings and request limits. R2 for private photo objects.
- Photo resizing (maximum 1600px on the long edge) and WebP compression in the admin browser before upload. Backend enforces file signature and size checks independently.
- Private drafts, ordered photos (first is cover), private editor preview, publication, unpublication, project order, and deletion. Drag and drop has move-button alternatives for keyboard and touch use.
- The public project page reads only published projects. Never enable a public R2 bucket endpoint: photos are served through the API after a publication check.

Saving an existing published project as a draft immediately unpublishes it; this is not a separate staged revision of the live project. Delete is permanent. Preview uses unsaved editor content without publishing it.

## Account setup required before deployment

1. Use your Cloudflare account to create a Pages project, a D1 database, and a private R2 bucket. Keep R2 public access disabled.
2. Add your public website domain and administrator subdomain to the same Pages project. The dashboard will be at `https://admin.YOURDOMAIN/admin`. It is unavailable on the public origin, even if someone guesses its URL. No CORS access to admin APIs is enabled.
3. Create a Cloudflare Access self-hosted application protecting the **entire administrator hostname**. Allow only your approved admin email addresses, use an identity provider that requires MFA, and set an appropriate session lifetime (for example 8 hours). Email one-time codes alone are not a substitute for MFA. Record the application audience (AUD) and team issuer URL.
4. Copy `wrangler.example.toml` to `wrangler.toml`. Replace every placeholder, public/admin origins, D1 ID and R2 bucket name. `ADMIN_EMAILS` is a comma-separated allowlist that must also match your Access policy. Do not place these settings, tokens, or passwords in public JS. Do not send your password to the assistant.
5. Apply `cloudflare/schema.sql` to D1. With Wrangler installed and authenticated: `npx wrangler d1 execute buildex-cms --remote --file=cloudflare/schema.sql`.
6. Run `npm test` and `npm run build:cloudflare`.
7. Deploy with `npx wrangler pages deploy cloudflare-dist --project-name YOUR_PAGES_PROJECT`. Pages Functions/advanced Worker deployment requires Wrangler or a configured Git build, not the dashboard's drag-and-drop static upload.
8. Configure production bindings and variables to match your configuration. For Git deployment the build command is `npm run build:cloudflare`, output `cloudflare-dist` with this folder as the project root.
9. Open the admin subdomain and complete Access login/MFA yourself. Go to `/admin`, upload photos, save a draft, verify it is absent from the public gallery, preview, then publish. Verify anonymous direct access to a draft photo returns 404.

Use a separate test database/bucket for preview deployments. Do not attach production resources to untrusted preview builds. The alternate `pages.dev` origin is denied admin API access by the configured origin check. Public data is public on preview URLs as well unless you protect/disable those URLs in Cloudflare.

## Credentials and Inspect

Production uses your identity provider/Cloudflare Access. No administrator passwords are stored in D1 or frontend code. Anyone can inspect public HTML, CSS, JS, and published photos. Authorization is checked server-side; hiding code is not a security control. The local Node preview retains its separate scrypt password login and does not have production MFA.

## Performance and caching

Static pages use the Pages CDN and only `/api/*` and `/admin*` invoke the Worker. Photos are compressed at upload, loaded lazily, and displayed in fixed aspect-ratio containers. Full-size media is loaded in the viewer on demand. New photos are limited to 8 MB before preprocessing and 1600px afterward in the supplied admin UI.

Media responses deliberately use `private, no-store` so unpublishing is respected on subsequent requests. Already downloaded public images cannot be recalled. Image CDN caching with versioned public derivatives can be added later if measured traffic warrants it; do not cache private drafts. Page-speed targets must be measured on the deployed domain, including a throttled mobile network; zero latency is not guaranteed.

## Operational tasks

Enable Cloudflare/D1 recovery features, back up R2 objects and D1 metadata, and test restoration before client handover. R2 and D1 are separate services; failed object cleanup can leave unreferenced private objects. Periodically audit unused uploads. Do not delete objects referenced by projects.

The initial cloud database is empty. Existing local Node/SQLite content is not automatically migrated. The Node development CMS and Cloudflare production CMS are separate stores.

## Validation performed locally

Tests exercise the Node backend and the Cloudflare handler using SQLite-backed D1 and in-memory R2 test adapters: valid/forged/expired/wrong-audience Access tokens; denied origins; photo upload; private drafts; publish/unpublish; ordering; delete. These tests do not replace a real Cloudflare deployment, Access policy/MFA check, or deployed performance test.

References:
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/pages/functions/get-started/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
