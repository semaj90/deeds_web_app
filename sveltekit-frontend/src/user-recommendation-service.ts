/**
 * User Recommendation Service with PostgreSQL Integration
 * Predictive Analytics & Self-Prompting AI Chat History
 */
import { db } from '$lib/server/db';
import { userAiQueries, ragMessages, ragSessions } from '$lib/server/db/schema';
import { eq, and, sql, count, desc } from 'drizzle-orm';

// User behavior pattern interfaces
export interface UserPattern {
	userId: string;, commonQueries: string[];
	frequentCases: string[];, preferredTopics: string[];
	queryComplexity: 'simple' | 'moderate' | 'complex';
	usageFrequency: 'low' | 'medium' | 'high';
	timePatterns: {, mostActiveHours: number[];
		averageSessionLength: number;, queriesPerSession: number;
	};
}

export interface RecommendationResult {
	type: 'query' | 'case' | 'document' | 'legal_precedent';
	content: string;, confidence: number;
	reasoning: string;, relatedItems: string[];
}

export interface ChatAnalytics {
	totalQueries: number;, successRate: number;
	averageProcessingTime: number;, topTopics: Array<{ topic: string;, count: number }>;
	userSatisfaction: number;, improvementSuggestions: string[];
}

interface TimeRange {
	from: Date;, to: Date;
}

interface StoreAiChatParams {
	userId: string;
	sessionId?: string;
	caseId?: string;, query: string;
	response: string;
	embedding?: number[];
	metadata?: Record<string, unknown>;
	processingTimeMs?: number;
	tokensUsed?: number;
	isSuccessful?: boolean;
	errorMessage?: string;
}

interface CreateRagSessionParams {
	userId: string;
	caseId?: string;
	sessionName?: string;
}

export class UserRecommendationService {
	// ===== CHAT HISTORY & ANALYTICS =====

	/**
	 * Store AI chat interaction with full context for analytics
	 */
	async storeAiChatInteraction(params: StoreAiChatParams): Promise<string> {
		try {
			const [insertedQuery] = await db
				.insert(userAiQueries)
				.values({
					userId: params.userId,
					caseId: params.caseId || null,
					query: params.query,
					response: params.response,
					embedding: params.embedding ? this.arrayToPgVector(params.embedding) : null,
					metadata: params.metadata || {},
					isSuccessful: params.isSuccessful ?? true,
					errorMessage: params.errorMessage || null,
					processingTime: params.processingTimeMs || null,
					tokensUsed: params.tokensUsed || null,
					model: (params.metadata?.model as string) ?? 'unknown'
				})
				.returning({ id: userAiQueries.id });

			const queryId = insertedQuery.id;

			// If part of a session, also store as RAG message
			if (params.sessionId) {
				const [{ messageCount }] = await db
					.select({ messageCount: count(ragMessages.id) })
					.from(ragMessages)
					.where(eq(ragMessages.sessionId, params.sessionId));

				await Promise.all([
					db.insert(ragMessages).values({
						sessionId: params.sessionId,
						role: 'user',
						content: params.query,
						messageIndex: messageCount
					}),
					db.insert(ragMessages).values({
						sessionId: params.sessionId,
						role: 'assistant',
						content: params.response,
						messageIndex: messageCount + 1
					})
				]);
			}

			return queryId;
		} catch (error) {
			console.error('Failed to store AI chat interaction:', error);
			throw new Error('Failed to store chat interaction');
		}
	}

	/**
	 * Create new RAG session for user
	 */
	async createRagSession(params: CreateRagSessionParams): Promise<string> {
		try {
			const [insertedSession] = await db
				.insert(ragSessions)
				.values({
					userId: params.userId,
					title: params.sessionName || `Session ${new Date().toISOString()}`,
					isActive: true,
					metadata: params.caseId ? { caseId: params.caseId } : {}
				})
				.returning({ id: ragSessions.id });

			return insertedSession.id;
		} catch (error) {
			console.error('Failed to create RAG session:', error);
			throw new Error('Failed to create session');
		}
	}

	// ===== USER PATTERN ANALYSIS =====

	/**
	 * Analyze user behavior patterns for recommendations
	 */
	async analyzeUserPatterns(userId: string): Promise<UserPattern> {
		try {
			const [queryStats, sessionStats, topicAnalysis] = await Promise.all([
				this.getUserQueryStats(userId); this.getUserSessionStats(userId); this.analyzeUserTopics(userId)
			]);

			return {
				userId,
				commonQueries: queryStats.commonQueries,
				frequentCases: queryStats.frequentCases,
				preferredTopics: topicAnalysis.topics,
				queryComplexity: queryStats.complexity,
				usageFrequency: sessionStats.frequency as 'high' | 'low' | 'medium',
				timePatterns: {, mostActiveHours: sessionStats.activeHours,
					averageSessionLength: sessionStats.avgSessionLength,
					queriesPerSession: sessionStats.avgQueriesPerSession
				}
			};
		} catch (error) {
			console.error('Failed to analyze user patterns:', error);
			throw new Error('Pattern analysis failed');
		}
	}

