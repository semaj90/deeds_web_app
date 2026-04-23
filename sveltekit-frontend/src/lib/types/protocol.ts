import { z } from 'zod';

export const PROTOCOL_SCHEMA_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	])
);

export const JsonRecordSchema = z.record(z.string(), JsonValueSchema);

export const ProtocolBoundarySchema = z.enum(['json-rpc', 'grpc', 'http', 'sse', 'internal', 'unknown']);

const EnvelopeMetadataSchema = z.object({
	schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION),
	source: z.string().min(1),
	lane: z.string().min(1),
	createdAt: z.string().datetime(),
	validatorTag: z.string().min(1).optional(),
});

export const CacheHitMetadataSchema = z.object({
	layer: z.enum(['redis', 'qdrant', 'postgres', 'none']),
	hit: z.boolean(),
	cacheKey: z.string().min(1).optional(),
	latencyMs: z.number().nonnegative().optional(),
	similarity: z.number().optional(),
	source: z.string().min(1).optional(),
	metadata: JsonRecordSchema.optional(),
});

export const PersistedPayloadEnvelopeSchema = EnvelopeMetadataSchema.extend({
	protocol: ProtocolBoundarySchema,
	ok: z.boolean(),
	error: z.string().optional(),
	payload: JsonValueSchema.optional(),
	cache: CacheHitMetadataSchema.optional(),
	metadata: JsonRecordSchema.optional(),
}).catchall(JsonValueSchema);

export const OllamaMessageSchema = z.object({
	role: z.enum(['system', 'user', 'assistant', 'tool']),
	content: z.string(),
	name: z.string().min(1).optional(),
	toolCallId: z.string().min(1).optional(),
	images: z.array(z.string()).optional(),
});

export const ResearchChunkSchema = z.object({
  id: z.string().min(1),
  chunkId: z.string().optional(),
  content: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
  source: z.string().min(1),
  sourceId: z.string().optional(),
  sourceType: z.string().optional(),
  sourceMetadata: JsonRecordSchema.optional(),
  score: z.number().optional(),
  semanticScore: z.number().optional(),
  lexicalScore: z.number().optional(),
  rerankScore: z.number().optional(),
  tags: z.array(z.string()).optional(),
  clusterId: z.string().optional(),
  clusterType: z.string().optional(),
  gpuCluster: z.number().int().optional(),
  somCluster: z.number().int().optional(),
  bmuRow: z.number().int().optional(),
  bmuCol: z.number().int().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  indexedAt: z.string().datetime().optional(),
  metadata: JsonRecordSchema.optional(),
});

export const ToolCallResponseSchema = EnvelopeMetadataSchema.extend({
  protocol: z.enum(['json-rpc', 'http']),
  toolName: z.string().min(1),
  arguments: JsonRecordSchema.default({}),
  ok: z.boolean(),
  result: JsonValueSchema.optional(),
  error: z.string().optional(),
  cache: CacheHitMetadataSchema.optional(),
  metadata: JsonRecordSchema.optional(),
}).catchall(JsonValueSchema);

export const AceContextEnvelopeSchema = EnvelopeMetadataSchema.extend({
  protocol: ProtocolBoundarySchema.default('internal'),
  query: z.string(),
  messages: z.array(OllamaMessageSchema).default([]),
  chunks: z.array(ResearchChunkSchema).default([]),
  cache: CacheHitMetadataSchema.optional(),
  metadata: JsonRecordSchema.optional(),
}).catchall(JsonValueSchema);

export const SessionEdgePayloadSchema = EnvelopeMetadataSchema.extend({
  protocol: ProtocolBoundarySchema.default('internal'),
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.string().min(1),
  weight: z.number().optional(),
  metadata: JsonRecordSchema.optional(),
}).catchall(JsonValueSchema);

export type ProtocolBoundary = z.infer<typeof ProtocolBoundarySchema>;
export type CacheHitMetadata = z.infer<typeof CacheHitMetadataSchema>;
export type PersistedPayloadEnvelope = z.infer<typeof PersistedPayloadEnvelopeSchema>;
export type PersistedEnvelope<T extends JsonValue = JsonValue> = Omit<
  PersistedPayloadEnvelope,
  'payload' | 'protocol' | 'ok'
