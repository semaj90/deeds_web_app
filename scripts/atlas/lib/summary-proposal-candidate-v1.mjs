import { createHash } from 'node:crypto';

export const SUMMARY_PROPOSAL_SCHEMA_V1 = 'atlas.chunk-summary-proposal.v1';

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJsonV1(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonV1).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonV1(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function selectStratifiedCandidates(rows, count, maxInputBytes, { allowLegacyForComparison = false } = {}) {
  const eligible = [];
  const excluded = {};
  const reject = (reason, amount = 1) => { excluded[reason] = (excluded[reason] ?? 0) + amount; };
  const groups = new Map();
  for (const row of rows) {
    const key = row.canonicalChunkId ?? `unidentified:${row.chunkRowId ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const canonicalRows = [];
  for (const group of groups.values()) {
    if (group.length === 1) { canonicalRows.push(group[0]); continue; }
    const hashes = new Set(group.map((row) => row.chunkContentHash ?? sha256Hex(Buffer.from(row.content ?? '', 'utf8'))));
    if (hashes.size > 1) {
      reject('CONFLICTING_CHUNK_TEXT', group.length);
      continue;
    }
    group.sort((a, b) => String(a.chunkRowId).localeCompare(String(b.chunkRowId)));
    canonicalRows.push(group[0]);
    reject('DUPLICATE_CANONICAL_CHUNK_SAME_TEXT', group.length - 1);
  }
  for (const row of canonicalRows) {
    if (row.chunkSummaryText?.trim()) { reject('ALREADY_SUMMARIZED'); continue; }
    if (row.legacySummaryColumn?.trim() && !(allowLegacyForComparison && row.legacyComparisonEligible === true)) {
      reject('LEGACY_SUMMARY_COLUMN_POPULATED');
      continue;
    }
    if (row.revisionStatus !== 'PROVEN' || !row.sourceRevision || !row.workspaceRevision) { reject('LINEAGE_UNQUALIFIED'); continue; }
    if (!row.sourceRef || !row.chunkId || !row.canonicalChunkId || !row.chunkRowId || row.physicalChunkRowId !== row.chunkRowId) { reject('CHUNK_IDENTITY_MISSING'); continue; }
    if (!row.bindingChecksum || !row.chunkContentHash || !row.content) { reject('INPUT_EVIDENCE_MISSING'); continue; }
    const bytes = Buffer.byteLength(row.content, 'utf8');
    if (bytes > maxInputBytes) { reject('INPUT_TOO_LARGE'); continue; }
    eligible.push({ ...row, inputByteLength: bytes, inputTextSha256: sha256Hex(Buffer.from(row.content, 'utf8')) });
  }

  const byExtension = new Map();
  for (const row of eligible) {
    const ext = row.sourceRef.split('.').pop()?.toLowerCase() || 'none';
    const list = byExtension.get(ext) ?? [];
    list.push(row);
    byExtension.set(ext, list);
  }
  for (const [ext, list] of byExtension) {
    list.sort((a, b) => sha256Hex(`${a.canonicalChunkId}\0${a.sourceRevision}`).localeCompare(sha256Hex(`${b.canonicalChunkId}\0${b.sourceRevision}`)));
    byExtension.set(ext, list);
  }
  const eligibleByExtension = Object.fromEntries([...byExtension].map(([ext, list]) => [ext, list.length]));
  const extensions = [...byExtension.keys()].sort();
  const selected = [];
  while (selected.length < count && extensions.length) {
    for (let i = extensions.length - 1; i >= 0; i -= 1) {
      const ext = extensions[i];
      const next = byExtension.get(ext).shift();
      if (next) selected.push(next);
      if (!byExtension.get(ext).length) extensions.splice(i, 1);
      if (selected.length === count) break;
    }
  }
  return { eligibleCount: eligible.length, selected, excludedByReason: excluded, eligibleByExtension };
}

export function validateSummaryOutput(summary, inputText) {
  if (typeof summary !== 'string' || !summary.trim()) return 'EMPTY_GENERATION';
  const normalized = summary.trim();
  if (normalized === inputText.trim() || normalized.length < 20 || /^(summary|file|content)\.?$/i.test(normalized)) return 'DEGENERATE_SUMMARY';
  return null;
}

export function buildSummaryProposalV1({ row, sourceIdentityKey, summary, model, promptRevision, schemaRevision, generationParameters, runtimeBuildRevision, latencyMs, usage }) {
  if (!sourceIdentityKey) throw new Error('SOURCE_IDENTITY_KEY_REQUIRED');
  const normalizedSummary = summary.trim();
  const proposal = {
    schema: SUMMARY_PROPOSAL_SCHEMA_V1,
    sourceIdentityKey,
    workspaceId: row.workspaceId,
    workspaceRevision: row.workspaceRevision,
    sourceRef: row.sourceRef,
    sourceRevision: row.sourceRevision,
    chunkId: row.chunkId,
    chunkCanonicalId: row.canonicalChunkId,
    chunkRevisionOrChecksum: row.chunkContentHash,
    chunkRowId: row.chunkRowId,
    inputTextSha256: row.inputTextSha256,
    inputByteLength: row.inputByteLength,
    summary: normalizedSummary,
    summarySha256: sha256Hex(Buffer.from(normalizedSummary, 'utf8')),
    modelId: model.id,
    modelRevision: model.revision ?? null,
    modelParameterCount: model.parameterCount ?? null,
    runtimeBuildRevision: runtimeBuildRevision ?? null,
    promptTemplateRevision: promptRevision,
    summarySchemaRevision: schemaRevision,
    generationParameters: generationParameters ?? null,
    lineageState: 'REVISION_QUALIFIED',
    canonicalAuthority: false,
    evidenceRefs: [
      'atlas_workspace_source_bindings:exact_source_revision',
      'atlas_packet_chunk_lineage:revision_status=PROVEN',
      `codebase_chunk_index:id=${row.chunkRowId}`,
      `binding_checksum:${row.bindingChecksum}`,
    ],
    latencyMs: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
    usage: usage ?? null,
  };
  proposal.proposalChecksum = `sha256:${sha256Hex(Buffer.from(stableJsonV1(proposal), 'utf8'))}`;
  return proposal;
}
