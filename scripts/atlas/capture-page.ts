#!/usr/bin/env tsx
/**
 * Atlas Playwright capture — produces browser artifact bundle for Atlas ingestion.
 *
 * Usage:
 *   npm run atlas:capture -- --url http://localhost:5173 --output artifacts/playwright/home
 *   npm run atlas:capture -- --url http://localhost:5173/cases --output artifacts/playwright/cases --wait-for networkidle
 *
 * Outputs (per capture):
 *   page.png               — full-page screenshot
 *   page.html              — full DOM snapshot
 *   page.txt               — visible text (accessibility tree → text)
 *   accessibility.json     — full Playwright accessibility snapshot
 *   browser-diagnostics.json — console logs, errors, failed requests
 *   capture-manifest.json  — provenance root for all extracted artifacts
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Parse args
function getArg(name: string, defaultVal?: string): string {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (defaultVal !== undefined) return defaultVal;
  throw new Error(`Missing required argument: --${name}`);
}

const url = getArg('url');
const outputDir = resolve(getArg('output', 'artifacts/playwright/capture'));
const waitFor = getArg('wait-for', 'networkidle') as 'networkidle' | 'load' | 'domcontentloaded' | 'commit';
const viewportWidth = parseInt(getArg('width', '1440'));
const viewportHeight = parseInt(getArg('height', '1000'));

mkdirSync(outputDir, { recursive: true });

interface DiagnosticsLog {
  consoleMessages: Array<{ type: string; text: string; location?: string }>;
  pageErrors: Array<{ message: string; stack?: string }>;
  requests: Array<{ method: string; url: string; resourceType: string }>;
  requestFailures: Array<{ url: string; failure: string }>;
  responses4xx: Array<{ status: number; url: string }>;
}

async function capture() {
  const captureId = randomUUID();
  const capturedAt = new Date().toISOString();
  const log: DiagnosticsLog = {
    consoleMessages: [],
    pageErrors: [],
    requests: [],
    requestFailures: [],
    responses4xx: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
  });
  const page = await context.newPage();

  // Wire diagnostics
  page.on('console', (msg) => {
    log.consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location().url,
    });
  });
  page.on('pageerror', (err) => {
    log.pageErrors.push({ message: err.message, stack: err.stack });
  });
  page.on('request', (req) => {
    log.requests.push({
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
    });
  });
  page.on('requestfailed', (req) => {
    log.requestFailures.push({
      url: req.url(),
      failure: req.failure()?.errorText ?? 'unknown',
    });
  });
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      log.responses4xx.push({ status: res.status(), url: res.url() });
    }
  });

  console.log(`[capture] Navigating to ${url}`);
  await page.goto(url, { waitUntil: waitFor, timeout: 30_000 });

  // Screenshot
  const screenshotPath = join(outputDir, 'page.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // HTML snapshot
  const htmlContent = await page.content();
  writeFileSync(join(outputDir, 'page.html'), htmlContent, 'utf-8');

  // Text content
  const textContent = await page.evaluate(() => document.body.innerText ?? '');
  writeFileSync(join(outputDir, 'page.txt'), textContent, 'utf-8');

  // Accessibility snapshot
  const a11ySnapshot = await page.accessibility.snapshot({ interestingOnly: false });
  writeFileSync(join(outputDir, 'accessibility.json'), JSON.stringify(a11ySnapshot, null, 2), 'utf-8');

  // Diagnostics
  writeFileSync(join(outputDir, 'browser-diagnostics.json'), JSON.stringify(log, null, 2), 'utf-8');

  // Manifest — provenance root for extracted artifacts
  const manifest = {
    capture_id: captureId,
    url,
    captured_at: capturedAt,
    viewport: { width: viewportWidth, height: viewportHeight },
    wait_for: waitFor,
    files: {
      screenshot: 'page.png',
      html: 'page.html',
      text: 'page.txt',
      accessibility: 'accessibility.json',
      diagnostics: 'browser-diagnostics.json',
    },
    diagnostics_summary: {
      console_errors: log.consoleMessages.filter(m => m.type === 'error').length,
      page_errors: log.pageErrors.length,
      failed_requests: log.requestFailures.length,
      responses_4xx: log.responses4xx.length,
    },
  };
  writeFileSync(join(outputDir, 'capture-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  await browser.close();

  console.log(`[capture] Done — ${outputDir}`);
  console.log(`  capture_id: ${captureId}`);
  console.log(`  console errors: ${manifest.diagnostics_summary.console_errors}`);
  console.log(`  page errors: ${manifest.diagnostics_summary.page_errors}`);
  console.log(`  failed requests: ${manifest.diagnostics_summary.failed_requests}`);
}

capture().catch((err) => {
  console.error('[capture] Fatal:', err);
  process.exit(1);
});
