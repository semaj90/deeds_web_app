#!/usr/bin/env npx tsx
/**
 * Phase 79: Parent Atlas Agentic Repair Loop v2
 *
 * Runtime owners:
 * - Retrieval/context: SearchRuntime in readOnly mode (Postgres + Qdrant + graph lanes).
 * - Query embeddings: canonical semantic_768 EmbeddingGemma executor (:8081).
 * - Synthesis/planning: Ornith 1.5 via llama-server (:8090), resolved from /v1/models.
 * - Repair memory: append-only analysis_pass_results through the existing pass-fabric writer.
 * - Source mutation: this script, gated by --apply + ATLAS_AUTHORIZE_PHASE79_REPAIR=1.
 *
 * Deliberately NOT owners:
 * - no direct Qdrant upserts
 * - no direct Valkey/BitFrost writes
 * - no ad-hoc knowledge/failure tables
 * - no Gemini chat path
 * - no Ollama chat path
 *
 * Default is dry-run. In dry-run the script may read Postgres/Qdrant and call local
 * EmbeddingGemma/Ornith, and may write JSON receipts under logs/phase79, but it
 * does not modify source files or canonical datastores.
 *
 * @module scripts/phase79-agentic-repair
 */

import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const LOGS_DIR = path.join(APP_ROOT, 'logs', 'phase79');

loadDotenv({ path: path.join(APP_ROOT, '.env.local') });
loadDotenv({ path: path.join(APP_ROOT, '.env') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });

process.chdir(APP_ROOT);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required; Phase 79 no longer embeds database credentials.');
}

const EMBED_BASE_URL = (
  process.env.LLAMA_EMBED_URL ??
  process.env.EMBED_SERVER_URL ??
  'http://127.0.0.1:8081'
).replace(/\/$/, '');
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma';
const EXPECTED_EMBED_DIM = 768;
const ORNITH_TIMEOUT_MS = Number(process.env.PHASE79_ORNITH_TIMEOUT_MS ?? 90_000);
const MAX_FILE_CHARS = Number(process.env.PHASE79_MAX_FILE_CHARS ?? 80_000);
const MAX_RETRIEVAL_PACKETS = Number(process.env.PHASE79_RETRIEVAL_PACKETS ?? 6);
const MAX_ORNITH_TOKENS = Number(process.env.PHASE79_MAX_TOKENS ?? 3072);
const PHASE79_PASS_REVISION = 'phase79-agentic-repair.v2';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const EXPLICIT_DRY_RUN = args.includes('--dry-run');
const DRY_RUN = EXPLICIT_DRY_RUN || !APPLY;
const ALLOW_HIGH_RISK = args.includes('--allow-high-risk');
const ALLOW_DEGRADED_RETRIEVAL = args.includes('--allow-degraded-retrieval');
const APPLY_AUTHORIZED = process.env.ATLAS_AUTHORIZE_PHASE79_REPAIR === '1';
const HIGH_RISK_AUTHORIZED = process.env.ATLAS_AUTHORIZE_HIGH_RISK_REPAIR === '1';

const limitArg = args.find((arg) => arg.startsWith('--limit='));
const positionalLimit = args.find((arg) => /^\d+$/.test(arg));
const MAX_ITERATIONS = limitArg
  ? Number.parseInt(limitArg.slice('--limit='.length), 10) || 10
  : positionalLimit
    ? Number.parseInt(positionalLimit, 10)
    : 10;

if (APPLY && !APPLY_AUTHORIZED) {
  throw new Error(
    'APPLY_NOT_AUTHORIZED: pass --apply and set ATLAS_AUTHORIZE_PHASE79_REPAIR=1 for source/DB mutation.'
  );
}
if (ALLOW_HIGH_RISK && APPLY && !HIGH_RISK_AUTHORIZED) {
  throw new Error(
    'HIGH_RISK_APPLY_NOT_AUTHORIZED: --allow-high-risk also requires ATLAS_AUTHORIZE_HIGH_RISK_REPAIR=1.'
  );
}

await fs.mkdir(LOGS_DIR, { recursive: true });

const sql = postgres(DATABASE_URL, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
});

type RiskLevel = 'low' | 'medium' | 'high' | string;

interface Suggestion {
  id: string;
  route_path: string;
  cluster_id: string;
  summary: string;
  patch: string;
  risk_level: RiskLevel;
  error_code?: string;
  category?: string;
  file_path?: string;
}

interface RetrievalPacket {
  packetKey: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
  workspaceRevision: string | null;
  representationRevision: string | null;
  summary: string;
  title: string;
}

interface NesContext {
  featureId: string | null;
  clusterId: string | null;
  centroidId: string | null;
  packetKey: string | null;
  lane: string | null;
  summary: string | null;
}

