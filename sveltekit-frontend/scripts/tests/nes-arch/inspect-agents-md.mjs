#!/usr/bin/env node
/**
 * nes-arch · inspect-agents-md.mjs
 *
 * Read-only inspector for the rendered AGENTS.md mirror in Redis.
 *
 * After `npm run agents:write`, the generator writes BOTH:
 *   - AGENTS.md files on disk (per directory, per agents.md spec)
 *   - agents:dir:<rel> Redis keys (24h TTL) with the same rendered markdown
 *
 * The Redis mirror is what the Gemma4 `agents_md` tool fetches at runtime
 * for sub-5ms agent-context lookups. This inspector confirms the mirror
 * is populated and that the walk-up-the-tree logic resolves the right
 * entry for a given file path.
 *
 * Usage:
 *   node scripts/tests/nes-arch/inspect-agents-md.mjs                       # all keys + counts
 *   node scripts/tests/nes-arch/inspect-agents-md.mjs --path src/lib/server/ace/foo.ts
 *                                                       # walk-up resolution test
 *   node scripts/tests/nes-arch/inspect-agents-md.mjs --filter routes/api   # subset
 *   node scripts/tests/nes-arch/inspect-agents-md.mjs --content <key>       # full body
 *
 * NEVER writes. Safe to run anytime.
 */

import Redis from 'ioredis';

const argv = process.argv.slice(2);
const PATH_ARG = argv.find((a, i) => argv[i - 1] === '--path') ?? null;
const FILTER = argv.find((a, i) => argv[i - 1] === '--filter') ?? null;
const CONTENT = argv.find((a, i) => argv[i - 1] === '--content') ?? null;

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
  // Replicate getAgentsMdQuickHit walk-up logic for verification
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
  const rootExists = await r.exists('agents:root');
  tried.push(`${rootExists ? '✓' : '·'} agents:root  (final fallback)`);
  if (!resolved && rootExists) resolved = 'agents:root';
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
const rootExists = await r.exists('agents:root');

console.log(`📦 agents:dir:* keys: ${allKeys.length}${FILTER ? ` (${keys.length} matching "${FILTER}")` : ''}`);
console.log(`📦 agents:root:       ${rootExists ? 'present' : 'MISSING — run `npm run agents:write`'}\n`);

const sample = keys.slice(0, 10);
for (const k of sample) {
  const v = await r.get(k);
  const ttl = await r.ttl(k);
  console.log(`  ${k.padEnd(60)}  ${String(v?.length ?? 0).padStart(5)} chars  TTL=${ttl}s`);
}
if (keys.length > 10) console.log(`  ... and ${keys.length - 10} more`);

await r.quit();