// Shared helpers for the headless-browser smoke checks (shell.mjs, map.mjs): the Vite server,
// the browser, PASS/FAIL reporting, and the console and network watch.
//
// Environment:
//   SMOKE_PORT   dev server port (default 5199)
//   CHROME_PATH  browser executable (default: the installed Google Chrome)

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const outDir = resolve(root, 'test/smoke/out');
const port = Number(process.env.SMOKE_PORT ?? 5199);
export const url = `http://localhost:${port}/`;

/**
 * Console messages that come from the test harness, not the app. SwiftShader's GL driver warns
 * of a "GPU stall due to ReadPixels" when Playwright screenshots a WebGL canvas; the app never
 * reads pixels back. Anything else, including other driver messages, still fails the check.
 */
const HARNESS_NOISE = [
  /GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/,
];

/** Starts Vite directly (not through npm, so that killing it stops the server). */
async function startServer() {
  const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');
  // --force rebuilds Vite's dependency cache, so a stale cache can't hide a dependency change.
  const server = spawn(
    process.execPath,
    [viteBin, '--port', String(port), '--strictPort', '--force'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
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

/**
 * Runs one smoke file: starts the server and the browser, calls `run(page, check)`, then checks
 * that the console showed no errors or warnings and no request failed. Prints a PASS/FAIL line
 * per check and sets the exit code.
 */
export async function smoke(name, run) {
  const failures = [];
  const check = (ok, what) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
    if (!ok) failures.push(what);
    return ok;
  };

  console.log(`\n${name}`);
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
      if (msg.type() !== 'error' && msg.type() !== 'warning') return;
      if (HARNESS_NOISE.some((re) => re.test(msg.text()))) return;
      problems.push(`console ${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));

    await run(page, check);

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
      ? `${name}: passed. Screenshots in ${outDir}`
      : `${name}: ${failures.length} check(s) failed.`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}
