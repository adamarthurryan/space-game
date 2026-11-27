---
name: run-app
description: Launch the space game in a browser and check that it works. Use when asked to run, start, screenshot or smoke-test the app, or to confirm a UI or rendering change works in the real app (not just in unit tests).
---

# Run and check the app

## Automated check (use this first)

```bash
npm run smoke
```

It runs `test/smoke/shell.mjs`, then `test/smoke/map.mjs`. Each starts Vite on port 5199
(`SMOKE_PORT` to change it), drives the installed Google Chrome headless through
`playwright-core`, prints a PASS/FAIL line per check, and exits non-zero on any failure. The
shared server, browser and console watch are in `test/smoke/lib.mjs`; it always stops the server
it started.

- `shell.mjs` checks the app shell: the five layout regions, and the WebGL canvas filling the map
  area with each side panel open and closed and after a window resize.
- `map.mjs` checks the map (sprint 2's acceptance criteria): the System tab, selection and
  refocus, Jupiter's moons labelled and apart, the E and P snaps, zooming out 21 notches from low
  Earth orbit, no jitter at ×10⁵, a year at ×10⁷, and picking Mars by its label.
- Both fail on any console error, warning or failed request, except SwiftShader's "GPU stall due
  to ReadPixels" message, which the screenshots themselves cause.

Screenshots are written to `test/smoke/out/` (git-ignored): read them to look at the result.

`map.mjs` reads the dev-only debug handle `window.__spaceGame` (`src/render/debugHandle.ts`):
`camera()`, `body(id)` (screen position, disc, depth), `labels()`, `orbitNormal(id)`,
`simTime()`, and the `view` and `world` stores. Use it from your own Playwright scripts too.

When a sprint adds something visible, add its checks to the smoke file for that area (or a new
file using `lib.mjs`, added to the `smoke` script) rather than writing a separate driver.

## Gotchas

- **Browser:** there is no `chromium-cli` here. The script uses Chrome's install location
  (`channel: 'chrome'`); set `CHROME_PATH` if Chrome is elsewhere.
- **Headless WebGL** needs `--use-angle=swiftshader --enable-unsafe-swiftshader` (already in the
  script).
- **Stale dependency cache:** after changing a dependency, Vite must be started with `--force`
  (the script does), or it serves the old pre-bundled copy.
- **Port in use:** if a previous dev server is still running, stop it with
  `lsof -ti:5199 -sTCP:LISTEN | xargs -r kill`. Don't use a broad `pkill -f`.

## Manual dev server

`npm run dev` serves on Vite's default port (5173). To drive it by hand, copy the launch and
measurement code from `test/smoke/shell.mjs`.
