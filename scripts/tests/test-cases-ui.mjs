#!/usr/bin/env node
/**
 * Cases UI Screenshot Test — Verifies fictional cases render with proper UX
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'cases-ui');
await fs.mkdir(OUT, { recursive: true });

const BASE = 'http://127.0.0.1:5173';

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  log(pass ? '✓' : '✗', `${name}${detail ? ' — ' + detail : ''}`);
}

// Wait for server
for (let i = 0; i < 20; i++) {
  try { const r = await fetch(BASE); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 2000));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

console.log('\n  ╔══════════════════════════════════════════════╗');
console.log('  ║   Cases UI/UX — Screenshot Test Suite         ║');
console.log('  ╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
// TEST 1: Cases list page
// ═══════════════════════════════════════════════════════════════
const page = await ctx.newPage();
try {
  const resp = await page.goto(`${BASE}/cases`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);
  const status = resp?.status() ?? 0;
  record('Cases list loads', status >= 200 && status < 400, `HTTP ${status}`);

  const caseCount = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="case-card"], [class*="case-item"], [class*="case-row"], tr[class*="case"], [data-case-id]');
    const rows = document.querySelectorAll('tbody tr, [class*="list-item"], [class*="card"]');
    const fictional = document.body?.innerText?.match(/FICTIONAL/g)?.length || 0;
    return { cards: cards.length, rows: rows.length, fictional, bodyLen: document.body?.innerText?.length || 0 };
  });
  record('Cases render', caseCount.cards > 0 || caseCount.rows > 0,
    `cards=${caseCount.cards}, rows=${caseCount.rows}, [FICTIONAL] mentions=${caseCount.fictional}`);

  await page.screenshot({ path: path.join(OUT, '01-cases-list.png'), fullPage: false });
} catch (e) {
  record('Cases list', false, e.message.slice(0, 120));
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: Active cases page
// ═══════════════════════════════════════════════════════════════
try {
  const resp = await page.goto(`${BASE}/active-cases`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);
  const status = resp?.status() ?? 0;
  record('Active cases loads', status >= 200 && status < 400, `HTTP ${status}`);

  const info = await page.evaluate(() => {
    const allText = document.body?.innerText || '';
    const fictional = (allText.match(/FICTIONAL/g) || []).length;
    const cards = document.querySelectorAll('[class*="case"], [class*="card"]').length;
    return { fictional, cards, hasOpen: allText.includes('open') || allText.includes('Open') };
  });
  record('Active cases content', info.cards > 0, `cards=${info.cards}, fictional=${info.fictional}`);

  await page.screenshot({ path: path.join(OUT, '02-active-cases.png'), fullPage: false });
} catch (e) {
  record('Active cases', false, e.message.slice(0, 120));
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: Click into a fictional case detail
// ═══════════════════════════════════════════════════════════════
try {
  // Go back to cases list
  await page.goto(`${BASE}/cases`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Try to find and click a case link/card
  const caseLink = page.locator('a[href*="/cases/"], [class*="case-card"] a, [class*="case-item"] a, tr a[href*="cases"]').first();
  if (await caseLink.count() > 0) {
    await caseLink.click();
    await page.waitForTimeout(3000);

    const url = page.url();
    const hasDetail = url.includes('/cases/') && url !== `${BASE}/cases`;
    record('Case detail navigation', hasDetail, url.replace(BASE, ''));

    await page.screenshot({ path: path.join(OUT, '03-case-detail.png'), fullPage: false });

    // Check detail page content
    const detail = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return {
        hasTitle: text.length > 100,
        hasDescription: text.includes('fraud') || text.includes('trafficking') || text.includes('defendant') || text.includes('Defendant') || text.includes('FICTIONAL'),
        hasTabs: document.querySelectorAll('[role="tab"], [class*="tab"]').length,
        domSize: document.querySelectorAll('*').length,
      };
    });
    record('Case detail renders', detail.hasTitle, `DOM=${detail.domSize}, tabs=${detail.hasTabs}`);
  } else {
    await page.screenshot({ path: path.join(OUT, '03-no-case-links.png'), fullPage: false });
    record('Case detail navigation', false, 'No case links found on list page');
  }
} catch (e) {
  record('Case detail', false, e.message.slice(0, 120));
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: Case overview tab (if available)
// ═══════════════════════════════════════════════════════════════
try {
  // Navigate to a known test case overview
  const resp = await page.goto(`${BASE}/cases/test-id/overview`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);
  const status = resp?.status() ?? 0;

  const overview = await page.evaluate(() => {
    return {
      domSize: document.querySelectorAll('*').length,
      hasContent: document.body?.innerText?.length > 200,
      hasSections: document.querySelectorAll('section, [class*="section"], [class*="panel"], [class*="card"]').length,
    };
  });
  record('Case overview', status >= 200 && status < 400, `HTTP ${status}, DOM=${overview.domSize}, sections=${overview.hasSections}`);
  await page.screenshot({ path: path.join(OUT, '04-case-overview.png'), fullPage: false });
} catch (e) {
  record('Case overview', false, e.message.slice(0, 120));
}

// ═══════════════════════════════════════════════════════════════
// TEST 5: Case board (with particle overlay)
// ═══════════════════════════════════════════════════════════════
try {
  const resp = await page.goto(`${BASE}/cases/test-id/board`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(4000);
  const status = resp?.status() ?? 0;

  const board = await page.evaluate(() => {
    return {
      hasCanvas: document.querySelectorAll('canvas, [class*="canvas"], [class*="board"]').length,
      hasParticles: document.querySelectorAll('[class*="particle"], [class*="gpu-badge"]').length > 0,
      hasCRT: document.querySelectorAll('[class*="crt"], [class*="scanline"]').length > 0,
      hasToolbar: document.querySelectorAll('[class*="toolbar"], [class*="tool-btn"]').length,
      domSize: document.querySelectorAll('*').length,
    };
  });
  record('Evidence board', status >= 200 && status < 400,
    `canvas=${board.hasCanvas}, particles=${board.hasParticles}, crt=${board.hasCRT}, toolbar=${board.hasToolbar}`);
  await page.screenshot({ path: path.join(OUT, '05-case-board.png'), fullPage: false });
} catch (e) {
  record('Evidence board', false, e.message.slice(0, 120));
}

// ═══════════════════════════════════════════════════════════════
// TEST 6: Cases new page (create form)
// ═══════════════════════════════════════════════════════════════
try {
  const resp = await page.goto(`${BASE}/cases/new`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  const status = resp?.status() ?? 0;

  const form = await page.evaluate(() => {
    return {
      inputs: document.querySelectorAll('input, textarea, select').length,
      buttons: document.querySelectorAll('button[type="submit"], button:has-text("Create"), button:has-text("Save")').length,
      hasForm: document.querySelectorAll('form').length,
    };
  });
  record('New case form', status >= 200 && status < 400, `HTTP ${status}, inputs=${form.inputs}, forms=${form.hasForm}`);
  await page.screenshot({ path: path.join(OUT, '06-cases-new.png'), fullPage: false });
} catch (e) {
  record('New case form', false, e.message.slice(0, 120));
}

// ═══════════════════════════════════════════════════════════════
// TEST 7: Dashboard (case stats)
// ═══════════════════════════════════════════════════════════════
try {
  const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  const status = resp?.status() ?? 0;
  record('Dashboard loads', status >= 200 && status < 400, `HTTP ${status}`);
  await page.screenshot({ path: path.join(OUT, '07-dashboard.png'), fullPage: false });
} catch (e) {
  record('Dashboard', false, e.message.slice(0, 120));
}

// ── Summary ─────────────────────────────────────────────────────
await browser.close();

console.log('\n  ╔══════════════════════════════════════════════╗');
console.log('  ║   Results                                     ║');
console.log('  ╚══════════════════════════════════════════════╝\n');

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
results.forEach(r => {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`);
  if (r.detail) console.log(`      ${r.detail}`);
});
console.log(`\n  ${passed}/${results.length} passed, ${failed} failed`);
console.log(`  Screenshots: ${OUT}\n`);

await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify({ results, passed, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
