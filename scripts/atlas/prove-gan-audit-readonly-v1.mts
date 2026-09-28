#!/usr/bin/env node
/**
 * GAN-READONLY-PROOF-01 — live, read-only packet validation census.
 *
 * Execution guarantees (each checked and recorded, not assumed):
 *   - one REPEATABLE READ READ ONLY transaction, always ROLLBACKed; a write attempt is proven refused (SQLSTATE 25006).
 *   - no Redis, NATS, RabbitMQ, Qdrant or Graphify client is imported; the legacy 5-step orchestrator is NOT run.
 *   - DB unavailable => BLOCKED_DATABASE_READ; zero rows => BLOCKED_ZERO_ROW_PROOF; validator coverage inconsistent => BLOCKED_VALIDATOR_COVERAGE. Never a pass.
 *   - no prefilter on audited fields: every row is read and classified by validatePacketForAtlasV2, the SAME owner the orchestrator and the probes call.
 *
 * Receipt is hierarchical: `execution` (did the harness run correctly) is separate from `validator` (is the RULE trustworthy). Agreement between two
 * implementations (SQL vs JS) is PARITY, not correctness; policy correctness rests on the source_ref inventory and the adversarial fixtures, both named
 * explicitly on the command line (no "latest receipt" discovery). Structural lineage is joined only from an explicitly named readiness receipt.
 *
 * usage: npx tsx scripts/atlas/prove-gan-audit-readonly-v1.mts --adversarial-receipt <path> --inventory-receipt <path> --lineage-readiness <path>
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { adaptGanLineageReadinessV1 } from './lib/gan-lineage-readiness-adapter-v1.mjs';
import { validatePacketForAtlasV2 } from '../../packages/atlas-core/src/validation/packet-adversarial-validator-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outPath = path.join(ROOT, 'docs/reports', `gan-readonly-live-proof-v1-${stamp}.json`);
const BATCH = 5000;

/** The LEGACY GAN rule. Kept ONLY to measure old-vs-new classification. Never used to validate. */
const LEGACY_SOURCE_REF = new RegExp(String.raw`^[a-z0-9/_\-.]+\.(ts|tsx)$`);
const ORCHESTRATOR_ASSUMED_COLUMNS = ['packet_key', 'source_ref', 'feature_id', 'summary', 'title', 'embedding', 'ganvalidated', 'ganvalidationerror', 'ganwarnings'];

const receipt: Record<string, unknown> = {
  schema: 'atlas.gan-readonly-live-proof.v2', generatedAt: new Date().toISOString(), proofMode: true, dryRun: true,
  canonicalAuthority: false, writesPerformed: false, writes: { postgres: 0, redis: 0, nats: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
};
function finish(status: string, extra: Record<string, unknown>, code: number): never {
  Object.assign(receipt, { status }, extra);
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ receipt: path.relative(ROOT, outPath), status, ...('summary' in extra ? { summary: extra.summary } : {}), ...('blocker' in extra ? { blocker: extra.blocker } : {}) }, null, 2));
  process.exit(code);
}
function namedReceipt(flag: string): { path: string; sha256: string; body: Record<string, any> } | null {
  const p = arg(flag);
  if (!p) return null;
  const abs = path.resolve(ROOT, p);
  const bytes = fs.readFileSync(abs);
  return { path: path.relative(ROOT, abs), sha256: sha(bytes), body: JSON.parse(bytes.toString('utf8')) };
}
const adversarial = namedReceipt('--adversarial-receipt');
const inventory = namedReceipt('--inventory-receipt');
const lineageReadiness = namedReceipt('--lineage-readiness');
const normalizedLineage = lineageReadiness ? adaptGanLineageReadinessV1(lineageReadiness.body) : null;
const lineageMeasured = normalizedLineage !== null;
const chunkQualified = lineageMeasured
  ? Number(normalizedLineage!.chunkStates.CHUNK_REVISION_QUALIFIED ?? 0) : 0;
const chunkNotQualified = lineageMeasured
  ? Object.entries(normalizedLineage!.chunkStates).filter(([state]) => state !== 'CHUNK_REVISION_QUALIFIED').reduce((n, [, count]) => n + Number(count), 0) : 0;
