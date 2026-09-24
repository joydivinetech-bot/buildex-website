# Buildex Construction — standalone website

This folder is the independent source for future Buildex work. Edit this version from now on. The original Site in the parent folder is retained separately.

## What is included

- Five public HTML pages, responsive CSS and plain JavaScript.
- A plain HTML/JavaScript administrator area at `/admin`.
- A Node.js server for account sessions, contact settings, inquiries and project management.
- SQLite for durable records; uploaded images stored on disk.
- Administrator-only photo uploads, before/after labels, cover ordering, editing and deletion.
- Password hashing, expiring HttpOnly sessions, origin checks and basic request limits.
- No React, Next.js, Vinext, Cloudflare bindings or ChatGPT authentication.
- No external npm dependencies and no frontend build step.

## Start locally

Use **Node.js 24.14 or newer**. Node's bundled SQLite API currently prints an experimental warning; this project uses that built-in API instead of an external database package.

From this folder:

```powershell
npm start
```

Open **http://127.0.0.1:4174/**. Use this exact host; browser form submissions are checked against `APP_ORIGIN`.

To create an administrator, open another terminal in this folder:

```powershell
npm run admin:create
```

Enter your email and a password of at least 14 characters. The password is hidden while typing. Run the same command with an existing email to reset that account's password and revoke its sessions. There is no default administrator or shared password.

Then open **http://127.0.0.1:4174/admin**.

You do **not** need `npm install`. All server dependencies ship with Node.

## Files to edit

```text
public/
  index.html          Home
  services.html       Services
  flooring.html       Flooring
  estimate.html       Estimate form
  contact.html        Contact information and form
  styles.css          Shared desktop and mobile styles
  site.js             Public form, gallery and menu interactions
  admin.html          Administrator interface
  admin.css           Administrator layout
  admin.js            Login and CMS interactions
server/
  index.mjs           Server startup and configuration
  app.mjs             HTTP routes and validation
  store.mjs           SQLite schema and password helpers
scripts/
  admin-user.mjs       Create/reset an administrator
  backup.mjs          Database and photo backup
  export-preview.mjs  Produce a design-only static preview
```

The public forms save requests to the administrator inbox. Automatic email notifications are **not configured**. Check the inbox to see new requests. Contact settings are stored in the database and update the public Contact page.

## Configuration

Copy `.env.example` to `.env` if you need different settings. The default values work for local use.

| Variable | Local default | Production use |
| --- | --- | --- |
| `APP_ORIGIN` | `http://127.0.0.1:4174` | Exact public HTTPS origin, without a trailing path |
| `HOST` | `127.0.0.1` | `0.0.0.0` in a container or server behind a reverse proxy |
| `PORT` | `4174` | The port assigned to the app |
| `NODE_ENV` | `development` | `production` enables Secure session cookies and requires an HTTPS origin |
| `DATA_DIR` | `./data` | A persistent writable directory; relative paths resolve from this project |

`data/` is created automatically. It contains `buildex.sqlite`, its SQLite journal files, and `uploads/`. Keep it out of Git and protect backups because it contains customer information and account/session records.

## Deploy the complete website

Use hosting that runs a persistent Node.js process with a persistent disk, or the included Dockerfile. A static-file-only host cannot run this backend. Use one application instance with this SQLite database; do not place the data directory on an ephemeral/serverless filesystem.

1. Upload this folder to the server, excluding local `.env`, `data/`, and tests if desired.
2. Install Node 24.14+ or use Docker.
3. Set `APP_ORIGIN` to the client's HTTPS domain, `NODE_ENV=production`, and an appropriate `HOST`/`PORT`.
4. Attach persistent storage at `DATA_DIR`.
5. Run `npm run admin:create` on the server.
6. Start `npm start` behind an HTTPS reverse proxy or your host's managed HTTPS service.
7. Replace the sample contact details and add real project photos in `/admin`.
8. Test a real estimate and check it in the administrator inbox before sharing the production domain.

The server deliberately does not trust forwarded client-IP headers. Behind a reverse proxy, its basic request limits may be shared across visitors that reach it through the same proxy. Adjust trusted-proxy handling for your chosen host before a high-traffic launch.

Docker example (replace the example domain):

```sh
docker build -t buildex .
docker volume create buildex-data
docker run -d --name buildex -p 4174:4174 \
  -e APP_ORIGIN=https://www.your-client-domain.com \
  -v buildex-data:/app/data buildex
docker exec -it buildex npm run admin:create
```

Terminate HTTPS at your hosting platform or reverse proxy. The Dockerfile is provided for deployment; it has not been built in this local environment.

## Back up customer data and images

Stop the web server before running:

```sh
npm run backup
```

This creates a database snapshot and copies uploaded images into `backups/<timestamp>/`. Keep a protected off-server copy. Stop the server before restoring a backup, then restore the snapshot as `data/buildex.sqlite` and the `uploads` directory. Move the previous data directory aside first so old WAL/journal files are not mixed with a restored snapshot.

## Temporary client preview

```sh
npm run preview:export
```

Upload the resulting `preview/` folder to a static host. This copy has an explicit preview notice, disabled submission buttons and no administrator link. It is for design review only. It does not include a database, administrator access, or live inquiries. The original full app is unchanged by this export.

## Checks

```sh
npm test
```

Integration checks use a separate temporary database. They cover public routes, authentication, invalid input, origin checks, sessions, uploads, project editing/deletion, contact settings, and persistence across a server restart.

## Content and photography

The unsupported “40+ years” claim has been removed. Sample phone/email/hours remain clearly labeled. The completed-project gallery starts empty until you upload the client's work.

Current stock photos are illustrative, not Buildex projects:

- Pew Nguyen — https://www.pexels.com/photo/patio-of-luxurious-house-13600836/
- Ali Soheil — https://www.pexels.com/photo/modern-bright-kitchen-interior-with-appliances-38071645/
- Allyson Salness — https://www.pexels.com/photo/a-modern-living-room-with-wooden-floor-and-stairs-8288962/
- License — https://www.pexels.com/license/

These images require internet access. Replace them with licensed local photos in `public/` and expand the static asset allowlist in `server/app.mjs` as needed.

## Photo CMS and Cloudflare

The admin now supports private drafts, photo/project ordering and preview before publishing. Cloudflare deployment is documented in [cloudflare/DEPLOYMENT.md](cloudflare/DEPLOYMENT.md). Build with `npm run build:cloudflare`. Production account bindings and Access/MFA must be configured before deployment.

## Automatic public-site deployment

This repository contains the standalone website at its root.
Connect it to Cloudflare Pages using Git integration:
- Production branch: main
- Root directory: leave blank (repository root)
- Framework: None
- Build command: npm run build:public
- Output directory: public-launch
- Node version: 24.14.0 (also set in .node-version)

The public launch uses phone/text inquiries until the backend is configured. The CMS source is included but is not deployed by this build.
After the one-time Cloudflare connection, commit and push changes from this repository to publish updates. The parent folder is a separate legacy repository.
