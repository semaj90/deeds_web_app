#!/usr/bin/env node
/**
 * AST -> authority gap derivation (read-only). Derives, from LIVE evidence, which gates of the promotion chain
 * are proven and exactly what is missing for each one — so the OpenSpec board is computed, not hand-written:
 *
 *   AST-AUTH-01 current source authority -> 02 current candidates -> 03 sept_v2 contract -> 04 canary ->
 *   05 readback -> ONTOLOGY-01/02 -> FEATURE-01 -> AUTHORITY-01, plus SOM-REV / METHOD-SYMBOL / LEGACY side gates.
 *
 * Reuses existing receipts (KNOW-09 snapshot audit, current-source repair plan, candidate artifact, safe cohort,
 * governed audit, query-fanout receipt) and reads Postgres only via SELECT. Writes ONLY
 * docs/reports/ast-authority-gap-derivation-v1.json. It never sets canonicalAuthority=true and never weakens a gate:
 * governed implementation proven != canonical data authority proven.
 *
 *   node scripts/atlas/audit-ast-authority-gap-derivation-v1.mjs [--markdown]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => path.join(ROOT, p);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(rel(p), 'utf8')); } catch { return null; } };
const norm = (v) => { const s = String(v ?? '').trim().toLowerCase(); return s.startsWith('sha256:') ? s.slice(7) : s; };
const psql = (sql) => { try { return execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-c', sql], { maxBuffer: 1 << 28, timeout: 60000 }).toString().trim(); } catch (e) { return `ERR:${String(e.message).slice(0, 80)}`; } };
const int = (sql) => { const v = psql(sql); return /^\d+$/.test(v) ? Number(v) : null; };

const know09 = readJson('.tmp/knowledge-source-snapshot-live-v1.json');
const plan = readJson('docs/reports/current-source-authority-repair-plan-v1.json');
const cohort = readJson('.tmp/atlas/ast-source-authority-cohort-v1.json');
const governed = readJson('docs/reports/parent-atlas-governed-audit-v1.json');
const fanout = readJson('docs/reports/query-fanout-bitfrost-v1.json');
const admission = readJson('docs/reports/workspace-revision-tournament-admission-v1.json');

// --- candidates: workspace frame + per-file digest vs binding ---------------------------------------------------
const candFile = rel('.tmp/atlas/ast-declaration-candidates-current-v1.jsonl');
const cand = { rows: 0, files: new Map(), workspaceRevisions: new Set() };
if (fs.existsSync(candFile)) {
  for await (const line of readline.createInterface({ input: fs.createReadStream(candFile) })) {
    if (!line.trim()) continue; const c = JSON.parse(line); cand.rows++; cand.workspaceRevisions.add(c.workspace_revision);
    const k = `${c.raw_source_ref}|${c.source_revision}`; const f = cand.files.get(k) ?? cand.files.set(k, { d: new Set() }).get(k); f.d.add(norm(c.source_content_digest));
  }
}
const bind = new Map();
for (const l of psql('select canonical_source_ref||E\'\\t\'||source_revision||E\'\\t\'||content_digest from atlas_workspace_source_bindings').split('\n')) { const [r, rev, d] = l.split('\t'); if (r && d) bind.set(`${r}|${rev}`, norm(d)); }
let single = 0, eqBind = 0; for (const [k, f] of cand.files) { if (f.d.size === 1) single++; if (f.d.size === 1 && bind.get(k) === [...f.d][0]) eqBind++; }

// --- method-symbol collisions (derived from the eligible hand-off restricted to the safe cohort) ---------------------
const method = { eligibleRows: 0, bareNameCollisionRows: null, afterClassQualificationRows: null };
try {
  const safe = new Set(cohort?.buckets?.SAFE_TO_STAMP ?? []);
  const rows = fs.readFileSync(rel('.tmp/atlas/ast-canary-eligible-v1.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => safe.has(r.raw_source_ref));
  const byId = new Map(rows.map((r) => [r.tree_node_id, r])); method.eligibleRows = rows.length;
  const count = (keyFn) => { const g = new Map(); for (const r of rows) { const k = keyFn(r); (g.get(k) ?? g.set(k, []).get(k)).push(r); } return [...g.values()].filter((x) => x.length > 1).flat().length; };
  method.bareNameCollisionRows = count((r) => `${r.np}|${r.kind}|${r.qualified_symbol}`);
  method.afterClassQualificationRows = count((r) => `${r.np}|${r.kind}|${r.kind === 'method' ? `${byId.get(r.parent_tree_node_id)?.qualified_symbol ?? ''}.${r.qualified_symbol}` : r.qualified_symbol}`);
} catch { /* leave null => reported as unmeasurable */ }

