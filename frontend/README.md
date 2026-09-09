# NovaStack F1 — Frontend

React frontend for the NovaStack Sport Analytics Tool — a platform for browsing, submitting, and analysing Formula 1 event data. This app is the client for the [backend API](../backend), and its documentation lives at [our Docusaurus site](https://novastack-f1-docs.netlify.app) (see [Database Architecture](https://novastack-f1-docs.netlify.app/docs/architecture/database-schema) and [API Overview](https://novastack-f1-docs.netlify.app/docs/api/api-overview) in particular).

**Live app:** https://novastack-f1-frontend.netlify.app

## Stack
* React 19 + React Router v7
* Bootstrapped with Create React App (`react-scripts`)
* Firebase Auth (email/password + Google/GitHub OAuth) for sign up, sign in, and password reset
* Jest + React Testing Library for tests

## Getting Started

### Prerequisites
* Node.js (see the version used in CI — `frontend/Dockerfile` targets `node:22-alpine`)
* A Firebase project with Email/Password and Google/GitHub sign-in enabled, if you want auth to work locally
* The backend running somewhere reachable (locally or the deployed Northflank instance) if you want live data instead of just the UI shell

### Install
```bash
npm install
```

### Environment variables
Create a `.env.local` in this directory (not committed — see `.gitignore`). All of these are **build-time** vars, since Create React App only bakes in `REACT_APP_`-prefixed variables at build time — changing one means rebuilding, not just restarting.

```bash
# Backend API this app talks to. Falls back to the deployed Northflank
# instance if unset, so this is only required for local backend development.
REACT_APP_API_URL=http://localhost:3001

# Firebase config — from your Firebase project settings
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
```

### Run locally
```bash
npm start
```
Opens [http://localhost:3000](http://localhost:3000). Hot-reloads on save.

### Run tests
```bash
npm test
```
Runs Jest + React Testing Library in watch mode. CI runs this non-interactively with coverage (`npm test -- --watchAll=false --coverage`), same as `frontend/Dockerfile`'s `CMD` — see `.gitea/workflows/ci.yml`.

### Build for production
```bash
npm run build
```
Outputs a static, deployable bundle to `build/`. This is what Netlify builds and serves.

## Project Structure
```
src/
├── api/            # fetch wrapper for the backend (client.js — reads REACT_APP_API_URL)
├── components/      # shared UI (top nav, route guards, etc.)
├── context/          # AuthContext — wraps Firebase auth state
├── firebase.js       # Firebase app/auth initialisation
├── navigation/        # route definitions (AppRoutes.js)
├── pages/             # one file per route
└── styles/             # global CSS
```

## Pages
| Route | Page | Data source |
|---|---|---|
| `/` | Overview | Live — `GET /api/overview` |
| `/fixtures` | Fixtures & Events | Live — `GET /api/fixtures`, `/api/fixtures/:sessionId/events` |
| `/statistics` | Statistics | Live — `GET /api/statistics` |
| `/timetravel` | Time-Travel | Live — `GET /api/timetravel/*` |
| `/submissions` | Submissions | Static UI — no write endpoint exists yet |
| `/datasets` | Datasets | Static UI |
| `/developer` | Developer | Static UI — mocks the target API surface |
| `/admin` | Admin | Static UI |
| `/sign-in`, `/sign-up`, `/forgot-password` | Auth | Live — Firebase |

`/submissions`, `/datasets`, `/developer`, and `/admin` are behind `RequireAuth`. See [API Overview](https://novastack-f1-docs.netlify.app/docs/api/api-overview) for exactly what's live vs. still mocked on the backend.

## UI Design
The page layout and structure were designed as an interactive wireframe before implementation: [mockf1app.netlify.app](https://mockf1app.netlify.app).

## Deployment
Deployed on Netlify, built from this directory (`npm run build`, publish `build/`). `REACT_APP_API_URL` is set as a Netlify environment variable pointing at the Northflank backend — see [Third-Party Dependencies](https://novastack-f1-docs.netlify.app/docs/third-party/dependencies) for the full hosting breakdown (Netlify/Northflank/Neon).

## Contributing
See the docs site's [Git Workflow](https://novastack-f1-docs.netlify.app/docs/getting-started/git-workflow) for branch naming, commit conventions, and PR requirements.