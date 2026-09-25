# Deployment: connecting frontend, backend, and database

This documents what needs to be configured on each platform for the three
pieces to actually talk to each other. It was written while fixing a broken
first deploy — see context below each section.

## Backend — Northflank

**Why the service was returning `503 no healthy upstream`:** there was no
HTTP server in the backend at all — no entry point that opened a port, so
Northflank's gateway had nothing healthy to route to, regardless of how the
service was configured.

That's fixed by `backend/src/server.js` (added in `sprint-1/feat-overview-live-data`),
which starts an Express app bound to `process.env.PORT` on `0.0.0.0`.

To deploy it correctly on Northflank:

1. **Build/start command** — Northflank should run `npm install` then
   `npm start` from the `backend/` directory (`package.json` now has a
   `start` script: `node src/server.js`). If your service's root context is
   the repo root rather than `backend/`, set the working directory
   accordingly in Northflank's service settings.
2. **Port** — Northflank sets `PORT` automatically; don't hardcode a port in
   config, the server already reads `process.env.PORT`.
3. **Environment variables** (Northflank service -> Environment):
   - `DATABASE_URL` — the Neon connection string (pooled connection string
     is fine). This was already set, per our check.
   - `FRONTEND_ORIGIN` — set this to your exact Netlify URL, e.g.
     `https://your-site.netlify.app`. This controls CORS — without it, the
     API falls back to allowing all origins (`*`), which works but
     shouldn't be relied on in production. Comma-separate multiple origins
     (e.g. a Netlify preview URL + the production domain) if needed.
   - `FIREBASE_SERVICE_ACCOUNT` — the Firebase Admin service account key,
     as a single-line JSON string. Required for everything behind
     `requireAuth`: `POST /api/auth/session`, `GET /api/auth/me`,
     `POST /api/auth/developer-mode` and `PUT /api/drivers/:id/image`.
     Without it those return `500 {"error":"Auth is not configured on the
     server"}` — deliberately a 500 rather than a 401, so a server
     misconfiguration doesn't get read as "the user sent a bad token".
     Sign-in fails without it: the frontend's token exchange is what sets
     the session cookie, so Firebase will report the user as signed in
     while every protected call still rejects them.
4. **Health check** — point Northflank's health check at `GET /health`
   (or `GET /`), both now return `200 { status: "ok" }`.
5. **Prisma engine** — `@prisma/client` needs its generated client
   available at runtime. Add a build step that runs `npx prisma generate`
   before `npm start` (e.g. as a Northflank build command, or a
   `postinstall` script), otherwise the server will fail at startup with a
   "Cannot find module '.prisma/client'" error.

`FIREBASE_SERVICE_ACCOUNT` has two failure modes worth knowing, both of
which surface as confusing errors rather than "your config is wrong":

- **Double-quoted value.** The key's `private_key` field contains `\n`
  escapes. dotenv *expands* escape sequences inside double-quoted values,
  so those become real newlines and the JSON no longer parses — which
  arrives as `401 "Invalid or expired Firebase token"` rather than a
  config error. Wrap the value in **single** quotes; the JSON's own double
  quotes are fine inside them.
- **Key from the wrong project.** It must belong to the same Firebase
  project as the frontend's `REACT_APP_FIREBASE_PROJECT_ID`, or every
  token fails as if it had expired.

To check a key before deploying, from `backend/` (one line — the value is
quoted for PowerShell and bash alike):

    node -e "const {getAdminApp}=await import('./src/lib/firebaseAdmin.js');const admin=(await import('firebase-admin')).default;admin.auth(getAdminApp()).getUser('no-such-uid').catch(e=>console.log(e.code))"

`auth/user-not-found` means the key is good (the JWT was signed *and*
accepted by Google); `invalid_grant` or `invalid_client` means it isn't.

Once deployed, sanity-check with:
curl https://<your-northflank-url>/health
curl https://<your-northflank-url>/api/overview


## Frontend — Netlify

**Why the frontend never showed real data:** none of the pages made any API
calls at all — everything was hardcoded mock content. `frontend/src/pages/OverviewPage.js`
now fetches from the backend on load; other pages still need the same
treatment (this branch only covers Overview).

