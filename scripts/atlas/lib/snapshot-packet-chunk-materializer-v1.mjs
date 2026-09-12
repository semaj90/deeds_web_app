import crypto from 'node:crypto';

export const normalizeText = (value) => String(value ?? '').trim();
export const normalizeSha256 = (value) => normalizeText(value).toLowerCase().replace(/^sha256:/, '');
export const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export function languageForSourceRef(sourceRef) {
  const ref = normalizeText(sourceRef).toLowerCase();
  if (/\.(tsx?|mts|cts)$/.test(ref)) return 'typescript';
  if (/\.(jsx?|mjs|cjs)$/.test(ref)) return 'javascript';
  if (/\.py$/.test(ref)) return 'python';
  if (/\.rs$/.test(ref)) return 'rust';
  if (/\.go$/.test(ref)) return 'go';
  if (/\.java$/.test(ref)) return 'java';
  if (/\.(c|h)$/.test(ref)) return 'c';
  if (/\.(cc|cpp|cxx|hpp|hh|hxx)$/.test(ref)) return 'cpp';
  return null;
}

export function sourceDigestMatches(buffer, membership) {
  const digest = sha256Buffer(buffer);
  return {
    digest,
    contentHashMatches: normalizeSha256(membership?.content_hash) === digest,
    sourceRevisionMatches: normalizeSha256(membership?.code_source_revision) === digest,
  };
}

export function observationSliceEvidence(sourceBuffer, observation) {
  const startByte = Number(observation?.startByte ?? observation?.start_byte);
  const endByte = Number(observation?.endByte ?? observation?.end_byte);
  if (!Number.isInteger(startByte) || !Number.isInteger(endByte) || startByte < 0 || endByte <= startByte || endByte > sourceBuffer.length) {
    throw new Error('OBSERVATION_BYTE_RANGE_INVALID');
  }
  const bytes = sourceBuffer.subarray(startByte, endByte);
  return {
    startByte,
    endByte,
    bytes,
    text: bytes.toString('utf8'),
    contentHash: sha256Buffer(bytes),
    upstreamChunkId: normalizeText(observation?.upstreamChunkId ?? observation?.upstream_chunk_id) || null,
    startLine: Number.isFinite(Number(observation?.startLine ?? observation?.start_line)) ? Number(observation?.startLine ?? observation?.start_line) : null,
    endLine: Number.isFinite(Number(observation?.endLine ?? observation?.end_line)) ? Number(observation?.endLine ?? observation?.end_line) : null,
  };
}

function rowContentHash(row) {
  const supplied = normalizeSha256(row?.content_hash);
  if (supplied) return supplied;
  const content = row?.content;
  return typeof content === 'string' ? sha256Buffer(Buffer.from(content, 'utf8')) : '';
}

function rowLineCompatible(row, evidence) {
  const rowStart = row?.line_start == null ? null : Number(row.line_start);
  const rowEnd = row?.line_end == null ? null : Number(row.line_end);
  if (rowStart == null || rowEnd == null || evidence.startLine == null || evidence.endLine == null) return true;
  const exact = rowStart === evidence.startLine && rowEnd === evidence.endLine;
  const plusOne = rowStart === evidence.startLine + 1 && rowEnd === evidence.endLine + 1;
  return exact || plusOne;
}

