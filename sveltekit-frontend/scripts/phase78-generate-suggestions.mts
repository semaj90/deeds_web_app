#!/usr/bin/env npx tsx
/**
 * Phase 78: Parent Atlas Ornith Repair Proposal Producer v2
 *
 * Produces non-canonical repair proposals for Phase 79.
 *
 * Owners reused instead of reimplemented:
 * - SearchRuntime({ readOnly: true }) owns retrieval/context assembly.
 * - The canonical semantic_768 EmbeddingGemma path is reached through SearchRuntime.
 * - resolveLlamaInferenceTarget() owns the loaded Ornith 1.5 model selection.
 * - error_suggestions remains the proposal queue consumed by Phase 79.
 *
 * Deliberately absent:
 * - no Ollama chat path
 * - no Redis/Valkey suggestion cache
 * - no direct Qdrant search/upsert
 * - no MiniLM/Gemini fallback
 * - no source-file mutation
 *
 * Usage:
 *   npx tsx scripts/phase78-generate-suggestions.mts --dry-run
 *   npx tsx scripts/phase78-generate-suggestions.mts --limit=10
 *   npx tsx scripts/phase78-generate-suggestions.mts --verbose
 */

import { createHash } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const LOGS_DIR = path.join(APP_ROOT, 'logs', 'phase78');

loadDotenv({ path: path.join(APP_ROOT, '.env.local') });
loadDotenv({ path: path.join(APP_ROOT, '.env') });
loadDotenv({ path: path.join(REPO_ROOT, '.env') });
process.chdir(APP_ROOT);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required; Phase 78 no longer embeds database credentials.');
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg
  ? Math.max(1, Number.parseInt(limitArg.slice('--limit='.length), 10) || 25)
  : Math.max(1, Number.parseInt(process.env.PHASE78_LIMIT ?? '25', 10) || 25);
const TOP_K = Math.max(1, Number.parseInt(process.env.PHASE78_CONTEXT_TOP_K ?? '6', 10) || 6);
const MAX_SOURCE_CHARS = Math.max(
  2_000,
  Number.parseInt(process.env.PHASE78_MAX_SOURCE_CHARS ?? '60000', 10) || 60_000
);
const MAX_TOKENS = Math.max(
  512,
  Number.parseInt(process.env.PHASE78_MAX_TOKENS ?? '2500', 10) || 2_500
);
const TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.PHASE78_ORNITH_TIMEOUT_MS ?? '90000', 10) || 90_000
);

const sql = postgres(DATABASE_URL, {
  max: 2,
  idle_timeout: 5,
  connect_timeout: 10,
});

await fs.mkdir(LOGS_DIR, { recursive: true });
const JSONL_LOG = path.join(LOGS_DIR, 'ornith-proposals-v2.jsonl');

type RiskLevel = 'low' | 'medium' | 'high';

interface ClusterData {
  clusterId: string;
  routeId: string;
  message: string;
  code: string;
  errorCode: string | null;
  category: string | null;
  rawLogSnippet: string | null;
  filePath: string | null;
  count: number;
}

interface SourceSnapshot {
  filePath: string;
  sourceRef: string;
  sourceRevision: string;
  content: string;
}

interface RetrievalPacket {
  packetKey: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
  workspaceRevision: string | null;
  summary: string;
  title: string;
}

interface RepairEdit {
  search: string;
  replace: string;
}

interface OrnithProposalPlan {
  summary: string;
  riskLevel: RiskLevel;
  confidence: number;
  edits: RepairEdit[];
  rationale: string[];
}

