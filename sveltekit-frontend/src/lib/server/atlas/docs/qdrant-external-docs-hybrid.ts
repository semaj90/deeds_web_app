import {
  buildExternalDocsHybridProofGate,
  buildExternalDocsShadowCollectionConfig,
  deriveQdrantVersionCapabilities,
  qdrantExternalDocsCapabilityProfileSchema,
  type ExternalDocsHybridProofGateV1,
  type ExternalDocsHybridQdrantPort,
  type QdrantExternalDocsCapabilityProfileV1,
  type QdrantHybridWirePointV1,
} from '@deeds/parent-atlas';
import { ENV } from '../../env.server.js';

const CURRENT_COLLECTION = 'external_programming_docs_768';
const COLLECTION = 'external_programming_docs_hybrid_768';

function qdrantHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(ENV.QDRANT_API_KEY ? { 'api-key': ENV.QDRANT_API_KEY } : {}),
  };
}

function qdrantUrl(path: string): string {
  return `${ENV.QDRANT_URL.replace(/\/$/, '')}${path}`;
}

async function qdrantJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(qdrantUrl(path), {
    ...init,
    headers: { ...qdrantHeaders(), ...(init?.headers ?? {}) },
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`QDRANT_EXTERNAL_DOCS_FAILED:${response.status}:${JSON.stringify(body)}`);
  }
  return body;
}

