import { createHash } from 'node:crypto';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isDigest = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/**
 * Read-only, dependency-injected preflight for the existing shadow path.
 * TODO SOURCE-01: bind loadCandidateSnapshot to canonical SearchRuntime/ordinal map owner.
 * TODO SOURCE-02: bind readSourceBytes to the authoritative source reader.
 * TODO SOURCE-03: bind loadFeatureRows to an audited revision-qualified profile owner.
 * TODO SOURCE-04: translate qualified rows to actual ChunkRetrievalProfileV2
 *   and SearchRuntimeLiveFeatureSupplementV1 using their existing schemas.
 * NO admission, SQL, Valkey, model inference, or manifest calculation happens here.
 */
export async function inspectRevisionQualifiedSourcesV1({
  requestId, workspaceRevision, candidateSnapshotRevision,
  loadCandidateSnapshot, readSourceBytes, loadFeatureRows
}) {
  const blocked = (reason, details = {}) => ({
    schema:'atlas.revision-qualified-source-preflight.v1',
    status:'BLOCKED', reason, ...details,
    canonicalAuthority:false, admission:'NOT_PERFORMED', writesPerformed:false
  });
  if (![requestId,workspaceRevision,candidateSnapshotRevision].every(nonEmpty))
    return blocked('REQUEST_IDENTITY_MISSING');
  if ([loadCandidateSnapshot, readSourceBytes, loadFeatureRows].some(f=>typeof f !== 'function'))
    return blocked('CANONICAL_PROVIDER_NOT_CONFIGURED');
  try {
    const snapshot = await loadCandidateSnapshot({requestId,workspaceRevision,candidateSnapshotRevision});
    if (!snapshot || snapshot.workspaceRevision !== workspaceRevision ||
        snapshot.candidateSnapshotRevision !== candidateSnapshotRevision ||
        snapshot.integrityVerified !== true || !nonEmpty(snapshot.ordinalMapChecksum) ||
        !Array.isArray(snapshot.candidates))
      return blocked('CANDIDATE_SNAPSHOT_UNQUALIFIED');
    const rows = [];
    const seen = new Set();
    for (const candidate of snapshot.candidates) {
      if (![candidate.canonicalCandidateId,candidate.packetKey,candidate.sourceRef,
        candidate.sourceRevision,candidate.contentSha256].every(nonEmpty) ||
        !isDigest(candidate.contentSha256) ||
        !Number.isSafeInteger(candidate.startByte) ||
        !Number.isSafeInteger(candidate.endByte) ||
        candidate.startByte < 0 || candidate.endByte <= candidate.startByte)
        return blocked('CANDIDATE_SOURCE_BINDING_MISSING');
      if (seen.has(candidate.canonicalCandidateId)) return blocked('DUPLICATE_CANDIDATE_ID');
      seen.add(candidate.canonicalCandidateId);
      const data = await readSourceBytes(candidate);
      if (!(data instanceof Uint8Array)) return blocked('SOURCE_BYTES_UNAVAILABLE');
      if (digest(data) !== candidate.contentSha256) return blocked('SOURCE_REVISION_CONTENT_MISMATCH');
      if (candidate.endByte > data.byteLength) return blocked('SOURCE_SPAN_OUT_OF_RANGE');
      // Byte offsets are UTF-8 offsets. Detect a UTF-8 continuation byte on either boundary.
      if ((candidate.startByte < data.byteLength && (data[candidate.startByte] & 0xc0) === 0x80) ||
          (candidate.endByte < data.byteLength && (data[candidate.endByte] & 0xc0) === 0x80))
        return blocked('UTF8_BOUNDARY_INVALID');
      const span = data.subarray(candidate.startByte,candidate.endByte);
      if (!isDigest(candidate.spanSha256) || digest(span) !== candidate.spanSha256)
        return blocked('SOURCE_SPAN_HASH_MISMATCH');
      const feature = await loadFeatureRows(candidate);
      if (!feature || feature.sourceRevision !== candidate.sourceRevision ||
          feature.workspaceRevision !== workspaceRevision)
        return blocked('FEATURE_SOURCE_REVISION_MISMATCH');
      // Never infer featureRevision / ontologyRevision from producerRevision.
      rows.push({canonicalCandidateId:candidate.canonicalCandidateId,
        packetKey:candidate.packetKey, sourceRef:candidate.sourceRef,
        sourceRevision:candidate.sourceRevision,
        sourceSpanSha256:candidate.spanSha256,
        featureRevision:feature.featureRevision ?? null,
        ontologyRevision:feature.ontologyRevision ?? null,
        featureSourceState:feature.featureRevision ? 'REVISION_QUALIFIED':'UNAVAILABLE'});
    }
    return {schema:'atlas.revision-qualified-source-preflight.v1',
      status:'SOURCE_VERIFIED_NOT_ADMITTED', ordinalMapChecksum:snapshot.ordinalMapChecksum,
      workspaceRevision,candidateSnapshotRevision,rows,canonicalAuthority:false,
      admission:'NOT_PERFORMED',writesPerformed:false};
  } catch (error) {
    return blocked('CANONICAL_PROVIDER_READ_FAILED',{errorCode:error?.code ?? 'READ_ERROR'});
  }
}
