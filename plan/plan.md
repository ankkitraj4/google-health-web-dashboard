# Plan: Fork And Build Fitbit Health Dashboard

Use `voslartomas/google-health-web-dashboard` as the React/Vite dashboard shell, then add a small local backend that owns Google OAuth, Google Health API access, synchronization, and normalized data. The target device is Google Fitbit Air, a screenless wrist tracker that syncs through the Google Health app. Start with steps, sleep, heart rate, exercise, calories/distance, and recovery/vitals where available, while keeping the schema extensible for SpO2, HRV, weight, and additional Fitbit sources.

This plan is organized as milestones instead of steps: each one has a single deliverable and a concrete test you can run to prove it's actually done before moving to the next. Do them in order — later milestones depend on earlier ones being genuinely verified, not just "probably fine."

Two facts from actually reading the fork's source (via the GitHub API) shape the early milestones: its `src/api/*.ts` modules already target the real Google Health API v4, not legacy Fitbit endpoints; and its current `main` branch already puts the OAuth client secret in browser-bundled code and stores tokens in `sessionStorage`. That's why Milestone 0 is a security triage before any feature work, not an afterthought.

## Milestones

### M0 — Security triage on the existing fork
**Goal:** No real secret is sitting in browser-reachable code, and you know whether one already leaked.
- Read `src/auth/google-oauth.ts` and `src/auth/AuthContext.tsx`. Confirm whether a real `VITE_GOOGLE_CLIENT_SECRET` has ever been placed in this project's `.env` locally or in any deployed build.
- If yes: regenerate that client secret in Google Cloud Console now. Don't wait for the backend migration — a leaked secret is fixed the day it's found, not on the v1 architecture timeline.
- **Test:** `grep -r CLIENT_SECRET .env* 2>/dev/null` (or your shell's equivalent) confirms whether a real value is present, and you can state definitively "rotated" or "never populated." This milestone is done when that sentence is true, not when you've merely read the code.

### M1 — Fork runs locally, unmodified
**Goal:** A known-good local baseline before you change anything.
- Fork/clone `https://github.com/voslartomas/google-health-web-dashboard` into `/Users/ankkit/health dashboard`.
- Run `pnpm install`, `pnpm lint`, `pnpm build`, `pnpm dev`.
- **Test:** all four commands exit 0, and the dev server serves a login screen in the browser. Treat this as "the toolchain works," not "the app is correct" — it's a 2-commit template project with no test suite, so a clean build proves less than it would in a mature repo.

### M2 — Google Cloud project validated with a raw API call (no app code involved) ✅ done 2026-09-14
**Goal:** Know exactly what data your Google account/Fitbit Air actually exposes before building anything against assumptions.
- Create a Google Cloud project, enable the Google Health API, configure the OAuth consent screen, a local redirect URI, a test user, and the read-only scopes the fork already lists (sleep, health metrics/measurements, nutrition, activity and fitness, settings, profile).
- Manually complete one OAuth flow (browser + `curl`/Postman is fine — no app UI needed) and make one authenticated `GET`/`POST` against `health.googleapis.com/v4`, e.g. `/users/me/dataTypes/steps/dataPoints:dailyRollUp`.
- **Test:** you have a saved response showing your real `healthUserId`, the data types that actually returned data (not just the ones you requested), units, and timestamp format. Compare this against the data-type names `src/api/activity.ts`, `sleep.ts`, and `heart-rate.ts` assume, and write down any mismatches to fix in M4.

**Findings from the real run**, to carry into M3+:
- The new Google Auth Platform console (Branding/Audience/Data Access/Clients) requires each restricted scope to be explicitly added under **Data Access**, not just requested in the auth URL — an undeclared restricted scope makes Google hard-block the *entire* request with "Access blocked: has not completed the Google verification process," not just drop that one scope.
- Adding a test user under **Audience** has a UI trap: typing the email turns it into a chip but doesn't save until **Save** is clicked *after* the chip is confirmed — a first "Save" click right after typing can silently no-op, leaving "0 users" while looking like it worked. Always re-check the Test users list shows the row after saving.
- With those two fixed, Testing-mode + test-user access worked exactly as documented — no full verification/CASA assessment needed for personal dev use under the 100-user cap.
- `googlehealth.settings.readonly` (needed for `pairedDevices`) was left out of the working scope set — add and test it separately in M4/M5 if device-provenance data is wanted.
- Confirmed against a real Google Fitbit Air: `dataTypes/steps/dataPoints:dailyRollUp` and `dataTypes/sleep/dataPoints` match the fork's `activity.ts`/`sleep.ts` shapes exactly — `steps.countSum` as a numeric string, sleep responses include full `STAGES` breakdown (AWAKE/LIGHT/DEEP/REM) with a `summary` block, and `dataSource.device.displayName: "Google Fitbit Air"` / `platform: "FITBIT"` confirm real device provenance. Timestamps carry explicit UTC offsets (e.g. `"7200s"`) — build M5's timezone handling off the offset field, not an assumed local zone.

### M3 — Backend owns auth; browser never sees a token
**Goal:** A minimal backend that completes Google OAuth server-side and gives the browser only a session cookie — no health data yet.
- Add a backend workspace (TypeScript + a small HTTP framework, SQLite for dev).
- Implement the authorization-code flow with PKCE/state validation, callback handling, encrypted-at-rest refresh-token storage, and a session cookie.
- Point the frontend's login button at this backend instead of `google-oauth.ts`'s direct browser flow; delete `VITE_GOOGLE_CLIENT_SECRET` usage and the `sessionStorage` token writes.
- **Test:** open browser devtools → Application → Storage during and after login. `sessionStorage`/`localStorage` contain no access or refresh token. The Network tab shows zero requests from the browser to `googleapis.com` or `accounts.google.com` for tokens — only to your own backend. `/session` (or equivalent) returns "logged in" state from the cookie alone.

### M4 — One real metric, end to end
**Goal:** Prove the full path — backend calls Google Health, normalizes, stores, serves — works for a single metric before building five more.
- Build the adapter for **steps only**, porting the request shape from `src/api/activity.ts`'s `getStepsDaily`.
- Store normalized rows (user, metric, value, unit, start/end timestamp, source, sync metadata) in SQLite.
- Expose a backend endpoint the frontend calls for steps.
- **Test:** the number the dashboard shows for "today's steps" matches the number you got by hand in M2's raw API call (or a fresh equivalent call), for the same day. This is the milestone where you find out if your data-type name and rollup window assumptions were right — fix them here, not in M5.

### M5 — Remaining core metrics, with dedup proven
**Goal:** Sleep, heart rate/resting heart rate, exercise, calories, distance, and active minutes all flow through the same adapter pattern, and syncing twice doesn't duplicate data.
- Extend the adapter metric-by-metric, reusing `src/api/sleep.ts`, `heart-rate.ts`, `resting-hr.ts`, `cardio.ts`, `exercise.ts` request shapes as a base, correcting any data-type names flagged in M2/M4.
- Implement idempotent upsert / source-aware dedup.
- Add a hot sync (last 7–14 days) as the default; leave backfill for M8.
- **Test:** run the sync command/endpoint twice in a row. Row counts in the database do not increase on the second run (for unchanged data). Each metric either returns real data or an explicit reason (no-scope, no-data, unsupported) — never a silent empty response.

### M6 — Frontend fully cut over to the backend
**Goal:** The dashboard renders real data through the backend only; no direct-to-Google calls remain in the shipped app.
- Replace the remaining direct calls in `src/api/client.ts` and the card components with calls to the new backend endpoints.
- Rebuild the connection screen (status, last Fitbit-app sync, last dashboard sync, disconnect/reconnect) against real backend state.
- **Test:** with devtools Network tab open, use the app for a full session (login, view dashboard, change date range, log out). Zero requests go to `googleapis.com` directly from the browser. `pnpm build` the production bundle and `grep` the output `dist/` JS for `CLIENT_SECRET` or any string matching your OAuth secret — it must not appear.

### M7 — Capability-aware and failure states
**Goal:** Every card has an honest state instead of blank/broken when something isn't available.
- Add explicit handling for: loading, empty (no data yet), stale (past freshness threshold), unauthorized/revoked scope, region/premium-gated, and API error/rate-limited.
- **Test:** force each state and confirm the UI names it correctly rather than rendering blank or crashing: revoke consent in your Google Account settings (unauthorized), disconnect network mid-load (error), wait past the staleness window or fake the timestamp in the DB (stale), and request a metric you know your account doesn't expose, e.g. an advanced-vitals type if unavailable (unsupported/premium-gated).

### M8 — Backfill and webhook sync
**Goal:** Historical data loads without breaking the hot-sync dedup, and Google's push notifications trigger a scoped refetch instead of a blind reprocess.
- Add a queued/backfill job for history beyond the hot-sync window, chunked and retried with backoff on 429/504.
- Add the webhook endpoint (Google Health webhooks are notify-only: a notification says what changed, you fetch it over REST) with signature validation, enqueueing a targeted refresh.
- **Test:** trigger a backfill for a 60+ day range and confirm row counts match a manual spot-check for a few known days, with no duplicates against the M5 hot-sync data. Simulate a webhook call (a local `curl POST` with a valid signature) and confirm it enqueues exactly the metric/date range named in the payload, not a full resync.

### M9 — Privacy, ops hardening, and final real-world validation
**Goal:** Nothing sensitive is in git or logs, disconnect actually removes data, and the whole flow works against your real Fitbit Air.
- Confirm `.gitignore` excludes `.env`, the SQLite file, and any encryption keys; write a corrected `.env.example` that documents the client secret as backend-only (never `VITE_`-prefixed).
- Verify disconnect deletes local tokens and, if requested, stored metric rows. Confirm logs contain no health values or raw tokens.
- Run the full automated test suite (OAuth/PKCE, token refresh, normalization, unit conversion, timezone/DST, pagination, dedup, retry, plus backend route tests and frontend state tests).
- **Test:** a real Google test user, using a real Fitbit Air that has synced via the Google Health app, can connect, see correct real data on the dashboard, disconnect, and confirm (by checking the database directly) that their tokens and — if the disconnect flow claims to delete data — their metric rows are gone. All lint/build/test commands pass in the same run.

## Relevant Files

- `/Users/ankkit/health dashboard` — target workspace.
- `voslartomas/google-health-web-dashboard/src/App.tsx` — preserve the existing auth-to-dashboard composition while switching auth/session behavior (M3, M6).
- `voslartomas/google-health-web-dashboard/src/auth/AuthContext.tsx`, `src/auth/google-oauth.ts`, `src/auth/pkce.ts` — reuse UI auth state and the PKCE helper; remove client-secret usage and `sessionStorage` writes (M0, M3).
- `voslartomas/google-health-web-dashboard/src/api/client.ts` and `src/api/*.ts` (`activity.ts`, `sleep.ts`, `heart-rate.ts`, `hrv.ts`, `cardio.ts`, `exercise.ts`, `nutrition.ts`, `resting-hr.ts`, `user.ts`) — real Google Health API v4 request shapes to port server-side (M4, M5); replace their direct frontend usage (M6).
- `voslartomas/google-health-web-dashboard/src/components/DashboardGrid.tsx`, `Layout.tsx`, `LoginScreen.tsx`, and metric cards — reuse structure; add connection, freshness, and capability states (M6, M7).
- `voslartomas/google-health-web-dashboard/.env.example` — currently documents only `VITE_GOOGLE_CLIENT_ID`; replace with a backend-only secret convention (M9).
- New `server/` or `backend/` directory — OAuth callbacks, sessions, Google Health adapter, sync jobs, webhook endpoint, normalization, persistence, and tests (M3–M9).
- New database/schema and backend `.env.example` — local token/session/normalized metric storage configuration without secrets (M3, M9).

## Decisions

- Use the fork as a frontend starting point, and its `src/api/*.ts` modules as a starting point for the server-side Google Health adapter — not as evidence the integration is already complete or secure.
- Use the Google Health API as the primary provider: it's the real, current REST API (`health.googleapis.com/v4`), and the legacy Fitbit Web API is being sunset in September 2026 — the same month this plan was written. New users should use Google OAuth; legacy Fitbit OAuth migration is out of scope for v1.
- Use a backend even for local/private use so client secrets and refresh tokens never live in the browser — this is a fix to apply (M0, M3), not just a pattern to avoid repeating, since the fork's current `main` already does the insecure thing.
- Start read-only and narrow: activity, sleep, heart rate, and exercise metrics first (M4–M5), with advanced vitals capability-gated (M7). No write operations, medical diagnosis, alerts, or multi-user administration in v1.
- Google Fitbit Air is the target device: a screenless wrist tracker with optical heart-rate, SpO2, and temperature sensors, syncing through the Google Health app.

## Further Considerations

1. Google Fitbit Air's hardware supports SpO2 and temperature sensing, but API-level access per account/region/subscription must be validated in M2 before promising those cards.
2. Google Health API access, supported data availability, OAuth verification, quotas, and launch requirements must be checked in the Google Cloud project before committing to a public hosted deployment.
3. A future Android Health Connect bridge is deliberately excluded from v1 because it cannot be queried directly by this web app and adds a second ingestion path.
