import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const BASE = 'http://127.0.0.1:5173';
const OUT = 'C:/Users/james/Videos/deeds-web-app/scripts/tests/screenshots/feedback-ux';

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const apiResults = {};
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

async function shot(name, fn) {
  await fn();
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
  console.log(`✓ ${name}`);
}

async function fullShot(name, fn) {
  await fn();
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
  console.log(`✓ ${name} (full page)`);
}

// 1 — Dashboard baseline
await shot('01-dashboard', async () => {
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
});

// 2 — Evidence page
await shot('02-evidence', async () => {
  await page.goto(BASE + '/evidence', { waitUntil: 'networkidle', timeout: 30000 });
});

// 3 — Search Intelligence: default (hot queries tab) 
await shot('03-search-intel-hot-queries', async () => {
  await page.goto(BASE + '/admin/search-intelligence', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
});

// 4 — Search Intelligence: full page
await fullShot('04-search-intel-full', async () => {
  // already on that page
});

// 5 — Research tab — click it
await shot('05-research-tab-loading', async () => {
  await page.locator('button:has-text("Research")').first().click().catch(() =>
    page.locator('[class*="s-tab"]:has-text("Research")').first().click()
  );
  await page.waitForTimeout(1200);
});

// 6 — Research tab with domain seeds loaded (pass good params via URL)
await shot('06-research-with-seeds', async () => {
  await page.goto(
    BASE + '/admin/search-intelligence',
    { waitUntil: 'networkidle', timeout: 30000 }
  );
  // click Research tab
  await page.locator('button:has-text("Research")').first().click().catch(() => {});
  await page.waitForTimeout(2000);
});

// 7 — API tests
apiResults.feedbackPost = await page.evaluate(async () => {
  const r = await fetch('/api/analytics/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queryHash: 'test-abc123', rating: 'up', pipeline: 'rag', chunkIds: [] })
  });
  return { status: r.status, body: await r.json() };
});

apiResults.feedbackGet = await page.evaluate(async () => {
  const r = await fetch('/api/analytics/feedback?hash=test-abc123');
  return { status: r.status, body: await r.json() };
});

apiResults.searchPatterns = await page.evaluate(async () => {
  const r = await fetch('/api/analytics/search-patterns?days=7&temperature=0.5');
  return { status: r.status, keys: Object.keys(await r.json()) };
});

apiResults.researchTopics = await page.evaluate(async () => {
  const r = await fetch('/api/analytics/research-topics?pipeline=codebase&limit=5&domains=typescript,sveltekit');
  const body = await r.json();
  return { status: r.status, seedCount: body.seedTopics?.length ?? 0, topicCount: body.topics?.length ?? 0, firstSeed: body.seedTopics?.[0]?.slice(0, 80) };
});

apiResults.researchRebuild = await page.evaluate(async () => {
  const r = await fetch('/api/analytics/research-topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rebuild' })
  });
  return { status: r.status, body: await r.json() };
});

// 8 — Research tab full-page after seeds loaded
await fullShot('07-research-tab-full', async () => {
  await page.goto(
    BASE + '/admin/search-intelligence',
    { waitUntil: 'networkidle', timeout: 30000 }
  );
  await page.locator('button:has-text("Research")').first().click().catch(() => {});
  await page.waitForTimeout(2500);
});

// 9 — Cases list
await shot('08-cases', async () => {
  await page.goto(BASE + '/cases', { waitUntil: 'networkidle', timeout: 30000 });
});

// 10 — Admin AI dashboard 
await shot('09-ai-dashboard', async () => {
  await page.goto(BASE + '/admin/ai-dashboard', { waitUntil: 'networkidle', timeout: 30000 });
});

await browser.close();

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════');
console.log('  ANALYTICS PIPELINE — API TEST RESULTS');
console.log('════════════════════════════════════════════════');

const fb = apiResults.feedbackPost;
console.log(`\n📊 POST /api/analytics/feedback`);
console.log(`   status:  ${fb.status} ${fb.status === 200 ? '✅' : '❌'}`);
console.log(`   ok:      ${fb.body?.ok}`);
console.log(`   counts:  up=${fb.body?.counts?.up} down=${fb.body?.counts?.down}`);
console.log(`   rating:  ${fb.body?.rating}`);

const fbg = apiResults.feedbackGet;
console.log(`\n📊 GET /api/analytics/feedback?hash=test-abc123`);
console.log(`   status:  ${fbg.status} ${fbg.status === 200 ? '✅' : '❌'}`);
console.log(`   up:      ${fbg.body?.up}  down: ${fbg.body?.down}`);
console.log(`   userRating: ${fbg.body?.userRating}`);

const sp = apiResults.searchPatterns;
console.log(`\n📊 GET /api/analytics/search-patterns?days=7`);
console.log(`   status:  ${sp.status} ${sp.status === 200 ? '✅' : '❌'}`);
console.log(`   fields:  ${sp.keys?.join(', ')}`);

const rt = apiResults.researchTopics;
console.log(`\n📊 GET /api/analytics/research-topics?pipeline=codebase&domains=typescript,sveltekit`);
console.log(`   status:     ${rt.status} ${rt.status === 200 ? '✅' : '❌'}`);
console.log(`   seedTopics: ${rt.seedCount} ${rt.seedCount > 0 ? '✅' : '⚠️  (empty)'}`);
console.log(`   topics:     ${rt.topicCount} (${rt.topicCount === 0 ? 'no qlora examples yet' : 'from index'})`);
console.log(`   firstSeed:  "${rt.firstSeed}..."`);

const rb = apiResults.researchRebuild;
console.log(`\n📊 POST /api/analytics/research-topics {action:'rebuild'}`);
console.log(`   status:  ${rb.status} ${rb.status === 200 ? '✅' : '❌'}`);
console.log(`   success: ${rb.body?.success}`);

if (consoleErrors.length) {
  console.log(`\n⚠️  Console errors (${consoleErrors.length}):`);
  [...new Set(consoleErrors)].slice(0, 5).forEach(e => console.log('  ', e.slice(0, 120)));
}

console.log('\n════════════════════════════════════════════════');
console.log('Screenshots:', OUT);
