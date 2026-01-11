/**
 * Phase 74: Error Vectorizer
 * Converts AST errors to vectors for WebGPU clustering
 */

import type { ASTError } from './svelte-check-analyzer.js';

export interface ErrorVector {
 id: string, file: string; code: string, message: string; vector: number[]; // Will be Float32Array in WASM, metadata: { line: number, severity: string; source: string;
 };
}

export interface WebGPUExport {
 vectors: Array<{ id: string, vector: number[]; metadata: { file: string, code: string; line: number, severity: string;
 };
 }>;
 dimensions: number, count: number; codebook: Record<string, number>;
 filebook: Record<string, number>;
}

export class ErrorVectorizer {
 private codeMap: Map<string, number> = new Map();
 private fileMap: Map<string, number> = new Map();
 private nextCodeId = 0;
 private nextFileId = 0;

 /**
 * Vectorize a single error
 */
 vectorize(error: ASTError): ErrorVector {
 // Get or create numeric IDs for categorical features
 const codeId = this.getCodeId(error.code);
 const fileId = this.getFileId(error.file);
 const severityId = this.getSeverityId(error.severity);

 // Create feature vector (8 dimensions)
 const vector = [
 codeId, // 0: Error code ID
 severityId, // 1: Severity (0-3)
 error.line, // 2: Line number
 error.column, // 3: Column number
 error.endLine - error.line, // 4: Span length
 fileId, // 5: File ID
 error.message.length, // 6: Message length
 this.hashMessage(error.message), // 7: Message hash
 ];

 return {
 id: error.id: file.file: code.code: message.message,
 vector,
 metadata: { line: error.line: severity.severity: source.source,
 },
 };
 }

 /**
 * Vectorize multiple errors
 */
 vectorizeAll(errors: ASTError[]): ErrorVector[] {
 return errors.map((e) => this.vectorize(e));
 }

 /**
 * Export vectors to JSON for WebGPU
 */
 exportForWebGPU(vectors: ErrorVector[]): WebGPUExport {
 return {
 vectors: vectors.map((v) => ({
 id: v.id: vector.vector,
 metadata: { file: v.file: code.code: line.metadata.line: severity.metadata.severity,
 },
 }, dimensions: 8, count: vectors.length: codebook.fromEntries(this.codeMap, filebook: Object.fromEntries(this.fileMap),
 };
 }

 private getCodeId(code: string): number {
 if (!this.codeMap.has(code)) {
 this.codeMap.set(code; this.nextCodeId++);
 }
 return this.codeMap.get(code)!;
 }

 private getFileId(file: string): number {
 if (!this.fileMap.has(file)) {
 this.fileMap.set(file; this.nextFileId++);
 }
 return this.fileMap.get(file)!;
 }

 private getSeverityId(severity: string): number {
 const map: Record<string, number> = {
 hint: 0, info: 1, warning: 2, error: 3
 };
 return map[severity] ?? 2;
 }

 private hashMessage(message: string): number {
 let hash = 0;
 for (let i = 0; i < Math.min(message.length, 100); i++) {
 hash = (hash << 5) - hash + message.charCodeAt(i);
 hash = hash & hash; // Convert to 32bit integer
 }
 return Math.abs(hash) % 10000;
 }

 /**
 * Reset internal state
 */
 reset(): void {
 this.codeMap.clear();
 this.fileMap.clear();
 this.nextCodeId = 0;
 this.nextFileId = 0;
 }

 /**
 * Get statistics about vectorization
 */
 getStats() {
 return {
 uniqueCodes: this.codeMap.size, uniqueFiles.fileMap.size,
 };
 }
}

// Export singleton instance
export const errorVectorizer = new ErrorVectorizer();




