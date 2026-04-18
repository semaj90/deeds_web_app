/**
 * Server-Side Inference Router
 *
 * Routes LLM inference through the best available backend:
 *
 * TEXT-ONLY CASCADE:
 *   1. TensorRT-LLM (INT4 AWQ on :8099) — if GPU lease available
 *   2. Triton TensorRT service (:8000) — production GPU fallback
 *   3. Bifrost cache-check (:3040, 500ms deadline) — ε-greedy; cache hits ~5ms (28× speedup)
 *      Bypassed adaptively for high-temp / long-prompt / vision (MeanCache algorithm)
 *   4. TurboQuant llama-server (:8090) — turbo3 KV cache compression (5× VRAM savings)
 *   4b. Bifrost full fallback — Ollama round-trip, only when TurboQuant is also down
 *   5. VLM server (:8085) — Gemma 4 E4B HF Transformers + NF4, text fallback
 *   6. LiteRT-LM (:8070) — CPU sidecar, Gemma 4 E2B with MTP 4-head speculative decode
 *   7. Ollama (gemma4-legal, Q4_K_M + Q8_0 KV) — default local/dev fallback
 *
 * VISION (IMAGE + TEXT) CASCADE:
 *   1. TurboQuant with --mmproj (:8090) — unified VLM at ~80 tok/s, NO VRAM swap needed
 *   2. HF VLM server (:8085) — Gemma 4 E4B Legal fine-tune, NF4 quantization
 *   3. Ollama VLM (gemma4:e4b-it-q4_K_M) — native multimodal API, stock SigLIP tower
 *
 * TurboQuant (ICLR 2026): Training-free KV cache quantization + native multimodal.
 * With --mmproj, handles vision+text at same speed as text-only (~80 tok/s).
 * 8x attention speedup on GPU, 5x VRAM savings. OpenAI-compatible API.
 *
 * Startup with vision:
 *   llama-server -m gemma4-legal.gguf --mmproj siglip.gguf \
 *     -ctk turbo3 -ctv turbo3 --port 8090 -ngl 99 --flash-attn on
 *
 * GPU arbiter ensures TRT-LLM and Ollama don't fight for VRAM.
 * All backends return the same response shape.
 */

import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { logLLMInference } from '$lib/server/observability/inference-log.js';
import { acquireGpuLease, releaseGpuLease, getGpuLeaseStatus } from './gpu-arbiter.js';
import { inferLLM, healthCheck as trtHealthCheck, streamLLM as streamTrtLLM } from '$lib/server/trt-llm.js';
import { inferLLM as inferTritonLLM, healthCheck as tritonHealthCheck, streamLLM as streamTritonLLM } from '$lib/server/triton-llm.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getGpuStats, type GpuMemory } from '$lib/server/gpu/gpu-monitor.js';
import { TURBOQUANT_BASE_URL, LITERT_BASE_URL, VLM_BASE_URL } from '$lib/ai/model-ids.js';
import { isPrefixWarm } from '$lib/server/inference/turbo-prefix-cache.js';
import { execSync, spawn } from 'node:child_process';

/** Minimum free VRAM (MB) required before routing to TensorRT-LLM */
const TRT_MIN_VRAM_MB = 4000;

// ── TurboQuant VRAM Swap ──────────────────────────────────────────────────
// llama-server (~3.4 GB) and Ollama VLM (~5 GB) can't coexist on 8 GB VRAM.
// When VLM is needed, we stop llama-server, run VLM, then restart it.
const TURBOQUANT_EXE = process.env.TURBOQUANT_EXE_PATH ?? 'C:\\Users\\james\\Desktop\\llama-server-cuda\\llama-server.exe';
const TURBOQUANT_GGUF = process.env.TURBOQUANT_MODEL_PATH ?? '';
const TURBOQUANT_MMPROJ =
  process.env.TURBOQUANT_MMPROJ_PATH ??
  'C:\\Users\\james\\Downloads\\gemma4-mmproj\\mmproj-BF16.gguf';
const TURBOQUANT_RESTART_DELAY_MS = 3_000;

/** Find the PID of llama-server listening on :8090 and the GGUF model + mmproj paths */
function findTurboQuantProcess(): { pid: number; modelPath: string; mmprojPath: string } | null {
	try {
    // Find PID on port 8090 via netstat
    const netstat = execSync('netstat -ano | findstr ":8090" | findstr "LISTENING"', {
      encoding: 'utf8',
      timeout: 3_000,
    }).trim();
    const pidMatch = netstat.match(/(\d+)\s*$/m);
    if (!pidMatch) return null;
    const pid = parseInt(pidMatch[1]);
    if (!pid || pid <= 4) return null;

    // Get the command line to extract the GGUF model and mmproj paths for restart
    let modelPath = TURBOQUANT_GGUF;
    let mmprojPath = TURBOQUANT_MMPROJ;
    try {
      const wmic = execSync(`wmic process where processid=${pid} get commandline /format:list`, {
        encoding: 'utf8',
        timeout: 3_000,
      });
      const mMatch =
        wmic.match(/-m\s+"?([^"]+\.(?:gguf|safetensors|bin))"?/i) ?? wmic.match(/-m\s+(\S+)/);
      if (mMatch?.[1]) modelPath = mMatch[1];
      const mmMatch = wmic.match(/--mmproj\s+"?([^"]+\.gguf)"?/i);
      if (mmMatch?.[1]) mmprojPath = mmMatch[1];
    } catch {
      // wmic may fail — use env fallback
    }

    return { pid, modelPath, mmprojPath };
  } catch {
    return null;
  }
}

