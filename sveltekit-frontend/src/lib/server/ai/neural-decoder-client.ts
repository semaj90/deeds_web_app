import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';

const CHECKPOINT_REVISION =
  'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259';

const vectorSchema = z.array(z.number().finite());
const baseResponseSchema = z.object({
  schema: z.string(),
  checkpointRevision: z.string(),
  checkpointSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/i).or(z.string().length(64)),
  representationRevision: z.string(),
  batchSize: z.number().int().positive(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
});

const encodeResponseSchema = baseResponseSchema.extend({
  latent_256: z.array(vectorSchema),
  latent_128: z.array(vectorSchema),
  latent_64: z.array(vectorSchema),
});

export type NeuralDecoderEncodeResponse = z.infer<typeof encodeResponseSchema>;

const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const neuralDecoderFeaturePrefillSchema = z.object({
  schema: z.literal('atlas.neural-decoder-feature-prefill.v1'),
  prefillIdentityChecksum: checksumSchema,
  representationId: z.literal('latent_256'),
  representationRevision: z.string(),
  checkpointRevision: z.string(),
  checkpointSha256: z.string(),
  batchSize: z.number().int().positive(),
  latent256Checksum: checksumSchema,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
});

export type NeuralDecoderFeaturePrefillV1 = z.infer<typeof neuralDecoderFeaturePrefillSchema>;

export type NeuralDecoderFeatureCacheRecord = {
  key: string;
  response: NeuralDecoderEncodeResponse;
  envelope: NeuralDecoderFeaturePrefillV1;
};

export type NeuralDecoderFeatureCache = {
  get(key: string): Promise<NeuralDecoderFeatureCacheRecord | null>;
  put(key: string, record: NeuralDecoderFeatureCacheRecord): Promise<void>;
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export type NeuralDecoderClientOptions = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

function baseUrl(options: NeuralDecoderClientOptions): string {
  const value = (options.baseUrl ?? ENV.NEURAL_DECODER_URL ?? '').trim().replace(/\/$/, '');
  if (!value) throw new Error('NEURAL_DECODER_NOT_CONFIGURED');
  return value;
}

function assertDimensions(response: NeuralDecoderEncodeResponse, batchSize: number): void {
  if (response.checkpointRevision !== CHECKPOINT_REVISION) {
    throw new Error(`NEURAL_DECODER_CHECKPOINT_REVISION_MISMATCH:${response.checkpointRevision}`);
  }
  if (response.batchSize !== batchSize || response.latent_256.length !== batchSize) {
    throw new Error('NEURAL_DECODER_BATCH_SIZE_MISMATCH');
  }
  for (const [name, dimension] of [['latent_256', 256], ['latent_128', 128], ['latent_64', 64] as const]) {
    const rows = response[name];
    if (rows.length !== batchSize || rows.some((row) => row.length !== dimension)) {
      throw new Error(`NEURAL_DECODER_DIMENSION_MISMATCH:${name}`);
    }
  }
}

export async function encodeNeuralLatents(
  semantic768: readonly (readonly number[])[],
  options: NeuralDecoderClientOptions = {}
): Promise<NeuralDecoderEncodeResponse> {
  if (semantic768.length === 0 || semantic768.length > 32) {
    throw new Error('NEURAL_DECODER_BATCH_OUT_OF_RANGE');
  }
  if (semantic768.some((row) => row.length !== 768 || row.some((value) => !Number.isFinite(value)))) {
    throw new Error('NEURAL_DECODER_INPUT_INVALID');
  }
  const response = await (options.fetch ?? globalThis.fetch)(`${baseUrl(options)}/v1/neural-decoder/encode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ semantic_768: semantic768 }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  if (!response.ok) throw new Error(`NEURAL_DECODER_HTTP_ERROR:${response.status}`);
  const parsed = encodeResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('NEURAL_DECODER_RESPONSE_INVALID');
  assertDimensions(parsed.data, semantic768.length);
  return parsed.data;
}

/**
 * Binds derived latent features to an existing logical prefill identity.
 * This is an evidence envelope only: it does not represent model KV state,
 * does not write cache storage, and cannot authorize canonical promotion.
 */
export function buildNeuralDecoderFeaturePrefill(
  prefillIdentityChecksum: string,
  response: NeuralDecoderEncodeResponse
): NeuralDecoderFeaturePrefillV1 {
  const identity = checksumSchema.safeParse(prefillIdentityChecksum);
  if (!identity.success) throw new Error('NEURAL_DECODER_PREFILL_IDENTITY_INVALID');
  return neuralDecoderFeaturePrefillSchema.parse({
    schema: 'atlas.neural-decoder-feature-prefill.v1',
    prefillIdentityChecksum,
    representationId: 'latent_256',
    representationRevision: response.representationRevision,
    checkpointRevision: response.checkpointRevision,
    checkpointSha256: response.checkpointSha256,
    batchSize: response.batchSize,
    latent256Checksum: sha256(response.latent_256),
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export async function encodeNeuralLatentsWithFeatureCache(
  semantic768: readonly (readonly number[])[],
  prefillIdentityChecksum: string,
  cache: NeuralDecoderFeatureCache,
  options: NeuralDecoderClientOptions = {}
): Promise<{ status: 'HIT' | 'MISS'; key: string; response: NeuralDecoderEncodeResponse; envelope: NeuralDecoderFeaturePrefillV1 }> {
  const key = `atlas:neural-decoder-feature:v1:${sha256({
    prefillIdentityChecksum,
    checkpointRevision: CHECKPOINT_REVISION,
    semantic768,
  })}`;
  const cached = await cache.get(key);
  if (cached?.key === key) {
    const parsed = encodeResponseSchema.safeParse(cached.response);
    const envelope = neuralDecoderFeaturePrefillSchema.safeParse(cached.envelope);
    if (parsed.success && envelope.success && envelope.data.prefillIdentityChecksum === prefillIdentityChecksum) {
      assertDimensions(parsed.data, semantic768.length);
      return { status: 'HIT', key, response: parsed.data, envelope: envelope.data };
    }
  }
  const response = await encodeNeuralLatents(semantic768, options);
  const envelope = buildNeuralDecoderFeaturePrefill(prefillIdentityChecksum, response);
  await cache.put(key, { key, response, envelope });
  return { status: 'MISS', key, response, envelope };
}

export function neuralDecoderClientInfo(): { configured: boolean; baseUrl?: string; representation: string; canonicalAuthority: false } {
  const configured = Boolean((ENV.NEURAL_DECODER_URL ?? '').trim());
  return {
    configured,
    baseUrl: configured ? ENV.NEURAL_DECODER_URL : undefined,
    representation: 'latent_256',
    canonicalAuthority: false,
  };
}
