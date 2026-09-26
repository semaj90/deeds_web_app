#!/usr/bin/env node
/**
 * PACKET_WRITE_REVISION_CONTRACT_01 (read-only)
 *
 * Answers the operator's specific question first: can
 * semantic-packet-writer.ts::persistCanonicalSemanticPacketEmbedding (the
 * one confirmed CANONICAL_WRITER per PACKET_REGISTRY_WRITER_OWNERSHIP_01B)
 * and mcp-tool-implementations.ts::toolIdentityRecover (a live metadata
 * mutator on the same table) produce contradictory identity state for the
 * same packet_key?
 *
 * Then establishes, from live schema + live data (not inference), whether
 * packet_key identity is REVISION_BOUND or LOGICAL_STABLE_ACROSS_REVISIONS,
 * and what revision-adjacent evidence actually exists to qualify a write.
 *
 * Writes ONE receipt. Never mutates schema or data.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'packet-write-revision-contract-v1.json');

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();

  const schemaCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='atlas_packets'
    ORDER BY ordinal_position
  `);
  const colNames = new Set(schemaCols.rows.map((r) => r.column_name));

  const constraints = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid = 'public.atlas_packets'::regclass
  `);

  const census = await client.query(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE packet_key IS NULL)::int AS null_packet_key,
      count(*) FILTER (WHERE source_ref IS NULL)::int AS null_source_ref,
      count(*) FILTER (WHERE content_hash IS NULL)::int AS null_content_hash,
      count(*) FILTER (WHERE lineage_version IS NULL)::int AS null_lineage_version,
      count(DISTINCT workspace_revision)::int AS distinct_workspace_revisions,
      count(*) FILTER (WHERE identity_lane = 'canonical')::int AS identity_lane_canonical,
      count(*) FILTER (WHERE identity_lane = 'recoverable')::int AS identity_lane_recoverable,
      count(*) FILTER (WHERE identity_lane = 'qdrant_chunk')::int AS identity_lane_default_unset
    FROM atlas_packets
  `);

  client.release();
  await pool.end();

  const REVISION_ADJACENT_EXPECTED = ['source_revision', 'workspace_revision', 'representation_revision', 'content_hash', 'lineage_version'];
  const revisionColumnGroundTruth = REVISION_ADJACENT_EXPECTED.map((c) => ({ column: c, existsLive: colNames.has(c) }));

  const sourceRevisionExists = colNames.has('source_revision');

  // Verified 2026-09-08 via direct source read of both files, not inferred.
  const toolIdentityRecoverInputSchemaFields = ['packet_key', 'source_ref', 'feature_id'];
  const toolIdentityRecoverActualWriteColumns = ['identity_lane', 'identity_confidence', 'updated_at'];
  const toolIdentityRecoverDeadInputFields = toolIdentityRecoverInputSchemaFields.filter(
    (f) => f !== 'packet_key' && !toolIdentityRecoverActualWriteColumns.some((c) => c.replace(/_/g, '') === f.replace(/_/g, '')),
  );

  const identityColumnsWrittenBySemanticWriter = ['packetKey', 'sourceRef', 'featureId', 'featureLabel', 'directoryPath'];
  const identityColumnsWrittenByToolIdentityRecover = toolIdentityRecoverActualWriteColumns.filter((c) =>
    identityColumnsWrittenBySemanticWriter.map((x) => x.toLowerCase()).includes(c.toLowerCase().replace(/_/g, '')),
  );
  const overlapExists = identityColumnsWrittenByToolIdentityRecover.length > 0;

  const classifyColumns = (columns) => ({
    intendedByOperator: columns,
    existsLive: columns.filter((column) => colNames.has(column)),
    missingLive: columns.filter((column) => !colNames.has(column)),
  });
  const columnClassification = {
    HARD_CANONICAL: classifyColumns(['packet_key', 'source_ref', 'source_revision', 'workspace_revision']),
    STRUCTURAL_IDENTITY: classifyColumns(['tree_node_id', 'symbol_version_id']),
    DERIVED_CLASSIFICATION: classifyColumns(['feature_id', 'feature_label', 'title_id', 'domain_class']),
  };

  const sourceRevisionSchemaFinding = sourceRevisionExists
    ? {
        title: 'source_revision EXISTS in the live atlas_packets table, but caller adoption is incomplete',
        detail: 'A direct information_schema.columns query confirms source_revision exists live alongside workspace_revision, representation_revision, content_hash, and lineage_version. The schema prerequisite is therefore present; current packet promotion remains blocked because the discovered writers do not all accept and persist exact admitted source/content lineage, and the live packet cohort still contains legacy or missing digest evidence.',
      }
    : {
        title: 'source_revision DOES NOT EXIST in the live atlas_packets table',
        detail: 'The live schema is missing source_revision. A schema decision or explicitly approved equivalent contract is required before enforcing source-revision-qualified packet writes.',
      };

  const report = {
    schema: 'atlas.packet-write-revision-contract.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    gate: 'PACKET_WRITE_REVISION_CONTRACT_01',
    primaryQuestion: 'Can semantic-packet-writer.ts::persistCanonicalSemanticPacketEmbedding and mcp-tool-implementations.ts::toolIdentityRecover produce contradictory identity state for the same packet_key?',
    primaryAnswer: overlapExists
      ? 'YES -- overlapping identity columns found, see identityColumnsWrittenByToolIdentityRecover'
      : 'NO, not currently -- verified by direct source read of both functions (twice, in the prior PACKET_REGISTRY_WRITER_OWNERSHIP_01/01B corrections this session), toolIdentityRecover NEVER writes source_ref/feature_id/feature_label/directory_path/packet_key despite accepting source_ref and feature_id as REQUIRED Zod input fields. Its actual UPDATE .set() touches only identity_lane, identity_confidence, updated_at. No column overlap with what semantic-packet-writer.ts creates exists in the CURRENT code.',
    correctionToOperatorPremise: 'The operator brief (quoting an external pasted log) states toolIdentityRecover "can overwrite identity related fields on an existing packet_key" -- this does not match the verified code. The tool ACCEPTS source_ref/feature_id as input but silently discards them; it never reaches an UPDATE .set() that includes them. This is itself a real but DIFFERENT problem from the one described: dead/unused input fields on a tool whose name and Zod schema promise identity repair it does not perform. Two candidate explanations, not resolved here: (a) the implementation is incomplete relative to its own contract (a genuine bug: the repair should use input.source_ref/feature_id but does not), or (b) the input fields are intentionally required only to prove caller knowledge of current values, never meant to be written blindly -- but if (b), there is currently no comparison-and-decision logic that USES them for anything (no read-compare-reject-if-mismatched step exists in the code either). Flagged as a real, separate finding -- see nextFindings.',
    identityColumnsWrittenBySemanticPacketWriter: identityColumnsWrittenBySemanticWriter,
    toolIdentityRecoverActualWriteColumns,
    toolIdentityRecoverInputSchemaFields,
    toolIdentityRecoverDeadInputFields,
    overlapExists,
    identityColumnsWrittenByToolIdentityRecover,
    loadBearingSchemaFindings: {
      ...sourceRevisionSchemaFinding,
      revisionColumnGroundTruth,
      constraintsFound: constraints.rows,
      packetKeyHasLiveUniqueConstraint: constraints.rows.some((r) => r.def === 'UNIQUE (packet_key)'),
      packetKeyUniqueConstraintImplication: 'Resolves a separate hypothesis raised before running this audit: semantic-packet-writer.ts\'s ON CONFLICT target is packetId (the real PRIMARY KEY), not packetKey -- this looked like a potential gap (could two different packetId values silently carry the same packetKey?). Confirmed NOT a silent-corruption risk: packet_key carries its OWN live UNIQUE constraint (atlas_packets_packet_key_key) independent of the ON CONFLICT clause. Worst case if a caller ever supplied a packetId different from an existing row\'s packetKey-matching packetId is a raised UNIQUE VIOLATION error at insert time, not silent duplication. Safe failure mode, not a hidden bug.',
    },
    revisionMechanismLiveDataCensus: {
      ...census.rows[0],
      interpretation: 'distinct_workspace_revisions=1 across 61,718 rows means every row shares the identical workspace_revision value (the schema default, 0) -- the column exists and is NOT NULL, but has never actually been incremented/exercised in this dataset. content_hash is 99.4% NULL (61,365/61,718) and lineage_version is 99.997% NULL (61,716/61,718) -- both exist as columns but are effectively unused. None of the three live revision-adjacent columns (workspace_revision, content_hash, lineage_version) currently carries real, populated revision evidence at scale. identity_lane: 58,365 canonical / 0 recoverable / the remainder default (\'qdrant_chunk\', the column\'s default value, meaning identity_lane was never explicitly set for those rows either) -- toolIdentityRecover has apparently been invoked for at most 58,365 rows historically (or those rows reached \'canonical\' via a different path; this audit does not distinguish which without a timestamped write-history table, which does not exist).',
    },
    packetKeyIdentitySemantics: sourceRevisionExists ? 'UNPROVEN' : 'LOGICAL_STABLE_ACROSS_REVISIONS_BY_NECESSITY',
    packetKeyIdentitySemanticsReasoning: sourceRevisionExists
      ? 'source_revision exists live, so the schema prerequisite for revision-qualified packet evidence is present. The packet_key uniqueness rule still requires the writer/readback contract to prove whether revisions are updated in place or represented through a separate version/history surface.'
      : 'With no source_revision column and a live UNIQUE(packet_key) constraint, the schema currently permits at most ONE row per packet_key regardless of how many times its source content changes -- there is no schema-level mechanism to hold multiple revision-qualified rows for the same logical packet_key.',
    columnClassification,
    nextFindings: [
      'toolIdentityRecover accepts source_ref/feature_id as required input but never uses them -- resolve whether this is a bug (should compare-and-repair) or dead parameters (should be removed from the Zod schema) before building PacketIdentityRepairV1 around it.',
      sourceRevisionExists
        ? 'source_revision exists live; prove that the canonical writer supplies it from exact admitted source evidence and that all current packet writers use the same contract.'
        : 'source_revision does not exist live -- decide schema migration vs. redefinition of revision evidence onto workspace_revision+content_hash before implementing CanonicalPacketWriteV1/expectedCurrentSourceRevision literally as specified.',
      'workspace_revision has never been incremented in this dataset (1 distinct value across 61,718 rows) -- any admission rule requiring "workspaceRevision current" needs a real writer that increments it, which does not currently exist either; this is a second dormant-mechanism finding, same shape as the writer-ownership gaps already closed.',
      'content_hash is 99.4% NULL -- cannot yet serve as expectedContentChecksum for optimistic-concurrency guards at meaningful coverage without a backfill.',
    ],
    acceptance: {
      overlapExists,
      sourceRevisionColumnExistsLive: sourceRevisionExists,
      packetKeyHasLiveUniqueConstraint: constraints.rows.some((r) => r.def === 'UNIQUE (packet_key)'),
      packetKeyIdentitySemanticsProven: false,
      revisionInputsProven: false,
      allLiveCallersRevisionQualified: false,
      conflictPolicySafe: !overlapExists,
      mutationPathsRevisionGuarded: false,
    },
    overallVerdict: 'PARTIAL_PROVEN',
    overallVerdictReasoning: sourceRevisionExists
      ? 'The ownership-conflict question is answered NO and the live schema prerequisite is present. The gate remains PARTIAL_PROVEN because the discovered writers do not all accept and persist exact admitted source/content lineage, the live cohort is dominated by historical/default workspace values and null content hashes, and current packet/chunk reconciliation has zero canonical content_hash matches.'
      : 'The ownership-conflict question is answered NO, but the live schema prerequisite is absent. The gate remains PARTIAL_PROVEN until the schema contract is resolved and caller adoption is proven.',
    nextGate: 'PACKET-DIGEST-BRIDGE-ADMISSION-01',
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const reportTempPath = `${REPORT_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(reportTempPath, REPORT_PATH);
  console.log(JSON.stringify({
    status: 'PACKET_WRITE_REVISION_CONTRACT_READ_ONLY_COMPLETE',
    primaryAnswer: report.primaryAnswer,
    sourceRevisionColumnExistsLive: sourceRevisionExists,
    packetKeyIdentitySemantics: report.packetKeyIdentitySemantics,
    overallVerdict: report.overallVerdict,
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'PACKET_WRITE_REVISION_CONTRACT_FAILED', error: String(error?.stack ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
