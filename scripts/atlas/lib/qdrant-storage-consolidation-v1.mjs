export const RETENTION_CLASSIFICATIONS = Object.freeze([
  'CURRENT_OWNER',
  'MIGRATION_ROLLBACK',
  'CHALLENGER',
  'ROUTING_ONLY',
  'ORPHAN',
  'DUPLICATE',
  'REVIEW_REQUIRED',
]);

const KNOWN_POLICY = Object.freeze({
  codebase_chunks_768_v2: {
    classification: 'CURRENT_OWNER',
    logicalRepresentation: 'semantic_768',
    role: 'derived_ann',
    retentionClass: 'CURRENT',
    generation: 'v2',
    notes: 'Active semantic_768 Qdrant projection per vector lane registry. PostgreSQL remains canonical identity/lineage authority.',
  },
  codebase_chunks_768: {
    classification: 'MIGRATION_ROLLBACK',
    logicalRepresentation: 'semantic_768',
    role: 'migration_replay',
    retentionClass: 'REMOVE_AFTER_PARITY',
    generation: 'legacy',
    notes: 'Legacy semantic_768 generation retained only for migration/replay until caller and rollback parity are proven.',
  },
  codebase_chunks_384_hybrid: {
    classification: 'MIGRATION_ROLLBACK',
    logicalRepresentation: 'semantic_384_legacy',
    role: 'migration_replay',
    retentionClass: 'REMOVE_AFTER_PARITY',
    generation: 'legacy',
    notes: 'Legacy 384-dimensional retrieval surface. Never satisfies semantic_768 authority.',
  },
  codebase_topology_64: {
    classification: 'ROUTING_ONLY',
    logicalRepresentation: 'latent_64',
    role: 'routing',
    retentionClass: 'REVIEW_FOR_PAYLOAD_ROUTING',
    generation: 'derived',
    notes: 'Compact routing/topology representation; candidate for replacement by Postgres/Qdrant payload routing if measured parity exists.',
  },
  codebase_topology_128: {
    classification: 'CHALLENGER',
    logicalRepresentation: 'topology_128',
    role: 'derived_challenger',
    retentionClass: 'KEEP_UNTIL_EVAL',
    generation: 'derived',
    notes: 'Topology/structural challenger. Do not broaden population without a named lift metric.',
  },
});

const BYTES_PER_DATATYPE = Object.freeze({
  Float32: 4,
  Float16: 2,
  Uint8: 1,
  Turbo4: 0.5,
});

export function bytesPerDatatype(datatype) {
  if (!datatype) return 4;
  return BYTES_PER_DATATYPE[String(datatype)] ?? 4;
}

