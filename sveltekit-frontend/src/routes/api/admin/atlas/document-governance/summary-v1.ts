import type { documentGovernanceRegistryV1Schema } from '@deeds/parent-atlas/core/document-governance-record-v1';
import type { z } from 'zod';

type Registry = z.infer<typeof documentGovernanceRegistryV1Schema>;

export function summarizeDocumentGovernanceV1(registry: Registry) {
  const records = registry.records;
  const projectDocument = (record: Registry['records'][number]) => ({
    documentId: record.documentId,
    path: record.path,
    sha256: record.sha256,
    title: record.title,
    documentKind: record.documentKind,
    status: record.status,
    topics: record.topicIds,
    canonicalTopics: record.canonicalForTopics,
    supersedes: record.supersedes,
    supersededBy: record.supersededBy,
    receiptRefs: record.validation.receiptRefs,
    contradictions: record.validation.contradictions,
    archiveEligible: record.archive.eligible,
    archiveBlockedReasons: record.archive.blockedReasons,
    openSpec: record.documentKind === 'OPENSPEC_TASKS' ? {
      change: record.openspec.change,
      completedTasks: record.openspec.completedTasks,
      totalTasks: record.openspec.totalTasks,
      progressPercent: record.openspec.progressFraction === null
        ? null
        : Math.round(record.openspec.progressFraction * 100),
    } : null,
  });
  const sortDocuments = (items: typeof records) => items
    .map(projectDocument)
    .sort((a, b) => a.path.localeCompare(b.path));
  const taskLists = records.filter((record) =>
    record.documentKind === 'OPENSPEC_TASKS' && record.openspec.totalTasks !== null,
  );
  const activeTaskLists = taskLists.filter((record) =>
    record.status !== 'ARCHIVED'
      && record.status !== 'ARCHIVE_READY'
      && record.status !== 'SUPERSEDED'
      && record.status !== 'CONFLICT'
      && record.openspec.completedTasks !== record.openspec.totalTasks,
  );
  const totalTasks = taskLists.reduce((sum, record) => sum + (record.openspec.totalTasks ?? 0), 0);
  const completedTasks = taskLists.reduce((sum, record) => sum + (record.openspec.completedTasks ?? 0), 0);
  const conflictRecords = records.filter((record) =>
    record.status === 'CONFLICT' || record.topicOwnershipStatus === 'CONFLICT',
  );
  const receiptRefs = [...new Set(records.flatMap((record) => record.validation.receiptRefs))].sort();
  const archiveBlockers = new Map<string, number>();
  for (const record of records) {
    if (!record.archive.eligible) {
      for (const reason of record.archive.blockedReasons) {
        archiveBlockers.set(reason, (archiveBlockers.get(reason) ?? 0) + 1);
      }
    }
  }

  return {
    totalDocuments: records.length,
    instructionDocuments: records.filter((record) =>
      record.documentKind === 'CLAUDE_INSTRUCTIONS' || record.documentKind === 'AGENT_INSTRUCTIONS',
    ).length,
    openSpecChanges: taskLists.length,
    completedTasks,
    totalTasks,
    progressPercent: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : null,
    activeOpenSpecProgress: {
      changes: activeTaskLists.map((record) => ({
        change: record.openspec.change,
        path: record.path,
        completedTasks: record.openspec.completedTasks,
        totalTasks: record.openspec.totalTasks,
        progressPercent: record.openspec.totalTasks
          ? Math.round(((record.openspec.completedTasks ?? 0) / record.openspec.totalTasks) * 100)
          : null,
      })).sort((a, b) => (a.change ?? a.path).localeCompare(b.change ?? b.path)),
      changeCount: activeTaskLists.length,
    },
    documents: {
      current: sortDocuments(records.filter((record) => record.status === 'CANONICAL_CURRENT')),
      openSpec: sortDocuments(activeTaskLists),
      superseded: sortDocuments(records.filter((record) => record.status === 'SUPERSEDED')),
      archiveReady: sortDocuments(records.filter((record) => record.archive.eligible)),
      conflicts: sortDocuments(conflictRecords),
    },
    archiveReadiness: {
      eligibleCount: records.filter((record) => record.archive.eligible).length,
      notEligibleCount: records.filter((record) => !record.archive.eligible).length,
      blockerCounts: Object.fromEntries([...archiveBlockers.entries()].sort(([a], [b]) => a.localeCompare(b))),
      writesPerformed: false,
      applyAuthorized: false,
    },
    topicConflicts: conflictRecords.map((record) => ({
      documentId: record.documentId,
      path: record.path,
      topics: record.topicIds,
      canonicalTopics: record.canonicalForTopics,
      contradictions: record.validation.contradictions,
    })).sort((a, b) => a.path.localeCompare(b.path)),
    latestReceipts: {
      status: receiptRefs.length === 0 ? 'UNAVAILABLE' as const : 'REFERENCES_UNORDERED' as const,
      references: receiptRefs,
      reason: receiptRefs.length === 0
        ? 'The registry contains no receipt references.'
        : 'Receipt references have no trusted timestamps, so latest ordering is not asserted.',
    },
    conflicts: conflictRecords.length,
    archiveEligible: records.filter((record) => record.archive.eligible).length,
    etaMs: null as number | null,
    etaConfidence: null as number | null,
  };
}
