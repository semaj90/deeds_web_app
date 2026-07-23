export type EmbeddingProvider = 'ollama' | 'llama-server';

export type EmbeddingFailureKind =
  | 'SEQUENCE_EXCEEDS_PHYSICAL_BATCH'
  | 'INPUT_BATCH_TOO_LARGE'
  | 'CONTEXT_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_DIMENSIONS'
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN';

export type EmbeddingBackendResolution = {
  provider: EmbeddingProvider;
  baseUrl: string;
  model: string;
};

function resolveProvider(
  opts?: { provider?: EmbeddingProvider; configuredProvider?: string },
): EmbeddingProvider {
  if (opts?.provider) {
    return opts.provider;
  }

  const configured = String(opts?.configuredProvider ?? '').toLowerCase();

  if (configured === 'ollama' || configured === 'llama-server') {
    return configured as EmbeddingProvider;
  }

  return 'ollama';
}

function resolveBaseUrl(
  provider: EmbeddingProvider,
  opts?: { baseUrl?: string; configuredBaseUrl?: string; fallbackBaseUrl?: string },
): string {
  const configured =
    opts?.baseUrl ?? opts?.configuredBaseUrl ?? opts?.fallbackBaseUrl;

  if (!configured) {
    throw new Error(
      `No embedding base URL configured for provider ${provider}. ` +
        `Set EMBEDDING_BASE_URL or OLLAMA_BASE_URL environment variables.`,
    );
  }

  return configured.replace(/\/+$/, '');
}

export function classifyEmbeddingError(message: string): EmbeddingFailureKind {
  if (
    /input:\s*\d+\s*tokens/i.test(message) &&
    /physical batch size/i.test(message)
  ) {
    return 'SEQUENCE_EXCEEDS_PHYSICAL_BATCH';
  }

  if (/batch size/i.test(message) && /too large|exceed/i.test(message)) {
    return 'INPUT_BATCH_TOO_LARGE';
  }

  if (/context(?: length| window)?.*(?:exceed|too large)/i.test(message)) {
    return 'CONTEXT_EXCEEDED';
  }

  if (/not found|no such model/i.test(message)) {
    return 'MODEL_NOT_FOUND';
  }

  if (/dimension|dimensions|dim(?:s)?|mismatch/i.test(message)) {
    return 'INVALID_DIMENSIONS';
  }

  if (/malformed|json|parse|unexpected/i.test(message)) {
    return 'MALFORMED_RESPONSE';
  }

  if (
    /timeout|connect|ECONNREFUSED|unavailable|unable to connect/i.test(message)
  ) {
    return 'PROVIDER_UNAVAILABLE';
  }

  return 'UNKNOWN';
}

export type BackendFingerprint = {
  isOllama: boolean;
  isLlamaServer: boolean;
  supportsEmbeddings: boolean;
  modelList: string[];
  versionInfo?: string;
  error?: string;
};

function extractPortFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : null;
  } catch {
    return null;
  }
}

function getExpectedPortForProvider(provider: EmbeddingProvider): number {
  // llama-server.exe typically runs on 8081 (non-default Ollama port)
  // Ollama typically runs on 11434
  // These are conventions, not absolutes, but mismatches should warn
  return provider === 'llama-server' ? 8081 : 11434;
}

