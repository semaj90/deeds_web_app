/**
 * kv-context-controller.ts
 *
 * Orchestrates the 3-level KV-aware context assembly for Gemma4:
 *
 *  Level 1 — Runtime KV cache reuse
 *    The stable system prefix (persona + tool contract) never changes, so
 *    llama-server reuses its KV cache for it across calls.
 *
 *  Level 2 — Compressed context cards
 *    File paths, traces, and research results are compressed into small cards
 *    before being injected into the prompt.
 *
 *  Level 3 — Attention TOC packet
 *    Gemma4 receives a table-of-contents (hot files, hot symbols, tool hints)
 *    and calls tools to expand only what it needs.
 *
 * Public API:
 *   buildKvContextPacket()   — assemble full packet for a task/query
 *   getCompressedCard()      — retrieve a card by stableKey
 *   explainCompression()     — debug view of current packet
 *   refreshTaskToc()         — invalidate + rebuild TOC
 *   getStableSystemPrefix()  — the cacheable prefix injected as system message
 *   formatKvPacketForPrompt() — render packet as prompt text
 */

import { createHash } from 'node:crypto';
import { getRedis }   from '$lib/server/redis.js';
import {
  compressFileToCard,
  compressTraceToCard,
  buildAttentionToc,
} from './context-compression.js';
import type { FileCard, TraceCard, ResearchCard, AttentionToc } from './context-compression.js';

// ── Stable prefix — content must stay identical across calls ──────────────────
// Changing this text invalidates all llama-server KV cache hits.
// The hash is stored in every KV packet so cache freshness can be detected.

const STABLE_PERSONA =
  'You are the TRACE dev agent for the YorHA legal AI platform.\n' +
  'You have access to a codebase knowledge graph, retrieval pipeline, and MCP tools.\n' +
  'Always retrieve compressed context cards before answering.\n' +
  'Never dump raw files or entire directories into your response.\n' +
  'Respect the blockedAreas in the TOC — do not modify those paths.\n' +
  'Do not invoke write/mutation tools unless explicitly operator-gated.';

const STABLE_TOOL_CONTRACT =
  'Available tool namespaces (read-only unless noted):\n' +
  '  search.hybrid / search.postgres_fts  — lexical + semantic code search\n' +
  '  trace.kag_search                     — ACE/KAG retrieval pipeline\n' +
  '  trace.explain_retrieval              — cached retrieval trace\n' +
  '  graph.expand_neighborhood            — Neo4j ego-graph expansion\n' +
  '  graph.shortest_path                  — topology path finding\n' +
  '  clusters.get_summary_lenses          — AGENTS.md + wiki notes for cluster\n' +
  '  context.get_compressed_card          — expand stableKey → full card\n' +
  '  context.build_kv_packet              — rebuild task table-of-contents\n' +
  '  context.explain_compression          — inspect current packet\n' +
  'Call these tools first. Only request raw file detail when the card is insufficient.';

// ── Types ─────────────────────────────────────────────────────────────────────

export type KvContextPacket = {
  taskId:            string;
  stablePrefixHash:  string;
  level1Runtime: {
    model:       string;
    cachePolicy: 'reuse-stable-prefix';
    cacheTypeK:  string;
    cacheTypeV:  string;
  };
  level2Compressed: {
    taskSummary:   string;
    fileCards:     FileCard[];
    traceCards:    TraceCard[];
    researchCards: ResearchCard[];
  };
  level3AttentionToc: AttentionToc;
  tokenBudget: {
    maxInputTokens:       number;
    stablePrefixTokens:   number;
    dynamicContextTokens: number;
    reservedOutputTokens: number;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32);
}

function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// ── Stable prefix accessors ───────────────────────────────────────────────────

export function getStableSystemPrefix(): string {
  return `${STABLE_PERSONA}\n\n${STABLE_TOOL_CONTRACT}`;
}

export function getStablePrefixHash(): string {
  return sha256(getStableSystemPrefix());
}