async function collectionInfo(collection: string): Promise<any | null> {
  const response = await fetch(qdrantUrl(`/collections/${collection}`), {
    headers: qdrantHeaders(),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`QDRANT_COLLECTION_PROBE_FAILED:${collection}:${response.status}:${JSON.stringify(body)}`);
  return body?.result ?? null;
}

function vectorMode(info: any, missing: 'MISSING' | 'UNKNOWN' = 'UNKNOWN'): 'MISSING' | 'UNKNOWN' | 'UNNAMED_DENSE' | 'NAMED_DENSE' | 'HYBRID_DENSE_SPARSE' {
  if (!info) return missing;
  const vectors = info?.config?.params?.vectors;
  const sparse = info?.config?.params?.sparse_vectors ?? info?.config?.params?.sparseVectors;
  if (sparse && Object.keys(sparse).length > 0) return 'HYBRID_DENSE_SPARSE';
  if (vectors && typeof vectors === 'object' && 'size' in vectors) return 'UNNAMED_DENSE';
  if (vectors && typeof vectors === 'object' && Object.keys(vectors).length > 0) return 'NAMED_DENSE';
  return 'UNKNOWN';
}

export async function probeExternalDocsQdrantCapabilities(input: {
  producerRevision?: string;
} = {}): Promise<QdrantExternalDocsCapabilityProfileV1> {
  const root = await qdrantJson('/');
  const version = String(root?.version ?? root?.result?.version ?? '');
  if (!version) throw new Error('QDRANT_VERSION_MISSING');
  const versionCapabilities = deriveQdrantVersionCapabilities(version);
  const [current, shadow] = await Promise.all([
    collectionInfo(CURRENT_COLLECTION),
    collectionInfo(COLLECTION),
  ]);

  return qdrantExternalDocsCapabilityProfileSchema.parse({
    probed_at: new Date().toISOString(),
    qdrant_version: version,
    qdrant_commit: root?.commit ? String(root.commit) : null,
    ...versionCapabilities,
    native_bm25_inference: 'UNPROBED',
    current_collection_exists: current !== null,
    shadow_collection_exists: shadow !== null,
    current_collection_vector_mode: vectorMode(current, 'UNKNOWN'),
    shadow_collection_vector_mode: vectorMode(shadow, 'MISSING'),
    producer_revision: input.producerRevision ?? 'parent-atlas-qdrant-capability-probe-v1',
    canonical_authority: false,
  });
}

/** Creates only the shadow collection; never mutates or drops the current one. */
export async function ensureExternalDocsHybridShadowCollection(): Promise<'CREATED' | 'EXISTS'> {
  const profile = await probeExternalDocsQdrantCapabilities();
  if (profile.shadow_collection_exists) {
    if (profile.shadow_collection_vector_mode !== 'HYBRID_DENSE_SPARSE') {
      throw new Error(`QDRANT_SHADOW_SCHEMA_MISMATCH:${profile.shadow_collection_vector_mode}`);
    }
    return 'EXISTS';
  }

  await qdrantJson(`/collections/${COLLECTION}`, {
    method: 'PUT',
    body: JSON.stringify(buildExternalDocsShadowCollectionConfig(profile)),
  });
  return 'CREATED';
}

/**
 * Bounded live probe for native BM25 inference. The probe point exists only in
 * the shadow collection and is deleted before the function returns.
 */
export async function probeNativeBm25Inference(input: {
  producerRevision?: string;
} = {}): Promise<{
  profile: QdrantExternalDocsCapabilityProfileV1;
  gate: ExternalDocsHybridProofGateV1;
}> {
  await ensureExternalDocsHybridShadowCollection();
  const initial = await probeExternalDocsQdrantCapabilities({ producerRevision: input.producerRevision });
  const probeId = '02d2f6a7-197f-5ec2-a090-c56e97a04d1f';
  let nativeBm25: QdrantExternalDocsCapabilityProfileV1['native_bm25_inference'] = 'UNSUPPORTED';

  try {
    await qdrantJson(`/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({
        points: [{
          id: probeId,
          vector: {
            lexical_bm25: {
              text: 'atlas qdrant bm25 capability probe',
              model: 'Qdrant/bm25',
            },
          },
          payload: { atlas_probe: true, canonical_authority: false },
        }],
      }),
    });

    const result = await qdrantJson(`/collections/${COLLECTION}/points/query`, {
      method: 'POST',
      body: JSON.stringify({
        query: {
          text: 'atlas qdrant bm25 capability probe',
          model: 'Qdrant/bm25',
        },
        using: 'lexical_bm25',
        filter: {
          must: [{ key: 'atlas_probe', match: { value: true } }],
        },
        limit: 1,
        with_payload: true,
      }),
    });
    const points = result?.result?.points ?? result?.result ?? [];
    nativeBm25 = Array.isArray(points) && points.some((point: any) => String(point?.id) === probeId)
      ? 'SUPPORTED'
      : 'UNSUPPORTED';
  } catch {
    nativeBm25 = 'UNSUPPORTED';
  } finally {
    await qdrantJson(`/collections/${COLLECTION}/points/delete?wait=true`, {
      method: 'POST',
      body: JSON.stringify({ points: [probeId] }),
    }).catch(() => undefined);
  }

  const profile = qdrantExternalDocsCapabilityProfileSchema.parse({
    ...initial,
    probed_at: new Date().toISOString(),
    native_bm25_inference: nativeBm25,
  });
  return {
    profile,
    gate: buildExternalDocsHybridProofGate({
      gateId: `external-docs-hybrid:${profile.qdrant_version}`,
      gateRevision: 'external-docs-hybrid-proof-v1',
      profile,
      requireNativeBm25: true,
    }),
  };
}

function operationId(body: any): string | number | null {
  return body?.result?.operation_id ?? body?.result?.operationId ?? null;
}

export function createExternalDocsHybridQdrantPort(): ExternalDocsHybridQdrantPort {
  return {
    async upsert(points: QdrantHybridWirePointV1[]) {
      if (points.length === 0) return [];
      const body = await qdrantJson(`/collections/${COLLECTION}/points?wait=true`, {
        method: 'PUT',
        body: JSON.stringify({ points }),
      });
      const id = operationId(body);
      return id === null ? [] : [id];
    },
    async delete(pointIds: string[]) {
      if (pointIds.length === 0) return [];
      const body = await qdrantJson(`/collections/${COLLECTION}/points/delete?wait=true`, {
        method: 'POST',
        body: JSON.stringify({ points: pointIds }),
      });
      const id = operationId(body);
      return id === null ? [] : [id];
    },
  };
}