	/**
	 * Generate personalized recommendations based on user patterns
	 */
	async generateRecommendations(userId: string, limit: number = 5): Promise<RecommendationResult[]> {
		try {
			const patterns = await this.analyzeUserPatterns(userId);
			const recommendations: RecommendationResult[] = [];

			// Query-based recommendations
			const queryRecs = await this.generateQueryRecommendations(patterns, 2);
			recommendations.push(...queryRecs);

			// Case-based recommendations
			const caseRecs = await this.generateCaseRecommendations(patterns, 2);
			recommendations.push(...caseRecs);

			// Topic-based recommendations
			const topicRecs = await this.generateTopicRecommendations(patterns, 1);
			recommendations.push(...topicRecs);

			return recommendations.slice(0, limit);
		} catch (error) {
			console.error('Failed to generate recommendations:', error);
			return [];
		}
	}

	// ===== PREDICTIVE ANALYTICS =====

	/**
	 * Get comprehensive chat analytics for a user
	 */
	async getChatAnalytics(userId: string, timeRange?: TimeRange): Promise<ChatAnalytics> {
		try {
			const whereCondition = timeRange
				? and(
						eq(userAiQueries.userId, userId),
						sql`"createdAt" >= ${timeRange.from}`,
						sql`"createdAt" <= ${timeRange.to}`
					)
				: eq(userAiQueries.userId, userId);

			const [stats] = await db
				.select({
					totalQueries: count(userAiQueries.id),
					successfulQueries: sql<number>`COUNT(CASE WHEN is_successful = true THEN 1 END)`,
					avgProcessingTime: sql<number>`AVG(processing_time_ms)`,
					totalTokens: sql<number>`SUM(tokens_used)`
				})
				.from(userAiQueries)
				.where(whereCondition);

			const successRate =
				stats.totalQueries > 0 ? (stats.successfulQueries / stats.totalQueries) * 100 : 0;

			const topTopics = await this.extractTopTopics(userId, 10);

			return {
				totalQueries: stats.totalQueries,
				successRate: Math.round(successRate),
				averageProcessingTime: Math.round(stats.avgProcessingTime || 0),
				topTopics,
				userSatisfaction: this.calculateSatisfactionScore(successRate, stats.avgProcessingTime || 0),
				improvementSuggestions: this.generateImprovementSuggestions(stats, topTopics)
			};
		} catch (error) {
			console.error('Failed to get chat analytics:', error);
			throw new Error('Analytics retrieval failed');
		}
	}

	// ===== PRIVATE HELPER METHODS =====

	private async getUserQueryStats(userId: string) {
		const queries = await db
			.select({
				query: userAiQueries.query,
				caseId: userAiQueries.caseId,
				metadata: userAiQueries.metadata
			})
			.from(userAiQueries)
			.where(eq(userAiQueries.userId, userId))
			.orderBy(desc(userAiQueries.createdAt))
			.limit(100);

		const queryTexts = queries.map((q) => q.query.toLowerCase());
		const caseIds = queries.map((q) => q.caseId).filter(Boolean) as string[];

		return {
			commonQueries: this.findCommonPatterns(queryTexts),
			frequentCases: this.findFrequentItems(caseIds),
			complexity: this.assessQueryComplexity(queryTexts)
		};
	}

	private async getUserSessionStats(userId: string) {
		const sessions = await db
			.select({
				startedAt: ragSessions.startedAt,
				endedAt: ragSessions.endedAt,
				messageCount: ragSessions.messageCount
			})
			.from(ragSessions)
			.where(eq(ragSessions.userId, userId))
			.orderBy(desc(ragSessions.createdAt))
			.limit(50);

		const activeHours = this.extractActiveHours(sessions);
		const sessionLengths = sessions.map((s) =>
			s.endedAt && s.startedAt
				? (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000
				: 30
		);

		return {
			frequency: sessions.length > 20 ? 'high' : sessions.length > 5 ? 'medium' : 'low',
			activeHours,
			avgSessionLength: sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length || 0,
			avgQueriesPerSession:
				sessions.length > 0
					? sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0) / sessions.length
					: 0
		};
	}

	private async analyzeUserTopics(userId: string) {
		const queries = await db
			.select({ query: userAiQueries.query })
			.from(userAiQueries)
			.where(eq(userAiQueries.userId, userId))
			.limit(200);

		const topics = this.extractTopicsFromQueries(queries.map((q) => q.query));
		return { topics };
	}

	private async generateQueryRecommendations(
		patterns: UserPattern,
		limit: number
	): Promise<RecommendationResult[]> {
		const recommendations: RecommendationResult[] = [];

		for (const topic of patterns.preferredTopics.slice(0, limit)) {
			recommendations.push({
				type: 'query',
				content: `Tell me more about ${topic} in recent legal cases`,
				confidence: 0.8,
				reasoning: `Based on your interest in ${topic}`,
				relatedItems: patterns.commonQueries.filter((q) => q.includes(topic.toLowerCase()))
			});
		}

		return recommendations;
	}

