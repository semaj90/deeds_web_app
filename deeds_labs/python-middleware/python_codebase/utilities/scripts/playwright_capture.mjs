#!/usr/bin/env node
/*
  Playwright capture script (ESM)
  - Launches Chromium
  - Navigates to provided URL (or default http://localhost:5173)
  - Collects console messages and network request/response metadata
  - Saves JSON logs and a screenshot to logs/playwright-<timestamp>.*

  Usage: node scripts/playwright_capture.mjs [url]
*/
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5173';
async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const consoleLogs = [];
  const requests = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location(), timestamp: Date.now() });
    // Also print so the terminal shows progress
    console.log('[console]', msg.type(), msg.text());
  });

  page.on('request', (req) => {
    requests.push({ id: req._initialPriority || Math.random(), url: req.url(), method: req.method(), headers: req.headers(), timestamp: Date.now(), type: 'request' });
  });

  page.on('response', async (res) => {
    try {
      const req = res.request();
      const entry = {
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        headers: res.headers(),
        request: { url: req.url(), method: req.method() },
        timestamp: Date.now(),
        type: 'response'
      };
      requests.push(entry);
    } catch (e) {
      // ignore
    }
  });

  console.log('Navigating to', url);
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Navigation status:', resp && resp.status());
  } catch (err) {
    console.error('Navigation failed:', err && err.message);
  }

  // Wait a bit to allow background activity (SSE, sockets) to start
  await page.waitForTimeout(5000);

  // Save snapshot of DOM
  const html = await page.content();

  const base = path.join(outDir, `playwright-${ts}`);
  fs.writeFileSync(base + '.html', html, 'utf8');
  fs.writeFileSync(base + '.console.json', JSON.stringify(consoleLogs, null, 2), 'utf8');
  fs.writeFileSync(base + '.requests.json', JSON.stringify(requests, null, 2), 'utf8');

  await page.screenshot({ path: base + '.png', fullPage: true }).catch(() => {});

  console.log('Saved logs to', base + '.*');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
