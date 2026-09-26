#!/usr/bin/env node
/**
 * 14.3b domain-tuple resolver, tiers T0 + T1 — REHEARSAL by default.
 *
 * Resolves feature_ontology_tuples rows (predicates CLASSIFIED_AS / BELONGS_TO_DOMAIN, object_type 'domain'):
 *   T0: the domain key matches EXACTLY ONE atlas_domain_ontology row by group_id or group_label (case-insensitive).
 *   T1: the key is one of the 7 operator-approved high-confidence aliases in ALIAS_T1 (exact, case-sensitive key).
 * T2 aliases, no-fit keys, generic buckets, the error sentinel and USES_CONCEPT are deliberately NOT touched.
 *
 * Writes: resolution_state='RESOLVED', resolved_concept_id='domain:<group_id>' (namespace-prefixed so a domain is never
 * mistaken for an ontology concept), and merges a `resolution` object (resolver id/version, matched_on, group_id) into
 * `evidence` (there is no resolver-version column). Original evidence keys are preserved.
 *
 * Default: BEGIN -> archive pre-image -> UPDATE -> verify -> re-run idempotency -> ROLLBACK.
 * Persist needs ALL of: --apply --operator-approved --lineage-reviewed --confirm-t0-domain-resolution (T0 exact + operator-approved T1 aliases)
 * (packet lineage / KNOW-09 authority is a listed gate for this cohort; a human must acknowledge it).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({ options: { apply: { type: 'boolean', default: false }, 'operator-approved': { type: 'boolean', default: false }, 'lineage-reviewed': { type: 'boolean', default: false }, 'confirm-t0-domain-resolution': { type: 'boolean', default: false } }, strict: false });
const PERSIST = Boolean(args.apply && args['operator-approved'] && args['lineage-reviewed'] && args['confirm-t0-domain-resolution']);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
// T1 = operator-approved high-confidence aliases (2026-09-20 answer: "T0 plus T1"). Exact-key (case-sensitive) -> canonical group_id.
// T2 (infrastructure, repair_workflow, embedding_indexing, cluster_analysis), no-fit, generic, ambiguous and sentinel keys are NEVER aliased here.
const ALIAS_T1 = { UI: 'frontend', MachineLearning: 'machine-learning', rag_retrieval: 'retrieval', graph_topology: 'graph', cache_layer: 'cache', Authentication: 'auth', auth_login_register: 'auth' };
const RESOLVER = { id: 'atlas-domain-ontology-exact-ci-plus-alias-t1', version: 'v2' };
const PREDICATES = ['CLASSIFIED_AS', 'BELONGS_TO_DOMAIN'];
const RECEIPT = path.join(ROOT, `docs/reports/atlas-domain-tuple-resolution-t0t1-v1.${PERSIST ? 'persist' : 'rehearsal'}.json`);
const DAY = new Date().toISOString().slice(0, 10);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const receipt = { schema: 'atlas.domain-tuple-resolution-t0.v1', generatedAt: new Date().toISOString(), mode: PERSIST ? 'PERSIST' : 'REHEARSAL_ROLLBACK', resolver: RESOLVER, steps: {}, errors: [] };
const finish = (status) => { receipt.status = status; fs.writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`); console.log(JSON.stringify(receipt, null, 2)); process.exitCode = status === 'REHEARSAL_PROVEN' || status === 'RESOLUTION_PROVEN' ? 0 : 1; };

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const ontology = (await client.query('SELECT group_id, group_label FROM atlas_domain_ontology')).rows;
  const keys = (await client.query(`SELECT replace(object_id, 'domain:', '') AS k, count(*)::int AS n FROM feature_ontology_tuples WHERE predicate = ANY($1) AND object_type = 'domain' AND resolution_state = 'UNRESOLVED' GROUP BY 1 ORDER BY 2 DESC`, [PREDICATES])).rows;
  const before = (await client.query(`SELECT resolution_state, count(*)::int AS n FROM feature_ontology_tuples GROUP BY 1 ORDER BY 1`)).rows;
  receipt.steps.before = { ontologyDomains: ontology.length, distinctUnresolvedDomainKeys: keys.length, byState: before };

  const plan = [], ambiguous = [], unmatched = [];
  for (const { k, n } of keys) {
    const hits = ontology.filter((o) => o.group_id.toLowerCase() === k.toLowerCase() || o.group_label.toLowerCase() === k.toLowerCase());
    const groups = [...new Set(hits.map((h) => h.group_id))];
    if (groups.length === 1) plan.push({ tier: 'T0', key: k, groupId: groups[0], matchedOn: hits.some((h) => h.group_id.toLowerCase() === k.toLowerCase()) ? 'group_id' : 'group_label', expected: n });
    else if (groups.length > 1) ambiguous.push({ key: k, groups, tuples: n });
    else if (Object.hasOwn(ALIAS_T1, k)) {
      const g = ontology.find((o) => o.group_id === ALIAS_T1[k]);
      if (!g) throw new Error(`ALIAS_TARGET_NOT_IN_ONTOLOGY:${k}->${ALIAS_T1[k]}`);
      plan.push({ key: k, groupId: g.group_id, matchedOn: 'alias_t1', tier: 'T1', expected: n });
    } else unmatched.push({ key: k, tuples: n });
  }
  const expectedTotal = plan.reduce((a, p) => a + p.expected, 0);
  receipt.steps.plan = { resolvableKeys: plan.length, resolvableTuples: expectedTotal, ambiguousKeys: ambiguous, unmatchedKeys: unmatched.length, unmatchedTuples: unmatched.reduce((a, u) => a + u.tuples, 0), keys: plan };

  // Pre-image archive (never delete): persist -> deeds_labs/archive + manifest; rehearsal -> .tmp only.
  const targets = (await client.query(`SELECT id, resolution_state, resolved_concept_id, evidence FROM feature_ontology_tuples WHERE predicate = ANY($1) AND object_type = 'domain' AND resolution_state = 'UNRESOLVED' AND replace(object_id, 'domain:', '') = ANY($2) ORDER BY id`, [PREDICATES, plan.map((p) => p.key)])).rows;
  if (targets.length !== expectedTotal) throw new Error(`TARGET_COUNT_MISMATCH:${targets.length}/${expectedTotal}`);
  const preImage = JSON.stringify(targets);
  const preSha = sha256(preImage);
  const archiveRel = PERSIST ? `deeds_labs/archive/${DAY}/feature-ontology-tuples-t0-pre-resolution-v1.json` : '.tmp/atlas/feature-ontology-tuples-t0-pre-resolution-v1.rehearsal.json';
  fs.mkdirSync(path.dirname(path.join(ROOT, archiveRel)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, archiveRel), preImage, 'utf8');
  receipt.steps.archive = { path: archiveRel, sha256: `sha256:${preSha}`, rows: targets.length, manifestEntryWritten: false };

  let updated = 0;
  const perKey = [];
  for (const p of plan) {
    const r = await client.query(
      `UPDATE feature_ontology_tuples SET resolution_state = 'RESOLVED', resolved_concept_id = $1,
         evidence = evidence || jsonb_build_object('resolution', jsonb_build_object('resolver', $2::text, 'resolver_version', $3::text, 'matched_on', $4::text, 'group_id', $5::text, 'tier', $8::text, 'alias_source_key', CASE WHEN $4::text = 'alias_t1' THEN $7::text ELSE NULL END, 'ontology_table', 'atlas_domain_ontology'))
       WHERE predicate = ANY($6) AND object_type = 'domain' AND resolution_state = 'UNRESOLVED' AND replace(object_id, 'domain:', '') = $7`,
      [`domain:${p.groupId}`, RESOLVER.id, RESOLVER.version, p.matchedOn, p.groupId, PREDICATES, p.key, p.tier]);
    updated += r.rowCount;
    perKey.push({ key: p.key, groupId: p.groupId, expected: p.expected, updated: r.rowCount });
  }
  receipt.steps.update = { updated, expectedTotal, perKeyMismatches: perKey.filter((x) => x.expected !== x.updated) };
  if (updated !== expectedTotal || receipt.steps.update.perKeyMismatches.length) throw new Error('UPDATE_COUNT_MISMATCH');

  // Verification.
  const after = (await client.query(`SELECT resolution_state, count(*)::int AS n FROM feature_ontology_tuples GROUP BY 1 ORDER BY 1`)).rows;
  const resolvedOutsideTarget = (await client.query(`SELECT count(*)::int AS n FROM feature_ontology_tuples WHERE resolution_state <> 'UNRESOLVED' AND NOT (predicate = ANY($1) AND object_type = 'domain')`, [PREDICATES])).rows[0].n;
  const badEvidence = (await client.query(`SELECT count(*)::int AS n FROM feature_ontology_tuples WHERE resolution_state = 'RESOLVED' AND NOT (evidence ? 'source' AND evidence ? 'join_method' AND evidence ? 'resolution')`)).rows[0].n;
  const badValues = (await client.query(`SELECT count(*)::int AS n FROM feature_ontology_tuples t WHERE t.resolution_state = 'RESOLVED' AND NOT EXISTS (SELECT 1 FROM atlas_domain_ontology d WHERE 'domain:' || d.group_id = t.resolved_concept_id)`)).rows[0].n;
  const untouched = (await client.query(`SELECT count(*)::int AS n FROM feature_ontology_tuples WHERE object_type <> 'domain' AND (resolution_state <> 'UNRESOLVED' OR resolved_concept_id IS NOT NULL)`)).rows[0].n;
  // Idempotency: after the update nothing in the target set may still be UNRESOLVED (a re-run would match 0 rows).
  const rerun = (await client.query(`SELECT count(*)::int AS n FROM feature_ontology_tuples WHERE predicate = ANY($1) AND object_type = 'domain' AND resolution_state = 'UNRESOLVED' AND replace(object_id, 'domain:', '') = ANY($2)`, [PREDICATES, plan.map((p) => p.key)])).rows[0].n;
  receipt.steps.verify = { byStateAfter: after, resolvedOutsideDomainTuples: resolvedOutsideTarget, resolvedRowsMissingEvidenceKeys: badEvidence, resolvedValuesNotInOntology: badValues, nonDomainTuplesTouched: untouched, remainingUnresolvedTargetsAfterUpdate: rerun };
  if (resolvedOutsideTarget || badEvidence || badValues || untouched || rerun) throw new Error('VERIFY_FAILED');

  if (PERSIST) {
    const manifestPath = path.join(ROOT, 'docs/archive-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.push({ path: `feature_ontology_tuples (${targets.length} T0 domain tuples, pre-resolution)`, archive_path: archiveRel, sha256: preSha, archived: new Date().toISOString(), reason: '14.3b T0 exact domain resolution; pre-image of resolution_state/resolved_concept_id/evidence retained. Recover by restoring those columns by id.' });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    receipt.steps.archive.manifestEntryWritten = true;
    await client.query('COMMIT');
  } else { await client.query('ROLLBACK'); }
  const final = (await client.query(`SELECT resolution_state, count(*)::int AS n FROM feature_ontology_tuples GROUP BY 1 ORDER BY 1`)).rows;
  const expectedResolved = PERSIST ? expectedTotal : 0;
  const gotResolved = final.find((r) => r.resolution_state === 'RESOLVED')?.n ?? 0;
  receipt.steps.after = { byState: final, persisted: PERSIST, expectedResolved, gotResolved };
  if (gotResolved !== expectedResolved) throw new Error('POST_TXN_STATE_MISMATCH');
  finish(PERSIST ? 'RESOLUTION_PROVEN' : 'REHEARSAL_PROVEN');
} catch (err) {
  try { await client.query('ROLLBACK'); } catch { /* closed */ }
  receipt.errors.push(String(err?.message ?? err));
  finish('FAILED_ROLLED_BACK');
} finally {
  client.release();
  await pool.end();
}