> & {
  payload?: T;
  protocol?: ProtocolBoundary;
  ok?: boolean;
  kind?: string;
};
export type OllamaMessage = z.infer<typeof OllamaMessageSchema>;
export type ResearchChunk = z.infer<typeof ResearchChunkSchema>;
export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;
export type AceContextEnvelope = z.infer<typeof AceContextEnvelopeSchema>;
export type SessionEdgePayload = z.infer<typeof SessionEdgePayloadSchema>;

function jsonRecordFromUnknown(value: Record<string, unknown>, seen: WeakSet<object>): JsonRecord {
	const normalized: JsonRecord = {};

	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === 'undefined') {
			continue;
		}
		normalized[key] = jsonValueFromUnknown(entry, seen);
	}

	return normalized;
}

export function jsonValueFromUnknown(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): JsonValue {
	if (value === null) {
		return null;
	}

	switch (typeof value) {
		case 'string':
		case 'boolean':
			return value;
		case 'number':
			return Number.isFinite(value) ? value : String(value);
		case 'bigint':
			return value.toString();
		case 'undefined':
		case 'function':
		case 'symbol':
			return null;
		default:
			break;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack ?? null,
		};
	}

	if (Array.isArray(value)) {
		return value.map((entry) => jsonValueFromUnknown(entry, seen));
	}

	if (typeof value === 'object') {
		if (seen.has(value)) {
			return '[Circular]';
		}

		seen.add(value);
		const normalized = jsonRecordFromUnknown(value as Record<string, unknown>, seen);
		seen.delete(value);
		return normalized;
	}

	return String(value);
}

type PersistedPayloadEnvelopeDefaults = {
	source: string;
	lane: string;
	protocol?: ProtocolBoundary;
	ok?: boolean;
	error?: string;
	payload?: unknown;
	cache?: CacheHitMetadata;
	metadata?: Record<string, unknown>;
	fields?: Record<string, unknown>;
	validatorTag?: string;
	createdAt?: string;
};

export function createPersistedPayloadEnvelope(
	defaults: PersistedPayloadEnvelopeDefaults
): PersistedPayloadEnvelope {
	const normalizedFields = defaults.fields ? jsonRecordFromUnknown(defaults.fields, new WeakSet<object>()) : {};
	const normalizedMetadata = defaults.metadata
		? jsonRecordFromUnknown(defaults.metadata, new WeakSet<object>())
		: undefined;

	return PersistedPayloadEnvelopeSchema.parse({
		...normalizedFields,
		schemaVersion: PROTOCOL_SCHEMA_VERSION,
		source: defaults.source,
		lane: defaults.lane,
		createdAt: defaults.createdAt ?? new Date().toISOString(),
		validatorTag: defaults.validatorTag ?? 'protocol/PersistedPayloadEnvelope@v1',
		protocol: defaults.protocol ?? 'internal',
		ok: defaults.ok ?? true,
		...(typeof defaults.error === 'string' ? { error: defaults.error } : {}),
		...(typeof defaults.payload === 'undefined' ? {} : { payload: jsonValueFromUnknown(defaults.payload) }),
		...(defaults.cache ? { cache: defaults.cache } : {}),
		...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
	});
}

export function coercePersistedPayloadEnvelope(
	value: PersistedPayloadEnvelope | Record<string, unknown> | null | undefined,
	defaults: Omit<PersistedPayloadEnvelopeDefaults, 'fields' | 'payload'>
): PersistedPayloadEnvelope {
	const parsed = PersistedPayloadEnvelopeSchema.safeParse(value);
	if (parsed.success) {
		return parsed.data;
	}

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return createPersistedPayloadEnvelope({
			...defaults,
			fields: value as Record<string, unknown>,
		});
	}

	return createPersistedPayloadEnvelope({
		...defaults,
		payload: value ?? null,
	});
}