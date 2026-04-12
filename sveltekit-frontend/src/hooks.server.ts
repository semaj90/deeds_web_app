/**
 * SvelteKit Server Hooks
 * Handles request/response processing and middleware
 *
 * Sprint 1 Critical Fixes:
 * - Graceful shutdown: DB pool + hard 10s deadline
 * - Request-level timeout: 30s default, 120s AI, streaming excluded
 * - VAPID key validation at startup
 * - CORS: credentials, expose-headers, PATCH method
 * - Slow request logging (>10s warning)
 */

import { building, dev } from '$app/environment';
import { deleteSessionCookie, setSessionCookie, validateSession } from '$lib/server/lucia';
import { startWorker } from '$lib/server/analysis/worker.js';
import { productionLogger } from '$lib/server/production-logger.js';
import { startRabbitMQPipeline } from '$lib/server/queue/rabbitmq-xstate-integration.js';
import { startAudioQueueConsumer } from '$lib/server/workers/audio-queue-consumer.js';
import { startDocumentEmbedConsumer } from '$lib/server/workers/document-embed-consumer.js';
import { initializeQdrant } from '$lib/server/startup/qdrant-init.js';
import { warmupTemplateCache } from '$lib/server/cache/report-template-cache.js';
import { startIdleScanner } from '$lib/server/engagement/idle-reengagement.js';
import { pool } from '$lib/server/db/client';
import { cacheExport } from '$lib/server/cache/pdf-export-cache.js';
import { storeCachedResponse } from '$lib/server/ai/llm-cache.js';
import { ENV } from '$lib/server/env.server.js';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getChatModelKeepAlive, ollamaFetch } from '$lib/server/ollama.js';
import { createDefaultRegistry } from '$lib/server/queue/queue-worker.js';
import { auditBuffer } from '$lib/server/audit/api-audit-buffer';

// ── Request Timeout Constants ────────────────────────────────────────────
const DEFAULT_REQUEST_TIMEOUT = 30_000; // 30s for normal routes
const AI_REQUEST_TIMEOUT = 300_000; // 300s for AI/inference routes (LLM can take 2-3min)

// ── Request Body Size Limits (Sprint 4) ──────────────────────────────────
const MAX_BODY_SIZE = 50 * 1024 * 1024; // 50MB default
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB for file uploads
const UPLOAD_PATHS = ['/api/evidence/upload', '/api/vision/analyze', '/api/persons-of-interest'];
const shouldRunBootTasks = !building && process.env.NODE_ENV !== 'test';

// In cluster mode, only worker 1 runs singleton boot tasks (RabbitMQ, Qdrant, warmup)
// Audit buffer + rate limiting run on ALL workers independently
const isClusterWorker1 = !process.env.CLUSTER_WORKER_ID || process.env.CLUSTER_WORKER_ID === '1';
const shouldRunSingletonTasks = shouldRunBootTasks && isClusterWorker1;

// ── Per-Route Rate Limiting (Sprint 4 → upgraded Sprint 5) ───────────────
// In-memory sliding window — per route tier + IP
// Entries: Map<"tier:ip", { count, resetTime }>
const RATE_LIMIT_MAX_ENTRIES = 50_000;
const rateLimits = new Map<string, { count: number; resetTime: number }>();

/** Route-specific rate limit tiers — matched in order, first match wins */
const RATE_TIERS: Array<{ prefix: string; window: number; max: number; methods?: string[] }> = [
  // Auth brute-force protection
  { prefix: '/api/auth/login', window: 300_000, max: 10 },
  { prefix: '/api/auth/register', window: 300_000, max: 5 },
  { prefix: '/api/auth/reset-password', window: 300_000, max: 5 },
  // GPU-bound inference (limited VRAM)
  { prefix: '/api/ai/tensorrt', window: 60_000, max: 10 },
  { prefix: '/api/gpu/', window: 60_000, max: 15 },
  // AI/LLM routes (Ollama inference, moderate)
  { prefix: '/api/ai/', window: 60_000, max: 30 },
  { prefix: '/api/rag/', window: 60_000, max: 30 },
  { prefix: '/api/synthesis/', window: 60_000, max: 20 },
  { prefix: '/api/agents/', window: 60_000, max: 20 },
  { prefix: '/api/contextual/', window: 60_000, max: 30 },
  // Chat routes
  { prefix: '/api/chat/', window: 60_000, max: 40 },
  { prefix: '/api/sse/', window: 60_000, max: 40 },
  // Write-heavy mutation routes (default write limiter)
  { prefix: '/api/', window: 60_000, max: 60, methods: ['POST', 'PUT', 'PATCH', 'DELETE'] },
  // Global GET read limiter (DoS protection)
  { prefix: '/api/', window: 60_000, max: 200, methods: ['GET'] },
];

