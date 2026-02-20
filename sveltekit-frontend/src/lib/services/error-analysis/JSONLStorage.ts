/**
 * JSONL Storage — stub implementation
 * Provides in-memory buffered storage with async iteration.
 * Replace with file-backed implementation when persistence is needed.
 */

import type { JSONLRecord, Experience } from './types.js';

export interface JSONLStorageConfig {
	baseDir: string;
}

export class JSONLStorage {
	private buffer: JSONLRecord[] = [];

	constructor(_config?: JSONLStorageConfig) {}

	async writeExperience(experience: Experience): Promise<void> {
		this.buffer.push({
			type: 'experience',
			data: experience,
			timestamp: new Date().toISOString(),
			version: '1.0'
		});
	}

	async bufferRecord(record: JSONLRecord): Promise<void> {
		this.buffer.push(record);
	}

	async *readAll(): AsyncGenerator<JSONLRecord> {
		for (const record of this.buffer) {
			yield record;
		}
	}

	getBufferSize(): number {
		return this.buffer.length;
	}

	clear(): void {
		this.buffer = [];
	}
}

let instance: JSONLStorage | null = null;

export function getJSONLStorage(config?: JSONLStorageConfig): JSONLStorage {
	if (!instance) {
		instance = new JSONLStorage(config);
	}
	return instance;
}
