#!/usr/bin/env node
/**
 * check-knowledge-consolidation-claims.mjs
 *
 * Verifies the synthesized knowledge consolidation report claims against
 * real counts from disk, card.ndjson, Drizzle journal, and DB introspection.
 *
 * Read-only: no DB writes, no migrations, no Qdrant/Neo4j/Redis writes.
 *
 * Outputs:
 *   .tmp/knowledge-consolidation-claim-check.json
 *   .tmp/knowledge-consolidation-claim-check.md
 *
 * Usage:
 *   node scripts/atlas/check-knowledge-consolidation-claims.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, '.tmp');
mkdirSync(OUT_DIR, { recursive: true });

console.log(`\n📋 Knowledge Consolidation Claim Checker`);
console.log(`════════════════════════════════════════`);

// ── Claims to verify ──────────────────────────────────────────────────────────
// These come from the synthesized report referenced by the user
const CLAIMS = {
  valid_sourceRef_pct: { claim: 85, unit: '%', label: '85% valid sourceRefs' },
  direct_sourceRefs: { claim: 130, unit: 'count', label: '130 direct sourceRefs' },
  implicit_missing_refs: { claim: 167, unit: 'count', label: '167 implicit/missing refs' },
  valid_paths_pct: { claim: 92, unit: '%', label: '92% valid paths' },
  outdated_paths_pct: { claim: 3, unit: '%', label: '3% outdated/deleted paths' },
  services_present: { claim: '12/20', unit: 'ratio', label: '12/20 services present' },
  unjournaled_sidecars: { claim: 12, unit: 'count', label: '12 unjournaled sidecars' },
  declared_tables: { claim: 333, unit: 'count', label: '333 declared tables (Drizzle)' },
  live_columns: { claim: 3196, unit: 'count', label: '3196 live columns (Postgres)' },
};

// ── 1. Read card.ndjson stats from validation output ─────────────────────────

const validationJson = join(OUT_DIR, 'knowledge-card-validation.json');
let cardStats = null;
if (existsSync(validationJson)) {
  try {
    cardStats = JSON.parse(readFileSync(validationJson, 'utf8'));
    console.log(`✅ Loaded card validation: ${cardStats.summary.total_cards} cards`);
  } catch {
    console.warn('⚠️  Could not parse knowledge-card-validation.json — run validate-knowledge-cards.mjs first');
  }
} else {
  console.warn('⚠️  knowledge-card-validation.json not found — run validate-knowledge-cards.mjs first');
}

// Fall back: stream card.ndjson directly if no validation cache
let liveCardStats = null;
if (!cardStats) {
  const CARD_FILE_CANDIDATES = [
    join(REPO_ROOT, '.tmp', 'ingest', 'lanes', 'card.ndjson'),
    join(REPO_ROOT, 'sveltekit-frontend', 'memory', 'knowledge', 'document-knowledge-cards.jsonl'),
  ];
  const cardFile = CARD_FILE_CANDIDATES.find(f => existsSync(f) && statSync(f).size > 100);
  if (cardFile) {
    console.log(`📂 Streaming card file: ${cardFile}`);
    let total = 0, direct = 0, missing = 0, checked = 0, existsOnDisk = 0;
    const CHUNK_RE = /#chunk-\d+$/;
    const rl = createInterface({ input: createReadStream(cardFile), crlfDelay: Infinity });
    await new Promise(res => {
      rl.on('line', line => {
        const t = line.trim(); if (!t) return;
        let c; try { c = JSON.parse(t); } catch { return; }
        total++;
        const ref = typeof c.sourceRef === 'string' ? c.sourceRef.trim() : '';
        if (ref && !CHUNK_RE.test(ref)) direct++;
        if (!ref && !(Array.isArray(c.sourceRefs) && c.sourceRefs.length)) missing++;
        if (ref) {
          checked++;
          const base = ref.replace(CHUNK_RE, '');
          const paths = [join(REPO_ROOT, base), join(REPO_ROOT, 'sveltekit-frontend', base.replace(/^sveltekit-frontend\//, '')), join(REPO_ROOT, base.replace(/^sveltekit-frontend\//, ''))];
          if (paths.some(p => existsSync(p))) existsOnDisk++;
        }
      });
      rl.on('close', res);
    });
    liveCardStats = { total, direct, missing, checked, existsOnDisk };
    console.log(`   Streamed: ${total} cards, ${direct} direct refs, ${existsOnDisk}/${checked} on disk`);
  }
}

const effectiveTotal = cardStats?.summary?.total_cards ?? liveCardStats?.total ?? 0;
const effectiveDirect = cardStats?.ref_coverage?.cards_with_direct_source_ref ?? liveCardStats?.direct ?? 0;
const effectiveMissing = cardStats?.ref_coverage?.cards_missing_any_ref ?? liveCardStats?.missing ?? 0;
const effectiveChecked = cardStats?.disk_check?.source_refs_checked ?? liveCardStats?.checked ?? 0;
const effectiveOnDisk = cardStats?.disk_check?.source_refs_existing_on_disk ?? liveCardStats?.existsOnDisk ?? 0;
const effectiveMissingDisk = cardStats?.disk_check?.source_refs_missing_on_disk ?? (effectiveChecked - effectiveOnDisk);
const effectiveValidPct = effectiveChecked > 0 ? Math.round((effectiveOnDisk / effectiveChecked) * 100) : 0;
const effectiveOutdatedPct = effectiveChecked > 0 ? Math.round((effectiveMissingDisk / effectiveChecked) * 100) : 0;

// ── 2. Count Drizzle declared tables ─────────────────────────────────────────

console.log('\n📊 Counting Drizzle declared tables...');
let drizzleDeclaredTables = 0;
const schemaFile = join(REPO_ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'db', 'schema-postgres.ts');
if (existsSync(schemaFile)) {
  const content = readFileSync(schemaFile, 'utf8');
  drizzleDeclaredTables = (content.match(/pgTable\s*\(/g) ?? []).length;
  console.log(`   schema-postgres.ts: ${drizzleDeclaredTables} pgTable() calls`);
}

// Also count sidecar schema files
const schemaDir = join(REPO_ROOT, 'sveltekit-frontend', 'src', 'lib', 'server', 'db');
let sidecarTables = 0;
if (existsSync(schemaDir)) {
  const files = readdirSync(schemaDir).filter(f => f.endsWith('.ts') && f !== 'schema-postgres.ts' && f.includes('schema'));
  for (const f of files) {
    const c = readFileSync(join(schemaDir, f), 'utf8');
    sidecarTables += (c.match(/pgTable\s*\(/g) ?? []).length;
  }
  console.log(`   sidecar schema files: ${sidecarTables} pgTable() calls`);
}
const totalDeclaredTables = drizzleDeclaredTables + sidecarTables;

// ── 3. Count unjournaled SQL sidecars ─────────────────────────────────────────

console.log('\n📁 Counting unjournaled sidecars...');
let unjournaled = 0;
const drizzleDir = join(REPO_ROOT, 'sveltekit-frontend', 'drizzle');
const journalPath = join(drizzleDir, 'meta', '_journal.json');
if (existsSync(journalPath)) {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const journaledIdxs = new Set(journal.entries.map(e => String(e.idx).padStart(4, '0')));
  const sqlFiles = existsSync(drizzleDir)
    ? readdirSync(drizzleDir).filter(f => f.endsWith('.sql'))
    : [];
  unjournaled = sqlFiles.filter(f => !journaledIdxs.has(f.slice(0, 4))).length;
  const manualDir = join(drizzleDir, 'manual');
  const manualSidecars = existsSync(manualDir)
    ? readdirSync(manualDir).filter(f => f.endsWith('.sql')).length
    : 0;
  console.log(`   journaled: ${journaledIdxs.size}, unjournaled in drizzle/: ${unjournaled}, manual/: ${manualSidecars}`);
  // Total unjournaled = files in drizzle/ not in journal + manual sidecars
  unjournaled = unjournaled + manualSidecars;
}

// ── 4. Query live DB for table/column counts ──────────────────────────────────

console.log('\n🐘 Querying live Postgres...');
let liveTableCount = null;
let liveColumnCount = null;
let pgVersion = null;

try {
  const tablesResult = execSync(
    'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema=\'public\';"',
    { encoding: 'utf8', timeout: 10000 }
  ).trim();
  liveTableCount = parseInt(tablesResult, 10);

  const colsResult = execSync(
    'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT count(*) FROM information_schema.columns WHERE table_schema=\'public\';"',
    { encoding: 'utf8', timeout: 10000 }
  ).trim();
  liveColumnCount = parseInt(colsResult, 10);

  const verResult = execSync(
    'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "SELECT version();"',
    { encoding: 'utf8', timeout: 10000 }
  ).trim();
  pgVersion = verResult.split('on')[0].trim();

  console.log(`   Tables: ${liveTableCount}, Columns: ${liveColumnCount}`);
  console.log(`   Version: ${pgVersion}`);
} catch (e) {
  console.warn(`   ⚠️  DB query failed: ${e.message.slice(0, 80)}`);
}

// ── 5. Check known services ───────────────────────────────────────────────────

console.log('\n🔌 Checking services...');
const SERVICES = [
  { name: 'Redis', check: () => { try { const c = process.env.REDIS_CONTAINER ?? 'legal-ai-valkey'; const p = process.env.REDIS_PASSWORD ?? 'redis'; execSync(`docker exec ${c} redis-cli -a ${p} --no-auth-warning ping`, { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'Qdrant', check: () => { try { execSync('curl -sf http://127.0.0.1:6333/healthz', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'Neo4j', check: () => { try { execSync('curl -sf http://localhost:7474/', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'Postgres', check: () => liveTableCount !== null },
  { name: 'Ollama', check: () => { try { execSync('curl -sf http://localhost:11434/api/tags', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'RabbitMQ', check: () => { try { execSync('curl -sf -u guest:guest http://localhost:15672/api/overview', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'Bifrost', check: () => { try { execSync('curl -sf http://localhost:3040/health', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'SeaweedFS', check: () => { try { execSync('curl -sf http://localhost:9333/cluster/status', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'TurboQuant', check: () => { try { execSync('curl -sf http://localhost:8090/health', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'LangExtract', check: () => { try { execSync('curl -sf http://localhost:8095/health', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'Langfuse', check: () => { try { execSync('curl -sf http://localhost:3030/', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'KB-Retrieval', check: () => { try { execSync('curl -sf http://localhost:8789/health', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'TRACE-MCP', check: () => { try { execSync('curl -sf http://localhost:8788/health', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'GoSearch', check: () => { try { execSync('curl -sf http://localhost:8096/health', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'SvelteKit', check: () => { try { execSync('curl -sf http://localhost:5173/', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'CouchDB', check: () => { try { execSync('curl -sf http://localhost:5984/', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'DuckDB-CLI', check: () => existsSync(join(REPO_ROOT, 'duckdb', 'atlas.duckdb')) },
  { name: 'ComfyUI', check: () => { try { execSync('curl -sf http://localhost:8188/', { timeout: 3000 }); return true; } catch { return false; } } },
  { name: 'Blender', check: () => { try { execSync('where blender', { timeout: 2000 }); return true; } catch { return false; } } },
  { name: 'LiteRT-LM', check: () => { try { execSync('curl -sf http://localhost:8070/health', { timeout: 3000 }); return true; } catch { return false; } } },
];

const serviceResults = [];
for (const s of SERVICES) {
  const up = s.check();
  serviceResults.push({ name: s.name, up });
  console.log(`   ${up ? '✅' : '❌'} ${s.name}`);
}

const servicesUp = serviceResults.filter(s => s.up).length;
const servicesTotal = serviceResults.length;

// ── 6. Evaluate each claim ───────────────────────────────────────────────────

function verdict(actual, claimed, unit, tolerancePct = 10) {
  if (actual === null || actual === undefined) return { status: 'not_enough_evidence', actual: null };
  if (unit === '%') {
    const diff = Math.abs(actual - claimed);
    if (diff <= tolerancePct) return { status: 'verified', actual };
    if (actual > claimed) return { status: 'contradicted', actual, note: `actual ${actual}% < claimed ${claimed}%` };
    return { status: 'contradicted', actual, note: `actual ${actual}% vs claimed ${claimed}%` };
  }
  if (unit === 'count') {
    const diff = Math.abs(actual - claimed);
    const pct = claimed > 0 ? (diff / claimed) * 100 : 100;
    if (pct <= 15) return { status: 'verified', actual };
    if (pct <= 40) return { status: 'partially_supported', actual };
    return { status: 'contradicted', actual };
  }
  if (unit === 'ratio') {
    // e.g. "12/20" → check numerator
    const [cn, cd] = claimed.split('/').map(Number);
    const [an, ad] = [servicesUp, servicesTotal];
    const diff = Math.abs(an - cn);
    if (diff <= 3) return { status: 'verified', actual: `${an}/${ad}` };
    if (diff <= 6) return { status: 'partially_supported', actual: `${an}/${ad}` };
    return { status: 'contradicted', actual: `${an}/${ad}` };
  }
  return { status: 'not_enough_evidence', actual };
}

const checks = {
  valid_sourceRef_pct: verdict(effectiveValidPct, CLAIMS.valid_sourceRef_pct.claim, '%', 15),
  direct_sourceRefs: verdict(effectiveDirect, CLAIMS.direct_sourceRefs.claim, 'count'),
  implicit_missing_refs: verdict(effectiveMissing, CLAIMS.implicit_missing_refs.claim, 'count'),
  valid_paths_pct: verdict(effectiveValidPct, CLAIMS.valid_paths_pct.claim, '%', 15),
  outdated_paths_pct: verdict(effectiveOutdatedPct, CLAIMS.outdated_paths_pct.claim, '%', 10),
  services_present: verdict(null, CLAIMS.services_present.claim, 'ratio'),
  unjournaled_sidecars: verdict(unjournaled, CLAIMS.unjournaled_sidecars.claim, 'count'),
  declared_tables: verdict(totalDeclaredTables, CLAIMS.declared_tables.claim, 'count'),
  live_columns: verdict(liveColumnCount, CLAIMS.live_columns.claim, 'count'),
};

// Override services with live data
checks.services_present = { status: servicesUp >= 10 ? 'partially_supported' : 'contradicted', actual: `${servicesUp}/${servicesTotal}` };

// ── 7. Trust assessment ────────────────────────────────────────────────────────

const verdictCounts = { verified: 0, partially_supported: 0, contradicted: 0, not_enough_evidence: 0 };
for (const v of Object.values(checks)) verdictCounts[v.status]++;

const trustworthy = verdictCounts.contradicted === 0 && verdictCounts.verified >= 4;
const partiallyTrustworthy = verdictCounts.contradicted <= 2 && verdictCounts.verified >= 2;
const trustLevel = trustworthy ? 'TRUSTWORTHY' : partiallyTrustworthy ? 'PARTIALLY_TRUSTWORTHY' : 'NOT_TRUSTWORTHY';

// ── 8. Assemble JSON result ───────────────────────────────────────────────────

const output = {
  generated_at: new Date().toISOString(),
  pg_version: pgVersion,
  trust_level: trustLevel,
  verdict_summary: verdictCounts,
  recommendation: trustworthy
    ? 'Card/sourceRef layer is trustworthy. Proceed to Drizzle remediation.'
    : partiallyTrustworthy
    ? 'Card/sourceRef layer is partially trustworthy. Fix contradicted claims before Drizzle remediation.'
    : 'Card/sourceRef layer is NOT trustworthy. Do not use as authority for schema, embeddings, or ACE until repaired.',
  measured: {
    total_cards: effectiveTotal,
    direct_source_refs: effectiveDirect,
    missing_any_ref: effectiveMissing,
    source_refs_checked: effectiveChecked,
    source_refs_on_disk: effectiveOnDisk,
    valid_sourceRef_pct: effectiveValidPct,
    outdated_pct: effectiveOutdatedPct,
    drizzle_declared_tables: totalDeclaredTables,
    drizzle_pgTable_main: drizzleDeclaredTables,
    drizzle_pgTable_sidecars: sidecarTables,
    live_table_count: liveTableCount,
    live_column_count: liveColumnCount,
    unjournaled_sidecars: unjournaled,
    services_up: servicesUp,
    services_total: servicesTotal,
    services: serviceResults,
  },
  claim_checks: Object.fromEntries(
    Object.entries(CLAIMS).map(([k, c]) => [k, { claim: c.claim, label: c.label, ...checks[k] }])
  ),
};

const jsonOut = join(OUT_DIR, 'knowledge-consolidation-claim-check.json');
writeFileSync(jsonOut, JSON.stringify(output, null, 2));

// ── 9. Write Markdown ─────────────────────────────────────────────────────────

const STATUS_EMOJI = { verified: '✅', partially_supported: '⚠️', contradicted: '❌', not_enough_evidence: '❓' };

const md = `# Knowledge Consolidation Claim Check

**Generated**: ${output.generated_at}
**Postgres**: ${pgVersion ?? 'unreachable'}
**Trust Level**: **${trustLevel}**

---

## Recommendation

> ${output.recommendation}

---

## Verdict Summary

| Status | Count |
|--------|-------|
| ✅ Verified | ${verdictCounts.verified} |
| ⚠️ Partially supported | ${verdictCounts.partially_supported} |
| ❌ Contradicted | ${verdictCounts.contradicted} |
| ❓ Not enough evidence | ${verdictCounts.not_enough_evidence} |

---

## Claim-by-Claim Check

| Claim | Claimed | Measured | Status |
|-------|---------|----------|--------|
${Object.entries(output.claim_checks).map(([k, v]) =>
  `| ${v.label} | \`${v.claim}\` | \`${v.actual ?? 'unknown'}\` | ${STATUS_EMOJI[v.status]} ${v.status}${v.note ? ' — ' + v.note : ''} |`
).join('\n')}

---

## sourceRef Trustworthiness

| Metric | Value |
|--------|-------|
| Total cards | ${effectiveTotal.toLocaleString()} |
| Cards with direct sourceRef | **${effectiveDirect}** (${effectiveTotal > 0 ? ((effectiveDirect/effectiveTotal)*100).toFixed(1) : 0}%) |
| Cards missing any ref | **${effectiveMissing}** (${effectiveTotal > 0 ? ((effectiveMissing/effectiveTotal)*100).toFixed(1) : 0}%) |
| sourceRefs checked against disk | ${effectiveChecked} |
| Valid on disk | **${effectiveOnDisk}** (**${effectiveValidPct}%**) |
| Missing/outdated | ${effectiveMissing} (${effectiveOutdatedPct}%) |

> **85% claim**: ${checks.valid_sourceRef_pct.status === 'verified' ? '✅ VERIFIED' : checks.valid_sourceRef_pct.status === 'partially_supported' ? '⚠️ PARTIALLY SUPPORTED' : '❌ CONTRADICTED'} — actual valid sourceRef % = **${effectiveValidPct}%**

---

## Schema Counts

| Metric | Claimed | Actual |
|--------|---------|--------|
| Drizzle declared tables (pgTable calls) | 333 | **${totalDeclaredTables}** (${drizzleDeclaredTables} main + ${sidecarTables} sidecar) |
| Live Postgres tables | — | **${liveTableCount ?? 'unknown'}** |
| Live Postgres columns | 3196 | **${liveColumnCount ?? 'unknown'}** |
| Unjournaled SQL sidecars | 12 | **${unjournaled}** |

---

## Services (${servicesUp}/${servicesTotal} up)

${serviceResults.map(s => `- ${s.up ? '✅' : '❌'} ${s.name}`).join('\n')}

---

## Next Steps

${trustLevel === 'TRUSTWORTHY' ? `
1. Proceed to Drizzle remediation (schema drift fix).
2. Wire validated sourceRefs into Engram/ACE/Parent Atlas.
3. Run \`knowledge:documents:build\` to promote cards to production layer.
` : `
1. Run \`node scripts/atlas/validate-knowledge-cards.mjs\` to get current card counts.
2. Run \`node scripts/atlas/suggest-card-source-refs.mjs\` to generate repair candidates.
3. Apply high/medium candidates to improve sourceRef coverage.
4. Re-run this script until trust level reaches TRUSTWORTHY.
5. Do NOT proceed to Drizzle remediation or Engram wiring until TRUSTWORTHY.
`}
`;

const mdOut = join(OUT_DIR, 'knowledge-consolidation-claim-check.md');
writeFileSync(mdOut, md);

console.log(`\n✅ JSON:     ${jsonOut}`);
console.log(`✅ Markdown: ${mdOut}`);
console.log(`\n🏆 Trust Level: ${trustLevel}`);
console.log(`   Verified:    ${verdictCounts.verified}`);
console.log(`   Partial:     ${verdictCounts.partially_supported}`);
console.log(`   Contradicted: ${verdictCounts.contradicted}`);
console.log(`\n   85% sourceRef claim: ${checks.valid_sourceRef_pct.status.toUpperCase()} (actual: ${effectiveValidPct}%)`);
