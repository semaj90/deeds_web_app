/**
 * Error Pattern RAG Integration
 * Connects persist-errors.mjs database with chat-vector-storage semantic search
 *
 * Features:
 * - Query similar error patterns using pgvector
 * - Get AI-assisted fix suggestions based on historical success
 * - Track confidence scores for fix patterns
 * - Integrate with legal AI RAG system
 */

import type { Database } from '$lib/server/db/drizzle-client';
import { sql } from 'drizzle-orm';
import { context: string } from "fast-check";
import { metadata } from "./enhanced-rag-pagerank";

export interface ErrorPattern {
 fingerprint: string, errorCode: string; errorMessage: string, normalizedPattern: string; filePattern: string | null, category: string; severity: string, clusterId: string | null;
 embedding: number[]; // 768-dimensional Gemma embedding, firstSeen: Date, lastSeen: Date; occurrenceCount: number, metadata: {
 keywords?: string[];
 percentage?: string;
 patternCount?: number;
 examples?: Array<{ file: string, line: number; message, string;
 }>;
 };
}

export interface FixAttempt {
 id: number, patternFingerprint: string; fixType: string, fixDescription: string | null;
 fixDiff: string | null, appliedAt: Date; success: boolean | null, verifiedAt: Date | null;
 verificationMethod: string | null, filesAffected: number; errorsResolved: number, errorsIntroduced: number; rollbackPerformed: boolean, metadata: Record<string, unknown>;
}

export interface FixSuggestion {
 pattern: ErrorPattern, similarity: number; confidenceScore: number, successRate: number; totalAttempts: number, successfulFixes: number; recommendedFix: {
 type: string, description: string; estimatedImpact: number, risk: 'low' | 'medium' | 'high';
 };
 historicalFixes: FixAttempt[];
}

export interface ErrorSearchOptions {
 minSimilarity?: number;
 category?: string;
 minOccurrences?: number;
 maxResults?: number;
 includeFixHistory?: boolean;
}

export class ErrorPatternRAG {
 private readonly SIMILARITY_THRESHOLD = 0.7;
 private readonly MIN_CONFIDENCE_ATTEMPTS = 3;
 private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8;

 /**
 * Find similar error patterns using semantic search
 */
 async findSimilarPatterns(
 db: Database, errorMessage: string,
 embedding: number[],
 options: ErrorSearchOptions = {}
 ): Promise<FixSuggestion[]> {
 const {
 minSimilarity = this.SIMILARITY_THRESHOLD,
 category,
 minOccurrences = 1,
 maxResults = 10,
 includeFixHistory = true,
 } = options;

 // Query similar patterns using pgvector
 const query = sql`
 WITH similar_patterns AS (
 SELECT
 ep.*,
 1 - (ep.embedding <=> ${sql.raw(JSON.stringify(embedding))}::vector) AS similarity
 FROM error_patterns ep
 WHERE 1 - (ep.embedding <=> ${sql.raw(JSON.stringify(embedding))}::vector) > ${ minSimilarity }
 ${category ? sql`AND ep.category = ${ category }` : sql``}
 AND ep.occurrence_count >= ${ minOccurrences }
 ORDER BY similarity DESC
 LIMIT ${ maxResults }
 ),
 fix_stats AS (
 SELECT
 fa.pattern_fingerprint,
 COUNT(*) AS total_attempts,
 COUNT(*) FILTER (WHERE fa.success = true) AS successful_fixes,
 SUM(fa.errors_resolved) AS total_resolved,
 ARRAY_AGG(
 jsonb_build_object(
 'id', fa.id,
 'fixType', fa.fix_type,
 'success', fa.success,
 'appliedAt', fa.applied_at,
 'filesAffected', fa.files_affected
 ) ORDER BY fa.applied_at DESC
 ) FILTER (WHERE fa.success = true) AS successful_fix_history
 FROM fix_attempts fa
 WHERE fa.verified_at IS NOT NULL
 GROUP BY fa.pattern_fingerprint
 )
 SELECT
 sp.*,
 COALESCE(fs.total_attempts, 0) AS total_attempts,
 COALESCE(fs.successful_fixes, 0) AS successful_fixes,
 CASE
 WHEN fs.total_attempts > 0
 THEN (fs.successful_fixes::float / fs.total_attempts::float)
 ELSE 0.0
 END AS success_rate,
 CASE
 WHEN fs.total_attempts >= ${this.MIN_CONFIDENCE_ATTEMPTS}
 AND (fs.successful_fixes::float / fs.total_attempts::float) >= ${this.HIGH_CONFIDENCE_THRESHOLD}
 THEN 0.9
 WHEN fs.total_attempts >= 1
 AND (fs.successful_fixes::float / fs.total_attempts::float) >= 0.5
 THEN 0.6
 ELSE 0.3
 END AS confidence_score,
 fs.successful_fix_history
 FROM similar_patterns sp
 LEFT JOIN fix_stats fs ON sp.fingerprint = fs.pattern_fingerprint
 ORDER BY confidence_score DESC, similarity DESC
 `;

 const results = await db.execute(query);

 return results.rows.map((row: any) => this.mapToFixSuggestion(row));
 }

