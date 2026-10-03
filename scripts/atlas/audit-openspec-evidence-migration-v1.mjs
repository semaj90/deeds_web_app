import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = [
  'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_fabric_v1.sql',
  'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_fabric_v2.sql',
  'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_retrieval_v1.sql',
  'sveltekit-frontend/drizzle/manual/20261001_openspec_task_identity_history_v1.sql',
];
const SIDECARS = 'sveltekit-frontend/drizzle/sidecar-migrations.json';
const OUTPUT = path.join(ROOT, 'docs', 'reports', 'openspec-evidence-migration-dry-run-v1.json');

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function hasForbiddenMigrationMutation(sql) {
  const withoutComments = String(sql).replace(/--[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return /^\s*(?:INSERT\s+INTO|UPDATE\s+\S|DELETE\s+FROM|TRUNCATE(?:\s|;))/im.test(withoutComments)
    || /^\s*ALTER\s+TABLE\b[^;]*\b(?:DROP|SET)\b/im.test(withoutComments);
}

export function auditOpenSpecEvidenceMigration(root = ROOT) {
  const contents = MIGRATIONS.map((relativePath) => ({ relativePath, text: fs.readFileSync(path.join(root, relativePath), 'utf8') }));
  const sql = contents.map((item) => item.text).join('\n');
  const sidecars = JSON.parse(fs.readFileSync(path.join(root, SIDECARS), 'utf8')).sidecars;
  const requiredRelations = [
    'openspec_changes',
    'openspec_tasks',
    'openspec_dependencies',
    'evidence_receipts',
    'task_evidence',
    'openspec_evidence_chunks',
    'openspec_task_predicate',
    'evidence_assertion',
    'task_evidence_binding',
    'openspec_supersession',
    'openspec_task_current',
    'openspec_task_current_v2',
    'openspec_task_revisions',
    'openspec_task_aliases',
  ];
  const relationChecks = Object.fromEntries(requiredRelations.map((relation) => [relation, new RegExp(`\\b${relation}\\b`, 'i').test(sql)]));
  const forbiddenMutation = hasForbiddenMigrationMutation(sql);
  const sidecarEntries = contents.map(({ relativePath }) => sidecars.find((entry) => entry.file === relativePath.replace('sveltekit-frontend/drizzle/', '')) ?? null);
  const sidecarChecks = Object.fromEntries(contents.map(({ relativePath }, index) => [relativePath, sidecarEntries[index]?.status === 'design_unapplied']));
  const checks = {
    allRequiredRelationsPresent: Object.values(relationChecks).every(Boolean),
    canonicalVector768: /vector\(768\)/i.test(sql),
    hnswCosineIndex: /USING\s+hnsw[\s\S]*vector_cosine_ops/i.test(sql),
    retrievalMetadataIndexes: /openspec_evidence_chunks_metadata_idx/i.test(sql) && /evidence_receipts_state_revision_idx/i.test(sql),
    trigramAndFtsIndexes: /pg_trgm/i.test(sql) && /gin_trgm_ops/i.test(sql) && /to_tsvector\('simple',\s*content\)/i.test(sql),
    noMutationStatements: !forbiddenMutation,
    allSidecarsDesignUnapplied: Object.values(sidecarChecks).every(Boolean),
    proofStateDerivedInView: /CASE[\s\S]*WHEN[\s\S]*PROVEN[\s\S]*ELSE\s+'CLAIM_ONLY'/i.test(sql),
    readbackReceiptRequired: /readback/i.test(sql),
    stableCanonicalTaskKey: /canonical_task_key\s+text/i.test(sql) && /openspec_tasks_canonical_key_uidx/i.test(sql),
    internalSurrogateIdentity: /id\s+bigint\s+GENERATED\s+ALWAYS\s+AS\s+IDENTITY/i.test(sql) && /openspec_tasks_surrogate_id_uidx/i.test(sql),
    surrogatePrimaryKeyInFreshLedger: /CREATE TABLE IF NOT EXISTS public\.openspec_tasks\s*\([\s\S]*?id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY/i.test(sql),
    immutableRevisionHistory: /PRIMARY KEY\s*\(task_row_id,\s*revision\)/i.test(sql)
      && /claim_hash\s+text\s+NOT NULL/i.test(sql)
      && /CREATE TRIGGER openspec_task_revisions_append_only[\s\S]*?BEFORE UPDATE OR DELETE OR TRUNCATE ON public\.openspec_task_revisions/i.test(sql),
    aliasPreservation: /alias_key\s+text PRIMARY KEY/i.test(sql)
      && /DERIVED_KEY/i.test(sql)
      && /CREATE TRIGGER openspec_task_aliases_append_only[\s\S]*?BEFORE UPDATE OR DELETE OR TRUNCATE ON public\.openspec_task_aliases/i.test(sql),
    receiptsBoundToTaskRevision: /canonical_task_key,\s*task_revision[\s\S]*REFERENCES public\.openspec_task_revisions\(canonical_task_key,\s*revision\)/i.test(sql),
    lifecycleSeparatedFromProof: /lifecycle_state\s+text[\s\S]*FINALIZED/i.test(sql) && /AS\s+proof_state/i.test(sql) && !/evidence_state\s+text/i.test(sql),
  };
  const status = Object.values(checks).every(Boolean) ? 'DESIGN_VALIDATED_UNAPPLIED' : 'DESIGN_VALIDATION_FAILED';
  return {
    schema: 'atlas.openspec-evidence-migration-dry-run.v1',
    generatedAt: new Date().toISOString(),
    status,
    mode: 'READ_ONLY_STATIC_SQL_DRY_RUN',
    migrations: contents.map(({ relativePath, text }) => ({ path: relativePath, checksum: sha256(text), bytes: Buffer.byteLength(text, 'utf8') })),
    relations: relationChecks,
    sidecars: sidecarChecks,
    checks,
    canonicalAuthority: 'PostgreSQL 18 after authorized apply and independent readback; not established by this dry-run',
    sideEffects: { sqlApplied: false, databaseMutated: false, rowsSeeded: false },
    likely_cause: 'The EVF schema must be reviewed as additive design before any live ledger or proof-state mutation is authorized.',
    evidence: [...MIGRATIONS, SIDECARS],
    patch_targets: MIGRATIONS,
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-migration-v1.mjs',
    smoke_command: 'node --check scripts/atlas/audit-openspec-evidence-migration-v1.mjs',
    report_path: 'docs/reports/openspec-evidence-migration-dry-run-v1.json',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const report = auditOpenSpecEvidenceMigration();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, checks: report.checks, output: OUTPUT }, null, 2));
}