function logVerbose(...values: unknown[]): void {
  if (VERBOSE) console.log(...values);
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

function riskRank(value: RiskLevel): number {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function assessRiskLevel(message: string, code?: string | null): RiskLevel {
  const text = `${message} ${code ?? ''}`.toLowerCase();
  if (
    [
      'runtime error',
      'cannot assign',
      'not assignable',
      'type mismatch',
      'null reference',
      'undefined',
      'breaking change',
      'ts2322',
      'ts2345',
    ].some((pattern) => text.includes(pattern))
  ) {
    return 'high';
  }
  if (
    ['syntax error', 'expected', 'unexpected', 'missing', 'deprecated', 'ts1005'].some((pattern) =>
      text.includes(pattern)
    )
  ) {
    return 'medium';
  }
  return 'low';
}

async function getClustersWithoutSuggestions(): Promise<ClusterData[]> {
  return sql<ClusterData[]>`
    SELECT
      ec.cluster_id AS "clusterId",
      ec.route_id AS "routeId",
      ec.message,
      ec.code,
      ec.error_code AS "errorCode",
      ec.category,
      ec.raw_log_snippet AS "rawLogSnippet",
      ec.file_path AS "filePath",
      ec.count
    FROM error_cluster ec
    WHERE ec.cluster_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM error_suggestions es
        WHERE es.cluster_id = ec.cluster_id
      )
    ORDER BY ec.count DESC, ec.updated_at DESC NULLS LAST
    LIMIT ${LIMIT}
  `;
}

function resolveWithinApp(candidatePath: string): string | null {
  try {
    let absolutePath: string;
    if (path.isAbsolute(candidatePath)) {
      absolutePath = path.resolve(candidatePath);
    } else if (normalizeSlashes(candidatePath).startsWith('sveltekit-frontend/')) {
      absolutePath = path.resolve(REPO_ROOT, candidatePath);
    } else {
      absolutePath = path.resolve(APP_ROOT, candidatePath);
    }

    const prefix = `${APP_ROOT}${path.sep}`.toLowerCase();
    const normalized = absolutePath.toLowerCase();
    if (normalized !== APP_ROOT.toLowerCase() && !normalized.startsWith(prefix)) return null;
    return absolutePath;
  } catch {
    return null;
  }
}

async function resolveSourceSnapshot(cluster: ClusterData): Promise<SourceSnapshot | null> {
  const route = cluster.routeId?.startsWith('/') ? cluster.routeId : `/${cluster.routeId ?? ''}`;
  const candidates = [
    cluster.filePath,
    route && route !== '/' ? `src/routes${route}/+page.svelte` : null,
    route && route !== '/' ? `src/routes${route}/+page.ts` : null,
    route && route !== '/' ? `src/routes${route}/+page.server.ts` : null,
    route && route !== '/' ? `src/routes${route}/+server.ts` : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const filePath = resolveWithinApp(candidate);
    if (!filePath) continue;
    try {
      const bytes = await fs.readFile(filePath);
      const sourceRef = normalizeSlashes(path.relative(REPO_ROOT, filePath));
      const content = bytes.toString('utf8');
      if (content.length > MAX_SOURCE_CHARS) {
        logVerbose(`Skipping oversized source ${sourceRef}: ${content.length} chars`);
        return null;
      }
      return {
        filePath,
        sourceRef,
        sourceRevision: sha256(bytes),
        content,
      };
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

let runtimePromise: Promise<any> | null = null;

async function getReadOnlySearchRuntime(): Promise<any> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const { createProductionSearchRuntime } = await import(
        '$lib/server/retrieval/search-runtime.js'
      );
      return createProductionSearchRuntime({
        userId: 'phase78-proposal-producer',
        readOnly: true,
      });
    })();
  }
  return runtimePromise;
}

async function retrieveContext(
  cluster: ClusterData,
  source: SourceSnapshot
): Promise<{
  packets: RetrievalPacket[];
  retrievalSources: string[];
  contextChecksum: string;
}> {
  const runtime = await getReadOnlySearchRuntime();
  const query = [
    cluster.errorCode,
    cluster.category,
    cluster.code,
    cluster.message,
    source.sourceRef,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 1200);

  const result = await runtime.search({ text: query, topK: TOP_K });
  if (result?.provenance?.readOnly !== true || result?.provenance?.promotionAttempted !== false) {
    throw new Error('SEARCH_RUNTIME_READONLY_CONTRACT_NOT_PROVEN');
  }

  const packets: RetrievalPacket[] = Array.isArray(result?.packets)
    ? result.packets.slice(0, TOP_K).map((packet: any) => ({
        packetKey: packet.packetKey ?? packet.packet_key ?? null,
        sourceRef: packet.sourceRef ?? packet.source_ref ?? null,
        sourceRevision: packet.sourceRevision ?? packet.source_revision ?? null,
        workspaceRevision: packet.workspaceRevision ?? packet.workspace_revision ?? null,
        summary: String(packet.summary ?? '').slice(0, 1200),
        title: String(packet.semanticTitle ?? packet.title ?? packet.semantic?.title ?? '').slice(
          0,
          300
        ),
      }))
    : [];

  const retrievalSources = Array.isArray(result?.provenance?.retrievalSources)
    ? result.provenance.retrievalSources.map(String)
    : [];

  return {
    packets,
    retrievalSources,
    contextChecksum: sha256(stableStringify({ query, packets, retrievalSources })),
  };
}

const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'riskLevel', 'confidence', 'edits', 'rationale'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
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
    rationale: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 400 },
    },
  },
} as const;