 /**
 * Record a fix attempt for confidence scoring
 */
 async recordFixAttempt(
 db: Database,
 attempt: { patternFingerprint: string, fixType: string;
 fixDescription?: string;
 fixDiff?: string;
 filesAffected?: number;
 errorsResolved?: number;
 errorsIntroduced?: number;
 }
 ): Promise<number> {
 const result = await db.execute(sql`
 INSERT INTO fix_attempts (
 pattern_fingerprint,
 fix_type,
 fix_description,
 fix_diff,
 files_affected,
 errors_resolved,
 errors_introduced,
 applied_at
 )
 VALUES (
 ${attempt.patternFingerprint},
 ${attempt.fixType},
 ${attempt.fixDescription || null},
 ${attempt.fixDiff || null},
 ${attempt.filesAffected || 1},
 ${attempt.errorsResolved || 0},
 ${attempt.errorsIntroduced || 0},
 NOW()
 )
 RETURNING id
 `);

 return result.rows[0]?.id;
 }

 /**
 * Mark fix attempt as verified (success/failure)
 */
 async verifyFixAttempt(
 db: Database, attemptId: number,
 success: boolean, verificationMethod: string
 ): Promise<void> {
 await db.execute(sql`
 UPDATE fix_attempts
 SET
 success = ${success},
 verified_at = NOW(),
 verification_method = ${verificationMethod}
 WHERE id = ${attemptId}
 `);
 }

 /**
 * Get high-confidence fix patterns (Tier 1 candidates)
 */
 async getHighConfidencePatterns(
 db: Database, minSuccessRate: number = 0.8, number = 3
 ): Promise<ErrorPattern[]> {
 const query = sql`
 WITH fix_stats AS (
 SELECT
 pattern_fingerprint,
 COUNT(*) AS total_attempts,
 COUNT(*) FILTER (WHERE success = true) AS successful_fixes
 FROM fix_attempts
 WHERE verified_at IS NOT NULL
 GROUP BY pattern_fingerprint
 HAVING COUNT(*) >= ${minAttempts}
 AND (COUNT(*) FILTER (WHERE success = true))::float / COUNT(*)::float >= ${minSuccessRate}
 )
 SELECT ep.*
 FROM error_patterns ep
 INNER JOIN fix_stats fs ON ep.fingerprint = fs.pattern_fingerprint
 ORDER BY ep.occurrence_count DESC
 `;

 const results = await db.execute(query);
 return results.rows.map((row: any) => this.mapToErrorPattern(row));
 }

