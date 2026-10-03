#!/usr/bin/env node
/**
 * SCHEMA TOURNAMENT V1 (read-only): for each capability the NLP -> evidence -> feature -> retrieval fabric needs, enumerate candidate
 * homes (REUSE existing table, ALTER it, CREATE a new v2 table, ARTIFACT_ONLY, VIEW), score each against LIVE schema facts, and derive
 * what actually needs updating. Cost rubric (lower wins; ties prefer reuse):
 *   ddl: none 0 | index/column on existing 1 | view 1 | new table 3      newOwner: creates a duplicate owner +3
 *   mutatesCanonical: rewrites canonical/truth-adjacent rows +5           backfill: populate rows +1     fkRisk: FK dependents on a touched table +1
 * Output is a RECOMMENDATION map, never an action: writes ONLY docs/reports/schema-tournament-v1.json, no DDL/DML.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const psql = (sql) => { try { return execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-c', sql]).toString().trim(); } catch { return null; } };
const facts = {};
for (const t of ['atlas_domain_ontology', 'domain_taxonomy_v1', 'taxonomy_nodes', 'atlas_taxonomy_assignment_candidates', 'atlas_ontology_linked_tuples', 'atlas_ontology_tuples', 'feature_ontology_tuples', 'atlas_ontology_concepts', 'atlas_ontology_relations', 'atlas_concepts', 'concept_records', 'ontology_keywords', 'registry_topology_projection', 'atlas_symbol_versions', 'atlas_ast_nodes', 'feature_domain', 'feature_domain_facts', 'atlas_packets']) {
  const rows = psql(`select count(*) from ${t}`);
  const fk = psql(`select count(*) from pg_constraint where confrelid='public.${t}'::regclass and contype='f'`);
  facts[t] = { rows: rows === null ? null : Number(rows), fkDependents: fk === null ? null : Number(fk) };
}
const hasCol = (t, c) => psql(`select count(*) from information_schema.columns where table_name='${t}' and column_name='${c}'`) === '1';
const F = (t) => facts[t]?.rows;
const opt = (name, action, target, c, why) => ({ name, action, target, cost: (c.ddl ?? 0) + (c.newOwner ? 3 : 0) + (c.mutatesCanonical ? 5 : 0) + (c.unfit ? 5 : 0) + (c.backfill ? 1 : 0) + (c.fk ? 1 : 0), breakdown: c, why });
const CAPS = [
  { id: 'DOMAIN_HIERARCHY_OWNER', needs: 'versioned hierarchy owner for domain_class', options: [
    opt('populate domain_taxonomy_v1', 'REUSE_POPULATE', 'domain_taxonomy_v1', { backfill: 1 }, `${F('domain_taxonomy_v1')} rows; already has version/is_active/parent_domain_id/deprecated_at/replaced_by — no DDL`),
    opt('alter atlas_domain_ontology', 'ALTER_EXISTING', 'atlas_domain_ontology', { ddl: 1 }, `${F('atlas_domain_ontology')} rows; has hierarchy but no revision/active/deprecation columns`),
    opt('create domain_hierarchy_v2', 'CREATE_NEW', 'domain_hierarchy_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'fourth vocabulary owner — violates Duplication Prevention')], operatorDecision: 'which vocabulary owns domain_class (atlas_domain_ontology vs code CANONICAL_DOMAINS)', reindex: 'none until owner chosen' },
  { id: 'LABEL_ALIAS_NORMALIZATION', needs: 'fold graph/Graph, ui->frontend, etc. without rewriting packets', options: [
    opt('deprecated-label rows with replaced_by + normalizing VIEW', 'VIEW_PLUS_REUSE', 'domain_taxonomy_v1 + v_atlas_packets_domain_normalized', { ddl: 1, backfill: 1 }, 'no packet rows mutated; alias = deprecated label replaced_by canonical'),
    opt('UPDATE atlas_packets.domain_class', 'MUTATE_CANONICAL', 'atlas_packets', { mutatesCanonical: 1, backfill: 1, fk: 0 }, `${F('atlas_packets')} rows rewritten; classifier lineage lost`),
    opt('create domain_label_alias table', 'CREATE_NEW', 'domain_label_alias', { ddl: 3, newOwner: 1, backfill: 1 }, 'duplicates replaced_by semantics')], reindex: 'feature_domain / Qdrant payload domain field re-derive only AFTER approval' },
  { id: 'GROUNDED_EXTRACTION_TOKEN_EVIDENCE', needs: 'LangExtract spans, POS, token evidence (NLP-EXTRACT-03, TokenFeatureMatrix inputs)', options: [
    opt('populate atlas_ontology_linked_tuples (+ revision columns, Zod span contract)', 'REUSE_ALTER_POPULATE', 'atlas_ontology_linked_tuples', { ddl: 1, backfill: 1 }, `${F('atlas_ontology_linked_tuples')} rows; has packet_key, tree_node_id, token_index, part_of_speech, label_kind, evidence_refs, relation_revision`),
    opt('alter feature_ontology_tuples', 'ALTER_EXISTING', 'feature_ontology_tuples', { ddl: 1, unfit: 1 }, `${F('feature_ontology_tuples')} UNRESOLVED rows; feature-level, not token-level`),
    opt('create grounded_extraction_v2', 'CREATE_NEW', 'grounded_extraction_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'duplicates linked_tuples')], verify: 'linked_tuples has evidence_span, evidence_state, lifecycle, provenance, producer_revision; confirm evidence_span stores UTF8_PARSER_BUFFER_V1 byte offsets before populating', reindex: 'none (empty table)' },
  { id: 'TAXONOMY_ASSIGNMENT_CANDIDATES', needs: 'per-lane evidence candidates for domain/topic/concept assignment', options: [
    opt('populate atlas_taxonomy_assignment_candidates', 'REUSE_POPULATE', 'atlas_taxonomy_assignment_candidates', { backfill: 1 }, `${F('atlas_taxonomy_assignment_candidates')} rows; already carries taxonomy_revision/semantic_revision/graph_revision + lexical/nlp/graph evidence_refs + semantic_score`),
    opt('create assignment_v2', 'CREATE_NEW', 'assignment_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'duplicate')], reindex: 'none' },
  { id: 'CONCEPTS_AND_RELATIONS', needs: 'OAK concept/relation store', options: [
    opt('populate atlas_ontology_concepts + atlas_ontology_relations', 'REUSE_POPULATE', 'atlas_ontology_concepts, atlas_ontology_relations', { backfill: 1, fk: 1 }, `concepts ${F('atlas_ontology_concepts')} rows (${facts.atlas_ontology_concepts.fkDependents} FK dependents), relations ${F('atlas_ontology_relations')} rows`),
    opt('create concept_registry_v2', 'CREATE_NEW', 'concept_registry_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'duplicate of existing OAK tables')], flagDuplicates: ['atlas_concepts', 'concept_records'].filter((t) => F(t) === 0).map((t) => `${t}: 0 rows, zero FK dependents — DEAD/duplicate candidate (archive, do not delete)`) },
  { id: 'TUPLE_OWNER', needs: 'one owner for ontology tuple resolution', options: [
    opt('keep feature_ontology_tuples as resolution owner (14.3b)', 'REUSE_EXISTING', 'feature_ontology_tuples', { backfill: 0 }, `${F('feature_ontology_tuples')} rows, 100% UNRESOLVED — the real 14.3b target`),
    opt('promote atlas_ontology_tuples', 'REUSE_POPULATE', 'atlas_ontology_tuples', { backfill: 1, newOwner: 1 }, `${F('atlas_ontology_tuples')} rows — would compete with feature_ontology_tuples`)], flagDuplicates: ['atlas_ontology_tuples (0 rows) overlaps feature_ontology_tuples and atlas_ontology_linked_tuples; registry_ontology_tuples / ontology_domain_tuples not audited here'] },
  { id: 'SYMBOL_LINK', needs: 'exact StructuralMatch -> symbol registry resolution (SYMBOL-LINK-04)', options: [
    opt('add indexes on atlas_symbol_versions(source_revision, qualified_name)', 'ALTER_EXISTING', 'atlas_symbol_versions', { ddl: 1 }, `${F('atlas_symbol_versions')} rows; index-only ALTER, no data change; audit-postgres-index-capability found both missing`),
    opt('create symbol_link_v2', 'CREATE_NEW', 'symbol_link_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'duplicate of atlas_symbol_versions')], reindex: 'atlas_symbol_versions must be re-materialized from regenerated sept_v2 candidates (only 479 versions vs 3,043 candidate files)' },
  { id: 'AST_GENERATION', needs: 'separate sept_v2 rows from 11,273 legacy rows', options: [
    opt('add atlas_ast_nodes.ast_generation (20260920 migration)', 'ALTER_EXISTING', 'atlas_ast_nodes', { ddl: 1 }, `drafted + rollback-rehearsed; column present now: ${hasCol('atlas_ast_nodes', 'ast_generation')}; FK dependents ${facts.atlas_ast_nodes.fkDependents}`),
    opt('create atlas_ast_nodes_sept_v2', 'CREATE_NEW', 'atlas_ast_nodes_sept_v2', { ddl: 3, newOwner: 1, backfill: 1, fk: 1 }, 'breaks 5 FK dependents; competing identity owner')] },
  { id: 'TOPOLOGY_FEATURES', needs: 'revision-qualified KMeans/SOM projection (som_revision is NULL on 58,365 packets)', options: [
    opt('alter registry_topology_projection (+som_revision, kmeans_revision, representation_revision, candidate_snapshot_revision)', 'ALTER_EXISTING', 'registry_topology_projection', { ddl: 1 }, `${F('registry_topology_projection')} rows — empty, so column adds are free; already has som_cluster/kmeans_cluster/page_rank_score/community_id/materialization_version`),
    opt('create topology_projection_v2', 'CREATE_NEW', 'topology_projection_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'duplicate of an empty table built for this')], reindex: 'needs a fresh versioned SOM run + KMeans run (cannot derive revisions from July artifacts)' },
  { id: 'FEATURE_MATRICES', needs: 'Query/Candidate/Token/Topology matrices under one ordinal+checksum contract', options: [
    opt('Arrow/mmap artifacts + JSON receipt', 'ARTIFACT_ONLY', 'artifact + docs/reports receipt', {}, 'wire-format rule: bulk numeric arrays never through JSON/tables; CandidateOrdinal is a frozen coordinate, not identity'),
    opt('create feature_matrix table', 'CREATE_NEW', 'feature_matrix_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'violates wire-format layering')], reindex: 'none' },
  { id: 'CALIBRATION_EXAMPLES', needs: '100-300 hand-reviewed revision-qualified examples (DOMAIN-CAL-02)', options: [
    opt('checked-in JSONL fixture with revision + reviewer', 'ARTIFACT_ONLY', 'fixture file', {}, 'small, hand-reviewed, versioned by git; no table until volume/lifecycle demands one'),
    opt('create domain_calibration_v2 table', 'CREATE_NEW', 'domain_calibration_v2', { ddl: 3, newOwner: 1, backfill: 1 }, 'premature for <=300 rows')] },
  { id: 'KEYWORD_LEXICAL_FEATURES', needs: 'lexical features per feature', options: [
    opt('reuse ontology_keywords', 'REUSE_EXISTING', 'ontology_keywords', {}, `${F('ontology_keywords')} rows keyed by feature_id`)] },
];
const needsFor = (c) => {
  if (c.operatorDecision) return c.operatorDecision;
  const a = c.options[0].action;
  if (a === 'MUTATE_CANONICAL') return 'yes (mutates canonical rows)';
  if (a.includes('ALTER') && a.includes('POPULATE')) return 'DDL approval + bounded-canary write';
  if (a.startsWith('ALTER') || a.includes('VIEW')) return 'DDL approval';
  if (a.includes('POPULATE')) return 'write approval (bounded canary)';
  return 'no';
};
for (const c of CAPS) { c.options.sort((a, b) => a.cost - b.cost || (a.action.startsWith('REUSE') ? -1 : 1)); c.winner = c.options[0].name; c.winnerAction = c.options[0].action; c.needsOperator = needsFor(c); }
const tally = {}; for (const c of CAPS) tally[c.winnerAction] = (tally[c.winnerAction] ?? 0) + 1;
const report = { schema: 'atlas.schema-tournament.v1', generatedAt: new Date().toISOString(), rubric: 'ddl none0/alter1/view1/newtable3 + newOwner3 + mutatesCanonical5 + backfill1 + fk1; lowest wins', liveFacts: facts, capabilities: CAPS, winnerTally: tally, createNewWinners: CAPS.filter((c) => c.winnerAction === 'CREATE_NEW').map((c) => c.id), applied: false, writesPerformed: false, canonicalAuthority: false };
fs.writeFileSync(path.join(ROOT, 'docs/reports/schema-tournament-v1.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ winnerTally: tally, createNewWinners: report.createNewWinners }, null, 1));
for (const c of CAPS) console.log(`${c.id.padEnd(34)} -> ${c.winnerAction.padEnd(16)} ${c.winner.slice(0, 70)}  [operator: ${String(c.needsOperator).slice(0, 44)}]`);