/** Stop TurboQuant llama-server by PID */
function stopTurboQuant(pid: number): boolean {
	try {
		execSync(`taskkill /PID ${pid} /F`, { timeout: 5_000 });
		console.info(`[vram-swap] Stopped llama-server PID ${pid} to free VRAM for VLM`);
		return true;
	} catch {
		return false;
	}
}

/** Restart TurboQuant llama-server in background (fire-and-forget) */
function restartTurboQuant(modelPath: string, mmprojPath?: string): void {
  if (!modelPath) {
    console.warn('[vram-swap] No GGUF model path — cannot restart TurboQuant');
    return;
  }
  try {
    const args = [
      '-m',
      modelPath,
      '--port',
      '8090',
      '-ngl',
      '99',
      '--flash-attn',
      'on',
      '-ctk',
      'q4_0',
      '-ctv',
      'q4_0',
      '-c',
      '4096',
    ];
    // Include mmproj for unified text+vision on restart
    if (mmprojPath) {
      args.push('--mmproj', mmprojPath);
    }
    const child = spawn(TURBOQUANT_EXE, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    console.info(`[vram-swap] Restarted llama-server → PID ${child.pid}`);
  } catch (err) {
    console.error('[vram-swap] Failed to restart llama-server:', err);
  }
}

export interface InferenceRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  preferTensorrt?: boolean;
  stream?: boolean;
  /** Base64-encoded image for VLM analysis (TurboQuant with --mmproj, HF VLM, or Ollama) */
  imageBase64?: string;
}

export interface InferenceResponse {
	text: string;
	model: string;
	backend: 'tensorrt' | 'triton' | 'turboquant' | 'vlm-hf' | 'litert' | 'bifrost' | 'ollama';
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
	latencyMs: number;
	error?: string;
}

/**
 * Route inference to the best available backend.
 * When images are present: TurboQuant (--mmproj) → HF VLM → Ollama VLM.
 * For text-only: TRT-LLM → Triton → TurboQuant → VLM → Bifrost → LiteRT → Ollama.
 */
