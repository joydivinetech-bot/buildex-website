# Buildex Studio

The production dashboard is served by cloudflare/forms-worker.mjs at /admin. It keeps the existing email-code sign-in and administrator allowlist. The legacy Node and Cloudflare Access backends are retained, but are not the production Studio backend.

## Everyday workflow

1. Open Projects to see all saved project posts. Browse photos directly on each card, click a photo for the large album viewer, or choose Edit project. Add new starts a separate project post.
2. Use Add photos to select several photos together, or add more in later batches to the same album. Each project supports up to 20 JPG, PNG or WebP photos, with originals up to 8 MB each.
3. The photo editor opens automatically for each selected file. Crop, rotate left/right, flip or resize, then choose Add photo & next. Skip photo omits that file; closing the editor cancels the remaining selection and keeps the photos already accepted. No files upload during this step.
4. Drag thumbnails to reorder; the first photo becomes the cover. Move earlier / Move later and Make cover are also available. Fill in one project title and caption, category and location below the album. There are no individual photo captions.
5. Watch the live project-page preview alongside the editor. Preview website opens all seven pages at desktop, tablet or mobile widths.
6. Save draft to store the work privately. Publish project / Publish changes updates the public gallery only after confirmation.

Photo library searches saved photography and opens the owning project for editing. Inquiries supports searching, status changes, inquiry details, call/email links and CSV export.

The Studio collection, public gallery and live preview show one card per project. Album cards have previous/next buttons, position indicators and swipe support. Opening a project displays its large photo viewer with buttons at the left and right image edges, thumbnails, keyboard arrows and one shared project caption. All three surfaces use album-ui.js and album-ui.css.

Homepage and public Projects use taller full-width rows through project-cards.js: photo on the left, details on the right, and details below the photo on mobile. Each photo has one dot; the active dot fills over three seconds, then advances to the next photo and loops after the last. Hovering or using the arrows does not stop the loop; arrows and dot selection reset the three-second progress. Playback pauses while offscreen, while a dialog is open or while the page is hidden. There is no visible playback icon; an accessible text control appears only on keyboard focus. Reduced-motion users start with autoplay paused. The popup remains under manual control. The homepage hero slideshow starts at DOM readiness and waits for a loaded photo before switching, independently of other page resources. Private homepage previews receive the draft project collection too.

## Draft and photo behavior

- Project details and pending photo files are recovered from IndexedDB after a refresh. Storage is scoped to the signed-in administrator. Browser storage failure is shown in the edit status; Save draft remains the durable option.
- New photos and crops stay on the device until Save draft or Publish. Previews send object URLs and metadata to the private iframe, not uploads.
- New uploads default to a 2,560 px longest side at 92% WebP quality, without upscaling. Smaller dimensions and Balanced/Compact quality remain available. Previously saved photos retain their existing resolution; upload source originals again to gain detail.
- The size readout is the actual WebP export size. If the selected output exceeds the storage limit, dimensions are reduced while preserving the selected encoding quality.
- The current D1 fallback accepts 1 MB per prepared photo; the existing R2 path accepts 8 MB. No new paid service or external image-processing service is introduced.
- Source originals are held for editing on the current device. Only prepared images are uploaded. After saving, reopening a photo edits the saved optimized image.
- Successfully uploaded photos keep their keys if a later upload fails, so retrying does not upload them again.
- Saving a draft of a published project uses project_drafts. The public projects row remains unchanged.
- Discard saved changes restores the published content. Unpublish explicitly removes the project from the public gallery.
- Replaced media is pruned when saving or discarding once it is no longer used by either the working or published version.
- Public media access checks the actual published photo list, not merely the parent project's status.
- Published image bytes use Cloudflare's [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), with a publication check before every cache hit. Browser ETags avoid downloading unchanged photos again. Unpublishing still blocks both cached responses and conditional requests; private admin photos remain no-store. Schema initialization is reused per database binding rather than repeated for every photo request.
- The first project cover loads eagerly at high priority. Nearby albums prefetch their next/previous photos; offscreen albums do not preload their whole collection. The popup keeps the current image visible until the next photo is downloaded and decoded, while thumbnails use lower network priority. Only a small set of decoded neighbours is retained.
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
