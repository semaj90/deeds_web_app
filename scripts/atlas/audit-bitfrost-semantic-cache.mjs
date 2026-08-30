#!/usr/bin/env node
//
// Rewritten 2026-08-30 around verified ownership classes instead of a flat pattern census.
// Every pattern below was checked live against legal-ai-valkey before classification --
// counts in the comments are the live snapshot at rewrite time, not assumptions.
//
// Naming note (see root CLAUDE.md "Naming clarification"): "Bitfrost" (one word, one f) is a
// separate, real Go microservice at :3040 -- unrelated to this file. Every family audited here
// uses the "bitfrost:*" / "gpu:*" prefixes (with a t), which is the ACE/Karpathy GPU-authority
// Redis caching layer this script actually covers. "bifrost:*" (no t) matched zero live keys at
// rewrite time and is tracked below as a naming-drift check, not a real family.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAtlasRedisContext, runRedisCli } from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'bitfrost-semantic-cache-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'bitfrost-semantic-cache-audit.md');

// ownership: 'ACTIVE' (real live writer, currently in the retrieval/cache path),
//            'WARMED_PENDING' (contract/writer exists in code, zero live rows -- opt-in or not yet run),
//            'LEGACY' (superseded key shape kept only for compatibility reads, if any),
//            'ASPIRATIONAL' (documented in CLAUDE.md's Canonical Lineage Contract but not implemented),
//            'NAMING_DRIFT_CHECK' (a plausible-but-wrong spelling/shape that should stay at 0).
const FAMILIES = [
  { key: 'bitfrost:summary:packet:v1:*', pattern: 'bitfrost:summary:packet:v1:*', ownership: 'ACTIVE',
    note: 'ACE/Karpathy summary hot-cache. ~4,827 keys live at rewrite time.' },
  { key: 'gpu:som:packet:*', pattern: 'gpu:som:packet:*', ownership: 'ACTIVE',
    note: 'SOM BMU assignment per packet. ~5,000 keys live.' },
  { key: 'gpu:som:cell:*', pattern: 'gpu:som:cell:*', ownership: 'ACTIVE',
    note: 'SOM grid cell membership index. ~296 keys live across 20 cells.' },
  { key: 'gpu:autoencoder:latent_64:*', pattern: 'gpu:autoencoder:latent_64:*', ownership: 'ACTIVE',
    note: 'Active trained LibTorch 768->128->64 autoencoder cache consumed by the SOM topology pipeline. This is distinct from the retired/random Karpathy H6 path (gpu:karpathy:encoded) and from the newer NestedSemanticAutoencoder latent_256/128/64 challenger, which has no live consumers. Active here means SOM/topology ownership, not canonical semantic retrieval authority.' },
  { key: 'gpu:karpathy:scores', pattern: 'gpu:karpathy:scores', exact: true, ownership: 'ACTIVE',
    note: 'PageRank/attention/authority blend hash. 1 key (hash with many fields), 24h TTL.' },
  { key: 'gpu:karpathy:summary', pattern: 'gpu:karpathy:summary', exact: true, ownership: 'ACTIVE',
    note: 'Run metadata for the last karpathy:gpu pass. 1 key, 24h TTL.' },
  { key: 'gpu:karpathy:encoded', pattern: 'gpu:karpathy:encoded', exact: true, ownership: 'ASPIRATIONAL',
    note: 'Blocked on ace:autoencoder:weights not existing (untrained autoencoder). This is a deliberate H6 conditional skip, not a bug -- see LEGACY_KARPATHY_H6 retirement in atlas-live-reconciliation-audit.mjs. Expected 0 until a trained AE is loaded.' },
  { key: 'embed:v2:embeddinggemma:latest:*', pattern: 'embed:v2:embeddinggemma:latest:*', ownership: 'ACTIVE',
    note: 'Embedding query cache, v2 key shape. Low steady-state count (cache-of-recent-queries, not bulk).' },
  { key: 'embed:embeddinggemma:latest:*', pattern: 'embed:embeddinggemma:latest:*', ownership: 'LEGACY',
    note: 'Embedding query cache, v1 key shape (no embed:v2: prefix). Small residual count; embed:v2:* is the current shape.' },
  { key: 'ace:*', pattern: 'ace:*', ownership: 'ACTIVE',
    note: 'Small set of ACE cluster/probe/path keys (ace:cluster:members:*, ace:probe:*, ace:path:*). Not the ace:context:*/ace:summary:*/etc. family listed below -- those are aspirational.' },
  { key: 'bitfrost:candidate:v1:*', pattern: 'bitfrost:candidate:v1:*', ownership: 'WARMED_PENDING',
    note: 'BitFrost latent_256 hot-record contract (bitfrost-hot-vector.ts, added 2026-08-30). F32LE binary, revision-qualified sha256 keys, canonical_authority:false. Writer code exists and is test-verified (3/3 spec pass); zero live rows because nothing calls the writer in a live retrieval path yet.' },
  { key: 'bitfrost:retrieval:v2:*', pattern: 'bitfrost:retrieval:v2:*', ownership: 'WARMED_PENDING',
    note: 'Documented as an active family in prior notes; zero live rows at rewrite time -- treat as not-yet-warmed, not broken.' },
  { key: 'bitfrost:retrieval:*', pattern: 'bitfrost:retrieval:*', ownership: 'LEGACY',
    note: 'v1 retrieval cache key shape (no :v2: segment). Zero live rows -- either never populated on this instance or already fully superseded by bitfrost:retrieval:v2:*.' },
  { key: 'bitfrost:ace:v1:*', pattern: 'bitfrost:ace:v1:*', ownership: 'WARMED_PENDING',
    note: 'Documented ACE-specific BitFrost family. Zero live rows at rewrite time.' },
  { key: 'bf:meta:v1:*', pattern: 'bf:meta:v1:*', ownership: 'WARMED_PENDING',
    note: 'Documented BitFrost metadata family. Zero live rows at rewrite time.' },
  { key: 'centroid:directory:*', pattern: 'centroid:directory:*', ownership: 'ASPIRATIONAL',
    note: 'Part of the documented Canonical Lineage Contract key pattern (root CLAUDE.md). Confirmed live: this pattern is aspirational/not-yet-implemented, not current state.' },
  { key: 'centroid:feature:*', pattern: 'centroid:feature:*', ownership: 'ASPIRATIONAL',
    note: 'Same Canonical Lineage Contract family as centroid:directory:*. Zero live rows.' },
  { key: 'centroid:packet:*', pattern: 'centroid:packet:*', ownership: 'ASPIRATIONAL',
    note: 'Same Canonical Lineage Contract family. Zero live rows.' },
  { key: 'ace:context:*', pattern: 'ace:context:*', ownership: 'ASPIRATIONAL',
    note: 'Documented in an earlier version of this script as an active family; zero live rows confirmed at rewrite time.' },
  { key: 'ace:summary:*', pattern: 'ace:summary:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'ace:feature:*', pattern: 'ace:feature:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'ace:query:*', pattern: 'ace:query:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'ace:tree:*', pattern: 'ace:tree:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'ace:authority:*', pattern: 'ace:authority:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'ace:ontology:*', pattern: 'ace:ontology:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'ace:memory:*', pattern: 'ace:memory:*', ownership: 'ASPIRATIONAL', note: 'See ace:context:* note.' },
  { key: 'reward:zset', pattern: 'reward:zset', exact: true, ownership: 'ASPIRATIONAL',
    note: 'Referenced in earlier audit passes; zero live rows confirmed at rewrite time.' },
  { key: 'bifrost:*', pattern: 'bifrost:*', ownership: 'NAMING_DRIFT_CHECK',
    note: 'One-f spelling. Should stay at 0 -- if this ever shows real keys, something is writing to the wrong prefix (the real port-3040 Go Bifrost service does not use Redis key namespacing this way).' },
];

