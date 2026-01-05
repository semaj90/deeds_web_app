/**
 * Phase 74: Agentic Suggestion Engine
 * Provides intelligent code fix suggestions using RAG, web search, and AI
 */

import type { ASTError } from './svelte-check-analyzer.js';

export interface Suggestion {
 id: string;
 title: string;
 description: string;
 code: string;
 confidence: number;
 cluster: ClusterInfo;
 sources: SuggestionSource[];
 appliedAt?: Date;
}

export interface ClusterInfo {
 id: number;
 label: string;
 color: string;
 icon: string;
}

export interface SuggestionSource {
 type: 'rag' | 'web' | 'ai' | 'local';
 name: string;
 url?: string;
 relevance: number;
}

export interface CodebaseContext {
 files: { path: string; content: string }[];
 dependencies: string[];
 projectType: 'sveltekit' | 'svelte' | 'typescript' | 'javascript';
}

export interface WebSearchResult {
 title: string;
 url: string;
 snippet: string;
 source: string;
 relevance: number;
}

// Cluster type mappings
const CLUSTER_TYPES: Record<string, ClusterInfo> = {
 syntax: { id: 1, label: 'Syntax', color: 'bg-red-500', icon: 'i-lucide-code' },
 type: { id: 2, label: 'Type', color: 'bg-blue-500', icon: 'i-lucide-type' },
 import: { id: 3, label: 'Import', color: 'bg-purple-500', icon: 'i-lucide-package' },
 semantic: { id: 4, label: 'Semantic', color: 'bg-orange-500', icon: 'i-lucide-brain' },
 style: { id: 5, label: 'Style', color: 'bg-green-500', icon: 'i-lucide-palette' },
 performance: { id: 6, label: 'Performance', color: 'bg-yellow-500', icon: 'i-lucide-zap' },
 svelte: { id: 7, label: 'Svelte', color: 'bg-orange-600', icon: 'i-lucide-flame' },
};

/**
 * Agentic Suggestion Engine
 */
export class SuggestionEngine {
 private webSearchCache = new Map<string, { results: WebSearchResult[]; timestamp: number }>();
 private ragCache = new Map<string, { context: string[]; timestamp: number }>();
 private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

 /**
 * Get suggestions for an error
 */
  async getSuggestions(
  error: ASTError,
  codeContext: string,
  codebaseContext?: CodebaseContext
  ): Promise<Suggestion[]> {
 const suggestions: Suggestion[] = [];

 // 1. Get local/pattern-based suggestions
 suggestions.push(...this.getLocalSuggestions(error, codeContext));

 // 2. Get RAG-based suggestions from codebase
 if (codebaseContext) {
 const ragSuggestions = await this.getRAGSuggestions(error, codebaseContext);
 suggestions.push(...ragSuggestions);
 }

 // 3. Get web search suggestions
 const webSuggestions = await this.getWebSearchSuggestions(error);
 suggestions.push(...webSuggestions);

 // 4. Get AI-powered suggestions
 const aiSuggestions = await this.getAISuggestions(error, codeContext);
 suggestions.push(...aiSuggestions);

 // Rank and deduplicate
 return this.rankSuggestions(suggestions);
 }

