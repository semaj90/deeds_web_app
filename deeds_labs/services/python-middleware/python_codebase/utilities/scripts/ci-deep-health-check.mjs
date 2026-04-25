#!/usr/bin/env node
/**
 * CI Deep Health Smoke Test
 * Starts from existing running dev/preview server (expects HOST/PORT) or defaults to http://localhost:5173
 * Hits /healthz/deep and asserts status = ok.
 */
import http from 'node:http';

const base = process.env.CI_HEALTH_BASE || 'http://localhost:5173';
const url = `${base.replace(/\/$/, '')}/healthz/deep`;

function fetchJson(u) {
  return new Promise((resolve, reject) => {
    const req = http.get(u, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode, json: JSON.parse(data || '{}') }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  try {
    const { statusCode, json } = await fetchJson(url);
    if (statusCode !== 200 || json.status !== 'ok') {
      console.error('[ci-health] FAIL', { statusCode, body: json });
      process.exit(1);
    }
    console.log('[ci-health] PASS', { durationMs: json.durationMs, checks: json.checks });
  } catch (e) {
    console.error('[ci-health] ERROR', e.message || e);
    process.exit(1);
  }
})();
