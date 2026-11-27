// Headless-browser smoke check of the app shell: acceptance criterion 5 of sprint 0.
//
//   npm run smoke
//
// Starts Vite, drives the installed Google Chrome with playwright-core, and checks that the five
// layout regions render, that the WebGL canvas fills the map area (with each side panel open and
// closed, and after a window resize), and that the console shows no errors, warnings or failed
// requests. Exits non-zero on any failure. Screenshots go to test/smoke/out/ (git-ignored).
//
// Environment:
//   SMOKE_PORT   dev server port (default 5199)
//   CHROME_PATH  browser executable (default: the installed Google Chrome)

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'test/smoke/out');
const port = Number(process.env.SMOKE_PORT ?? 5199);
const url = `http://localhost:${port}/`;

const failures = [];
function check(ok, what) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}

/** Starts Vite directly (not through npm, so that killing it stops the server). */
async function startServer() {
  const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');
  // --force rebuilds Vite's dependency cache, so a stale cache can't hide a dependency change.
  const server = spawn(
    process.execPath,
    [viteBin, '--port', String(port), '--strictPort', '--force'],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  server.stdout.on('data', (d) => (output += d));
  server.stderr.on('data', (d) => (output += d));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited early:\n${output}`);
    try {
      if ((await fetch(url)).ok) return server;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  server.kill();
  throw new Error(`Vite did not respond on ${url} within 30 s:\n${output}`);
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch(executablePath ? { executablePath, args } : { channel: 'chrome', args });
}

/** Bounding boxes of the layout regions and the canvas, and the canvas's backing-store size. */
function measure(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const canvas = document.querySelector('main canvas');
    return {
      header: box('header'),
      nav: box('nav[aria-label="Sidebar"]'),
      main: box('main'),
      aside: box('aside[aria-label="Inspector"]'),
      footer: box('footer'),
      canvas: box('main canvas'),
      backing: canvas ? { w: canvas.width, h: canvas.height } : null,
      dpr: window.devicePixelRatio,
      webgl: !!canvas && !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl')),
    };
  });
}

/** Waits for R3F to catch up with a layout change: the canvas must match the map area. */
async function waitForCanvasFit(page) {
  try {
    await page.waitForFunction(
      () => {
        const main = document.querySelector('main')?.getBoundingClientRect();
        const c = document.querySelector('main canvas');
        if (!main || !c) return false;
        const b = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio;
        return (
          Math.abs(b.width - main.width) <= 1 &&
          Math.abs(b.height - main.height) <= 1 &&
          Math.abs(c.width - Math.round(b.width * dpr)) <= 1 &&
          Math.abs(c.height - Math.round(b.height * dpr)) <= 1
        );
      },
      undefined,
      { timeout: 3000 },
    );
    return true;
  } catch {
    return false;
  }
}

function describeFit(m) {
  const size = (b) => (b ? `${Math.round(b.w)}×${Math.round(b.h)}` : 'none');
  return `map ${size(m.main)}, canvas ${size(m.canvas)}, backing ${size(m.backing)}`;
}

async function checkFit(page, state) {
  const fits = await waitForCanvasFit(page);
  check(fits, `${state}: canvas fills the map area (${describeFit(await measure(page))})`);
}

async function run(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('main canvas');

  const m = await measure(page);
  check(!!m.header, 'top bar renders');
  check(!!m.nav, 'left sidebar renders');
  check(!!m.main, 'map renders');
  check(!!m.aside, 'inspector renders');
  check(!!m.footer, 'timeline renders');
  check(m.webgl, 'canvas has a WebGL context');
  const tabs = await page.getByRole('tab').allTextContents();
  check(
    tabs.join(',') === 'System,Fleets,Stations,Routes',
    `sidebar has four tabs (${tabs.join(', ')})`,
  );
  if (m.header && m.nav && m.main && m.aside && m.footer) {
    check(
      m.nav.x < m.main.x && m.main.x < m.aside.x && m.header.y < m.main.y && m.main.y < m.footer.y,
      'regions are in the interface.md layout',
    );
  }
  await checkFit(page, 'both panels open');
  await page.screenshot({ path: resolve(outDir, 'shell.png') });

  const sidebar = page.getByRole('button', { name: 'Sidebar' });
  const inspector = page.getByRole('button', { name: 'Inspector' });

  await sidebar.click();
  check((await measure(page)).nav === null, 'sidebar toggle hides the sidebar');
  await checkFit(page, 'sidebar closed');

  await inspector.click();
  check((await measure(page)).aside === null, 'inspector toggle hides the inspector');
  await checkFit(page, 'both panels closed');
  await page.screenshot({ path: resolve(outDir, 'panels-closed.png') });

  await sidebar.click();
  await inspector.click();
  await checkFit(page, 'panels reopened');

  await page.setViewportSize({ width: 1000, height: 600 });
  await checkFit(page, 'window resized to 1000×600');
  await page.screenshot({ path: resolve(outDir, 'resized.png') });
}

mkdirSync(outDir, { recursive: true });
const server = await startServer();
let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const problems = [];
  context.on('requestfailed', (r) => problems.push(`request failed: ${r.url()}`));
  context.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      problems.push(`console ${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));

  await run(page);

  check(problems.length === 0, 'no console errors, warnings or failed requests');
  for (const p of problems) console.log(`      ${p}`);
} catch (e) {
  check(false, `smoke run completed (${e instanceof Error ? e.message : String(e)})`);
} finally {
  await browser?.close();
  server.kill();
}

console.log(
  failures.length === 0
    ? `\nSmoke check passed. Screenshots in ${outDir}`
    : `\n${failures.length} check(s) failed.`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