export function matchObservationToCanonicalChunkRows(sourceBuffer, observation, chunkRows) {
  const evidence = observationSliceEvidence(sourceBuffer, observation);
  const candidates = [];
  for (const row of chunkRows ?? []) {
    const chunkId = normalizeText(row?.chunk_id);
    const rowId = normalizeText(row?.id);
    if (!chunkId || !rowId) continue;
    const contentHash = rowContentHash(row);
    const hashMatch = contentHash === evidence.contentHash;
    const contentMatch = typeof row?.content === 'string' && Buffer.from(row.content, 'utf8').equals(evidence.bytes);
    const upstreamIdMatch = evidence.upstreamChunkId ? chunkId === evidence.upstreamChunkId : false;
    if (!(hashMatch || contentMatch)) continue;
    if (!rowLineCompatible(row, evidence)) continue;
    candidates.push({
      canonicalChunkId: chunkId,
      chunkRowId: rowId,
      matchBasis: upstreamIdMatch ? 'UPSTREAM_ID_PLUS_EXACT_CONTENT' : hashMatch ? 'EXACT_CHUNK_CONTENT_HASH' : 'EXACT_CHUNK_CONTENT',
      contentHash: evidence.contentHash,
      startByte: evidence.startByte,
      endByte: evidence.endByte,
      startLine: evidence.startLine,
      endLine: evidence.endLine,
    });
  }
  return {
    evidence: {
      startByte: evidence.startByte,
      endByte: evidence.endByte,
      contentHash: evidence.contentHash,
      upstreamChunkId: evidence.upstreamChunkId,
      startLine: evidence.startLine,
      endLine: evidence.endLine,
    },
    candidates,
    classification: candidates.length === 1 ? 'EXACT_EXISTING_CHUNK' : candidates.length === 0 ? 'CHUNK_MATERIALIZATION_REQUIRED' : 'AMBIGUOUS_EXISTING_CHUNK',
  };
}

/**
 * atlas_packets is file-granularity for this lineage contract. Packet selection
 * must therefore NOT compare graphify membership's whole-source hash to a packet
 * chunk/payload hash. Prefer an exact current source revision when present; allow
 * one unique legacy file packet whose packet revision is absent, because the
 * proven source revision is carried by atlas_packet_chunk_lineage itself.
 * Explicitly conflicting packet revisions fail closed.
 */
export function classifyPacketRows(membership, packetRows) {
  const expectedRevision = normalizeSha256(membership?.code_source_revision);
  const byPacketKey = new Map();
  for (const row of packetRows ?? []) {
    const packetKey = normalizeText(row?.packet_key);
    if (!packetKey) continue;
    if (!byPacketKey.has(packetKey)) byPacketKey.set(packetKey, row);
  }
  const rows = [...byPacketKey.entries()].map(([packetKey, row]) => ({
    packetKey,
    sourceRevision: normalizeSha256(row?.source_revision) || null,
  }));

  if (rows.length === 0) {
    return { candidates: [], exact: [], classification: 'CURRENT_PACKET_MATERIALIZATION_REQUIRED' };
  }
  if (rows.length > 1) {
    return { candidates: rows, exact: [], classification: 'AMBIGUOUS_FILE_PACKET_IDENTITY' };
  }

  const only = rows[0];
  if (only.sourceRevision && expectedRevision && only.sourceRevision !== expectedRevision) {
    return { candidates: rows, exact: [], classification: 'CONFLICTING_PACKET_SOURCE_REVISION' };
  }
  if (only.sourceRevision && expectedRevision && only.sourceRevision === expectedRevision) {
    return { candidates: rows, exact: [only], classification: 'EXACT_CURRENT_FILE_PACKET' };
  }
  return { candidates: rows, exact: [only], classification: 'UNIQUE_FILE_PACKET_REVISION_UNPROVEN' };
}

function lineageRowConflict(existingRow, proposed) {
  return normalizeText(existingRow?.source_ref) !== proposed.sourceRef
    || normalizeText(existingRow?.source_namespace) !== proposed.sourceNamespace
    || normalizeSha256(existingRow?.source_revision) !== normalizeSha256(proposed.sourceRevision)
    || normalizeText(existingRow?.revision_status) !== proposed.revisionStatus
    || normalizeText(existingRow?.chunk_row_id) !== proposed.chunkRowId;
}

