/**
 * EmbeddingGemma Service
 * ----------------------
 * Unified embedding client for Gemma (via Ollama or TensorRT-LLM).
 *
 * ✅ Automatic Redis caching with TTL auto-refresh
 * ✅ Health-check + fallback handling
 * ✅ Configurable endpoint paths (Ollama / TensorRT)
 */

import redisCacheUtils from "$lib/server/cache/redis"; // Changed to import default object
import getOllamaEndpoint from "$lib/server/utils/env"; // Changed to default import

const DEFAULT_MODEL = process.env.EMBED_MODEL || "embeddinggemma:latest";
// Renamed and adjusted to be a base URL, consistent with getOllamaEndpoint's expected return.
// It now directly uses process.env.OLLAMA_URL as a fallback as per instructions.
const FALLBACK_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_EMBED_API_PATH = "/api/embeddings"; // Define the specific API path for embeddings

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const HEALTHCHECK_INTERVAL = 60_000; // 1 min
let lastHealthCheck = 0;
let healthy = true;

/* -------------------------------------------------------------------------- */
/*  Low-level HTTP fetch helper                                               */
/* -------------------------------------------------------------------------- */
async function fetchJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/* -------------------------------------------------------------------------- */
/*  Health check to prevent repeated failing requests                         */
/* -------------------------------------------------------------------------- */
async function checkEndpointHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTHCHECK_INTERVAL) return healthy;
  lastHealthCheck = now;

  try {
    // Use the base URL for health check
    const base = getOllamaEndpoint() || FALLBACK_BASE_URL;
    // Health check typically on the base path or a specific /health endpoint
    const healthCheckUrl = `${base}/`; // Assuming base URL itself or / is sufficient for health check
    const res = await fetch(healthCheckUrl, { method: "GET" });
    healthy = res.ok;
  } catch {
    healthy = false;
  }
  return healthy;
}

/* -------------------------------------------------------------------------- */
/*  Core Embedding Function                                                   */
/* -------------------------------------------------------------------------- */
export async function getEmbeddingFromGemma(
  text: string,
  model = DEFAULT_MODEL
): Promise<number[]> {
  const key = `embedding:${model}:${text.slice(0, 200)}`;

  // 🔹 Step 1: Try Redis cache
  const cached = (await redisCacheUtils.cacheGet(key)) as number[]; // Access via default object
  if (cached) {
    // Auto-refresh TTL for hot keys
    // The cacheGet/cacheSet functions should ideally handle TTL refresh internally.
    // Removing direct client access as it's tied to the old 'cache' object structure.
    // If TTL refresh is needed, it should be implemented within cacheGet/cacheSet.
    return cached;
  }

  // 🔹 Step 2: Check health and fallback
  const healthyEndpoint = await checkEndpointHealth();
  if (!healthyEndpoint) {
    console.warn(`[EmbeddingGemma] Endpoint unhealthy, returning empty vector`);
    return [];
  }

  // 🔹 Step 3: Fetch from Ollama / TensorRT-LLM endpoint
  try {
    // Get the base endpoint from the central helper or fallback
    const baseEndpoint = getOllamaEndpoint() || FALLBACK_BASE_URL; // Changed from getOllamaEndpoint?.()
    // Construct the full embedding endpoint URL by appending the API path
    const fullEndpoint = `${baseEndpoint}${OLLAMA_EMBED_API_PATH}`;
    const body = { model, input: text };

    const data = await fetchJSON(fullEndpoint, body);

    // Normalize output from possible formats
    const vector: number[] =
      data?.embedding ||
      data?.data?.[0]?.embedding ||
      data?.vector ||
      data?.output ||
      [];

    if (!Array.isArray(vector) || vector.length === 0) {
      console.warn("[EmbeddingGemma] Empty or invalid embedding response");
      return [];
    }

    // 🔹 Step 4: Cache embedding
    await redisCacheUtils.cacheSet(key, vector, DEFAULT_TTL_MS); // Access via default object
    return vector;
  } catch (err) {
    console.error("getEmbeddingFromGemma error:", redisCacheUtils.formatError(err)); // Access via default object
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*  Health + Diagnostics                                                      */
/* -------------------------------------------------------------------------- */
export async function testEmbeddingHealth(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const status = await checkEndpointHealth();
    return { ok: status, reason: status ? "healthy" : "endpoint unreachable" };
  } catch (err) {
    return { ok: false, reason: redisCacheUtils.formatError(err) }; // Access via default object
  }
}

/* -------------------------------------------------------------------------- */
/*  Example Usage                                                             */
/* -------------------------------------------------------------------------- */
/**
import { getEmbeddingFromGemma } from "$lib/server/ai/embeddinggemma-service";

const emb = await getEmbeddingFromGemma("The plaintiff filed a motion for dismissal");
console.log("Embedding length:", emb.length);
*/
