# Buildex Studio

The production dashboard is served by cloudflare/forms-worker.mjs at /admin. It keeps the existing email-code sign-in and administrator allowlist. The legacy Node and Cloudflare Access backends are retained, but are not the production Studio backend.

## Everyday workflow

1. Open Projects and choose Add project or Edit project.
2. Add a title, category, location and description.
3. Drop up to 20 JPG, PNG or WebP photos. Originals may be up to 8 MB each.
4. Crop, rotate, position and resize photos. Drag to reorder, use the arrow buttons, or choose Make cover. Add a description for each photo.
5. Watch the live project-page preview alongside the editor. Preview website opens all seven pages at desktop, tablet or mobile widths.
6. Save draft to store the work privately. Publish project / Publish changes updates the public gallery only after confirmation.

Photo library searches saved photography and opens the owning project for editing. Inquiries supports searching, status changes, inquiry details, call/email links and CSV export.

## Draft and photo behavior

- Project details and pending photo files are recovered from IndexedDB after a refresh. Storage is scoped to the signed-in administrator. Browser storage failure is shown in the edit status; Save draft remains the durable option.
- New photos and crops stay on the device until Save draft or Publish. Previews send object URLs and metadata to the private iframe, not uploads.
- Initial photo optimization uses a maximum 1,200 px longest side. The photo editor offers 800–2,000 px output limits without upscaling.
- The size readout is the actual WebP export size. Quality may be reduced to fit the storage limit.
- The current D1 fallback accepts 1 MB per prepared photo; the existing R2 path accepts 8 MB. No new paid service or external image-processing service is introduced.
- Source originals are held for editing on the current device. Only prepared images are uploaded. After saving, reopening a photo edits the saved optimized image.
- Successfully uploaded photos keep their keys if a later upload fails, so retrying does not upload them again.
- Saving a draft of a published project uses project_drafts. The public projects row remains unchanged.
- Discard saved changes restores the published content. Unpublish explicitly removes the project from the public gallery.
- Replaced media is pruned when saving or discarding once it is no longer used by either the working or published version.
- Public media access checks the actual published photo list, not merely the parent project's status.
- A version check rejects edits based on an older saved version.
- Contact information and hero content remain source-controlled, as requested.

## Deployment and checks

Run npm run build:forms. Wrangler uses cloudflare/forms-worker.mjs and public-launch. The existing authenticated handler creates project_drafts with CREATE TABLE IF NOT EXISTS; there is no destructive data migration or new binding to configure.

Run npm test for the server, publication, privacy, crop geometry and preview-route regression suite.

For browser regression tests, first run npm run build:forms, then node tests/studio-browser.mjs with Playwright available. Optional environment variables:
- PLAYWRIGHT_PACKAGE: full path to Playwright's index.mjs
- CHROME_PATH: full path to a Chrome executable

The browser test uses an in-memory SQLite database, sample data, a local-only server and a fresh headless browser. It does not touch the production account. Screenshots are written to ignored preview/studio/.

The private preview consumes static-asset canonical redirects internally. See https://developers.cloudflare.com/workers/static-assets/binding/ and https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/ for the binding's redirect behavior.
