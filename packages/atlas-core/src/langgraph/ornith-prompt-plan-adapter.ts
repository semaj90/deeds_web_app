import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ORNITH_MODEL_ID = 'ornith-1.5-9b';
export const DEFAULT_ORNITH_CONTEXT_LIMIT_TOKENS = 65_536;
export const DEFAULT_ORNITH_RESERVED_OUTPUT_TOKENS = 8_192;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

const PromptPlanSegmentViewSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  kind: z.enum(['SYSTEM', 'INSTRUCTION', 'EVIDENCE', 'TOOL_SCHEMA', 'USER_QUERY']),
  packetKey: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
  contentChecksum: sha256,
  tokenCount: z.number().int().nonnegative(),
}).strict();

const PromptPlanViewSchema = z.object({
  schema: z.literal('atlas.prompt-plan.v1'),
  requestId: z.string().min(1),
  contextManifestChecksum: sha256,
  tokenizerRevision: z.string().min(1),
  promptTemplateRevision: z.string().min(1),
  instructionRevision: z.string().min(1),
  segments: z.array(PromptPlanSegmentViewSchema).min(1),
  totalTokens: z.number().int().nonnegative(),
  contextLimitTokens: z.number().int().positive(),
  reservedOutputTokens: z.number().int().nonnegative(),
  maxInputTokens: z.number().int().nonnegative(),
  checksumSha256: sha256,
}).strict();

const SegmentContentSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  content: z.string(),
}).strict();

export type OrnithPromptPlanViewV1 = z.infer<typeof PromptPlanViewSchema>;

