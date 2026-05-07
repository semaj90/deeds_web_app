/**
 * Model Loader — lazy health-check + VRAM-aware backend selection.
 *
 * Provides a cached view of which inference backends are alive so
 * each request doesn't re-probe all 7 endpoints.  Warm-state is stored
 * in Redis under the `agent` cache domain with a 30s TTL so stale health
 * data ages out within half a minute.
 *
 * Depends on: cache-config.ts (Layer 0.2)
 *
 * The inference-router.ts cascade is unchanged — model-loader answers
 * the higher-level question: "which backend should I try FIRST?"
 * and lets inference-router handle the fallback waterfall.
 */

import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';

// ─── Backend registry ─────────────────────────────────────────────────────────

export type BackendName =
  | 'tensorrt'
  | 'triton'
  | 'turboquant'
  | 'bifrost'
  | 'vlm'
  | 'litert'
  | 'ollama';

interface BackendConfig {
  name: BackendName;
  healthUrl: string;
  /** Whether this backend needs a vision mmproj (VRAM-heavy) */
  requiresVision: boolean;
  /** Minimum free VRAM in MB required to use this backend */
  minVramMb: number;
  /** Probe timeout in ms */
  probeTimeoutMs: number;
  /** Priority — lower is tried first (matches inference-router cascade) */
  priority: number;
}

const BACKENDS: BackendConfig[] = [
  {
    name: 'tensorrt',
    healthUrl: `${ENV.TENSORRT_URL}/health`,
    requiresVision: false,
    minVramMb: 4000,
    probeTimeoutMs: 2000,
    priority: 1,
  },
  {
    name: 'triton',
    healthUrl: `${ENV.TRITON_URL}/v2/health/ready`,
    requiresVision: false,
    minVramMb: 4000,
    probeTimeoutMs: 2000,
    priority: 2,
  },
  {
    name: 'turboquant',
    healthUrl: `${ENV.TURBOQUANT_BASE_URL}/health`,
    requiresVision: false,
    minVramMb: 3400,
    probeTimeoutMs: 2000,
    priority: 3,
  },
  {
    name: 'bifrost',
    healthUrl: `${ENV.BIFROST_URL}/health`,
    requiresVision: false,
    minVramMb: 0,
    probeTimeoutMs: 500,
    priority: 4,
  },
  {
    name: 'vlm',
    healthUrl: `${ENV.VLM_BASE_URL}/health`,
    requiresVision: true,
    minVramMb: 5800,
    probeTimeoutMs: 2000,
    priority: 5,
  },
  {
    name: 'litert',
    healthUrl: `${ENV.LITERT_BASE_URL}/health`,
    requiresVision: false,
    minVramMb: 0,
    probeTimeoutMs: 2000,
    priority: 6,
  },
  {
    name: 'ollama',
    healthUrl: `${ENV.OLLAMA_BASE_URL}/api/tags`,
    requiresVision: false,
    minVramMb: 0,
    probeTimeoutMs: 3000,
    priority: 7,
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackendStatus {
  name: BackendName;
  alive: boolean;
  latencyMs: number;
  checkedAt: number;  // epoch ms
}

export interface ModelLoaderStatus {
  backends: BackendStatus[];
  /** The fastest alive non-vision backend at check time */
  preferredBackend: BackendName;
  /** Whether any vision-capable backend is available */
  visionAvailable: boolean;
  checkedAt: number;
}

// ─── Redis key ────────────────────────────────────────────────────────────────

const STATUS_KEY = 'model-loader:status';
const STATUS_TTL = 30; // seconds — stale health data expires in 30s

// ─── Probing ─────────────────────────────────────────────────────────────────

async function probeBackend(cfg: BackendConfig): Promise<BackendStatus> {
  const start = Date.now();
  try {
    const res = await fetch(cfg.healthUrl, {
      signal: AbortSignal.timeout(cfg.probeTimeoutMs),
    });
    return {
      name: cfg.name,
      alive: res.ok,
      latencyMs: Date.now() - start,
      checkedAt: Date.now(),
    };
  } catch {
    return { name: cfg.name, alive: false, latencyMs: cfg.probeTimeoutMs, checkedAt: Date.now() };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Probe all backends in parallel and cache the results in Redis.
 * Subsequent calls within STATUS_TTL return the cached snapshot.
 */
export async function refreshModelStatus(): Promise<ModelLoaderStatus> {
  const results = await Promise.all(BACKENDS.map(probeBackend));

  const alive = results.filter(s => s.alive);
  const sortedByPriority = [...BACKENDS].sort((a, b) => a.priority - b.priority);
  const preferredCfg = sortedByPriority.find(cfg => alive.some(s => s.name === cfg.name && !cfg.requiresVision));
  const visionAvailable = alive.some(s => {
    const cfg = BACKENDS.find(b => b.name === s.name);
    return cfg?.requiresVision;
  });

  const status: ModelLoaderStatus = {
    backends: results,
    preferredBackend: preferredCfg?.name ?? 'ollama',
    visionAvailable,
    checkedAt: Date.now(),
  };

  try {
    const redis = getRedis();
    await redis.set(STATUS_KEY, JSON.stringify(status), 'EX', STATUS_TTL);
  } catch {
    // Redis unavailable — in-memory fallback (single-request scope)
  }

  return status;
}

/**
 * Get the current model status — returns cached if fresh, probes if stale.
 */
export async function getModelStatus(): Promise<ModelLoaderStatus> {
  try {
    const redis = getRedis();
    const cached = await redis.get(STATUS_KEY);
    if (cached) return JSON.parse(cached) as ModelLoaderStatus;
  } catch {
    // Redis unavailable — fall through to fresh probe
  }
  return refreshModelStatus();
}

/**
 * Pick the best backend for a request, optionally requiring vision capability.
 *
 * @param requiresVision - Set true for image analysis queries (VLM path)
 * @returns Backend name to try first; inference-router handles fallback
 */
export async function getPreferredBackend(requiresVision = false): Promise<BackendName> {
  const status = await getModelStatus();

  if (requiresVision) {
    const visionBackend = status.backends.find(s => {
      if (!s.alive) return false;
      const cfg = BACKENDS.find(b => b.name === s.name);
      return cfg?.requiresVision;
    });
    return visionBackend?.name ?? 'ollama';
  }

  return status.preferredBackend;
}

/**
 * Check whether a specific backend is currently alive.
 * Uses cached status — cheap to call on every request.
 */
export async function isBackendAlive(name: BackendName): Promise<boolean> {
  const status = await getModelStatus();
  return status.backends.find(s => s.name === name)?.alive ?? false;
}

/**
 * Warm up — probes all backends once at server startup and caches results.
 * Call from hooks.server.ts alongside warmupCachingLayer().
 */
export async function warmupModelLoader(): Promise<void> {
  try {
    await refreshModelStatus();
  } catch {
    // Non-fatal — first real request will probe lazily
  }
}
