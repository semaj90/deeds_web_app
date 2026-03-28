#!/usr/bin/env node
/**
 * Visual regression / 500-error screenshot tester
 * Usage:  node scripts/tests/test-screenshots.mjs [--all] [--route /evidence]
 *
 * --all          Test every known app route (default: quick list)
 * --route <path> Test a single route
 * --port <n>     Dev server port (default: 5173)
 * --concurrency <n> Parallel pages per batch (default: 3 with --all, 1 otherwise)
 * --html         Generate HTML gallery report (auto-enabled with --all)
 *
 * Captures: screenshot, HTTP status, console errors, failed network requests,
 *           performance metrics (load time, DOM size, resource count)
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// ── Route definitions ──────────────────────────────────────────────
const QUICK_ROUTES = [
  { name: 'evidence', path: '/evidence' },
  { name: 'persons-of-interest', path: '/persons-of-interest' },
  { name: 'cases-overview', path: '/cases/test-id/overview' },
  { name: 'cases-board', path: '/cases/test-id/board' },
  { name: 'cases-list', path: '/cases' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'citations', path: '/citations' },
];

const ALL_ROUTES = [
  ...QUICK_ROUTES,
  { name: 'evidence-upload', path: '/cases/test-id/evidence/upload' },
  { name: 'active-cases', path: '/active-cases' },
  { name: 'analysis-center', path: '/analysis-center' },
  { name: 'command-center', path: '/command-center' },
  { name: 'evidence-library', path: '/evidence-library' },
  { name: 'global-search', path: '/global-search' },
  { name: 'admin-dev-tools', path: '/admin/dev-tools' },
  { name: 'admin-knowledge-search', path: '/admin/knowledge-search' },
  { name: 'admin-codebase-viewer', path: '/admin/codebase-viewer' },
  { name: 'system-configuration', path: '/system-configuration' },
  { name: 'terminal', path: '/terminal' },
  { name: 'admin-cache', path: '/admin/cache' },
  { name: 'analytics', path: '/analytics' },
  // ── Expanded routes (session 101+) ──
  { name: 'cases-new', path: '/cases/new' },
  { name: 'cases-detail', path: '/cases/test-id' },
  { name: 'cases-ai', path: '/cases/test-id/ai' },
  { name: 'cases-chat', path: '/cases/test-id/chat' },
  { name: 'cases-notes', path: '/cases/test-id/notes' },
  { name: 'cases-persons', path: '/cases/test-id/persons' },
  { name: 'cases-reports', path: '/cases/test-id/reports' },
  { name: 'cases-canvas', path: '/cases/test-id/canvas' },
  { name: 'poi-create', path: '/persons-of-interest/create' },
  { name: 'reports', path: '/reports' },
  { name: 'reports-new', path: '/reports/new' },
  { name: 'recommendations', path: '/recommendations' },
  { name: 'evidence-analyze', path: '/evidence/analyze' },
  { name: 'evidence-manage', path: '/evidence/manage' },
  { name: 'evidence-upload-direct', path: '/evidence/upload' },
  { name: 'admin-ai-dashboard', path: '/admin/ai-dashboard' },
  { name: 'admin-all-routes', path: '/admin/all-routes' },
  { name: 'admin-error-brain', path: '/admin/error-brain' },
  { name: 'admin-phase89', path: '/admin/phase89' },
  { name: 'admin-component-analysis', path: '/admin/component-analysis' },
  { name: 'demos-index', path: '/demos' },
  { name: 'demos-keyboard-shortcuts', path: '/demos/keyboard-shortcuts' },
  { name: 'demos-icons', path: '/demos/icons' },
  { name: 'demos-memory-palace', path: '/demos/memory-palace' },
  { name: 'demos-vector-search', path: '/demos/vector-search' },
  { name: 'demos-courtroom-sim', path: '/demos/courtroom-sim' },
  { name: 'simulation', path: '/simulation' },
  { name: 'fictional-cases', path: '/fictional-cases' },
  { name: 'legal-corpus', path: '/legal-corpus' },
  { name: 'glossary', path: '/library/glossary' },
];

// SSE / long-poll pages that never reach networkidle
const SSE_PAGES = new Set([
  'cases-overview',
  'dashboard',
  'command-center',
  'cases-chat',
  'admin-all-routes',
  'admin-phase89',
  'admin-component-analysis',
  'admin-error-brain',
]);

// CSR-only pages (ssr = false) need extra wait for client JS to render
const CSR_PAGES = new Set([
  'evidence-library', 'evidence', 'terminal',
  'admin-ai-dashboard', 'admin-error-brain',
  'cases-canvas', 'cases-reports', 'evidence-analyze',
]);

// Pages with complex canvas/WebGL rendering need extra initialization time
const CANVAS_PAGES = new Set(['cases-board', 'cases-canvas', 'demos-memory-palace']);

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '5173';
const baseUrlArg = args.includes('--base-url') ? args[args.indexOf('--base-url') + 1] : null;
const envBaseUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || null;
const defaultBaseUrl = `http://127.0.0.1:${port}`;
const BASE = (baseUrlArg || envBaseUrl || defaultBaseUrl).replace(/\/$/, '');
const useAll = args.includes('--all');
const singleRoute = args.includes('--route') ? args[args.indexOf('--route') + 1] : null;
const generateHtml = args.includes('--html') || useAll;
const concurrency = args.includes('--concurrency')
  ? parseInt(args[args.indexOf('--concurrency') + 1], 10)
  : useAll
    ? 3
    : 1;

async function waitForServerReady(baseUrl, timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError = 'unknown';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: { Accept: 'text/html' },
      });

      if (response.ok || response.status < 500) {
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`Dev server not ready at ${baseUrl} within ${timeoutMs}ms (${lastError})`);
}

async function settlePage(page, routeName, waitMode = 'domcontentloaded') {
  if (waitMode === 'domcontentloaded') await page.waitForTimeout(2000);
  if (CSR_PAGES.has(routeName)) await page.waitForTimeout(3000);
  if (CANVAS_PAGES.has(routeName)) await page.waitForTimeout(2000);
}

let routes;
if (singleRoute) {
  // Normalize route path (handle Git Bash MSYS path conversion)
  const normalizedPath = singleRoute.startsWith('/') ? singleRoute : '/' + singleRoute;
  const name = normalizedPath.replace(/^\//, '').replace(/\//g, '-') || 'home';
  routes = [{ name, path: normalizedPath }];
} else {
  routes = useAll ? ALL_ROUTES : QUICK_ROUTES;
}

// ── Main ───────────────────────────────────────────────────────────
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(SCREENSHOTS_DIR, timestamp);
await fs.mkdir(outDir, { recursive: true });

const startTime = Date.now();
console.log(`  Base URL: ${BASE}`);
console.log('  Waiting for dev server...');
await waitForServerReady(BASE);
console.log(`\n  Screenshot Test — ${new Date().toLocaleString()}`);
console.log(`  Routes: ${routes.length} | Concurrency: ${concurrency} | Output: ${outDir}\n`);

const browser = await chromium.launch();

// ── Test a single route (reusable) ──────────────────────────────────
async function testRoute(route, ctx) {
  const url = `${BASE}${route.path}`;
  const tab = await ctx.newPage();
  const result = {
    name: route.name,
    path: route.path,
    url,
    status: 0,
    ok: false,
    error: null,
    file: null,
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    loadTimeMs: 0,
    domElements: 0,
    resourceCount: 0,
    resourceSizeKB: 0,
  };

  tab.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico') && !text.includes('net::ERR_')) {
        result.consoleErrors.push(text.slice(0, 200));
      }
    } else if (msg.type() === 'warning') {
      result.consoleWarnings.push(msg.text().slice(0, 200));
    }
  });

  function isIgnorableFailedRequest(req) {
    const reqUrl = req.url();
    const failure = req.failure()?.errorText || '';

    if (reqUrl.includes('favicon') || reqUrl.includes('__vite') || reqUrl.includes('ws:')) {
      return true;
    }

    // SvelteKit can abort stale __data.json loads during invalidation or route churn.
    if (failure === 'net::ERR_ABORTED' && reqUrl.includes('/__data.json')) {
      return true;
    }

    return false;
  }

  tab.on('requestfailed', (req) => {
    if (isIgnorableFailedRequest(req)) return;
    const reqUrl = req.url();
    result.failedRequests.push({
      url: reqUrl.slice(0, 150),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    });
  });

  let resourceCount = 0;
  let resourceSize = 0;
  tab.on('response', (res) => {
    resourceCount++;
    const len = parseInt(res.headers()['content-length'] || '0', 10);
    if (len > 0) resourceSize += len;
  });

  const loadStart = Date.now();

  try {
    const isSSE = route.sse || SSE_PAGES.has(route.name);
    const waitUntil = isSSE ? 'domcontentloaded' : 'networkidle';
    const pageTimeout = isSSE ? 35000 : CSR_PAGES.has(route.name) ? 20000 : 15000;
    const response = await tab.goto(url, { waitUntil, timeout: pageTimeout });

    await settlePage(tab, route.name, waitUntil);

    result.loadTimeMs = Date.now() - loadStart;
    result.status = response?.status() ?? 0;
    result.ok = result.status >= 200 && result.status < 400;
    result.resourceCount = resourceCount;
    result.resourceSizeKB = Math.round(resourceSize / 1024);
    result.domElements = await tab
      .evaluate(() => document.querySelectorAll('*').length)
      .catch(() => 0);

    let errorPageCount = await tab
      .locator('.error-page')
      .count()
      .catch(() => 0);
    let viteErrorCount = await tab
      .locator('vite-error-overlay')
      .count()
      .catch(() => 0);
    let has504Text = await tab
      .evaluate(
        () =>
          document.body?.innerText?.includes('504 Gateway') ||
          document.body?.innerText?.includes('Outdated Optimize Dep')
      )
      .catch(() => false);

    const MAX_RETRIES = 3;
    for (
      let retry = 0;
      retry < MAX_RETRIES && (errorPageCount > 0 || viteErrorCount > 0 || has504Text);
      retry++
    ) {
      const backoff = 2000 + retry * 1500;
      await new Promise((r) => setTimeout(r, backoff));
      const retryWait = isSSE ? 'domcontentloaded' : 'networkidle';
      try {
        const retryRes = await tab.goto(url, { waitUntil: retryWait, timeout: 20000 });
        await settlePage(tab, route.name, retryWait);
        result.status = retryRes?.status() ?? result.status;
        result.ok = result.status >= 200 && result.status < 400;
        result.domElements = await tab
          .evaluate(() => document.querySelectorAll('*').length)
          .catch(() => 0);
        errorPageCount = await tab
          .locator('.error-page')
          .count()
          .catch(() => 0);
        viteErrorCount = await tab
          .locator('vite-error-overlay')
          .count()
          .catch(() => 0);
        has504Text = await tab
          .evaluate(
            () =>
              document.body?.innerText?.includes('504 Gateway') ||
              document.body?.innerText?.includes('Outdated Optimize Dep')
          )
          .catch(() => false);
      } catch {
        /* keep original error detection */
      }
    }

    if (errorPageCount > 0 || viteErrorCount > 0 || has504Text) {
      result.ok = false;
      result.error = has504Text
        ? 'Vite 504 Outdated Optimize Dep'
        : errorPageCount > 0
          ? 'SvelteKit error page rendered'
          : 'Vite error overlay detected';
    }

    const filename = `${route.name}.png`;
    const filepath = path.join(outDir, filename);
    await tab.screenshot({ path: filepath, fullPage: true });
    result.file = filepath;
  } catch (err) {
    const errMsg = err.message.split('\n')[0];
    if (
      errMsg.includes('ERR_CONNECTION_REFUSED') ||
      errMsg.includes('ERR_CONNECTION_RESET') ||
      errMsg.includes('Timeout')
    ) {
      // Server likely crashed — wait for it to come back (up to 45s)
      console.log(`    ⏳ Server down — waiting for recovery...`);
      try { await waitForServerReady(BASE, 45000); } catch { /* will fail on retry */ }
      try {
        const response2 = await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await settlePage(tab, route.name, 'domcontentloaded');
        result.loadTimeMs = Date.now() - loadStart;
        result.status = response2?.status() ?? 0;
        result.ok = result.status >= 200 && result.status < 400;
        result.resourceCount = resourceCount;
        result.domElements = await tab
          .evaluate(() => document.querySelectorAll('*').length)
          .catch(() => 0);
        const filepath = path.join(outDir, `${route.name}.png`);
        await tab.screenshot({ path: filepath, fullPage: true });
        result.file = filepath;
        result.error = null;
      } catch (retryErr) {
        result.loadTimeMs = Date.now() - loadStart;
        result.error = `retry failed: ${retryErr.message.split('\n')[0]}`;
        try {
          const filepath = path.join(outDir, `${route.name}-ERROR.png`);
          await tab.screenshot({ path: filepath, fullPage: true });
          result.file = filepath;
        } catch {
          /* ignore */
        }
      }
    } else {
      result.loadTimeMs = Date.now() - loadStart;
      result.error = errMsg;
      try {
        const filepath = path.join(outDir, `${route.name}-ERROR.png`);
        await tab.screenshot({ path: filepath, fullPage: true });
        result.file = filepath;
      } catch {
        /* ignore */
      }
    }
  }

  await tab.close();
  return result;
}

