/**
 * Legacy compatibility wrapper for the canonical server JSON parser bridge.
 *
 * Canonical owner:
 *   src/lib/server/gpu/simdjson-bridge.ts
 *
 * This file remains only to avoid breaking older imports while runtime callers
 * migrate to the bridge. It does not own parser backend selection.
 */

import { fastJsonParse, isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge.js';

export interface SIMDParseResult {
	success: boolean;
	data?: any;
	performance?: {
		method: string;
		timeMs: number;
		throughputMBps: number;
	};
	error?: string;
}

export interface SIMDParseOptions {
	useGoService?: boolean;
	fallbackToNative?: boolean;
	timeoutMs?: number;
}

class SIMDJSONParser {
	async parse(jsonString: string, _options: SIMDParseOptions = {}): Promise<SIMDParseResult> {
		try {
			const start = performance.now();
			const data = fastJsonParse(jsonString);
			const end = performance.now();

			return {
				success: true,
				data,
				performance: {
					method: isSimdJsonAvailable() ? 'bridge-fastjsonparse' : 'json.parse',
					timeMs: end - start,
					throughputMBps: ((jsonString.length / Math.max(1, end - start)) * 1000) / (1024 * 1024)
				}
			};
		} catch (error) {
			return {
				success: false,
				error: `JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	parseSync(jsonString: string): SIMDParseResult {
		try {
			const start = performance.now();
			const data = fastJsonParse(jsonString);
			const end = performance.now();

			return {
				success: true,
				data,
				performance: {
					method: isSimdJsonAvailable() ? 'bridge-fastjsonparse-sync' : 'json.parse-sync',
					timeMs: end - start,
					throughputMBps: ((jsonString.length / Math.max(1, end - start)) * 1000) / (1024 * 1024)
				}
			};
		} catch (error) {
			return {
				success: false,
				error: `JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	validate(jsonString: string): { valid: boolean; error?: string } {
		try {
			JSON.parse(jsonString);
			return { valid: true };
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Invalid JSON'
			};
		}
	}

	async benchmark(
		jsonString: string,
		iterations = 100
	): Promise<{
		method: string;
		iterations: number;
		avgTimeMs: number;
		throughputMBps: number;
	}> {
		const results: number[] = [];
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			await this.parse(jsonString, { useGoService: false });
			const end = performance.now();
			results.push(end - start);
		}

		const avgTime = results.reduce((a, b) => a + b, 0) / Math.max(1, results.length);
		const throughput = (jsonString.length * iterations) / ((avgTime * iterations) / 1000) / (1024 * 1024);

		return {
			method: isSimdJsonAvailable() ? 'bridge-benchmark' : 'json.parse-benchmark',
			iterations,
			avgTimeMs: avgTime,
			throughputMBps: throughput
		};
	}

	async checkGoService(): Promise<boolean> {
		return isSimdJsonAvailable();
	}
}

export const simdParser = new SIMDJSONParser();
export default simdParser;

export async function parseLegalDocument(jsonString: string): Promise<SIMDParseResult> {
	return simdParser.parse(jsonString, { useGoService: false, fallbackToNative: true, timeoutMs: 3000 });
}

export async function parseEvidenceData(jsonString: string): Promise<SIMDParseResult> {
	return simdParser.parse(jsonString, { useGoService: false, fallbackToNative: true, timeoutMs: 2000 });
}

export async function parseCaseScoring(jsonString: string): Promise<SIMDParseResult> {
	return simdParser.parse(jsonString, { useGoService: false, fallbackToNative: true, timeoutMs: 1000 });
}
