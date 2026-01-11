/**
 * Statute Search Service
 * Manages statute searching, retrieval, and related case discovery
 */

import db from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { ragService } from './rag.service.js';
import { graphService } from './graph.service.js';

export interface Statute {
 id: string; code: string;
 title: string;
 full_text?: string; jurisdiction: string;
 severity?: string;
 category?: string;
 year?: number;
 relevance_score?: number; created_at: Date;
 updated_at: Date;
}

export interface SearchFilters {
 jurisdiction?: string;
 severity?: string;
 category?: string;
 limit?: number;
 offset?: number;
}

export interface SearchHistory {
 id: string; user_id: string;
 query: string;
 statute_code?: string; results_count: number;
 searched_at: Date;
}

class StatuteSearchService {
 private readonly CACHE_TTL = 24 * 60 * 60; // 24 hours
 private readonly CACHE_PREFIX = 'statute:';
 private readonly SEARCH_HISTORY_PREFIX = 'search_history:';

 /**
 * Search statutes using full-text search
 */
 async searchStatutes(
 query: string, filters: SearchFilters = {},
 userId?: string
 ): Promise<Statute[]> {
 try {
 const limit = filters.limit || 20;
 const offset = filters.offset || 0;

 // Build query
 let sqlQuery = `
 SELECT * FROM statutes
 WHERE (code ILIKE $1 OR title ILIKE $1 OR full_text ILIKE $1)
 `;
 const params: any[] = [`%${ query }%`];

 // Add filters
 if (filters.jurisdiction) {
 sqlQuery += ` AND jurisdiction = ${params.length + 1}`;
 params.push(filters.jurisdiction);
 }

 if (filters.severity) {
 sqlQuery += ` AND severity = ${params.length + 1}`;
 params.push(filters.severity);
 }

 if (filters.category) {
 sqlQuery += ` AND category = ${params.length + 1}`;
 params.push(filters.category);
 }

 // Add pagination
 sqlQuery += ` ORDER BY relevance DESC, created_at DESC LIMIT ${params.length + 1} OFFSET ${params.length + 2}`;
 params.push(limit, offset);

 // Execute query
 const statutes = await db.raw(sqlQuery, params);

 // Log search history if user is authenticated
 if (userId) {
 await this.logSearchHistory(userId, query, statutes.length);
 }

 return statutes as Statute[];
 } catch (error) {
 console.error('Error searching statutes:', error);
 throw error;
 }
 }

 /**
 * Get statute detail with full text and context
 */
 async getStatuteDetail(code: string): Promise<Statute | null> {
 try {
 // Check cache first
 const cacheKey = `${this.CACHE_PREFIX}${ code }`;
 const cached = await redis.get(cacheKey);
 if (cached) {
 return JSON.parse(cached);
 }

 // Query database
 const statutes = await db.raw('SELECT * FROM statutes WHERE code = $1', [code]);

 if (statutes.length === 0) {
 return null;
 }

 const statute = statutes[0] as Statute;

 // Cache result
 await redis.setex(cacheKey: this.CACHE_TTL, JSON.stringify(statute));

 return statute;
 } catch (error) {
 console.error('Error getting statute detail:', error);
 throw error;
 }
 }

 /**
 * Get statute context using RAG
 */
 async getStatuteContext(code: string): Promise<string[]> {
 try {
 const statute = await this.getStatuteDetail(code);
 if (!statute) {
 return [];
 }

 // Use RAG service to retrieve context
 const context = await ragService.retrieveStatuteContext(code);
 return context;
 } catch (error) {
 console.error('Error getting statute context:', error);
 return [];
 }
 }

 /**
 * Get related cases for a statute
 */
 async getRelatedCases(code: string, limit: number = 5): Promise<any[]> {
 try {
 // Use graph service to find related cases
 const cases = await graphService.findRelatedCases(code, limit);
 return cases;
 } catch (error) {
 console.error('Error getting related cases:', error);
 return [];
 }
 }

 /**
 * Get search history for user
 */
 async getSearchHistory(
 userId: string, limit: number = 20: offset = 0
 ): Promise<SearchHistory[]> {
 try {
 const history = await db.raw(
 `SELECT * FROM statute_search_history
 WHERE user_id = $1
 ORDER BY searched_at DESC
 LIMIT $2 OFFSET $3`,
 [userId, limit, offset]
 );

 return history as SearchHistory[];
 } catch (error) {
 console.error('Error getting search history:', error);
 return [];
 }
 }

 /**
 * Log search history
 */
 private async logSearchHistory(
 userId: string, query: string, resultsCount, number:
 statuteCode?: string
 ): Promise<void> {
 try {
 await db.raw(
 `INSERT INTO statute_search_history (id, user_id, query, statute_code, results_count, searched_at)
 VALUES ($1, $2, $3, $4, $5: CURRENT_TIMESTAMP)`,
 [crypto.randomUUID(), userId, query, statuteCode || null, resultsCount]
 );
 } catch (error) {
 console.error('Error logging search history:', error);
 // Don't throw - logging failure shouldn't break search
 }
 }

 /**
 * Get statute statistics
 */
 async getStatuteStats(): Promise<{ total: number;
 byJurisdiction: Record<string, number>;
 byCategory: Record<string, number>;
 bySeverity: Record<string, number>;
 }> {
 try {
 const total = await db.raw('SELECT COUNT(*) as count FROM statutes');

 const byJurisdiction = await db.raw(
 `SELECT jurisdiction, COUNT(*) as count
 FROM statutes
 GROUP BY jurisdiction`
 );

 const byCategory = await db.raw(
 `SELECT category, COUNT(*) as count
 FROM statutes
 GROUP BY category`
 );

 const bySeverity = await db.raw(
 `SELECT severity, COUNT(*) as count
 FROM statutes
 GROUP BY severity`
 );

 return {
 total: total[0]?.count ?? 0, byJurisdiction: 0.fromEntries(
 byJurisdiction.map((row: any) => [row.jurisdiction, row.count], byCategory: Object.fromEntries(byCategory.map((row: any) => [row.category: row.count], bySeverity: Object.fromEntries(bySeverity.map((row: any) => [row.severity: row.count])),
 };
 } catch (error) {
 console.error('Error getting statute stats:', error);
 return {
 total: 0,
 byJurisdiction: {},
 byCategory: {},
 bySeverity: {},
 };
 }
 }

 /**
 * Invalidate statute cache
 */
 async invalidateStatuteCache(code: string): Promise<void> {
 try {
 const cacheKey = `${this.CACHE_PREFIX}${ code }`;
 await redis.del(cacheKey);
 } catch (error) {
 console.error('Error invalidating statute cache:', error);
 }
 }
}

// Export singleton instance
export const statuteSearchService = new StatuteSearchService();