// ── Run routes in parallel batches ──────────────────────────────────
const results = [];

// Chunk routes into batches of `concurrency` size
for (let i = 0; i < routes.length; i += concurrency) {
  const batch = routes.slice(i, i + concurrency);
  // Fresh context per batch to limit memory accumulation (prevents OOM)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const batchResults = await Promise.allSettled(
    batch.map(route => testRoute(route, ctx))
  );

  // Health check between batches — if server crashed, wait for recovery
  const anyRefused = batchResults.some(r =>
    r.status === 'fulfilled' && r.value.error?.includes('ERR_CONNECTION_REFUSED')
  );
  if (anyRefused) {
    console.log(`    ⏳ Server crash detected — waiting for recovery before next batch...`);
    try { await waitForServerReady(BASE, 60000); } catch { console.log('    ⚠ Server did not recover'); }
    await new Promise(r => setTimeout(r, 3000)); // Extra settle time
  }

  for (const settled of batchResults) {
    const result = settled.status === 'fulfilled'
      ? settled.value
      : { name: '?', path: '?', url: '', status: 0, ok: false, error: settled.reason?.message ?? 'unknown', file: null, consoleErrors: [], consoleWarnings: [], failedRequests: [], loadTimeMs: 0, domElements: 0, resourceCount: 0, resourceSizeKB: 0 };

    const icon = result.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const metrics = `${result.loadTimeMs}ms | ${result.domElements} DOM | ${result.resourceCount} reqs`;
    const errCount = result.consoleErrors.length;
    const errTag = errCount > 0 ? ` | \x1b[33m${errCount} console err\x1b[0m` : '';
    const netFail = result.failedRequests.length;
    const netTag = netFail > 0 ? ` | \x1b[31m${netFail} net fail\x1b[0m` : '';
    console.log(`  [${icon}] ${result.status} ${result.name} — ${result.path} (${metrics}${errTag}${netTag})${result.error ? ` — ${result.error}` : ''}`);
    results.push(result);
  }

  await ctx.close();

  // Brief pause between batches to let Vite breathe
  if (i + concurrency < routes.length) {
    await new Promise(r => setTimeout(r, 500));
  }
}

