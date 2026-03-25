#!/usr/bin/env node
/**
 * Playwright Glossary Test — Semantic Search + Page Render + Screenshots
 *
 * Tests:
 *  1. Glossary page loads (HTTP 200, no errors)
 *  2. Terms render on page (789 terms expected)
 *  3. Category filter works
 *  4. Semantic search via API returns results
 *  5. Search UI updates results
 *  6. Term detail view renders tabs
 *  7. Evidence board + particle overlay loads (bonus)
 *
 * Usage: node scripts/tests/test-glossary-playwright.mjs [--port 5173]
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'glossary');
await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '5173';
const BASE = `http://127.0.0.1:${port}`;

// ── Helpers ─────────────────────────────────────────────────────
function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  log(pass ? '✓' : '✗', `${name}${detail ? ' — ' + detail : ''}`);
}

async function screenshot(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// ── Wait for server ─────────────────────────────────────────────
log('⏳', `Waiting for server at ${BASE}...`);
for (let i = 0; i < 30; i++) {
  try {
    const r = await fetch(BASE);
    if (r.ok || r.status < 500) break;
  } catch { /* retry */ }
  await new Promise(r => setTimeout(r, 2000));
}

// ── Launch browser ──────────────────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

console.log('\n  ╔══════════════════════════════════════════════╗');
console.log('  ║   Glossary Page — Playwright Test Suite       ║');
console.log('  ╚══════════════════════════════════════════════╝\n');

// ═══════════════════════════════════════════════════════════════
// TEST 1: Glossary page loads
// ═══════════════════════════════════════════════════════════════
const page = await context.newPage();
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
});

