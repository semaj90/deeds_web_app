export const TOPOLOGY_COLLECTIONS = Object.freeze([
  'codebase_chunks_768',
  'research_summaries',
  'legal_documents',
  'evidence_items',
]);

const MAX_QUERY_LENGTH = 2_000;
const MAX_LIMIT = 100;
const MAX_RADIUS = 10;
const MAX_TAGS = 32;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validQuery(value, required) {
  if (value == null && !required) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'query must be a string' };
  const query = value.trim();
  if (!query && required) return { ok: false, error: 'query is required' };
  if (query.length > MAX_QUERY_LENGTH) return { ok: false, error: `query must be at most ${MAX_QUERY_LENGTH} characters` };
  return { ok: true, value: query || null };
}

export function validateSearchRequest(route, body) {
  if (!isRecord(body)) return { ok: false, error: 'request body must be a JSON object' };

  const queryRequired = route !== '/search';
  const queryResult = validQuery(body.query, queryRequired);
  if (!queryResult.ok) return queryResult;
  const query = queryResult.value;

  const limit = body.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { ok: false, error: `limit must be an integer from 1 to ${MAX_LIMIT}` };
  }

  const radius = body.radius ?? 0.25;
  if (route !== '/search/cosine' && (!Number.isFinite(radius) || radius < 0 || radius > MAX_RADIUS)) {
    return { ok: false, error: `radius must be a finite number from 0 to ${MAX_RADIUS}` };
  }

  let center = body.center;
  if (center !== undefined && (!Array.isArray(center) || center.length !== 4 || !center.every(Number.isFinite))) {
    return { ok: false, error: 'center must contain exactly four finite numbers' };
  }

  const somCluster = body.somCluster;
  if (somCluster != null && (!Number.isInteger(somCluster) || somCluster < 0)) {
    return { ok: false, error: 'somCluster must be a non-negative integer' };
  }

  const tags = body.tags ?? [];
  if (!Array.isArray(tags) || tags.length > MAX_TAGS || tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 128)) {
    return { ok: false, error: `tags must be an array of at most ${MAX_TAGS} non-empty strings (128 characters max)` };
  }

  const collection = body.collection ?? 'codebase_chunks_768';
  if (route === '/search/cosine' && !TOPOLOGY_COLLECTIONS.includes(collection)) {
    return { ok: false, error: 'unsupported collection' };
  }

  return {
    ok: true,
    value: { query, center, radius, limit, somCluster, tags: tags.map((tag) => tag.trim()), collection },
  };
}

function field(record, snake, camel) {
  return record?.[snake] ?? record?.[camel] ?? null;
}

/** A path is deliberately absent: it is mutable display metadata, not identity. */
export function topologyIdentityKey(candidate) {
  const payload = candidate?.payload ?? candidate?.qdrantPayload ?? candidate?.qdrant_payload ?? {};
  const outputMeta = candidate?.outputMeta ?? candidate?.output_meta ?? {};
  const stableKey = field(candidate, 'stable_key', 'stableKey') ?? field(payload, 'stable_key', 'stableKey');
  const sourceRef = field(candidate, 'source_ref', 'sourceRef') ?? field(payload, 'source_ref', 'sourceRef') ?? field(outputMeta, 'source_ref', 'sourceRef');
  const sourceRevision = field(candidate, 'source_revision', 'sourceRevision') ?? field(payload, 'source_revision', 'sourceRevision') ?? field(outputMeta, 'source_revision', 'sourceRevision');
  const contentHash = field(candidate, 'content_hash', 'contentHash') ?? field(payload, 'content_hash', 'contentHash') ?? field(outputMeta, 'content_hash', 'contentHash');
  const representationRevision = field(candidate, 'representation_revision', 'representationRevision') ?? field(payload, 'representation_revision', 'representationRevision') ?? field(outputMeta, 'representation_revision', 'representationRevision');
  const topologySnapshotRevision = field(candidate, 'topology_snapshot_revision', 'topologySnapshotRevision') ?? field(payload, 'topology_snapshot_revision', 'topologySnapshotRevision') ?? field(outputMeta, 'topology_snapshot_revision', 'topologySnapshotRevision');

  const required = [stableKey, sourceRef, sourceRevision, contentHash];
  if (required.some((value) => typeof value !== 'string' || !value.trim())) return null;
  const revisionKind = representationRevision ? 'representation' : topologySnapshotRevision ? 'topology_snapshot' : null;
  const revision = revisionKind === 'representation' ? representationRevision : topologySnapshotRevision;
  if (!revisionKind || typeof revision !== 'string' || !revision.trim()) return null;
  return JSON.stringify([stableKey.trim(), sourceRef.trim(), sourceRevision.trim(), contentHash.trim(), revisionKind, revision.trim()]);
}