function getRateTier(path: string, method: string) {
  for (const tier of RATE_TIERS) {
    if (path.startsWith(tier.prefix)) {
      if (!tier.methods || tier.methods.includes(method)) return tier;
    }
  }
  return null;
}

if (shouldRunBootTasks) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimits) {
      if (now > entry.resetTime) rateLimits.delete(key);
    }
  }, 60_000);
}

// ── Production Secret Guard ─────────────────────────────────────────────
// Crash early if deploying with dev-only secrets
if (shouldRunBootTasks && !dev) {
  const JWT = ENV.JWT_SECRET;
  const SVC = ENV.SERVICE_AUTH_TOKEN;
  if (JWT === 'dev-only-jwt-secret-change-in-production' || SVC === 'dev-only-service-token') {
    throw new Error(
      'FATAL: Production deployment detected with dev-only secrets. ' +
        'Set JWT_SECRET and SERVICE_AUTH_TOKEN environment variables before deploying.'
    );
  }
}

if (shouldRunBootTasks) {
  // ── Per-worker tasks (run on ALL workers in cluster mode) ──
  // Start the analysis worker on server boot (idempotent)
  startWorker();

  // Start API audit buffer (batched writes to api_audit_log every 5s)
  auditBuffer.start();
}

if (shouldRunSingletonTasks) {
  // ── Singleton tasks (only worker 1 in cluster mode) ──
  // Start RabbitMQ 7-queue pipeline (XState v5 with auto-reconnect, non-blocking)
  startRabbitMQPipeline()
    .then(() => {
      console.log('[Boot] RabbitMQ consumers active');
      // Start additional consumers after RabbitMQ is fully initialized
      startDocumentEmbedConsumer()
        .then(() => console.log('[Boot] Document embed consumer active'))
        .catch((err) =>
          console.warn('[Boot] Document embed consumer failed (non-fatal):', (err as Error).message)
        );
    })
    .catch((err) => {
      console.warn('[Boot] RabbitMQ unavailable (non-fatal):', (err as Error).message);
    });

  // Start audio processing queue consumer (audio.process → Whisper + ACE + Qdrant)
  startAudioQueueConsumer()
    .then(() => {
      console.log('[Boot] Audio queue consumer active');
    })
    .catch((err) => {
      console.warn('[Boot] Audio queue consumer failed (non-fatal):', (err as Error).message);
    });

  // Initialize Qdrant collections (Priority #2: auto-create missing collections)
  initializeQdrant()
    .then(() => {
      console.log('[Boot] Qdrant collections verified');
    })
    .catch((err) => {
      console.warn('[Boot] Qdrant initialization failed (non-fatal):', (err as Error).message);
    });

  // Warm up template cache (Priority #10: pre-load all 10 templates on startup)
  warmupTemplateCache()
    .then(() => console.log('[Boot] Template cache: warmed'))
    .catch((err) => console.warn('[Boot] Template cache: failed:', (err as Error).message));

  // Idle re-engagement scanner (5-min interval, checks user activity → notifications)
  startIdleScanner();

  // Start typed queue-worker consumers (entity extraction, embedding, analytics, etc.)
  createDefaultRegistry()
    .startAll()
    .then((stats) => {
      console.log(`[Boot] Queue workers: ${stats.started}/${stats.started + stats.failed} started`);
      if (stats.errors.length > 0) {
        console.warn('[Boot] Queue worker errors:', stats.errors.join(', '));
      }
    })
    .catch((err) => {
      console.warn('[Boot] Queue workers failed (non-fatal):', (err as Error).message);
    });

  // Option #6: Warm up export cache (pre-generate top 5 recent report exports)
  warmupExportCache()
    .then((s) =>
      console.log(
        `[Boot] Export cache: ${s.status}${s.cached ? ` (${s.cached} exports)` : ''}${s.reason ? ` — ${s.reason}` : ''}`
      )
    )
    .catch((err) => console.warn('[Boot] Export cache: failed:', (err as Error).message));

  // Option #6: Warm up LLM cache (pre-cache 5 common legal queries)
  warmupLLMCache()
    .then((s) =>
      console.log(
        `[Boot] LLM cache: ${s.status}${s.cached ? ` (${s.cached}/${s.total})` : ''}${s.reason ? ` — ${s.reason}` : ''}`
      )
    )
    .catch((err) => console.warn('[Boot] LLM cache: failed:', (err as Error).message));

  // Warm the primary chat model so the first contextual request avoids cold-load penalty.
  warmupChatModel()
    .then((s) =>
      console.log(`[Boot] Chat model warmup: ${s.status}${s.reason ? ` — ${s.reason}` : ''}`)
    )
    .catch((err) => console.warn('[Boot] Chat model warmup: failed:', (err as Error).message));

  // Pre-populate codebase Fuse.js index (avoids cold-start on first search)
  import('$lib/server/retrieval/codebase-context.js')
    .then(({ refreshMetadataCache }) => refreshMetadataCache())
    .then(() => console.log('[Boot] Codebase Fuse index: warmed'))
    .catch((err) => console.warn('[Boot] Codebase Fuse index: failed:', (err as Error).message));

  // Pre-populate GPU result cache for top 5 recently active cases (avoid cold GPU pass on first query)
  import('$lib/server/gpu/background-analyzer.js')
    .then(({ warmupGpuCache }) => warmupGpuCache(5))
    .then((s) =>
      console.log(`[Boot] GPU cache warmup: ${s.warmed} warmed, ${s.skipped} cached, ${s.errors} errors`)
    )
    .catch((err) => console.warn('[Boot] GPU cache warmup: failed:', (err as Error).message));

  // CouchDB TTL cleanup: purge inference_log docs >7 days, dag_cache expired docs (6hr interval)
  import('$lib/server/observability/inference-log.js')
    .then(({ startInferenceLogCleanup }) => {
      startInferenceLogCleanup();
      console.log('[Boot] CouchDB inference_log cleanup: scheduled (7-day retention, 6hr interval)');
    })
    .catch((err) => console.warn('[Boot] Inference log cleanup: failed:', (err as Error).message));

  import('$lib/server/cache/dag-cache.js')
    .then(({ cleanupExpiredDAGCache }) => cleanupExpiredDAGCache())
    .then((r) => console.log(`[Boot] DAG cache cleanup: ${r.deleted} expired docs removed`))
    .catch((err) => console.warn('[Boot] DAG cache cleanup: failed:', (err as Error).message));

  // ── VAPID Key Validation ─────────────────────────────────────────────────
  if (ENV.VAPID_PUBLIC_KEY && ENV.VAPID_PRIVATE_KEY) {
    console.log('[Boot] VAPID keys configured — Web Push enabled');
  } else {
    console.warn(
      '[Boot] VAPID keys empty — Web Push notifications disabled. Generate with: npx web-push generate-vapid-keys --json'
    );
  }

  // ── Infrastructure Diagnostic ─────────────────────────────────────────
  const dbUrl = ENV.DATABASE_URL || process.env.DATABASE_URL || '(not set)';
  const dbHost = dbUrl.match(/@([^:/]+):?(\d+)?/);
  console.log(`[Boot] DB: ${dbHost ? dbHost[1] + ':' + (dbHost[2] || '5432') : dbUrl.slice(0, 40)}`);
  console.log(`[Boot] Bifrost: ${ENV.BIFROST_ENABLED ? 'ENABLED → ' + ENV.BIFROST_URL : 'disabled'}`);
  console.log(`[Boot] OpenAI-compat: ${ENV.OPENAI_BASE_URL}`);
  console.log(`[Boot] Langfuse: ${ENV.LANGFUSE_ENABLED ? 'ENABLED → ' + ENV.LANGFUSE_HOST : 'disabled'}`);
  // Quick Bifrost reachability check (non-blocking)
  if (ENV.BIFROST_ENABLED) {
    fetch(`${ENV.BIFROST_URL}/health`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(d => console.log(`[Boot] Bifrost health: ${(d as { status?: string }).status || 'unknown'}`))
      .catch(() => console.warn('[Boot] Bifrost: unreachable'));
  }
}

type WarmupStatus = {
  status: 'warmed' | 'skipped' | 'failed';
  cached?: number;
  total?: number;
  reason?: string;
};

/**
 * Option #6: Warm up export cache with top 5 recent reports.
 * Uses raw pool query instead of Drizzle to bypass the cache layer
 * that can fail silently during early boot.
 */
async function warmupExportCache(): Promise<WarmupStatus> {
  try {
    // Use the raw pg pool — bypasses Drizzle cache to avoid PRECONDITION issues at boot
    const client = await pool.connect();
    let recentReports: { id: string; title: string; content: string | null; updated_at: Date }[];
    try {
      const result = await client.query(
        'SELECT id, title, content, updated_at FROM reports ORDER BY created_at DESC LIMIT 5'
      );
      recentReports = result.rows;
    } finally {
      client.release();
    }

    if (recentReports.length === 0) {
      return { status: 'skipped', reason: 'no reports in database' };
    }

    const formats = ['html', 'markdown', 'json'] as const;
    let cached = 0;

    for (const report of recentReports) {
      for (const format of formats) {
        try {
          const content =
            format === 'json'
              ? JSON.stringify(
                  { id: report.id, title: report.title, content: report.content },
                  null,
                  2
                )
              : format === 'markdown'
                ? `# ${report.title}\n\n${report.content || ''}`
                : `<html><head><title>${report.title}</title></head><body><h1>${report.title}</h1><div>${report.content || ''}</div></body></html>`;

          const contentType =
            format === 'json'
              ? 'application/json'
              : format === 'markdown'
                ? 'text/markdown'
                : 'text/html';

          const filename = `${report.title.replace(/[^a-z0-9]/gi, '_')}.${format}`;

          await cacheExport(report.id, format, content, contentType, filename, report.updated_at);
          cached++;
        } catch (err) {
          // Per-format failure is non-fatal — continue with other formats
        }
      }
    }

    return { status: 'warmed', cached, total: recentReports.length * formats.length };
  } catch (err) {
    return { status: 'failed', reason: (err as Error).message };
  }
}

/**
 * Option #6: Warm up LLM cache with common legal queries
 */
async function warmupLLMCache(): Promise<WarmupStatus> {
  const OLLAMA_URL = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const EMBEDDING_MODEL = 'embeddinggemma:latest';

  // Quick connectivity check — skip entirely if Ollama is unreachable
  try {
    const ping = await ollamaFetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) return { status: 'skipped', reason: `Ollama returned ${ping.status}` };
  } catch {
    return { status: 'skipped', reason: 'Ollama unreachable' };
  }

  const commonQueries = [
    {
      query: 'What is the statute of limitations for breach of contract?',
      context: 'general legal research',
      response:
        'The statute of limitations for breach of contract varies by jurisdiction. In most U.S. states, it ranges from 3-6 years for written contracts and 2-4 years for oral contracts. California: 4 years (written), 2 years (oral). New York: 6 years. Texas: 4 years. Always consult local statutes and recent case law, as exceptions apply for fraud, tolling, and discovery rules.',
    },
    {
      query: 'How do I file a motion to suppress evidence?',
      context: 'criminal procedure',
      response:
        'To file a motion to suppress evidence: 1) Draft the motion citing Fourth Amendment violations or other legal grounds. 2) Include supporting affidavits and case law (Mapp v. Ohio, Miranda v. Arizona). 3) File with the court clerk before trial. 4) Serve opposing counsel. 5) Attend the suppression hearing. Grounds include illegal search/seizure, lack of warrant, Miranda violations, chain of custody issues.',
    },
    {
      query: 'What are the elements of negligence?',
      context: 'tort law',
      response:
        'The four elements of negligence are: 1) Duty - defendant owed plaintiff a legal duty of care. 2) Breach - defendant breached that duty through action or inaction. 3) Causation - breach was the actual and proximate cause of harm. 4) Damages - plaintiff suffered actual injury or loss. All four must be proven by a preponderance of evidence for a successful negligence claim.',
    },
    {
      query: 'What is hearsay and what are the exceptions?',
      context: 'evidence law',
      response:
        'Hearsay is an out-of-court statement offered to prove the truth of the matter asserted (FRE 801). It is generally inadmissible unless an exception applies. Key exceptions: present sense impression, excited utterance, then-existing mental/emotional/physical condition, statements for medical diagnosis, recorded recollection, business records, public records, learned treatises, former testimony, dying declarations, statements against interest.',
    },
    {
      query: 'How long do I have to respond to discovery requests?',
      context: 'civil procedure',
      response:
        'Under Federal Rules of Civil Procedure: Interrogatories - 30 days (FRCP 33). Requests for Production - 30 days (FRCP 34). Requests for Admission - 30 days (FRCP 36). Time starts from service date. Extensions can be requested by stipulation or court order. State court deadlines may vary - check local rules. Failure to respond timely may result in waiver of objections or court sanctions.',
    },
  ];

  let cached = 0;

  for (const item of commonQueries) {
    try {
      const embedRes = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: item.query }),
        signal: AbortSignal.timeout(8000),
      });

      if (!embedRes.ok) continue;

      const embedData = await embedRes.json();
      const queryEmbedding = embedData.embedding;
      if (!Array.isArray(queryEmbedding)) continue;

      await storeCachedResponse({
        query: item.query,
        queryEmbedding,
        context: item.context,
        response: item.response,
        model: 'gemma4-legal:latest',
        confidence: 0.95,
      });

      cached++;
    } catch {
      // Per-query failure is non-fatal
    }
  }

  return {
    status: cached > 0 ? 'warmed' : 'skipped',
    cached,
    total: commonQueries.length,
    reason: cached === 0 ? 'all embeddings failed' : undefined,
  };
}