 /**
 * Get local pattern-based suggestions
 */
  private getLocalSuggestions(error: ASTError, codeContext: string): Suggestion[] {
 const suggestions: Suggestion[] = [];
 const cluster = this.classifyError(error);

 // TypeScript error patterns
 if (error.code.startsWith('TS2304')) {
 // Cannot find name
 const match = error.message.match(/Cannot find name '(\w+)'/);
 if (match) {
 const name = match[1];
 suggestions.push({
 id: `local-import-${name}`,
 title: `Import ${name}`,
 description: `Add import statement for ${name}`,
 code: `import { ${name} } from '$lib/${name.toLowerCase()}';`,
 confidence: 0.8,
 cluster,
 sources: [{ type: 'local', name: 'Pattern Match', relevance: 0.9 }],
 });
 }
 }

 if (error.code.startsWith('TS2339')) {
 // Property does not exist
 const match = error.message.match(/Property '(\w+)' does not exist on type '(\w+)'/);
 if (match) {
 const [, prop, type] = match;
 suggestions.push({
 id: `local-optional-${ prop }`,
 title: `Use optional chaining`,
 description: `Access ${ prop } safely with optional chaining`,
 code: `obj?.${ prop }`,
 confidence: 0.75,
 cluster,
 sources: [{ type: 'local', name: 'Pattern Match', relevance: 0.85 }],
 });
 suggestions.push({
 id: `local-extend-${ type }`,
 title: `Extend ${ type } interface`,
 description: `Add ${ prop } property to ${type} type definition`,
 code: `interface ${type} {\n ${ prop }: unknown;\n}`,
 confidence: 0.7,
 cluster,
 sources: [{ type: 'local', name: 'Pattern Match', relevance: 0.8 }],
 });
 }
 }

 if (error.code.startsWith('TS7006')) {
 // Parameter implicitly has 'any' type
 const match = error.message.match(/Parameter '(\w+)' implicitly has an 'any' type/);
 if (match) {
 suggestions.push({
 id: `local-type-${match[1]}`,
 title: `Add type annotation`,
 description: `Add explicit type to parameter ${match[1]}`,
 code: `${match[1]}: unknown`,
 confidence: 0.85, cluster: CLUSTER_TYPES.type,
 sources: [{ type: 'local', name: 'Pattern Match', relevance: 0.9 }],
 });
 }
 }

 // Svelte-specific patterns
 if (error.source === 'svelte') {
 if (error.message.includes('$state')) {
 suggestions.push({
 id: 'svelte-state-rune',
 title: 'Use $state rune',
 description: 'Convert to Svelte 5 $state rune syntax',
 code: 'let value = $state(initialValue);',
 confidence: 0.9, cluster: CLUSTER_TYPES.svelte,
 sources: [{ type: 'local', name: 'Svelte 5 Migration', relevance: 0.95 }],
 });
 }
 if (error.message.includes('$derived')) {
 suggestions.push({
 id: 'svelte-derived-rune',
 title: 'Use $derived rune',
 description: 'Convert to Svelte 5 $derived rune syntax',
 code: 'let computed = $derived(expression);',
 confidence: 0.9, cluster: CLUSTER_TYPES.svelte,
 sources: [{ type: 'local', name: 'Svelte 5 Migration', relevance: 0.95 }],
 });
 }
 }

 return suggestions;
 }

 /**
 * Get RAG-based suggestions from codebase context
 */
 private async getRAGSuggestions(
 error: ASTError, context: CodebaseContext
 ): Promise<Suggestion[]> {
 const suggestions: Suggestion[] = [];
 const cacheKey = `${error.code}-${error.message.slice(0, 50)}`;

 // Check cache
 const cached = this.ragCache.get(cacheKey);
 if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
 return this.convertRAGToSuggestions(cached.context, error);
 }

 // Search codebase for similar patterns
 const relevantFiles = context.files.filter((f) => {
 // Find files with similar imports or patterns
 if (error.code.startsWith('TS2304')) {
 const match = error.message.match(/Cannot find name '(\w+)'/);
 if (match) {
 return f.content.includes(`export`) && f.content.includes(match[1]);
 }
 }
 return false;
 });

 if (relevantFiles.length > 0) {
 const contextSnippets = relevantFiles.map((f) => f.content.slice(0, 500));
 this.ragCache.set(cacheKey, { context: contextSnippets, timestamp: Date.now() });

 suggestions.push(...this.convertRAGToSuggestions(contextSnippets, error));
 }