// ── buildKvContextPacket ──────────────────────────────────────────────────────

export async function buildKvContextPacket(opts: {
  taskId:         string;
  query:          string;
  hotFiles?:      string[];
  hotSymbols?:    string[];
  blockedAreas?:  string[];
  maxInputTokens?: number;
}): Promise<KvContextPacket> {
  const redis = getRedis();
  const {
    taskId,
    query,
    hotFiles     = [],
    hotSymbols   = [],
    blockedAreas = [],
    maxInputTokens = 12_000,
  } = opts;

  // L1: try query-level cache (cheap hit for repeated identical queries)
  const queryHash     = sha256(query + taskId);
  const queryCacheKey = `kv:toc:query:${queryHash}`;
  try {
    const cached = await redis.get(queryCacheKey);
    if (cached) return JSON.parse(cached) as KvContextPacket;
  } catch { /* miss */ }

  // L2: build compressed file cards in parallel (bounded to 8 files)
  const fileCards = await Promise.all(
    hotFiles.slice(0, 8).map(f => compressFileToCard(f).catch((): FileCard => ({
      stableKey: `file:${f}`, filePath: f, oneLineSummary: f,
      importantSymbols: [], knownRisks: [], recentTraceHits: [],
      retrievalReasons: [], score: 0,
    }))),
  );

  // L3: build attention TOC
  const toc = await buildAttentionToc(taskId, hotFiles, hotSymbols, blockedAreas);

  const stablePrefix       = getStableSystemPrefix();
  const stablePrefixHash   = sha256(stablePrefix);
  const stablePrefixTokens = estimateTokens(stablePrefix);
  const reservedOutput     = 2_048;

  const packet: KvContextPacket = {
    taskId,
    stablePrefixHash,
    level1Runtime: {
      model:       'gemma4-legal-vlm:latest',
      cachePolicy: 'reuse-stable-prefix',
      cacheTypeK:  'q8_0',
      cacheTypeV:  'q8_0',
    },
    level2Compressed: {
      taskSummary:   query.slice(0, 300),
      fileCards,
      traceCards:    [],
      researchCards: [],
    },
    level3AttentionToc: toc,
    tokenBudget: {
      maxInputTokens,
      stablePrefixTokens,
      dynamicContextTokens: Math.max(0, maxInputTokens - stablePrefixTokens - reservedOutput),
      reservedOutputTokens: reservedOutput,
    },
  };

  // Cache by query (30min) and task (1h)
  const serialized  = JSON.stringify(packet);
  const tocCacheKey = `kv:toc:task:${taskId}`;
  try {
    await Promise.all([
      redis.setex(queryCacheKey, 1_800, serialized),
      redis.setex(tocCacheKey,  3_600, serialized),
    ]);
  } catch { /* non-fatal */ }

  // Durable write to Postgres (fire-and-forget)
  _persistKvPacket(packet).catch(() => {});

  return packet;
}

async function _persistKvPacket(packet: KvContextPacket): Promise<void> {
  try {
    const { pool } = await import('$lib/server/db/client');
    await pool.query(
      `INSERT INTO kv_context_packets
         (task_id, stable_prefix_hash, level2_compressed, level3_attention_toc, token_budget, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (task_id) DO UPDATE
         SET stable_prefix_hash  = EXCLUDED.stable_prefix_hash,
             level2_compressed   = EXCLUDED.level2_compressed,
             level3_attention_toc = EXCLUDED.level3_attention_toc,
             token_budget         = EXCLUDED.token_budget,
             updated_at           = now()`,
      [
        packet.taskId,
        packet.stablePrefixHash,
        JSON.stringify(packet.level2Compressed),
        JSON.stringify(packet.level3AttentionToc),
        JSON.stringify(packet.tokenBudget),
        JSON.stringify({ model: packet.level1Runtime.model }),
      ],
    );
  } catch { /* non-fatal — Postgres may be unavailable in test env */ }
}

// ── getCompressedCard ─────────────────────────────────────────────────────────