/**
 * Warm the primary chat model during boot so first-hit contextual/chat requests
 * do not pay the full cold-load cost.
 */
async function warmupChatModel(): Promise<WarmupStatus> {
  const OLLAMA_URL = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';

  try {
    const ping = await ollamaFetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) return { status: 'skipped', reason: `Ollama returned ${ping.status}` };
  } catch {
    return { status: 'skipped', reason: 'Ollama unreachable' };
  }

  try {
    const warmRes = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal:latest',
        messages: [
          { role: 'system', content: 'You are a legal AI assistant.' },
          { role: 'user', content: 'Reply with OK.' },
        ],
        stream: false,
        keep_alive: getChatModelKeepAlive(),
        options: {
          temperature: 0,
          num_predict: 1,
          num_ctx: 512,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!warmRes.ok) {
      return { status: 'failed', reason: `warmup returned ${warmRes.status}` };
    }

    await warmRes.json().catch(() => null);
    return { status: 'warmed' };
  } catch (err) {
    return { status: 'failed', reason: (err as Error).message };
  }
}

/**
 * Main request handler with Lucia v3 session validation
 */
export const handle: Handle = async ({ event, resolve }) => {
  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  event.locals.requestId = requestId;

  // Add timing information
  const startTime = Date.now();

  // === CORS for API routes (Sprint 1: credentials + expose-headers + PATCH) ===
  if (event.url.pathname.startsWith('/api/')) {
    const allowedOrigin = dev ? '*' : ENV.PUBLIC_API_URL || event.url.origin;

    if (event.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Expose-Headers': 'X-Request-ID, X-Response-Time',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
  }

  // === REQUEST BODY SIZE LIMIT (Sprint 4) ===
  if (
    event.url.pathname.startsWith('/api/') &&
    event.request.method !== 'GET' &&
    event.request.method !== 'HEAD'
  ) {
    const contentLength = parseInt(event.request.headers.get('content-length') || '0', 10);
    const isUpload = UPLOAD_PATHS.some((p) => event.url.pathname.startsWith(p));
    const limit = isUpload ? MAX_UPLOAD_SIZE : MAX_BODY_SIZE;

    if (contentLength > limit) {
      return new Response(JSON.stringify({ error: 'Payload too large', maxBytes: limit }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      });
    }
  }

  // === PER-ROUTE RATE LIMITING (Sprint 4 → Sprint 5) ===
  // Skip rate limiting in dev mode to avoid false 429s during rapid testing
  const skipRateLimit = dev && process.env.DEV_BYPASS_AUTH === 'true';
  if (
    !skipRateLimit &&
    event.url.pathname.startsWith('/api/') &&
    !event.url.pathname.startsWith('/api/health')
  ) {
    const tier = getRateTier(event.url.pathname, event.request.method);
    if (tier) {
      const forwarded = event.request.headers.get('x-forwarded-for');
      const ip = forwarded
        ? forwarded.split(',')[0].trim()
        : (event.getClientAddress?.() ?? 'unknown');
      const now = Date.now();
      const key = `${tier.prefix}:${ip}`;
      const entry = rateLimits.get(key);

      if (!entry || now > entry.resetTime) {
        // Evict oldest if at capacity (prevent unbounded growth from unique IPs)
        if (!rateLimits.has(key) && rateLimits.size >= RATE_LIMIT_MAX_ENTRIES) {
          const oldest = rateLimits.keys().next().value;
          if (oldest) rateLimits.delete(oldest);
        }
        rateLimits.set(key, { count: 1, resetTime: now + tier.window });
      } else if (entry.count >= tier.max) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        return new Response(JSON.stringify({ error: 'Rate limit exceeded', retryAfter }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(tier.max),
            'X-RateLimit-Remaining': '0',
            'X-Request-ID': requestId,
          },
        });
      } else {
        entry.count++;
      }
    }
  }

  // === SESSION AUTH / DEV BYPASS AUTH ===
  const sessionId = event.cookies.get('auth_session');

  if (sessionId) {
    const { session, user } = await validateSession(sessionId);

    if (session && session.fresh) {
      setSessionCookie(event.cookies, session.id);
    }

    if (!session) {
      deleteSessionCookie(event.cookies);
    }

    event.locals.user = user;
    event.locals.session = session;
  } else if (dev && process.env.DEV_BYPASS_AUTH === 'true') {
    const devUserId = '00000000-0000-0000-0000-000000000001';
    event.locals.user = {
      id: devUserId,
      email: 'admin@yorha.dev',
      username: '2B',
      role: 'admin',
      hasCompletedOnboarding: true,
      onboardingStep: 10,
    };
    event.locals.session = {
      id: '00000000-0000-0000-0000-000000000002',
      userId: devUserId,
      expiresAt: new Date(Date.now() + 86400000),
      fresh: true,
    } as any;
  } else {
    event.locals.user = null;
    event.locals.session = null;
  }

  // === CENTRALIZED AUTH GUARDS (Phase A2 — deny-by-default) ===
  if (event.url.pathname.startsWith('/api/')) {
    const path = event.url.pathname;

    // Public routes (no auth needed) — explicitly allowlisted
    // NOTE: /api/system, /api/ollama moved to ADMIN_ONLY (Sprint 3 — infra recon + model pull risk)
    // NOTE: /api/kb, /api/precedents moved to auth-required (Sprint 3 — access Qdrant/case data)
    const PUBLIC = [
      '/api/health',
      '/api/auth',
      '/api/metrics',
      '/api/ping',
      '/api/infrastructure',
      '/api/docs',
      '/api/glossary',
      '/api/statutes',
    ];

    // Admin-only routes (require admin role)
    const ADMIN_ONLY = [
      '/api/admin',
      '/api/codebase-index',
      '/api/codebase',
      '/api/phase89',
      '/api/phase72',
      '/api/phase82',
      '/api/error-brain',
      '/api/errors',
      '/api/internal',
      '/api/cache',
      '/api/consolidation',
      '/api/gpu',
      '/api/gpu-wasm',
      '/api/indexing',
      '/api/pipeline',
      '/api/qlora',
      '/api/rabbitmq',
      '/api/security',
      '/api/topology',
      '/api/worker',
      '/api/generate-cluster',
      '/api/tools',
      '/api/system',
      '/api/ollama',
    ];

    const isPublic = PUBLIC.some((p) => path.startsWith(p));

    if (!isPublic) {
      // Deny-by-default: ALL non-public API routes require authentication
      if (!event.locals.user) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
        });
      }

      // Admin-only routes additionally require admin role
      const needsAdmin = ADMIN_ONLY.some((p) => path.startsWith(p));
      if (needsAdmin && event.locals.user?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
        });
      }
    }
  }

  // === Resolve with request-level timeout (Sprint 1) ===
  let response: Response;
  const isStreamRoute =
    event.url.pathname.includes('/stream') ||
    event.url.pathname.startsWith('/api/sse/') ||
    event.url.pathname.startsWith('/api/routes');
  const isAIRoute =
    event.url.pathname.startsWith('/api/ai/') ||
    event.url.pathname.startsWith('/api/ollama/') ||
    event.url.pathname.startsWith('/api/embed') ||
    event.url.pathname.startsWith('/api/nlp/') ||
    event.url.pathname.startsWith('/api/rag/') ||
    event.url.pathname.startsWith('/api/agent/') ||
    event.url.pathname.startsWith('/api/contextual/') ||
    event.url.pathname.startsWith('/api/synthesis/') ||
    event.url.pathname.startsWith('/api/error-brain/diagnose') ||
    event.url.pathname.startsWith('/api/evidence/upload');

  if (isStreamRoute) {
    // No timeout for SSE / streaming routes
    response = await resolve(event);
  } else {
    const timeout = isAIRoute ? AI_REQUEST_TIMEOUT : DEFAULT_REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      response = await Promise.race([
        resolve(event),
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error(`Request timeout after ${timeout}ms`));
          });
        }),
      ]);
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : 'Request timeout';
      console.warn(`[Timeout] ${event.request.method} ${event.url.pathname} — ${msg}`);
      return new Response(JSON.stringify({ error: 'Request timeout', timeout }), {
        status: 504,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      });
    }
    clearTimeout(timer);
  }

  // Add timing headers + structured request logging
  const duration = Date.now() - startTime;
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Response-Time', `${duration}ms`);

  // Slow request warning (Sprint 1)
  if (duration > 10_000) {
    console.warn(`[Slow] ${event.request.method} ${event.url.pathname} took ${duration}ms`);
  }

  productionLogger.apiRequest(event.request.method, event.url.pathname, response.status, duration, {
    requestId,
    userId: event.locals.user?.id,
  });

  // Push to persistent audit log (batched, best-effort)
  auditBuffer.push({
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    statusCode: response.status,
    durationMs: duration,
    userId: event.locals.user?.id,
    ipAddress: (() => {
      try {
        return event.getClientAddress?.();
      } catch {
        return event.request.headers.get('x-forwarded-for') ?? undefined;
      }
    })(),
    userAgent: event.request.headers.get('user-agent') ?? undefined,
  });

  // CORS origin header on API responses (Sprint 1: credentials + expose-headers)
  if (event.url.pathname.startsWith('/api/')) {
    const allowedOrigin = dev ? '*' : ENV.PUBLIC_API_URL || event.url.origin;
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Expose-Headers', 'X-Request-ID, X-Response-Time');
  }

  // Cross-origin isolation headers — required for SharedArrayBuffer / threaded WASM (ORT)
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  // Security headers (production only — avoid breaking HMR in dev)
  if (!dev) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
    );
  }

  // Disable proxy buffering for streaming AI endpoints (SSE/ndjson only)
  if (isStreamRoute && event.url.pathname.startsWith('/api/ai/')) {
    response.headers.set('Cache-Control', 'no-cache');
    response.headers.set('X-Accel-Buffering', 'no');
  }

  // Default cache headers for API routes that don't set their own
  if (event.url.pathname.startsWith('/api/') && !response.headers.has('Cache-Control')) {
    const method = event.request.method;
    if (method === 'GET' || method === 'HEAD') {
      // Store but always revalidate — safe for user-specific legal data
      response.headers.set('Cache-Control', 'private, no-cache');
    } else {
      // Mutations must never be cached
      response.headers.set('Cache-Control', 'no-store');
    }
  }

  return response;
};

