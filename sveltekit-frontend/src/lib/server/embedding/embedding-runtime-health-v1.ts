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
  /** Path the server reports it loaded (llama-server `/props` `model_path`). null/absent = not observed. */
  loadedModelPath?: string | null;
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
    modelPath: string;
    liveArtifactSha256: string;
    recordedModelArtifactRevision: string;
    artifactChecksumMatchesRevision: boolean;
  };
  runtimeLoadedArtifact?: { loadedMatchesArtifact?: boolean };
  crossExecutorParity?: { executorsAgree?: boolean; parity?: { dim?: number } };
  provenanceFields?: { serverModelAlias?: string };
}

export interface ReceiptBindingV1 {
  /** The probe with the artifact revision filled in ONLY when the receipt covers this exact runtime artifact. */
  probe: EmbeddingRuntimeProbeV1;
  /** The exact runtime artifact is covered by the receipt (never from executor parity). */
  artifactIdentityBound: boolean;
  /** 768 is proven for this runtime (receipt recorded 768 AND the live server/readback reports 768). */
  dimensionBound: boolean;
  /** The requested model is actually resident and usable now (a runtime fact, independent of the receipt). */
  runtimeReady: boolean;
  reasons: string[];
}

const RECEIPT_SCHEMA_V1 = 'atlas.emb-prov-01-embedding-provenance-receipt.v1';
const RECEIPT_PROVEN = 'EMB_PROV_01_PROVEN';

const stripSha = (value: string): string => value.trim().toLowerCase().replace(/^sha256[:-]/, '');

