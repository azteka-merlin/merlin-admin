# Startup And Deployment - Merlin Admin

Quick guide to run, validate, and publish the Merlin admin panel.

## Requirements

- Node.js 18 or newer
- npm
- The API project next to this repo at `../Merlin-api` or `../merlin-api`

## Run Locally

```powershell
cd path\to\Merlin-admin
npm install
npm run dev
```

Vite usually starts at `http://localhost:5173`.

The admin uses relative `/panel-api/*` routes. To test against the local API, run the Worker too:

```powershell
cd path\to\Merlin-api
npm install
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

For the closest production-like test, build the admin and run the API, because the Worker serves assets from `../merlin-admin/dist`.

## Build

```powershell
cd path\to\Merlin-admin
npm install
npm run build
```

Expected output: `dist/`.

## Preview

```powershell
npm run preview
```

Use this only to inspect the static bundle. Real admin calls still depend on `/panel-api/*` routes served by the API.

## Publish

The admin is not deployed by itself in this setup. It is shipped as a static asset bundle inside the API Worker.

Recommended flow:

```powershell
cd path\to\Merlin-admin
npm install
npm run build

cd path\to\Merlin-api
npm install
npm run types
npm run d1:migrate:remote
npm run deploy
```

API shortcut:

```powershell
cd path\to\Merlin-api
npm run deploy:panel
```

This shortcut runs `build:panel`, `types`, and `deploy`. It does not apply D1 migrations; run `npm run d1:migrate:remote` first when new migrations exist.

Staging deploy is also controlled by the API repo:

```powershell
cd path\to\Merlin-api
npm run deploy-stage:panel
```

## Post-Deploy Checks

- `https://api-merlin.com/login` opens the login screen.
- Unauthenticated admin routes redirect to login.
- After login, screens load through `/panel-api/*`.
- Override and update uploads work from the panel.
- `https://api-merlin.com/api/health` still responds.
- For an individual early-access release, verify one granted license and one non-granted license of the same tier: only the granted one may activate before the normal release window, while cooldowns, slots, and activation limits remain unchanged.

## Notes

- Do not commit `dist/`, `node_modules/`, or temporary files.
- The frontend uses relative API paths; avoid hardcoding production URLs unless there is a clear reason.
- When adding new panel routes, check `run_worker_first` in `Merlin-api/wrangler.jsonc`.
