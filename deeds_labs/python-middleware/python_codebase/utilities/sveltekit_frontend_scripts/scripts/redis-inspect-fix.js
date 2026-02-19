import { redis, ensureRedisReady } from '$lib/server/redis-client';
// scripts/redis-inspect-fix.js (ES module)
// Usage:
//   node scripts/redis-inspect-fix.js --pattern "myapp:*"        # dry-run (default)
//   node scripts/redis-inspect-fix.js --pattern "myapp:*" --apply  # apply repairs

import { createClient } from 'redis';

const argv = process.argv.slice(2);
const patternIndex = argv.indexOf('--pattern');
let pattern = '*';
if (patternIndex !== -1 && argv[patternIndex + 1]) pattern = argv[patternIndex + 1];
else {
  const eq = argv.find((a) => a.startsWith('--pattern='));
  if (eq) pattern = eq.split('=')[1] || '*';
}
const apply = argv.includes('--apply');
const dry = !apply;

function tryParse(value) {
  try {
    return { ok: true, obj: JSON.parse(value) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function tryHeuristics(raw) {
  // Heuristic 1: double-encoded JSON (string containing JSON)
  try {
    const once = JSON.parse(raw);
    if (typeof once === 'string') {
      try {
        const twice = JSON.parse(once);
        return { ok: true, obj: twice, reason: 'double-encoded' };
      } catch (e) {}
    }
  } catch (e) {}

  // Heuristic 2: replace single quotes with double quotes (simple cases)
  try {
    const normalized = raw.replace(/(^'|'$)/g, '').replace(/'/g, '"');
    return {
      ok: true,
      obj: JSON.parse(normalized),
      reason: 'single-quotes-normalized',
      normalized,
    };
  } catch (e) {}

  // Heuristic 3: unescape common escape sequences
  try {
    const unesc = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return { ok: true, obj: JSON.parse(unesc), reason: 'unescaped-escapes', unesc };
  } catch (e) {}

  return { ok: false };
}

async function main() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const client = redis;
  client.on('error', (err) => console.error('Redis error', err && err.message ? err.message : err));
  await client.connect();

  console.log(`redis-inspect-fix: connecting to ${url}  pattern=${pattern}  apply=${apply}`);

  const iter = client.scanIterator({ MATCH: pattern, COUNT: 500 });
  let inspected = 0,
    valid = 0,
    repaired = 0,
    failed = 0;

  for await (const key of iter) {
    inspected++;
    try {
      const raw = await client.get(key);
      if (raw == null) continue;

      const direct = tryParse(raw);
      if (direct.ok) {
        valid++;
        continue;
      }

      const h = tryHeuristics(raw);
      if (h.ok) {
        repaired++;
        console.log(`[REPAIRABLE] ${key} -> ${h.reason}`);
        if (apply) {
          const out = JSON.stringify(h.obj);
          await client.set(key, out);
          console.log(`  [APPLIED] wrote fixed JSON for ${key}`);
        }
        continue;
      }

      console.warn(`[UNRECOVERABLE] ${key} (manual review)`);
      failed++;
    } catch (err) {
      console.error('Error processing key', key, err && err.message ? err.message : err);
      failed++;
    }
  }

  await client.quit();
  console.log('Summary:', { inspected, valid, repaired, failed });
}

main().catch((err) => {
  console.error('Fatal:', err && err.message ? err.message : err);
  process.exit(2);
});
