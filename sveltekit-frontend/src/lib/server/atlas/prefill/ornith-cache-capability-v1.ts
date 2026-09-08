import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from './canonical-hash-v1.js';

const revision = z.string().min(1);

export const OrnithCacheCapabilityStateV1Schema = z.enum([
  'PROVEN_TRUE',
  'PROVEN_FALSE',
  'UNPROVEN',
]);

export type OrnithCacheCapabilityStateV1 = z.infer<typeof OrnithCacheCapabilityStateV1Schema>;

const capabilitySet = z.object({
  promptCacheSupported: OrnithCacheCapabilityStateV1Schema,
  cacheReuseKvShiftSupported: OrnithCacheCapabilityStateV1Schema,
  recurrentCheckpointSupported: OrnithCacheCapabilityStateV1Schema,
  hostRamPromptCacheSupported: OrnithCacheCapabilityStateV1Schema,
  idleSlotCacheSupported: OrnithCacheCapabilityStateV1Schema,
  slotPersistenceSupported: OrnithCacheCapabilityStateV1Schema,
}).strict();

const observedSettings = z.object({
  cachePrompt: z.boolean().nullable(),
  cacheReuseMinChunk: z.number().int().nonnegative().nullable(),
  checkpointCount: z.number().int().nonnegative().nullable(),
  checkpointMinStep: z.number().int().nonnegative().nullable(),
  cacheRamMiB: z.number().int().nonnegative().nullable(),
  cacheIdleSlots: z.boolean().nullable(),
  slotPersistenceConfigured: z.boolean().nullable(),
}).strict();

/**
 * Runtime capability evidence for the existing llama-server/Ornith prefill
 * owner. This is a report contract only: it does not enable flags, probe a
 * server, persist KV state, or imply that a configured option is proven live.
 */
export const OrnithCacheCapabilityV1Schema = z.object({
  schema: z.literal('atlas.ornith-cache-capability.v1'),
  capabilityRevision: revision,
  runtimeRevision: revision,
  modelRevision: revision,
  modelSha256: sha256HexSchema.nullable(),
  checkedAt: z.string().datetime(),
  probeMode: z.enum(['STATIC_CONFIG', 'LIVE_READ_ONLY', 'UNPROVEN']),
  capabilities: capabilitySet,
  observedSettings,
  evidenceRefs: z.array(z.string().min(1)),
  checksumSha256: sha256HexSchema,
}).strict();

export type OrnithCacheCapabilityV1 = z.infer<typeof OrnithCacheCapabilityV1Schema>;

export type OrnithCacheCapabilityProbeResultV1 =
  | {
      status: 'PROVEN_RUNTIME';
      report: OrnithCacheCapabilityV1;
      resolvedModel: string;
    }
  | {
      status: 'UNAVAILABLE' | 'UNPROVEN';
      report: null;
      reason: string;
    };

