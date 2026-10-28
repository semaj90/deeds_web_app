#!/usr/bin/env node
// Page-load forensics (read-only: navigates GET routes only, never clicks, never submits). Captures the five signals the repo's UI-bug
// discipline names: console errors, page errors, failed requests, HTTP >= 400 responses, and request counts. Output is evidence for triage.
// Usage: node scripts/atlas/page-load-forensics-v1.cjs --routes=<routes.json> [--base=http://127.0.0.1:5173] [--out=.tmp/atlas/page_load_forensics.json]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'playwright-core'));
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).slice(n.length + 3);
const base = arg('base', 'http://127.0.0.1:5173');
const out = path.resolve(ROOT, arg('out', '.tmp/atlas/page_load_forensics.json'));
const routes = JSON.parse(fs.readFileSync(arg('routes', ''), 'utf8'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const route of routes) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const r = { route, status: null, consoleErrors: [], pageErrors: [], requestFailures: [], badResponses: [], requests: 0, navError: null };
    page.on('console', (m) => { if (m.type() === 'error') r.consoleErrors.push(m.text().slice(0, 240)); });
    page.on('pageerror', (e) => r.pageErrors.push(String(e.message).slice(0, 240)));
    page.on('request', () => { r.requests += 1; });
    page.on('requestfailed', (q) => r.requestFailures.push(`${q.method()} ${q.url().slice(0, 140)} ${q.failure()?.errorText ?? ''}`));
    page.on('response', (s) => { if (s.status() >= 400) r.badResponses.push(`${s.status()} ${s.request().method()} ${s.url().slice(0, 140)}`); });
    try {
      const resp = await page.goto(base + route, { waitUntil: 'load', timeout: 60000 });
      r.status = resp ? resp.status() : null;
      await page.waitForTimeout(1500);
    } catch (e) { r.navError = String(e.message).slice(0, 200); }
    await ctx.close();
    results.push(r);
  }
  await browser.close();
  const sev = (r) => r.pageErrors.length + r.consoleErrors.length + r.requestFailures.length + r.badResponses.length + (r.navError ? 1 : 0) + ((r.status ?? 200) >= 400 ? 1 : 0);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ schema: 'atlas.page-load-forensics.v1', base, readOnly: true, clicks: 0, results }, null, 1));
  console.log(JSON.stringify({ routes: results.length, withSignals: results.filter((r) => sev(r) > 0).length,
    perRoute: results.map((r) => ({ route: r.route, status: r.status, console: r.consoleErrors.length, pageErr: r.pageErrors.length, failed: r.requestFailures.length, bad: r.badResponses.length, nav: r.navError ? 1 : 0 })) }, null, 1));
})();