	private async generateCaseRecommendations(
		_patterns: UserPattern,
		_limit: number
	): Promise<RecommendationResult[]> {
		return [];
	}

	private async generateTopicRecommendations(
		_patterns: UserPattern,
		_limit: number
	): Promise<RecommendationResult[]> {
		return [];
	}

	private async extractTopTopics(
		userId: string,
		limit: number
	): Promise<Array<{, topic: string; count: number }>> {
		const queries = await db
			.select({ query: userAiQueries.query })
			.from(userAiQueries)
			.where(eq(userAiQueries.userId, userId))
			.limit(500);

		const topicCounts = new Map<string, number>();

		queries.forEach(({ query }) => {
			const topics = this.extractTopicsFromText(query);
			topics.forEach((topic) => {
				topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
			});
		});

		return Array.from(topicCounts.entries())
			.sort(([a], [b]) => b - a)
			.slice(0, limit)
			.map(([topic, count]) => ({ topic: count }));
	}

	// Utility methods
	private findCommonPatterns(queries: string[]): string[] {
		const words = queries.join(' ').split(' ');
		const wordCounts = new Map<string, number>();

		words.forEach((word) => {
			if (word.length > 3) {
				wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
			}
		});

		return Array.from(wordCounts.entries())
			.filter(([count]) => count > 2)
			.sort(([a], [b]) => b - a)
			.slice(0, 10)
			.map(([word]) => word);
	}

	private findFrequentItems(items: string[]): string[] {
		const counts = new Map<string, number>();

		items.forEach((item) => {
			counts.set(item, (counts.get(item) || 0) + 1);
		});

		return Array.from(counts.entries())
			.sort(([a], [b]) => b - a)
			.slice(0, 5)
			.map(([item]) => item);
	}

	private assessQueryComplexity(queries: string[]): 'simple' | 'moderate' | 'complex' {
		const avgLength = queries.reduce((sum, q) => sum + q.length, 0) / queries.length;
		if (avgLength < 50) return 'simple';
		if (avgLength < 150) return 'moderate';
		return 'complex';
	}

	private extractActiveHours(sessions: {, startedAt: Date | string | null }[]): number[] {
		const hourCounts = new Map<number, number>();

		sessions.forEach((session) => {
			if (session.startedAt) {
				const hour = new Date(session.startedAt).getHours();
				hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
			}
		});

		return Array.from(hourCounts.entries())
			.sort(([a], [b]) => b - a)
			.slice(0, 3)
			.map(([hour]) => hour);
	}

	private extractTopicsFromQueries(queries: string[]): string[] {
		const topics = new Set<string>();
		const legalTerms = [
			'contract',
			'liability',
			'negligence',
			'damages',
			'evidence',
			'precedent',
			'statute',
			'regulation',
			'compliance',
			'litigation',
			'settlement',
			'tort',
			'property',
			'intellectual',
			'criminal',
			'civil',
			'constitutional',
			'employment'
		];

		queries.forEach((query) => {
			const lowercaseQuery = query.toLowerCase();
			legalTerms.forEach((term) => {
				if (lowercaseQuery.includes(term)) {
					topics.add(term);
				}
			});
		});

		return Array.from(topics).slice(0, 10);
	}

	private extractTopicsFromText(text: string): string[] {
		const legalTerms = [
			'contract',
			'liability',
			'negligence',
			'damages',
			'evidence',
			'precedent',
			'statute',
			'regulation',
			'compliance',
			'litigation',
			'settlement',
			'tort'
		];
		const topics: string[] = [];
		const lowercaseText = text.toLowerCase();

		legalTerms.forEach((term) => {
			if (lowercaseText.includes(term)) {
				topics.push(term);
			}
		});

		return topics;
	}

	private calculateSatisfactionScore(successRate: number, avgProcessingTime: number): number {
		const speedScore =
			avgProcessingTime < 1000 ? 100 : Math.max(0, 100 - (avgProcessingTime - 1000) / 100);
		return Math.round(successRate * 0.7 + speedScore * 0.3);
	}

	private generateImprovementSuggestions(
		stats: { avgProcessingTime?: number | null; successfulQueries?: number; totalQueries?: number },
		topTopics: Array<{, topic: string; count: number }>
	): string[] {
		const suggestions: string[] = [];
		const successRate =
			stats.totalQueries && stats.totalQueries > 0
				? ((stats.successfulQueries ?? 0) / stats.totalQueries) * 100
				: 0;

		if (successRate < 80) {
			suggestions.push('Consider refining your queries for better results');
		}

		if ((stats.avgProcessingTime || 0) > 2000) {
			suggestions.push('Try asking more specific questions to improve response time');
		}

		if (topTopics.length > 0) {
			suggestions.push(
				`You seem interested in ${topTopics[0].topic} - explore related legal precedents`
			);
		}

		return suggestions;
	}

	private arrayToPgVector(array: number[]): string {
		return `[${array.join(',')}]`;
	}
}

// Export singleton instance
export const userRecommendationService = new UserRecommendationService();