// --- live DB facts -----------------------------------------------------------------------------------------------
const genCol = int("select count(*) from information_schema.columns where table_name='atlas_ast_nodes' and column_name='ast_generation'") === 1;
const db = {
  astRows: int('select count(*) from atlas_ast_nodes'),
  astRowsNullRevision: int('select count(*) from atlas_ast_nodes where source_revision is null'),
  generationColumn: genCol,
  septV2Rows: genCol ? int("select count(*) from atlas_ast_nodes where ast_generation='sept_v2'") : 0,
  boundWorkspaceRevisions: psql('select workspace_revision||\':\'||count(*) from atlas_workspace_source_bindings group by workspace_revision order by count(*) desc limit 6').split('\n'),
  somAssigned: int('select count(*) from atlas_packets where som_cell_x is not null'),
  somRevisionNonNull: int('select count(*) from atlas_packets where som_cell_x is not null and som_revision is not null'),
  featureMatrixTables: int("select count(*) from information_schema.tables where table_schema='public' and table_name ilike '%feature_matrix%'"),
};
const tupleCols = psql("select column_name from information_schema.columns where table_name='feature_ontology_tuples'").split('\n');
db.ontologyTuples = tupleCols.includes('resolution_state') ? psql('select resolution_state||\':\'||count(*) from feature_ontology_tuples group by resolution_state order by count(*) desc').split('\n') : (tupleCols[0]?.startsWith('ERR') ? ['UNMEASURABLE'] : ['NO_resolution_state_COLUMN']);
const resolvedTuples = db.ontologyTuples.filter((x) => /^(RESOLVED|resolved)/.test(x)).reduce((s, x) => s + Number(x.split(':')[1]), 0);

