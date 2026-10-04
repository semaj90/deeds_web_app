/**
 * EMBED-RUNTIME-READBACK-01: truthful embedding runtime readiness.
 *
 *   backend reachable   !=  model available   !=  model resident   !=  identity proven
 *
 * This module only CLASSIFIES what a probe observed. It never loads a model, never sends an
 * embedding request, and never infers Ollama residency for the CPU backend. A `MODEL_READY`
 * result needs the requested model resident, a 768 dimension and a recorded artifact revision;
 * a resident model without those is `MODEL_IDENTITY_UNPROVEN`, never ready.
 *
 * Not canonical identity: `canonicalAuthority` is always false and the result authorizes nothing
 * by itself (persisted-embedding authorization stays with the receipt gate).
 */

export type EmbeddingRuntimeProviderV1 = 'ollama' | 'llama-server' | 'cpu';

export type EmbeddingRuntimeStatusV1 =
  | 'BACKEND_UNREACHABLE'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_UNLOADED'
  | 'WRONG_MODEL_LOADED'
  | 'MODEL_READY'
  | 'MODEL_IDENTITY_UNPROVEN';

/** What a probe observed. `null` means "the probe could not observe it", not "false". */
export interface EmbeddingRuntimeProbeV1 {
  provider: EmbeddingRuntimeProviderV1;
  reachable: boolean;
  /** Is the requested model installed/known to the backend (e.g. Ollama /api/tags). null = not observed. */
  modelAvailable: boolean | null;
  /** Ids the backend reports as resident (e.g. Ollama /api/ps). Empty array = observed, none resident. */
  loadedModelIds: string[];
  /** Observed embedding dimension, if a bound readback supplied one. */
  dimension: number | null;
  /** Revision of the model artifact (e.g. GGUF sha256) from the bound receipt/readback. */
  modelArtifactRevision: string | null;
  observedAt: string;
}

export interface EmbeddingRuntimeHealthV1 {
  schema: 'atlas.embedding-runtime-health.v1';
  backendReachable: boolean;
  modelAvailable: boolean;
  modelLoaded: boolean;
  requestedModelId: string;
  loadedModelId: string | null;
  provider: EmbeddingRuntimeProviderV1;
  dimension: number | null;
  modelArtifactRevision: string | null;
  status: EmbeddingRuntimeStatusV1;
  reasons: string[];
  observedAt: string;
  canonicalAuthority: false;
}

export const EXPECTED_EMBEDDING_DIMENSION_V1 = 768;

/** `embeddinggemma`, `EmbeddingGemma:latest` and `embeddinggemma:latest` are the same Ollama model id. */
export function normalizeEmbeddingModelIdV1(id: string): string {
  return id.trim().toLowerCase().replace(/:latest$/, '');
}

export function classifyEmbeddingRuntimeV1(
  requestedModelId: string,
  probe: EmbeddingRuntimeProbeV1,
): EmbeddingRuntimeHealthV1 {
  const requested = normalizeEmbeddingModelIdV1(requestedModelId);
  const loaded = probe.loadedModelIds.filter(Boolean);
  const match = loaded.find((id) => normalizeEmbeddingModelIdV1(id) === requested) ?? null;

  const base = {
    schema: 'atlas.embedding-runtime-health.v1' as const,
    requestedModelId,
    provider: probe.provider,
    dimension: probe.dimension,
    modelArtifactRevision: probe.modelArtifactRevision,
    observedAt: probe.observedAt,
    canonicalAuthority: false as const,
  };

  if (!probe.reachable) {
    return {
      ...base, backendReachable: false, modelAvailable: false, modelLoaded: false, loadedModelId: null,
      status: 'BACKEND_UNREACHABLE', reasons: ['provider did not answer'],
    };
  }

  if (probe.modelAvailable === false) {
    return {
      ...base, backendReachable: true, modelAvailable: false, modelLoaded: false, loadedModelId: null,
      status: 'MODEL_UNAVAILABLE', reasons: ['requested model is not installed on the provider'],
    };
  }

  // The CPU backend reports its own model; residency of an Ollama model must never be inferred from it.
  if (probe.provider === 'cpu' && loaded.length === 0) {
    return {
      ...base, backendReachable: true, modelAvailable: probe.modelAvailable === true, modelLoaded: false, loadedModelId: null,
      status: 'MODEL_IDENTITY_UNPROVEN', reasons: ['cpu backend reported no model identity; Ollama residency is not inferred'],
    };
  }

  if (loaded.length === 0) {
    return {
      ...base, backendReachable: true, modelAvailable: probe.modelAvailable === true, modelLoaded: false, loadedModelId: null,
      status: 'MODEL_UNLOADED', reasons: ['provider is up but reports no resident model (it will load on the next request)'],
    };
  }

  if (!match) {
    return {
      ...base, backendReachable: true, modelAvailable: probe.modelAvailable === true, modelLoaded: false, loadedModelId: loaded[0] ?? null,
      status: 'WRONG_MODEL_LOADED', reasons: [`resident: ${loaded.join(', ')}; requested: ${requestedModelId}`],
    };
  }

  const reasons: string[] = [];
  if (probe.dimension !== EXPECTED_EMBEDDING_DIMENSION_V1) reasons.push(`dimension ${probe.dimension ?? 'not observed'} != ${EXPECTED_EMBEDDING_DIMENSION_V1}`);
  if (!probe.modelArtifactRevision) reasons.push('no model artifact revision bound to this readback');

  return {
    ...base, backendReachable: true, modelAvailable: true, modelLoaded: true, loadedModelId: match,
    status: reasons.length === 0 ? 'MODEL_READY' : 'MODEL_IDENTITY_UNPROVEN',
    reasons,
  };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Read-only Ollama probe: GET /api/tags (installed) and GET /api/ps (resident). It sends no
 * embedding request, so it can never load the model it is checking. It cannot observe the
 * artifact revision or dimension, so a real probe yields MODEL_IDENTITY_UNPROVEN until the
 * caller binds those from the model receipt.
 */
export async function probeOllamaEmbeddingRuntimeV1(options: {
  baseUrl: string;
  requestedModelId: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => string;
}): Promise<EmbeddingRuntimeProbeV1> {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const base = options.baseUrl.replace(/\/+$/, '');
  const observedAt = (options.now ?? (() => new Date().toISOString()))();
  const timeout = options.timeoutMs ?? 3000;
  const names = async (path: string): Promise<string[] | null> => {
    try {
      const res = await doFetch(`${base}${path}`, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) return null;
      const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
      return (body.models ?? []).map((m) => String(m.model ?? m.name ?? '')).filter(Boolean);
    } catch {
      return null;
    }
  };
  const [tags, ps] = await Promise.all([names('/api/tags'), names('/api/ps')]);
  const reachable = tags !== null || ps !== null;
  const requested = normalizeEmbeddingModelIdV1(options.requestedModelId);
  return {
    provider: 'ollama',
    reachable,
    modelAvailable: tags === null ? null : tags.some((n) => normalizeEmbeddingModelIdV1(n) === requested),
    loadedModelIds: ps ?? [],
    dimension: null,
    modelArtifactRevision: null,
    observedAt,
  };
}
