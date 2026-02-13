import type { EventEmitter } from 'events';

declare module 'ioredis' {
	interface Redis extends EventEmitter {
		status: string;
		ping(): Promise<string>;
		get(key: string): Promise<string | null>;
		set(key: string, value: string): Promise<string>;
		setex(key: string, seconds: number, value: string): Promise<string>;
		del(...keys: string[]): Promise<number>;
		flushdb(): Promise<string>;
		info(section?: string): Promise<string>;
		dbsize(): Promise<number>;
		quit(): Promise<string>;
		call(command: string, ...args: (string | number | Buffer)[]): Promise<any>;
	}

	export interface RedisOptions {
		host?: string;
		port?: number;
		password?: string;
		db?: number;
		lazyConnect?: boolean;
		maxRetriesPerRequest?: number;
		enableReadyCheck?: boolean;
		connectTimeout?: number;
		commandTimeout?: number;
		retryStrategy?: (times: number) => number | null;
		reconnectOnError?: (err: Error) => boolean;
		[key: string]: any;
	}
}
