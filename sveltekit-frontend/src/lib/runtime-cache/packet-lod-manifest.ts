import { z } from 'zod';

export const packetLodManifestSchema = z.object({
	packet_key: z.string().min(1),
	source_ref: z.string().min(1),
	feature_id: z.string().min(1).optional().nullable(),
	domain_class: z.string().min(1).optional().nullable(),
	som_cell: z.string().regex(/^\d{1,2}:\d{1,2}$/).optional().nullable(),
	community_id: z.string().min(1).optional().nullable(),
	qdrant_point_id: z.string().min(1).optional().nullable(),
	summary_hash: z.string().min(8).optional().nullable(),
	msgpack_ref: z.string().min(1).optional().nullable(),
	lod_level: z.number().int().min(0).max(4).default(0),
	cache_key: z.string().min(1),
	updated_at: z.string().datetime(),
});

export type PacketLodManifest = z.infer<typeof packetLodManifestSchema>;

export function buildPacketLodCacheKey(input: Pick<PacketLodManifest, 'packet_key' | 'lod_level'>): string {
	return `sw:lod:packet:${input.packet_key}:level:${input.lod_level}`;
}

export function parsePacketLodManifest(value: unknown): PacketLodManifest {
	return packetLodManifestSchema.parse(value);
}