interface RepairEdit {
  search: string;
  replace: string;
}

interface OrnithRepairPlan {
  summary: string;
  confidence: number;
  edits: RepairEdit[];
  verification: string[];
}

interface ValidationSnapshot {
  exitCode: number;
  errorCount: number;
  targetMentions: number;
  outputDigest: string;
  outputPreview: string;
}

interface EmbeddingProbe {
  status: 'PROVEN' | 'DEGRADED';
  endpoint: string;
  model: string;
  dimension: number;
  finite: boolean;
  normalized: boolean;
  vectorDigest: string | null;
  error?: string;
}

interface RetrievalContext {
  packets: RetrievalPacket[];
  nes: NesContext | null;
  retrievalSources: string[];
  contextChecksum: string;
  canonicalPacketKey: string | null;
  sourceWorkspaceRevision: string | null;
  sourceRepresentationRevision: string | null;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function toCanonicalSourceRef(absolutePath: string): string {
  const relative = normalizeSlashes(path.relative(REPO_ROOT, absolutePath));
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`SOURCE_PATH_OUTSIDE_REPOSITORY:${absolutePath}`);
  }
  return relative;
}

function resolveWithinApp(candidatePath: string): string {
  let absolutePath: string;
  if (path.isAbsolute(candidatePath)) {
    absolutePath = path.resolve(candidatePath);
  } else if (normalizeSlashes(candidatePath).startsWith('sveltekit-frontend/')) {
    absolutePath = path.resolve(REPO_ROOT, candidatePath);
  } else {
    absolutePath = path.resolve(APP_ROOT, candidatePath);
  }

  const appPrefix = `${APP_ROOT}${path.sep}`.toLowerCase();
  const normalized = absolutePath.toLowerCase();
  if (normalized !== APP_ROOT.toLowerCase() && !normalized.startsWith(appPrefix)) {
    throw new Error(`SOURCE_PATH_OUTSIDE_SVELTEKIT:${candidatePath}`);
  }
  return absolutePath;
}