/** Windows paths compare case-insensitively with either slash. */
export function normalizeModelPathV1(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

/**
 * Bind a runtime probe to the committed model receipt (EMBED-RUNTIME-READBACK-01 step 2).
 *
 * PERSISTED-SEMANTIC-768-AUTHORITY-01: persisted semantic_768 needs the receipt-bound strict llama.cpp
 * artifact. The receipt proves ONE artifact; cross-executor cosine parity is diagnostic evidence and
 * never satisfies artifact identity. Three different facts are reported separately so they cannot
 * collapse into one bit:
 *   artifactIdentityBound  exact runtime artifact is covered by a proven, fresh, self-consistent receipt
 *   dimensionBound         the LIVE readback reports 768 and the receipt recorded 768
 *   runtimeReady           the requested model is resident and usable now (independent of the receipt)
 * MODEL_READY (classifyEmbeddingRuntimeV1) additionally needs all three: it requires the revision this
 * function fills in only when artifactIdentityBound, a live dimension of 768, and a resident model.
 *
 *   - 'llama-server': identity needs the LIVE `/props` loaded path to equal the receipt artifact path
 *     (the receipt's one-time readback is not enough, and a resident alias could hide another file).
 *   - 'ollama': identity only if the caller supplies the observed blob sha256 and it equals the receipt's
 *     artifact. A different blob stays unbound (reason names both hashes).
 *   - 'cpu': never bound from this receipt.
 * Pure: reads no files and makes no network calls.
 */
export function bindProbeToModelReceiptV1(
  probe: EmbeddingRuntimeProbeV1,
  receipt: EmbeddingModelReceiptV1,
  options: { maxAgeHours?: number; now?: Date; observedArtifactSha256?: string | null; requestedModelId?: string } = {},
): ReceiptBindingV1 {
  const reasons: string[] = [];
  const requested = normalizeEmbeddingModelIdV1(options.requestedModelId ?? receipt.provenanceFields?.serverModelAlias ?? 'embeddinggemma');
  const runtimeReady = probe.reachable && probe.loadedModelIds.some((id) => normalizeEmbeddingModelIdV1(id) === requested);
  if (!runtimeReady) reasons.push('the requested model is not resident and usable on this runtime');

  const receiptReasons: string[] = [];
  const maxAgeHours = options.maxAgeHours ?? 168;
  const now = options.now ?? new Date();
  const generated = Date.parse(receipt.generatedAt);
  const ageHours = (now.getTime() - generated) / 3_600_000;
  const receiptSha = stripSha(receipt.artifact?.liveArtifactSha256 ?? '');

  if (receipt.schema !== RECEIPT_SCHEMA_V1) receiptReasons.push('receipt schema is not the EMB-PROV-01 v1 schema');
  else if (receipt.status !== RECEIPT_PROVEN) receiptReasons.push(`receipt status is ${receipt.status}, not ${RECEIPT_PROVEN}`);
  else if (!receipt.artifact?.artifactChecksumMatchesRevision) receiptReasons.push('receipt artifact checksum does not match its recorded revision');
  else if (!Number.isFinite(generated)) receiptReasons.push('receipt generatedAt is not a valid timestamp');
  else if (ageHours > maxAgeHours) receiptReasons.push(`receipt is ${Math.round(ageHours)} h old (limit ${maxAgeHours} h)`);
  else if (!receiptSha || receiptSha !== stripSha(receipt.artifact.recordedModelArtifactRevision)) receiptReasons.push('receipt live sha256 and recorded revision disagree');
  const receiptTrusted = receiptReasons.length === 0;
  reasons.push(...receiptReasons);

  // Dimension: the receipt recorded 768 AND the live readback reports 768.
  const receiptDim768 = receipt.crossExecutorParity?.parity?.dim === EXPECTED_EMBEDDING_DIMENSION_V1;
  const dimensionBound = receiptTrusted && receiptDim768 && probe.dimension === EXPECTED_EMBEDDING_DIMENSION_V1;
  if (receiptTrusted && !receiptDim768) reasons.push('receipt did not record a 768 dimension');
  if (receiptTrusted && receiptDim768 && probe.dimension !== EXPECTED_EMBEDDING_DIMENSION_V1) {
    reasons.push(`live dimension ${probe.dimension ?? 'not observed'} != ${EXPECTED_EMBEDDING_DIMENSION_V1}`);
  }

  // Artifact identity: provider-specific, never from executor parity.
  let artifactIdentityBound = false;
  if (receiptTrusted) {
    switch (probe.provider) {
      case 'llama-server':
        if (receipt.runtimeLoadedArtifact?.loadedMatchesArtifact !== true) {
          reasons.push('receipt did not record the loaded llama-server path matching the artifact');
        } else if (!probe.loadedModelPath) {
          reasons.push('the live loaded model path was not observed (/props model_path)');
        } else if (normalizeModelPathV1(probe.loadedModelPath) !== normalizeModelPathV1(receipt.artifact.modelPath)) {
          reasons.push(`live loaded path ${probe.loadedModelPath} differs from the receipt artifact path ${receipt.artifact.modelPath}`);
        } else {
          artifactIdentityBound = true;
        }
        break;
      case 'ollama': {
        const observed = options.observedArtifactSha256 ? stripSha(options.observedArtifactSha256) : '';
        if (!observed) {
          reasons.push('Ollama artifact sha256 was not observed; cross-executor parity does not prove identity');
        } else if (observed !== receiptSha) {
          reasons.push(`Ollama blob sha256 ${observed.slice(0, 12)}... differs from the receipt artifact ${receiptSha.slice(0, 12)}...; executor parity is not artifact identity`);
        } else {
          artifactIdentityBound = true;
        }
        break;
      }
      default:
        reasons.push('the cpu backend is not covered by this receipt');
    }
  }

  return {
    probe: { ...probe, modelArtifactRevision: artifactIdentityBound ? receipt.artifact.recordedModelArtifactRevision : probe.modelArtifactRevision },
    artifactIdentityBound,
    dimensionBound,
    runtimeReady,
    reasons,
  };
}

/**
 * Read-only probe of the strict llama.cpp embedding lane (default `:8081`; persisted `semantic_768`
 * is restricted to this lane). It issues only GET `/props` and GET `/v1/models`: it sends no
 * embedding request. It OBSERVES (loaded path from `/props` `model_path`, alias, and the server's
 * `n_embd` from `/v1/models` `meta`); the receipt binder verifies and `classifyEmbeddingRuntimeV1`
 * assigns the state. A llama-server instance has one model, so when it answers, that model is
 * resident; whether it is the REQUESTED one is decided by the classifier from the reported alias.
 */
export async function probeLlamaServerEmbeddingRuntimeV1(options: {
  baseUrl: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => string;
}): Promise<EmbeddingRuntimeProbeV1> {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const base = options.baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
  const observedAt = (options.now ?? (() => new Date().toISOString()))();
  const timeout = options.timeoutMs ?? 3000;
  const get = async (path: string): Promise<Record<string, unknown> | null> => {
    try {
      const res = await doFetch(`${base}${path}`, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const [props, models] = await Promise.all([get('/props'), get('/v1/models')]);
  const reachable = props !== null || models !== null;

  const data = Array.isArray(models?.data) ? (models!.data as Array<Record<string, unknown>>) : [];
  const ids = new Set<string>();
  for (const entry of data) if (typeof entry.id === 'string' && entry.id) ids.add(entry.id);
  if (typeof props?.model_alias === 'string' && props.model_alias) ids.add(props.model_alias);

  const meta = (data[0]?.meta ?? null) as Record<string, unknown> | null;
  const nEmbd = typeof meta?.n_embd === 'number' ? meta.n_embd : null;
  const loadedModelPath = typeof props?.model_path === 'string' && props.model_path ? props.model_path : null;

  return {
    provider: 'llama-server',
    reachable,
    modelAvailable: ids.size > 0 ? true : null,
    loadedModelIds: [...ids],
    dimension: nEmbd,
    modelArtifactRevision: null,
    loadedModelPath,
    observedAt,
  };
}
