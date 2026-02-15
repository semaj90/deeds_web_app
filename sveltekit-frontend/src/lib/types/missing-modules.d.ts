/**
 * Type declarations for missing/uninstalled modules.
 * ONLY declare modules that are NOT installed — installed packages ship their own types.
 * Stubs for installed packages (ioredis, qdrant, neo4j, sharp, etc.) were removed
 * because they shadow the real, complete type definitions.
 */

declare module 'simdjson' {
	export function parse(json: string): unknown;
	export function stringify(obj: unknown): string;
}

declare module '@fastify/websocket' {
	const content: unknown;
	export default content;
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

declare module 'nats' {
	export function connect(options?: unknown): Promise<unknown>;
}

declare module '@xenova/transformers' {
	export class pipeline {
		static create(_task: string): Promise<unknown>;
	}
	export class AutoTokenizer {
		static fromPretrained(model: string): Promise<unknown>;
	}
	export class AutoModel {
		static fromPretrained(model: string): Promise<unknown>;
	}
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
