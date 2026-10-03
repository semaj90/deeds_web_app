import { z } from 'zod';

const Revision = z.string().trim().min(1).max(256);
const Sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const IsoDateTime = z.iso.datetime({ offset: true });

/** Browser-only, bounded preview output. Never canonical chat or model state. */
export const ClientInferenceCacheEntryV1Schema = z.object({
	schema: z.literal('atlas.client-inference-cache-entry.v1'),
	schemaVersion: z.literal(1),
	cacheKey: Sha256,
	model: z.object({ id: Revision, revision: Revision }).strict(),
	representation: z.object({ id: Revision, revision: Revision }).strict(),
	tokenizer: z.object({ id: Revision, revision: Revision }).strict(),
	inputChecksum: Sha256,
	previewText: z.string().max(8_000),
	previewChecksum: Sha256,
	createdAt: IsoDateTime,
	expiresAt: IsoDateTime,
	canonicalAuthority: z.literal(false),
}).strict().superRefine((entry, ctx) => {
	const createdAt = Date.parse(entry.createdAt);
	const expiresAt = Date.parse(entry.expiresAt);
	if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
		ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be after creation.' });
		return;
	}
	if (expiresAt - createdAt > 24 * 60 * 60 * 1_000) {
		ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Preview cache TTL cannot exceed 24 hours.' });
	}
});

export type ClientInferenceCacheEntryV1 = z.infer<typeof ClientInferenceCacheEntryV1Schema>;

export type ClientInferenceCacheIdentityInputV1 = Pick<
	ClientInferenceCacheEntryV1,
	'model' | 'representation' | 'tokenizer' | 'inputChecksum'
>;

/** Hashes the exact UTF-8 input bytes; normalization belongs to the caller's versioned input policy. */
export async function checksumClientInferenceInputV1(input: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `sha256:${hex}`;
}

/** Binds local preview cache identity to all model-side revisions and the exact input checksum. */
export async function deriveClientInferenceCacheKeyV1(
	identity: ClientInferenceCacheIdentityInputV1,
): Promise<string> {
	const parsed = ClientInferenceCacheCacheIdentitySchema.safeParse(identity);
	if (!parsed.success) throw new TypeError('Invalid client inference cache identity.');
	return checksumClientInferenceInputV1(JSON.stringify([
		'atlas.client-inference-cache-key.v1',
		parsed.data.model.id,
		parsed.data.model.revision,
		parsed.data.representation.id,
		parsed.data.representation.revision,
		parsed.data.tokenizer.id,
		parsed.data.tokenizer.revision,
		parsed.data.inputChecksum,
	]));
}

const ClientInferenceCacheCacheIdentitySchema = z.object({
	model: z.object({ id: Revision, revision: Revision }).strict(),
	representation: z.object({ id: Revision, revision: Revision }).strict(),
	tokenizer: z.object({ id: Revision, revision: Revision }).strict(),
	inputChecksum: Sha256,
}).strict();
