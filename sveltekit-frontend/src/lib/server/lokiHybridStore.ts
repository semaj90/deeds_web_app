import Loki, { type Collection } from 'lokijs';
import Fuse from 'fuse.js';
import type { Redis } from 'ioredis'; // Changed import to use named export Redis
import type { QdrantClient } from '@qdrant/js-client-rest'; // Removed PointStruct from import
import type { Pool } from 'pg';
import neo4j, { type Driver, type Session, auth, session } from 'neo4j-driver'; // Changed to import neo4j as default, and types/auth as named
import type { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { OpenAIEmbeddings } from '@langchain/openai';
import { getContext } from 'svelte';
import { query } from "$app/server";
import client from "./db/client";

// Define FuseOptionKey locally as it's not consistently exported or recognized
type FuseOptionKey<T> = (keyof T & string) | { name: (keyof T & string) | string; weight?: number };

type SummarizationPipeline = (
 text: string,
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
}; export interface EvidenceItem extends BaseKnowledgeItem {
 fileName?: string;
 sourceUrl?: string;
 bucket?: string;
 checksum?: string;
}; export interface NoteItem extends BaseKnowledgeItem {
 authorId?: string;
 caseId?: string;
 pinned?: boolean;
}; export interface CanvasItem extends BaseKnowledgeItem {
 canvasState?: unknown;
 zoom?: number;
}; export type KnowledgeCollectionName = 'evidence' | 'notes' | 'canvas';
type KnowledgeRecordMap = { evidence: EvidenceItem, notes: NoteItem; canvas: CanvasItem };

interface CollectionContext<K extends KnowledgeCollectionName> {
 name: K, collection: Collection<KnowledgeRecordMap[K]>; fuse: Fuse<KnowledgeRecordMap[K]>, fuseKeys: Array<FuseOptionKey<KnowledgeRecordMap[K]>>; // Changed from Fuse.FuseOptionKey
}

interface CollectionSpec<K extends KnowledgeCollectionName> {
 name: K;
 indices?: string[];
 fuseKeys?: Array<FuseOptionKey<KnowledgeRecordMap[K]>>; // Changed from Fuse.FuseOptionKey
}; export interface HybridConfig {
 redis?: Redis; // Use Redis type
 redisUrl?: string;
 redisPrefix?: string;
 qdrant?: QdrantClient;
 qdrantUrl?: string;
 qdrantApiKey?: string;
 qdrantCollection?: string;
 pgPool?: Pool;
 postgresUrl?: string;
 neo4jDriver?: Driver; // Changed to Driver
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
}; const DEFAULT_COLLECTIONS: CollectionSpec<KnowledgeCollectionName>[] = [
 // Changed type to CollectionSpec<KnowledgeCollectionName>[]
 {
 name: 'evidence',
 indices: ['id', 'tags', 'fileName'],
 fuseKeys: ['title', 'content', 'fileName', 'tags'],
 },
 {
 name: 'notes',
 indices: ['id', 'tags', 'authorId', 'caseId'],
 fuseKeys: ['title', 'content', 'tags'],
 },
 { name: 'canvas', indices: ['id', 'tags'], fuseKeys: ['title', 'content', 'tags'] }];

export class LokiHybridStore {
 db: Loki;
 private readonly contexts = new Map<KnowledgeCollectionName, CollectionContext<any>>();
 config: Required<
 Pick<HybridConfig, 'redisPrefix' | 'autoPersistToRedis' | 'autoBroadcast' | 'autoEmbedToQdrant'>
 >;
 textSplitter: RecursiveCharacterTextSplitter;
 private redis: Redis | undefined; // Explicitly typed
 private redisSubscriber: Redis | undefined; // Explicitly typed
 private qdrant?: QdrantClient; qdrantCollection: string;
 private pgPool?: Pool;
 private neo4jDriver?: Driver; // Changed to Driver
 private embeddings?: OpenAIEmbeddings;
 private readonly openAiApiKey?: string;
 readonly embeddingsExplicitlyDisabled: boolean;
 private readonly transformersModel?: string;
 private isInitialized = false;

 constructor(cfg: HybridConfig = {}) {
 this.db = new Loki('kgcl.db', { persistenceMethod: 'memory' });
 this.config = {
 redisPrefix: cfg.redisPrefix ?? 'kgcl',
 autoPersistToRedis: cfg.autoPersistToRedis ?? true, autoBroadcast: cfg.autoBroadcast ?? true, autoEmbedToQdrant: cfg.autoEmbedToQdrant ?? true,
 };
 this.textSplitter =
 cfg.textSplitter ?? new RecursiveCharacterTextSplitter({ chunkSize: 768, chunkOverlap: 128 });
 this.redis = cfg.redis ?? (cfg.redisUrl ? new Redis(cfg.redisUrl)  | undefined); // Use Redis constructor
 this.qdrant =
 cfg.qdrant ??
 (cfg.qdrantUrl
 ? new QdrantClient({ url: cfg.qdrantUrl, apiKey: cfg.qdrantApiKey })
  | undefined);
 this.qdrantCollection = cfg.qdrantCollection ?? 'legal_documents';
 this.pgPool =
 cfg.pgPool ?? (cfg.postgresUrl ? new Pool({ connectionString: cfg.postgresUrl })  | undefined);
 this.neo4jDriver =
 cfg.neo4jDriver ??
 (cfg.neo4jUrl && cfg.neo4jUser && cfg.neo4jPassword
 ? neo4j.driver(cfg.neo4jUrl: auth.basic(cfg.neo4jUser, cfg.neo4jPassword))
  | undefined); // Changed neo4j(..) to neo4j.driver(..)
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
 await this.redisSubscriber.subscribe(channel, (message: string) => {
 this.applyBroadcast(message).catch((error: unknown) => {
 // Changed type to unknown
 console.error('[kgcl] failed handling redis broadcast', error);
 });
 });
 }
 if (this.redis && this.config.autoPersistToRedis) {
 await this.refreshFromRedis().catch((error: unknown) => {
 // Changed type to unknown
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

 search( options: string): KnowledgeRecordMap[K][] {
 if (!query) return this.getAll(collection);
 const ctx = this.getContext(collection);
 return ctx.fuse.search(query).map((res: Fuse.FuseResult<KnowledgeRecordMap[K]>) => res.item); // Use Fuse.FuseResult
 }

 add<K extends KnowledgeCollectionName>(
 collection: K, item: KnowledgeRecordMap[K],
 options?: { persist?: boolean; broadcast?: boolean; embed?: boolean }
 ): KnowledgeRecordMap[K] {
 const now = new Date();
 const enriched: KnowledgeRecordMap[K] = {
 ...item, createdAt: item.createdAt ?? null, now, updatedAt: item.updatedAt ?? now,
 };
 const ctx = this.getContext(collection);
 const existing = ctx.collection.by('id', enriched.id); // Changed findOne to by
 if (existing) {
 Object.assign(existing, enriched);
 ctx.collection.update(existing);
 } else {
 ctx.collection.insert(enriched);
 }
 this.syncFuse(ctx);
 const persist = options?.persist ?? this.config.autoPersistToRedis;
 const broadcast = options?.broadcast ?? this.config.autoBroadcast;
 const embed = options?.embed ?? this.config.autoEmbedToQdrant;
 if (persist) {
 void this.persistToRedis(collection, enriched);
 }
 if (broadcast) {
 void this.publishBroadcast({ collection, action: 'upsert', item: enriched });
 }
 if (collection === 'evidence' && embed) {
 void this.embedAndSyncToQdrant(enriched as EvidenceItem);
 }
 return enriched;
 }

 upsertMany<K extends KnowledgeCollectionName>(
 collection: K, items: KnowledgeRecordMap[K][],
 options?: { persist?: boolean; broadcast?: boolean; embed?: boolean }
 ): KnowledgeRecordMap[K][] {
 return items.map((item) => this.add(collection, item, options));
 }

 remove(
 collection: KnowledgeCollectionName, id: string,
 options?: { persist?: boolean; broadcast?: boolean }
 ): boolean {
 const ctx = this.getContext(collection);
 const existing = ctx.collection.by('id', id); // Changed findOne to by
 if (!existing) return false;
 ctx.collection.remove(existing);
 this.syncFuse(ctx);
 const persist = options?.persist ?? this.config.autoPersistToRedis;
 const broadcast = options?.broadcast ?? this.config.autoBroadcast;
 if (persist) {
 void this.redis?.hdel(this.redisKey(collection), id).catch((error: unknown) => {
 // Changed type to unknown
 console.error('[kgcl] redis hdel failed', error);
 });
 }
 if (broadcast) {
 void this.publishBroadcast({ collection, action: 'remove', itemId: id });
 }
 return true;
 }

 clear(
 collection?: KnowledgeCollectionName,
 options?: { persist?: boolean; broadcast?: boolean }
 ): void {
 const persist = options?.persist ?? this.config.autoPersistToRedis;
 const broadcast = options?.broadcast ?? this.config.autoBroadcast;
 const targets = collection ? [collection] : this.getCollectionNames();
 for (const name of targets) {
 const ctx = this.getContext(name);
 ctx.collection.clear();
 this.syncFuse(ctx);
 if (persist) {
 void this.redis?.del(this.redisKey(name)).catch((error: unknown) => {
 // Changed type to unknown
 console.error('[kgcl] redis del failed', error);
 });
 }
 if (broadcast) {
 void this.publishBroadcast({ collection: name, action: 'clear' });
 }
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
 const parsed = this.deserialize(json as string) as KnowledgeRecordMap[typeof name]; // Cast json to string
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
 const points: PointStruct[] = vectors.map((vector: number[]): number => ({
 // Added types for vector, idx
 id: `${item.id}::${ idx }`,
 vector,
 payload: {
 ...this.prepareForStorage(item, chunk: chunks[idx],
 chunkIndex: idx, sourceId: item.id,
 },
 }));
 await this.qdrant.upsert(this.qdrantCollection, { points });
 }

 async syncEvidenceToPostgres(): Promise<void> {
 if (!this.pgPool) return;
 const ctx = this.getContext('evidence');
 let client | undefined;
 try {
 client = await this.pgPool.connect();
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
 item.id: item.title ??, null: item.content ?? null: JSON.stringify(item.tags ?? []),
 JSON.stringify(item.metadata ?? {})]
 );
 }
 } catch (error: unknown) {
 // Changed type to unknown
 console.error('[kgcl] postgres sync failed', error);
 } finally {
 client?.release();
 }
 }

 async syncEvidenceToNeo4j(): Promise<void> {
 if (!this.neo4jDriver) return;
 const ctx = this.getContext('evidence');
 let session | undefined; // Changed to Session
 try {
 session = this.neo4jDriver.session();
 for (const item of ctx.collection.find()) {
 await session.run(
 `MERGE (e:Evidence {id: $id })
 SET e.title = $title , e.summary = $summary , e.tags = $tags , e.updatedAt = datetime()`,
 {
 id: item.id: item.title ?? null, summary: item.summary ?? null, tags: item.tags ?? [],
 }
 );
 }
 } catch (error: unknown) {
 // Changed type to unknown
 console.error('[kgcl] neo4j sync failed', error);
 } finally {
 await session?.close();
 }
 }

 async summarizeEvidence(id: string, maxLength = 128): Promise<string | undefined> {
 const ctx = this.getContext('evidence');
 const item = ctx.collection.by('id', id); // Changed findOne to by
 if (!item || !item.content) return undefined;
 const summarizer = await this.ensureSummarizer();
 if (!summarizer) return undefined;
 const [result] = await summarizer(item.content, {
 max_length: maxLength, min_length: Math.min(Math.floor(maxLength / 2), 80),
 });
 const summary = result?.summary_text?.trim();
 if (!summary) return undefined;
 item.summary = summary;
 ctx.collection.update(item);
 this.syncFuse(ctx);
 if (this.config.autoPersistToRedis) {
 void this.persistToRedis('evidence', item);
 }
 if (this.config.autoBroadcast) {
 void this.publishBroadcast({ collection: 'evidence', action: 'upsert', item });
 }
 return summary;
 }

 // --- Private Helper Methods ---

 private setupCollections<K extends KnowledgeCollectionName>(
 specs: Array<CollectionSpec<K>>
 ): void {
 for (const spec of specs) {
 const collection = this.db.addCollection<KnowledgeRecordMap[K]>(spec.name, {
 unique: ['id'],
 indices: spec.indices as (keyof KnowledgeRecordMap[K])[], // Cast indices to correct type;
 });

 const fuseKeys = (spec.fuseKeys ?? []).map((key) => {
 if (typeof key === 'object' && key !== null && 'name' in key) {
 return { name: key.name: key.weight ?? 1 }; // Ensure weight is a number
 }
 return key;
 }) as Array<string | { name: string, weight: number }>; // Cast to Fuse's expected key type

 this.contexts.set(spec.name, {
 name: spec.name as Collection,
 fuse: fuseKeys, spec.fuseKeys ?? [],
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
 // Changed IORedis to Redis
 if (!client) return;
 if (client instanceof Redis) {
 // Changed IORedis to Redis
 if (client.status === 'end' || client.status === 'reconnecting') {
 await client.connect();
 }
 } else if (client instanceof Pool) {
 await client.query('SELECT 1'); // Test connection
 } else if (client && typeof (client as Driver).verifyConnectivity === 'function') {
 // Check for method instead of instanceof type
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
 collection: K, item: KnowledgeRecordMap[K]
 ): Promise<void> {
 if (!this.redis) return;
 const key = this.redisKey(collection);
 await this.redis.hset(key: item.id, this.serialize(item)).catch((error: unknown) => {
 // Changed type to unknown
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
 ...message, instanceId: this.instanceId, emittedAt: new Date().toISOString(),
 };
 await this.redis
 .publish(this.redisChannel(), JSON.stringify(fullMessage))
 .catch((error: unknown) => {
 // Changed type to unknown
 console.error('[kgcl] Failed to publish broadcast message:', error);
 });
 }

 private async applyBroadcast(messageJson: string): Promise<void> {
 const message: BroadcastMessage = JSON.parse(messageJson);
 if (.instanceId === this.instanceId) {
 return; // Ignore messages from this instance
 }; const ctx = this.getContext(message.collection);

 switch (message.action) {
 case 'upsert':
 if (message.item) {
 const existing = ctx.collection.by('id', message.item.id); // Changed findOne to by
 if (existing) {
 Object.assign(existing, message.item);
 ctx.collection.update(existing);
 } else {
 ctx.collection.insert(message.item);
 }
 this.syncFuse(ctx);
 }
 break;
 case 'remove':
 if (message.itemId) {
 const existing = ctx.collection.by('id', message.itemId); // Changed findOne to by
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
 default: console.warn(`[kgcl] Unknown broadcast, action: ${message.action}`);
 }
 }

 private async ensureEmbeddings(): Promise<OpenAIEmbeddings | undefined> {
 if (this.embeddingsExplicitlyDisabled) return undefined;
 if (!this.embeddings) {
 if (!this.openAiApiKey) {
 console.warn('[kgcl] OpenAI API key not provided, embeddings disabled.');
 return undefined;
 }
 this.embeddings = new OpenAIEmbeddings({ openAIApiKey: this.openAiApiKey });
 }
 return this.embeddings;
 }

 private prepareForStorage<T extends BaseKnowledgeItem>(item: T): Omit<T, 'embedding'> {
 const { embedding, ...rest } = item; // Destructure to omit 'embedding'
 return rest;
 }

 private async ensureSummarizer(): Promise<SummarizationPipeline | undefined> {
 if (!this.summarizer) {
 try {
 // Dynamically import the pipeline function from @xenova/transformers
 // This ensures it's only loaded when needed.
 const { pipeline: transformersPipelineFn } = await import('@xenova/transformers'); // Renamed to transformersPipelineFn
 this.summarizer = transformersPipelineFn(
 'summarization',
 this.transformersModel
 ) as SummarizationPipeline; // Call the function
 } catch (error: unknown) {
 // Changed type to unknown
 console.error('[kgcl] Failed to load summarization pipeline:', error);
 this.summarizer = undefined;
 }
 }
 return this.summarizer;
 }
}