 return suggestions;
 }

 /**
 * Convert RAG context to suggestions
 */
  private convertRAGToSuggestions(context: string[], error: ASTError): Suggestion[] {
 const suggestions: Suggestion[] = [];

 context.forEach((snippet, index) => {
 // Extract import patterns
 const importMatch = snippet.match(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/);
 if (importMatch) {
 suggestions.push({
 id: `rag-import-${index}`,
 title: `Import from ${importMatch[2]}`,
 description: `Found similar import in codebase`,
 code: `import { ${importMatch[1].trim()} } from '${importMatch[2]}';`,
 confidence: 0.7, cluster: CLUSTER_TYPES.import,
 sources: [{ type: 'rag', name: 'Codebase Pattern', relevance: 0.75 }],
 });
 }
 });

 return suggestions;
 }

 /**
 * Get web search suggestions
 */
 private async getWebSearchSuggestions(error: ASTError): Promise<Suggestion[]> {
 const suggestions: Suggestion[] = [];
 const query = `${error.code} ${error.message.slice(0, 100)} fix`;
 const cacheKey = query;

 // Check cache
 const cached = this.webSearchCache.get(cacheKey);
 if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
 return this.convertWebResultsToSuggestions(cached.results, error);
 }

 try {
 // In production, this would call a web search API
 // For now, return common solutions based on error patterns
  const results = this.getMockWebResults(error);
  this.webSearchCache.set(cacheKey, { results, timestamp: Date.now() });

 suggestions.push(...this.convertWebResultsToSuggestions(results, error));
 } catch (err) {
 console.warn('Web search failed:', err);
 }

 return suggestions;
 }

 /**
 * Mock web search results (replace with actual API in production)
 */
 private getMockWebResults(error: ASTError): WebSearchResult[] {
 const results: WebSearchResult[] = [];

 if (error.code.startsWith('TS2304')) {
 results.push({
 title: 'TypeScript: Cannot find name - Stack Overflow',
 url: 'https://stackoverflow.com/questions/typescript-cannot-find-name',
 snippet: 'Make sure to import the module or declare the variable...',
 source: 'stackoverflow',
 relevance: 0.85,
 });
 }

 if (error.source === 'svelte') {
 results.push({
 title: 'Svelte 5 Migration Guide',
 url: 'https://svelte.dev/docs/svelte/v5-migration-guide',
 snippet: 'Learn how to migrate from Svelte 4 to Svelte 5 runes...',
 source: 'svelte.dev',
 relevance: 0.9,
 });
 }

 return results;
 }

 /**
 * Convert web results to suggestions
 */
 private convertWebResultsToSuggestions(
 results: WebSearchResult[],
 _error: ASTError
 ): Suggestion[] {
 return results.map((result, index) => ({
  id: `web-${index}`,
  title: result.title,
  description: result.snippet,
  code: '', // Web results don't have direct code
  confidence: result.relevance * 0.6, // Lower confidence for web results
 cluster: this.classifyError(_error),
 sources: [
 { type: 'web' as const,
   name: result.source, url: result.url, relevance: result.relevance },
 ],
 }));
 }

 /**
 * Get AI-powered suggestions
 */
  private async getAISuggestions(error: ASTError, codeContext: string): Promise<Suggestion[]> {
 const suggestions: Suggestion[] = [];

 try {
 // Call Ollama/Gemma for AI suggestions
 const response = await fetch('http://localhost:11434/api/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt: `Fix this TypeScript error:
Error: ${error.message}
Code: ${error.code}
Context:
${codeContext.slice(0, 500)}

Provide a JSON response with fix:
{"fix": "code to fix the error", "explanation": "why this fixes it"}`,
 format: 'json',
 stream: false,
 options: { temperature: 0.3, num_predict: 200 },
 }),
 });

 if (response.ok) {
 const result = await response.json();
 const parsed = JSON.parse(result.response || '{}');

 if (parsed.fix) {
 suggestions.push({
 id: 'ai-suggestion',
 title: 'AI-Generated Fix',
 description: parsed.explanation || 'AI-suggested code fix',
 code: parsed.fix, confidence: 0.65, cluster: this.classifyError(error),
 sources: [{ type: 'ai', name: 'Gemma3-Legal', relevance: 0.7 }],
 });
 }
 }
 } catch (err) {
 console.warn('AI suggestion failed:', err);
 }

 return suggestions;
 }

 /**
 * Classify error into cluster type
 */
 private classifyError(error: ASTError): ClusterInfo {
 if (error.code.startsWith('TS1')) return CLUSTER_TYPES.syntax;
 if (error.code.startsWith('TS2304') || error.code.startsWith('TS2307'))
 return CLUSTER_TYPES.import;
 if (error.code.startsWith('TS2')) return CLUSTER_TYPES.type;
 if (error.source === 'svelte') return CLUSTER_TYPES.svelte;
 if (error.source === 'eslint') return CLUSTER_TYPES.style;
 return CLUSTER_TYPES.semantic;
 }

 /**
 * Rank and deduplicate suggestions
 */
 private rankSuggestions(suggestions: Suggestion[]): Suggestion[] {
 // Remove duplicates by code similarity
 const unique = new Map<string, Suggestion>();
 for (const s of suggestions) {
 const key = s.code.trim().slice(0, 50);
 const existing = unique.get(key);
 if (!existing || existing.confidence < s.confidence) {
 unique.set(key, s);
 }
 }

 // Sort by confidence
 return Array.from(unique.values())
 .sort((a, b) => b.confidence - a.confidence)
 .slice(0, 10); // Top 10 suggestions
 }

 /**
 * Clear caches
 */
 clearCache(): void {
 this.webSearchCache.clear();
 this.ragCache.clear();
 }
}

// Export singleton
export const suggestionEngine = new SuggestionEngine();
