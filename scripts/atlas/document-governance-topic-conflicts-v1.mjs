export function markDocumentGovernanceTopicConflictsV1(records) {
  const ownersByTopic = new Map();
  for (const record of records) {
    if (record.status !== 'CANONICAL_CURRENT') continue;
    for (const topicId of record.canonicalForTopics) {
      const owners = ownersByTopic.get(topicId) ?? [];
      owners.push(record.documentId);
      ownersByTopic.set(topicId, owners);
    }
  }

  const conflicts = [...ownersByTopic.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([topicId, documentIds]) => ({ topicId, documentIds: [...documentIds].sort() }))
    .sort((a, b) => a.topicId.localeCompare(b.topicId));
  if (!conflicts.length) return { records, conflicts };

  const conflictedIds = new Map();
  for (const conflict of conflicts) {
    for (const documentId of conflict.documentIds) {
      const topics = conflictedIds.get(documentId) ?? [];
      topics.push(conflict.topicId);
      conflictedIds.set(documentId, topics);
    }
  }

  const updated = records.map((record) => {
    const topics = conflictedIds.get(record.documentId);
    if (!topics) return record;
    const contradictions = new Set(record.validation.contradictions);
    for (const topicId of topics) contradictions.add(`MULTIPLE_CANONICAL_DOCUMENTS_FOR_TOPIC:${topicId}`);
    return {
      ...record,
      status: 'CONFLICT',
      topicOwnershipStatus: 'CONFLICT',
      validation: { ...record.validation, status: 'FAILED', contradictions: [...contradictions].sort() },
    };
  });
  return { records: updated, conflicts };
}
