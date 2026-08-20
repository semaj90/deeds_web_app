#!/usr/bin/env node
/**
 * EMB3B0 — PostgreSQL/pgvector transactional capability proof.
 *
 * This is intentionally NOT the canonical semantic_768 writer yet. It proves
 * that the selected PostgreSQL connection can store/read an exact 768-d vector
 * with revision-qualified identity inside a transaction that is always rolled
 * back. It uses a TEMP table so no production table contract is invented.
 *
 * Persistent writes: none. Qdrant/Valkey writes: none.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_EMB2_JSONL = path.join(REPO_ROOT, 'docs', 'reports', 'emb2-semantic-card-embeddings.jsonl');
const DEFAULT_REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'emb3b0-postgres-vector-transaction-proof.json');
const DEFAULT_REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'emb3b0-postgres-vector-transaction-proof.md');
const EXPECTED_DIMENSION = 768;

function parseArg(argv, name, fallback = null) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1] ?? fallback;
  const prefix = `${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findVector(value, dimension, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    if (value.length === dimension && value.every(Number.isFinite)) return value;
    for (const item of value) {
      const found = findVector(item, dimension, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const item of Object.values(value)) {
    const found = findVector(item, dimension, depth + 1);
    if (found) return found;
  }
  return null;
}

function firstString(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstInteger(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (Number.isInteger(value)) return value;
  }
  return null;
}

async function loadEmb2Row(jsonlPath) {
  const text = await readFile(jsonlPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const vector = findVector(row, EXPECTED_DIMENSION);
    if (!vector) continue;
    return {
      row,
      vector,
      artifactSha256: createHash('sha256').update(text).digest('hex'),
      packetKey: firstString(row, ['packet_key', 'packetKey']) ?? 'emb3b0-proof-packet',
      canonicalId: firstString(row, ['canonical_id', 'canonicalId']) ?? 'emb3b0-proof-canonical',
      sourceRef: firstString(row, ['source_ref', 'sourceRef']) ?? 'emb3b0-proof-source',
      sourceRevision: firstString(row, ['source_revision', 'sourceRevision']) ?? 'emb3b0-proof-source-revision',
      workspaceRevision: firstInteger(row, ['workspace_revision', 'workspaceRevision']) ?? 0,
      representationRevision: firstInteger(row, ['representation_revision', 'representationRevision']) ?? 0,
    };
  }
  throw new Error('EMB3B0_NO_768_VECTOR_FOUND_IN_EMB2_ARTIFACT');
}

function vectorLiteral(values) {
  return `[${values.map((value) => Number(value).toString()).join(',')}]`;
}

function norm(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

async function runProof({ databaseUrl, emb2JsonlPath }) {
  if (!databaseUrl) throw new Error('EMB3B0_DATABASE_URL_REQUIRED');
  const emb2 = await loadEmb2Row(emb2JsonlPath);
  const client = new Client({ connectionString: databaseUrl });
  const operations = [];
  let transactionStarted = false;
  let transactionRolledBack = false;
  let connected = false;

  try {
    await client.connect();
    connected = true;

    const versionResult = await client.query('SELECT version() AS version, current_database() AS database_name');
    operations.push('SELECT_VERSION');
    const extensionResult = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    operations.push('SELECT_PGVECTOR_EXTENSION');
    if (!extensionResult.rowCount) throw new Error('EMB3B0_PGVECTOR_EXTENSION_NOT_INSTALLED');

    await client.query('BEGIN');
    transactionStarted = true;
    operations.push('BEGIN');

    await client.query(`
      CREATE TEMP TABLE emb3b0_semantic_768_proof (
        packet_key text PRIMARY KEY,
        canonical_id text NOT NULL,
        source_ref text NOT NULL,
        workspace_revision bigint NOT NULL,
        source_revision text NOT NULL,
        representation_id text NOT NULL,
        representation_revision bigint NOT NULL,
        encoder_revision text NOT NULL,
        semantic_768 vector(768) NOT NULL
      ) ON COMMIT DROP
    `);
    operations.push('CREATE_TEMP_TABLE');

    await client.query(
      `INSERT INTO emb3b0_semantic_768_proof (
        packet_key, canonical_id, source_ref, workspace_revision, source_revision,
        representation_id, representation_revision, encoder_revision, semantic_768
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector)`,
      [
        emb2.packetKey,
        emb2.canonicalId,
        emb2.sourceRef,
        emb2.workspaceRevision,
        emb2.sourceRevision,
        'semantic_768',
        emb2.representationRevision,
        'embeddinggemma-native-768-v1',
        vectorLiteral(emb2.vector),
      ],
    );
    operations.push('INSERT_TEMP_PROOF_ROW');

    const readback = await client.query(`
      SELECT
        packet_key,
        canonical_id,
        source_ref,
        workspace_revision::text AS workspace_revision,
        source_revision,
        representation_id,
        representation_revision::text AS representation_revision,
        encoder_revision,
        semantic_768::text AS semantic_text,
        vector_dims(semantic_768) AS semantic_dimension,
        vector_norm(semantic_768) AS semantic_norm
      FROM emb3b0_semantic_768_proof
      WHERE packet_key = $1
    `, [emb2.packetKey]);
    operations.push('READ_BACK_TEMP_PROOF_ROW');
    if (readback.rowCount !== 1) throw new Error('EMB3B0_READBACK_ROW_COUNT_MISMATCH');

    const row = readback.rows[0];
    const expectedNorm = norm(emb2.vector);
    const semanticNorm = Number(row.semantic_norm);
    const readBackVerified =
      row.packet_key === emb2.packetKey &&
      row.canonical_id === emb2.canonicalId &&
      row.source_ref === emb2.sourceRef &&
      Number(row.workspace_revision) === emb2.workspaceRevision &&
      row.source_revision === emb2.sourceRevision &&
      row.representation_id === 'semantic_768' &&
      Number(row.representation_revision) === emb2.representationRevision &&
      row.encoder_revision === 'embeddinggemma-native-768-v1' &&
      Number(row.semantic_dimension) === EXPECTED_DIMENSION &&
      Number.isFinite(semanticNorm) &&
      Math.abs(semanticNorm - expectedNorm) <= 1e-6;

    if (!readBackVerified) throw new Error('EMB3B0_READBACK_VERIFICATION_FAILED');

    await client.query('ROLLBACK');
    transactionRolledBack = true;
    operations.push('ROLLBACK');

    const tempAfterRollback = await client.query("SELECT to_regclass('pg_temp.emb3b0_semantic_768_proof') AS relation");
    operations.push('VERIFY_TEMP_TABLE_GONE_AFTER_ROLLBACK');

    return {
      schema: 'atlas.emb3b0-postgres-vector-transaction-proof.v1',
      generatedAt: new Date().toISOString(),
      status: tempAfterRollback.rows[0]?.relation == null ? 'PROVEN' : 'BLOCKED_TEMP_TABLE_SURVIVED_ROLLBACK',
      postgres: {
        version: versionResult.rows[0]?.version ?? null,
        databaseName: versionResult.rows[0]?.database_name ?? null,
        pgvectorExtensionVersion: extensionResult.rows[0]?.extversion ?? null,
      },
      emb2: {
        path: emb2JsonlPath,
        sha256: emb2.artifactSha256,
        packetKey: emb2.packetKey,
        sourceRevision: emb2.sourceRevision,
        workspaceRevision: emb2.workspaceRevision,
        representationRevision: emb2.representationRevision,
        dimension: EXPECTED_DIMENSION,
        norm: expectedNorm,
      },
      transactionStarted,
      readBackVerified,
      transactionRolledBack,
      tempTableGoneAfterRollback: tempAfterRollback.rows[0]?.relation == null,
      operations,
      invariants: {
        productionTableCreated: false,
        productionTableMutated: false,
        qdrantMutationAttempted: false,
        valkeyMutationAttempted: false,
        canonicalWritesAllowed: false,
        tempTableIsNotCanonicalSchema: true,
        nextGateRequiresAuthoritativeDrizzleSchemaBinding: true,
      },
      producerRevision: 'prove-emb3b0-postgres-vector-transaction.v1',
    };
  } catch (error) {
    if (transactionStarted && !transactionRolledBack) {
      try {
        await client.query('ROLLBACK');
        transactionRolledBack = true;
        operations.push('ROLLBACK_AFTER_ERROR');
      } catch {
        operations.push('ROLLBACK_AFTER_ERROR_FAILED');
      }
    }
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      emb3b0Context: { connected, transactionStarted, transactionRolledBack, operations },
    });
  } finally {
    if (connected) await client.end().catch(() => {});
  }
}

function markdown(report) {
  return `# EMB3B0 — PostgreSQL pgvector transaction proof\n\n` +
    `- **Status:** \`${report.status}\`\n` +
    `- **PostgreSQL:** \`${report.postgres?.version ?? 'unavailable'}\`\n` +
    `- **pgvector:** \`${report.postgres?.pgvectorExtensionVersion ?? 'unavailable'}\`\n` +
    `- **semantic dimension:** \`${report.emb2?.dimension ?? 768}\`\n` +
    `- **read-back verified:** \`${report.readBackVerified ?? false}\`\n` +
    `- **rolled back:** \`${report.transactionRolledBack ?? false}\`\n` +
    `- **persistent production writes:** \`false\`\n\n` +
    `This proof uses a TEMP table only. It proves PostgreSQL/pgvector transactional capability; it does not nominate a production semantic table and does not authorize canonical writes.\n`;
}

async function main() {
  const argv = process.argv.slice(2);
  const databaseUrl = parseArg(argv, '--database-url', process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null);
  const emb2JsonlPath = path.resolve(parseArg(argv, '--emb2-jsonl', DEFAULT_EMB2_JSONL));
  const reportJson = path.resolve(parseArg(argv, '--report-json', DEFAULT_REPORT_JSON));
  const reportMd = path.resolve(parseArg(argv, '--report-md', DEFAULT_REPORT_MD));

  let report;
  try {
    report = await runProof({ databaseUrl, emb2JsonlPath });
  } catch (error) {
    report = {
      schema: 'atlas.emb3b0-postgres-vector-transaction-proof.v1',
      generatedAt: new Date().toISOString(),
      status: 'ERROR',
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      context: error?.emb3b0Context ?? null,
      invariants: {
        productionTableCreated: false,
        qdrantMutationAttempted: false,
        valkeyMutationAttempted: false,
        canonicalWritesAllowed: false,
      },
      producerRevision: 'prove-emb3b0-postgres-vector-transaction.v1',
    };
  }

  await mkdir(path.dirname(reportJson), { recursive: true });
  await mkdir(path.dirname(reportMd), { recursive: true });
  await writeFile(reportJson, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(reportMd, markdown(report), 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    reportPath: reportJson,
    safeNextCommand: report.status === 'PROVEN'
      ? 'EMB3B1: bind semantic_768 to the authoritative Drizzle/Postgres table and repeat insert/readback inside rollback'
      : 'Fix PostgreSQL/pgvector/EMB2 capability blocker before defining the canonical writer',
  }, null, 2));
  if (report.status !== 'PROVEN') process.exitCode = 2;
}

await main();