export function buildHybridResult({ query, center, radius, limit, cosineHits, manifoldHits, fallbackReason, durationMs }) {
  const cosineRows = cosineHits.map((hit) => {
    const payload = hit.payload ?? {};
    const summary = hit.payload?.summary ?? hit.payload?.content ?? '';
    return {
      stableKey: field(payload, 'stable_key', 'stableKey'),
      sourceRef: field(payload, 'source_ref', 'sourceRef'),
      sourceRevision: field(payload, 'source_revision', 'sourceRevision'),
      contentHash: field(payload, 'content_hash', 'contentHash'),
      representationRevision: field(payload, 'representation_revision', 'representationRevision'),
      topologySnapshotRevision: field(payload, 'topology_snapshot_revision', 'topologySnapshotRevision'),
      identityKey: topologyIdentityKey(hit),
      id: hit.id,
      path: payload.path ?? payload.relative_path ?? null,
      cosineScore: Number.isFinite(hit.score) ? hit.score : 0,
      summary: typeof summary === 'string' ? summary.slice(0, 200) : '',
      manifoldScore: 0,
      hybridScore: Number.isFinite(hit.score) ? hit.score : 0,
    };
  });

  const cosineByIdentity = new Map();
  for (const hit of cosineRows) {
    if (!hit.identityKey) continue;
    const rows = cosineByIdentity.get(hit.identityKey) ?? [];
    rows.push(hit);
    cosineByIdentity.set(hit.identityKey, rows);
  }
  const topologyByIdentity = new Map();
  for (const hit of manifoldHits) {
    const identityKey = topologyIdentityKey(hit);
    const rows = identityKey ? topologyByIdentity.get(identityKey) ?? [] : [];
    if (identityKey) {
      rows.push({ ...hit, identityKey });
      topologyByIdentity.set(identityKey, rows);
    }
  }

  const matchedTopology = new Set();
  for (const [identityKey, topologyRows] of topologyByIdentity) {
    const cosineMatches = cosineByIdentity.get(identityKey) ?? [];
    // Duplicate identities are ambiguous; preserve them separately instead of fusing.
    if (topologyRows.length !== 1 || cosineMatches.length !== 1) continue;
    const topology = topologyRows[0];
    const cosine = cosineMatches[0];
    cosine.manifoldScore = Number.isFinite(topology.manifoldScore) ? topology.manifoldScore : 0;
    cosine.hybridScore = cosine.cosineScore * 0.6 + cosine.manifoldScore * 0.4;
    cosine.summary = cosine.summary || topology.contentPreview || '';
    Object.assign(cosine, {
      topoByte: topology.topoByte,
      topoClass: topology.topoClass,
      topoHex: topology.topoHex,
      somCluster: topology.somCluster,
      graphAuthorityScore: topology.graphAuthorityScore,
      tensorAffinityScore: topology.tensorAffinityScore,
      manifoldDistance: topology.manifoldDistance,
      coords: topology.coords,
    });
    matchedTopology.add(identityKey);
  }

  const unmatchedTopologyHits = manifoldHits.filter((hit) => {
    const key = topologyIdentityKey(hit);
    const rows = key ? topologyByIdentity.get(key) : [];
    return !key || rows?.length !== 1 || (cosineByIdentity.get(key)?.length ?? 0) !== 1 || !matchedTopology.has(key);
  }).map((hit) => ({ ...hit, identityMatch: 'unmatched' }));

  const hasTopologyMatches = matchedTopology.size > 0;
  const effectiveFallback = fallbackReason ?? (manifoldHits.length && !hasTopologyMatches ? 'identity_mismatch' : null);
  cosineRows.sort((a, b) => b.hybridScore - a.hybridScore);
  const rankingMode = hasTopologyMatches ? 'hybrid' : 'cosine_only';
  return {
    ok: true,
    query,
    center,
    radius,
    rankingMode,
    topologyStatus: hasTopologyMatches ? 'used' : fallbackReason === 'no_topology_matches' ? 'no_matches' : fallbackReason ? 'unavailable' : manifoldHits.length ? 'unmatched' : 'no_matches',
    ...(rankingMode === 'cosine_only' ? { fallbackReason: effectiveFallback ?? 'no_topology_matches' } : {}),
    identityJoin: { matched: matchedTopology.size, unmatched: unmatchedTopologyHits.length },
    totalFound: cosineRows.length,
    durationMs,
    hits: cosineRows.slice(0, limit),
    unmatchedTopologyHits: unmatchedTopologyHits.slice(0, limit),
  };
}