await browser.close();

const totalTimeMs = Date.now() - startTime;

// ── Summary ────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
const totalConsoleErrors = results.reduce((sum, r) => sum + r.consoleErrors.length, 0);
const totalNetFails = results.reduce((sum, r) => sum + r.failedRequests.length, 0);
const avgLoadMs = Math.round(results.reduce((sum, r) => sum + r.loadTimeMs, 0) / results.length);
const slowest = results.reduce((max, r) => r.loadTimeMs > max.loadTimeMs ? r : max, results[0]);

console.log(`\n  ────────────────────────────────`);
console.log(`  Passed: ${passed}  Failed: ${failed}  Total: ${results.length}`);
console.log(`  Avg load: ${avgLoadMs}ms | Slowest: ${slowest.name} (${slowest.loadTimeMs}ms)`);
console.log(`  Console errors: ${totalConsoleErrors} | Network failures: ${totalNetFails}`);
console.log(`  Total time: ${(totalTimeMs / 1000).toFixed(1)}s`);

if (failed > 0) {
  console.log(`\n  Failed routes:`);
  results.filter(r => !r.ok).forEach(r => {
    console.log(`    - ${r.name} (${r.status}) ${r.error ?? ''}`);
  });
}

if (totalConsoleErrors > 0) {
  console.log(`\n  Console errors by route:`);
  results.filter(r => r.consoleErrors.length > 0).forEach(r => {
    console.log(`    ${r.name} (${r.consoleErrors.length}):`);
    r.consoleErrors.slice(0, 3).forEach(e => console.log(`      ${e.slice(0, 120)}`));
  });
}