function scanCount(container, pattern, password = '') {
  const result = runRedisCli(container, ['--raw', '--scan', '--pattern', pattern], password, null, {
    maxBuffer: 1024 * 1024 * 8,
  });
  if (!result.ok) {
    return { ok: false, count: 0, sample: [], error: result.stderr.trim() || result.stdout.trim() || result.error };
  }
  const keys = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { ok: true, count: keys.length, sample: keys.slice(0, 5), error: null };
}

function ttlSample(container, keys, password = '') {
  const samples = [];
  for (const key of keys.slice(0, 5)) {
    const result = runRedisCli(container, ['TTL', key], password);
    const ttl = result.ok ? Number(result.stdout.trim()) : null;
    samples.push({ key, ttl: Number.isFinite(ttl) ? ttl : null, ok: result.ok });
  }
  return samples;
}

function classifyUnexpected(family, count) {
  // Flag drift: an ASPIRATIONAL/NAMING_DRIFT_CHECK family that now has real keys, or an
  // ACTIVE family that has silently gone to zero -- both are worth a human look.
  if ((family.ownership === 'ASPIRATIONAL' || family.ownership === 'NAMING_DRIFT_CHECK') && count > 0) {
    return `UNEXPECTED_POPULATED: was documented as ${family.ownership} with 0 live rows; now has ${count}. Verify whether a writer was added and update this script's classification.`;
  }
  if (family.ownership === 'ACTIVE' && count === 0) {
    return 'UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.';
  }
  return null;
}

