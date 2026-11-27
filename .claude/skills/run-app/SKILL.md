---
name: run-app
description: Launch the space game in a browser and check that it works. Use when asked to run, start, screenshot or smoke-test the app, or to confirm a UI or rendering change works in the real app (not just in unit tests).
---

# Run and check the app

## Automated check (use this first)

```bash
npm run smoke
```

`test/smoke/shell.mjs` starts Vite on port 5199 (`SMOKE_PORT` to change it), drives the
installed Google Chrome headless through `playwright-core`, prints a PASS/FAIL line per check,
and exits non-zero on any failure. It always stops the server it started.

It checks the app shell: the five layout regions, the WebGL canvas filling the map area with
each side panel open and closed and after a window resize, and a console with no errors,
warnings or failed requests. Screenshots are written to `test/smoke/out/` (git-ignored): read
them to look at the result.

When a sprint adds something visible, add its checks to `test/smoke/shell.mjs` rather than
writing a separate driver.

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
