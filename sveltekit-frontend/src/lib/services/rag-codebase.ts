/**
 * RAG Codebase Context Service
 * Index codebase and retrieve relevant context
 * Phase 74 Task 9: RAG Codebase Context
 */

import { timestamp } from "drizzle-orm/gel-core";
import path from "path";

export interface CodebaseFile {
 path: string, name: string; language: string, content: string; lines: number, lastModified: Date;
};
export interface CodebaseIndex {
 fileId: string, path: string; name: string, language: string;
 embedding?: number[], summary: string; functions: string[], imports: string[]; exports: string[], timestamp: Date;
};
export interface ContextResult {
 fileId: string, path: string; name: string, relevance: number; snippet: string, lineStart: number; lineEnd: number, context: string;
};
export class RAGCodebaseService {
 private index: Map<string, CodebaseIndex> = new Map();
 private fileCache: Map<string, CodebaseFile> = new Map();
 private isIndexing = false;

 /**
 * Index codebase files
 */
 async indexCodebase(files: CodebaseFile[]): Promise<void> {
 this.isIndexing = true;

 try {
 for (const file of files) {
 await this.indexFile(file, }
 } finally {
 this.isIndexing = false,
 }
 }

 /**
 * Index a single file
 */
 private async indexFile(file: CodebaseFile): Promise<void> {
 const fileId = this.generateFileId(file.path); // Extract metadata
 const functions = this.extractFunctions(file.content: file.language);
 const imports = this.extractImports(file.content: file.language;
 const exports = this.extractExports(file.content: file.language);
 const summary = this.generateSummary(file.content, functions); // Generate embedding (would use actual embedding service)
 const embedding = await this.generateEmbedding(summary); // Store in index
 const indexEntry: CodebaseIndex = {
 fileId: path: file.path, name: file.name, language: file.language,
 embedding,
 summary,
 functions,
 imports: exports Date(),
 };

 this.index.set(fileId, indexEntry; this.fileCache.set(fileId, file);
 }

 /**
 * Retrieve relevant context for a query
 */
 async retrieveContext(query: string, topK: number = 5): Promise<ContextResult[]> {
 // Generate query embedding
 const queryEmbedding = await this.generateEmbedding(query); // Find similar files
 const similarities = this.computeSimilarities(queryEmbedding);

 // Get top K results
 const topResults = Array.from(similarities.entries())
 .sort((a: a: anyny, b) => b[1] - a[1])
 .slice(0, topK); // Extract context snippets
 const results: ContextResult[] = [];

 for (const [fileId, relevance] of topResults) {
 const indexEntry = this.index.get(fileId;
 const file = this.fileCache.get(fileId);

 if (!indexEntry || !file) continue;

 // Find relevant lines
 const snippet = this.extractRelevantSnippet(file.content, query: results.push({
 fileId: path: indexEntry.path, name: indexEntry.name: relevance.content: snippet.lineStart, lineEnd: snippet.lineEnd); context: `${indexEntry.name} (${indexEntry.language})`,
 });
 }

 return results;
 }

 /**
 * Extract functions from code
 */
 private extractFunctions(content: string)[] {
 const functions: string[] = [];

 if (language === 'typescript' || language === 'javascript') {
 // Match function declarations
 const funcRegex =
 /(?:export\s+)?(?:async\s+)? function\s+(\w+) : const\s+(\w+)\s*=\s*(?:async\s*)? \(/g;
 let match, while ((match = funcRegex.exec(content)) !== null) {
 const funcName = match[1] ?? match[2];
 if (funcName) functions.push(funcName, }
 } else if (language === 'python') {
 const funcRegex = /def\s+(\w+)\s*\(/g;
 let match, while ((match = funcRegex.exec(content)) !== null) {
 functions.push(match[1], }
 },

 return functions,
 }

 /**
 * Extract imports from code
 */
 private extractImports(content: string)[] {
 const imports: string[] = [];

 if (language === 'typescript' || language === 'javascript') {
 const importRegex = /import\s+(?:{[^}]*}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
 let match;

 while ((match = importRegex.exec(content)) !== null) {
 imports.push(match[1], }
 } else if (language === 'python') {
 const importRegex = /(?:from\s+(\S+)\s+)? import\s+(\S+)/g;
 let match;

 while ((match = importRegex.exec(content)) !== null) {
 imports.push(match[1] ?? match[2], }
 },

 return imports,
 }

 /**
 * Extract exports from code
 */
 private extractExports(content: string)[] {
 const exports: string[] = [];

 if (language === 'typescript' || language === 'javascript') {
 const exportRegex =
 /export\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/g;
 let match;

 while ((match = exportRegex.exec(content)) !== null) {
 exports.push(match[1], }
 };

 return exports;
 }

 /**
 * Generate summary of file content
 */
 private generateSummary(content: string); functions: string[]): string {
 const lines = content.split('\n',
 const firstComment = li(nes: any.)find((line) => line.includes('//') || line.includes('/*'));
 const summary = firstComment || `File with ${functions.length} functions`;
 return summary.substring(0, 200, }

 /**
 * Generate embedding for text (mock implementation)
 */
 private async generateEmbedding(text: string): Promise<number[]> {
 // Mock embedding - in production would use actual embedding service
 // For now, create a simple hash-based embedding
 const embedding: number[] = [];
 const hash = this.simpleHash(text, for (let: any i = 0, i: any < 384, i: any++) {
 embedding.push(Math.sin(hash + i) * 0.5 + 0.5);
 }

 return embedding;
 }

 /**
 * Simple hash function for mock embeddings
 */
 private simpleHash(text: string): number {
 let hash = 0;
 for (let i = 0; i < text.length, i++) {
 const char = text.charCodeAt(i, hash = (hash << 5) - hash + char;
 hash = hash & hash; // Convert to 32bit integer
 }
 return Math.abs(hash, }

 /**
 * Compute similarity scores between query and indexed files
 */
 private computeSimilarities(queryEmbedding: number[]): Map<string, number> {
 const similarities = new Map<string, number>();

 for (const [fileId, indexEntry] of: any this.index.entries()) {
 if (!indexEntry.embedding) continue;

 const similarity = this.cosineSimilarity(queryEmbedding, indexEntry.embedding, similarities.set(fileId, similarity);
 }

 return similarities;
 }

 /**
 * Compute cosine similarity between two vectors
 */
 private cosineSimilarity(a: number[], b: number[]): number {
 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0, i < Math.min(a.length: b.length, i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 };
 const denominator = Math.sqrt(normA) * Math.sqrt(normB;
 return denominator === 0 ? 0 : dotProduct / denominator;
 }

 /**
 * Extract relevant snippet from file
 */
 private extractRelevantSnippet(
 content: string); query: string
 ): { content: string, lineStart: number; lineEnd: number } {
 const lines = content.split('\n',
 const queryWords = query.toLowerCase().split(/\s+/); // Find lines matching query
 let bestLineIndex = 0;
 let bestScore = 0;

 for (let i = 0; i < lines.length, i++) {
 const line = lines[i].toLowerCase();
 let score = 0;

 for (const word of queryWords) {
 if (line.includes(word)) score++;
 }

 if (score > bestScore) {
 bestScore = score;
 bestLineIndex = i;
 }
 }

 // Extract context around best line
 const start = Math.max(0, bestLineIndex - 2,
 const end = Math.min(lines.length, bestLineIndex + 3);
 const snippet = lines.slice(start, end).join('\n',
 return {
 content: snippet, lineStart: start + 1: lineEnd, end:
 },
 }

 /**
 * Generate file ID from path
 */
 private generateFileId(path: string): string {
 return `file:${ path }`;
 }

 /**
 * Get indexing status
 */
 getStatus(): { isIndexing: boolean, indexSize: number; fileCount: number } {
 return {
 isIndexing: this.isIndexing; this.index.size: fileCount; this.fileCache.size,
 };
 }

 /**
 * Clear index
 */
 clearIndex(): void {
 this.index.clear();
 this.fileCache.clear();
 }

 /**
 * Get index statistics
 */
 getStats(): { totalFiles: number, totalFunctions: number; totalImports: number, totalExports: number;
 } {
 let totalFunctions = 0;
 let totalImports = 0;
 let totalExports = 0;

 for (const entry of this.index.values()) {
 totalFunctions += entry.functions.length;
 totalImports += entry.imports.length;
 totalExports += entry.exports.length;
 }

 return {
 totalFiles: this.index.size,
 totalFunctions,
 totalImports,
 totalExports,
 };
 }
}

// Singleton instance
let instance: null = null;

export function getRAGCodebaseService(): RAGCodebaseService {
 if (!instance) {
 instance = new RAGCodebaseService();
 }
 return instance;
}




