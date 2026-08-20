#!/usr/bin/env node
/**
 * EMB3B1 — read-only live proof of the canonical semantic_768 Drizzle binding.
 *
 * The script never performs DDL or DML. It proves that the live PostgreSQL
 * atlas_packets relation matches the contract declared by the Drizzle schema:
 *   atlas_packets.embedding vector(768)
 *   + source/workspace/representation/encoder lineage.
 *
 * If the EMB3B1 migration has not been applied, the expected terminal state is
 * BLOCKED_MIGRATION_NOT_APPLIED. That is a useful proof result, not a failure to
 * work around.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'emb3b1-atlas-packets-semantic-768-binding-proof.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'emb3b1-atlas-packets-semantic-768-binding-proof.md');

const REQUIRED_COLUMNS = [
  'packet_key',
  'source_ref',
  'source_revision',
  'source_version_receipt_id',
  'embedding',
  'workspace_revision',
  'representation_revision',
  'source_representation_id',
  'source_dimension',
  'encoder_revision',
  'embedding_digest',
];

function parseArg(argv, name, fallback = null) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1] ?? fallback;
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function classify(report) {
  if (!report.postgres18) return 'BLOCKED_POSTGRES_VERSION';
  if (!report.pgvectorInstalled) return 'BLOCKED_PGVECTOR_MISSING';
  if (!report.tableExists) return 'BLOCKED_ATLAS_PACKETS_MISSING';
  if (report.missingColumns.includes('source_revision') || report.missingColumns.includes('source_version_receipt_id')) {
    return 'BLOCKED_MIGRATION_NOT_APPLIED';
  }
  if (report.missingColumns.length) return 'BLOCKED_SCHEMA_DRIFT';
  if (report.embeddingType !== 'vector(768)') return 'BLOCKED_VECTOR_TYPE_MISMATCH';
  if (report.semanticRows.invalidCount > 0) return 'BLOCKED_INVALID_SEMANTIC_768_ROWS';
  if (report.semanticRows.count === 0) return 'PROVEN_SCHEMA_READY_NO_CANONICAL_ROWS';
  return 'PROVEN';
}

function markdown(report) {
  return `# EMB3B1 — atlas_packets semantic_768 binding proof\n\n` +
    `- **Status:** \`${report.status}\`\n` +
    `- **PostgreSQL 18:** \`${report.postgres18}\`\n` +
    `- **pgvector:** \`${report.pgvectorVersion ?? 'missing'}\`\n` +
    `- **atlas_packets:** \`${report.tableExists ? 'present' : 'missing'}\`\n` +
    `- **embedding type:** \`${report.embeddingType ?? 'unknown'}\`\n` +
    `- **semantic_768 rows sampled:** \`${report.semanticRows.count}\`\n` +
    `- **invalid semantic_768 rows:** \`${report.semanticRows.invalidCount}\`\n` +
    `- **mutations:** \`0\`\n\n` +
    `## Missing columns\n\n${report.missingColumns.length ? report.missingColumns.map((x) => `- \`${x}\``).join('\n') : '- none'}\n\n` +
    `## Canonical binding\n\n` +
    `\`atlas_packets.embedding\` is the canonical physical vector slot for native \`semantic_768\`. ` +
    `New writes require source revision + source-version receipt, workspace/representation revision, encoder revision, source dimension 768, and an embedding digest.\n\n` +
    `## Authority\n\nThis is SELECT-only evidence. It does not apply the migration, update packets, or write to Qdrant/Valkey.\n`;
}

async function main() {
  const argv = process.argv.slice(2);
  const databaseUrl = parseArg(argv, '--database-url', process.env.DATABASE_URL || process.env.POSTGRES_URL || null);
  const sampleLimit = Number(parseArg(argv, '--sample-limit', '32'));
  const reportJson = path.resolve(parseArg(argv, '--report-json', REPORT_JSON));
  const reportMd = path.resolve(parseArg(argv, '--report-md', REPORT_MD));
  if (!databaseUrl) throw new Error('EMB3B1_DATABASE_URL_REQUIRED');
  if (!Number.isInteger(sampleLimit) || sampleLimit <= 0 || sampleLimit > 1000) throw new Error('EMB3B1_SAMPLE_LIMIT_INVALID');

  const client = new Client({ connectionString: databaseUrl });
  const operations = [];
  try {
    await client.connect();

    const version = await client.query('SELECT version() AS version, current_database() AS database_name');
    operations.push('SELECT_VERSION');
    const versionText = String(version.rows[0]?.version ?? '');
    const postgres18 = /PostgreSQL 18(?:\.|\s)/.test(versionText);

    const vectorExt = await client.query("SELECT extversion FROM pg_extension WHERE extname='vector'");
    operations.push('SELECT_PGVECTOR_EXTENSION');
    const pgvectorVersion = vectorExt.rows[0]?.extversion ?? null;

    const relation = await client.query("SELECT to_regclass('public.atlas_packets')::text AS relation");
    operations.push('SELECT_ATLAS_PACKETS_RELATION');
    const tableExists = relation.rows[0]?.relation === 'atlas_packets';

    let columns = [];
    let embeddingType = null;
    let semanticRows = { count: 0, invalidCount: 0, samples: [] };

    if (tableExists) {
      const columnResult = await client.query(`
        SELECT
          a.attname AS column_name,
          format_type(a.atttypid, a.atttypmod) AS formatted_type,
          a.attnotnull AS not_null
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'atlas_packets'
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum
      `);
      operations.push('SELECT_ATLAS_PACKETS_COLUMNS');
      columns = columnResult.rows;
      embeddingType = columns.find((row) => row.column_name === 'embedding')?.formatted_type ?? null;

      const names = new Set(columns.map((row) => row.column_name));
      const canInspectRows = REQUIRED_COLUMNS.every((name) => names.has(name));
      if (canInspectRows && pgvectorVersion) {
        const semanticResult = await client.query(`
          SELECT
            packet_key,
            source_ref,
            source_revision,
            source_version_receipt_id,
            workspace_revision,
            representation_revision,
            source_representation_id,
            source_dimension,
            encoder_revision,
            embedding_digest,
            vector_dims(embedding) AS embedding_dims,
            vector_norm(embedding) AS embedding_norm
          FROM atlas_packets
          WHERE source_representation_id = 'semantic_768'
            AND embedding IS NOT NULL
          ORDER BY packet_key
          LIMIT $1
        `, [sampleLimit]);
        operations.push('SELECT_SEMANTIC_768_SAMPLE');

        const samples = semanticResult.rows.map((row) => {
          const problems = [];
          if (!row.packet_key) problems.push('PACKET_KEY_MISSING');
          if (!row.source_ref) problems.push('SOURCE_REF_MISSING');
          if (!row.source_revision) problems.push('SOURCE_REVISION_MISSING');
          if (!row.source_version_receipt_id) problems.push('SOURCE_VERSION_RECEIPT_ID_MISSING');
          if (!Number.isInteger(Number(row.workspace_revision)) || Number(row.workspace_revision) < 0) problems.push('WORKSPACE_REVISION_INVALID');
          if (!Number.isInteger(Number(row.representation_revision)) || Number(row.representation_revision) <= 0) problems.push('REPRESENTATION_REVISION_INVALID');
          if (row.source_representation_id !== 'semantic_768') problems.push('REPRESENTATION_ID_INVALID');
          if (Number(row.source_dimension) !== 768) problems.push('SOURCE_DIMENSION_INVALID');
          if (!row.encoder_revision) problems.push('ENCODER_REVISION_MISSING');
          if (!row.embedding_digest) problems.push('EMBEDDING_DIGEST_MISSING');
          if (Number(row.embedding_dims) !== 768) problems.push('VECTOR_DIMENSION_INVALID');
          const norm = Number(row.embedding_norm);
          if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.01) problems.push('VECTOR_NORMALIZATION_INVALID');
          return {
            packetKey: row.packet_key,
            sourceRef: row.source_ref,
            sourceRevision: row.source_revision,
            sourceVersionReceiptId: row.source_version_receipt_id,
            workspaceRevision: Number(row.workspace_revision),
            representationRevision: Number(row.representation_revision),
            sourceDimension: Number(row.source_dimension),
            encoderRevision: row.encoder_revision,
            embeddingDimension: Number(row.embedding_dims),
            embeddingNorm: norm,
            valid: problems.length === 0,
            problems,
          };
        });
        semanticRows = {
          count: samples.length,
          invalidCount: samples.filter((sample) => !sample.valid).length,
          samples,
        };
      }
    }

    const columnNames = new Set(columns.map((row) => row.column_name));
    const missingColumns = REQUIRED_COLUMNS.filter((name) => !columnNames.has(name));
    const baseReport = {
      schema: 'atlas.emb3b1-atlas-packets-semantic-768-binding-proof.v1',
      generatedAt: new Date().toISOString(),
      postgresVersion: versionText,
      databaseName: version.rows[0]?.database_name ?? null,
      postgres18,
      pgvectorInstalled: Boolean(pgvectorVersion),
      pgvectorVersion,
      tableExists,
      requiredColumns: REQUIRED_COLUMNS,
      missingColumns,
      columns,
      embeddingType,
      semanticRows,
      operations,
      invariants: {
        postgresCanonicalOwner: 'atlas_packets',
        semanticVectorColumn: 'embedding',
        semanticRepresentation: 'semantic_768',
        semanticDimension: 768,
        sourceRevisionIsNotWorkspaceRevision: true,
        sourceRevisionIsNotRepresentationRevision: true,
        sourceRevisionIsNotContentHash: true,
        migrationAppliedByProof: false,
        qdrantWritesAttempted: false,
        valkeyWritesAttempted: false,
        postgresWritesAttempted: false,
        canonicalWritesAllowed: false,
      },
      producerRevision: 'prove-emb3b1-atlas-packets-semantic-768-binding.v1',
    };
    const report = { ...baseReport, status: classify(baseReport) };

    await mkdir(path.dirname(reportJson), { recursive: true });
    await mkdir(path.dirname(reportMd), { recursive: true });
    await writeFile(reportJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
    await writeFile(reportMd, markdown(report), 'utf8');
    console.log(JSON.stringify({
      status: report.status,
      postgresVersion: report.postgresVersion,
      pgvectorVersion: report.pgvectorVersion,
      embeddingType: report.embeddingType,
      missingColumns: report.missingColumns,
      semanticRows: report.semanticRows.count,
      invalidSemanticRows: report.semanticRows.invalidCount,
      reportPath: reportJson,
      safeNextCommand: report.status === 'PROVEN' || report.status === 'PROVEN_SCHEMA_READY_NO_CANONICAL_ROWS'
        ? 'EMB3C: bounded canonical write of the 7 revision-qualified EMB2 cards, then readback before any Qdrant projection'
        : 'Apply/reconcile the declared EMB3B1 schema migration, then rerun this SELECT-only proof',
    }, null, 2));
    if (!String(report.status).startsWith('PROVEN')) process.exitCode = 2;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
