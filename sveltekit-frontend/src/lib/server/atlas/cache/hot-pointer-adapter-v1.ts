import { z } from 'zod';

export const HOT_POINTER_SCHEMA_V1 = 'atlas.hot-pointer-record.v1' as const;

export const HotPointerRecordV1Schema = z.object({
	schema: z.literal(HOT_POINTER_SCHEMA_V1),
	cacheKey: z.string().min(1),
	artifactId: z.string().min(1),
	artifactRef: z.string().min(1),
	artifactHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	producerRevision: z.string().min(1),
	workspaceRevision: z.string().min(1),
	residency: z.enum(['HOT_VALKEY', 'WARM_LOCAL', 'COLD_STORAGE']),
	ttlSeconds: z.number().int().positive().max(604800), // Max 7 days
	byteSize: z.number().int().nonnegative(),
	createdAt: z.string().datetime(),
	expiresAt: z.string().datetime(),
}).strict();

export type HotPointerRecordV1 = z.infer<typeof HotPointerRecordV1Schema>;

export function buildHotPointerRecordV1(input: {
	cacheKey: string;
	artifactId: string;
	artifactRef: string;
	artifactHash: string;
	producerRevision: string;
	workspaceRevision: string;
	residency?: 'HOT_VALKEY' | 'WARM_LOCAL' | 'COLD_STORAGE';
	ttlSeconds?: number;
	byteSize: number;
	now?: Date;
}): HotPointerRecordV1 {
	const now = input.now ?? new Date();
	const ttl = input.ttlSeconds ?? 86400; // 24 hours default
	const expires = new Date(now.getTime() + ttl * 1000);

	return HotPointerRecordV1Schema.parse({
		schema: HOT_POINTER_SCHEMA_V1,
		cacheKey: input.cacheKey,
		artifactId: input.artifactId,
		artifactRef: input.artifactRef,
		artifactHash: input.artifactHash,
		producerRevision: input.producerRevision,
		workspaceRevision: input.workspaceRevision,
		residency: input.residency ?? 'HOT_VALKEY',
		ttlSeconds: ttl,
		byteSize: input.byteSize,
		createdAt: now.toISOString(),
		expiresAt: expires.toISOString(),
	});
}

export function serializeHotPointerV1(record: HotPointerRecordV1): string {
	const parsed = HotPointerRecordV1Schema.parse(record);
	return JSON.stringify(parsed);
}

export function parseHotPointerV1(raw: string): HotPointerRecordV1 {
	try {
		const json = JSON.parse(raw);
		return HotPointerRecordV1Schema.parse(json);
	} catch (err) {
		throw new Error(`HOT_POINTER_PARSE_ERROR: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export function canReuseHotPointerV1(
	pointer: HotPointerRecordV1 | null | undefined,
	options: {
		expectedArtifactHash: string;
		expectedWorkspaceRevision?: string;
		now?: Date;
	},
): boolean {
	if (!pointer) return false;
	const now = options.now ?? new Date();
	const expiry = new Date(pointer.expiresAt);
	if (expiry.getTime() <= now.getTime()) return false;

	if (pointer.artifactHash !== options.expectedArtifactHash) return false;
	if (options.expectedWorkspaceRevision && pointer.workspaceRevision !== options.expectedWorkspaceRevision) {
		return false;
	}

	return true;
}