export async function fingerprintBackend(baseUrl: string): Promise<BackendFingerprint> {
  const results: BackendFingerprint = {
    isOllama: false,
    isLlamaServer: false,
    supportsEmbeddings: false,
    modelList: [],
  };

  // Normalize URL
  const url = baseUrl.replace(/\/+$/, '');

  // Check /api/version (Ollama)
  try {
    const versionRes = await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(2000) });
    if (versionRes.ok) {
      const versionData = await versionRes.json();
      if (typeof versionData === 'object' && 'version' in versionData) {
        results.isOllama = true;
        results.versionInfo = (versionData as { version: string }).version;
      }
    }
  } catch {
    // Timeout or connection error — continue
  }

  // Check /health (llama-server)
  try {
    const healthRes = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    if (healthRes.ok) {
      const healthData = await healthRes.json();
      if (typeof healthData === 'object' && 'status' in healthData) {
        results.isLlamaServer = true;
      }
    }
  } catch {
    // Timeout or connection error — continue
  }

  // Check /v1/models (OpenAI-compatible, both Ollama and llama-server support this)
  try {
    const modelsRes = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2000) });
    if (modelsRes.ok) {
      const modelsData = (await modelsRes.json()) as { data?: Array<{ id: string }> };
      if (Array.isArray(modelsData.data)) {
        results.modelList = modelsData.data.map((m) => m.id);
        results.supportsEmbeddings = true;
      }
    }
  } catch {
    // Timeout or connection error — continue
  }

  // Fallback: try /api/embeddings (Ollama-specific)
  if (!results.supportsEmbeddings) {
    try {
      const embedRes = await fetch(`${url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'test', prompt: 'test' }),
        signal: AbortSignal.timeout(2000),
      });
      // Any response (200 or error) means the endpoint exists
      if (embedRes.status !== 404 && embedRes.status !== 501) {
        results.supportsEmbeddings = true;
      }
    } catch {
      // Timeout or connection error — continue
    }
  }

  return results;
}

export type ResolutionValidationError =
  | 'PROVIDER_URL_MISMATCH'
  | 'BACKEND_UNREACHABLE'
  | 'BACKEND_UNKNOWN'
  | 'MISSING_EMBEDDINGS_SUPPORT';

export async function validateResolvedBackend(
  provider: EmbeddingProvider,
  baseUrl: string,
  opts?: { allowMismatch?: boolean },
): Promise<{ valid: boolean; errors: ResolutionValidationError[]; fingerprint: BackendFingerprint }> {
  const errors: ResolutionValidationError[] = [];
  const fingerprint = await fingerprintBackend(baseUrl);
  const pushError = (error: ResolutionValidationError) => {
    if (!errors.includes(error)) {
      errors.push(error);
    }
  };

  // Check if backend is unreachable
  if (!fingerprint.isOllama && !fingerprint.isLlamaServer) {
    pushError('BACKEND_UNREACHABLE');
    return { valid: false, errors, fingerprint };
  }

  // Check if backend is unknown (no fingerprint match)
  if (!fingerprint.isOllama && !fingerprint.isLlamaServer) {
    pushError('BACKEND_UNKNOWN');
  }

  // Check provider-URL mismatch (CRITICAL)
  // llama-server should be on 8081 (or similar non-standard port)
  // Ollama should be on 11434 (or similar standard port)
  // Port 11434 is Ollama's default; port 8081 is common for llama-server
  const port = extractPortFromUrl(baseUrl);
  const expectedPort = getExpectedPortForProvider(provider);

  if (port !== null && port !== expectedPort) {
    // Port mismatch detected
    if (!opts?.allowMismatch) {
      pushError('PROVIDER_URL_MISMATCH');
    }
  }

  // Check embeddings support
  if (!fingerprint.supportsEmbeddings) {
    pushError('MISSING_EMBEDDINGS_SUPPORT');
  }

  // Explicit provider-runtime mismatch: llama-server config but Ollama runtime detected
  if (provider === 'llama-server' && fingerprint.isOllama && !fingerprint.isLlamaServer) {
    if (!opts?.allowMismatch) {
      pushError('PROVIDER_URL_MISMATCH');
    }
  }

  // Explicit provider-runtime mismatch: ollama config but llama-server runtime detected
  if (provider === 'ollama' && fingerprint.isLlamaServer && !fingerprint.isOllama) {
    if (!opts?.allowMismatch) {
      pushError('PROVIDER_URL_MISMATCH');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    fingerprint,
  };
}

export function resolveEmbeddingBackend(
  model = 'embeddinggemma:latest',
  opts?: {
    provider?: EmbeddingProvider;
    baseUrl?: string;
    configuredProvider?: string;
    configuredBaseUrl?: string;
    fallbackBaseUrl?: string;
  },
): EmbeddingBackendResolution {
  const provider = resolveProvider(opts);
  const baseUrl = resolveBaseUrl(provider, opts);

  return { provider, baseUrl, model };
}
