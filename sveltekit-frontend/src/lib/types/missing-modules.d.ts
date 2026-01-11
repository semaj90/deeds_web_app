/** * Type declarations for missing modules and dependencies */ // Common missing modules
declare module 'simdjson' {
 export function parse(json: string): unknown;
 export function stringify(obj: unknown): string;
}
declare module '@fastify/websocket' {
 const content: unknown;
 export default content;
}
declare module 'lokijs' {
 export class Collection<T = unknown> {
 insert(doc: T): T;
 find(query?: unknown): T[];
 findOne(query?: unknown): T | null;
 update(doc: T): void;
 remove(doc: T): void;
 clear(): void;
 }
 export default class Loki {
 constructor(name: string, options?: unknown);
 addCollection<T = unknown>(name: string, options?: unknown): Collection<T>;
 getCollection<T = unknown>(name: string): Collection<T> | null;
 saveDatabase(callback?: () => void): void;
 loadDatabase(options?: unknown, callback?: () => void): void;
 }
}
declare module 'nes.css/css/nes.min.css' {
 const content: string;
 export default content;
}
declare module '@minio/minio' {
 export class Client {
 constructor(config: unknown);
 putObject(bucket: string, name: string, data: unknown, meta?: unknown): Promise<unknown>;
 getObject(bucket: string): Promise<unknown>;
 listObjects(bucket: string, prefix?: string, recursive?: boolean): unknown;
 presignedGetObject(bucket: string, name: string, expires?: number): Promise<string>;
 }
}
declare module 'amqplib' {
 export function connect(url: string): Promise<unknown>;
}
declare module 'nats' {
 export function connect(options?: unknown): Promise<unknown>;
}
declare module '@qdrant/js-client-rest' {
 export class QdrantClient {
 constructor(config?: unknown);
 search(collection: string): Promise<unknown>;
 upsert(collection: string): Promise<unknown>;
 createCollection(collection: string): Promise<unknown>;
 }
}
declare module 'neo4j-driver' {
 export function driver(url: string);
}
declare module '@xenova/transformers' {
 export class pipeline {
 static async create(_task: string): Promise<unknown>;
 }
 export class AutoTokenizer {
 static fromPretrained(model: string): Promise<unknown>;
 }
 export class AutoModel {
 static fromPretrained(model: string): Promise<unknown>;
 }
}
declare module 'sharp' {
 function sharp(input?: unknown): unknown;
 export = sharp;
}
declare module 'tesseract.js' {
 export function createWorker(options?: unknown): Promise<unknown>;
}
declare module 'pdfjs-dist' {
 export function getDocument(src: unknown): Promise<unknown>;
}
declare module '@huggingface/inference' {
 export class HfInference {
 constructor(token?: string);
 textGeneration(params: unknown): Promise<unknown>;
 featureExtraction(params: unknown): Promise<unknown>;
 }
}
declare module 'bullmq' {
 export class RabbitMQQueue {
 constructor(name: string, options?: unknown);
 add(name: string, data: unknown, options?: unknown): Promise<unknown>;
 }
 export class RabbitMQWorker {
 constructor(name: string, processor: unknown, options?: unknown);
 }
}
declare module '@tensorflow/tfjs-node' {
 export * from '@tensorflow/tfjs';
}
declare module 'ioredis' {
 export default class Redis {
 constructor(options?: unknown);
 get(key: string): Promise<string | null>;
 set(key: string, value: string, ...args: unknown[]): Promise<string>;
 del(key: string): Promise<number>;
 exists(key: string): Promise<number>;
 expire(key: string): Promise<number>;
 pipeline(): unknown;
 }
}
declare module 'pg-vector' {
 export function register(pg: unknown): void;
}
declare module '@langchain/*' {
 const anything: unknown;
 export default anything;
}
declare module 'langchain/*' {
 const anything: unknown;
 export default anything;
}
declare module '*.wasm' {
 const content: unknown;
 export default content;
}
declare module '*.wgsl' {
 const content: string;
 export default content;
}
declare module '*.glsl' {
 const content: string;
 export default content;
}
// Global type extensions
declare global {
 interface Window {
 ai?: unknown;
 WebGPU?: unknown;
 __REDIS_CLIENT__?: unknown;
 __VECTOR_CACHE__?: unknown;
 }
}

