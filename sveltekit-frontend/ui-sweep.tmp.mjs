import { chromium } from '@playwright/test';
import fs from 'node:fs';
const routes = ['/dashboard','/cases','/cases/new','/evidence','/evidence/upload','/evidence/hash','/evidence/manage','/evidence-library','/persons-of-interest','/persons-of-interest/create','/chat','/analysis-center','/global-search','/citations','/library','/reports','/reports/new','/command-center','/recommendations','/system-configuration','/terminal','/analytics','/active-cases','/rag-search','/indexing','/knowledge','/legal-corpus','/simulation','/studio','/fictional-cases'];
const browser = await chromium.launch();
const results = [];
for (const route of routes) {
  const row = { route, pageErrors: [], consoleErrors: [], failedRequests: [], overflowMobile: null, bodyChars: 0, status: null };
  for (const width of [1366, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => row.pageErrors.push(e.message.slice(0, 160)));
    page.on('console', (m) => { if (m.type() === 'error') row.consoleErrors.push(m.text().slice(0, 160)); });
    page.on('response', (r) => { if (r.status() >= 500 && r.url().includes('/api/')) row.failedRequests.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    try {
      const resp = await page.goto('http://localhost:5173' + route, { waitUntil: 'load', timeout: 45000 });
      row.status = resp?.status() ?? null;
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => ({ body: document.body.innerText.length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      if (width === 390) row.overflowMobile = m.overflow; else row.bodyChars = m.body;
      if (width === 1366) await page.screenshot({ path: `/c/Users/james/Videos/deeds-web-app/.tmp/atlas/ui-sweep/${route.replace(/\//g, '_') || 'root'}.png` }).catch(() => {});
    } catch (e) { row.pageErrors.push('NAV: ' + String(e).slice(0, 160)); }
    await ctx.close();
  }
  results.push(row);
  console.log(route, 'status', row.status, 'pageErr', row.pageErrors.length, 'consoleErr', row.consoleErrors.length, 'api5xx', row.failedRequests.length, 'mobileOverflow', row.overflowMobile, 'bodyChars', row.bodyChars);
}
fs.writeFileSync('/c/Users/james/Videos/deeds-web-app/.tmp/atlas/ui-sweep-2026-11-15.json', JSON.stringify(results, null, 2));
await browser.close();