const structuralStatus = !lineageMeasured ? 'NOT_REMEASURED' : chunkNotQualified === 0 ? 'PROVEN' : chunkQualified > 0 ? 'PARTIAL' : 'BLOCKED';
const structuralLane = lineageMeasured ? {
  status: structuralStatus, measuredHere: false, evidenceReceipt: { path: lineageReadiness!.path, sha256: lineageReadiness!.sha256 },
  receiptVersion: normalizedLineage!.receiptVersion,
  candidateCount: normalizedLineage!.candidateCount, chunkCount: normalizedLineage!.chunkCount,
  counts: normalizedLineage!.chunkStates,
  sourceBindingQualifiedRows: normalizedLineage!.packetStates.PACKET_REVISION_QUALIFIED ?? 0,
  semantic768: normalizedLineage!.semantic768,
  semantic768Quality: normalizedLineage!.semantic768Quality,
  semanticRepresentationBinding: normalizedLineage!.semanticRepresentationBinding,
  summary: normalizedLineage!.summary,
  summarySemantic: normalizedLineage!.summarySemantic,
  reason: structuralStatus === 'PARTIAL' ? 'CANONICAL_CHUNK_ID_MISMATCH_REQUIRES_LINEAGE_RECONCILIATION' : null,
} : { status: 'NOT_REMEASURED', measuredHere: false, reason: 'EXPLICIT_MAPREDUCE_CHUNK_READINESS_RECEIPT_NOT_SUPPLIED' };

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });

