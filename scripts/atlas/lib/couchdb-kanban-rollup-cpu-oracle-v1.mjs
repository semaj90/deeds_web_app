import { sha256CouchDbV1 } from './couchdb-offline-batch-v1.mjs';

function category(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(value);
}

export function summarizeCouchDbKanbanReplayWithCpuOracleV1(summary) {
  if (!summary || summary.schema !== 'atlas.couchdb-offline-replay-summary.v1' || !Array.isArray(summary.documents)) {
    throw new Error('REPLAY_SUMMARY_SCHEMA_INVALID');
  }
  const { summaryDigest, ...body } = summary;
  if (summary.canonicalAuthority !== false || summary.writesPerformed !== false
    || summaryDigest !== sha256CouchDbV1(body)) throw new Error('REPLAY_SUMMARY_DIGEST_OR_AUTHORITY_INVALID');

  const statusCounts = new Map();
  const priorityCounts = new Map();
  let liveDocumentCount = 0;
  let tombstoneCount = 0;
  let conflictedDocumentCount = 0;
  let sourceReferenceCount = 0;
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
    if (document?.type !== 'kanban-task' || !category(document.kanbanStatus) || !category(document.priority)
      || !Array.isArray(document.sourceRefs) || !document.sourceRefs.every((ref) => typeof ref === 'string')) {
      throw new Error('KANBAN_TASK_SCHEMA_UNSUPPORTED');
    }
    statusCounts.set(document.kanbanStatus, (statusCounts.get(document.kanbanStatus) ?? 0) + 1);
    priorityCounts.set(document.priority, (priorityCounts.get(document.priority) ?? 0) + 1);
    sourceReferenceCount += document.sourceRefs.length;
  }
  const byStatus = [...statusCounts].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([status, documentCount]) => ({ status, documentCount }));
  const byPriority = [...priorityCounts].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([priority, documentCount]) => ({ priority, documentCount }));
  const output = {
    inputDocumentCount: summary.documents.length,
    liveDocumentCount,
    tombstoneCount,
    conflictedDocumentCount,
    projectedDocumentCount: byStatus.reduce((total, row) => total + row.documentCount, 0),
    sourceReferenceCount,
    byStatus,
    byPriority,
  };
  return { ...output, oracleDigest: sha256CouchDbV1(output) };
}
