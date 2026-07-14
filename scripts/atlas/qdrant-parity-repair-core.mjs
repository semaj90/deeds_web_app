import { createHash } from 'node:crypto';

const COLLECTION_CONTRACTS = {
  codebase_chunks_384_v2: {
    contractVersion: 'atlas-qdrant-384-v2',
    legacy: false,
    distance: 'Cosine',
    namedVectors: {
      content_384: 384,
      summary_384: 384,
      signature_384: 384,
      latent64: 64,
    },
    requiredVectors: ['content_384'],
    optionalVectors: ['summary_384', 'signature_384', 'latent64'],
    recommendedVectors: ['summary_384', 'signature_384', 'latent64'],
    sparseVectorKey: 'bm42_sparse',
  },
  codebase_chunks_384: {
    contractVersion: 'atlas-qdrant-384-v1',
    legacy: false,
    distance: 'Cosine',
    namedVectors: {
      content_384: 384,
      summary_384: 384,
      signature_384: 384,
      latent64: 64,
    },
    requiredVectors: ['content_384', 'signature_384'],
    optionalVectors: ['summary_384', 'latent64'],
    recommendedVectors: ['summary_384', 'latent64'],
    sparseVectorKey: 'bm42_sparse',
  },
  codebase_chunks_768: {
    contractVersion: 'atlas-qdrant-768-v0-legacy',
    legacy: true,
    distance: 'Cosine',
    namedVectors: {
      content: 768,
      signature: 768,
      error: 768,
    },
    requiredVectors: ['content', 'signature'],
    optionalVectors: ['error'],
    recommendedVectors: ['error'],
    sparseVectorKey: 'bm42_sparse',
  },
};

function resolveSampleConfiguration(argv = process.argv, env = process.env) {
  const index = argv.findIndex((arg) => arg === '--sample' || arg.startsWith('--sample='));
  if (index >= 0) {
    const raw = argv[index].includes('=')
      ? argv[index].split('=', 2)[1]
      : argv[index + 1];
    const value = Number(raw);
    const requested = Number.isFinite(value) && value > 0 ? value : 50;
    return {
      value: requested,
      source: 'argument',
    };
  }

  const envValue = env.ATLAS_QDRANT_PARITY_SAMPLE ?? env.QDRANT_COMPONENT_PARITY_SAMPLE;
  if (envValue !== undefined && String(envValue).trim() !== '') {
    const value = Number(envValue);
    const requested = Number.isFinite(value) && value > 0 ? value : 50;
    return {
      value: requested,
      source: 'environment',
    };
  }

  if (env.npm_config_sample !== undefined && String(env.npm_config_sample).trim() !== '') {
    const value = Number(env.npm_config_sample);
    const requested = Number.isFinite(value) && value > 0 ? value : 50;
    return {
      value: requested,
      source: 'npm_config',
    };
  }

  return { value: 50, source: 'default' };
}

const resolveSample = resolveSampleConfiguration;

function resolveCollectionConfiguration(argv = process.argv, env = process.env) {
  const index = argv.findIndex((arg) => arg === '--collection' || arg.startsWith('--collection='));
  const requested = index >= 0
    ? (argv[index].includes('=') ? argv[index].split('=', 2)[1] : argv[index + 1])
    : env.QDRANT_CANONICAL_COLLECTION || env.CODEBASE_QDRANT_COLLECTION || 'codebase_chunks_384';
  const collection = String(requested || 'codebase_chunks_384').trim();
  const contract = COLLECTION_CONTRACTS[collection] ?? null;
  return {
    requested: collection,
    contract,
    source: index >= 0 ? 'cli' : (env.QDRANT_CANONICAL_COLLECTION || env.CODEBASE_QDRANT_COLLECTION ? 'environment' : 'default'),
  };
}

