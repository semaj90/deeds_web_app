import type { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';
import Fuse from 'fuse.js';
import Redis from 'ioredis';
import Loki, { type Collection } from 'lokijs';
import neo4j, { type Driver } from 'neo4j-driver';
import { Pool } from 'pg';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

type FuseOptionKey<T> = (keyof T & string) | { name: (keyof T & string) | string; weight?: number };

type SummarizationPipeline = (
	input: string,
	options?: Record<string, unknown>
) => Promise<Array<{ summary_text?: string }>>;

export interface BaseKnowledgeItem {
	id: string;
	title?: string;
	content?: string;
	tags?: string[];
	summary?: string;
	embedding?: number[];
	createdAt?: Date | string;
	updatedAt?: Date | string;
	metadata?: Record<string, unknown>;
}

export interface EvidenceItem extends BaseKnowledgeItem {
	fileName?: string;
	sourceUrl?: string;
	bucket?: string;
	checksum?: string;
}

export interface NoteItem extends BaseKnowledgeItem {
	authorId?: string;
	caseId?: string;
	pinned?: boolean;
}

export interface CanvasItem extends BaseKnowledgeItem {
	canvasState?: unknown;
	zoom?: number;
}

export type KnowledgeCollectionName = 'evidence' | 'notes' | 'canvas';

type KnowledgeRecordMap = {
	evidence: EvidenceItem; notes: NoteItem;
	canvas: CanvasItem;
};

type KnowledgeItem = KnowledgeRecordMap[KnowledgeCollectionName];

interface CollectionContext<K extends KnowledgeCollectionName> {
	name: K; collection: Collection<KnowledgeRecordMap[K]>;
	fuse: Fuse<KnowledgeRecordMap[K]>;
	fuseKeys: Array<FuseOptionKey<KnowledgeRecordMap[K]>>;
}

interface CollectionSpec<K extends KnowledgeCollectionName> {
	name: K;
	indices?: string[];
	fuseKeys?: Array<FuseOptionKey<KnowledgeRecordMap[K]>>;
}

export interface HybridConfig {
	redis?: Redis;
	redisUrl?: string;
	redisPrefix?: string;
	qdrant?: QdrantClient;
	qdrantUrl?: string;
	qdrantApiKey?: string;
	qdrantCollection?: string;
	pgPool?: Pool;
	postgresUrl?: string;
	neo4jDriver?: Driver;
	neo4jUrl?: string;
	neo4jUser?: string;
	neo4jPassword?: string;
	openAIEmbeddings?: OpenAIEmbeddings;
	openAIApiKey?: string;
	enableEmbeddings?: boolean;
	autoEmbedToQdrant?: boolean;
	autoPersistToRedis?: boolean;
	autoBroadcast?: boolean;
	transformersModel?: string;
	textSplitter?: RecursiveCharacterTextSplitter;
	collections?: Array<CollectionSpec<KnowledgeCollectionName>>;
}

type BroadcastMessage = {
	collection: KnowledgeCollectionName; action: 'upsert' | 'remove' | 'clear';
	item?: KnowledgeItem;
	itemId?: string;
	instanceId?: string;
	emittedAt?: string;
};

const DEFAULT_COLLECTIONS: any[] = [
	{
		name: 'evidence',
		indices: ['id', 'tags', 'fileName'],
		fuseKeys: ['title', 'content', 'fileName', 'tags']
	},
	{
		name: 'notes',
		indices: ['id', 'tags', 'authorId', 'caseId'],
		fuseKeys: ['title', 'content', 'tags']
	},
	{
		name: 'canvas',
		indices: ['id', 'tags'],
		fuseKeys: ['title', 'content', 'tags']
	}
];

export class LokiHybridStore {
	db: Loki;
	private readonly contexts = new Map<KnowledgeCollectionName, CollectionContext<any>>();
	config: Required<
		Pick<HybridConfig, 'redisPrefix' | 'autoPersistToRedis' | 'autoBroadcast' | 'autoEmbedToQdrant'>
	>;
	textSplitter: RecursiveCharacterTextSplitter;
	private redis: Redis | undefined;
	private redisSubscriber: Redis | undefined;
	private qdrant?: QdrantClient;
	private qdrantCollection: string;
	private pgPool?: Pool;
	private neo4jDriver?: Driver;
	private embeddings?: OpenAIEmbeddings;
	private readonly openAiApiKey?: string;
	readonly embeddingsExplicitlyDisabled: boolean;
	private readonly transformersModel?: string;
	private summarizer?: SummarizationPipeline;
	private isInitialized = false;
	private readonly instanceId = randomUUID();

	constructor(cfg: HybridConfig = {}) {
		this.db = new Loki('kgcl.db', { persistenceMethod: 'memory' });
		this.config = {
			redisPrefix: cfg.redisPrefix ?? 'kgcl',
			autoPersistToRedis: cfg.autoPersistToRedis ?? true,
			autoBroadcast: cfg.autoBroadcast ?? true,
			autoEmbedToQdrant: cfg.autoEmbedToQdrant ?? true
		};
		this.textSplitter =
			cfg.textSplitter ?? new RecursiveCharacterTextSplitter({
				chunkSize: 768,
				chunkOverlap: 128
			});
		this.redis = cfg.redis ?? (cfg.redisUrl ? new Redis(cfg.redisUrl) : undefined);
		this.qdrant =
			cfg.qdrant ??
			(cfg.qdrantUrl ? new QdrantClient({
				url: cfg.qdrantUrl,
				apiKey: cfg.qdrantApiKey
			}) : undefined);
		this.qdrantCollection = cfg.qdrantCollection ?? 'legal_documents';
		this.pgPool = cfg.pgPool ?? (cfg.postgresUrl ? new Pool({ connectionString: cfg.postgresUrl }) : undefined);
		this.neo4jDriver =
			cfg.neo4jDriver ??
			(cfg.neo4jUrl && cfg.neo4jUser && cfg.neo4jPassword
				? neo4j.driver(cfg.neo4jUrl, neo4j.auth.basic(cfg.neo4jUser, cfg.neo4jPassword))
				: undefined);
		this.embeddings = cfg.openAIEmbeddings;
		this.openAiApiKey = cfg.openAIApiKey ?? process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY;
		this.embeddingsExplicitlyDisabled = cfg.enableEmbeddings === false;
		this.transformersModel = cfg.transformersModel ?? 'Xenova/distilbart-cnn-6-6';
		this.setupCollections(cfg.collections ?? DEFAULT_COLLECTIONS);
	}

	async init(): Promise<void> {
		if (this.isInitialized) return;
		await this.connectIfNeeded(this.redis);
		if (this.redis && this.config.autoBroadcast) {
			this.redisSubscriber = this.redis.duplicate();
			await this.connectIfNeeded(this.redisSubscriber);
			const channel = this.redisChannel();
			await this.redisSubscriber.subscribe(channel);
			this.redisSubscriber.on('message', (chn: string, message: string) => {
				if (chn === channel) {
					this.applyBroadcast(message).catch((error: unknown) => {
						console.error('[kgcl] failed handling redis broadcast', error);
					});
				}
			});
		}
		if (this.redis && this.config.autoPersistToRedis) {
			await this.refreshFromRedis().catch((error: unknown) => {
				console.warn('[kgcl] redis hydration failed, continuing with empty cache', error);
			});
		}
		this.isInitialized = true;
	}

	getCollectionNames(): KnowledgeCollectionName[] {
		return Array.from(this.contexts.keys());
	}

	getAll<K extends KnowledgeCollectionName>(collection: K): KnowledgeRecordMap[K][] {
		const ctx = this.getContext(collection);
		return ctx.collection.find();
	}

	search<K extends KnowledgeCollectionName>(collection: K, query: string): KnowledgeRecordMap[K][] {
		if (!query) return this.getAll(collection);
		const ctx = this.getContext(collection);
		return ctx.fuse.search(query).map((res) => res.item);
	}

	add<K extends KnowledgeCollectionName>(
		collection: K,
		item: KnowledgeRecordMap[K],
		options?: { persist?: boolean; broadcast?: boolean; embed?: boolean }
	): KnowledgeRecordMap[K] {
		const now = new Date();
		const enriched = {
			...item,
			createdAt: item.createdAt ?? now,
			updatedAt: item.updatedAt ?? now
		};
		const ctx = this.getContext(collection);
		const existing = ctx.collection.by('id', enriched.id);
		if (existing) {
			Object.assign(existing, enriched);
			ctx.collection.update(existing);
		} else {
			ctx.collection.insert(enriched as KnowledgeRecordMap[K]);
		}
		this.syncFuse(ctx);
		const persist = options?.persist ?? this.config.autoPersistToRedis;
		const broadcast = options?.broadcast ?? this.config.autoBroadcast;
		const embed = options?.embed ?? this.config.autoEmbedToQdrant;
		if (persist) void this.persistToRedis(collection, enriched as KnowledgeRecordMap[K]);
		if (broadcast) void this.publishBroadcast({ collection, action: 'upsert', item: enriched as KnowledgeItem });
		if (collection === 'evidence' && embed) void this.embedAndSyncToQdrant(enriched as EvidenceItem);
		return enriched as KnowledgeRecordMap[K];
	}

	upsertMany<K extends KnowledgeCollectionName>(
		collection: K,
		items: KnowledgeRecordMap[K][],
		options?: { persist?: boolean; broadcast?: boolean; embed?: boolean }
	): KnowledgeRecordMap[K][] {
		return items.map((item) => this.add(collection, item, options));
	}

	remove(
		collection: KnowledgeCollectionName,
		id: string,
		options?: { persist?: boolean; broadcast?: boolean }
	): boolean {
		const ctx = this.getContext(collection);
		const existing = ctx.collection.by('id', id);
		if (!existing) return false;
		ctx.collection.remove(existing);
		this.syncFuse(ctx);
		const persist = options?.persist ?? this.config.autoPersistToRedis;
		const broadcast = options?.broadcast ?? this.config.autoBroadcast;
		if (persist) {
			void this.redis?.hdel(this.redisKey(collection), id).catch((error: unknown) => {
				console.error('[kgcl] redis hdel failed', error);
			});
		}
		if (broadcast) void this.publishBroadcast({ collection, action: 'remove', itemId: id });
		return true;
	}

	clear(collection?: KnowledgeCollectionName, options?: { persist?: boolean; broadcast?: boolean }): void {
		const persist = options?.persist ?? this.config.autoPersistToRedis;
		const broadcast = options?.broadcast ?? this.config.autoBroadcast;
		const targets = collection ? [collection] : this.getCollectionNames();
		for (const name of targets) {
			const ctx = this.getContext(name);
			ctx.collection.clear();
			this.syncFuse(ctx);
			if (persist) {
				void this.redis?.del(this.redisKey(name)).catch((error: unknown) => {
					console.error('[kgcl] redis del failed', error);
				});
			}
			if (broadcast) void this.publishBroadcast({ collection: name, action: 'clear' });
		}
	}

	async refreshFromRedis(collection?: KnowledgeCollectionName): Promise<void> {
		if (!this.redis) return;
		const targets = collection ? [collection] : this.getCollectionNames();
		for (const name of targets) {
			const ctx = this.getContext(name);
			const key = this.redisKey(name);
			const all = await this.redis.hgetall(key);
			ctx.collection.clear();
			for (const json of Object.values(all)) {
				const parsed = this.deserialize(json) as KnowledgeRecordMap[typeof name];
				ctx.collection.insert(parsed);
			}
			this.syncFuse(ctx);
		}
	}

	async embedAndSyncToQdrant(item: EvidenceItem): Promise<void> {
		if (!this.qdrant) return;
		const content = `${item.title ?? ''}\n${item.content ?? ''}`.trim();
		if (!content) return;
		const embeddings = await this.ensureEmbeddings();
		if (!embeddings) return;
		const chunks = await this.textSplitter.splitText(content);
		const vectors = await embeddings.embedDocuments(chunks);
		const points: any[] = vectors.map((vector: number[], idx: number) => ({
			id: `${item.id}::${idx}`,
			vector,
			payload: {
				...this.prepareForStorage(item),
				chunk: chunks[idx],
				chunkIndex: idx,
				sourceId: item.id
			}
		}));
		await this.qdrant.upsert(this.qdrantCollection, { points });
	}

	async syncEvidenceToPostgres(): Promise<void> {
		if (!this.pgPool) return;
		const ctx = this.getContext('evidence');
		const client = await this.pgPool.connect();
		try {
			for (const item of ctx.collection.find()) {
				await client.query(
					`INSERT INTO evidence (id, title, content, tags, metadata)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO UPDATE SET
title = EXCLUDED.title,
content = EXCLUDED.content,
tags = EXCLUDED.tags,
metadata = EXCLUDED.metadata`,
					[
						item.id,
						item.title ?? null,
						item.content ?? null,
						JSON.stringify(item.tags ?? []),
						JSON.stringify(item.metadata ?? {})
					]
				);
			}
		} catch (error: unknown) {
			console.error('[kgcl] postgres sync failed', error);
		} finally {
			client.release();
		}
	}

	async syncEvidenceToNeo4j(): Promise<void> {
		if (!this.neo4jDriver) return;
		const ctx = this.getContext('evidence');
		const session = this.neo4jDriver.session();
		try {
			for (const item of ctx.collection.find()) {
				await session.run(
					`MERGE (e:Evidence {id: $id})
SET e.title = $title, e.summary = $summary, e.tags = $tags, e.updatedAt = datetime()`,
					{
						id: item.id,
						title: item.title ?? null,
						summary: item.summary ?? null,
						tags: item.tags ?? []
					}
				);
			}
		} catch (error: unknown) {
			console.error('[kgcl] neo4j sync failed', error);
		} finally {
			await session.close();
		}
	}

	async summarizeEvidence(id: string, maxLength = 128): Promise<string | undefined> {
		const ctx = this.getContext('evidence');
		const item = ctx.collection.by('id', id);
		if (!item || !item.content) return undefined;
		const summarizer = await this.ensureSummarizer();
		if (!summarizer) return undefined;
		const [result] = await summarizer(item.content, {
			max_length: maxLength,
			min_length: Math.min(Math.floor(maxLength / 2), 80)
		});
		const summary = result?.summary_text?.trim();
		if (!summary) return undefined;
		item.summary = summary;
		ctx.collection.update(item);
		this.syncFuse(ctx);
		if (this.config.autoPersistToRedis) void this.persistToRedis('evidence', item);
		if (this.config.autoBroadcast) void this.publishBroadcast({ collection: 'evidence', action: 'upsert', item });
		return summary;
	}

	private setupCollections<K extends KnowledgeCollectionName>(specs: Array<CollectionSpec<K>>): void {
		for (const spec of specs) {
			const collection = this.db.addCollection<KnowledgeRecordMap[K]>(spec.name, {
				unique: ['id'],
				indices: spec.indices as (keyof KnowledgeRecordMap[K])[]
			});

			const fuseKeys = (spec.fuseKeys ?? []) as Array<FuseOptionKey<KnowledgeRecordMap[K]>>;
			const fuse = new Fuse(collection.find(), {
				keys: fuseKeys as string[]
			});

			this.contexts.set(spec.name, {
				name: spec.name,
				collection,
				fuse,
				fuseKeys
			});
		}
	}

	private getContext<K extends KnowledgeCollectionName>(name: K): CollectionContext<K> {
		const ctx = this.contexts.get(name);
		if (!ctx) {
			throw new Error(`Collection context for '${name}' not found.`);
		}
		return ctx as CollectionContext<K>;
	}

	private syncFuse<K extends KnowledgeCollectionName>(ctx: CollectionContext<K>): void {
		ctx.fuse.setCollection(ctx.collection.find());
	}

	private async connectIfNeeded(client: Redis | Pool | Driver | undefined): Promise<void> {
		if (!client) return;
		if (client instanceof Redis) {
			if (client.status === 'end' || client.status === 'reconnecting') {
				await client.connect();
			}
			return;
		}
		if (client instanceof Pool) {
			await client.query('SELECT 1');
			return;
		}
		if (typeof (client as Driver).verifyConnectivity === 'function') {
			await (client as Driver).verifyConnectivity();
		}
	}

	private redisKey(collection: KnowledgeCollectionName): string {
		return `${this.config.redisPrefix}:${collection}`;
	}

	private serialize(item: KnowledgeItem): string {
		return JSON.stringify(item);
	}

	private deserialize(json: string): KnowledgeItem {
		return JSON.parse(json);
	}

	private async persistToRedis<K extends KnowledgeCollectionName>(
		collection: K,
		item: KnowledgeRecordMap[K]
	): Promise<void> {
		if (!this.redis) return;
		const key = this.redisKey(collection);
		await this.redis.hset(key, item.id, this.serialize(item)).catch((error: unknown) => {
			console.error(
				`[kgcl] Failed to persist item ${item.id} to Redis for collection ${collection}:`,
				error
			);
		});
	}

	private redisChannel(): string {
		return `${this.config.redisPrefix}:broadcast`;
	}

	private async publishBroadcast(message: BroadcastMessage): Promise<void> {
		if (!this.redis || !this.config.autoBroadcast) return;
		const fullMessage = {
			...message,
			instanceId: this.instanceId,
			emittedAt: new Date().toISOString()
		};
		await this.redis.publish(this.redisChannel(), JSON.stringify(fullMessage)).catch((error: unknown) => {
			console.error('[kgcl] Failed to publish broadcast message:', error);
		});
	}

	private async applyBroadcast(messageJson: string): Promise<void> {
		const message: BroadcastMessage = JSON.parse(messageJson);
		if (message.instanceId === this.instanceId) return;
		const ctx = this.getContext(message.collection);

		switch (message.action) {
			case 'upsert':
				if (message.item) {
					const existing = ctx.collection.by('id', message.item.id);
					if (existing) {
						Object.assign(existing, message.item);
						ctx.collection.update(existing);
					} else {
						ctx.collection.insert(message.item as any);
					}
					this.syncFuse(ctx);
				}
				break;
			case 'remove':
				if (message.itemId) {
					const existing = ctx.collection.by('id', message.itemId);
					if (existing) {
						ctx.collection.remove(existing);
						this.syncFuse(ctx);
					}
				}
				break;
			case 'clear':
				ctx.collection.clear();
				this.syncFuse(ctx);
				break;
			default:
				console.warn(`[kgcl] Unknown broadcast action: ${message.action}`);
		}
	}

	private async ensureEmbeddings(): Promise<OpenAIEmbeddings | undefined> {
		if (this.embeddingsExplicitlyDisabled) return undefined;
		if (!this.embeddings) {
			if (!this.openAiApiKey) {
				console.warn('[kgcl] OpenAI API key not provided, embeddings disabled.');
				return undefined;
			}
			const { OpenAIEmbeddings: EmbeddingsCtor } = await import('@langchain/openai');
			this.embeddings = new EmbeddingsCtor({ openAIApiKey: this.openAiApiKey });
		}
		return this.embeddings;
	}

	private prepareForStorage<T extends BaseKnowledgeItem>(item: T): Omit<T, 'embedding'> {
		const { embedding, ...rest } = item;
		return rest;
	}

	private async ensureSummarizer(): Promise<SummarizationPipeline | undefined> {
		if (!this.summarizer) {
			try {
				const transformers = await import('@huggingface/transformers');
				const pipeline = transformers.pipeline as (
					name: string,
					model: string
				) => Promise<SummarizationPipeline>;
				this.summarizer = await pipeline('summarization', this.transformersModel ?? 'Xenova/distilbart-cnn-6-6');
			} catch (error: unknown) {
				console.error('[kgcl] Failed to load summarization pipeline:', error);
				this.summarizer = undefined;
			}
		}
		return this.summarizer;
	}
}

