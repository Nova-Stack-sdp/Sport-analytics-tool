# Sport Analytics Tool

| | |
|---|---|
| **🌐 Website** | **<https://novastack-f1-frontend.netlify.app>** |
| **⚙️ API** | **<https://sport--backend-api--7kcwxz9xblx5.code.run>** (health check: [`/health`](https://sport--backend-api--7kcwxz9xblx5.code.run/health)) |

A full-stack Formula 1 analytics web application, built as a Software Design (SD) sprint project. It ingests session data from [OpenF1](https://openf1.org/) and derives statistics (driver/team standings, head-to-head, career stats) that are surfaced through a React frontend.

## Tech Stack

**Backend**
- Node.js 22 (ESM), Express
- Prisma ORM + PostgreSQL (hosted on [Neon](https://neon.tech/))
- Firebase Admin SDK (auth token verification)
- Jest + Supertest for testing

**Frontend**
- React 19, React Router 7
- Firebase Authentication (client SDK)
- Create React App (react-scripts)

**Infra**
- Backend hosted on Northflank
- Frontend hosted on Netlify
- Database hosted on Neon (Postgres)
- CI via Gitea Actions, running frontend tests through `docker-compose`

## Project Structure

```
sport-analytics-tool/
├── backend/
│   ├── prisma/                # schema.prisma + migrations
│   ├── src/
│   │   ├── app.js             # Express app + route mounting
│   │   ├── server.js          # entry point, binds to process.env.PORT
│   │   ├── routes/            # overview, statistics, fixtures, timetravel
│   │   ├── derivation/        # stats derivation engine (pure logic + db)
│   │   ├── jobs/               # openf1-sync, backfill-derivation
│   │   ├── middleware/        # requireAuth (Firebase ID token verification)
│   │   └── lib/                # prisma client
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/             # Overview, Statistics, Datasets, Fixtures/Events,
│   │   │                      # Time Travel, Submissions, Admin, Sign In/Up, etc.
│   │   ├── components/        # HeroBanner, TopNavigation, RequireAuth
│   │   ├── api/client.js       # backend API calls
│   │   └── firebase.js         # Firebase client config
├── docs/
│   └── DEPLOYMENT.md          # notes on connecting frontend/backend/db
├── docker-compose.yml
└── .gitea/workflows/ci.yml
```

## Data Model

Defined in `backend/prisma/schema.prisma`. Core entities:

- `Circuit`, `Meeting`, `Session` — event/race structure
- `Team`, `Driver`, `Entry` — participants
- `Submission`, `Event` — manual/raw data submissions
- `CodeSubmission` — scripts submitted from the Developer page's Submit Code tab, awaiting admin review (`pending` → `approved` / `rejected`)
- `DriverSessionStats`, `DriverCareerStats`, `TeamSeasonStats`, `HeadToHead` — derived statistics

## Getting Started

### Prerequisites

- Node.js 22 (see `backend/.nvmrc`)
- A PostgreSQL database (Neon recommended) for the backend
- A Firebase project (for authentication)

### Backend

```bash
cd backend
npm install          # also runs `prisma generate` via postinstall
cp .env.example .env # set DATABASE_URL, FIREBASE_SERVICE_ACCOUNT, FRONTEND_ORIGIN
npm run dev
```

The server binds to `process.env.PORT` (defaults to `8080`) on `0.0.0.0`.

Health check: `GET /health` or `GET /`

API routes (all under `/api`):
- `/overview`, `/statistics`, `/fixtures`, `/timetravel`
- `/teams`, `/drivers`, `/news`, `/videos`, `/images`, `/openf1`, `/race-replay`, `/telemetry-tv`
- `/follows`, `/notifications`, `/auth`
- `/submissions` — dataset (event batch) submissions
- `/code-submissions` — code submissions: `POST` (developer/admin), `GET` and `PATCH /:id` (admin; sets `approved` or `rejected`)
- `/v1/...` — public API

### Frontend

```bash
cd frontend
npm install
```

> If you're on Windows with a OneDrive-synced project folder, npm path errors can occur — make sure you `cd frontend` before running npm commands.

Copy `frontend/.env.example` to `.env.local` and set:
- `REACT_APP_API_URL` — URL of the running backend
- Firebase config values (see `src/firebase.js`)

```bash
npm start
```

### Developer page and code submissions

Developer mode adds a **Developer** page with four tabs: API Console, Datasets, **Submit Code** and **Submit Dataset**.

- **Submit Code** saves a script to the `code_submission` table with status `pending` (the client cannot choose the status).
- The **Admin → Submissions** tab reads that table and lists each submission with Approve / Reject. These set the status to `approved` or `rejected` in the database, and the page shows the stored values.
- **Submit Dataset** is the original event-batch submission flow (`/api/submissions`).
- After pulling these changes, apply the new migration: `cd backend && npx prisma migrate deploy`.

### Pulling Real Data

Tables are empty by default. Populate them with:

```bash
node backend/src/jobs/openf1-sync.js <session_key>
```

or by accepting a manual submission, which triggers `backend/src/derivation/index.js`.

## Testing & Coverage

- **Frontend:** `react-scripts test` (Create React App / Jest). Coverage outputs automatically to `coverage/lcov.info` — do **not** set `coverageDirectory` in the Jest config, as it breaks the Codecov upload.
- **Backend:** `npm test` (Jest + Supertest), covering the overview, statistics, fixtures, timetravel, and auth-middleware routes.

## CI/CD

- **Gitea Actions** (`.gitea/workflows/ci.yml`) runs frontend tests via `docker compose run --rm frontend` on push/PR to `main`.
- **Codecov** is integrated for coverage reporting.

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full backend (Northflank) / frontend (Netlify) / database (Neon) setup, including required environment variables and known gotchas (health check binding, Prisma client generation, CORS origin config).

### Known gaps (see DEPLOYMENT.md for detail)
- On the Admin page only the Submissions tab is live; the API Keys, Dataset Releases, API Versions and Reconciliation tabs are still static mock UI.
- Approved code submissions are not yet deployed or run anywhere, and submitters are not notified of the outcome.
- Sign-in/sign-up flow is still being finalized (a `User` model / auth wiring is outstanding).

## Team

Built collaboratively by Nova Stack as part of an SD sprint project.