export async function routeInference(request: InferenceRequest): Promise<InferenceResponse> {
  const start = performance.now();

  // VLM-first: when image is present, try TurboQuant (unified text+vision) first
  if (request.imageBase64) {
    // Primary: TurboQuant with --mmproj handles vision natively at ~80 tok/s
    const tqVlmResult = await tryTurboQuant(request, start);
    if (tqVlmResult) {
      console.info(
        `[inference-router] backend=turboquant latency=${tqVlmResult.latencyMs}ms (vision, mmproj)`
      );
      logLLMInference({
        model: tqVlmResult.model,
        backend: 'turboquant',
        latencyMs: tqVlmResult.latencyMs,
        tokenCount: tqVlmResult.usage?.total_tokens,
      });
      return tqVlmResult;
    }
    // Fallback: HF VLM server or Ollama native multimodal
    const vlmResult = await tryVlmServer(request, start);
    if (vlmResult) {
      console.info(
        `[inference-router] backend=${vlmResult.backend} latency=${vlmResult.latencyMs}ms (vision)`
      );
      logLLMInference({
        model: vlmResult.model,
        backend: vlmResult.backend as 'vlm-hf' | 'ollama',
        latencyMs: vlmResult.latencyMs,
        tokenCount: vlmResult.usage?.total_tokens,
      });
      return vlmResult;
    }
    return {
      text: '',
      model: 'gemma4-legal-vlm',
      backend: 'vlm-hf',
      latencyMs: Math.round(performance.now() - start),
      error:
        'No VLM backend available — TurboQuant (mmproj), HF server (:8085), and Ollama VLM all failed',
    };
  }

  // Try TensorRT first if preferred and available
  if (request.preferTensorrt !== false) {
    const trtResult = await tryTensorRT(request);
    if (trtResult) {
      trtResult.latencyMs = Math.round(performance.now() - start);
      console.info(`[inference-router] backend=tensorrt latency=${trtResult.latencyMs}ms`);
      logLLMInference({
        model: trtResult.model,
        backend: 'tensorrt',
        latencyMs: trtResult.latencyMs,
        tokenCount: trtResult.usage?.total_tokens,
      });
      return trtResult;
    }
  }

  const tritonResult = await tryTriton(request);
  if (tritonResult) {
    tritonResult.latencyMs = Math.round(performance.now() - start);
    console.info(`[inference-router] backend=triton latency=${tritonResult.latencyMs}ms`);
    logLLMInference({
      model: tritonResult.model,
      backend: 'triton',
      latencyMs: tritonResult.latencyMs,
      tokenCount: tritonResult.usage?.total_tokens,
    });
    return tritonResult;
  }

  // Tier 3: Bifrost semantic cache with ε-greedy variance
  // Cache hits return in <100ms (Qdrant vector lookup). Adaptive bypass probability
  // prevents stale semantic drift: high-temp, long, or vision requests skip cache.
  // 500ms abort deadline: miss → TurboQuant; hit → instant return.
  if (ENV.BIFROST_ENABLED) {
    const bypassProb = computeCacheBypassProb(request);
    if (Math.random() >= bypassProb) {
      const cacheResult = await tryBifrostCacheCheck(request, start);
      if (cacheResult) {
        const isCacheHit = cacheResult.latencyMs < 200;
        console.info(
          `[inference-router] backend=bifrost latency=${cacheResult.latencyMs}ms${isCacheHit ? ' CACHE_HIT' : ''}`
        );
        logLLMInference({
          model: cacheResult.model,
          backend: 'bifrost',
          latencyMs: cacheResult.latencyMs,
          tokenCount: cacheResult.usage?.total_tokens,
          cacheHit: isCacheHit,
        });
        return cacheResult;
      }
      // Cache miss (>500ms timeout) — fall through to TurboQuant
    } else {
      console.debug(
        `[inference-router] bifrost bypassed (ε-exploration p=${bypassProb.toFixed(2)})`
      );
    }
  }

  // Tier 4: TurboQuant llama-server (turbo3 KV cache, same model, better VRAM usage)
  const tqResult = await tryTurboQuant(request, start);
  if (tqResult) {
    console.info(`[inference-router] backend=turboquant latency=${tqResult.latencyMs}ms`);
    logLLMInference({
      model: tqResult.model,
      backend: 'turboquant',
      latencyMs: tqResult.latencyMs,
      tokenCount: tqResult.usage?.total_tokens,
    });
    return tqResult;
  }

  // Tier 4b: Bifrost full fallback (only reached when TurboQuant is also down)
  if (ENV.BIFROST_ENABLED) {
    const bifrostResult = await tryBifrost(request, start);
    if (bifrostResult) {
      console.info(
        `[inference-router] backend=bifrost-fallback latency=${bifrostResult.latencyMs}ms`
      );
      logLLMInference({
        model: bifrostResult.model,
        backend: 'bifrost',
        latencyMs: bifrostResult.latencyMs,
        tokenCount: bifrostResult.usage?.total_tokens,
        cacheHit: bifrostResult.latencyMs < 200,
      });
      return bifrostResult;
    }
  }

  // Tier 5: VLM server (HF Transformers + NF4, text fallback — also handles images)
  const vlmResult = await tryVlmServer(request, start);
  if (vlmResult) {
    console.info(`[inference-router] backend=vlm-hf latency=${vlmResult.latencyMs}ms`);
    logLLMInference({
      model: vlmResult.model,
      backend: 'vlm-hf',
      latencyMs: vlmResult.latencyMs,
      tokenCount: vlmResult.usage?.total_tokens,
    });
    return vlmResult;
  }

  // Tier 6: LiteRT-LM (CPU sidecar, no VRAM needed, Gemma 4 E2B with MTP heads)
  const litertResult = await tryLiteRT(request, start);
  if (litertResult) {
    console.info(`[inference-router] backend=litert latency=${litertResult.latencyMs}ms`);
    logLLMInference({
      model: litertResult.model,
      backend: 'litert',
      latencyMs: litertResult.latencyMs,
      tokenCount: litertResult.usage?.total_tokens,
    });
    return litertResult;
  }

  // Fall back to direct Ollama
  const result = await ollamaInference(request, start);
  console.info(
    `[inference-router] backend=ollama latency=${result.latencyMs}ms${result.error ? ` error=${result.error}` : ''}`
  );
  logLLMInference({
    model: result.model,
    backend: 'ollama',
    latencyMs: result.latencyMs,
    tokenCount: result.usage?.total_tokens,
    error: result.error,
  });
  return result;
}

async function tryTensorRT(request: InferenceRequest): Promise<InferenceResponse | null> {
	const trtAvailable = await trtHealthCheck();
	if (!trtAvailable) return null;

	const lease = await getGpuLeaseStatus();
	if (lease && lease.backend !== 'tensorrt') return null; // another backend holds lease

	// P6: Check actual VRAM before acquiring lease — prevents OOM when Ollama models loaded
	if (!lease) {
		const gpu = await getGpuStats().catch(() => null);
		if (gpu?.available && gpu.memory.freeMB < TRT_MIN_VRAM_MB) {
			console.info(
				`[inference-router] Skipping TRT — insufficient VRAM: ${gpu.memory.freeMB}MB free, need ${TRT_MIN_VRAM_MB}MB`
			);
			return null;
		}
	}

	const acquired = await acquireGpuLease('tensorrt', 120);
	if (!acquired) return null;

	try {
		const result = await inferLLM({
			prompt: request.systemPrompt
				? `${request.systemPrompt}\n\n${request.prompt}`
				: request.prompt,
			maxTokens: request.maxTokens ?? 2048,
			temperature: request.temperature ?? 0.7
		});

		if (result.error) {
			return null; // fall through to Ollama
		}

		return {
			text: result.text,
			model: 'gemma4-legal-trt',
			backend: 'tensorrt',
			usage: result.usage,
			latencyMs: 0
		};
	} catch {
		return null;
	} finally {
		await releaseGpuLease('tensorrt').catch(() => {});
	}
}