export function classifySourceMaterializerPlan({ membership, packetResult, observationMatches, existingLineageRows }) {
  const blockers = [];
  const packetReady = packetResult.classification === 'EXACT_CURRENT_FILE_PACKET'
    || packetResult.classification === 'UNIQUE_FILE_PACKET_REVISION_UNPROVEN';
  if (!packetReady) blockers.push(packetResult.classification);
  if (!observationMatches.length) blockers.push('NO_STRUCTURAL_CHUNKS');

  const chunkFailures = observationMatches.filter((row) => row.classification !== 'EXACT_EXISTING_CHUNK');
  if (chunkFailures.some((row) => row.classification === 'AMBIGUOUS_EXISTING_CHUNK')) blockers.push('AMBIGUOUS_EXISTING_CHUNK');
  if (chunkFailures.some((row) => row.classification === 'CHUNK_MATERIALIZATION_REQUIRED')) blockers.push('CHUNK_MATERIALIZATION_REQUIRED');

  const packetKey = packetResult.exact[0]?.packetKey ?? null;
  const sourceRef = normalizeText(membership?.source_ref);
  const workspaceId = normalizeText(membership?.workspace_id);
  const sourceNamespace = workspaceId ? `workspace:${workspaceId}` : '';
  const sourceRevision = normalizeText(membership?.code_source_revision) || null;
  if (!sourceNamespace) blockers.push('SOURCE_NAMESPACE_UNPROVEN');
  if (!sourceRevision) blockers.push('SOURCE_REVISION_UNPROVEN');

  const existing = new Map((existingLineageRows ?? []).map((row) => [
    `${normalizeText(row.packet_key)}|${normalizeText(row.canonical_chunk_id)}`,
    row,
  ]));

  const proposedMemberships = packetKey && sourceNamespace && sourceRevision
    ? observationMatches
        .filter((row) => row.classification === 'EXACT_EXISTING_CHUNK')
        .map((row) => row.candidates[0])
        .map((row) => {
          const proposed = {
            packetKey,
            canonicalChunkId: row.canonicalChunkId,
            chunkRowId: row.chunkRowId,
            sourceRef,
            sourceNamespace,
            sourceRevision,
            membershipStatus: observationMatches.length === 1 ? 'EXACT_SINGLE_MEMBER' : 'EXACT_MULTI_MEMBER',
            revisionStatus: 'PROVEN',
            chunkOrdinal: null,
            lineageProducerRevision: 'snapshot-packet-chunk-materializer-plan-v2',
            evidenceRefs: ['docs/reports/snapshot-packet-chunk-materializer-plan-v2.json'],
            matchBasis: row.matchBasis,
          };
          const current = existing.get(`${packetKey}|${row.canonicalChunkId}`) ?? null;
          return {
            ...proposed,
            alreadyPresent: current ? !lineageRowConflict(current, proposed) : false,
            existingConflict: current ? lineageRowConflict(current, proposed) : false,
          };
        })
    : [];

  if (proposedMemberships.some((row) => row.existingConflict)) blockers.push('EXISTING_LINEAGE_CONFLICT');
  const missingLineageMemberships = proposedMemberships.filter((row) => !row.alreadyPresent && !row.existingConflict);
  const ready = blockers.length === 0 && proposedMemberships.length === observationMatches.length;

  return {
    sourceRef,
    repositoryId: normalizeText(membership?.repository_id),
    repositoryRelativePath: normalizeText(membership?.repository_relative_path),
    sourceNamespace: sourceNamespace || null,
    sourceRevision,
    workspaceRevision: normalizeText(membership?.workspace_revision) || null,
    packetKey,
    packetClassification: packetResult.classification,
    structuralChunkCount: observationMatches.length,
    proposedMembershipCount: proposedMemberships.length,
    alreadyPresentCount: proposedMemberships.filter((row) => row.alreadyPresent).length,
    existingConflictCount: proposedMemberships.filter((row) => row.existingConflict).length,
    missingLineageCount: missingLineageMemberships.length,
    proposedMemberships,
    blockers: [...new Set(blockers)],
    classification: ready
      ? missingLineageMemberships.length > 0
        ? 'READY_LINEAGE_FILL_EXISTING_PACKET_EXISTING_CHUNKS'
        : 'ALREADY_COMPLETE_FOR_OBSERVED_CHUNKS'
      : blockers.includes('CHUNK_MATERIALIZATION_REQUIRED')
        ? 'NEEDS_CURRENT_CHUNK_MATERIALIZER'
        : blockers.includes('CURRENT_PACKET_MATERIALIZATION_REQUIRED')
          ? 'NEEDS_CURRENT_PACKET_MATERIALIZER'
          : 'BLOCKED_AMBIGUOUS_OR_UNPROVEN',
  };
}