export function extractDenseVectorSchema(collectionInfo) {
  const vectors = collectionInfo?.result?.config?.params?.vectors ?? collectionInfo?.config?.params?.vectors ?? null;
  if (!vectors) return [];

  if (typeof vectors?.size === 'number') {
    return [{
      name: '',
      size: Number(vectors.size),
      distance: vectors.distance ?? null,
      datatype: vectors.datatype ?? 'Float32',
      memory: vectors.memory ?? null,
    }];
  }

  return Object.entries(vectors)
    .filter(([, spec]) => spec && typeof spec === 'object' && Number.isFinite(Number(spec.size)))
    .map(([name, spec]) => ({
      name,
      size: Number(spec.size),
      distance: spec.distance ?? null,
      datatype: spec.datatype ?? 'Float32',
      memory: spec.memory ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function estimateRawDenseVectorBytes(pointsCount, vectorSchema) {
  const points = Math.max(0, Number(pointsCount) || 0);
  return (vectorSchema ?? []).reduce(
    (sum, vector) => sum + points * Number(vector.size || 0) * bytesPerDatatype(vector.datatype),
    0,
  );
}

export function sumSnapshotBytes(snapshotResponse) {
  const rows = Array.isArray(snapshotResponse?.result) ? snapshotResponse.result : [];
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row?.size) || 0), 0);
}

export function memoryDiskBytes(memoryResponse) {
  const candidates = [
    memoryResponse?.result?.total?.disk,
    memoryResponse?.result?.total?.disk_bytes,
    memoryResponse?.result?.disk,
    memoryResponse?.total?.disk,
    memoryResponse?.total?.disk_bytes,
  ];
  for (const value of candidates) {
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function classifyCollection(name, collectionInfo) {
  const known = KNOWN_POLICY[name];
  if (known) return { name, ...known, confidence: 'EXPLICIT_POLICY' };

  const points = Number(collectionInfo?.result?.points_count ?? collectionInfo?.points_count ?? 0) || 0;
  const lower = String(name).toLowerCase();
  if (points === 0 && /(test|tmp|temp|scratch|fixture|demo|old|backup)/.test(lower)) {
    return {
      name,
      classification: 'ORPHAN',
      logicalRepresentation: null,
      role: 'unknown',
      retentionClass: 'REMOVE_AFTER_CALLER_CENSUS',
      generation: 'unknown',
      notes: 'Empty collection with an explicitly non-production-style name. Deletion still requires caller census and separate authorization.',
      confidence: 'HEURISTIC_EMPTY_NONPRODUCTION_NAME',
    };
  }

  return {
    name,
    classification: 'REVIEW_REQUIRED',
    logicalRepresentation: null,
    role: 'unknown',
    retentionClass: 'REVIEW',
    generation: 'unknown',
    notes: 'No explicit retention policy. Do not infer deletion safety from naming alone.',
    confidence: 'FAIL_CLOSED',
  };
}

export function metadataProposalFor(classification) {
  if (!classification || classification.classification === 'REVIEW_REQUIRED') return null;
  return {
    owner: 'parent-atlas',
    role: classification.role,
    logicalRepresentation: classification.logicalRepresentation,
    generation: classification.generation,
    canonicalAuthority: false,
    retentionClass: classification.retentionClass,
    experimental: classification.classification === 'CHALLENGER',
  };
}

export function buildCollectionAudit({ name, info, memory, snapshots, memorySupported = true }) {
  const pointsCount = Number(info?.result?.points_count ?? info?.points_count ?? 0) || 0;
  const vectorSchema = extractDenseVectorSchema(info);
  const rawDenseVectorBytesEstimate = estimateRawDenseVectorBytes(pointsCount, vectorSchema);
  const collectionDiskBytes = memoryDiskBytes(memory);
  const snapshotBytes = sumSnapshotBytes(snapshots);
  const classification = classifyCollection(name, info);
  const totalObservedPersistentBytes = collectionDiskBytes == null ? null : collectionDiskBytes + snapshotBytes;
  const storageAmplificationVsRawDense = collectionDiskBytes != null && rawDenseVectorBytesEstimate > 0
    ? collectionDiskBytes / rawDenseVectorBytesEstimate
    : null;

  return {
    name,
    status: info?.result?.status ?? info?.status ?? null,
    pointsCount,
    vectorSchema,
    namedVectorCount: vectorSchema.length,
    rawDenseVectorBytesEstimate,
    memoryEndpointSupported: memorySupported,
    collectionDiskBytes,
    snapshotCount: Array.isArray(snapshots?.result) ? snapshots.result.length : 0,
    snapshotBytes,
    totalObservedPersistentBytes,
    storageAmplificationVsRawDense,
    classification,
    proposedMetadata: metadataProposalFor(classification),
    deletionAuthorized: false,
    metadataMutationAuthorized: false,
  };
}

export function summarizeAudits(collections) {
  const rows = collections ?? [];
  const totals = rows.reduce((acc, row) => {
    acc.points += Number(row.pointsCount || 0);
    acc.rawDenseVectorBytesEstimate += Number(row.rawDenseVectorBytesEstimate || 0);
    acc.snapshotBytes += Number(row.snapshotBytes || 0);
    if (row.collectionDiskBytes != null) acc.collectionDiskBytes += Number(row.collectionDiskBytes || 0);
    if (row.totalObservedPersistentBytes != null) acc.totalObservedPersistentBytes += Number(row.totalObservedPersistentBytes || 0);
    acc.byClassification[row.classification?.classification ?? 'REVIEW_REQUIRED'] = (acc.byClassification[row.classification?.classification ?? 'REVIEW_REQUIRED'] ?? 0) + 1;
    return acc;
  }, {
    points: 0,
    rawDenseVectorBytesEstimate: 0,
    collectionDiskBytes: 0,
    snapshotBytes: 0,
    totalObservedPersistentBytes: 0,
    byClassification: {},
  });

  const snapshotDominated = totals.snapshotBytes > totals.collectionDiskBytes;
  return {
    ...totals,
    snapshotDominated,
    deletionCandidates: rows.filter((row) => row.classification?.classification === 'ORPHAN').map((row) => row.name),
    migrationRollbackCollections: rows.filter((row) => row.classification?.classification === 'MIGRATION_ROLLBACK').map((row) => row.name),
    currentOwners: rows.filter((row) => row.classification?.classification === 'CURRENT_OWNER').map((row) => row.name),
    routingOnlyCollections: rows.filter((row) => row.classification?.classification === 'ROUTING_ONLY').map((row) => row.name),
    challengers: rows.filter((row) => row.classification?.classification === 'CHALLENGER').map((row) => row.name),
    reviewRequired: rows.filter((row) => row.classification?.classification === 'REVIEW_REQUIRED').map((row) => row.name),
  };
}

export const QDRANT_STORAGE_POLICY_V1 = KNOWN_POLICY;