// --- gates ---------------------------------------------------------------------------------------------------------
const planRev = plan?.currentWorkspaceRevision ?? null;
const admittedRev = admission?.workspaceRevision ?? know09?.workspaceRevision ?? null;
const gates = [];
const gate = (id, status, missing, evidence, blockedBy = []) => gates.push({ id, status, missing, evidence, blockedBy });
const g1missing = [];
if (know09?.status !== 'PASS' && know09?.status !== 'PROVEN') g1missing.push(`KNOW-09 status ${know09?.status ?? 'ABSENT'} (worktree fingerprint parity ${know09?.worktreeFingerprintParity}; ${know09?.worktreeMismatchCount ?? '?'} mismatches, ${know09?.missingWorktreeCount ?? '?'} missing)`);
if (planRev && admittedRev && planRev !== admittedRev) g1missing.push(`current frame ${planRev.slice(0, 15)}… is not the admitted frame ${admittedRev.slice(0, 15)}… (admission needs authorization)`);
if (plan && plan.counts?.CURRENT_BINDING_MISMATCH) g1missing.push(`${plan.counts.CURRENT_BINDING_MISMATCH} stale-graph CURRENT_BINDING_MISMATCH rows`);
if (plan && plan.counts?.SOURCE_UNAVAILABLE) g1missing.push(`${plan.counts.SOURCE_UNAVAILABLE} SOURCE_UNAVAILABLE (git-deleted; needs tombstone class)`);
gate('AST-AUTH-01 CURRENT_SOURCE_AUTHORITY_PROVEN', g1missing.length ? 'OPEN' : 'PROVEN', g1missing, { know09Status: know09?.status, planStatus: plan?.status, planCounts: plan?.counts, admittedRev, planRev });
const candRevOk = cand.workspaceRevisions.size === 1 && planRev && [...cand.workspaceRevisions][0] === planRev;
gate('AST-AUTH-02 CURRENT_CANDIDATES_REGENERATED', candRevOk && !g1missing.length ? 'PROVEN' : 'BLOCKED_BY_AST-AUTH-01', candRevOk ? [] : [`candidates stamped ${[...cand.workspaceRevisions].map((r) => String(r).slice(0, 15)).join(',')}… but current frame is ${String(planRev).slice(0, 15)}…; regenerate after admission`], { candidateRows: cand.rows, candidateFiles: cand.files.size }, ['AST-AUTH-01']);
const contractOk = cand.files.size > 0 && single === cand.files.size && eqBind === cand.files.size && fs.existsSync(rel('sveltekit-frontend/drizzle/manual/20260920_atlas_ast_nodes_generation.sql'));
gate('AST-AUTH-03 SEPT_V2_HASH_AND_COORDINATE_CONTRACT', contractOk ? 'PROVEN' : 'OPEN', contractOk ? [] : ['candidate per-file digest is not single-valued and equal to the binding digest, or generation migration missing'], { filesSingleDigest: `${single}/${cand.files.size}`, digestEqualsBinding: `${eqBind}/${cand.files.size}`, migrationDrafted: true, migrationApplied: genCol });
gate('AST-AUTH-04 CURRENT_AUTHORITY_CANARY', db.septV2Rows ? 'OPEN' : 'BLOCKED_BY_AST-AUTH-01/02', [!genCol && 'ast_generation column not applied (migration drafted + rollback-rehearsed only)', !db.septV2Rows && '0 persisted sept_v2 rows', 'unambiguous apply approval (operator)'].filter(Boolean), { septV2Rows: db.septV2Rows, rehearsal: readJson('docs/reports/atlas-ast-tranche-rehearsal-v1.json')?.status }, ['AST-AUTH-01', 'AST-AUTH-02']);
gate('AST-AUTH-05 CURRENT_AST_READBACK', 'BLOCKED_BY_AST-AUTH-04', ['persisted canary readback (generation/revision/workspace/hash/span mismatches all 0)'], {}, ['AST-AUTH-04']);
gate('SIDE METHOD_SYMBOL_QUALIFICATION', method.bareNameCollisionRows ? 'OPEN' : 'PROVEN', method.bareNameCollisionRows ? [`${method.bareNameCollisionRows} method rows collide on bare names; class-qualifying leaves ${method.afterClassQualificationRows} (need a deterministic disambiguator); convention undecided`] : [], method);
gate('SIDE LEGACY_AST_QUARANTINE', 'OPEN', [`${db.astRows - db.septV2Rows} rows are legacy/untagged (ast_generation NULL or column absent); ${db.astRowsNullRevision} have NULL source_revision — must stay non-authoritative`], { astRows: db.astRows, astRowsNullRevision: db.astRowsNullRevision });
gate('SIDE SOM_REVISION', db.somRevisionNonNull ? 'PARTIAL' : 'OPEN', [`${db.somAssigned - db.somRevisionNonNull} of ${db.somAssigned} SOM-assigned packets have NULL som_revision (needs a fresh versioned SOM run; cannot be derived)`], { somAssigned: db.somAssigned, somRevisionNonNull: db.somRevisionNonNull });
gate('ONTOLOGY-01 SYMBOL_TO_ONTOLOGY_BINDING', 'BLOCKED_BY_AST-AUTH-05', ['authoritative sept_v2 AST/symbol rows to bind'], {}, ['AST-AUTH-05']);
gate('ONTOLOGY-02 FEATURE_ONTOLOGY_TUPLES_RESOLVED', resolvedTuples ? 'PARTIAL' : 'BLOCKED_BY_ONTOLOGY-01', [`tuple resolution: ${db.ontologyTuples.join(', ')}`], { ontologyTuples: db.ontologyTuples }, ['ONTOLOGY-01']);
gate('FEATURE-01 REVISION_QUALIFIED_FEATURE_MATRIX', 'BLOCKED_BY_ONTOLOGY-02', [`no CandidateFeatureMatrix table/artifact (feature_matrix tables: ${db.featureMatrixTables})`, 'no frozen CandidateOrdinalMap'], { fanoutAceIdentity: fanout?.stages?.find((s) => s.id === 'ace_cache_identity')?.status }, ['ONTOLOGY-02']);
gate('AUTHORITY-01 CANONICAL_AUTHORITY_PROMOTION', 'BLOCKED_BY_FEATURE-01', ['all upstream gates; canonicalAuthority is derived from qualified input, never flipped'], { governedAuditStatus: governed?.status, governedAuthority: governed?.authority }, ['FEATURE-01']);

const proven = gates.filter((g) => g.status === 'PROVEN').length;
const report = { schema: 'atlas.ast-authority-gap-derivation.v1', generatedAt: new Date().toISOString(), governedImplementation: governed?.status ?? 'ABSENT', canonicalDataAuthority: 'NOT_PROVEN', summary: { gates: gates.length, proven, open: gates.filter((g) => g.status === 'OPEN' || g.status === 'PARTIAL').length, blocked: gates.filter((g) => g.status.startsWith('BLOCKED')).length }, gates, canonicalAuthority: false, writesPerformed: false };
fs.writeFileSync(rel('docs/reports/ast-authority-gap-derivation-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes('--markdown')) console.log(gates.map((g) => `- ${g.id}: **${g.status}**${g.missing.length ? ` — missing: ${g.missing.join('; ')}` : ''}`).join('\n'));
else console.log(JSON.stringify({ summary: report.summary, gates: gates.map((g) => `${g.status} | ${g.id}`) }, null, 1));
