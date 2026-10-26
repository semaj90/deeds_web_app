import duckdb from 'duckdb';
import { sha256CouchDbV1 } from './couchdb-offline-batch-v1.mjs';

function runSql(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.run(sql, (error) => error ? reject(error) : resolve());
  });
}

function querySql(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows ?? []));
  });
}

function sourceDirectory(sourceRef) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim() || sourceRef.startsWith('/') || sourceRef.includes('\\')) {
    throw new Error('SOURCE_REF_INVALID');
  }
  const segments = sourceRef.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('SOURCE_REF_INVALID');
  return segments.length > 1 ? segments.slice(0, 2).join('/') : '.';
}

export async function reduceCouchDbReplaySummaryWithDuckDbV1(summary) {
  if (!summary || summary.schema !== 'atlas.couchdb-offline-replay-summary.v1' || !Array.isArray(summary.documents)) {
    throw new Error('REPLAY_SUMMARY_SCHEMA_INVALID');
  }
  const { summaryDigest, ...summaryBody } = summary;
  if (summary.canonicalAuthority !== false || summary.writesPerformed !== false
    || summaryDigest !== sha256CouchDbV1(summaryBody)) {
    throw new Error('REPLAY_SUMMARY_DIGEST_OR_AUTHORITY_INVALID');
  }

  const groups = new Map();
  let liveDocumentCount = 0;
  let tombstoneCount = 0;
  let conflictedDocumentCount = 0;
  const database = new duckdb.Database(':memory:');
  const connection = database.connect();
  try {
    await runSql(connection, 'CREATE TEMP TABLE source_documents (directory VARCHAR NOT NULL)');
    for (const row of summary.documents) {
      if (!row || typeof row.documentId !== 'string' || typeof row.deleted !== 'boolean') {
        throw new Error('REPLAY_DOCUMENT_IDENTITY_INVALID');
      }
      if (row.deleted) {
        tombstoneCount += 1;
        continue;
      }
      liveDocumentCount += 1;
      if (row.conflictStatus === 'CONFLICTS_PRESENT') {
        conflictedDocumentCount += 1;
        continue;
      }
      const directory = sourceDirectory(row.document?.payload?.source_ref);
      const escapedDirectory = directory.replaceAll("'", "''");
      await runSql(connection, `INSERT INTO source_documents VALUES ('${escapedDirectory}')`);
    }

    const rows = await querySql(connection, `
      SELECT directory, COUNT(*) AS document_count
      FROM source_documents
      GROUP BY directory
      ORDER BY directory
    `);
    for (const row of rows) {
      const documentCount = Number(row.document_count);
      if (!Number.isSafeInteger(documentCount) || documentCount < 1) throw new Error('DUCKDB_ROLLUP_COUNT_INVALID');
      groups.set(row.directory, documentCount);
    }
  } finally {
    await new Promise((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  }

  const groupRows = [...groups].map(([directory, documentCount]) => ({ directory, documentCount }));
  const aggregatedDocumentCount = groupRows.reduce((total, row) => total + row.documentCount, 0);
  const body = {
    schema: 'atlas.couchdb-duckdb-source-directory-rollup.v1',
    sourceReplaySummaryDigest: summaryDigest,
    inputDocumentCount: summary.documents.length,
    liveDocumentCount,
    tombstoneCount,
    conflictedDocumentCount,
    aggregatedDocumentCount,
    excludedCount: tombstoneCount + conflictedDocumentCount,
    groups: groupRows,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  return { ...body, aggregateDigest: sha256CouchDbV1(body) };
}

export function verifyCouchDbDuckDbSourceRollupV1(rollup) {
  if (!rollup || rollup.schema !== 'atlas.couchdb-duckdb-source-directory-rollup.v1'
    || !Array.isArray(rollup.groups) || rollup.canonicalAuthority !== false || rollup.writesPerformed !== false) {
    return { valid: false, reason: 'ROLLUP_SCHEMA_OR_AUTHORITY_INVALID' };
  }
  const { aggregateDigest, ...body } = rollup;
  if (typeof aggregateDigest !== 'string' || aggregateDigest !== sha256CouchDbV1(body)) {
    return { valid: false, reason: 'ROLLUP_DIGEST_MISMATCH' };
  }
  let priorDirectory = null;
  let total = 0;
  for (const group of rollup.groups) {
    if (!group || typeof group.directory !== 'string' || !Number.isSafeInteger(group.documentCount) || group.documentCount < 1
      || (priorDirectory !== null && priorDirectory.localeCompare(group.directory, 'en') >= 0)) {
      return { valid: false, reason: 'ROLLUP_GROUPS_INVALID' };
    }
    priorDirectory = group.directory;
    total += group.documentCount;
  }
  if (!Number.isSafeInteger(total) || total !== rollup.aggregatedDocumentCount
    || rollup.excludedCount !== rollup.tombstoneCount + rollup.conflictedDocumentCount
    || rollup.inputDocumentCount !== rollup.liveDocumentCount + rollup.tombstoneCount) {
    return { valid: false, reason: 'ROLLUP_COUNTS_INVALID' };
  }
  return { valid: true, reason: null };
}
