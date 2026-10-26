import duckdb from 'duckdb';
import { verifyCouchDbOfflineBatchV1 } from './couchdb-offline-batch-v1.mjs';

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

function toSafeCount(value, field) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`DUCKDB_COUNT_INVALID:${field}`);
  return count;
}

export async function censusCouchDbOfflineBatchWithDuckDbV1(batch) {
  const verification = verifyCouchDbOfflineBatchV1(batch);
  if (!verification.valid) throw new Error(`COUCHDB_BATCH_INVALID:${verification.reason}`);

  const database = new duckdb.Database(':memory:');
  const connection = database.connect();
  try {
    await runSql(connection, `
      CREATE TEMP TABLE couchdb_changes (
        ordinal INTEGER NOT NULL,
        deleted BOOLEAN NOT NULL,
        revision_candidate_count INTEGER NOT NULL,
        document_digest VARCHAR NOT NULL
      )
    `);

    for (const record of batch.records) {
      if (!/^sha256:[a-f0-9]{64}$/.test(record.documentDigest)) throw new Error('DOCUMENT_DIGEST_INVALID');
      const conflictCount = record.revisionCandidates.length;
      await runSql(connection, `INSERT INTO couchdb_changes VALUES (${record.ordinal}, ${record.deleted}, ${conflictCount}, '${record.documentDigest}')`);
    }

    const rows = await querySql(connection, `
      SELECT
        COUNT(*) AS record_count,
        SUM(CASE WHEN deleted THEN 1 ELSE 0 END) AS tombstone_count,
        SUM(CASE WHEN NOT deleted THEN 1 ELSE 0 END) AS live_document_count,
        SUM(CASE WHEN revision_candidate_count > 1 THEN 1 ELSE 0 END) AS conflicted_record_count,
        COUNT(DISTINCT document_digest) AS distinct_document_digest_count
      FROM couchdb_changes
    `);
    const row = rows[0] ?? {};
    const recordCount = toSafeCount(row.record_count ?? 0, 'record_count');
    const tombstoneCount = toSafeCount(row.tombstone_count ?? 0, 'tombstone_count');
    const liveDocumentCount = toSafeCount(row.live_document_count ?? 0, 'live_document_count');
    const conflictedRecordCount = toSafeCount(row.conflicted_record_count ?? 0, 'conflicted_record_count');
    const distinctDocumentDigestCount = toSafeCount(row.distinct_document_digest_count ?? 0, 'distinct_document_digest_count');

    if (recordCount !== batch.recordCount || tombstoneCount + liveDocumentCount !== recordCount) {
      throw new Error('DUCKDB_CHANGE_COUNTS_MISMATCH');
    }

    return {
      schema: 'atlas.couchdb-duckdb-change-census.v1',
      sourceBatchDigest: batch.batchDigest,
      sourceDatabase: batch.sourceDatabase,
      inputRecordCount: recordCount,
      tombstoneCount,
      liveDocumentCount,
      conflictedRecordCount,
      distinctDocumentDigestCount,
      status: recordCount === 0
        ? 'EMPTY_CHANGE_PAGE'
        : liveDocumentCount === 0
          ? 'NO_LIVE_DOCUMENTS'
          : 'DOCUMENT_SCHEMA_REVIEW_REQUIRED',
      reduction: 'METADATA_CENSUS_ONLY',
      contextManifest: 'NOT_ATTEMPTED',
      mastra: 'NOT_INVOKED',
      canonicalAuthority: false,
      writesPerformed: false,
    };
  } finally {
    await new Promise((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  }
}