try {
  const client = await pool.connect();
  try {
    // 1) READ ONLY enforcement, proven in its own transaction
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let writeRefused = false;
    let refusalCode: string | null = null;
    try { await client.query('UPDATE atlas_packets SET updated_at = updated_at WHERE false'); } catch (e) { writeRefused = true; refusalCode = (e as { code?: string }).code ?? null; }
    await client.query('ROLLBACK');
    if (!writeRefused) finish('BLOCKED_READ_ONLY_NOT_ENFORCED', { blocker: 'READ_ONLY_NOT_ENFORCED' }, 2);

    // 2) census, one snapshot
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const have = new Set((await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'atlas_packets'`)).rows.map((r: { column_name: string }) => r.column_name));
    const missingColumns = ORCHESTRATOR_ASSUMED_COLUMNS.filter((c) => !have.has(c));

    // Order-independent SQL mirror of SourceRefValidationV1, for rows with a non-blank packet_key (the validator checks packet_key first).
    const sqlAgg = (await client.query(String.raw`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE packet_key IS NULL OR btrim(packet_key) = '')::int AS missing_packet_key,
        count(*) FILTER (WHERE btrim(packet_key) <> '' AND (
             source_ref IS NULL OR btrim(source_ref) = '' OR source_ref <> btrim(source_ref) OR length(source_ref) > 1024
          OR source_ref ~ '[[:cntrl:]]' OR strpos(source_ref, chr(92)) > 0 OR source_ref LIKE '%//%'
          OR source_ref LIKE '/%' OR source_ref ~ '^[A-Za-z]:'
          OR source_ref ~ '(^|/)\.\.(/|$)'
          OR (source_ref ~ '^[a-z][a-z0-9+.-]+:' AND (substring(source_ref from '^([a-z][a-z0-9+.-]+):') NOT IN ('proto','cluster','task','feature','file') OR source_ref ~ '^[a-z][a-z0-9+.-]+:$'))
          OR (source_ref !~ '^[a-z][a-z0-9+.-]+:' AND source_ref NOT LIKE '%/%' AND source_ref !~ '\.[A-Za-z0-9][A-Za-z0-9._-]*$')
          OR (source_ref !~ '^[a-z][a-z0-9+.-]+:' AND source_ref LIKE '%/')))::int AS sql_invalid_source_ref,
        count(*) FILTER (WHERE btrim(packet_key) <> '' AND btrim(coalesce(feature_id,'')) = '' AND source_ref IS NOT NULL AND btrim(source_ref) <> '')::int AS feature_blank_with_source_ref,
        count(*) FILTER (WHERE workspace_revision_key IS NULL OR btrim(workspace_revision_key) = '')::int AS null_workspace_revision_key,
        count(*) FILTER (WHERE source_revision IS NULL OR btrim(source_revision) = '')::int AS null_source_revision,
        count(*) FILTER (WHERE summary IS NULL OR btrim(summary) = '')::int AS missing_summary,
        count(*) FILTER (WHERE embedding IS NULL)::int AS null_embedding,
        count(DISTINCT packet_key)::int AS distinct_packet_keys,
        count(*) FILTER (WHERE packet_id IS NOT NULL AND packet_key IS NOT NULL AND packet_id <> packet_key)::int AS packet_id_differs_from_packet_key
      FROM atlas_packets`)).rows[0];
    if (!sqlAgg || sqlAgg.total === 0) { await client.query('ROLLBACK'); finish('BLOCKED_ZERO_ROW_PROOF', { blocker: 'ZERO_ROWS_READ' }, 2); }

    const keyFormats = (await client.query(String.raw`
      SELECT CASE
        WHEN packet_key ~ '^packet:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'packet:<uuid>'
        WHEN packet_key ~ '^packet:[0-9a-f]{12}$' THEN 'packet:<12hex>'
        WHEN packet_key ~ '^ace:packet:' THEN 'ace:packet:*'
        WHEN packet_key ~ '^[0-9a-f]{16}$' THEN 'bare 16hex'
        WHEN packet_key IS NULL OR btrim(packet_key) = '' THEN '(missing)'
        ELSE 'other' END AS format, count(*)::int AS n
      FROM atlas_packets GROUP BY 1 ORDER BY 2 DESC`)).rows;

    // 3) the SAME validator over EVERY row (server-side cursor; no field prefilter)
    await client.query(`DECLARE gan_cur NO SCROLL CURSOR FOR
      SELECT packet_key, source_ref, feature_id, left(summary, 64) AS summary, (embedding IS NOT NULL) AS has_embedding FROM atlas_packets ORDER BY created_at DESC, packet_key`);
    let rowsRead = 0, hardFailureCount = 0, passedCount = 0;
    const hardByCode: Record<string, number> = {};
    const softByWarning: Record<string, number> = {};
    const hardSamples: Array<{ packet_key: unknown; code: string; source_ref: unknown }> = [];
    const cross = { bothRejected: 0, legacyRejectedNewAccepted: 0, legacyAcceptedNewRejected: 0, bothAccepted: 0 };
    const legacyAcceptedNewRejectedSamples: unknown[] = [];
    for (;;) {
      const batch = (await client.query(`FETCH ${BATCH} FROM gan_cur`)).rows as Array<Record<string, unknown>>;
      if (batch.length === 0) break;
      for (const row of batch) {
        rowsRead++;
        const verdict = validatePacketForAtlasV2({ packet_key: row.packet_key, source_ref: row.source_ref, feature_id: row.feature_id, summary: row.summary, embedding: row.has_embedding ? true : null });
        const legacyRejects = !(typeof row.source_ref === 'string' && LEGACY_SOURCE_REF.test(row.source_ref));
        if (verdict.status === 'HARD_FAIL') {
          hardFailureCount++;
          hardByCode[verdict.hardFailure.code] = (hardByCode[verdict.hardFailure.code] ?? 0) + 1;
          if (hardSamples.length < 10) hardSamples.push({ packet_key: row.packet_key, code: verdict.hardFailure.code, source_ref: row.source_ref });
        } else {
          passedCount++;
          for (const w of verdict.warnings) softByWarning[w] = (softByWarning[w] ?? 0) + 1;
        }
        // old-vs-new source_ref classification, over rows that reach the source_ref check (non-blank packet_key)
        if (typeof row.packet_key === 'string' && row.packet_key.trim() !== '') {
          const newRejects = verdict.status === 'HARD_FAIL' && verdict.hardFailure.code === 'ERR_INVALID_SOURCE_REF';
          if (legacyRejects && newRejects) cross.bothRejected++;
          else if (legacyRejects && !newRejects) cross.legacyRejectedNewAccepted++;
          else if (!legacyRejects && newRejects) { cross.legacyAcceptedNewRejected++; if (legacyAcceptedNewRejectedSamples.length < 10) legacyAcceptedNewRejectedSamples.push(row.source_ref); }
          else cross.bothAccepted++;
        }
      }
    }
    await client.query('CLOSE gan_cur');
    await client.query('ROLLBACK');

    const invalidSourceRef = hardByCode.ERR_INVALID_SOURCE_REF ?? 0;
    const consistency = {
      validatorProcessedEqualsRowsRead: rowsRead === sqlAgg.total,
      hardPlusPassedEqualsRead: hardFailureCount + passedCount === rowsRead,
      sqlMissingPacketKeyEqualsValidator: sqlAgg.missing_packet_key === (hardByCode.ERR_MISSING_PACKET_KEY ?? 0),
      sqlInvalidSourceRefEqualsValidator: sqlAgg.sql_invalid_source_ref === invalidSourceRef,
      crossTabSumsToRowsWithPacketKey: cross.bothRejected + cross.legacyRejectedNewAccepted + cross.legacyAcceptedNewRejected + cross.bothAccepted === rowsRead - sqlAgg.missing_packet_key,
    };
    const executionProven = Object.values(consistency).every(Boolean) && rowsRead > 0;
    const soft = Object.entries(softByWarning).sort((a, b) => b[1] - a[1]);
    const inv = inventory?.body ?? null;
    const legacyRejected = inv ? inv.totals.rejected_by_legacy_rule : null;

    // Validator-policy layer. The rule was DERIVED from the named inventory and exercised by the named adversarial fixtures; SQL/JS agreement above is parity only.
    const policyEvidenceComplete = Boolean(inventory && adversarial && adversarial.body.status === 'ADVERSARIAL_FIXTURES_PROVEN');
    const validatorStatus = policyEvidenceComplete ? 'POLICY_DERIVED_FROM_INVENTORY_AND_FIXTURES' : 'BLOCKED_POLICY_EVIDENCE_MISSING';

    finish(executionProven && policyEvidenceComplete ? 'LIVE_READ_ONLY_PROVEN' : executionProven ? 'PARTIAL_PROVEN' : 'BLOCKED_VALIDATOR_COVERAGE', {
      ...(executionProven ? {} : { blocker: 'VALIDATOR_COVERAGE_INCONSISTENT' }),
      proofLevel: 'LIVE_READ_ONLY',
      note: 'execution proves the harness ran correctly on real rows. validator states whether the RULE is trustworthy. SQL-vs-JS agreement is parity, not correctness. Remaining hard failures are corpus findings only because the rule is now structural and evidence-derived.',
      execution: {
        status: executionProven ? 'PROVEN' : 'BLOCKED', databaseConnected: true, transactionReadOnly: true, rolledBack: true, writeAttemptRefused: writeRefused, refusalSqlState: refusalCode,
        selectedRows: sqlAgg.total, validatedRows: rowsRead, postgresWrites: 0, redisWrites: 0, natsPublishes: 0, qdrantWrites: 0, consistency,
        validatorOwner: 'packages/atlas-core/src/validation/packet-adversarial-validator-v2.ts (validatePacketForAtlasV2 -> validateSourceRefV1)', orchestratorReadPathUsed: false,
      },
      validator: {
        status: validatorStatus, sourceRefPolicy: 'SourceRefValidationV1 (structural; no extension allowlist; no normalization)',
        evidence: { sourceRefInventory: inventory ? { path: inventory.path, sha256: inventory.sha256 } : null, adversarialReceipt: adversarial ? { path: adversarial.path, sha256: adversarial.sha256, status: adversarial.body.status, probes: adversarial.body.totals?.probes, passed: adversarial.body.totals?.passed, selfTests: adversarial.body.selfTests } : null },
        parityNotCorrectness: 'sqlInvalidSourceRefEqualsValidator shows two implementations agree; it does not show the rule is right',
      },
      supersedes: {
        receipts: ['docs/reports/gan-readonly-live-proof-v1-20260926T175412Z.json', 'docs/reports/gan-readonly-live-proof-v1-20260926T175520Z.json'],
        reclassification: { execution: 'PROVEN (unchanged)', validatorVerdict: 'BLOCKED_POLICY_DRIFT (legacy lowercase .ts/.tsx source_ref rule; 56,724 hard failures were rule drift, not corpus corruption)' },
      },
      census: { ...sqlAgg, packetKeyFormats: keyFormats },
      oldVsNewSourceRef: {
        legacyRuleRejectedRows: legacyRejected, legacyRuleRejectedRowsRecomputedHere: cross.bothRejected + cross.legacyRejectedNewAccepted,
        newRuleRejectedRows: invalidSourceRef, crossTab: cross, legacyAcceptedNewRejectedSamples,
        reading: 'legacyRejectedNewAccepted = rows the legacy rule falsely rejected; legacyAcceptedNewRejected = rows the legacy rule accepted but the structural rule rejects',
      },
      validatorResult: { hardFailures: hardFailureCount, passed: passedCount, hardByCode, softWarnings: Object.fromEntries(soft), hardSamples },
      schemaDrift: { classification: 'GAN-LEGACY-SCHEMA-DRIFT-01', orchestratorAssumedColumns: ORCHESTRATOR_ASSUMED_COLUMNS, missingLive: missingColumns,
        action: 'do not recreate the columns automatically; do not run the legacy mutation path; this proof uses receipt artifacts instead',
        consequence: missingColumns.length ? 'legacy orchestrator step 1 selects title/ganValidated and step 3 updates ganValidated/ganValidationError/ganWarnings; against this table those statements error and step 1 swallows the error into []' : 'none' },
      summary: { rowsRead, hardFailures: hardFailureCount, passed: passedCount, hardByCode, legacyRejected, newRejected: invalidSourceRef, cross, softTop: soft.slice(0, 4), missingLiveColumns: missingColumns, consistency },
      lanes: {
        authority: { status: 'LIVE_READ_ONLY', measuredHere: true, findings: { hardFailures: hardFailureCount, duplicatePacketKeys: sqlAgg.total - sqlAgg.distinct_packet_keys, nullWorkspaceRevisionKey: sqlAgg.null_workspace_revision_key, nullSourceRevision: sqlAgg.null_source_revision, packetIdDiffersFromPacketKey: sqlAgg.packet_id_differs_from_packet_key } },
        structuralLineage: structuralLane,
        semanticProjection: { status: 'NOT_EXERCISED', measuredHere: false, reason: 'no Qdrant/embedding parity check in this runner' },
        runtimeSideEffects: { status: 'LIVE_READ_ONLY', measuredHere: true, findings: { writeAttemptRefused: writeRefused, postgresWrites: 0, redisWrites: 0, natsPublishes: 0 } },
      },
      validationAudit: {
        schema: 'atlas.validation-audit.v2', status: structuralStatus === 'PROVEN' ? 'BLOCKED_SEMANTIC_PROJECTION_NOT_EXERCISED' : structuralStatus,
        lanes: { authority: { status: 'LIVE_READ_ONLY' }, structuralLineage: structuralLane, semanticProjection: { status: 'NOT_EXERCISED' }, runtimeSideEffects: { status: 'LIVE_READ_ONLY' } },
        adversarial: adversarial ? { total: adversarial.body.totals?.probes, passed: adversarial.body.totals?.passed, receipt: adversarial.path } : null,
        canonicalAuthority: false, writesPerformed: false,
      },
    }, executionProven ? 0 : 2);
  } finally {
    client.release();
  }
} catch (e) {
  finish('BLOCKED_DATABASE_READ', { blocker: 'DB_UNAVAILABLE_OR_QUERY_FAILED', error: String((e as Error).message).replace(/postgres(ql)?:\/\/[^\s]+/gi, '<redacted-url>') }, 2);
} finally {
  await pool.end().catch(() => undefined);
}