async function tryTriton(request: InferenceRequest): Promise<InferenceResponse | null> {
	const tritonAvailable = await tritonHealthCheck();
	if (!tritonAvailable) return null;

	try {
		const result = await inferTritonLLM({
			prompt: request.systemPrompt
				? `${request.systemPrompt}\n\n${request.prompt}`
				: request.prompt,
			maxTokens: request.maxTokens ?? 2048,
			temperature: request.temperature ?? 0.7
		});

		if (result.error || !result.text) {
			return null;
		}

		return {
			text: result.text,
			model: ENV.TRITON_LLM_MODEL ?? 'legal-llm',
			backend: 'triton',
			latencyMs: 0
		};
	} catch {
		return null;
	}
}

/**
 * Try TurboQuant llama-server (turboquant_plus fork of llama.cpp).
 * OpenAI-compatible API on :8090. Same GGUF model but with turbo3 KV cache
 * compression — 5x VRAM savings, 8x attention kernel speedup on CUDA.
 */
async function tryTurboQuant(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
  try {
    // Health check: GET /health returns 200 when server is ready
    const healthRes = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!healthRes.ok) return null;
  } catch {
    return null; // TurboQuant server not running
  }

  type ChatContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  const messages: Array<{ role: string; content: ChatContent }> = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });

  // Build user message — include image as OpenAI-compatible content parts when present
  if (request.imageBase64) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${request.imageBase64}` } },
        { type: 'text', text: request.prompt },
      ],
    });
  } else {
    messages.push({ role: 'user', content: request.prompt });
  }

  try {
    // Check if the system prompt is already warm in the GPU KV slot.
    // Logged for observability — warm hits skip ~2K token re-processing.
    const prefixAlreadyWarm = request.systemPrompt
      ? await isPrefixWarm(request.systemPrompt).catch(() => false)
      : false;
    if (prefixAlreadyWarm) {
      console.debug('[turbo] KV prefix cache HIT — reusing GPU slot');
    }

    // OpenAI-compatible /v1/chat/completions — llama-server b8757+
    // When model uses thinking mode, content may be empty and reasoning in reasoning_content
    // With --mmproj, also handles vision via image_url content parts
    // cache_prompt=true: tells llama-server to keep this prompt's KV state in its slot
    // for reuse on subsequent requests with the same system prompt prefix.
    const res = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
        stream: false,
        cache_prompt: true,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const content = msg?.content ?? '';
    const reasoning = msg?.reasoning_content ?? '';
    // Prefer content (the actual answer); fall back to reasoning if model spent all tokens thinking
    const text = content || reasoning;
    if (!text) return null;

    return {
      text,
      model: 'gemma4-legal-turbo3',
      backend: 'turboquant',
      usage: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: data.usage.completion_tokens ?? 0,
            total_tokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch {
    return null;
  }
}

/**
 * Compute ε-greedy bypass probability for Bifrost semantic cache.
 *
 * Based on MeanCache (arXiv:2403.02694): deterministic semantic caching
 * degrades over time due to semantic drift. Periodic exploration (ε=10%)
 * injects fresh responses and keeps cache quality healthy.
 *
 * Factors that raise bypass probability (prefer fresh over cached):
 *  - High temperature (>0.6): stochastic requests → cached answer may diverge
 *  - Long prompts (>600 chars): unique context → low semantic hit-rate
 *  - Vision input: image bytes are non-cacheable by embedding alone
 */
function computeCacheBypassProb(request: InferenceRequest): number {
  if (request.imageBase64) return 1.0; // vision: image content can't be semantically hashed

  const temp = request.temperature ?? 0.7;
  if (temp >= 0.95) return 1.0; // near-max temperature = essentially stochastic output

  const promptLen = request.prompt.length;
  if (promptLen > 2000) return 1.0; // very long prompts are unique; hit rate is negligible

  // Base ε = 10% exploration (prevents semantic drift accumulating in cache)
  let p = 0.10;
  // Temperature ramp: [0.6 → 0.95] contributes up to +0.25
  if (temp > 0.6) p += 0.25 * ((temp - 0.6) / 0.35);
  // Prompt length ramp: [600 → 2000 chars] contributes up to +0.15
  if (promptLen > 600) p += 0.15 * ((promptLen - 600) / 1400);

  return Math.min(p, 1.0);
}

/**
 * Fast cache-only Bifrost probe with 500ms hard deadline.
 *
 * Bifrost semantic cache hits return in <100ms (Qdrant vector lookup → stored response).
 * Cache misses trigger a full Ollama round-trip (30-120s for Gemma 4 thinking mode).
 * Aborting at 500ms means: hit → instant win; miss → hand off to TurboQuant.
 *
 * Cache key namespacing: uses a 6-char hash of the system prompt to partition the cache
 * by legal context (contract-law session won't collide with criminal-law session).
 * Falls back to 'legal-ai-global' when no system prompt is present.
 */

/** Cheap FNV-1a 32-bit hash → 6-char hex string for short cache key suffixes. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) | 0) >>> 0;
  }
  return h.toString(16).slice(0, 6);
}

/**
 * Normalize the user prompt before embedding to improve semantic cache hit rate.
 *
 * Strips filler preambles that hurt embedding similarity ("Can you please explain…"
 * and "I would like to know…" both reduce to the same semantic core). Normalizes
 * legal citation formats so variant spellings hit the same cache entry.
 */
function normalizePromptForCache(prompt: string): string {
  return prompt
    // Strip common filler preambles (case-insensitive)
    .replace(/^(can you (please )?|could you (please )?|i (want|need|would like) (you )?to |please )/i, '')
    .replace(/^(help me (understand|with|explain)|tell me (about|how|what|why) )/i, '')
    // Normalize legal citation variants: § 1234, sec. 1234, section 1234 → §1234
    .replace(/\bsec(?:tion|\.)?\s*(\d+)/gi, '§$1')
    .replace(/§\s+(\d)/g, '§$1')
    // Normalize quotation marks
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

async function tryBifrostCacheCheck(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
  const CACHE_HIT_TIMEOUT_MS = 500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CACHE_HIT_TIMEOUT_MS);

  const model = 'gemma4-legal';
  // Normalize prompt to increase semantic cache hit rate
  const normalizedPrompt = normalizePromptForCache(request.prompt);
  const messages: Array<{ role: string; content: string }> = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  messages.push({ role: 'user', content: normalizedPrompt });

  // Namespace cache key by system-prompt hash to avoid cross-context collisions.
  // Different legal contexts (contract vs. criminal) stay in separate cache partitions.
  const cacheKey = request.systemPrompt
    ? `legal-ai-${shortHash(request.systemPrompt)}`
    : 'legal-ai-global';

  try {
    const res = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Required: caching only activates when x-bf-cache-key is present.
        // 500ms timeout means: if Bifrost doesn't return within that window, it is
        // waiting on Ollama inference (cache miss) — abort and let TurboQuant handle it.
        'x-bf-cache-key': cacheKey,
      },
      body: JSON.stringify({
        model: `ollama-local/${model}`,
        messages,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      extra_fields?: { cache_debug?: { cache_hit?: boolean; hit_type?: string; similarity?: number; threshold?: number } };
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content) return null;

    const debug = data.extra_fields?.cache_debug;
    const isCacheHit = debug?.cache_hit ?? false;
    if (!isCacheHit) {
      // Got a response but Bifrost says it wasn't a cache hit — could be direct inference
      // on a <500ms model (e.g. gemma3:270m coldstart). Accept it anyway.
      console.debug('[inference-router] bifrost responded <500ms but cache_hit=false (fast inference?)');
    } else {
      console.debug(`[inference-router] bifrost CACHE HIT type=${debug?.hit_type} similarity=${debug?.similarity?.toFixed(3)} threshold=${debug?.threshold}`);
    }

    return {
      text: content,
      model: 'gemma4-legal-bifrost-cache',
      backend: 'bifrost',
      latencyMs: Math.round(performance.now() - startTime),
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.debug('[inference-router] bifrost cache miss (>500ms), routing to TurboQuant');
    }
    return null;
  }
}

async function tryBifrost(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	const model = 'gemma4-legal';
	const messages: Array<{ role: string; content: string }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
	messages.push({ role: 'user', content: request.prompt });

	try {
		const text = await traceLLM('inference-router-bifrost', { model, prompt: request.prompt.slice(0, 500) }, async (gen) => {
			const content = await bifrostChat(messages, model, {
				temperature: request.temperature,
				maxTokens: request.maxTokens,
				timeoutMs: 120_000
			});
			gen.end({ output: content.slice(0, 1000) });
			return content;
		});

		return {
			text,
			model: 'gemma4-legal-bifrost',
			backend: 'bifrost',
			latencyMs: Math.round(performance.now() - startTime)
		};
	} catch {
		return null; // fall through to direct Ollama
	}
}

/**
 * Try VLM inference for vision+text requests.
 *
 * Cascade:
 *   1. HF Transformers server (:8085) — legal fine-tuned NF4, if running
 *   2. Ollama native multimodal — gemma4:e4b-it-q4_K_M with /api/chat images field
 *      (Stock E4B has identical SigLIP vision tower — frozen during GRPO training)
 *
 * For text-only requests that reach this function, only try HF server (Ollama
 * text-only is handled by the main cascade's ollamaInference fallback).
 */
async function tryVlmServer(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	// ── Attempt 1: HF Transformers VLM server on :8085 ──
	const hfResult = await tryHfVlmServer(request, startTime);
	if (hfResult) return hfResult;

	// ── Attempt 2: Ollama native multimodal (only for image requests) ──
	if (request.imageBase64) {
		return tryOllamaVlm(request, startTime);
	}

	return null;
}

async function tryHfVlmServer(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	try {
		const healthRes = await fetch(`${VLM_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		if (!healthRes.ok) return null;
	} catch {
		return null;
	}

	const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });

	if (request.imageBase64) {
		messages.push({
			role: 'user',
			content: [
				{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${request.imageBase64}` } },
				{ type: 'text', text: request.prompt },
			],
		});
	} else {
		messages.push({ role: 'user', content: request.prompt });
	}

	try {
		const res = await fetch(`${VLM_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal-vlm',
				messages,
				max_tokens: request.maxTokens ?? 512,
				temperature: request.temperature ?? 0.3,
				stream: false,
			}),
			signal: AbortSignal.timeout(120_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const text = data.choices?.[0]?.message?.content ?? '';
		if (!text) return null;

		return {
			text,
			model: 'gemma4-legal-vlm',
			backend: 'vlm-hf',
			usage: data.usage ? {
				prompt_tokens: data.usage.prompt_tokens ?? 0,
				completion_tokens: data.usage.completion_tokens ?? 0,
				total_tokens: data.usage.total_tokens ?? 0,
			} : undefined,
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

/**
 * Ollama native VLM fallback — uses gemma4:e4b-it-q4_K_M with /api/chat images field.
 * Same SigLIP vision tower as the legal fine-tune (frozen during GRPO training).
 *
 * VRAM swap: If the first attempt fails (likely VRAM full from llama-server),
 * stops TurboQuant llama-server, retries VLM, then restarts llama-server.
 *
 * NOTE: With TurboQuant --mmproj, this path is rarely needed. It's a fallback for
 * when TurboQuant is running WITHOUT --mmproj or is down entirely.
 */
async function tryOllamaVlm(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	// First attempt — works when VRAM is available (llama-server not running)
	const result = await _ollamaVlmCall(request, startTime);
	if (result) return result;

	// VRAM swap: stop TurboQuant, free ~3.4 GB, retry VLM, then restart
	const tqProcess = findTurboQuantProcess();
	if (!tqProcess) return null; // No TurboQuant to swap — genuinely unavailable

	console.info(`[vram-swap] Ollama VLM failed — swapping out TurboQuant (PID ${tqProcess.pid}) for VRAM`);
	const stopped = stopTurboQuant(tqProcess.pid);
	if (!stopped) return null;

	// Wait for VRAM to actually free up
	await new Promise(r => setTimeout(r, TURBOQUANT_RESTART_DELAY_MS));

	try {
		const retryResult = await _ollamaVlmCall(request, startTime);
		return retryResult;
	} finally {
		// Always restart TurboQuant after VLM (whether success or failure)
		// Delay slightly so Ollama VLM model can unload first
		setTimeout(() => {
			// Unload VLM model from Ollama to free VRAM for llama-server
			ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'gemma4:e4b-it-q4_K_M', prompt: '', keep_alive: 0 }),
				signal: AbortSignal.timeout(5_000),
			}).catch(() => {}).finally(() => {
				setTimeout(() => restartTurboQuant(tqProcess.modelPath, tqProcess.mmprojPath), 2_000);
			});
		}, 1_000);
	}
}

/** Raw Ollama VLM call — no VRAM swap logic */
async function _ollamaVlmCall(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	const model = 'gemma4:e4b-it-q4_K_M';
	const messages: Array<{ role: string; content: string; images?: string[] }> = [];

	if (request.systemPrompt) {
		messages.push({ role: 'system', content: request.systemPrompt });
	}
	messages.push({
		role: 'user',
		content: request.prompt,
		images: request.imageBase64 ? [request.imageBase64] : undefined,
	});

	try {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				stream: false,
				keep_alive: '24h',
				options: {
					num_predict: request.maxTokens ?? 512,
					temperature: request.temperature ?? 0.3,
				},
			}),
			signal: AbortSignal.timeout(120_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const text = data.message?.content ?? '';
		if (!text) return null;

		return {
			text,
			model,
			backend: 'ollama',
			usage: {
				prompt_tokens: data.prompt_eval_count ?? 0,
				completion_tokens: data.eval_count ?? 0,
				total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
			},
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

/**
 * Try LiteRT-LM sidecar (CPU, Gemma 4 E2B, MTP 4-head speculative decode).
 * OpenAI-compatible on :8070. No VRAM needed — runs on XNNPACK CPU backend.
 */
async function tryLiteRT(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	try {
		const healthRes = await fetch(`${LITERT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		if (!healthRes.ok) return null;
	} catch {
		return null; // LiteRT server not running
	}

	const messages: Array<{ role: string; content: string }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
	messages.push({ role: 'user', content: request.prompt });

	try {
		const res = await fetch(`${LITERT_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'litert-lm',
				messages,
				max_tokens: request.maxTokens ?? 2048,
				temperature: request.temperature ?? 0.3,
				stream: false,
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const text = data.choices?.[0]?.message?.content ?? '';
		if (!text) return null;

		return {
			text,
			model: 'gemma4-e2b-litert',
			backend: 'litert',
			usage: data.usage ? {
				prompt_tokens: data.usage.prompt_tokens ?? 0,
				completion_tokens: data.usage.completion_tokens ?? 0,
				total_tokens: data.usage.total_tokens ?? 0,
			} : undefined,
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

async function ollamaInference(request: InferenceRequest, startTime: number): Promise<InferenceResponse> {
	const model = 'gemma4-legal:latest';
	const prompt = request.systemPrompt
		? `${request.systemPrompt}\n\n${request.prompt}`
		: request.prompt;

	try {
		return await traceLLM('inference-router-ollama', { model, prompt: prompt.slice(0, 500) }, async (gen) => {
			const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model,
					prompt,
					stream: false,
					options: {
						num_predict: request.maxTokens ?? 2048,
						temperature: request.temperature ?? 0.7
					}
				}),
				signal: AbortSignal.timeout(120_000)
			});

			if (!res.ok) {
				gen.end({ output: `error:${res.status}`, level: 'WARNING' });
				return {
					text: '',
					model,
					backend: 'ollama' as const,
					latencyMs: Math.round(performance.now() - startTime),
					error: `Ollama error: ${res.status}`
				};
			}

			const data = await res.json();
			gen.end({ output: (data.response ?? '').slice(0, 1000), usage: { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count } });
			return {
				text: data.response ?? '',
				model,
				backend: 'ollama' as const,
				usage: {
					prompt_tokens: data.prompt_eval_count ?? 0,
					completion_tokens: data.eval_count ?? 0,
					total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
				},
				latencyMs: Math.round(performance.now() - startTime)
			};
		});
	} catch (err) {
		return {
			text: '',
			model,
			backend: 'ollama',
			latencyMs: Math.round(performance.now() - startTime),
			error: err instanceof Error ? err.message : 'Ollama inference failed'
		};
	}
}

export interface StreamingInferenceRequest {
	prompt: string;
	systemPrompt?: string;
	messages?: Array<{ role: string; content: string }>;
	maxTokens?: number;
	temperature?: number;
	model?: string;
}

export interface StreamChunk {
	content: string;
	done: boolean;
	backend?: 'tensorrt' | 'triton' | 'turboquant' | 'vlm-hf' | 'litert' | 'ollama';
}

/**
 * Streaming inference cascade: TRT-LLM → Triton → TurboQuant → Ollama.
 * Returns an async generator of text chunks.
 * Use for SSE endpoints, streaming chat, etc.
 */
export async function* routeStreamingInference(
	request: StreamingInferenceRequest
): AsyncGenerator<StreamChunk> {
	const flatPrompt = request.systemPrompt
		? `${request.systemPrompt}\n\n${request.prompt}`
		: request.prompt;

	// Tier 1: TRT-LLM
	try {
		let trtOk = await trtHealthCheck().catch(() => false);
		if (trtOk) {
			// P6: VRAM gate — skip TRT if GPU memory too low
			const existingLease = await getGpuLeaseStatus().catch(() => null);
			if (!existingLease) {
				const gpu = await getGpuStats().catch(() => null);
				if (gpu?.available && gpu.memory.freeMB < TRT_MIN_VRAM_MB) {
					console.info(`[inference-router/stream] Skipping TRT — ${gpu.memory.freeMB}MB free < ${TRT_MIN_VRAM_MB}MB required`);
					trtOk = false;
				}
			}
		}
		if (trtOk) {
			const lease = await acquireGpuLease('tensorrt', 120).catch(() => null);
			if (lease) {
				try {
					for await (const chunk of streamTrtLLM({ prompt: flatPrompt, maxTokens: request.maxTokens, temperature: request.temperature })) {
						yield { ...chunk, backend: 'tensorrt' };
					}
					return;
				} catch {
					// Fall through
				} finally {
					releaseGpuLease('tensorrt').catch(() => {});
				}
			}
		}
	} catch {
		// TRT-LLM unavailable
	}

	// Tier 2: Triton
	try {
		const tritonOk = await tritonHealthCheck().catch(() => false);
		if (tritonOk) {
			for await (const chunk of streamTritonLLM({ prompt: flatPrompt, maxTokens: request.maxTokens, temperature: request.temperature })) {
				yield { ...chunk, backend: 'triton' };
			}
			return;
		}
	} catch {
		// Triton unavailable
	}

	// Tier 3: TurboQuant llama-server (streaming via OpenAI-compatible SSE)
	try {
		const tqHealthRes = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		}).catch(() => null);
		if (tqHealthRes?.ok) {
			const tqMessages: Array<{ role: string; content: string }> = request.messages ?? [];
			if (!tqMessages.length) {
				if (request.systemPrompt) tqMessages.push({ role: 'system', content: request.systemPrompt });
				tqMessages.push({ role: 'user', content: request.prompt });
			}
			const tqRes = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: tqMessages,
					max_tokens: request.maxTokens ?? 2048,
					temperature: request.temperature ?? 0.7,
					stream: true,
				}),
				signal: AbortSignal.timeout(120_000),
			});
			if (tqRes.ok && tqRes.body) {
				const reader = tqRes.body.getReader();
				const decoder = new TextDecoder();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const text = decoder.decode(value, { stream: true });
					for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
						const payload = line.slice(6).trim();
						if (payload === '[DONE]') break;
						try {
							const parsed = JSON.parse(payload);
							const delta = parsed.choices?.[0]?.delta;
							// llama-server b8757: streaming thinking in delta.reasoning_content, answer in delta.content
							const chunk = delta?.content ?? delta?.reasoning_content ?? '';
							if (chunk) yield { content: chunk, done: false, backend: 'turboquant' };
						} catch {
							// skip malformed SSE
						}
					}
				}
				yield { content: '', done: true, backend: 'turboquant' };
				return;
			}
		}
	} catch {
		// TurboQuant unavailable
	}

	// Tier 4: LiteRT-LM (CPU sidecar, fake-streaming — sends full response as SSE)
	try {
		const litertHealth = await fetch(`${LITERT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		}).catch(() => null);
		if (litertHealth?.ok) {
			const messages: Array<{ role: string; content: string }> = request.messages ?? [];
			if (!messages.length) {
				if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
				messages.push({ role: 'user', content: request.prompt });
			}
			const litertRes = await fetch(`${LITERT_BASE_URL}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'litert-lm',
					messages,
					max_tokens: request.maxTokens ?? 2048,
					temperature: request.temperature ?? 0.3,
					stream: false,
				}),
				signal: AbortSignal.timeout(60_000),
			});
			if (litertRes.ok) {
				const data = await litertRes.json();
				const text = data.choices?.[0]?.message?.content ?? '';
				if (text) {
					yield { content: text, done: false, backend: 'litert' };
					yield { content: '', done: true, backend: 'litert' };
					return;
				}
			}
		}
	} catch {
		// LiteRT unavailable
	}

	// Tier 5: Ollama (uses /api/chat if messages provided, /api/generate otherwise)
	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	const model = request.model ?? 'gemma4-legal:latest';

	const [endpoint, body] = request.messages
		? [`${ollamaUrl}/api/chat`, { model, messages: request.messages, stream: true, keep_alive: '24h' }]
		: [`${ollamaUrl}/api/generate`, { model, prompt: flatPrompt, stream: true, options: { num_predict: request.maxTokens ?? 2048, temperature: request.temperature ?? 0.7 } }];

	const res = await ollamaFetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(120_000),
	});

	if (!res.ok || !res.body) {
		yield { content: '', done: true, backend: 'ollama' };
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const text = decoder.decode(value, { stream: true });
		for (const line of text.split('\n').filter(Boolean)) {
			try {
				const parsed = JSON.parse(line);
				const chunk = parsed.message?.content ?? parsed.response ?? '';
				if (chunk) yield { content: chunk, done: false, backend: 'ollama' };
			} catch {
				// skip malformed
			}
		}
	}

	yield { content: '', done: true, backend: 'ollama' };
}

