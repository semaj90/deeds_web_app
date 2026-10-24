import duckdb from 'duckdb';
import { sha256CouchDbV1 } from './couchdb-offline-batch-v1.mjs';

function execute(connection, sql) {
  return new Promise((resolve, reject) => connection.run(sql, (error) => error ? reject(error) : resolve()));
}

function query(connection, sql) {
  return new Promise((resolve, reject) => connection.all(sql, (error, rows) => error ? reject(error) : resolve(rows ?? [])));
}

function isCategory(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(value);
}

function groupRows(rows, key) {
  return rows.map((row) => {
    const count = Number(row.document_count);
    if (!Number.isSafeInteger(count) || count < 1 || !isCategory(row[key])) throw new Error('DUCKDB_KANBAN_GROUP_INVALID');
    return { [key]: row[key], documentCount: count };
  });
}

export async function reduceCouchDbKanbanReplayWithDuckDbV1(summary) {
  if (!summary || summary.schema !== 'atlas.couchdb-offline-replay-summary.v1' || !Array.isArray(summary.documents)) {
    throw new Error('REPLAY_SUMMARY_SCHEMA_INVALID');
  }
  const { summaryDigest, ...summaryBody } = summary;
  if (summary.canonicalAuthority !== false || summary.writesPerformed !== false
    || summaryDigest !== sha256CouchDbV1(summaryBody)) throw new Error('REPLAY_SUMMARY_DIGEST_OR_AUTHORITY_INVALID');

  const database = new duckdb.Database(':memory:');
  const connection = database.connect();
  let liveDocumentCount = 0;
  let tombstoneCount = 0;
  let conflictedDocumentCount = 0;
  let sourceReferenceCount = 0;
  try {
    await execute(connection, 'CREATE TEMP TABLE kanban_tasks (status VARCHAR NOT NULL, priority VARCHAR NOT NULL, source_reference_count BIGINT NOT NULL)');
    for (const row of summary.documents) {
      if (!row || typeof row.documentId !== 'string' || typeof row.deleted !== 'boolean') throw new Error('REPLAY_DOCUMENT_IDENTITY_INVALID');
      if (row.deleted) {
        tombstoneCount += 1;
        continue;
      }
      liveDocumentCount += 1;
      if (row.conflictStatus === 'CONFLICTS_PRESENT') {
        conflictedDocumentCount += 1;
        continue;
      }
      const document = row.document;
      if (document?.type !== 'kanban-task' || !isCategory(document.kanbanStatus) || !isCategory(document.priority)
        || !Array.isArray(document.sourceRefs) || !document.sourceRefs.every((ref) => typeof ref === 'string')) {
        throw new Error('KANBAN_TASK_SCHEMA_UNSUPPORTED');
      }
      sourceReferenceCount += document.sourceRefs.length;
      const status = document.kanbanStatus.replaceAll("'", "''");
      const priority = document.priority.replaceAll("'", "''");
      await execute(connection, `INSERT INTO kanban_tasks VALUES ('${status}', '${priority}', ${document.sourceRefs.length})`);
    }
    const byStatus = groupRows(await query(connection, 'SELECT status, COUNT(*) AS document_count FROM kanban_tasks GROUP BY status ORDER BY status'), 'status');
    const byPriority = groupRows(await query(connection, 'SELECT priority, COUNT(*) AS document_count FROM kanban_tasks GROUP BY priority ORDER BY priority'), 'priority');
    const projectedDocumentCount = byStatus.reduce((total, row) => total + row.documentCount, 0);
    const body = {
      schema: 'atlas.couchdb-duckdb-kanban-rollup.v1',
      sourceReplaySummaryDigest: summaryDigest,
      inputDocumentCount: summary.documents.length,
      liveDocumentCount,
      tombstoneCount,
      conflictedDocumentCount,
      projectedDocumentCount,
      sourceReferenceCount,
      byStatus,
      byPriority,
      canonicalAuthority: false,
      writesPerformed: false,
    };
    return { ...body, aggregateDigest: sha256CouchDbV1(body) };
  } finally {
    await new Promise((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  }
}

export function verifyCouchDbDuckDbKanbanRollupV1(rollup) {
  if (!rollup || rollup.schema !== 'atlas.couchdb-duckdb-kanban-rollup.v1' || rollup.canonicalAuthority !== false
    || rollup.writesPerformed !== false || !Array.isArray(rollup.byStatus) || !Array.isArray(rollup.byPriority)) {
    return { valid: false, reason: 'ROLLUP_SCHEMA_OR_AUTHORITY_INVALID' };
  }
  const { aggregateDigest, ...body } = rollup;
  if (aggregateDigest !== sha256CouchDbV1(body)) return { valid: false, reason: 'ROLLUP_DIGEST_MISMATCH' };
  for (const [rows, key] of [[rollup.byStatus, 'status'], [rollup.byPriority, 'priority']]) {
    let previous = null;
    for (const row of rows) {
      if (!row || !isCategory(row[key]) || !Number.isSafeInteger(row.documentCount) || row.documentCount < 1
        || (previous !== null && previous.localeCompare(row[key], 'en') >= 0)) return { valid: false, reason: 'ROLLUP_GROUPS_INVALID' };
      previous = row[key];
    }
  }
  const statusCount = rollup.byStatus.reduce((sum, row) => sum + row.documentCount, 0);
  const priorityCount = rollup.byPriority.reduce((sum, row) => sum + row.documentCount, 0);
  if (statusCount !== rollup.projectedDocumentCount || priorityCount !== rollup.projectedDocumentCount
    || rollup.inputDocumentCount !== rollup.liveDocumentCount + rollup.tombstoneCount
    || rollup.projectedDocumentCount !== rollup.liveDocumentCount - rollup.conflictedDocumentCount
    || !Number.isSafeInteger(rollup.sourceReferenceCount) || rollup.sourceReferenceCount < 0) {
    return { valid: false, reason: 'ROLLUP_COUNTS_INVALID' };
  }
  return { valid: true, reason: null };
}