/**
 * Error handler
 */
export const handleError: HandleServerError = ({ error, event }) => {
	const errorId = crypto.randomUUID();

	if (dev) {
		const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
		const debugLine = `[${new Date().toISOString()}] ${event.url.pathname}: ${errMsg}\n---\n`;
		import('node:fs').then(fs => fs.appendFileSync('ssr-errors.log', debugLine)).catch(() => {});
	}

	productionLogger.error(
		`[${errorId}] Unhandled error in ${event.url.pathname}`,
		error instanceof Error ? error : new Error(String(error)),
		{ requestId: event.locals.requestId, endpoint: event.url.pathname }
	);

	return {
		message: dev ? `${error instanceof Error ? error.message : String(error)}` : 'An unexpected error occurred',
		code: errorId,
		requestId: event.locals.requestId,
		timestamp: new Date().toISOString()
	};
};

// ── Graceful Shutdown Orchestrator (Sprint 1: DB pool + hard deadline) ───
const SHUTDOWN_TIMEOUT = 10_000; // 10s hard deadline
let shuttingDown = false;

if (typeof process !== 'undefined') {
	const shutdown = async (signal: string) => {
		if (shuttingDown) {
			console.log(`[Shutdown] ${signal} received again — forcing exit`);
			process.exit(1);
		}
		shuttingDown = true;
		console.log(`[Shutdown] ${signal} received, closing connections...`);

		// Hard deadline: if graceful shutdown takes too long, force exit
		const hardTimer = setTimeout(() => {
			console.error('[Shutdown] Hard timeout reached — forcing exit');
			process.exit(1);
		}, SHUTDOWN_TIMEOUT);
		hardTimer.unref(); // Don't keep process alive just for this timer

		try {
			// Close infrastructure connections (Redis, Neo4j, RabbitMQ)
			const { closeAllConnections } = await import('$lib/server/connections/connection-pool.js');
			await closeAllConnections();
		} catch (err) {
			console.error('[Shutdown] Error closing infrastructure:', (err as Error).message);
		}

		try {
			// Close DB pools (Sprint 1 fix: was missing!)
			const { closeConnections } = await import('$lib/server/db/client');
			await closeConnections();
		} catch (err) {
			console.error('[Shutdown] Error closing DB pools:', (err as Error).message);
		}

		// Flush Langfuse traces
		try {
			const { shutdownLangfuse } = await import('$lib/server/observability/langfuse.js');
			await shutdownLangfuse();
		} catch {
			// Non-fatal
		}

		// Flush inference log buffer to CouchDB
		try {
			const { flushInferenceLog } = await import('$lib/server/observability/inference-log.js');
			await flushInferenceLog();
		} catch {
			// Non-fatal
		}

		// Flush audit buffer
		try {
			await auditBuffer.shutdown();
		} catch {
			// Non-fatal
		}

		productionLogger.shutdown();
		console.log('[Shutdown] All connections closed');
	};

	process.once('SIGINT', () => void shutdown('SIGINT'));
	process.once('SIGTERM', () => void shutdown('SIGTERM'));
}
