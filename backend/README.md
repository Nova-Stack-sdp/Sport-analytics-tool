# Backend — Sport Analytics Tool (F1)

Event-sourced backend for the F1 Sport Analytics Tool. Nothing is stored as a
statistic directly — every fact (a lap, a pit stop, a flag) is written once as
an immutable event, and every displayed stat is derived from those events. If
a stat is wrong, the fix is to correct the event and recompute, never to edit
the stat.

## Stack

- **Runtime**: Node.js (22.12+ or 24+ — see [Node version](#node-version) below)
- **Database**: PostgreSQL on [Neon](https://neon.tech), raw Postgres only (no auto-generated APIs)
- **ORM / migrations**: Prisma 7
- **Data source**: [OpenF1 API](https://openf1.org) — free, no key required

## Architecture

```
OpenF1 sync job ----\
                      |--> submission -> validation -> event log (source of truth)
Manual file upload --/                                        |
                                                                v
                                                        derivation engine
                                                                |
                                                                v
                                                    projection tables (rebuildable)
                                                                |
                                                                v
                                                            API -> UI
```

- **Dimension tables** (`circuit`, `meeting`, `session`, `team`, `driver`, `entry`) — reference data.
- **Event log** (`submission`, `event`) — append-only, source of truth. Corrections
  never edit or delete an event; they create a new one and set `superseded_by`
  on the old one. Derivation only ever reads events where `superseded_by` is null.
- **Projection tables** (`driver_session_stats`, `driver_career_stats`,
  `team_season_stats`, `head_to_head`) — computed, rebuildable. If dropped
  entirely and re-derived, they'd come back identical.

## Setup

### Node version

Prisma 7 requires Node `^20.19 || ^22.12 || >=24.0` — plain Node 18 (a common
default on shared/lab machines) will fail to install. A `.nvmrc` is included:

```bash
nvm install
nvm use
```

If you don't have `nvm`, install Node 22+ directly from [nodejs.org](https://nodejs.org).

### Install and configure

```bash
npm install
```

Create a `.env` file in `backend/` (never committed — see `.gitignore`):

```
DATABASE_URL="your-neon-connection-string"
```

Get the connection string from the team's Neon dashboard. Prisma 7 needs this
loaded explicitly — `prisma.config.ts` imports `dotenv/config` for this reason;
don't remove that import.

```bash
npx prisma generate
```

### Run migrations

```bash
npx prisma migrate dev
```

Applies any pending migrations from `prisma/migrations/` to your configured
database.

## Running things

**Sync a session from OpenF1** (fetches, validates, writes events, then
automatically runs derivation):

```bash
node src/jobs/openf1-sync.js <session_key>
```

Find a `session_key` via, e.g.:
```bash
curl -s "https://api.openf1.org/v1/sessions?year=2025&session_name=Race"
```

**Inspect the database visually:**

```bash
npx prisma studio
```

Opens a browser GUI at `localhost:5555` — useful for checking the `event`
table (raw log) against the `driver_session_stats` table (computed result)
side by side.

**Run the derivation engine's tests:**

```bash
npm test
```

10 tests, pure functions only — no database connection needed. Covers lap/pit
aggregation, positions-gained logic (sourced from a real `grid_position`
event, never guessed), and head-to-head win counting.

## Known limitations

Documented here rather than silently left unclear — some OpenF1 fields aren't
available or are approximated:

- `lap_completed.payload.position` is always null — OpenF1's `/laps` endpoint
  doesn't return it. Position is derived separately from `position_change`
  events and, at session start, from a dedicated `grid_position` event.
- `pit_stop.exit_time` is approximated as `entry_time + pit_duration`, since
  OpenF1 only provides one timestamp per stop.
- `position_change.cause` defaults to `'on_track'` — OpenF1 doesn't label the
  cause of a position change.
- `session_status_change` events are not populated — no clean source for this
  in OpenF1's free tier.
- **OpenF1 quirk**: `/starting_grid` is keyed to the *qualifying* session's
  `session_key`, not the race's, even though the grid applies to the race.
  `openf1-sync.js` resolves the correct qualifying session per meeting before
  querying grid data — see `resolveGridSessionKey` in `src/jobs/openf1-sync.js`.
- `head_to_head` currently only covers teammates (same team, same session),
  not arbitrary driver pairs — a deliberate scope decision, not a bug.
- Points, wins, and podiums are trusted directly from OpenF1's `classification`
  event data rather than recomputed against a hardcoded scoring table, since
  F1's points structure has changed across seasons and differs for sprints.

## Project structure

```
backend/
  prisma/
    schema.prisma       # database schema — the source of truth for structure
    migrations/          # one folder per migration, applied in order
  src/
    jobs/
      openf1-sync.js     # pulls a session from OpenF1, writes submission + events
    derivation/
      pure.js             # stat computation — no DB dependency, unit tested
      db.js                # DB access — fetches live events, upserts projections
      index.js             # runDerivationForSession(prisma, sessionId) — entry point
      pure.test.js          # Jest tests for pure.js
```