async function resolveOrnithTarget() {
  const { resolveLlamaInferenceTarget } = await import('$lib/server/llm/runtime-contract.js');
  return resolveLlamaInferenceTarget(5_000);
}

async function streamOrnithJson(
  modelTarget: Awaited<ReturnType<typeof resolveOrnithTarget>>,
  messages: Array<{ role: 'system' | 'user'; content: string }>
): Promise<{ text: string; promptHash: string }> {
  const request = {
    model: modelTarget.model,
    messages,
    temperature: 0,
    max_tokens: MAX_TOKENS,
    stream: true,
    cache_prompt: true,
    response_format: {
      type: 'json_object',
      schema: PROPOSAL_SCHEMA,
    },
  };

  const response = await fetch(`${modelTarget.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer local',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`ORNITH_HTTP_${response.status}`);

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
        // Ignore SSE comments/metadata; final JSON is validated below.
      }
    }
    if (done) break;
  }

  return {
    text: content.trim(),
    promptHash: sha256(stableStringify(messages)),
  };
}

function parsePlan(raw: string, heuristicRisk: RiskLevel): OrnithProposalPlan {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(`ORNITH_PROPOSAL_INVALID_JSON:${sha256(raw)}`);
  }

  if (
    !parsed ||
    typeof parsed.summary !== 'string' ||
    !['low', 'medium', 'high'].includes(parsed.riskLevel) ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1 ||
    !Array.isArray(parsed.edits) ||
    parsed.edits.length < 1 ||
    parsed.edits.length > 8 ||
    !Array.isArray(parsed.rationale)
  ) {
    throw new Error('ORNITH_PROPOSAL_SCHEMA_REJECTED');
  }

  const edits: RepairEdit[] = parsed.edits.map((edit: any, index: number) => {
    if (
      typeof edit?.search !== 'string' ||
      !edit.search ||
      typeof edit?.replace !== 'string'
    ) {
      throw new Error(`ORNITH_PROPOSAL_EDIT_REJECTED:${index}`);
    }
    if (edit.search.length > 12000 || edit.replace.length > 20000) {
      throw new Error(`ORNITH_PROPOSAL_EDIT_TOO_LARGE:${index}`);
    }
    return { search: edit.search, replace: edit.replace };
  });

  return {
    summary: parsed.summary.slice(0, 600),
    riskLevel: maxRisk(heuristicRisk, parsed.riskLevel as RiskLevel),
    confidence: Number(parsed.confidence),
    edits,
    rationale: parsed.rationale.map(String).slice(0, 6),
  };
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

function validateExactEditPreimages(plan: OrnithProposalPlan, source: SourceSnapshot): void {
  let working = source.content;
  for (const [index, edit] of plan.edits.entries()) {
    const matches = countOccurrences(working, edit.search);
    if (matches !== 1) {
      throw new Error(`PROPOSAL_EDIT_PREIMAGE_NOT_UNIQUE:${index}:matches=${matches}`);
    }
    working = working.replace(edit.search, edit.replace);
  }
  if (working === source.content) throw new Error('PROPOSAL_HAS_NO_EFFECT');
}

function compactRetrievalContext(packets: RetrievalPacket[]): string {
  return packets
    .map(
      (packet, index) =>
        `${index + 1}. packet=${packet.packetKey ?? 'unproven'} source=${packet.sourceRef ?? 'unknown'}\n` +
        `   ${packet.title ? `${packet.title}\n   ` : ''}${packet.summary || '(no summary)'}`
    )
    .join('\n');
}

async function generateProposal(cluster: ClusterData, source: SourceSnapshot) {
  const context = await retrieveContext(cluster, source);
  const modelTarget = await resolveOrnithTarget();
  const heuristicRisk = assessRiskLevel(cluster.message, cluster.errorCode ?? cluster.code);

  const system = [
    'You are Phase 78, the non-canonical repair proposal producer for Parent Atlas.',
    'Return only the requested JSON object. Do not include hidden reasoning.',
    'Each edit.search must be an exact substring that appears exactly once in the supplied current file.',
    'Make the smallest safe edit. Do not rewrite unrelated code.',
    'Retrieved packets are context evidence, not mutation authority.',
    'Do not propose database, Qdrant, Valkey, Neo4j, package-install, or unrelated refactor work.',
    'Phase 79 will independently re-read the source preimage, retrieve context, and re-plan before any authorized apply.',
  ].join(' ');

  const user = [
    `Cluster: ${cluster.clusterId}`,
    `Route: ${cluster.routeId}`,
    `Error code: ${cluster.errorCode ?? cluster.code}`,
    `Category: ${cluster.category ?? 'unknown'}`,
    `Error message: ${cluster.message}`,
    cluster.rawLogSnippet ? `Log snippet: ${cluster.rawLogSnippet.slice(0, 3000)}` : '',
    `Target sourceRef: ${source.sourceRef}`,
    `Exact sourceRevision SHA-256: ${source.sourceRevision}`,
    '',
    'Parent Atlas retrieval context:',
    compactRetrievalContext(context.packets) || '(none)',
    '',
    'Current target source:',
    '<file>',
    source.content,
    '</file>',
  ]
    .filter(Boolean)
    .join('\n');

  const { text, promptHash } = await streamOrnithJson(modelTarget, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  const plan = parsePlan(text, heuristicRisk);
  validateExactEditPreimages(plan, source);

  const proposal = {
    schema: 'atlas.phase78.ornith-repair-proposal.v2',
    clusterId: cluster.clusterId,
    routeId: cluster.routeId,
    sourceRef: source.sourceRef,
    sourceRevision: source.sourceRevision,
    contextChecksum: context.contextChecksum,
    retrievalSources: context.retrievalSources,
    model: modelTarget.model,
    modelSource: modelTarget.modelSource,
    modelSelectionReceiptChecksum: modelTarget.selectionReceiptChecksum,
    promptHash,
    outputHash: sha256(text),
    plan,
    canonicalAuthority: false,
    sourceMutationAuthorized: false,
    writesPerformed: false,
  };

  return {
    summary: plan.summary,
    riskLevel: plan.riskLevel,
    patch: JSON.stringify(proposal),
    proposal,
  };
}

async function generateSuggestions(): Promise<void> {
  console.log('Phase 78: Parent Atlas Ornith Repair Proposal Producer v2');
  console.log(`mode=${DRY_RUN ? 'DRY_RUN' : 'PROPOSAL_QUEUE_WRITE'} limit=${LIMIT}`);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    const clusters = await getClustersWithoutSuggestions();
    console.log(`eligibleClusters=${clusters.length}`);

    for (const [index, cluster] of clusters.entries()) {
      console.log(`\n[${index + 1}/${clusters.length}] cluster=${cluster.clusterId} count=${cluster.count}`);
      const source = await resolveSourceSnapshot(cluster);
      if (!source) {
        console.log('SKIP_SOURCE_UNRESOLVED_OR_TOO_LARGE');
        skippedCount += 1;
        continue;
      }

      console.log(`sourceRef=${source.sourceRef}`);
      console.log(`sourceRevision=${source.sourceRevision}`);

      if (DRY_RUN) {
        console.log('DRY_RUN: proposal would be generated; no model call or datastore write performed.');
        successCount += 1;
        continue;
      }

      try {
        const generated = await generateProposal(cluster, source);
        await sql`
          INSERT INTO error_suggestions (
            route_path,
            cluster_id,
            summary,
            patch,
            risk_level,
            source,
            applied,
            created_at
          ) VALUES (
            ${cluster.routeId},
            ${cluster.clusterId},
            ${generated.summary},
            ${generated.patch},
            ${generated.riskLevel},
            'ornith-phase78-v2',
            false,
            NOW()
          )
        `;

        await fs.appendFile(
          JSONL_LOG,
          `${JSON.stringify({
            observedAt: new Date().toISOString(),
            ...generated.proposal,
            writesPerformed: { errorSuggestions: 1, sourceFiles: 0, qdrant: 0, valkey: 0, neo4j: 0 },
          })}\n`,
          'utf8'
        );

        console.log(`PROPOSAL_QUEUED model=${generated.proposal.model} risk=${generated.riskLevel}`);
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error(`PROPOSAL_FAILED:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  console.log('\nPhase 78 summary');
  console.log(`queuedOrPlanned=${successCount}`);
  console.log(`skipped=${skippedCount}`);
  console.log(`failed=${failedCount}`);
  console.log('next=npx tsx scripts/phase79-agentic-repair.mts --dry-run --limit=1');
}

generateSuggestions().catch(async (error) => {
  console.error('PHASE78_FATAL:', error instanceof Error ? error.message : String(error));
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exitCode = 1;
});