function normalizeCollectionConfig(collectionInfo) {
  const root = collectionInfo?.result ?? collectionInfo ?? {};
  const params = root?.config?.params ?? root?.config ?? {};
  return {
    raw: root,
    params,
    vectors: params?.vectors ?? {},
    sparseVectors: params?.sparse_vectors ?? params?.sparseVectors ?? {},
    payloadSchema: root?.payload_schema ?? params?.payload_schema ?? {},
    pointsCount: Number(root?.points_count ?? root?.vectors_count ?? 0),
  };
}

function validateVectorContract(collectionInfo, contract) {
  const normalized = normalizeCollectionConfig(collectionInfo);
  const vectorEntries = normalized.vectors && typeof normalized.vectors === 'object' && !Array.isArray(normalized.vectors)
    ? Object.entries(normalized.vectors)
    : [];
  const actualVectorNames = vectorEntries.map(([name]) => name);
  const issues = [];

  if (!normalized.raw) {
    issues.push('collection_missing');
  }

  const expectedVectorNames = Object.keys(contract?.namedVectors ?? {});
  const missingVectors = expectedVectorNames.filter((name) => !actualVectorNames.includes(name));
  const extraVectors = actualVectorNames.filter((name) => !expectedVectorNames.includes(name));

  for (const [name, expectedSize] of Object.entries(contract?.namedVectors ?? {})) {
    const actual = normalized.vectors?.[name];
    const actualSize = Number(actual?.size ?? actual?.vector_size ?? actual?.dim ?? actual?.dimensions ?? actual?.length ?? NaN);
    if (!actual) {
      issues.push(`missing_vector:${name}`);
      continue;
    }
    if (Number.isFinite(actualSize) && actualSize !== expectedSize) {
      issues.push(`dimension_mismatch:${name}:${actualSize}->${expectedSize}`);
    }
    const distance = String(actual?.distance ?? actual?.metric ?? '').toLowerCase();
    if (distance && contract?.distance && distance !== String(contract.distance).toLowerCase()) {
      issues.push(`distance_mismatch:${name}:${distance}->${contract.distance}`);
    }
  }

  const sparseNames = Object.keys(normalized.sparseVectors ?? {});
  const missingSparseVectors = (contract?.sparseVectorKey ? [contract.sparseVectorKey] : []).filter((name) => !sparseNames.includes(name));

  const payloadFields = normalized.payloadSchema?.fields
    ? Object.keys(normalized.payloadSchema.fields)
    : Object.keys(normalized.payloadSchema ?? {});
  const missingPayloadFields = ['packet_key', 'source_ref', 'qdrant_point_id', 'aggregate_version']
    .filter((name) => !payloadFields.includes(name));

  const status = issues.length > 0
    || missingSparseVectors.length > 0
    || missingPayloadFields.length > 0
    || extraVectors.length > 0
    || missingVectors.length > 0
      ? 'FAIL'
      : 'PASS';

  return {
    collection_exists: Boolean(normalized.raw),
    contract_version: contract?.contractVersion ?? null,
    legacy_collection: Boolean(contract?.legacy),
    collection: contract?.collection ?? null,
    actual_vector_names: actualVectorNames,
    expected_vector_names: expectedVectorNames,
    missing_vectors: missingVectors,
    extra_vectors: extraVectors,
    missing_sparse_vectors: missingSparseVectors,
    missing_payload_fields: missingPayloadFields,
    issues,
    status,
  };
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function equalValue(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  if (typeof left === 'object' || typeof right === 'object') {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  }
  return String(left) === String(right);
}

function classifyParity(arg1, arg2, arg3) {
  const legacyForm = arguments.length >= 3 || !arg1 || !('row' in arg1 && 'point' in arg1 && 'contract' in arg1);
  const row = legacyForm ? (arg1 ?? {}) : (arg1.row ?? {});
  const point = legacyForm ? arg2 : arg1.point;
  const contract = legacyForm ? arg3 : arg1.contract;
  const rowPacketId = firstText(row.packet_id);
  const rowPacketKey = firstText(row.packet_key);
  const rowSourceRef = firstText(row.source_ref);
  const rowQdrantPointId = firstText(row.qdrant_point_id);
  const payload = point?.payload ?? {};
  const payloadPacketId = firstText(payload.packet_id, payload.packetId);
  const payloadPacketKey = firstText(payload.packet_key, payload.packetKey);
  const payloadSourceRef = firstText(payload.source_ref, payload.sourceRef);
  const payloadQdrantPointId = firstText(payload.qdrant_point_id, payload.qdrantPointId, point?.id);
  const payloadFeatureId = firstText(payload.feature_id, payload.featureId);
  const packetIdMatches = rowPacketId && payloadPacketId ? equalValue(rowPacketId, payloadPacketId) : null;
  const packetKeyMatches = rowPacketKey && payloadPacketKey ? equalValue(rowPacketKey, payloadPacketKey) : null;
  const sourceRefMatches = rowSourceRef && payloadSourceRef ? equalValue(rowSourceRef, payloadSourceRef) : null;
  const qdrantPointIdMatches = rowQdrantPointId && payloadQdrantPointId ? equalValue(rowQdrantPointId, payloadQdrantPointId) : null;

  if (!point) {
    return {
      state: 'missing_point',
      reasons: ['missing_point'],
      repair_kind: 'full_projection',
      identity_contradiction: false,
      projection_contradiction: false,
      stale: false,
      payloadPacketId,
      payloadPacketKey,
      payloadSourceRef,
      payloadQdrantPointId,
      payloadFeatureId,
    };
  }

  const reasons = [];
  let identityContradiction = false;
  let projectionContradiction = false;
  let stale = false;
  let state = 'ok';

  if (packetKeyMatches === false) {
    reasons.push('packet_key_mismatch');
    identityContradiction = true;
  }
  if (sourceRefMatches === false) {
    reasons.push('source_ref_mismatch');
    identityContradiction = true;
  }
  if (qdrantPointIdMatches === false) {
    reasons.push('qdrant_point_id_mismatch');
    identityContradiction = true;
  }

  const pgVersion = firstText(
    row.aggregate_version,
    row.lineage_version,
    row.embedding_version,
    row.metadata?.qdrant_payload_version,
    row.metadata?.payload_version,
    row.metadata?.embedding_version,
  );
  const qVersion = firstText(payload.qdrant_payload_version, payload.payload_version, payload.embedding_version, payload.aggregate_version);
  if (pgVersion || qVersion) {
    if (!pgVersion || !qVersion || pgVersion !== qVersion) {
      reasons.push('aggregate_version_mismatch');
      stale = true;
    }
  }

  const vectorData = point?.vector ?? point?.vectors ?? {};
  const namedVectors = contract?.namedVectors ?? {};
  const vectorPresence = {};
  for (const [name, expectedSize] of Object.entries(namedVectors)) {
    const value = vectorData?.[name];
    vectorPresence[name] = Array.isArray(value) && value.length > 0;
    if (Array.isArray(value) && value.length > 0 && value.length !== expectedSize) {
      reasons.push(`dimension_mismatch:${name}:${value.length}->${expectedSize}`);
      projectionContradiction = true;
    }
  }

  const optionalVectors = contract?.optionalVectors ?? [];
  const missingOptionalVectors = optionalVectors.filter((name) => !vectorPresence[name]);
  const requiredVectors = contract?.requiredVectors ?? [];
  const missingRequiredVectors = requiredVectors.filter((name) => !vectorPresence[name]);

  const sparseVectors = point?.sparse_vectors ?? point?.sparseVectors ?? point?.sparse_vector ?? point?.sparseVector;
  const bm42Present = Boolean(sparseVectors?.[contract?.sparseVectorKey ?? 'bm42_sparse']);

  if (identityContradiction) {
    state = 'identity_contradiction';
  } else if (projectionContradiction) {
    state = 'projection_contradiction';
  } else if (stale) {
    state = 'stale_point';
  } else if (missingRequiredVectors.length > 0) {
    state = 'incomplete_point';
  }

  const completeness = {
    missing_required_vectors: missingRequiredVectors,
    missing_optional_vectors: missingOptionalVectors,
    required_complete: missingRequiredVectors.length === 0,
    optional_complete: missingOptionalVectors.length === 0,
  };

  return {
    state,
    reasons: [
      ...reasons,
      ...missingRequiredVectors.map((name) => `missing required vector "${name}"`),
      ...missingOptionalVectors.map((name) => `missing optional vector "${name}"`),
    ],
    repair_kind: state === 'identity_contradiction'
      ? 'quarantine'
      : state === 'projection_contradiction'
        ? 'quarantine'
        : state === 'missing_point'
          ? 'full_projection'
          : state === 'stale_point'
            ? 'payload_repair'
            : state === 'incomplete_point'
              ? 'required_vector_repair'
              : 'none',
    identity_contradiction: identityContradiction,
    projection_contradiction: projectionContradiction,
    stale,
    payloadPacketId,
    payloadPacketKey,
    payloadSourceRef,
    payloadQdrantPointId,
    payloadFeatureId,
    packet_id_matches: packetIdMatches,
    packet_key_matches: packetKeyMatches,
    source_ref_matches: sourceRefMatches,
    qdrant_point_id_matches: qdrantPointIdMatches,
    rowPacketId,
    rowPacketKey,
    rowSourceRef,
    rowQdrantPointId,
    vector_presence: vectorPresence,
    bm42_present: bm42Present,
    completeness,
    required_complete: completeness.required_complete,
    optional_complete: completeness.optional_complete,
    missing_required_components: completeness.missing_required_vectors,
    missing_optional_components: completeness.missing_optional_vectors,
  };
}

function buildCanonicalPayload(pgRow) {
  return {
    packet_id: pgRow.packet_id ?? pgRow.id,
    packet_key: pgRow.packet_key,
    source_ref: pgRow.source_ref,
    feature_id: pgRow.feature_id ?? null,
    feature_label: pgRow.feature_label ?? null,
    domain_class: pgRow.domain_class ?? null,
    summary: pgRow.summary ?? null,
    title_id: pgRow.title_id ?? null,
    tags: pgRow.tags ?? [],
    aggregate_version: pgRow.aggregate_version ?? pgRow.lineage_version ?? pgRow.embedding_version ?? null,
    classifier_version: pgRow.classifier_version ?? null,
    title_generator_version: pgRow.title_generator_version ?? null,
    reranker_version: pgRow.reranker_version ?? null,
    updated_at: pgRow.updated_at?.toISOString?.() ?? new Date().toISOString(),
  };
}

function generateRepairEvents(arg1, arg2, arg3) {
  const legacyForm = arguments.length >= 3 || !arg1 || !('collection' in arg1 && 'classifiedRows' in arg1);
  const collection = legacyForm ? arg3 : arg1.collection;
  const classifiedRows = legacyForm
    ? (arg2 ? [arg1] : [])
    : (arg1.classifiedRows ?? []);
  const repairIndex = new Map();
  const repairRequests = [];

  const pushRepair = (row, kind, reason, pgRow = null) => {
    const key = `${row.packet_id ?? row.packet_key ?? row.qdrant_point_id ?? 'n/a'}|${kind}`;
    const existing = repairIndex.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const entry = {
      packet_id: row.packet_id ?? null,
      packet_key: row.packet_key ?? null,
      qdrant_point_id: row.qdrant_point_id ?? null,
      kind,
      action: kind === 'quarantine' ? 'quarantine' : 'repair',
      reasons: [reason],
      collection,
      event_type: kind,
    };
    if (pgRow && kind !== 'quarantine') {
      entry.payload = buildCanonicalPayload(pgRow);
    }
    repairIndex.set(key, entry);
    repairRequests.push(entry);
  };

  for (const row of classifiedRows) {
    if (row.state === 'missing_point') {
      pushRepair(row, 'full_projection', 'missing_point', arg2 ?? null);
      continue;
    }
    if (row.state === 'stale_point') {
      pushRepair(row, 'payload_repair', 'aggregate_version_mismatch', arg2 ?? null);
      continue;
    }
    if (row.state === 'incomplete_point') {
      const reasons = row.reasons.length > 0 ? row.reasons : ['missing_projection'];
      if (!row.completeness?.required_complete) {
        pushRepair(row, 'required_vector_repair', reasons[0], arg2 ?? null);
      }
      if (row.completeness?.missing_optional_vectors?.includes('summary_384')) {
        pushRepair(row, 'summary_vector_repair', 'missing_optional_vector:summary_384', arg2 ?? null);
      }
      if (row.completeness?.missing_optional_vectors?.includes('latent64')) {
        pushRepair(row, 'routing_vector_repair', 'missing_optional_vector:latent64', arg2 ?? null);
      }
      continue;
    }
    if (row.state === 'identity_contradiction' || row.state === 'projection_contradiction') {
      pushRepair(row, 'quarantine', row.reasons[0] ?? row.state);
    }
  }

  return repairRequests;
}

function applyPayloadRepair(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('payload repair request is required');
  }
  if (request.kind === 'quarantine') {
    throw new Error('quarantine events must not be applied as payload repairs');
  }
  if (request.kind === 'full_projection') {
    throw new Error('full_projection events must be handled by the projection consumer');
  }

  const allowedPatch = {
    packet_id: firstText(request.packet_id) || null,
    packet_key: firstText(request.packet_key) || null,
    source_ref: firstText(request.source_ref) || null,
    aggregate_version: request.aggregate_version ?? null,
    classifier_version: request.classifier_version ?? null,
    title_generator_version: request.title_generator_version ?? null,
    reranker_version: request.reranker_version ?? null,
    domain_metadata: request.domain_metadata ?? null,
    topology_metadata: request.topology_metadata ?? null,
  };

  return Object.fromEntries(Object.entries(allowedPatch).filter(([, value]) => value !== null && value !== undefined));
}

