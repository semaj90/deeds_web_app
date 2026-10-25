import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const registryCardSchema = z.object({
	card_id: z.string().min(1).max(128),
	packet_key: z.string().nullable().optional(),
	feature_id: z.string().nullable().optional(),
	source_ref: z.string().nullable().optional(),
	card_hash: z.string().nullable().optional(),
	som_cluster: z.number().int().nullable().optional(),
	retrieval_temperature: z.string().nullable().optional(),
	tags: z.array(z.string().max(128)).max(97).nullable().optional()
}).passthrough();

const registrySchema = z.object({
	metadata: z.object({
		card_store_size: z.number().optional(),
		mapped_count: z.number().optional(),
		unmapped_count: z.number().optional(),
		duplicate_cards: z.number().optional(),
		temperature_distribution: z.record(z.string(), z.number()).optional()
	}).passthrough().optional(),
	mappings: z.array(registryCardSchema)
}).passthrough();

const requestSchema = z.object({
	schema: z.literal('atlas.neschrom97.upsert-request.v1'),
	items: z.array(z.object({ cardId: z.string().min(1).max(128) }).strict()).min(1).max(100)
}).strict();

export type NesChrom97RegistryCardV1 = z.infer<typeof registryCardSchema>;

export function readNesChrom97RegistryV1(cwd = process.cwd()) {
	const candidates = [
		path.resolve(cwd, '../docs/reports/neschrom97-card-registry.json'),
		path.resolve(cwd, 'docs/reports/neschrom97-card-registry.json')
	];
	const registryPath = candidates.find(existsSync);
	if (!registryPath) return null;
	const raw = readFileSync(registryPath);
	const parsedJson: unknown = JSON.parse(raw.toString('utf8'));
	const parsedRegistry = registrySchema.safeParse(parsedJson);
	if (!parsedRegistry.success) throw new Error('NES_REGISTRY_SCHEMA_INVALID');
	return {
		path: registryPath,
		metadata: parsedRegistry.data.metadata ?? null,
		cards: parsedRegistry.data.mappings,
		registryDigest: `sha256:${createHash('sha256').update(raw).digest('hex')}`
	};
}

export function buildNesChrom97ProposalReceiptV1(input: unknown, registry: ReturnType<typeof readNesChrom97RegistryV1>) {
	if (!registry) return { ok: false as const, status: 'REGISTRY_UNAVAILABLE' as const };
	const parsedRequest = requestSchema.safeParse(input);
	if (!parsedRequest.success) return { ok: false as const, status: 'REQUEST_INVALID' as const };
	const itemIds = parsedRequest.data.items.map((item) => item.cardId);
	if (new Set(itemIds).size !== itemIds.length) return { ok: false as const, status: 'DUPLICATE_CARD_ID' as const };
	const cardById = new Map(registry.cards.map((card) => [card.card_id, card]));
	const cards = itemIds.map((cardId) => cardById.get(cardId));
	if (cards.some((card) => !card)) return { ok: false as const, status: 'REGISTRY_CARD_NOT_FOUND' as const };
	if (Buffer.byteLength(JSON.stringify(cards), 'utf8') > 512 * 1024) return { ok: false as const, status: 'REGISTRY_BATCH_TOO_LARGE' as const };
	const payload = {
		schema: 'atlas.neschrom97.upsert-receipt.v1' as const,
		registryDigest: registry.registryDigest,
		itemCount: cards.length,
		items: cards.map((card) => ({
			cardId: card!.card_id,
			registryRecord: card,
			cardHash: card!.card_hash ?? null,
			packetKey: card!.packet_key ?? null,
			featureId: card!.feature_id ?? null,
			sourceRef: card!.source_ref ?? null,
			somCluster: card!.som_cluster ?? null,
			retrievalTemperature: card!.retrieval_temperature ?? null
		})),
		writePolicy: 'PROPOSAL_ONLY' as const,
		canonicalAuthority: false as const,
		persisted: false as const
	};
	return {
		ok: true as const,
		status: 'PROPOSAL_ONLY_NOT_PERSISTED' as const,
		receipt: {
			...payload,
			status: 'PROPOSAL_ONLY_NOT_PERSISTED' as const,
			payloadSha256: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
		}
	};
}
