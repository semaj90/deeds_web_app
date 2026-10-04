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

/** The fields of `atlas.emb-prov-01-embedding-provenance-receipt.v1` that the binding reads. */
export interface EmbeddingModelReceiptV1 {
  schema: string;
  generatedAt: string;
  status: string;
  artifact: {
    liveArtifactSha256: string;
    recordedModelArtifactRevision: string;
    artifactChecksumMatchesRevision: boolean;
  };
  runtimeLoadedArtifact?: { loadedMatchesArtifact?: boolean };
  crossExecutorParity?: { executorsAgree?: boolean; parity?: { dim?: number } };
  provenanceFields?: { serverModelAlias?: string };
}

export interface ReceiptBindingV1 {
  /** The probe with dimension / artifact revision filled in only when the receipt truly covers this runtime. */
  probe: EmbeddingRuntimeProbeV1;
  bound: boolean;
  reasons: string[];
}

const RECEIPT_SCHEMA_V1 = 'atlas.emb-prov-01-embedding-provenance-receipt.v1';
const RECEIPT_PROVEN = 'EMB_PROV_01_PROVEN';

const stripSha = (value: string): string => value.trim().toLowerCase().replace(/^sha256[:-]/, '');

/**
 * Bind a runtime probe to the committed model receipt (EMBED-RUNTIME-READBACK-01 step 2).
 *
 * The receipt proves ONE artifact: the GGUF served by the strict llama.cpp lane. It says nothing about
 * the bytes behind another executor; cross-executor cosine parity is evidence of agreement, never of
 * identity. So:
 *   - 'llama-server': the receipt's artifact revision and 768 dimension are bound if the receipt is
 *     proven, fresh, self-consistent and recorded the loaded path matching the artifact.
 *   - 'ollama': bound only if the caller supplies the observed artifact sha256 of Ollama's blob AND it
 *     equals the receipt's artifact. A different blob stays unbound (reason names both hashes).
 *   - 'cpu': never bound from this receipt.
 * A stale or unproven receipt binds nothing. This function reads no files and makes no network calls.
 */
export function bindProbeToModelReceiptV1(
  probe: EmbeddingRuntimeProbeV1,
  receipt: EmbeddingModelReceiptV1,
  options: { maxAgeHours?: number; now?: Date; observedArtifactSha256?: string | null } = {},
): ReceiptBindingV1 {
  const unbound = (reasons: string[]): ReceiptBindingV1 => ({ probe, bound: false, reasons });
  const maxAgeHours = options.maxAgeHours ?? 168;
  const now = options.now ?? new Date();

  if (receipt.schema !== RECEIPT_SCHEMA_V1) return unbound(['receipt schema is not the EMB-PROV-01 v1 schema']);
  if (receipt.status !== RECEIPT_PROVEN) return unbound([`receipt status is ${receipt.status}, not ${RECEIPT_PROVEN}`]);
  if (!receipt.artifact?.artifactChecksumMatchesRevision) return unbound(['receipt artifact checksum does not match its recorded revision']);
  const generated = Date.parse(receipt.generatedAt);
  if (!Number.isFinite(generated)) return unbound(['receipt generatedAt is not a valid timestamp']);
  const ageHours = (now.getTime() - generated) / 3_600_000;
  if (ageHours > maxAgeHours) return unbound([`receipt is ${Math.round(ageHours)} h old (limit ${maxAgeHours} h)`]);
  if (receipt.crossExecutorParity?.parity?.dim !== EXPECTED_EMBEDDING_DIMENSION_V1) return unbound(['receipt did not record a 768 dimension']);

  const receiptSha = stripSha(receipt.artifact.liveArtifactSha256);
  if (!receiptSha || receiptSha !== stripSha(receipt.artifact.recordedModelArtifactRevision)) return unbound(['receipt live sha256 and recorded revision disagree']);

  const bind = (): ReceiptBindingV1 => ({
    probe: { ...probe, dimension: EXPECTED_EMBEDDING_DIMENSION_V1, modelArtifactRevision: receipt.artifact.recordedModelArtifactRevision },
    bound: true,
    reasons: [],
  });

  switch (probe.provider) {
    case 'llama-server':
      if (receipt.runtimeLoadedArtifact?.loadedMatchesArtifact !== true) return unbound(['receipt did not record the loaded llama-server path matching the artifact']);
      return bind();
    case 'ollama': {
      const observed = options.observedArtifactSha256 ? stripSha(options.observedArtifactSha256) : '';
      if (!observed) return unbound(['Ollama artifact sha256 was not observed; cross-executor parity does not prove identity']);
      if (observed !== receiptSha) {
        return unbound([`Ollama blob sha256 ${observed.slice(0, 12)}... differs from the receipt artifact ${receiptSha.slice(0, 12)}...; executor parity is not artifact identity`]);
      }
      return bind();
    }
    default:
      return unbound(['the cpu backend is not covered by this receipt']);
  }
}
