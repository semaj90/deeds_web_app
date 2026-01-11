/**
 * SIMD-Accelerated JSON Parser for Legal AI
 *
 * Provides high-performance JSON parsing using:
 * 1. Go SIMD service (preferred)
 * 2. Native JSON.parse (fallback)
 * 3. Future: C++ native addon
 */

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
 private goServiceUrl = 'http://localhost:8097/json'; // Existing Go SIMD service

 /**
 * Parse JSON using SIMD acceleration
 */
 async parse(jsonString: string, options: SIMDParseOptions = {}): Promise<SIMDParseResult> {
 const { useGoService = true, fallbackToNative = true, timeoutMs = 5000 } = options;

 if (useGoService) {
 try {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

 const response = await fetch(this.goServiceUrl, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ json: jsonString }),
 signal: controller.signal,
 });

 clearTimeout(timeoutId);

 if (response.ok) {
 const start = performance.now();
 const result = await response.json();
 const end = performance.now();

 return {
 success: true,
 data: result,
 performance: {
 method: 'go-simd-service',
 timeMs: end - start,
 throughputMBps: ((jsonString.length / (end - start)) * 1000) / (1024 * 1024),
 },
 };
 }
 } catch (error) {
 console.warn('Go SIMD service failed, falling back to native parsing:', error);
 }
 }

 // Fallback to native parsing or API endpoint
 if (fallbackToNative) {
 try {
 const start = performance.now();
 const data = JSON.parse(jsonString);
 const end = performance.now();

 return {
 success: true,
 data,
 performance: {
 method: 'native-json-parse',
 timeMs: end - start,
 throughputMBps: ((jsonString.length / (end - start)) * 1000) / (1024 * 1024),
 },
 };
 } catch (error) {
 return {
 success: false,
 error: `JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
 };
 }
 }

 return {
 success: false,
 error: 'No parsing method available',
 };
 }

 /**
 * Parse JSON synchronously (fallback only)
 */
 parseSync(jsonString: string): SIMDParseResult {
 try {
 const start = performance.now();
 const data = JSON.parse(jsonString);
 const end = performance.now();

 return {
 success: true,
 data,
 performance: {
 method: 'native-json-parse-sync',
 timeMs: end - start,
 throughputMBps: ((jsonString.length / (end - start)) * 1000) / (1024 * 1024),
 },
 };
 } catch (error) {
 return {
 success: false,
 error: `JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
 };
 }
 }

 /**
 * Validate JSON string
 */
 validate(jsonString: string): { valid: boolean; error?: string } {
 try {
 JSON.parse(jsonString);
 return { valid: true };
 } catch (error) {
 return {
 valid: false,
 error: error instanceof Error ? error.message : 'Invalid JSON',
 };
 }
 }

 /**
 * Benchmark parsing performance
 */
 async benchmark(
 jsonString: string,
 iterations = 100
 ): Promise<{
 method: string;
 iterations: number;
 avgTimeMs: number;
 throughputMBps: number;
 }> {
 const results = [];

 for (let i = 0; i < iterations; i++) {
 const start = performance.now();
 await this.parse(jsonString, { useGoService: false }); // Use native for benchmark
 const end = performance.now();
 results.push(end - start);
 }

 const avgTime = results.reduce((a, b) => a + b) / results.length;
 const throughput =
 (jsonString.length * iterations) / ((avgTime * iterations) / 1000) / (1024 * 1024);

 return {
 method: 'benchmark-native',
 iterations,
 avgTimeMs: avgTime,
 throughputMBps: throughput,
 };
 }

 /**
 * Check if Go SIMD service is available
 */
 async checkGoService(): Promise<boolean> {
 try {
 const response = await fetch(this.goServiceUrl, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ json: '{}' }),
 signal: AbortSignal.timeout(2000),
 });
 return response.ok;
 } catch {
 return false;
 }
 }
}

// Export singleton instance
export const simdParser = new SIMDJSONParser();
export default simdParser;

// Utility functions for common use cases
export async function parseLegalDocument(jsonString: string): Promise<SIMDParseResult> {
 return simdParser.parse(jsonString, {
 useGoService: true,
 fallbackToNative: true,
 timeoutMs: 3000,
 });
}

export async function parseEvidenceData(jsonString: string): Promise<SIMDParseResult> {
 return simdParser.parse(jsonString, {
 useGoService: true,
 fallbackToNative: true,
 timeoutMs: 2000,
 });
}

export async function parseCaseScoring(jsonString: string): Promise<SIMDParseResult> {
 return simdParser.parse(jsonString, {
 useGoService: true,
 fallbackToNative: true,
 timeoutMs: 1000,
 });
}
