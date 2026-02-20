/**
 * Pattern Storage — stub implementation
 * Stores and retrieves error patterns for the learning pipeline.
 */

import type { ErrorPattern } from './types.js';

export class PatternStorage {
	private patterns = new Map<string, ErrorPattern>();

	async getPattern(id: string): Promise<ErrorPattern | undefined> {
		return this.patterns.get(id);
	}

	async storePattern(pattern: ErrorPattern): Promise<void> {
		this.patterns.set(pattern.id, pattern);
	}

	async getAllPatterns(): Promise<ErrorPattern[]> {
		return [...this.patterns.values()];
	}

	getCount(): number {
		return this.patterns.size;
	}

	clear(): void {
		this.patterns.clear();
	}
}

let instance: PatternStorage | null = null;

export function getPatternStorage(): PatternStorage {
	if (!instance) {
		instance = new PatternStorage();
	}
	return instance;
}