console.log(`  Screenshots: ${outDir}`);

// Write JSON report (enhanced)
const report = {
  timestamp,
  base: BASE,
  totalTimeMs,
  results: results.map(r => ({
    ...r,
    // Make file paths relative for portability
    file: r.file ? path.basename(r.file) : null,
  })),
  summary: {
    passed,
    failed,
    total: results.length,
    avgLoadMs,
    slowestRoute: slowest.name,
    slowestLoadMs: slowest.loadTimeMs,
    totalConsoleErrors,
    totalNetworkFailures: totalNetFails,
  }
};
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

// ── HTML Gallery Report ────────────────────────────────────────────
if (generateHtml) {
  const htmlReport = generateHtmlReport(report, results);
  const htmlPath = path.join(outDir, 'report.html');
  await fs.writeFile(htmlPath, htmlReport);
  console.log(`  HTML Report: ${htmlPath}\n`);
}

// Also keep a "latest" symlink/copy for easy access
const latestDir = path.join(SCREENSHOTS_DIR, 'latest');
await fs.rm(latestDir, { recursive: true, force: true });
await fs.cp(outDir, latestDir, { recursive: true });

process.exit(failed > 0 ? 1 : 0);


// ── HTML Report Generator ──────────────────────────────────────────
function generateHtmlReport(report, results) {
  const passColor = '#22c55e';
  const failColor = '#ef4444';
  const warnColor = '#f59e0b';

  const cards = results.map(r => {
    const statusBg = r.ok ? passColor : failColor;
    const filename = r.file ? path.basename(r.file) : null;
    const errBadge = r.consoleErrors.length > 0
      ? `<span class="badge warn">${r.consoleErrors.length} console err</span>` : '';
    const netBadge = r.failedRequests.length > 0
      ? `<span class="badge fail">${r.failedRequests.length} net fail</span>` : '';
    const consoleDetails = r.consoleErrors.length > 0
      ? `<details class="errors"><summary>Console Errors (${r.consoleErrors.length})</summary><pre>${r.consoleErrors.map(e => escHtml(e)).join('\n')}</pre></details>` : '';
    const netDetails = r.failedRequests.length > 0
      ? `<details class="errors"><summary>Network Failures (${r.failedRequests.length})</summary><pre>${r.failedRequests.map(f => escHtml(`${f.method} ${f.url} — ${f.failure}`)).join('\n')}</pre></details>` : '';

    return `
    <div class="card ${r.ok ? '' : 'failed'}">
      <div class="card-header">
        <span class="status-dot" style="background:${statusBg}"></span>
        <span class="route-name">${escHtml(r.name)}</span>
        <span class="http-status">${r.status}</span>
        ${errBadge}${netBadge}
      </div>
      <div class="card-path">${escHtml(r.path)}</div>
      <div class="card-metrics">
        <span>${r.loadTimeMs}ms</span>
        <span>${r.domElements} DOM</span>
        <span>${r.resourceCount} reqs</span>
        <span>${r.resourceSizeKB} KB</span>
      </div>
      ${filename ? `<a href="${filename}" target="_blank"><img src="${filename}" alt="${escHtml(r.name)}" loading="lazy" /></a>` : '<div class="no-screenshot">No screenshot</div>'}
      ${r.error ? `<div class="error-msg">${escHtml(r.error)}</div>` : ''}
      ${consoleDetails}
      ${netDetails}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Screenshot Test Report — ${report.timestamp}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'JetBrains Mono', 'SF Mono', monospace; background: #0a0a0a; color: #e5e7eb; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.05em; color: #f9fafb; margin-bottom: 0.5rem; }
  .summary { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 2rem; padding: 1rem 1.25rem; background: #111; border: 1px solid #1f2937; border-radius: 0.75rem; }
  .summary-item { display: flex; flex-direction: column; gap: 0.125rem; }
  .summary-label { font-size: 0.65rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
  .summary-value { font-size: 1.25rem; font-weight: 700; }
  .summary-value.pass { color: ${passColor}; }
  .summary-value.fail { color: ${failColor}; }
  .summary-value.warn { color: ${warnColor}; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 1.25rem; }
  .card { background: #111; border: 1px solid #1f2937; border-radius: 0.75rem; overflow: hidden; transition: border-color 0.2s; }
  .card:hover { border-color: #374151; }
  .card.failed { border-color: ${failColor}40; }
  .card-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem 0.25rem; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .route-name { font-weight: 600; font-size: 0.875rem; color: #f9fafb; }
  .http-status { font-size: 0.75rem; color: #6b7280; margin-left: auto; }
  .card-path { font-size: 0.7rem; color: #4b5563; padding: 0 1rem 0.5rem; }
  .card-metrics { display: flex; gap: 0.75rem; padding: 0 1rem 0.75rem; font-size: 0.65rem; color: #6b7280; }
  .card img { width: 100%; height: auto; display: block; border-top: 1px solid #1f2937; cursor: pointer; }
  .card img:hover { opacity: 0.9; }
  .no-screenshot { padding: 2rem; text-align: center; color: #374151; font-size: 0.75rem; border-top: 1px solid #1f2937; }
  .error-msg { padding: 0.5rem 1rem; font-size: 0.7rem; color: ${failColor}; background: ${failColor}10; }
  .badge { font-size: 0.6rem; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-weight: 600; }
  .badge.warn { background: ${warnColor}20; color: ${warnColor}; }
  .badge.fail { background: ${failColor}20; color: ${failColor}; }
  .errors { padding: 0.5rem 1rem; border-top: 1px solid #1f2937; }
  .errors summary { font-size: 0.7rem; color: #9ca3af; cursor: pointer; }
  .errors pre { font-size: 0.65rem; color: #ef4444; margin-top: 0.375rem; white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow-y: auto; }
  .timestamp { font-size: 0.7rem; color: #4b5563; margin-bottom: 1.5rem; }
</style>
</head>
<body>
<h1>SCREENSHOT TEST REPORT</h1>
<div class="timestamp">${new Date(report.timestamp.replace(/T/, ' ')).toLocaleString()} | ${(report.totalTimeMs / 1000).toFixed(1)}s total</div>

<div class="summary">
  <div class="summary-item"><span class="summary-label">Passed</span><span class="summary-value pass">${report.summary.passed}</span></div>
  <div class="summary-item"><span class="summary-label">Failed</span><span class="summary-value ${report.summary.failed > 0 ? 'fail' : ''}">${report.summary.failed}</span></div>
  <div class="summary-item"><span class="summary-label">Total</span><span class="summary-value">${report.summary.total}</span></div>
  <div class="summary-item"><span class="summary-label">Avg Load</span><span class="summary-value">${report.summary.avgLoadMs}ms</span></div>
  <div class="summary-item"><span class="summary-label">Slowest</span><span class="summary-value ${report.summary.slowestLoadMs > 5000 ? 'warn' : ''}">${report.summary.slowestRoute} (${report.summary.slowestLoadMs}ms)</span></div>
  <div class="summary-item"><span class="summary-label">Console Errors</span><span class="summary-value ${report.summary.totalConsoleErrors > 0 ? 'warn' : ''}">${report.summary.totalConsoleErrors}</span></div>
  <div class="summary-item"><span class="summary-label">Net Failures</span><span class="summary-value ${report.summary.totalNetworkFailures > 0 ? 'fail' : ''}">${report.summary.totalNetworkFailures}</span></div>
</div>

<div class="grid">
${cards}
</div>
</body>
</html>`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