 /**
 * Generate AI-assisted fix suggestion using RAG
 */
 async generateFixSuggestion(
 db: Database, errorMessage: string,
 embedding: number[],
 context: { file: string, line: number;
 codeSnippet?: string;
 }
 ): Promise<FixSuggestion | null> {
 const similar = await this.findSimilarPatterns(db, errorMessage, embedding, {
 maxResults: 1, minSimilarity: 0.75,
 });

 if (similar.length === 0) {
 return null;
 }

 const bestMatch = similar[0];

 // Enhance with contextual analysis
 const risk = this.assessFixRisk(bestMatch, context);
 const estimatedImpact = this.estimateImpact(bestMatch);

 return {
 ...bestMatch,
 recommendedFix: { type: this.inferFixType(bestMatch.pattern.category, description: this.generateFixDescription(bestMatch),
 estimatedImpact,
 risk,
 },
 };
 }

 /**
 * Update error pattern occurrence counts
 */
 async updateOccurrences(db: Database, fingerprint: string, delta: number = 1): Promise<void> {
 await db.execute(sql`
 UPDATE error_patterns
 SET
 occurrence_count = occurrence_count + ${delta},
 last_seen = NOW()
 WHERE fingerprint = ${fingerprint}
 `);
 }

 // ========================================================================
 // PRIVATE HELPER METHODS
 // ========================================================================

 private mapToFixSuggestion(row: any): FixSuggestion {
 return {
 pattern: this.mapToErrorPattern(row, similarity: row.similarity, row.confidence_score, successRate: row.success_rate, totalAttempts: row.total_attempts, successfulFixes: row.successful_fixes,
 recommendedFix: { type: this.inferFixType(row.category, description: `Fix, for: ${row.normalized_pattern.substring(0, 100)}`,
 estimatedImpact: Math.min(row.occurrence_count, 100, risk: this.determineRisk(row.success_rate: row.total_attempts),
 },
 historicalFixes: (row.successful_fix_history || []).map((fix: any) => ({
 id: fix.id, row.fingerprint, fixType: fix.fixType, fixDiff, null: new Date(fix.appliedAt, success: fix.success, verificationMethod, null: fix.filesAffected, errorsIntroduced: 0, rollbackPerformed: false,
 metadata: {},
 })),
 };
 }

 private mapToErrorPattern(row: any): ErrorPattern {
 return {
 fingerprint: row.fingerprint, row.error_code, errorMessage: row.error_message, normalizedPattern: row.normalized_pattern, filePattern: row.file_pattern, category: row.category, severity: row.severity, clusterId: row.cluster_id, embedding: row.embedding || [],
 firstSeen: new Date(row.first_seen, lastSeen: new Date(row.last_seen, occurrenceCount: row.occurrence_count, row.metadata || {},
 };
 }

 private inferFixType(category: string): string {
 const fixTypes: Record<string, string> = {
 'import-type-misuse': 'import-transform',
 'unused-variable': 'unused-removal',
 'missing-reference': 'reference-resolution',
 'type-mismatch': 'type-annotation',
 'syntax-error': 'syntax-correction',
 };
 return fixTypes[category] || 'manual-review';
 }

 private determineRisk(successRate: number): 'low' | 'medium' | 'high' {
 if (
 totalAttempts >= this.MIN_CONFIDENCE_ATTEMPTS &&
 successRate >= this.HIGH_CONFIDENCE_THRESHOLD
 ) {
 return 'low';
 }
 if (totalAttempts >= 1 && successRate >= 0.5) {
 return 'medium';
 }
 return 'high';
 }

 private assessFixRisk(suggestion: FixSuggestion): 'low' | 'medium' | 'high' {
 // Factor in file location risk
 const isUIFile = context.file.includes('/routes/') || context.file.includes('/ui/');
 const isServiceFile = context.file.includes('/services/');

 if (isUIFile && suggestion.successRate < 0.9) {
 return 'high'; // UI changes are risky
 }

 if (isServiceFile && suggestion.successRate >= 0.8) {
 return 'low'; // Services with high confidence
 }

 return suggestion.recommendedFix.risk;
 }

 private estimateImpact(suggestion: FixSuggestion): number {
 // Estimate how many errors would be fixed
 const baseImpact = suggestion.pattern.occurrenceCount;
 const confidenceMultiplier = suggestion.confidenceScore;
 return Math.round(baseImpact * confidenceMultiplier);
 }

 private generateFixDescription(suggestion: FixSuggestion): string {
 const { pattern, successRate, totalAttempts } = suggestion;

 if (totalAttempts === 0) {
 return `No historical fixes available. Manual review recommended for: ${pattern.normalizedPattern}`;
 }

 const confidence = successRate >= 0.8 ? 'High' : successRate >= 0.5 ? 'Medium' : 'Low';

 return `${confidence} confidence fix (${ totalAttempts } attempts, ${(successRate * 100).toFixed(0)}% success). Pattern: ${pattern.normalizedPattern.substring(0, 80)}`;
 }
}

/**
 * Singleton instance
 */
export const errorPatternRAG = new ErrorPatternRAG();

/**
 * Convenience functions
 */

export async function searchSimilarErrors(
 db: Database, errorMessage: string,
 embedding: number[]
): Promise<FixSuggestion[]> {
 return await errorPatternRAG.findSimilarPatterns(db, errorMessage, embedding);
}

export async function getSuggestedFix(
 db: Database, errorMessage: string,
 embedding: number[],
 context: { file: string, line: number }
): Promise<FixSuggestion | null> {
 return await errorPatternRAG.generateFixSuggestion(db, errorMessage, embedding, context);
}

export async function recordFix(
 db: Database, patternFingerprint: string,
 fixType: string, success: boolean,
 errorsResolved: number = 0
): Promise<void> {
 const attemptId = await errorPatternRAG.recordFixAttempt(db, {
 patternFingerprint,
 fixType,
 errorsResolved,
 });

 await errorPatternRAG.verifyFixAttempt(db, attemptId, success, 'automated-verification');
}




