import { createHash } from 'node:crypto';

/** Normalize explicitly named MapReduce readiness receipts for the read-only GAN audit. */
export function adaptGanLineageReadinessV1(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  if (body.schema === 'atlas.mapreduce-chunk-readiness-receipt.v2'
      && body.measured?.inputConserved === true
      && body.writes?.postgres === 0
      && body.canonicalAuthority === false) {
    return {
      receiptVersion: 'v2',
      candidateCount: body.candidateCount,
      chunkCount: body.chunkCount,
      chunkStates: body.measured.chunkStates ?? {},
      packetStates: body.measured.packetStates ?? {},
      semantic768: body.measured.semantic768States ?? null,
      semantic768Quality: null,
      semanticRepresentationBinding: null,
      summary: body.measured.summaryStates ?? null,
      summarySemantic: body.measured.summarySemanticStates ?? null,
    };
  }

  if (body.schema !== 'atlas.mapreduce-chunk-readiness-receipt.v3'
      || body.status !== 'READINESS_REPLAY_COMPLETE'
      || body.currentSemanticOwner?.table !== 'codebase_chunk_index'
      || body.currentSemanticOwner?.column !== 'content_embedding_768'
      || body.currentSemanticOwner?.storageType !== 'vector(768)'
      || body.canonicalAuthority !== false
      || !Number.isInteger(body.candidateCount) || body.candidateCount < 1
      || !Number.isInteger(body.chunkCount) || body.chunkCount < 1
      || !body.measured || !body.writes || typeof body.writes !== 'object') return null;

  const checksumBody = { ...body, receiptChecksum: null };
  const expectedChecksum = `sha256:${createHash('sha256').update(JSON.stringify(checksumBody)).digest('hex')}`;
  const receiptChecksumValid = typeof body.receiptChecksum === 'string' && body.receiptChecksum === expectedChecksum;
  const expectedWriteCounters = ['postgres', 'qdrant', 'valkey', 'rabbitmq', 'neo4j', 'graphify'];
  const writesAreZero = expectedWriteCounters.every((key) => body.writes[key] === 0);
  const measured = body.measured;
  const packetQualified = Number(measured.packetStates?.PACKET_REVISION_QUALIFIED ?? 0);
  const chunkQualified = Number(measured.chunkStates?.CHUNK_REVISION_QUALIFIED ?? 0);
  const bytesMatched = Number(measured.currentSourceBytesMatchRows ?? -1);
  const exactDigests = Number(measured.exactSourceFileDigestRows ?? -1);
  const filesRehashed = Number(measured.currentSourceFilesRehashed ?? 0);

  if (!receiptChecksumValid || !writesAreZero
      || packetQualified !== body.chunkCount
      || chunkQualified !== body.chunkCount
      || bytesMatched !== body.chunkCount
      || exactDigests !== body.chunkCount
      || filesRehashed < 1) return null;

  return {
    receiptVersion: 'v3',
    candidateCount: body.candidateCount,
    chunkCount: body.chunkCount,
    chunkStates: measured.chunkStates,
    packetStates: measured.packetStates,
    semantic768: measured.semantic768PhysicalStates ?? null,
    semantic768Quality: measured.semantic768QualityStates ?? null,
    semanticRepresentationBinding: measured.semanticRepresentationBindingStates ?? null,
    summary: measured.summaryStates ?? null,
    summarySemantic: measured.summarySemanticStates ?? null,
  };
}
