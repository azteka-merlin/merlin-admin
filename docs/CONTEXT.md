# Context - Merlin Admin

Merlin Admin is the operational panel for the Merlin ecosystem. It centralizes licenses, audit logs, user activity, overrides, premium games, polls, public signup, and update publishing.

## Stack

- React 19
- Vite 7
- Local CSS in `src/styles.css`
- Local navigation/helpers instead of an external router

## Main Structure

- `src/App.jsx`: main state, `/panel-api/*` calls, and page composition.
- `src/pages/`: panel screens such as licenses, activity, audit, overrides, and settings.
- `src/components/`: shell, login, loading, modals, and license detail UI.
- `src/lib/navigation.js`: navigation items and rules.
- `src/lib/admin-ui.js`: UI helpers.
- `public/`: static assets used by the build.

## API Integration

The admin does not use an absolute API URL. It calls relative routes such as:

- `/panel-api/auth/login`
- `/panel-api/auth/session`
- `/panel-api/licenses`
- `/panel-api/overrides`
- `/panel-api/premium/games`
- `/panel-api/premium/games/:appId/early-access`
- `/panel-api/polls`
- `/panel-api/updates`

In production, these routes are served by the same `Merlin-api` Worker on `api-merlin.com`.

## Integrated Deploy

The API Worker serves admin assets from `../merlin-admin/dist`.

That means every panel UI or behavior change needs:

1. `npm run build` in the admin project.
2. `npm run deploy` in the API project.

The API script `npm run deploy:panel` automates the production panel build, type generation, and Worker deploy. Use `npm run deploy-stage:panel` in the API repo for staging.

## Admin Workflows

- Licenses: create, list, renew, revoke, reactivate, and reset HWID.
- Audit: inspect admin events.
- Activity: inspect user activity.
- Blocking: inspect and unblock IPs.
- Overrides: upload, list, download, and remove manifests/fixes by App ID.
- Premium: manage premium games, uploads, and individual early-access grants. The card keeps only a count; selecting licenses happens in the game modal so the main grid remains compact.
- Polls: create, open, close, vote, and delete polls.
- Public signup: configure public registration and recovery.
- Updates: upload the Merlin installer and latest-version metadata.

## Development Notes

- Auth depends on HttpOnly cookies and CSRF handled by the API; do not move auth into browser storage.
- Mutating panel calls should keep using the existing request helpers so CSRF and session handling stay consistent.
- When adding a new panel route, ensure the API protects it with admin session checks and the Worker SPA routing covers it.
- Individual early access is an exception to release timing only. Do not imply in the UI that it changes a license tier, activation quota, cooldown, or billing state.