function computeOverallStatus(report = {}) {
  const preflightStatus = String(report.preflightStatus ?? report.preflight_status ?? 'PASS').toUpperCase();
  const contradictionCount = Array.isArray(report.contradictions)
    ? report.contradictions.length
    : Number(report.contradictions ?? report.contradictionCount ?? 0);
  const missingCount = Array.isArray(report.missingPoints)
    ? report.missingPoints.length
    : Number(report.missingPoints ?? report.missing_points ?? 0);
  const staleCount = Array.isArray(report.stalePoints)
    ? report.stalePoints.length
    : Number(report.stalePoints ?? report.stale_points ?? 0);
  const incompleteCount = Array.isArray(report.incompletePoints)
    ? report.incompletePoints.length
    : Number(report.incompletePoints ?? report.incomplete_points ?? 0);
  if (preflightStatus === 'FAIL') return 'FAIL';
  return contradictionCount > 0
    ? 'FAIL'
    : missingCount > 0 || staleCount > 0 || incompleteCount > 0
      ? 'WARN'
      : 'PASS';
}

function outboxEventId(packetKey, eventType) {
  return createHash('sha256')
    .update(`${packetKey}:${eventType}`)
    .digest('hex')
    .slice(0, 16);
}

const outboxId = outboxEventId;

export {
  buildCanonicalPayload,
  outboxId,
  COLLECTION_CONTRACTS,
  applyPayloadRepair,
  classifyParity,
  computeOverallStatus,
  generateRepairEvents,
  outboxEventId,
  resolveCollectionConfiguration,
  resolveSample,
  resolveSampleConfiguration,
  validateVectorContract,
};