To deploy correctly on Netlify:

1. **Build command**: `npm run build` (Netlify's CRA default — no change
   needed).
2. **Environment variable** (Netlify -> Site configuration -> Environment
   variables): set `REACT_APP_API_URL` to the Northflank backend URL, e.g.
   `https://sport--backend-api--7kcwxz9xblx5.code.run`. CRA only exposes
   env vars prefixed `REACT_APP_`, and only bakes them in at **build** time
   — changing this value requires a new deploy/rebuild, not just a redeploy
   of the same build.
3. For local development, copy `frontend/.env.example` to `.env.local` and
   point it at wherever you're running the backend locally (this file is
   git-ignored, so it's safe to put real values there).

## Database — Neon

Neon only holds the Postgres data — it has no application environment
variables, so nothing auth-related belongs here. The one thing you take from
Neon is the connection string, and that goes into the backend's env
(Northflank for the deployed service, `backend/.env` locally).

No changes needed here. All three Prisma migrations are applied (confirmed
via Neon's table list: all 12 domain tables + `_prisma_migrations` are
present). Worth checking whether tables actually have rows — if they're
empty, `GET /api/overview` will return correctly-shaped but empty data
(`leaderboard: []`, `latestSession: null`, etc.) rather than erroring, but
the Overview page won't show anything meaningful until either:
- `node src/jobs/openf1-sync.js <session_key>` is run to pull real session
  data from OpenF1, or
- a manual submission is accepted and derivation (`src/derivation/index.js`)
  runs for that session.

## Who needs which env vars

`backend/.env` is a gitignored convenience for running the backend on your
own machine — it is not how config is shared. `docker-compose.yml` reads the
same file via `env_file`, so local Docker runs pick it up too.

**Deployed backend (Northflank):** `DATABASE_URL`, `FRONTEND_ORIGIN`,
`FIREBASE_SERVICE_ACCOUNT`. Setting these is what makes the deployed site
work for everyone — no per-user setup is involved.

**Each developer, locally:** their own `backend/.env`, copied from
`backend/.env.example`. For `FIREBASE_SERVICE_ACCOUNT`, prefer each dev
generating their **own** key for the same service account (Firebase allows
several keys per account and each is individually revocable) over passing one
key around in chat or email — revoking one laptop then doesn't disrupt
everyone.

**CI (Gitea Actions):** nothing. The backend tests mock `firebase-admin` and
inject a fake key, and `docker-compose.yml` marks the env file
`required: false` so the build runs without one. Don't add the real key to CI
secrets.

**Frontend (Netlify):** only public values — `REACT_APP_API_URL` and the
`REACT_APP_FIREBASE_*` web config. Never put a service account key in a
`REACT_APP_` variable: CRA bakes those into the JS bundle at build time, so
it would ship an admin credential to every browser.

## What's still not connected

- Only the Overview page currently calls the backend. Statistics, Datasets,
  Fixtures/Events, Time Travel, Submissions, and Admin are still static
  mock UI — same pattern (`frontend/src/api/client.js` + a `useEffect` fetch)
  needs to be applied to each, with a matching backend route.
- Sign-in/sign-up is implemented and connected — Firebase Authentication on
  the frontend, its ID token exchanged for an httpOnly `__session` cookie and
  verified server-side with the Admin SDK (see `FIREBASE_SERVICE_ACCOUNT`
  above). There is deliberately no `User` model: identities live in Firebase,
  and the database stores only Firebase uids for audit
  (`DriverImage.uploadedBy`, `Submission.submitterId`). There is also no
  `backend/src/auth/signin.js`, and nothing expects one — that module was
  planned and dropped when the team moved to Firebase, and
  `backend/tests/require-auth-middleware.test.js` replaced the test written
  for it. Still open on the auth side: `/admin` is gated on being signed in
  but has no admin *role* check yet (`frontend/src/components/RequireAuth.js`
  defers that to custom claims), and a session restored from Firebase without
  a valid cookie is never re-exchanged — the UI shows the user as signed in
  while `requireAuth` routes return 401.