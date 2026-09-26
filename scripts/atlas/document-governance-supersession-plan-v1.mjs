import { createHash } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function validateLinks(records) {
  const byId = new Map(records.map((record) => [record.documentId, record]));
  const contradictions = new Map(records.map((record) => [record.documentId, [...(record.validation?.contradictions ?? [])]]));
  for (const record of records) {
    for (const targetId of record.supersedes ?? []) {
      if (!byId.has(targetId)) contradictions.get(record.documentId).push(`SUPERSESSION_TARGET_MISSING:${targetId}`);
      else if (!(byId.get(targetId).supersededBy ?? []).includes(record.documentId)) {
        contradictions.get(record.documentId).push(`SUPERSESSION_LINK_NOT_RECIPROCAL:${targetId}`);
      }
    }
    for (const targetId of record.supersededBy ?? []) {
      if (!byId.has(targetId)) contradictions.get(record.documentId).push(`SUPERSESSION_TARGET_MISSING:${targetId}`);
      else if (!(byId.get(targetId).supersedes ?? []).includes(record.documentId)) {
        contradictions.get(record.documentId).push(`SUPERSESSION_LINK_NOT_RECIPROCAL:${targetId}`);
      }
    }
  }
  for (const [documentId, values] of contradictions) contradictions.set(documentId, [...new Set(values)].sort());
  return contradictions;
}

function dispositionFor(record, contradictions) {
  if (record.status === 'CONFLICT' || record.supersessionStatus === 'CONFLICT' || contradictions.length) return 'CONFLICT';
  if ((record.supersededBy ?? []).length) return 'SUPERSEDED_CANDIDATE';
  if (record.instructionScope?.parentScopeStatus === 'ROOT') return 'CANONICAL_CURRENT';
  if (record.instructionScope?.parentScopeStatus === 'RESOLVED') return 'SCOPED_SUPPORTING';
  return 'CONFLICT';
}

export function buildClaudeInstructionSupersessionPlanV1({ registry, registryText, audit, fileContents }) {
  const actualRegistryChecksum = sha256(registryText);
  const inputMismatch = !audit || audit.registryChecksum !== actualRegistryChecksum;
  const allRecords = registry.records ?? [];
  const instructions = allRecords.filter((record) => record.documentKind === 'CLAUDE_INSTRUCTIONS');
  const contradictionsById = validateLinks(allRecords);
  const records = instructions.map((record) => {
    const content = fileContents.get(record.path);
    const currentSha256 = content === undefined ? null : sha256(content);
    const contradictions = [...(contradictionsById.get(record.documentId) ?? [])];
    if (currentSha256 === null) contradictions.push('SOURCE_FILE_UNAVAILABLE');
    else if (currentSha256 !== record.sha256) contradictions.push('REGISTRY_SOURCE_DIGEST_MISMATCH');
    const normalizedContradictions = [...new Set(contradictions)].sort();
    const disposition = inputMismatch || normalizedContradictions.length
      ? 'CONFLICT'
      : dispositionFor(record, normalizedContradictions);
    return {
      documentId: record.documentId,
      path: record.path,
      registrySha256: record.sha256,
      currentSha256,
      topicClaims: { topicIds: record.topicIds ?? [], canonicalForTopics: record.canonicalForTopics ?? [] },
      supersedes: record.supersedes ?? [],
      supersededBy: record.supersededBy ?? [],
      scope: record.instructionScope ?? null,
      contradictions: normalizedContradictions,
      proposedDisposition: disposition,
    };
  });
  return {
    schema: 'atlas.claude-instruction-supersession-plan.v1',
    status: inputMismatch ? 'BLOCKED_INPUT_CHECKSUM_MISMATCH' : records.some((record) => record.proposedDisposition === 'CONFLICT') ? 'REVIEW_REQUIRED' : 'PROVEN_BOUNDED',
    inputs: {
      registryChecksum: actualRegistryChecksum,
      supersessionAuditRegistryChecksum: audit?.registryChecksum ?? null,
      supersessionAuditStatus: audit?.status ?? 'MISSING',
      supersessionAuditEdgesAreDirectionalAuthority: false,
    },
    recencyPolicy: 'IGNORED_NO_RECENCY_INFERENCE',
    records,
    summary: Object.fromEntries(['CANONICAL_CURRENT', 'SCOPED_SUPPORTING', 'SUPERSEDED_CANDIDATE', 'CONFLICT'].map((status) => [status, records.filter((record) => record.proposedDisposition === status).length])),
    readOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
  };
}
