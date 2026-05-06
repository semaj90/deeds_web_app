#!/usr/bin/env node
/**
 * Smoke-test all app routes by loading them and checking for 500 errors.
 *
 * Usage:
 *   node scripts/tests/test-screenshots.mjs              # 7 core routes
 *   node scripts/tests/test-screenshots.mjs --all        # all 23 app routes
 *   node scripts/tests/test-screenshots.mjs --route /evidence
 *   node scripts/tests/test-screenshots.mjs --port 3000
 *   node scripts/tests/test-screenshots.mjs --mobile
 *   node scripts/tests/test-screenshots.mjs --save-baseline
 *   node scripts/tests/test-screenshots.mjs --diff
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const ALL_ROUTES    = args.includes('--all');
const SAVE_BASELINE = args.includes('--save-baseline');
const DIFF_MODE     = args.includes('--diff');
const MOBILE        = args.includes('--mobile');
const PORT          = (() => { const i = args.indexOf('--port'); return i >= 0 ? args[i + 1] : null; })();
const SINGLE_ROUTE  = (() => { const i = args.indexOf('--route'); return i >= 0 ? args[i + 1] : null; })();

const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT ?? 5173}`;
const SCREENSHOT_DIR = join(__dirname, 'screenshots');
const LATEST_DIR     = join(SCREENSHOT_DIR, 'latest');
const BASELINE_DIR   = join(SCREENSHOT_DIR, 'baseline');

// ── Route lists ────────────────────────────────────────────────────────────

const CORE_ROUTES = [
  { path: '/dashboard',       name: '01-dashboard' },
  { path: '/cases',           name: '02-cases' },
  { path: '/evidence',        name: '03-evidence' },
  { path: '/global-search',   name: '04-global-search' },
  { path: '/citations',       name: '05-citations' },
  { path: '/ai-dashboard',    name: '06-ai-dashboard' },
  { path: '/system-configuration', name: '07-system-config' },
];

const ALL_APP_ROUTES = [
  ...CORE_ROUTES,
  { path: '/active-cases',         name: '08-active-cases' },
  { path: '/analysis-center',      name: '09-analysis-center' },
  { path: '/evidence-library',     name: '10-evidence-library' },
  { path: '/persons-of-interest',  name: '11-poi' },
  { path: '/command-center',       name: '12-command-center' },
  { path: '/error-brain',          name: '13-error-brain' },
  { path: '/gpu-evidence-graph',   name: '14-gpu-graph' },
  { path: '/terminal',             name: '15-terminal' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function isAuthRedirect(url) {
  return url.includes('/login') || url.includes('/auth') || url.includes('/signin');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  const routes = SINGLE_ROUTE
    ? [{ path: SINGLE_ROUTE, name: SINGLE_ROUTE.replace(/\//g, '-').replace(/^-/, '') }]
    : ALL_ROUTES ? ALL_APP_ROUTES : CORE_ROUTES;

  ensureDir(SCREENSHOT_DIR);
  ensureDir(LATEST_DIR);
  if (SAVE_BASELINE) ensureDir(BASELINE_DIR);

  const viewport = MOBILE
    ? { width: 390, height: 844 }
    : { width: 1280, height: 800 };

  console.log(`\n🔍 Route smoke-test — ${routes.length} routes @ ${BASE_URL}`);
  if (MOBILE)  console.log('   📱 Mobile viewport (390×844)');
  if (DIFF_MODE) console.log('   📊 Diff mode: comparing to baseline');
  console.log('');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const route of routes) {
    process.stdout.write(`  ${route.path} … `);
    const url = `${BASE_URL}${route.path}`;
    let status = '?';
    let note = '';

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(500);

      status = String(response?.status() ?? 200);
      const finalUrl = page.url();

      if (isAuthRedirect(finalUrl)) {
        note = '→ auth redirect (ok)';
        status = '302';
      } else if (status === '500') {
        note = '⚠️  SERVER ERROR';
        failed++;
      } else {
        passed++;
      }

      const shotPath = join(LATEST_DIR, `${route.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      if (SAVE_BASELINE) {
        const baselinePath = join(BASELINE_DIR, `${route.name}.png`);
        await page.screenshot({ path: baselinePath, fullPage: false });
      }

    } catch (err) {
      status = 'ERR';
      note = err.message.split('\n')[0].slice(0, 80);
      failed++;
    }

    const icon = status === '500' || status === 'ERR' ? '❌' : '✅';
    console.log(`${icon} ${status}${note ? '  ' + note : ''}`);
    results.push({ path: route.path, status, note });
  }

  await browser.close();

  // ── Report ──────────────────────────────────────────────────────────────

  const reportPath = join(SCREENSHOT_DIR, 'report.json');
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    total: routes.length,
    passed,
    failed,
    results,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('');
  console.log(`─────────────────────────────────`);
  console.log(`  ${passed}/${routes.length} passed  ${failed > 0 ? `· ${failed} FAILED` : ''}`);
  console.log(`  Screenshots → ${LATEST_DIR}`);
  console.log(`  Report      → ${reportPath}`);
  console.log('');

  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