export interface ProbeOrnithCacheCapabilityV1Options {
  baseUrl: string;
  configuredModel?: string | null;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  now?: () => string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstRecord(...values: unknown[]): JsonRecord {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(record: JsonRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function booleanValue(record: JsonRecord, keys: readonly string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

async function readJson(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { ok: false, reason: `${url}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) return { ok: false, reason: `${url}: HTTP ${response.status}` };
  try {
    return { ok: true, body: await response.json() };
  } catch (error) {
    return { ok: false, reason: `${url}: invalid JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}

function parseModelId(body: unknown, configuredModel: string | null): string | null {
  const root = asRecord(body);
  const data = root?.data;
  if (!Array.isArray(data)) return null;
  const modelIds = data
    .map((entry) => stringValue(asRecord(entry)?.id))
    .filter((id): id is string => id !== null);
  if (modelIds.length === 0) return null;
  return configuredModel && modelIds.includes(configuredModel) ? configuredModel : modelIds[0] ?? null;
}

function parseBuildRevision(body: unknown): string | null {
  const root = asRecord(body);
  const direct = stringValue(root?.build_info);
  if (direct) return direct;
  const build = asRecord(root?.build_info);
  const nested = stringValue(build?.revision) ?? stringValue(build?.commit) ?? stringValue(build?.version);
  return nested;
}

function parseObservedSettings(body: unknown): z.infer<typeof observedSettings> {
  const root = asRecord(body) ?? {};
  const defaults = asRecord(root.default_generation_settings) ?? {};
  const params = asRecord(defaults.params) ?? {};
  const values = firstRecord(params, defaults, root);
  return {
    cachePrompt: booleanValue(values, ['cache_prompt', 'cachePrompt', 'prompt_cache', 'promptCache']),
    cacheReuseMinChunk: numberValue(values, ['cache_reuse', 'n_cache_reuse', 'cacheReuseMinChunk']),
    checkpointCount: numberValue(values, ['ctx_checkpoints', 'n_ctx_checkpoints', 'checkpoint_count', 'checkpointCount']),
    checkpointMinStep: numberValue(values, ['checkpoint_min_step', 'checkpointMinStep']),
    cacheRamMiB: numberValue(values, ['cache_ram_mib', 'cacheRamMiB', 'cache_ram']),
    cacheIdleSlots: booleanValue(values, ['cache_idle_slots', 'cacheIdleSlots']),
    slotPersistenceConfigured: booleanValue(values, [
      'slot_persistence',
      'slotPersistence',
      'slot_save_restore',
      'slotSaveRestore',
    ]),
  };
}

/**
 * Read-only live metadata probe for llama-server. GET /health, GET /props,
 * and GET /v1/models prove readiness and runtime/model identity only. They do
 * not prove that prompt reuse, checkpoint restore, or slot persistence changes
 * behavior; those remain separate behavioral gates.
 */
export async function probeOrnithCacheCapabilityV1(
  options: ProbeOrnithCacheCapabilityV1Options,
): Promise<OrnithCacheCapabilityProbeResultV1> {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) return { status: 'UNPROVEN', report: null, reason: 'baseUrl is empty' };

  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const health = await readJson(fetcher, endpoint(baseUrl, '/health'), timeoutMs);
  if ('reason' in health) return { status: 'UNAVAILABLE', report: null, reason: health.reason };

  const props = await readJson(fetcher, endpoint(baseUrl, '/props'), timeoutMs);
  if ('reason' in props) return { status: 'UNPROVEN', report: null, reason: props.reason };

  const models = await readJson(fetcher, endpoint(baseUrl, '/v1/models'), timeoutMs);
  if ('reason' in models) return { status: 'UNPROVEN', report: null, reason: models.reason };

  const resolvedModel = parseModelId(models.body, options.configuredModel?.trim() || null);
  const runtimeRevision = parseBuildRevision(props.body);
  if (!resolvedModel) return { status: 'UNPROVEN', report: null, reason: 'GET /v1/models contained no usable model id' };
  if (!runtimeRevision) return { status: 'UNPROVEN', report: null, reason: 'GET /props contained no usable build_info revision' };

  const report = buildOrnithCacheCapabilityV1({
    capabilityRevision: 'ornith-cache-capability:probe-v1',
    runtimeRevision,
    modelRevision: resolvedModel,
    modelSha256: null,
    checkedAt: options.now?.() ?? new Date().toISOString(),
    probeMode: 'LIVE_READ_ONLY',
    capabilities: {
      promptCacheSupported: 'UNPROVEN',
      cacheReuseKvShiftSupported: 'UNPROVEN',
      recurrentCheckpointSupported: 'UNPROVEN',
      hostRamPromptCacheSupported: 'UNPROVEN',
      idleSlotCacheSupported: 'UNPROVEN',
      slotPersistenceSupported: 'UNPROVEN',
    },
    observedSettings: parseObservedSettings(props.body),
    evidenceRefs: [
      endpoint(baseUrl, '/health'),
      endpoint(baseUrl, '/props'),
      endpoint(baseUrl, '/v1/models'),
    ],
  });

  return { status: 'PROVEN_RUNTIME', report, resolvedModel };
}

export function buildOrnithCacheCapabilityV1(
  input: Omit<OrnithCacheCapabilityV1, 'schema' | 'checksumSha256'>,
): OrnithCacheCapabilityV1 {
  const payload = {
    schema: 'atlas.ornith-cache-capability.v1' as const,
    ...input,
  };
  return OrnithCacheCapabilityV1Schema.parse({
    ...payload,
    checksumSha256: canonicalSha256V1(payload),
  });
}
