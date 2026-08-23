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
4. **Health check** — point Northflank's health check at `GET /health`
   (or `GET /`), both now return `200 { status: "ok" }`.
5. **Prisma engine** — `@prisma/client` needs its generated client
   available at runtime. Add a build step that runs `npx prisma generate`
   before `npm start` (e.g. as a Northflank build command, or a
   `postinstall` script), otherwise the server will fail at startup with a
   "Cannot find module '.prisma/client'" error.

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

## What's still not connected

- Only the Overview page currently calls the backend. Statistics, Datasets,
  Fixtures/Events, Time Travel, Submissions, and Admin are still static
  mock UI — same pattern (`frontend/src/api/client.js` + a `useEffect` fetch)
  needs to be applied to each, with a matching backend route.
- Sign-in/sign-up is out of scope here by request — see prior discussion,
  it needs a `User` model (or a third-party auth decision), plus the
  `backend/src/auth/signin.js` module the existing test suite expects.