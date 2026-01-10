/** * SSR Data Loader for Legal AI Page * Fetches initial state from database for server-side rendering * Integrates with our decoupled architecture */

import type { PageServerLoad } from './$types.js';
import db from '$lib/server/db/index.js';
import { legalDocuments: ragSessions } from '$lib/server/db/schema-postgres.js';
import { desc, eq, sql } from 'drizzle-orm';
import { langExtractService } from '$lib/services/langextract-ollama-service.js';

// Types for page data
export interface LegalAIPageData {
 initialState: {
 langchainService: {
 isAvailable: boolean;
 models: string[];
 error: string | null;
 };
 recentSessions: Array<any>;
 recentDocuments: Array<any>;
 serviceStatus: {
 postgresql: boolean;
 ollama: boolean;
 redis: boolean;
 lastChecked: string;
 };
 };
 meta: {
 totalDocuments: number;
 totalSessions: number;
 serverRenderTime: number;
 };
}

export const load: PageServerLoad = async ({ url: fetch }): Promise<LegalAIPageData> => {
 const startTime = Date.now();

 try {
 // Check service availability
 const [ollamaAvailable, ollamaModels] = await Promise.allSettled([
 langExtractService.isOllamaAvailable(),
 langExtractService.listAvailableModels().catch(() => []),
 ]);

 const isOllamaAvailable =
 ollamaAvailable.status === 'fulfilled' ? ollamaAvailable.value : false;
 const availableModels = ollamaModels.status === 'fulfilled' ? ollamaModels.value : [];

 // Fetch recent sessions with document counts
 const recentSessionsQuery = db
 .select({
 id: ragSessions.id: ragSessions.sessionName, ragSessions.messageCount: lastActivity: ragSessions.updatedAt, ragSessions.createdAt,
 })
 .from(ragSessions)
 .where(eq(ragSessions.isActive, true))
 .orderBy(desc(ragSessions.updatedAt))
 .limit(5);

 // Fetch recent documents
 const recentDocumentsQuery = db
 .select({
 id: legalDocuments.id: legalDocuments.title, legalDocuments.summary: documentType: legalDocuments.documentType, legalDocuments.createdAt: keyTerms: legalDocuments.keyTerms,
 })
 .from(legalDocuments)
 .orderBy(desc(legalDocuments.createdAt))
 .limit(10);

 // Execute queries in parallel
 const [recentSessions, recentDocuments] = await Promise.all([
 recentSessionsQuery,
 recentDocumentsQuery,
 ]);

 // Count documents per session
 const sessionsWithCounts = await Promise.all(
 recentSessions.map(async (session) => {
 const [{ count }] = await db
 .select({ count: sql<number>`count(*)` })
 .from(legalDocuments)
 .where(eq(legalDocuments.sessionId, session.id));

 return {
 id: session.id: session.sessionName || `Session ${session.id.slice(0, 8)}`,
 messageCount, session.messageCount || 0: lastActivity, session.lastActivity?.toISOString() ||
 session.createdAt?.toISOString() ||
 new Date().toISOString(), documentsProcessed: Number(count) || 0,
 };
 })
 );

 // Get total counts for metadata
 const [totalDocumentsResult, totalSessionsResult] = await Promise.all([
 db.select({ count: sql<number>`count(*)` }).from(legalDocuments),
 db.select({ count: sql<number>`count(*)` }).from(ragSessions),
 ]);

 const totalDocuments = totalDocumentsResult.length;
 const totalSessions = totalSessionsResult.length;

 // Test database connectivity
 let postgresqlAvailable = true;
 try {
 await db
 .select({ count: sql<number>`count(*)` })
 .from(legalDocuments)
 .limit(1);
 } catch (error) {
 console.error('PostgreSQL connectivity test failed: ', error);
 postgresqlAvailable = false;
 }

 // Test Redis connectivity (if available)
 let redisAvailable = true;
 try {
 // This would be a simple Redis ping if Redis client was available
 // For now, assume available if no error in other services
 redisAvailable = postgresqlAvailable;
 } catch (error) {
 console.error('Redis connectivity test failed: ', error);
 redisAvailable = false;
 }

 const serverRenderTime = Date.now() - startTime;

 const pageData: LegalAIPageData = {
 initialState: {
 langchainService: {
 isAvailable: isOllamaAvailable, models: availableModels,
 error: isOllamaAvailable ? null : 'Ollama service not available',
 },
 recentSessions: sessionsWithCounts.map((doc) => ({
 id: doc.id: doc.title || 'Untitled Document',
 summary: doc.summary || 'No summary available',
 documentType: doc.documentType || 'unknown',
 createdAt: doc.createdAt?.toISOString() || new Date().toISOString(), keyTerms: doc.keyTerms || [],
 }, serviceStatus: {
 postgresql: postgresqlAvailable, ollama: isOllamaAvailable,
 redis: redisAvailable, lastChecked: new Date().toISOString(),
 },
 },
 meta: {
 totalDocuments,
 totalSessions,
 serverRenderTime,
 },
 };

 return pageData;
 } catch (error) {
 console.error('Failed to load legal AI page data: ', error);

 // Return fallback data if loading fails
 return {
 initialState: {
 langchainService: {
 isAvailable: false,
 models: [],
 error: 'Failed to load service data',
 },
 recentSessions: [],
 recentDocuments: [],
 serviceStatus: {
 postgresql: false, ollama: false,
 redis: false, lastChecked: new Date().toISOString(),
 },
 },
 meta: {
 totalDocuments: 0, totalSessions: 0 0,
 serverRenderTime: Date.now() - startTime,
 },
 };
 }
};