function renderMarkdown(report) {
  const byOwnership = {};
  for (const item of report.families) {
    (byOwnership[item.ownership] ??= []).push(item);
  }
  const lines = [
    '# BitFrost / ACE / Karpathy Redis Cache Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Redis Container: ${report.redis.container || 'unavailable'}`,
    '',
    '## Summary by ownership class',
    '',
    '| Ownership | Families | Total keys |',
    '|---|---:|---:|',
    ...Object.entries(byOwnership).map(([ownership, items]) =>
      `| ${ownership} | ${items.length} | ${items.reduce((sum, item) => sum + item.count, 0)} |`),
    '',
    '## Families',
    '',
    '| Key pattern | Ownership | Count | Sample | Drift flag |',
    '|---|---|---:|---|---|',
    ...report.families.map((item) =>
      `| \`${item.key}\` | ${item.ownership} | ${item.count} | ${item.sample.join(', ') || 'none'} | ${item.driftFlag ?? ''} |`),
    '',
    '## Drift flags requiring attention',
    '',
    report.driftFlags.length
      ? report.driftFlags.map((flag) => `- **${flag.key}**: ${flag.message}`).join('\n')
      : '(none -- every family matches its documented ownership class)',
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const { container, password: redisPassword } = await resolveAtlasRedisContext(REPO_ROOT, process.env);
  const report = {
    generatedAt: new Date().toISOString(),
    status: container ? 'PASS' : 'SOURCE_UNAVAILABLE',
    redis: {
      container,
      passwordConfigured: Boolean(redisPassword),
    },
    families: [],
    driftFlags: [],
    nextSafeAction: container
      ? 'Review any entries under "Drift flags requiring attention" before trusting ACTIVE-class families for retrieval decisions.'
      : 'Bring the Redis/Valkey container online, then rerun the audit before warming caches.',
  };

  if (container) {
    const familyResults = FAMILIES.map((family) => {
      const result = scanCount(container, family.pattern, redisPassword);
      const ttlSamples = result.ok ? ttlSample(container, result.sample, redisPassword) : [];
      const driftFlag = result.ok ? classifyUnexpected(family, result.count) : null;
      return {
        key: family.key,
        pattern: family.pattern,
        ownership: family.ownership,
        note: family.note,
        count: result.count,
        sample: result.sample,
        ttlSamples,
        ok: result.ok,
        error: result.error,
        driftFlag,
      };
    });

    report.families = familyResults;
    report.driftFlags = familyResults
      .filter((item) => item.driftFlag)
      .map((item) => ({ key: item.key, message: item.driftFlag }));

    if (familyResults.every((item) => item.ok)) {
      report.status = report.driftFlags.length > 0 ? 'PASS_WITH_DRIFT' : 'PASS';
    } else if (familyResults.some((item) => /NOAUTH/i.test(item.error || ''))) {
      report.status = 'AUTH_REQUIRED';
    } else {
      report.status = 'PASS_WITH_WARN';
    }
    if (report.status === 'AUTH_REQUIRED') {
      report.nextSafeAction = 'Provide Redis/Valkey credentials through env or the local .env file, then rerun the audit so key counts and TTL samples can be measured.';
    } else if (report.status === 'PASS_WITH_DRIFT') {
      report.nextSafeAction = `${report.driftFlags.length} ownership-class drift flag(s) found -- see the "Drift flags requiring attention" section before trusting this audit's classification.`;
    }
  }

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(JSON.stringify({
    status: report.status,
    container: report.redis.container,
    passwordConfigured: report.redis.passwordConfigured,
    driftFlagCount: report.driftFlags.length,
    familyCount: report.families.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
