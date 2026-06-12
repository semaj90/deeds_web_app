#!/usr/bin/env node
/**
 * turbovec-sidecar-health.mjs
 *
 * Read-only health probe for the TurboVec sidecar.
 * Defaults to the root sidecar on :8791, but can target any compatible /health endpoint.
 *
 * Usage:
 *   node scripts/atlas/turbovec-sidecar-health.mjs
 *   node scripts/atlas/turbovec-sidecar-health.mjs --url http://127.0.0.1:8792/health
 *   node scripts/atlas/turbovec-sidecar-health.mjs --port 8791
 */

const args = process.argv.slice(2);
const urlArg = args.find((arg) => arg.startsWith('--url='));
const portArg = args.find((arg) => arg.startsWith('--port='));
const timeoutArg = args.find((arg) => arg.startsWith('--timeout='));

const port = Number(portArg ? portArg.split('=', 2)[1] : 8791) || 8791;
const timeoutMs = Number(timeoutArg ? timeoutArg.split('=', 2)[1] : 5000) || 5000;
const url = urlArg
  ? urlArg.split('=', 2)[1]
  : `http://127.0.0.1:${port}/health`;

async function main() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    const output = {
      ok: res.ok,
      status: res.status,
      url,
      body,
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(res.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    }, null, 2));
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