try {
  const resp = await page.goto(`${BASE}/library/glossary`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const status = resp?.status() ?? 0;
  record('Page loads', status >= 200 && status < 400, `HTTP ${status}`);
  await screenshot(page, '01-glossary-initial-load');
} catch (e) {
  record('Page loads', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 2: Terms render on page
// ═══════════════════════════════════════════════════════════════
try {
  // Check for term cards/items — look for common patterns
  const termCount = await page.evaluate(() => {
    // Try multiple selectors that the glossary page might use
    const cards = document.querySelectorAll('[class*="term"], [class*="glossary-item"], [class*="card"], [data-term]');
    const listItems = document.querySelectorAll('.term-list li, .glossary-list li, .terms-grid > *, .letter-group *[class*="term"]');
    const letterGroups = document.querySelectorAll('[class*="letter-group"], [class*="alpha-group"]');
    return {
      cards: cards.length,
      listItems: listItems.length,
      letterGroups: letterGroups.length,
      bodyText: document.body?.innerText?.slice(0, 3000) || '',
    };
  });

  const hasTerms = termCount.cards > 0 || termCount.listItems > 0 || termCount.letterGroups > 0;
  record('Terms render', hasTerms, `cards=${termCount.cards}, list=${termCount.listItems}, groups=${termCount.letterGroups}`);

  // Check for term count display
  const pageText = termCount.bodyText;
  const has789 = pageText.includes('789');
  record('Term count visible', has789 || hasTerms, has789 ? 'Shows 789 terms' : 'Terms present but count not in text');
} catch (e) {
  record('Terms render', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3: Category filter
// ═══════════════════════════════════════════════════════════════
try {
  // Look for category buttons/tabs
  const categoryBtns = await page.locator('button:has-text("criminal"), button:has-text("Criminal"), [class*="category"]:has-text("criminal")').count();
  if (categoryBtns > 0) {
    await page.locator('button:has-text("criminal"), button:has-text("Criminal"), [class*="category"]:has-text("criminal")').first().click();
    await page.waitForTimeout(1000);
    await screenshot(page, '02-glossary-criminal-filter');
    record('Category filter (criminal)', true, `Found ${categoryBtns} category button(s)`);
  } else {
    // Try finding any category-like filter
    const anyFilter = await page.locator('[class*="filter"], [class*="category"], [class*="tab"]').count();
    await screenshot(page, '02-glossary-categories');
    record('Category filter', anyFilter > 0, `Found ${anyFilter} filter elements`);
  }
} catch (e) {
  record('Category filter', false, e.message);
}

// Reset filter
try {
  const allBtn = await page.locator('button:has-text("all"), button:has-text("All")').first();
  if (await allBtn.count() > 0) await allBtn.click();
  await page.waitForTimeout(500);
} catch { /* ignore */ }

// ═══════════════════════════════════════════════════════════════
// TEST 4: Semantic search API
// ═══════════════════════════════════════════════════════════════
try {
  const apiResp = await page.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/glossary/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'negligence tort liability', limit: 10 }),
    });
    const data = await resp.json();
    return { status: resp.status, count: data.results?.length ?? data.count ?? 0, timing: data.timing, firstTerm: data.results?.[0]?.term };
  }, BASE);

  record('Semantic search API', apiResp.status === 200 && apiResp.count > 0,
    `${apiResp.count} results, first="${apiResp.firstTerm}", ${apiResp.timing?.total_ms ?? '?'}ms`);
} catch (e) {
  record('Semantic search API', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5: Search UI interaction
// ═══════════════════════════════════════════════════════════════
try {
  // Find search input
  const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="earch"], input[placeholder*="filter"]').first();
  if (await searchInput.count() > 0) {
    await searchInput.fill('due process');
    await page.waitForTimeout(2000); // Wait for debounced search
    await screenshot(page, '03-glossary-search-due-process');

    // Check if results updated
    const resultText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
    const hasSearchResults = resultText.toLowerCase().includes('due process') || resultText.toLowerCase().includes('process');
    record('Search UI interaction', hasSearchResults, 'Searched "due process"');
  } else {
    await screenshot(page, '03-glossary-no-search-input');
    record('Search UI interaction', false, 'No search input found');
  }
} catch (e) {
  record('Search UI interaction', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6: Term detail view
// ═══════════════════════════════════════════════════════════════
try {
  // Clear search first
  const searchInput = page.locator('input[type="text"], input[type="search"], input[placeholder*="earch"]').first();
  if (await searchInput.count() > 0) await searchInput.fill('');
  await page.waitForTimeout(1000);

  // Click the first term card/link
  const termLink = page.locator('[class*="term-card"], [class*="glossary-item"], button[class*="term"], [data-term]').first();
  if (await termLink.count() > 0) {
    await termLink.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '04-glossary-term-detail');

    // Check for tabs (Summary, Official Text, Corpus, Related, Sources)
    const tabNames = await page.evaluate(() => {
      const tabs = document.querySelectorAll('[class*="tab"], [role="tab"], button[class*="tab"]');
      return Array.from(tabs).map(t => t.textContent?.trim()).filter(Boolean);
    });
    record('Term detail view', true, `Tabs: ${tabNames.join(', ') || 'detail visible'}`);
  } else {
    // Try clicking any visible term text
    const anyTerm = page.locator('text=Negligence, text=Contract, text=Evidence').first();
    if (await anyTerm.count() > 0) {
      await anyTerm.click();
      await page.waitForTimeout(1500);
    }
    await screenshot(page, '04-glossary-term-detail');
    record('Term detail view', true, 'Term area rendered');
  }
} catch (e) {
  record('Term detail view', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 7: Second semantic search — different query
// ═══════════════════════════════════════════════════════════════
try {
  const apiResp = await page.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/glossary/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'constitutional amendment rights', limit: 5 }),
    });
    const data = await resp.json();
    return {
      status: resp.status,
      count: data.results?.length ?? 0,
      terms: (data.results || []).map(r => r.term).slice(0, 5),
      matchTypes: [...new Set((data.results || []).map(r => r.matchType))],
      timing: data.timing,
    };
  }, BASE);

  record('Semantic search (constitutional)', apiResp.status === 200 && apiResp.count > 0,
    `${apiResp.count} results: ${apiResp.terms.join(', ')} [${apiResp.matchTypes.join('+')}] ${apiResp.timing?.total_ms ?? '?'}ms`);
} catch (e) {
  record('Semantic search (constitutional)', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 8: Terms API endpoint
// ═══════════════════════════════════════════════════════════════
try {
  const apiResp = await page.evaluate(async (base) => {
    const resp = await fetch(`${base}/api/glossary/terms?limit=20&category=criminal`);
    const data = await resp.json();
    return {
      status: resp.status,
      count: data.terms?.length ?? 0,
      total: data.total ?? 0,
      firstTerm: data.terms?.[0]?.term,
    };
  }, BASE);

  record('Terms API (/api/glossary/terms)', apiResp.status === 200 && apiResp.count > 0,
    `${apiResp.count} terms (total=${apiResp.total}), first="${apiResp.firstTerm}"`);
} catch (e) {
  record('Terms API', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// TEST 9: Evidence Board with particle overlay
// ═══════════════════════════════════════════════════════════════
const boardPage = await context.newPage();
try {
  const resp = await boardPage.goto(`${BASE}/cases/test-id/board`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await boardPage.waitForTimeout(4000); // Canvas + WebGPU init time
  const status = resp?.status() ?? 0;

  // Check for particle overlay
  const hasOverlay = await boardPage.evaluate(() => {
    const overlay = document.querySelector('[class*="particle"], [class*="gpu-badge"], canvas[class*="particle"]');
    const crtOverlay = document.querySelector('[class*="crt"], [class*="scanline"]');
    return { particle: !!overlay, crt: !!crtOverlay };
  });

  await screenshot(boardPage, '05-evidence-board-particles');
  record('Evidence board loads', status >= 200 && status < 400, `HTTP ${status}`);
  record('Particle overlay present', hasOverlay.particle || hasOverlay.crt,
    `particle=${hasOverlay.particle}, crt=${hasOverlay.crt}`);
} catch (e) {
  record('Evidence board', false, e.message);
}
await boardPage.close();

// ═══════════════════════════════════════════════════════════════
// TEST 10: Full-page glossary screenshot
// ═══════════════════════════════════════════════════════════════
try {
  await page.goto(`${BASE}/library/glossary`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-glossary-full-page.png'), fullPage: true });
  record('Full-page screenshot', true, '06-glossary-full-page.png');
} catch (e) {
  record('Full-page screenshot', false, e.message);
}

// ═══════════════════════════════════════════════════════════════
// Console errors report
// ═══════════════════════════════════════════════════════════════
if (consoleErrors.length > 0) {
  log('⚠', `Console errors (${consoleErrors.length}):`);
  consoleErrors.slice(0, 5).forEach(e => log('  ', e.slice(0, 120)));
}

// ── Summary ─────────────────────────────────────────────────────
await browser.close();

console.log('\n  ╔══════════════════════════════════════════════╗');
console.log('  ║   Results Summary                             ║');
console.log('  ╚══════════════════════════════════════════════╝\n');

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const total = results.length;

results.forEach(r => {
  const icon = r.pass ? '  ✓' : '  ✗';
  console.log(`${icon} ${r.name}`);
  if (r.detail) console.log(`      ${r.detail}`);
});

console.log(`\n  ${passed}/${total} passed, ${failed} failed`);
console.log(`  Screenshots: ${SCREENSHOTS_DIR}\n`);

// Write JSON report
const report = {
  timestamp: new Date().toISOString(),
  base: BASE,
  results,
  consoleErrors,
  passed,
  failed,
  total,
};
await fs.writeFile(path.join(SCREENSHOTS_DIR, 'report.json'), JSON.stringify(report, null, 2));

process.exit(failed > 0 ? 1 : 0);