export interface OrnithPromptPlanAdapterInputV1 {
  /** PromptPlanV1 is built and validated by the existing prefill owner. */
  promptPlan: OrnithPromptPlanViewV1;
  /** Evidence content is ephemeral request input, never persisted by this adapter. */
  segmentContent: Array<z.infer<typeof SegmentContentSchema>>;
  baseUrl: string;
  expectedModel?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OrnithPromptPlanAdapterResultV1 {
  content: string;
  model: string;
  requestId: string;
  contextManifestChecksum: string;
  promptPlanChecksum: string;
  promptTokens: number | null;
  completionTokens: number | null;
  modelCalls: 1;
  datastoreWrites: false;
  canonicalWrites: false;
  hiddenStatePersisted: false;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

function contentChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function lengthPrefixedUtf8(value: string): string {
  const normalized = value.normalize('NFC');
  return `${Buffer.byteLength(normalized, 'utf8')}:${normalized}`;
}

function float64Hex(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError('ORNITH_PROMPT_PLAN_CANONICAL_NUMBER_INVALID');
  const normalized = Object.is(value, -0) ? 0 : value;
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(normalized, 0);
  return buffer.toString('hex');
}

/** Mirrors the existing Atlas canonical-hash-v1 encoding for this adapter boundary. */
function canonicalEncodeV1(value: unknown): string {
  if (value === null) return 'n;';
  if (typeof value === 'boolean') return value ? 'b1;' : 'b0;';
  if (typeof value === 'string') return `s${lengthPrefixedUtf8(value)};`;
  if (typeof value === 'number') return `f${float64Hex(value)};`;
  if (Array.isArray(value)) {
    return `a${value.length}[${value.map((item) => canonicalEncodeV1(item)).join('')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const normalized = new Map<string, unknown>();
    for (const [rawKey, item] of Object.entries(value as Record<string, unknown>)) {
      const key = rawKey.normalize('NFC');
      if (normalized.has(key)) throw new TypeError(`ORNITH_PROMPT_PLAN_CANONICAL_KEY_COLLISION:${key}`);
      normalized.set(key, item);
    }
    const keys = [...normalized.keys()].sort((a, b) => a.localeCompare(b, 'en'));
    return `o${keys.length}{${keys
      .map((key) => `k${lengthPrefixedUtf8(key)};${canonicalEncodeV1(normalized.get(key))}`)
      .join('')}}`;
  }
  throw new TypeError(`ORNITH_PROMPT_PLAN_CANONICAL_TYPE_UNSUPPORTED:${typeof value}`);
}

export function computeOrnithPromptPlanChecksumV1(plan: OrnithPromptPlanViewV1): string {
  const payload = {
    schema: plan.schema,
    requestId: plan.requestId,
    contextManifestChecksum: plan.contextManifestChecksum,
    tokenizerRevision: plan.tokenizerRevision,
    promptTemplateRevision: plan.promptTemplateRevision,
    instructionRevision: plan.instructionRevision,
    segments: plan.segments,
    totalTokens: plan.totalTokens,
    contextLimitTokens: plan.contextLimitTokens,
    reservedOutputTokens: plan.reservedOutputTokens,
    maxInputTokens: plan.maxInputTokens,
  };
  return createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex');
}

function validatePlanAndBuildMessages(
  rawPlan: OrnithPromptPlanViewV1,
  rawContent: Array<z.infer<typeof SegmentContentSchema>>,
): { plan: OrnithPromptPlanViewV1; messages: ChatMessage[] } {
  const plan = PromptPlanViewSchema.parse(rawPlan);
  const content = rawContent.map((entry) => SegmentContentSchema.parse(entry));
  const contentByOrdinal = new Map<number, string>();

  for (const entry of content) {
    if (contentByOrdinal.has(entry.ordinal)) {
      throw new Error(`ORNITH_PROMPT_PLAN_DUPLICATE_CONTENT_ORDINAL:${entry.ordinal}`);
    }
    contentByOrdinal.set(entry.ordinal, entry.content);
  }

  const messages: ChatMessage[] = [];
  let totalTokens = 0;
  for (let index = 0; index < plan.segments.length; index += 1) {
    const segment = plan.segments[index]!;
    if (segment.ordinal !== index) {
      throw new Error(`ORNITH_PROMPT_PLAN_ORDINAL_GAP:${index}`);
    }
    const segmentText = contentByOrdinal.get(segment.ordinal);
    if (segmentText === undefined) {
      throw new Error(`ORNITH_PROMPT_PLAN_MISSING_CONTENT:${segment.ordinal}`);
    }
    if (contentChecksum(segmentText) !== segment.contentChecksum) {
      throw new Error(`ORNITH_PROMPT_PLAN_CONTENT_CHECKSUM_MISMATCH:${segment.ordinal}`);
    }
    totalTokens += segment.tokenCount;
    messages.push({
      role: segment.kind === 'SYSTEM' ? 'system' : 'user',
      content: segmentText,
    });
  }

  if (contentByOrdinal.size !== plan.segments.length) {
    throw new Error('ORNITH_PROMPT_PLAN_CONTENT_SET_MISMATCH');
  }
  if (totalTokens !== plan.totalTokens) {
    throw new Error('ORNITH_PROMPT_PLAN_TOKEN_COUNT_MISMATCH');
  }
  if (plan.reservedOutputTokens + plan.maxInputTokens > plan.contextLimitTokens) {
    throw new Error('ORNITH_PROMPT_PLAN_BUDGET_EXCEEDS_CONTEXT');
  }
  if (plan.totalTokens > plan.maxInputTokens) {
    throw new Error('ORNITH_PROMPT_PLAN_INPUT_EXCEEDS_BUDGET');
  }
  if (computeOrnithPromptPlanChecksumV1(plan) !== plan.checksumSha256) {
    throw new Error('ORNITH_PROMPT_PLAN_CHECKSUM_MISMATCH');
  }

  return { plan, messages };
}

async function resolveExpectedModel(
  baseUrl: string,
  expectedModel: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ORNITH_MODEL_DISCOVERY_FAILED:${response.status}`);
  const body = await response.json() as { data?: unknown };
  const models = Array.isArray(body.data)
    ? body.data.filter((entry): entry is { id: string } =>
      typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string')
    : [];
  if (!models.some((entry) => entry.id === expectedModel)) {
    throw new Error(`ORNITH_MODEL_NOT_LOADED:${expectedModel}`);
  }
  return expectedModel;
}

/**
 * Dispatches an already-compiled PromptPlanV1 to the loaded Ornith model.
 * This is an execution adapter only: it does not retrieve, persist, cache,
 * promote evidence, or serialize LangGraph hidden state.
 */
export async function executeOrnithPromptPlanV1(
  input: OrnithPromptPlanAdapterInputV1,
): Promise<OrnithPromptPlanAdapterResultV1> {
  const { plan, messages } = validatePlanAndBuildMessages(input.promptPlan, input.segmentContent);
  const baseUrl = input.baseUrl.replace(/\/$/, '');
  const expectedModel = input.expectedModel ?? ORNITH_MODEL_ID;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const fetchImpl = input.fetchImpl ?? fetch;
  const model = await resolveExpectedModel(baseUrl, expectedModel, fetchImpl, timeoutMs);

  const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      top_p: 1,
      max_tokens: plan.reservedOutputTokens,
      stream: false,
      cache_prompt: true,
      reasoning_effort: 'none',
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ORNITH_GENERATION_FAILED:${response.status}`);

  const body = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('ORNITH_GENERATION_RESPONSE_INVALID');

  return {
    content,
    model,
    requestId: plan.requestId,
    contextManifestChecksum: plan.contextManifestChecksum,
    promptPlanChecksum: plan.checksumSha256,
    promptTokens: typeof body.usage?.prompt_tokens === 'number' ? body.usage.prompt_tokens : null,
    completionTokens: typeof body.usage?.completion_tokens === 'number' ? body.usage.completion_tokens : null,
    modelCalls: 1,
    datastoreWrites: false,
    canonicalWrites: false,
    hiddenStatePersisted: false,
  };
}

export { PromptPlanViewSchema };