async function fetchPendingSuggestions(limit = 5): Promise<Suggestion[]> {
  const riskPredicate = ALLOW_HIGH_RISK
    ? sql`TRUE`
    : sql`COALESCE(es.risk_level, 'medium') <> 'high'`;

  const primary = await sql<Suggestion[]>`
    SELECT
      es.id::text,
      es.cluster_id,
      es.summary,
      es.patch,
      es.risk_level,
      ec.route_id AS route_path,
      ec.error_code,
      ec.category,
      ec.file_path
    FROM error_suggestions es
    INNER JOIN error_cluster ec ON es.cluster_id = ec.cluster_id
    WHERE es.applied = false
      AND es.patch IS NOT NULL
      AND es.patch <> ''
      AND ec.file_path IS NOT NULL
      AND ec.file_path <> ''
      AND ec.route_id NOT LIKE '%__non_route__%'
      AND ${riskPredicate}
    ORDER BY
      CASE es.risk_level
        WHEN 'low' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'high' THEN 3
        ELSE 2
      END,
      ec.count DESC NULLS LAST
    LIMIT ${limit}
  `;

  if (primary.length > 0) return primary;

  return sql<Suggestion[]>`
    SELECT
      es.id::text,
      es.cluster_id,
      es.summary,
      es.patch,
      es.risk_level,
      ec.route_id AS route_path,
      ec.error_code,
      ec.category,
      ec.file_path
    FROM error_suggestions es
    INNER JOIN error_cluster ec ON es.cluster_id = ec.cluster_id
    WHERE es.applied = false
      AND es.patch IS NOT NULL
      AND es.patch <> ''
      AND ec.file_path IS NOT NULL
      AND ec.file_path <> ''
      AND ${riskPredicate}
    ORDER BY
      CASE es.risk_level
        WHEN 'low' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'high' THEN 3
        ELSE 2
      END,
      ec.count DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function resolveFilePath(suggestion: Suggestion): Promise<string | null> {
  const candidates = [
    suggestion.file_path,
    suggestion.route_path ? `src/routes${suggestion.route_path}/+page.svelte` : null,
    suggestion.route_path ? `src/routes${suggestion.route_path}/+page.ts` : null,
    suggestion.route_path ? `src/routes${suggestion.route_path}/+server.ts` : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const absolutePath = resolveWithinApp(candidate);
      await fs.access(absolutePath);
      return absolutePath;
    } catch {
      // Try the next exact/route-derived candidate.
    }
  }
  return null;
}

async function probeEmbeddingGemma(): Promise<EmbeddingProbe> {
  const endpoint = `${EMBED_BASE_URL}/v1/embeddings`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: 'task: retrieval_query | query: phase79 agentic repair context',
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = body.data?.[0]?.embedding;
    if (!Array.isArray(vector)) throw new Error('EMBEDDING_VECTOR_MISSING');

    const finite = vector.every(Number.isFinite);
    const norm = finite ? Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) : 0;
    const normalized = finite && Math.abs(norm - 1) <= 1e-3;
    const dimension = vector.length;
    if (dimension !== EXPECTED_EMBED_DIM || !finite || !normalized) {
      throw new Error(
        `EMBEDDING_CONTRACT_MISMATCH:dim=${dimension}:finite=${finite}:normalized=${normalized}`
      );
    }

    return {
      status: 'PROVEN',
      endpoint,
      model: EMBED_MODEL,
      dimension,
      finite,
      normalized,
      vectorDigest: sha256(JSON.stringify(vector)),
    };
  } catch (error) {
    const result: EmbeddingProbe = {
      status: 'DEGRADED',
      endpoint,
      model: EMBED_MODEL,
      dimension: 0,
      finite: false,
      normalized: false,
      vectorDigest: null,
      error: error instanceof Error ? error.message : String(error),
    };
    if (!ALLOW_DEGRADED_RETRIEVAL) {
      throw new Error(`EMBEDDINGGEMMA_NOT_READY:${result.error}`);
    }
    return result;
  }
}

async function lookupNesContext(sourceRef: string): Promise<NesContext | null> {
  const withoutFrontendPrefix = sourceRef.startsWith('sveltekit-frontend/')
    ? sourceRef.slice('sveltekit-frontend/'.length)
    : sourceRef;

  const features = await sql<Array<{
    feature_id: string | null;
    cluster_id: string | null;
    centroid_id: string | null;
  }>>`
    SELECT feature_id::text, cluster_id::text, centroid_id::text
    FROM atlas_feature_map
    WHERE source_ref IN (${sourceRef}, ${withoutFrontendPrefix})
    ORDER BY CASE WHEN source_ref = ${sourceRef} THEN 0 ELSE 1 END
    LIMIT 1
  `.catch(() => []);

  const feature = features[0];
  if (!feature?.feature_id) {
    return feature
      ? {
          featureId: null,
          clusterId: feature.cluster_id,
          centroidId: feature.centroid_id,
          packetKey: null,
          lane: null,
          summary: null,
        }
      : null;
  }

  const packets = await sql<Array<{
    packet_key: string | null;
    lane: string | null;
    summary: string | null;
  }>>`
    SELECT packet_key::text, lane::text, summary
    FROM nes_chrom_packets
    WHERE feature_id = ${feature.feature_id}
    ORDER BY updated_at DESC
    LIMIT 1
  `.catch(() => []);

  const packet = packets[0];
  return {
    featureId: feature.feature_id,
    clusterId: feature.cluster_id,
    centroidId: feature.centroid_id,
    packetKey: packet?.packet_key ?? null,
    lane: packet?.lane ?? null,
    summary: packet?.summary ?? null,
  };
}

let runtimePromise:
  | Promise<{
      search: (query: Record<string, unknown>) => Promise<any>;
    }>
  | null = null;

async function getReadOnlySearchRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const { createProductionSearchRuntime } = await import(
        '$lib/server/retrieval/search-runtime.js'
      );
      return createProductionSearchRuntime({
        userId: 'phase79-agent',
        readOnly: true,
      }) as unknown as {
        search: (query: Record<string, unknown>) => Promise<any>;
      };
    })();
  }
  return runtimePromise;
}

async function retrieveRepairContext(
  suggestion: Suggestion,
  sourceRef: string
): Promise<RetrievalContext> {
  const runtime = await getReadOnlySearchRuntime();
  const query = [
    suggestion.error_code,
    suggestion.category,
    suggestion.summary,
    sourceRef,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 1000);

  const [result, nes] = await Promise.all([
    runtime.search({
      text: query,
      topK: Math.max(1, Math.min(MAX_RETRIEVAL_PACKETS, 20)),
      filters: {
        includeGenerated: false,
        includeLegacy: false,
      },
    }),
    lookupNesContext(sourceRef),
  ]);

  if (result?.provenance?.readOnly !== true || result?.provenance?.promotionAttempted !== false) {
    throw new Error('SEARCH_RUNTIME_READONLY_CONTRACT_NOT_PROVEN');
  }

  const packets: RetrievalPacket[] = Array.isArray(result?.packets)
    ? result.packets.slice(0, MAX_RETRIEVAL_PACKETS).map((packet: any) => ({
        packetKey: packet.packetKey ?? packet.packet_key ?? null,
        sourceRef: packet.sourceRef ?? packet.source_ref ?? null,
        sourceRevision: packet.sourceRevision ?? packet.source_revision ?? null,
        workspaceRevision: packet.workspaceRevision ?? packet.workspace_revision ?? null,
        representationRevision:
          packet.representationRevision ?? packet.representation_revision ?? null,
        summary: String(packet.summary ?? '').slice(0, 1200),
        title: String(packet.semanticTitle ?? packet.title ?? packet.semantic?.title ?? '').slice(
          0,
          300
        ),
      }))
    : [];

  const exactPacket =
    packets.find((packet) => packet.sourceRef === sourceRef && packet.packetKey) ?? null;
  const canonicalPacketKey = nes?.packetKey ?? exactPacket?.packetKey ?? null;
  const sourceWorkspaceRevision = exactPacket?.workspaceRevision ?? null;
  const sourceRepresentationRevision = exactPacket?.representationRevision ?? null;
  const retrievalSources = Array.isArray(result?.provenance?.retrievalSources)
    ? result.provenance.retrievalSources.map(String)
    : [];

  const contextChecksum = sha256(
    stableStringify({
      query,
      packets,
      nes,
      retrievalSources,
    })
  );

  return {
    packets,
    nes,
    retrievalSources,
    contextChecksum,
    canonicalPacketKey,
    sourceWorkspaceRevision,
    sourceRepresentationRevision,
  };
}

const REPAIR_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'confidence', 'edits', 'verification'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    edits: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['search', 'replace'],
        properties: {
          search: { type: 'string', minLength: 1, maxLength: 12000 },
          replace: { type: 'string', maxLength: 20000 },
        },
      },
    },
    verification: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
  },
} as const;

async function resolveOrnithTarget() {
  const { resolveLlamaInferenceTarget } = await import('$lib/server/llm/runtime-contract.js');
  return resolveLlamaInferenceTarget(5_000);
}

function compactContextForPrompt(context: RetrievalContext): string {
  const packetText = context.packets
    .map(
      (packet, index) =>
        `${index + 1}. packet=${packet.packetKey ?? 'unproven'} source=${packet.sourceRef ?? 'unknown'}\n` +
        `   ${packet.title ? `${packet.title}\n   ` : ''}${packet.summary || '(no summary)'}`
    )
    .join('\n');

  const nes = context.nes
    ? `featureId=${context.nes.featureId ?? 'none'} clusterId=${context.nes.clusterId ?? 'none'} ` +
      `centroidId=${context.nes.centroidId ?? 'none'} packetKey=${context.nes.packetKey ?? 'none'} ` +
      `lane=${context.nes.lane ?? 'none'} summary=${context.nes.summary ?? 'none'}`
    : 'none';

  return `SearchRuntime packets:\n${packetText || '(none)'}\n\nNES/CHR context:\n${nes}`;
}

async function streamOrnithJson(
  modelTarget: Awaited<ReturnType<typeof resolveOrnithTarget>>,
  messages: Array<{ role: 'system' | 'user'; content: string }>
): Promise<{ text: string; promptHash: string }> {
  const requestBody = {
    model: modelTarget.model,
    messages,
    temperature: 0,
    max_tokens: MAX_ORNITH_TOKENS,
    stream: true,
    cache_prompt: true,
    response_format: {
      type: 'json_object',
      schema: REPAIR_PLAN_SCHEMA,
    },
  };

  const promptHash = sha256(stableStringify(requestBody.messages));

  const response = await fetch(`${modelTarget.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer local',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(ORNITH_TIMEOUT_MS),
  });

  if (!response.ok || !response.body) {
    throw new Error(`ORNITH_HTTP_${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        content += chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? '';
      } catch {
        // Ignore non-JSON SSE comments/metadata. Final JSON validation is strict.
      }
    }

    if (done) break;
  }

  return { text: content.trim(), promptHash };
}

function parseOrnithPlan(raw: string): OrnithRepairPlan {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`ORNITH_PLAN_INVALID_JSON:${sha256(raw)}`);
  }

  if (
    !parsed ||
    typeof parsed.summary !== 'string' ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1 ||
    !Array.isArray(parsed.edits) ||
    parsed.edits.length < 1 ||
    parsed.edits.length > 8 ||
    !Array.isArray(parsed.verification)
  ) {
    throw new Error('ORNITH_PLAN_SCHEMA_REJECTED');
  }

  const edits: RepairEdit[] = parsed.edits.map((edit: any, index: number) => {
    if (
      typeof edit?.search !== 'string' ||
      !edit.search ||
      edit.search.length > 12000 ||
      typeof edit?.replace !== 'string' ||
      edit.replace.length > 20000
    ) {
      throw new Error(`ORNITH_EDIT_SCHEMA_REJECTED:${index}`);
    }
    return { search: edit.search, replace: edit.replace };
  });

  return {
    summary: parsed.summary.slice(0, 600),
    confidence: Number(parsed.confidence),
    edits,
    verification: parsed.verification.map(String).slice(0, 6),
  };
}

async function synthesizeRepairPlan(input: {
  suggestion: Suggestion;
  sourceRef: string;
  sourceRevision: string;
  fileContent: string;
  context: RetrievalContext;
}): Promise<{
  plan: OrnithRepairPlan;
  model: string;
  modelSource: string;
  selectionReceiptChecksum: string;
  promptHash: string;
  outputHash: string;
}> {
  if (input.fileContent.length > MAX_FILE_CHARS) {
    throw new Error(
      `TARGET_TOO_LARGE_FOR_BOUNDED_REPAIR:${input.fileContent.length}:${MAX_FILE_CHARS}`
    );
  }

  const modelTarget = await resolveOrnithTarget();
  const legacyHint = String(input.suggestion.patch ?? '').slice(0, 6000);

  const system = [
    'You are the Phase 79 bounded repair planner for Parent Atlas.',
    'Return only the requested JSON repair plan. Do not include hidden reasoning.',
    'Use minimal exact textual replacements. Each `search` string MUST appear exactly once in the provided file.',
    'Do not rewrite the entire file unless the entire file is genuinely the smallest safe edit.',
    'Treat retrieved packets, NES/CHR metadata, and the legacy patch as evidence/hints, not canonical authority.',
    'Do not create database migrations, Qdrant writes, Valkey writes, or unrelated refactors.',
    'Prefer fixes that preserve existing interfaces and repository ownership boundaries.',
  ].join(' ');

  const user = [
    `Suggestion ID: ${input.suggestion.id}`,
    `Risk: ${input.suggestion.risk_level}`,
    `Error code: ${input.suggestion.error_code ?? 'unknown'}`,
    `Category: ${input.suggestion.category ?? 'unknown'}`,
    `Summary: ${input.suggestion.summary}`,
    `Target sourceRef: ${input.sourceRef}`,
    `Exact preimage sourceRevision (SHA-256 raw bytes): ${input.sourceRevision}`,
    '',
    'Compact Parent Atlas context:',
    compactContextForPrompt(input.context),
    '',
    'Legacy suggestion patch (hint only; may be stale or incomplete):',
    legacyHint || '(none)',
    '',
    'Current target file:',
    '<file>',
    input.fileContent,
    '</file>',
  ].join('\n');

  const { text, promptHash } = await streamOrnithJson(modelTarget, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  const plan = parseOrnithPlan(text);
  return {
    plan,
    model: modelTarget.model,
    modelSource: modelTarget.modelSource,
    selectionReceiptChecksum: modelTarget.selectionReceiptChecksum,
    promptHash,
    outputHash: sha256(text),
  };
}

function applyEditsInMemory(content: string, edits: RepairEdit[]): string {
  let next = content;
  for (const [index, edit] of edits.entries()) {
    const matches = countOccurrences(next, edit.search);
    if (matches !== 1) {
      throw new Error(`EDIT_PREIMAGE_NOT_UNIQUE:${index}:matches=${matches}`);
    }
    next = next.replace(edit.search, edit.replace);
  }
  if (next === content) throw new Error('REPAIR_PLAN_NO_EFFECT');
  return next;
}

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

async function runCommand(
  command: string,
  commandArgs: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFile(command, commandArgs, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    };
  } catch (error: any) {
    return {
      exitCode: Number(error?.code) || 1,
      stdout: String(error?.stdout ?? ''),
      stderr: String(error?.stderr ?? error?.message ?? ''),
    };
  }
}

function parseValidationOutput(
  output: string,
  sourceRef: string,
  exitCode: number
): ValidationSnapshot {
  const summaryMatch = output.match(/found\s+(\d+)\s+errors?/i);
  const errorCount = summaryMatch
    ? Number(summaryMatch[1])
    : (output.match(/\berror\b/gi) ?? []).length;
  const targetForms = [
    sourceRef.toLowerCase(),
    sourceRef.replace(/^sveltekit-frontend\//, '').toLowerCase(),
    path.basename(sourceRef).toLowerCase(),
  ];
  const lower = output.toLowerCase();
  const targetMentions = Math.max(...targetForms.map((form) => countOccurrences(lower, form)));

  return {
    exitCode,
    errorCount,
    targetMentions,
    outputDigest: sha256(output),
    outputPreview: output.slice(-4000),
  };
}

async function runSvelteCheck(sourceRef: string): Promise<ValidationSnapshot> {
  const result = await runCommand(
    NPX,
    ['svelte-check', '--threshold', 'error'],
    APP_ROOT,
    180_000
  );
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return parseValidationOutput(output, sourceRef, result.exitCode);
}

async function runGitDiffCheck(sourceRef: string): Promise<{
  ok: boolean;
  output: string;
}> {
  const result = await runCommand(
    'git',
    ['diff', '--check', '--', sourceRef],
    REPO_ROOT,
    30_000
  );
  return {
    ok: result.exitCode === 0,
    output: `${result.stdout}\n${result.stderr}`.trim().slice(0, 4000),
  };
}

function verificationImproved(before: ValidationSnapshot, after: ValidationSnapshot): boolean {
  if (after.errorCount > before.errorCount) return false;
  if (after.targetMentions > before.targetMentions) return false;
  if (before.errorCount === 0) return after.errorCount === 0;
  return after.errorCount < before.errorCount || after.targetMentions < before.targetMentions;
}

async function persistRepairEpisode(input: {
  sessionId: string;
  suggestion: Suggestion;
  sourceRef: string;
  sourceRevisionBefore: string;
  sourceRevisionAfter: string | null;
  context: RetrievalContext;
  plan: OrnithRepairPlan;
  model: string;
  selectionReceiptChecksum: string;
  promptHash: string;
  proposalChecksum: string;
  status: 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  verificationBefore: ValidationSnapshot | null;
  verificationAfter: ValidationSnapshot | null;
  failureReason?: string | null;
}): Promise<{ persisted: boolean; reason?: string; rowId?: number | string }> {
  if (!input.context.canonicalPacketKey) {
    return { persisted: false, reason: 'CANONICAL_PACKET_KEY_UNPROVEN' };
  }

  const { recordAnalysisPassResult } = await import(
    '$lib/server/analysis/analysis-pass-results.js'
  );

  const result = await recordAnalysisPassResult({
    analysisJobId: input.sessionId,
    evidenceId: input.suggestion.id,
    jobType: 'agentic_repair',
    packetKey: input.context.canonicalPacketKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevisionBefore,
    workspaceRevision: input.context.sourceWorkspaceRevision,
    representationRevision: input.context.sourceRepresentationRevision,
    family: 'agentic_repair',
    passName: 'phase79_agentic_repair',
    passRevision: PHASE79_PASS_REVISION,
    passType: 'tool_execution',
    promptHash: input.promptHash,
    modelName: input.model,
    temperature: 0,
    maxTokens: MAX_ORNITH_TOKENS,
    producerId: 'phase79-agentic-repair',
    producerRevision: PHASE79_PASS_REVISION,
    backend: 'llama.cpp',
    backendVersion: 'openai-chat-completions',
    device: 'external',
    inputHash: input.proposalChecksum,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    payload: {
      suggestionId: input.suggestion.id,
      clusterId: input.suggestion.cluster_id,
      sourceRevisionBefore: input.sourceRevisionBefore,
      sourceRevisionAfter: input.sourceRevisionAfter,
      plan: input.plan,
      failureReason: input.failureReason ?? null,
      verificationBefore: input.verificationBefore,
      verificationAfter: input.verificationAfter,
      directProjectionWrites: {
        qdrant: false,
        valkey: false,
        neo4j: false,
      },
    },
    features: {
      confidence: input.plan.confidence,
      retrievalPacketCount: input.context.packets.length,
      hasNesPacket: Boolean(input.context.nes?.packetKey),
    },
    indexPush: {
      qdrant: false,
      valkey: false,
      neo4j: false,
      note: 'Derived projections are owned by their existing materializers; Phase 79 does not upsert them.',
    },
    evidence: input.context.packets.map((packet) => ({
      packetKey: packet.packetKey,
      sourceRef: packet.sourceRef,
      sourceRevision: packet.sourceRevision,
    })),
    warnings: [
      `ornithSelectionReceipt=${input.selectionReceiptChecksum}`,
      'The recorded workspaceRevision, when present, describes retrieved preimage evidence; applying a source edit invalidates current-workspace closure until the normal source-authority pipeline observes the new bytes.',
    ],
    modelId: input.model,
    modelRevision: null,
  });

  if (!result) return { persisted: false, reason: 'ANALYSIS_PASS_RESULTS_UNAVAILABLE' };
  return { persisted: true, rowId: result.row.id };
}

async function writeAttemptReceipt(receipt: Record<string, unknown>): Promise<string> {
  const safeId = String(receipt.suggestionId ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const receiptPath = path.join(LOGS_DIR, `attempt-${safeId}-${Date.now()}.json`);
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receiptPath;
}

async function processOneSuggestion(
  suggestion: Suggestion,
  embeddingProbe: EmbeddingProbe,
  sessionId: string
): Promise<boolean> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`Phase79 ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}: ${suggestion.summary?.slice(0, 90)}`);
  console.log(`risk=${suggestion.risk_level} code=${suggestion.error_code ?? 'unknown'}`);
  console.log('═'.repeat(72));

  if (String(suggestion.risk_level).toLowerCase() === 'high' && !ALLOW_HIGH_RISK) {
    console.log('SKIP_HIGH_RISK: use --allow-high-risk for planning; apply also needs ATLAS_AUTHORIZE_HIGH_RISK_REPAIR=1.');
    return false;
  }

  const filePath = await resolveFilePath(suggestion);
  if (!filePath) {
    console.log('SOURCE_PATH_UNRESOLVED');
    await writeAttemptReceipt({
      schema: 'atlas.phase79.repair-attempt.v2',
      sessionId,
      suggestionId: suggestion.id,
      status: 'SOURCE_PATH_UNRESOLVED',
      writesPerformed: false,
    });
    return false;
  }

  const sourceRef = toCanonicalSourceRef(filePath);
  const originalBuffer = await fs.readFile(filePath);
  const originalContent = originalBuffer.toString('utf8');
  const sourceRevisionBefore = sha256(originalBuffer);

  console.log(`sourceRef=${sourceRef}`);
  console.log(`sourceRevision=${sourceRevisionBefore}`);

  const context = await retrieveRepairContext(suggestion, sourceRef);
  console.log(
    `context packets=${context.packets.length} NES=${context.nes?.packetKey ?? 'none'} sources=${context.retrievalSources.join(',') || 'none'}`
  );

  const synthesis = await synthesizeRepairPlan({
    suggestion,
    sourceRef,
    sourceRevision: sourceRevisionBefore,
    fileContent: originalContent,
    context,
  });

  const candidateContent = applyEditsInMemory(originalContent, synthesis.plan.edits);
  const sourceRevisionAfterPlanned = sha256(candidateContent);
  const proposalBody = {
    schema: 'atlas.phase79.repair-proposal.v2',
    suggestionId: suggestion.id,
    clusterId: suggestion.cluster_id,
    sourceRef,
    sourceRevisionBefore,
    sourceRevisionAfterPlanned,
    contextChecksum: context.contextChecksum,
    embeddingProbeDigest: embeddingProbe.vectorDigest,
    ornithModel: synthesis.model,
    modelSelectionReceiptChecksum: synthesis.selectionReceiptChecksum,
    promptHash: synthesis.promptHash,
    outputHash: synthesis.outputHash,
    plan: synthesis.plan,
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const proposalChecksum = sha256(stableStringify(proposalBody));

  const proposalReceiptPath = await writeAttemptReceipt({
    ...proposalBody,
    proposalChecksum,
    status: DRY_RUN ? 'PROPOSAL_ONLY' : 'AUTHORIZED_FOR_LOCAL_APPLY',
  });

  console.log(`Ornith=${synthesis.model} confidence=${synthesis.plan.confidence.toFixed(2)}`);
  console.log(`proposalChecksum=${proposalChecksum}`);
  console.log(`receipt=${proposalReceiptPath}`);

  if (DRY_RUN) {
    console.log('DRY_RUN_COMPLETE: no source/database/Qdrant/Valkey/Neo4j writes.');
    return true;
  }

  const currentPreimage = await fs.readFile(filePath);
  const currentPreimageHash = sha256(currentPreimage);
  if (currentPreimageHash !== sourceRevisionBefore) {
    throw new Error(
      `SOURCE_PREIMAGE_DRIFT:${sourceRevisionBefore}:${currentPreimageHash}`
    );
  }

  const validationBefore = await runSvelteCheck(sourceRef);

  let validationAfter: ValidationSnapshot | null = null;
  let sourceRevisionAfter: string | null = null;
  let failureReason: string | null = null;
  let applied = false;

  try {
    await fs.writeFile(filePath, candidateContent, 'utf8');
    sourceRevisionAfter = sha256(await fs.readFile(filePath));

    if (sourceRevisionAfter !== sourceRevisionAfterPlanned) {
      throw new Error(
        `POSTWRITE_HASH_MISMATCH:${sourceRevisionAfterPlanned}:${sourceRevisionAfter}`
      );
    }

    const diffCheck = await runGitDiffCheck(sourceRef);
    if (!diffCheck.ok) {
      throw new Error(`GIT_DIFF_CHECK_FAILED:${diffCheck.output}`);
    }

    validationAfter = await runSvelteCheck(sourceRef);
    if (!verificationImproved(validationBefore, validationAfter)) {
      throw new Error(
        `VERIFICATION_NOT_IMPROVED:before=${validationBefore.errorCount}/${validationBefore.targetMentions}:after=${validationAfter.errorCount}/${validationAfter.targetMentions}`
      );
    }

    await sql`
      UPDATE error_suggestions
      SET applied = true, applied_at = NOW()
      WHERE id = ${suggestion.id}
        AND applied = false
    `;

    applied = true;
    console.log(`APPLY_VERIFIED:${sourceRevisionAfter}`);
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
    await fs.writeFile(filePath, originalBuffer);
    const restoredHash = sha256(await fs.readFile(filePath));
    if (restoredHash !== sourceRevisionBefore) {
      throw new Error(
        `ROLLBACK_PREIMAGE_MISMATCH:${sourceRevisionBefore}:${restoredHash}; original failure=${failureReason}`
      );
    }
    console.log(`APPLY_REVERTED:${failureReason}`);
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;

  let ledgerResult: { persisted: boolean; reason?: string; rowId?: number | string };
  try {
    ledgerResult = await persistRepairEpisode({
      sessionId,
      suggestion,
      sourceRef,
      sourceRevisionBefore,
      sourceRevisionAfter: applied ? sourceRevisionAfter : null,
      context,
      plan: synthesis.plan,
      model: synthesis.model,
      selectionReceiptChecksum: synthesis.selectionReceiptChecksum,
      promptHash: synthesis.promptHash,
      proposalChecksum,
      status: applied ? 'succeeded' : 'failed',
      startedAt,
      completedAt,
      durationMs,
      verificationBefore,
      verificationAfter,
      failureReason,
    });
  } catch (error) {
    ledgerResult = {
      persisted: false,
      reason: `PASS_LEDGER_ERROR:${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const finalReceiptPath = await writeAttemptReceipt({
    schema: 'atlas.phase79.repair-apply-receipt.v2',
    sessionId,
    suggestionId: suggestion.id,
    sourceRef,
    proposalChecksum,
    sourceRevisionBefore,
    sourceRevisionAfter: applied ? sourceRevisionAfter : null,
    applied,
    reverted: !applied,
    validationBefore,
    validationAfter,
    failureReason,
    ledgerResult,
    directProjectionWrites: {
      qdrant: false,
      valkey: false,
      neo4j: false,
    },
    completedAt,
  });

  console.log(`finalReceipt=${finalReceiptPath}`);
  return applied;
}

async function runAgent(): Promise<void> {
  const sessionId = `phase79:${randomUUID()}`;
  console.log('\n' + '═'.repeat(72));
  console.log('Phase 79: Parent Atlas Agentic Repair Loop v2');
  console.log('═'.repeat(72));
  console.log(`mode=${DRY_RUN ? 'DRY_RUN' : 'AUTHORIZED_APPLY'}`);
  console.log(`maxIterations=${MAX_ITERATIONS}`);
  console.log(`sessionId=${sessionId}`);

  const embeddingProbe = await probeEmbeddingGemma();
  console.log(
    `EmbeddingGemma=${embeddingProbe.status} endpoint=${embeddingProbe.endpoint} dim=${embeddingProbe.dimension || 'unknown'}`
  );

  let successCount = 0;
  let failCount = 0;
  let iteration = 0;

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      const suggestions = await fetchPendingSuggestions(1);
      if (suggestions.length === 0) {
        console.log('No eligible pending suggestions.');
        break;
      }

      try {
        const success = await processOneSuggestion(suggestions[0], embeddingProbe, sessionId);
        if (success) successCount += 1;
        else failCount += 1;
      } catch (error) {
        failCount += 1;
        console.error(
          `ITERATION_FAILED:${error instanceof Error ? error.message : String(error)}`
        );
        if (DRY_RUN) break;
      }

      if (DRY_RUN) {
        // A dry-run must not repeatedly select the same still-unapplied row.
        break;
      }
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  const sessionReceipt = {
    schema: 'atlas.phase79.repair-session.v2',
    sessionId,
    completedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'DRY_RUN' : 'AUTHORIZED_APPLY',
    iterations: iteration,
    successCount,
    failCount,
    embeddingProbe,
    modelPolicy: 'ornith-1.5 allowlist via canonical llama-server runtime resolver',
    retrievalPolicy:
      'createProductionSearchRuntime({ readOnly: true }); no direct Qdrant/Valkey/Neo4j mutation',
    persistencePolicy:
      'successful/failed authorized repair episodes use existing analysis_pass_results only when canonical packet identity is proven',
    sourceMutationAuthorized: APPLY && APPLY_AUTHORIZED,
    highRiskAuthorized: ALLOW_HIGH_RISK && HIGH_RISK_AUTHORIZED,
  };

  const sessionPath = path.join(
    LOGS_DIR,
    `session-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
  );
  await fs.writeFile(sessionPath, `${JSON.stringify(sessionReceipt, null, 2)}\n`, 'utf8');

  console.log('\n' + '═'.repeat(72));
  console.log(`success=${successCount} failed=${failCount}`);
  console.log(`sessionReceipt=${sessionPath}`);
}

runAgent().catch(async (error) => {
  console.error('PHASE79_FATAL:', error instanceof Error ? error.message : String(error));
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exitCode = 1;
});