/**
 * Get current inference router status.
 */
export async function getRouterStatus() {
	const [trtOk, tritonOk, tqProps, vlmOk, litertOk, ollamaVlmOk, lease, gpuStats] =
    await Promise.all([
      trtHealthCheck(),
      tritonHealthCheck(),
      // Check TurboQuant health AND vision capability (mmproj loaded → modalities.vision: true)
      fetch(`${TURBOQUANT_BASE_URL}/props`, { signal: AbortSignal.timeout(1_500) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => ({ available: true, vision: d?.modalities?.vision === true }))
        .catch(() => ({ available: false, vision: false })),
      fetch(`${VLM_BASE_URL}/health`, { signal: AbortSignal.timeout(1_000) })
        .then((r) => r.ok)
        .catch(() => false),
      fetch(`${LITERT_BASE_URL}/health`, { signal: AbortSignal.timeout(1_000) })
        .then((r) => r.ok)
        .catch(() => false),
      // Check if Ollama has the VLM model available (list models, check for e4b)
      ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2_000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.models?.some((m: { name: string }) => m.name.includes('e4b-it')) ?? false)
        .catch(() => false),
      getGpuLeaseStatus().catch(() => null),
      getGpuStats().catch(() => null),
    ]);

	const tqOk = tqProps.available;
  const tqVision = tqProps.vision;
	const vram: GpuMemory | null = gpuStats?.available ? gpuStats.memory : null;
	const vramSufficient = !vram || vram.freeMB >= TRT_MIN_VRAM_MB;
	const trtReady = trtOk && !lease && vramSufficient;
	const visionAvailable = tqVision || vlmOk || ollamaVlmOk;

	return {
    tensorrt: { available: trtOk, url: ENV.TENSORRT_URL, vramSufficient },
    triton: { available: tritonOk, url: ENV.TRITON_URL, model: ENV.TRITON_LLM_MODEL },
    turboquant: {
      available: tqOk,
      url: TURBOQUANT_BASE_URL,
      kvCache: 'turbo3',
      visionCapable: tqVision,
    },
    vlm: {
      available: vlmOk,
      url: VLM_BASE_URL,
      model: 'gemma4-legal-vlm',
      backend: 'hf-nf4',
      visionCapable: true,
    },
    ollamaVlm: { available: ollamaVlmOk, model: 'gemma4:e4b-it-q4_K_M', visionCapable: true },
    bifrost: { enabled: ENV.BIFROST_ENABLED, url: ENV.BIFROST_URL },
    litert: { available: litertOk, url: LITERT_BASE_URL, model: 'gemma-4-E2B-it', backend: 'cpu' },
    ollama: { url: ENV.OLLAMA_BASE_URL },
    gpu: {
      leaseHolder: lease?.backend ?? null,
      leaseFree: !lease,
      vram,
      temperature: gpuStats?.temperatureCelsius ?? null,
      utilization: gpuStats?.utilizationPercent ?? null,
    },
    visionAvailable,
    preferredBackend: trtReady
      ? 'tensorrt'
      : tritonOk
        ? 'triton'
        : tqOk
          ? 'turboquant'
          : vlmOk
            ? 'vlm-hf'
            : ENV.BIFROST_ENABLED
              ? 'bifrost'
              : litertOk
                ? 'litert'
                : 'ollama',
  };
}
