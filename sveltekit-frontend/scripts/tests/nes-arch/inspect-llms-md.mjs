#!/usr/bin/env node
/**
 * nes-arch · inspect-llms-md.mjs
 *
 * Read-only inspector for the rendered LLMS.md mirror in Redis.
 *
 * After `npm run llms:write`, the generator writes BOTH:
 *   - LLMS.md files on disk (per directory, per agents.md spec)
 *   - agents:dir:<rel> Redis keys (24h TTL) with the same rendered markdown
 *
 * The Redis mirror is what the Gemma4 `agents_md` tool fetches at runtime
 * for sub-5ms agent-context lookups. This inspector confirms the mirror
 * is populated and that the walk-up-the-tree logic resolves the right
 * entry for a given file path.
 *
 * Usage:
 *   node scripts/tests/nes-arch/inspect-llms-md.mjs                       # all keys + counts
 *   node scripts/tests/nes-arch/inspect-llms-md.mjs --path src/lib/server/ace/foo.ts
 *                                                       # walk-up resolution test
 *   node scripts/tests/nes-arch/inspect-llms-md.mjs --filter routes/api   # subset
 *   node scripts/tests/nes-arch/inspect-llms-md.mjs --content <key>       # full body
 *
 * NEVER writes. Safe to run anytime.
 */

import Redis from 'ioredis';

const argv = process.argv.slice(2);
const PATH_ARG = argv.find((a, i) => argv[i - 1] === '--path') ?? null;
const FILTER = argv.find((a, i) => argv[i - 1] === '--filter') ?? null;
const CONTENT = argv.find((a, i) => argv[i - 1] === '--content') ?? null;
const STRICT  = argv.includes('--strict');
const MIN_KEYS = parseInt(argv.find((a, i) => argv[i - 1] === '--min-keys') ?? '50', 10);

const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

if (CONTENT) {
  const v = await r.get(CONTENT);
  if (!v) {
    console.log(`✗ no key: ${CONTENT}`);
  } else {
    const ttl = await r.ttl(CONTENT);
    console.log(`━━━ ${CONTENT} (TTL ${ttl}s) ━━━\n`);
    console.log(v);
  }
  await r.quit();
  process.exit(0);
}

if (PATH_ARG) {
  // Replicate getLLMSMdQuickHit walk-up logic for verification
  let dir = PATH_ARG.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '');
  if (/\.[a-z]{1,5}$/i.test(dir)) dir = dir.split('/').slice(0, -1).join('/');
  console.log(`🔍 walk-up resolution for: ${PATH_ARG}\n   normalized:  ${dir}`);
  const tried = [];
  let resolved = null;
  while (dir && dir !== '.' && dir !== '/') {
    const key = `agents:dir:${dir}`;
    const exists = await r.exists(key);
    tried.push(`${exists ? '✓' : '·'} ${key}`);
    if (exists && !resolved) resolved = key;
    const parent = dir.split('/').slice(0, -1).join('/');
    if (parent === dir) break;
    dir = parent;
  }
  const rootExists = await r.exists('llms:root');
  tried.push(`${rootExists ? '✓' : '·'} llms:root  (final fallback)`);
  if (!resolved && rootExists) resolved = 'llms:root';
  console.log(`\n   walk:`);
  for (const t of tried) console.log(`     ${t}`);
  console.log(`\n   → resolves to: ${resolved ?? '(none)'}`);
  if (resolved) {
    const v = await r.get(resolved);
    console.log(`   length: ${v?.length ?? 0} chars`);
  }
  await r.quit();
  process.exit(0);
}

const allKeys = await r.keys('agents:dir:*');
const keys = FILTER ? allKeys.filter(k => k.includes(FILTER)) : allKeys;
const rootExists = await r.exists('llms:root');

console.log(
  `📦 agents:dir:* keys: ${allKeys.length}${FILTER ? ` (${keys.length} matching "${FILTER}")` : ''}`
);
console.log(`📦 llms:root:       ${rootExists ? 'present' : 'MISSING — run `npm run llms:write`'}\n`);

const sample = keys.slice(0, 10);
for (const k of sample) {
  const v = await r.get(k);
  const ttl = await r.ttl(k);
  console.log(`  ${k.padEnd(60)}  ${String(v?.length ?? 0).padStart(5)} chars  TTL=${ttl}s`);
}
if (keys.length > 10) console.log(`  ... and ${keys.length - 10} more`);

await r.quit();

// Strict mode (CI gate / smoke:llms): non-zero exit when the NES-arch
// preflight cache is materially empty. Used by graphify:full to fail fast.
if (STRICT) {
  const failures = [];
  if (!rootExists) failures.push('llms:root missing — run `npm run llms:write`');
  if (allKeys.length < MIN_KEYS) {
    failures.push(
      `agents:dir:* count = ${allKeys.length} (expected ≥ ${MIN_KEYS}) — run \`npm run llms:write\``
    );
  }
  if (failures.length > 0) {
    console.error('\n✗ smoke:llms FAILED:');
    for (const f of failures) console.error('   - ' + f);
    process.exit(1);
  }
  console.log(`\n✓ smoke:llms OK (${allKeys.length} dir keys + llms:root)`);
}