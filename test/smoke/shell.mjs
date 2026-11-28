// Headless-browser smoke check of the app shell: acceptance criterion 5 of sprint 0.
//
//   npm run smoke
//
// Starts Vite, drives the installed Google Chrome with playwright-core, and checks that the five
// layout regions render, that the WebGL canvas fills the map area (with each side panel open and
// closed, and after a window resize), and that the console shows no errors, warnings or failed
// requests. Exits non-zero on any failure. Screenshots go to test/smoke/out/ (git-ignored).
//
// The server, browser and console watch are in lib.mjs; the map checks are in map.mjs.

import { resolve } from 'node:path';
import { outDir, smoke, url } from './lib.mjs';

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

async function checkFit(page, check, state) {
  const fits = await waitForCanvasFit(page);
  check(fits, `${state}: canvas fills the map area (${describeFit(await measure(page))})`);
}

async function run(page, check) {
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
    tabs.join(',') === 'System,Fleets',
    `sidebar has the System and Fleets tabs (S5b-22) (${tabs.join(', ')})`,
  );
  if (m.header && m.nav && m.main && m.aside && m.footer) {
    check(
      m.nav.x < m.main.x && m.main.x < m.aside.x && m.header.y < m.main.y && m.main.y < m.footer.y,
      'regions are in the interface.md layout',
    );
  }
  await checkFit(page, check, 'both panels open');
  await page.screenshot({ path: resolve(outDir, 'shell.png') });

  const sidebar = page.getByRole('button', { name: 'Sidebar' });
  const inspector = page.getByRole('button', { name: 'Inspector' });

  await sidebar.click();
  check((await measure(page)).nav === null, 'sidebar toggle hides the sidebar');
  await checkFit(page, check, 'sidebar closed');

  await inspector.click();
  check((await measure(page)).aside === null, 'inspector toggle hides the inspector');
  await checkFit(page, check, 'both panels closed');
  await page.screenshot({ path: resolve(outDir, 'panels-closed.png') });

  await sidebar.click();
  await inspector.click();
  await checkFit(page, check, 'panels reopened');

  await page.setViewportSize({ width: 1000, height: 600 });
  await checkFit(page, check, 'window resized to 1000×600');
  await page.screenshot({ path: resolve(outDir, 'resized.png') });
}

await smoke('App shell', run);
