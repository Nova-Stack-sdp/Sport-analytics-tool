# RaceSync — what to do next

The RaceSync work is committed on `sprint3/SyncF1Broadcast` (commits `2edc81e` and the
follow-up that added the e2e spec, api docs refresh and this note). Nothing is pushed yet.

## 1. Fix the stale e2e spec, then run it

`frontend/e2e/race-sync.spec.js` was written before the layout restructure and will not
pass as-is. What changed since it was written:

- The whole replay transport moved **off the race band** and onto the workflow spine
  (`RaceSyncSpine`). The band is a readout now (flag, name, meta, weather, time remaining).
- The retired spine steppers `Jump forward one lap` / `Jump back one lap` are gone; the
  spine now carries `Back one lap`, `Forward one lap`, the type-in `Lap` input, the
  pause button and the speed cycle, then the red mark.
- The red mark's accessible name is three-state: `Play the race` → `Restart the race`
  (while playing) → `Replay the race` (at the end of the race).
- The `0 / 4`-style readout is gone; the lap chip is now the input's value plus a
  `/ {totalLaps}` text node.
- Driver Analysis is a **right rail** (its own panel, `is-rail`), not a full-width card.

Update the spec's selectors/scoping to the spine (use `exact: true` on role names —
Playwright matches substrings), then run:

```
cd frontend
npx playwright test e2e/race-sync.spec.js
```

## 2. Visual check of the layout

Start the backend (`node --watch src/server.js` in `backend`, port 8080) and the
frontend dev server (port 3000), open `/sync-f1-broadcast`, pick a race, and check:

- **≥ 1760 px window** — Driver Analysis becomes the fifth column beside the map with
  its own scroll; the panels grid switches to 5 columns.
- **1520–1760 px** — Driver Analysis drops to a full-width row under the stage.
- **< 860 px** — everything stacks single-column in DOM order.

Watch for: rail overflow at 1760 px, band wrapping at narrow widths, spine crowding.

## 3. Push when ready

```
git push origin sprint3/SyncF1Broadcast
```

## 4. Still unimplemented from the mockup (future, by priority)

- Scrubbable lap timeline slider (the last absent playback control).
- Right-rail Team Insights + Quick Actions.
- Per-driver photo strip in the race context header.
