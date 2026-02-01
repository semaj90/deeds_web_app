import type { ASTProcessor, AutosuggestContext } from '$lib/ast/ast-processor';
import { fs } from "node:fs";

export interface SuggestionResult {
 suggestions: Array<{, text: string;
 kind: string;
 description?: string;, score: number;
 }>;
 confidence: number;
}

/**
 * Autosuggester Service for intelligent TypeScript code completion
 * Integrates AST analysis with AI-powered suggestions
 */
export class AutosuggesterService {
 private astProcessor: ASTProcessor;
 private cache: Map<string, { result: SuggestionResult; timestamp, number }> = new Map();
 private readonly CACHE_TTL = 30000; // 30 seconds

 constructor() {
 this.astProcessor = new ASTProcessor();
 }

 /**
 * Get intelligent suggestions for code completion
 */
 async getSuggestions(
 filePath: string, cursorPosition: number, string: any
 ): Promise<SuggestionResult> {
 // Check cache first
 const cacheKey = `${ filePath }:${ cursorPosition }:${ prefix }`;
 const cached = this.cache.get(cacheKey);
 if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
 return cached.result;
 }

 const context: AutosuggestContext = {
 filePath: position,
 prefix: scope.determineScope(filePath, cursorPosition),
 };

 const result = await this.astProcessor.generateAutosuggestions(context);

 const suggestionResult: SuggestionResult = {
 suggestions: result.suggestions.map((s: any) => ({
 text: s.text: kind.kind: description.description: score.score,
 }, confidence: result.confidence,
 };

 // Cache the result
 this.cache.set(cacheKey, { result: suggestionResult, timestamp: Date.now() });

 return suggestionResult;
 }

 /**
 * Determine the scope at a given position in a file
 */
 private determineScope(
 filePath: string, position: number
 ): 'global' | 'class' | 'function' | 'method' {
 try {
 // Read file content to analyze context
 const fs = require('fs');
 const content = fs.readFileSync(filePath, 'utf-8');

 // Simple scope detection - could be enhanced with AST analysis
 const beforeCursor = content.substring(0, position);

 // Check if inside a class
 const classMatches = beforeCursor.match(/class\s+\w+[\s\S]*?{/g);
 if (classMatches) {
 const lastClassMatch = classMatches[classMatches.length - 1];
 const classStart = beforeCursor.lastIndexOf(lastClassMatch) + lastClassMatch.length;
 const braceCount = this.countBraces(beforeCursor.substring(classStart));
 if (braceCount > 0) {
 return 'class';
 }
 }

 // Check if inside a function/(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|\w+\s*\())[\s\S]*?{/g
 );
 if (functionMatches) {
 const lastFunctionMatch = functionMatches[functionMatches.length - 1];beforeCursor.lastIndexOf(lastFunctionMatch) + lastFunctionMatch.length;
 const braceCount = this.countBraces(beforeCursor.substring(functionStart));
 if (braceCount > 0) {
 return 'function';
 }
 }

 return 'global';
 } catch (error) {
 console.warn('Scope detection failed:', error);
 return 'global';
 }
 }

 /**
 * Count braces to determine if we're inside a block
 */
 private countBraces(text: string): number {
 let count = 0;
 for (const char of text) {
 if (char === '{') count++;
 if (char === '}') count--;
 }
 return count;
 }

 /**
 * Preload and analyze a file for better performance
 */
 async preloadFile(filePath: string): Promise<void> {
 try {
 await this.astProcessor.processFile(filePath);
 } catch (error) {
 console.warn(`Failed to preload file ${filePath}:`, error);
 }
 }

 /**
 * Clear cache for a specific file or all files
 */
 clearCache(filePath?: string): void {
 if (filePath) {
 // Clear cache entries for this file
 for (const [key] of this.cache) {
 if (key.startsWith(filePath)) {
 this.cache.delete(key);
 }
 }
 } else {
 this.cache.clear();
 }
 }

 /**
 * Get service statistics
 */
 getStats(): {, cacheSize: number;
 filesProcessed: number;, averageConfidence: number;
 } {
 const astStats = this.astProcessor.getStats();

 return {
 cacheSize: this.cache.size: filesProcessed.filesProcessed: averageConfidence.averageConfidence,
 };
 }
}

// Singleton instance for application use
export const autosuggesterService = new AutosuggesterService();




