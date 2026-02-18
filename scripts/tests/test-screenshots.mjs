#!/usr/bin/env node
/**
 * Visual regression / 500-error screenshot tester
 * Usage:  node scripts/tests/test-screenshots.mjs [--all] [--route /evidence]
 *
 * --all          Test every known app route (default: quick list)
 * --route <path> Test a single route
 * --port <n>     Dev server port (default: 5173)
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
  { name: 'persons-of-interest', path: '/persons-of-interest/fake-id' },
  { name: 'cases-overview', path: '/cases/test-id/overview' },
  { name: 'agentic-errors-analysis', path: '/agentic-errors/analysis' },
  { name: 'cases-list', path: '/cases' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'citations', path: '/citations' },
];

const ALL_ROUTES = [
  ...QUICK_ROUTES,
  { name: 'evidence-upload', path: '/cases/test-id/evidence/upload' },
  { name: 'active-cases', path: '/active-cases' },
  { name: 'ai-dashboard', path: '/ai-dashboard' },
  { name: 'all-routes', path: '/all-routes', sse: true },
  { name: 'analysis-center', path: '/analysis-center' },
  { name: 'command-center', path: '/command-center' },
  { name: 'error-brain', path: '/error-brain' },
  { name: 'evidence-library', path: '/evidence-library' },
  { name: 'global-search', path: '/global-search' },
  { name: 'admin-dev-tools', path: '/admin/dev-tools' },
  { name: 'admin-knowledge-search', path: '/admin/knowledge-search' },
  { name: 'admin-codebase-viewer', path: '/admin/codebase-viewer' },
  { name: 'system-configuration', path: '/system-configuration' },
  { name: 'terminal', path: '/terminal' },
  { name: 'phase78', path: '/phase78' },
];

// SSE / long-poll pages that never reach networkidle
const SSE_PAGES = new Set(['all-routes', 'cases-overview', 'dashboard', 'command-center', 'error-brain']);

// ── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '5173';
const BASE = `http://localhost:${port}`;
const useAll = args.includes('--all');
const singleRoute = args.includes('--route') ? args[args.indexOf('--route') + 1] : null;

let routes;
if (singleRoute) {
  const name = singleRoute.replace(/^\//, '').replace(/\//g, '-') || 'home';
  routes = [{ name, path: singleRoute }];
} else {
  routes = useAll ? ALL_ROUTES : QUICK_ROUTES;
}

// ── Main ───────────────────────────────────────────────────────────
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(SCREENSHOTS_DIR, timestamp);
await fs.mkdir(outDir, { recursive: true });

console.log(`\n  Screenshot Test — ${new Date().toLocaleString()}`);
console.log(`  Routes: ${routes.length} | Output: ${outDir}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

const results = [];

for (const route of routes) {
  const url = `${BASE}${route.path}`;
  const tab = await context.newPage();
  const result = { name: route.name, url, status: 0, ok: false, error: null, file: null };

  try {
    const waitUntil = (route.sse || SSE_PAGES.has(route.name)) ? 'domcontentloaded' : 'networkidle';
    const response = await tab.goto(url, { waitUntil, timeout: 15000 });

    // For domcontentloaded pages, give extra render time
    if (waitUntil === 'domcontentloaded') {
      await tab.waitForTimeout(2000);
    }

    result.status = response?.status() ?? 0;
    result.ok = result.status >= 200 && result.status < 400;

    // Check page for SvelteKit error page (.error-page class from +error.svelte)
    // or Vite error overlay (custom element injected on module load failure).
    // Avoids false positives from CSS values like "font-weight: 500" or port
    // numbers that appear inside <script>/<style> tags in textContent('body').
    const errorPageCount = await tab.locator('.error-page').count().catch(() => 0);
    const viteErrorCount = await tab.locator('vite-error-overlay').count().catch(() => 0);
    if (errorPageCount > 0 || viteErrorCount > 0) {
      result.ok = false;
      result.error = errorPageCount > 0 ? 'SvelteKit error page rendered' : 'Vite error overlay detected';
    }

    const filename = `${route.name}.png`;
    const filepath = path.join(outDir, filename);
    await tab.screenshot({ path: filepath, fullPage: true });
    result.file = filepath;
  } catch (err) {
    result.error = err.message.split('\n')[0];
    // Try screenshot even on error
    try {
      const filepath = path.join(outDir, `${route.name}-ERROR.png`);
      await tab.screenshot({ path: filepath, fullPage: true });
      result.file = filepath;
    } catch { /* ignore */ }
  }

  const icon = result.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${icon}] ${result.status} ${route.name} — ${route.path}${result.error ? ` (${result.error})` : ''}`);
  results.push(result);
  await tab.close();
}

await browser.close();

// ── Summary ────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;

console.log(`\n  ────────────────────────────────`);
console.log(`  Passed: ${passed}  Failed: ${failed}  Total: ${results.length}`);
if (failed > 0) {
  console.log(`\n  Failed routes:`);
  results.filter(r => !r.ok).forEach(r => {
    console.log(`    - ${r.name} (${r.status}) ${r.error ?? ''}`);
  });
}
console.log(`  Screenshots: ${outDir}\n`);

// Write JSON report
const report = { timestamp, base: BASE, results, summary: { passed, failed, total: results.length } };
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

// Also keep a "latest" symlink/copy for easy access
const latestDir = path.join(SCREENSHOTS_DIR, 'latest');
await fs.rm(latestDir, { recursive: true, force: true });
await fs.cp(outDir, latestDir, { recursive: true });

process.exit(failed > 0 ? 1 : 0);