/** Fetch a compressed card by stableKey (e.g. "file:src/lib/server/gpu/libtorch-bridge.ts"). */
export async function getCompressedCard(
  stableKey: string,
): Promise<FileCard | TraceCard | null> {
  const [type, ...rest] = stableKey.split(':');
  const payload = rest.join(':');

  if (type === 'file')  return compressFileToCard(payload).catch(() => null);
  if (type === 'trace') return compressTraceToCard(payload).catch(() => null);
  return null;
}

// ── explainCompression ────────────────────────────────────────────────────────

/** Debug view: current packet shape for a taskId. */
export async function explainCompression(taskId: string): Promise<string> {
  const redis = getRedis();
  try {
    const raw = await redis.get(`kv:toc:task:${taskId}`);
    if (!raw) {
      return JSON.stringify({
        taskId,
        status: 'no-packet-found',
        hint:   'Call context.build_kv_packet with taskId and query first.',
      });
    }
    const p = JSON.parse(raw) as KvContextPacket;
    return JSON.stringify({
      taskId:           p.taskId,
      stablePrefixHash: p.stablePrefixHash,
      fileCards:        p.level2Compressed.fileCards.length,
      traceCards:       p.level2Compressed.traceCards.length,
      researchCards:    p.level2Compressed.researchCards.length,
      toc:              p.level3AttentionToc,
      tokenBudget:      p.tokenBudget,
    }, null, 2);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

// ── refreshTaskToc ────────────────────────────────────────────────────────────

/** Force-rebuild the TOC for a task (invalidates Redis cache first). */
export async function refreshTaskToc(
  taskId:       string,
  hotFiles:     string[],
  hotSymbols:   string[],
  blockedAreas: string[] = [],
): Promise<AttentionToc> {
  const redis = getRedis();
  try { await redis.del(`kv:toc:task:${taskId}`); } catch { /* ok */ }
  return buildAttentionToc(taskId, hotFiles, hotSymbols, blockedAreas);
}

// ── formatKvPacketForPrompt ───────────────────────────────────────────────────

/**
 * Render a KV context packet as the dynamic section of the Gemma4 prompt.
 *
 * This text is appended AFTER the stable prefix (which is cached on llama-server).
 * It contains only the task-specific TOC and compressed cards — not raw files.
 */
export function formatKvPacketForPrompt(packet: KvContextPacket): string {
  const { level2Compressed: l2, level3AttentionToc: toc, tokenBudget: budget } = packet;

  const fileCardLines = l2.fileCards.map((c) => {
    const symbols = c.importantSymbols.length
      ? `\n    key symbols: ${c.importantSymbols.join(', ')}`
      : '';
    const risks = c.knownRisks.length
      ? `\n    risks: ${c.knownRisks.join(', ')}`
      : '';
    return `  • [${c.stableKey}] ${c.oneLineSummary}${symbols}${risks}`;
  });

  const parts: string[] = [
    `## Task Context Packet (${packet.taskId})`,
    `Goal: ${l2.taskSummary}`,
    '',
    '### Attention Table-of-Contents',
    `Hot files:\n${toc.hotFiles.map(f => `  - ${f}`).join('\n') || '  (none — use search.hybrid to find relevant files)'}`,
    toc.hotSymbols.length ? `Hot symbols: ${toc.hotSymbols.join(', ')}` : '',
    toc.blockedAreas.length ? `\nDo NOT modify: ${toc.blockedAreas.join(', ')}` : '',
    `\nRecommended first tools: ${toc.hotTools.slice(0, 3).join(', ')}`,
    '',
    '### Compressed File Cards',
    fileCardLines.length
      ? fileCardLines.join('\n')
      : '  (no file cards yet — call context.get_compressed_card with a stableKey)',
    '',
    `Token budget: ${budget.dynamicContextTokens.toLocaleString()} tokens for dynamic context.`,
    'To expand a card: call context.get_compressed_card("file:<path>").',
  ];

  return parts.filter(Boolean).join('\n');
}