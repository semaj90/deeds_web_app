#!/usr/bin/env node
/**
 * playwright-live-recorder.mjs
 *
 * Opens a real Chromium browser you control manually.
 * All 5 browser signals are captured in real-time to NDJSON:
 *   console, pageerror, request, response, requestfailed
 *
 * Filters to API/AI/Qdrant/Hermes/LangExtract hits so the log
 * stays readable (not every static asset).
 *
 * Usage:
 *   npm run diag:browser               # → http://127.0.0.1:5173
 *   npm run diag:browser:slow          # 200ms slowMo for debugging
 *   DIAG_URL=http://localhost:5173/cases npm run diag:browser
 *
 * Output:
 *   logs/diagnostics/playwright-live-<stamp>.ndjson
 *   (also tailed live to stdout in human-readable form)
 *
 * Stop: Ctrl+C in this terminal. Log file persists for later analysis.
 */

import { chromium }  from 'playwright';
import fs            from 'node:fs';
import path          from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir  = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const outDir     = path.join(projectRoot, 'logs', 'diagnostics');
fs.mkdirSync(outDir, { recursive: true });

const baseUrl  = process.env.DIAG_URL   || 'http://127.0.0.1:5173';
const slowMo   = Number(process.env.DIAG_SLOWMO  || 0);
const stamp    = new Date().toISOString().replace(/[:.]/g, '-');
const logPath  = path.join(outDir, `playwright-live-${stamp}.ndjson`);

// ── ANSI ──────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', blue: '\x1b[34m', white: '\x1b[37m',
};

// ── URL interest filter ───────────────────────────────────────────────────
const INTERESTING_URL = /\/api\/|qdrant|ollama|hermes|langextract|graphrag|mcp|embedding|sse|stream|chunk/i;
const ALWAYS_LOG_STATUS = 400; // log all responses >= this status regardless of URL

function isInteresting(url, status = 0) {
  return INTERESTING_URL.test(url) || status >= ALWAYS_LOG_STATUS;
}

// ── Log writer ────────────────────────────────────────────────────────────
let lineCount = 0;
function write(event) {
  lineCount++;
  const row = { ts: new Date().toISOString(), seq: lineCount, ...event };
  fs.appendFileSync(logPath, JSON.stringify(row) + '\n');

  // Human-readable stdout
  const ts = row.ts.slice(11, 23); // HH:MM:SS.mmm
  switch (event.type) {
    case 'console': {
      const lvl = event.level;
      const color = lvl === 'error' ? C.red : lvl === 'warn' ? C.yellow : C.dim;
      console.log(`${color}[console.${lvl}]${C.reset} ${ts} ${event.message}`);
      break;
    }
    case 'pageerror':
      console.log(`${C.bold}${C.red}[pageerror]${C.reset}  ${ts} ${event.message}`);
      if (event.stack) console.log(`${C.dim}${event.stack.split('\n').slice(0,3).join('\n')}${C.reset}`);
      break;
    case 'request':
      console.log(`${C.blue}[req]${C.reset}        ${ts} ${event.method} ${event.url}`);
      break;
    case 'response': {
      const s = event.status;
      const color = s >= 500 ? C.red : s >= 400 ? C.yellow : s >= 300 ? C.cyan : C.green;
      console.log(`${color}[res ${s}]${C.reset}     ${ts} ${event.method} ${event.url} ${C.dim}(${event.durationMs}ms)${C.reset}`);
      if (event.bodyPreview && (s >= 400 || event.url.includes('/api/'))) {
        console.log(`${C.dim}  ${event.bodyPreview.slice(0, 200)}${C.reset}`);
      }
      break;
    }
    case 'requestfailed':
      console.log(`${C.red}[req FAIL]${C.reset}   ${ts} ${event.method} ${event.url} — ${event.failure?.errorText}`);
      break;
    case 'navigate':
      console.log(`${C.magenta}[navigate]${C.reset}   ${ts} → ${event.url}`);
      break;
    default:
      console.log(`${C.dim}[${event.type}]${C.reset} ${ts} ${JSON.stringify(event).slice(0, 120)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  headless: false,
  slowMo,
  args: ['--disable-web-security', '--allow-running-insecure-content'],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  ignoreHTTPSErrors: true,
});

const page = await context.newPage();

// Track request timing
const reqTimings = new Map();

// Console messages
page.on('console', async (msg) => {
  let values = [];
  try {
    values = await Promise.all(msg.args().map((a) => a.jsonValue().catch(() => String(a))));
  } catch {}
  write({ type: 'console', level: msg.type(), message: msg.text(), values, location: msg.location() });
});

// Uncaught JS errors
page.on('pageerror', (err) => {
  write({ type: 'pageerror', message: err.message, stack: err.stack });
});

// Network requests (filter to interesting)
page.on('request', (req) => {
  const url  = req.url();
  const method = req.method();
  if (!isInteresting(url)) return;
  reqTimings.set(req.url() + method, Date.now());
  write({ type: 'request', method, url, headers: req.headers() });
});

// Network responses
page.on('response', async (res) => {
  const req    = res.request();
  const url    = res.url();
  const status = res.status();
  const method = req.method();
  if (!isInteresting(url, status)) return;

  const startTime = reqTimings.get(url + method) ?? Date.now();
  const durationMs = Date.now() - startTime;
  reqTimings.delete(url + method);

  let bodyPreview = '';
  try {
    const ct = res.headers()['content-type'] ?? '';
    if (ct.includes('application/json') || ct.includes('text/') || ct.includes('ndjson')) {
      bodyPreview = (await res.text().catch(() => '')).slice(0, 2000);
    }
  } catch {}

  write({ type: 'response', method, url, status, durationMs, bodyPreview });
});

// Failed requests
page.on('requestfailed', (req) => {
  write({ type: 'requestfailed', method: req.method(), url: req.url(), failure: req.failure() });
});

// Navigation events
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) {
    write({ type: 'navigate', url: frame.url() });
  }
});

// Shutdown
process.on('SIGINT', async () => {
  write({ type: 'shutdown', message: 'Ctrl+C — closing diagnostic browser', linesWritten: lineCount });
  await browser.close().catch(() => {});
  console.log(`\n${C.bold}Log saved:${C.reset} ${logPath}  (${lineCount} events)`);
  process.exit(0);
});

write({ type: 'start', message: `Opening ${baseUrl}`, logPath, slowMo });
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

console.log(`
${C.bold}${C.green}Diagnostic browser open${C.reset}
  URL:      ${baseUrl}
  Log:      ${logPath}
  Filter:   /api/* | qdrant | ollama | hermes | langextract | status>=400
  Controls: Click freely in the browser window
  Stop:     Ctrl+C here to save and exit
`);

// Keep alive
await new Promise(() => {});
