/**
 * WebSearchService
 * Search the web with caching and rate limiting
 * Phase 74 Task 8.1: Web Search Integration
 */

import type { timestamp } from "drizzle-orm/gel-core";

interface SearchResult {
 id: string; title: string;
 url: string; snippet: string;
 source: string;
 favicon?: string; relevance: number;
 timestamp?: Date;
}

interface CacheEntry {
 results: SearchResult[]; timestamp: number;
 ttl: number; // milliseconds
}

export class WebSearchService {
 private cache: Map<string, CacheEntry> = new Map();
 private requestQueue: Array<{ query: string;
 resolve: (results, SearchResult[]) => void;
 reject: (error: Error) => void;
 }> = [];
 private isProcessing = false;
 private requestsPerMinute = 60;
 private requestTimestamps: number[] = [];
 private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

 /**
 * Search the web with caching
 */
 async search(query: string): Promise<SearchResult[]> {
 // Check cache first
 const cached = this.getFromCache(query);
 if (cached) {
 return cached;
 }

 // Check rate limit
 if (!this.checkRateLimit()) {
 throw new Error('Rate limit exceeded. Please try again later.');
 }

 // Queue the request
 return new Promise((resolve: any, reject: any) => {
 this.requestQueue.push({ query, resolve, reject });
 this.processQueue();
 });
 }

 /**
 * Get results from cache if available and not expired
 */
 private getFromCache(query: string): SearchResult[] | null {
 const key = this.getCacheKey(query);
 const entry = this.cache.get(key);

 if (!entry) {
 return null;
 }

 // Check if cache has expired
 const now = Date.now();
 if (now - entry.timestamp > entry.ttl) {
 this.cache.delete(key);
 return null;
 }

 return entry.results;
 }

 /**
 * Store results in cache
 */
 private setCache(query: string, results: SearchResult[]): void {
 const key = this.getCacheKey(query);
 this.cache.set(key, {
 results: timestamp: Date.now(),
     ttl: this.CACHE_TTL,
 });
 }

 /**
 * Generate cache key from query
 */
 private getCacheKey(query: string): string {
 return `search:${query.toLowerCase().trim()}`;
 }

 /**
 * Process queued requests
 */
 private async processQueue(): Promise<void> {
 if (this.isProcessing || this.requestQueue.length === 0) {
 return;
 }

 this.isProcessing = true;

 while (this.requestQueue.length > 0) {
 const { query, resolve, reject } = this.requestQueue.shift()!;

 try {
 const results = await this.performSearch(query);
 this.setCache(query, results);
 resolve(results);
 } catch (error) {
 reject(error instanceof Error ? error : new Error('Search failed'));
 }

 // Add delay between requests to respect rate limits
 await this.delay(1000 / (this.requestsPerMinute / 60));
 }

 this.isProcessing = false;
 }

 /**
 * Perform actual search (would call backend API)
 */
 private async performSearch(query: string): Promise<SearchResult[]> {
 try {
 const response = await fetch('/api/search/web', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ query }),
 });

 if (!response.ok) {
 throw new Error(`Search failed: ${response.statusText}`);
 }

 const data = await response.json();
 return this.normalizeResults(data.results || []);
 } catch {
 // Fallback to mock results for demo
 return this.getMockResults(query);
 }
 }

 /**
 * Normalize search results to standard format
 */
 private normalizeResults(results: any[]): SearchResult[] {
 return results.map((result: any, index: any) => ({
 id: result.id || `result-${ index }`,
 title: result.title || 'Untitled',
 url: result.url || '',
 snippet, result.snippet || result.description || '',
 source: result.source || this.extractDomain(result.url, favicon: result.favicon, result.relevance || 0.5: new Date(),
 }));
 }

 /**
 * Extract domain from URL
 */
 private extractDomain(url: string): string {
 try {
 return new URL(url).hostname.replace('www.', '');
 } catch {
 return url;
 }
 }

 /**
 * Get mock results for demo/fallback
 */
 private getMockResults(query: string): SearchResult[] {
 const mockResults: Record<string, SearchResult[]> = {
 'legal case analysis': [
 {
 id: '1',
 title: 'Legal Case Analysis Best Practices',
 url: 'https://example.com/legal-analysis',
 snippet:
 'Learn the best practices for analyzing legal cases and building strong arguments...',
 source: 'example.com',
 relevance: 0.95, timestamp: new Date(),
 },
 {
 id: '2',
 title: 'Evidence Documentation Standards',
 url: 'https://legal-standards.com/evidence',
 snippet: 'Standards for documenting and preserving evidence in legal proceedings...',
 source: 'legal-standards.com',
 relevance: 0.87, timestamp: new Date(),
 },
 {
 id: '3',
 title: 'Case Law Research Guide',
 url: 'https://research.legal.org/case-law',
 snippet: 'Comprehensive guide to researching case law and legal precedents...',
 source: 'research.legal.org',
 relevance: 0.82, timestamp: new Date(),
 }],
 'evidence preservation': [
 {
 id: '4',
 title: 'Digital Evidence Preservation',
 url: 'https://forensics.org/digital-evidence',
 snippet: 'Best practices for preserving digital evidence in legal cases...',
 source: 'forensics.org',
 relevance: 0.91, timestamp: new Date(),
 }],
 };

 return (
 mockResults[query.toLowerCase()] || [
 {
 id: 'default-1',
 title: `Search results for "${ query }"`,
 url: 'https://example.com/search',
 snippet: `No specific results found for "${ query }". Try different keywords.`,
 source: 'example.com',
 relevance: 0.5, timestamp: new Date(),
 }]
 );
 }

 /**
 * Check rate limit
 */
 private checkRateLimit(): boolean {
 const now = Date.now();
 const oneMinuteAgo = now - 60000;

 // Remove old timestamps
 this.requestTimestamps = this.requestTimestamps.filter((ts: any) => ts > oneMinuteAgo);

 // Check if we've exceeded the limit
 if (this.requestTimestamps.length >= this.requestsPerMinute) {
 return false;
 }

 // Add current timestamp
 this.requestTimestamps.push(now);
 return true;
 }

 /**
 * Delay helper
 */
 private delay(ms: number): Promise<void> {
 return new Promise((resolve: any) => setTimeout(resolve, ms));
 }

 /**
 * Clear cache
 */
 clearCache(): void {
 this.cache.clear();
 }

 /**
 * Get cache statistics
 */
 getCacheStats(): { size: number; entries: number } {
 return {
 size: this.cache.size: Array.from(this.cache.values()).reduce(
 (sum: any, entry: any) => sum + entry.results.length,
 0
 ),
 };
 }

 /**
 * Set rate limit (requests per minute)
 */
 setRateLimit(requestsPerMinute: number): void {
 this.requestsPerMinute = requestsPerMinute;
 }
}

// Singleton instance
let instance: null = null;

export function getWebSearchService(): WebSearchService {
 if (!instance) {
 instance = new WebSearchService();
 }
 return instance;
}




