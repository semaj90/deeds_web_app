#!/usr/bin/env node
// LINEAGE_COHORT_02 (read-only): reason-coded predicate ladder that mirrors the exact predicates of
// materialize-lineage-qualified-candidate-map-v1.mts. Survivor counts are cumulative, so the first
// stage that drops to zero shows the exclusion boundary. Does not loosen V1 and writes no database rows.
// Writes .tmp/atlas/lineage-cohort-predicate-ladder-v2.json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Per packet, per workspace revision: one flag per V1 predicate. Stages are cumulative below.
const SQL = `
WITH ws AS (
  SELECT DISTINCT workspace_revision::text AS w FROM atlas_workspace_source_bindings WHERE repo_id = 'deeds-web-app'
), bind AS (
  SELECT canonical_source_ref AS source_ref, workspace_revision::text AS ws, source_revision::text AS srev,
         lower(content_digest::text) AS dig
  FROM atlas_workspace_source_bindings WHERE repo_id = 'deeds-web-app'
), gcnt AS (
  SELECT source_ref, workspace_revision::text AS ws, lower(code_source_revision::text) AS csr,
         lower(content_hash::text) AS gh, count(*) AS n
  FROM graphify_files GROUP BY 1, 2, 3, 4
), ccnt AS (
  SELECT source_ref, count(DISTINCT lower(content_hash)) AS dch, max(lower(content_hash)) AS ch
  FROM codebase_chunk_index WHERE NULLIF(btrim(source_ref), '') IS NOT NULL GROUP BY source_ref
), pk AS (
  SELECT packet_key, source_ref, lower(btrim(content_hash)) AS ph, btrim(representation_revision::text) AS rr
  FROM atlas_packets WHERE packet_key IS NOT NULL
), f AS (
  SELECT ws.w, pk.packet_key, pk.source_ref,
    (NULLIF(btrim(pk.source_ref), '') IS NOT NULL AND NULLIF(pk.ph, '') IS NOT NULL) AS p_identity,
    EXISTS (SELECT 1 FROM bind b WHERE b.source_ref = pk.source_ref AND b.ws = ws.w) AS p_binding,
    EXISTS (SELECT 1 FROM bind b JOIN gcnt g ON g.source_ref = b.source_ref AND g.ws = b.ws
              AND g.csr = lower(b.srev) AND g.gh = b.dig
            WHERE b.source_ref = pk.source_ref AND b.ws = ws.w) AS p_graphify_match,
    EXISTS (SELECT 1 FROM bind b JOIN gcnt g ON g.source_ref = b.source_ref AND g.ws = b.ws
              AND g.csr = lower(b.srev) AND g.gh = b.dig
            WHERE b.source_ref = pk.source_ref AND b.ws = ws.w AND g.n = 1) AS p_graphify_unique,
    EXISTS (SELECT 1 FROM ccnt c WHERE c.source_ref = pk.source_ref AND c.dch = 1) AS p_chunk_single_hash,
    EXISTS (SELECT 1 FROM ccnt c WHERE c.source_ref = pk.source_ref AND c.dch = 1 AND c.ch = pk.ph) AS p_packet_eq_chunk,
    EXISTS (SELECT 1 FROM bind b WHERE b.source_ref = pk.source_ref AND b.ws = ws.w AND b.dig = pk.ph) AS p_packet_eq_source,
    (NULLIF(pk.rr, '') IS NOT NULL AND pk.rr NOT IN ('0', 'unknown', 'legacy')) AS p_representation_valid
  FROM ws CROSS JOIN pk
)
SELECT 'S0_packets_with_key' AS stage, w, count(*) FROM f GROUP BY w
UNION ALL SELECT 'S1_identity_source_ref_and_hash', w, count(*) FILTER (WHERE p_identity) FROM f GROUP BY w
UNION ALL SELECT 'S2_binding_in_workspace', w, count(*) FILTER (WHERE p_identity AND p_binding) FROM f GROUP BY w
UNION ALL SELECT 'S3_graphify_exact_revision_and_digest', w, count(*) FILTER (WHERE p_identity AND p_binding AND p_graphify_match) FROM f GROUP BY w
UNION ALL SELECT 'S4_graphify_unique_row', w, count(*) FILTER (WHERE p_identity AND p_binding AND p_graphify_match AND p_graphify_unique) FROM f GROUP BY w
UNION ALL SELECT 'S5_chunk_single_distinct_hash', w, count(*) FILTER (WHERE p_identity AND p_binding AND p_graphify_match AND p_graphify_unique AND p_chunk_single_hash) FROM f GROUP BY w
UNION ALL SELECT 'S6_packet_hash_equals_chunk', w, count(*) FILTER (WHERE p_identity AND p_binding AND p_graphify_match AND p_graphify_unique AND p_chunk_single_hash AND p_packet_eq_chunk) FROM f GROUP BY w
UNION ALL SELECT 'S7_packet_hash_equals_source_digest', w, count(*) FILTER (WHERE p_identity AND p_binding AND p_graphify_match AND p_graphify_unique AND p_chunk_single_hash AND p_packet_eq_chunk AND p_packet_eq_source) FROM f GROUP BY w
UNION ALL SELECT 'S8_representation_revision_valid', w, count(*) FILTER (WHERE p_identity AND p_binding AND p_graphify_match AND p_graphify_unique AND p_chunk_single_hash AND p_packet_eq_chunk AND p_packet_eq_source AND p_representation_valid) FROM f GROUP BY w
ORDER BY 1, 2;
`;

const out = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', `BEGIN READ ONLY; SET LOCAL statement_timeout = '60000'; ${SQL} ROLLBACK;`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const stages = out.split('\n').filter((l) => l.includes('|')).map((l) => {
  const [stage, workspace, survivors] = l.split('|');
  return { stage, workspaceRevision: workspace, survivors: Number(survivors) };
});

const receipt = {
  schema: 'atlas.lineage-cohort-predicate-ladder.v2',
  gate: 'LINEAGE_COHORT_02',
  companionV1: 'scripts/atlas/materialize-lineage-qualified-candidate-map-v1.mts',
  readOnly: true, writesPerformed: false, canonicalAuthority: false, admissionAuthorized: false,
  generatedAt: new Date().toISOString(),
  predicateOrder: 'cumulative; each stage keeps only packets that pass every earlier stage',
  stages,
  limitations: [
    'Counts are per packet row and per workspace revision; V1 also applies LIMIT and a workspace selector.',
    'Graphify uniqueness is counted per (source_ref, workspace, code revision, content hash) group, as in V1.',
    'Stage S8 mirrors V1 representation sentinels (0, unknown, legacy) and does not validate the representation value itself.',
  ],
};
fs.mkdirSync(path.join(ROOT, '.tmp', 'atlas'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.tmp', 'atlas', 'lineage-cohort-predicate-ladder-v2.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(stages, null, 2));
