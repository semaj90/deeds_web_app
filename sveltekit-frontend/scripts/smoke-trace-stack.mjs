#!/usr/bin/env node
/**
 * smoke-trace-stack.mjs
 *
 * Smoke-checks all TRACE stack services and prints a status table.
 * All services are optional — reports missing ones without failing.
 *
 * Usage:
 *   node scripts/smoke-trace-stack.mjs           # report only
 *   node scripts/smoke-trace-stack.mjs --strict  # exit 1 if any service down
 */

const STRICT = process.argv.includes('--strict');

const color = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

async function ping(url, timeoutMs = 2_000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

const services = [
  { name: 'llama-server',    url: 'http://127.0.0.1:8090/health', required: false },
  { name: 'topology-search', url: 'http://127.0.0.1:8101/health', required: false },
  { name: 'TRACE MCP',       url: 'http://127.0.0.1:8788/health', required: false },
  { name: 'SvelteKit',       url: 'http://127.0.0.1:5173/',        required: false },
];

console.log(`\n${color.bold(color.cyan('TRACE stack smoke test'))}\n`);

let anyDown = false;
for (const svc of services) {
  const ok = await ping(svc.url);
  const icon   = ok ? color.green('✓') : color.yellow('○');
  const status = ok ? color.green('up')  : color.dim('not running');
  console.log(`  ${icon}  ${svc.name.padEnd(18)} ${status}  ${color.dim(svc.url)}`);
  if (!ok) anyDown = true;
}

console.log('');

if (STRICT && anyDown) {
  console.error(color.red('--strict: one or more services are down'));
  process.exit(1);
}

console.log(color.green('Smoke complete.') + color.dim(' (run with --strict to fail on missing services)'));
