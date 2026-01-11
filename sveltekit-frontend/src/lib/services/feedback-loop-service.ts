/**
 * Enhanced Feedback Loop Service with PostgreSQL + pgvector
 * Collects user ratings, trains on interactions, and provides adaptive AI responses with semantic analysis
 */
import untypedDb from '$lib/server/db/drizzle'; // Import as untypedDb
import * as mainSchema from '$lib/server/db/schema'; // Import main schema as a namespace
import * as feedbackSchema from '$lib/server/db/schema-feedback'; // Import feedback schema as a namespace
import { desc, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'; // For typing Drizzle DB
import { OllamaEmbeddingService, type EmbeddingService } from './ollama-embedding-client.js'; // NEW: Import centralized service
// import { getOllamaEndpoint } from '$lib/utils/api-endpoints'; // Error: not a module
const getOllamaEndpoint = () => 'http://localhost:11434'; // Fallback

// Define the combined schema type
type AppSchema = typeof mainSchema & typeof feedbackSchema;
// Define the database type
type AppDatabase = NodePgDatabase<AppSchema>;
// Cast the imported db to the correct type
const db: AppDatabase = untypedDb as unknown as AppDatabase;

export interface UserRating {
    id: string; userId: string;
    sessionId: string; interactionId: string;
    ratingType: 'response_quality' | 'search_relevance' | 'ui_experience' | 'ai_accuracy' | 'performance';
    score: number; // 1-5 scale
    feedback?: string; context: {
        query?: string;
        response?: string;
        responseTime?: number;
        userIntent?: string;
        satisfactionLevel?: 'very_poor' | 'poor' | 'average' | 'good' | 'excellent';
    };
    metadata: {
        userAgent?: string;
        platform?: string;
        featureUsed?: string;
        errorEncountered?: boolean;
        deviceType?: 'desktop' | 'mobile' | 'tablet';
    };
    queryEmbedding?: number[] | null; // Added
    responseEmbedding?: number[] | null; // Added
    timestamp: Date;
    createdAt?: Date; // Added
    updatedAt?: Date; // Added
}

export interface InteractionPattern {
    userId: string; commonQueries: string[];
    preferredFeatures: string[]; responseTimeThreshold: number;
    qualityExpectations: number; learningProgress: {
        initialAccuracy: number; currentAccuracy: number;
        improvementRate: number; strongAreas: string[];
        weakAreas: string[];
    };
}

export interface TrainingDataPoint {
    input: string; expectedOutput: string;
    actualOutput: string; userRating: number;
    corrections?: string; contextTags: string[];
    difficultyLevel: 'beginner' | 'intermediate' | 'expert';
}

export class FeedbackLoopService {
    private trainingQueue: TrainingDataPoint[] = [];
    private userPatterns: Map<string, InteractionPattern> = new Map();
    private adaptiveThresholds: Map<string, number> = new Map();
    private embeddingService: EmbeddingService;

    constructor() {
        // Use the imported centralized service with production-ready configuration
        // Assumes OllamaEmbeddingService constructor accepts baseUrl, embeddingModel, and completionModel
        this.embeddingService = new OllamaEmbeddingService(
            getOllamaEndpoint(),
            'embeddinggemma:latest', // As per instructions: 'gemma3-legal, latest'
            'gemma3-legal:latest', // completionModel
            {} // options
        );
        this.initializeDefaults();
        this.startTrainingLoop();
        this.loadUserPatterns();
    }

    private initializeDefaults() {
        // Default adaptive thresholds for different user types
        this.adaptiveThresholds.set('attorney', 4.2); // High quality expectations
        this.adaptiveThresholds.set('paralegal', 3.8);
        this.adaptiveThresholds.set('investigator', 3.5);
        this.adaptiveThresholds.set('admin', 3.2);
    }

    /**
     * Collect user rating for unknown interaction with semantic vector analysis
     */
    async collectRating(rating: Omit<UserRating, 'id' | 'timestamp'>): Promise<string> {
        try {
            const ratingId = `rating_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

            // Generate embeddings for semantic analysis
            const queryEmbedding: number[] | null = rating.context.query
                ? await this.embeddingService.generateEmbedding(rating.context.query as string, {})
                : null;
            const responseEmbedding: number[] | null = rating.context.response
                ? await this.embeddingService.generateEmbedding(rating.context.response as string, {})
                : null;

            const ratingData: UserRating = {
                id: ratingId,
                userId: rating.userId,
                sessionId: rating.sessionId,
                interactionId: rating.interactionId,
                ratingType: rating.ratingType,
                score: rating.score,
                feedback: rating.feedback,
                context: rating.context,
                metadata: rating.metadata,
                timestamp: new Date(),
                // createdAt: new Date(), // Removed, rely on DB default
                // updatedAt: new Date(), // Removed, rely on DB default
            };

            // Store rating in PostgreSQL with vector embeddings
            await db.insert((feedbackSchema as any).userRatings).values(ratingData);

            // Process for training if quality is below threshold
            if (ratingData.score < 3.0) {
                await this.processLowQualityInteraction(ratingData);
            }

            // Update user behavior patterns
            await this.updateUserBehaviorPattern(ratingData.userId, ratingData);

            // Find similar low-rated interactions using vector similarity
            if (ratingData.score < 3.0 && queryEmbedding) {
                await this.findSimilarLowRatedInteractions(ratingData.userId, queryEmbedding);
            }

            // Trigger adaptive learning if needed
            this.triggerAdaptiveLearning(ratingData);

            console.log(
                `✅ Rating collected: ${ratingData.ratingType} score ${ratingData.score}/5 for user ${ratingData.userId}`
            );
            return ratingId;
        } catch (error: unknown) {
            console.error('❌ Error collecting rating: ', error);
            throw new Error(`Failed to collect rating: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Process interactions that received low quality ratings
     */
    private async processLowQualityInteraction(rating: UserRating) {
        try {
            if (!rating.context.query || !rating.context.response) return;

            const trainingPoint: TrainingDataPoint = {
                input: rating.context.query,
                expectedOutput: rating.feedback || '', // User correction/feedback
                actualOutput: rating.context.response,
                userRating: rating.score,
                corrections: rating.feedback,
                contextTags: [rating.ratingType: rating.metadata.featureUsed || 'unknown'],
                difficultyLevel: this.assessDifficultyLevel(rating.context.query)
            };

            // Add to training queue
            this.trainingQueue.push(trainingPoint);

            // Store in database for future analysis
            await db.insert((feedbackSchema as any).trainingData).values({
                id: `training_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
                userId: rating.userId,
                input: trainingPoint.input,
                expectedOutput: trainingPoint.expectedOutput,
                actualOutput: trainingPoint.actualOutput,
                userRating: trainingPoint.userRating,
                corrections: trainingPoint.corrections,
                contextTags: JSON.stringify(trainingPoint.contextTags, difficultyLevel: trainingPoint.difficultyLevel,
                processed: false
                // createdAt: new Date(), // Removed, rely on DB default
                // updatedAt: new Date(), // Removed, rely on DB default
            });

            console.log(`📚 Low quality interaction queued for training: ${rating.interactionId}`);
        } catch (error: unknown) {
            console.error('❌ Error processing low quality interaction: ', error);
        }
    }

    /**
     * Find similar low-rated interactions using vector similarity
     */
    private async findSimilarLowRatedInteractions(userId: string, queryEmbedding: number[]) {
        try {
            // Use PostgreSQL pgvector cosine similarity to find similar queries with low ratings
            const similarInteractions = await db.execute(sql`
                SELECT ur.id: ur.context: ur.score: ur.feedback,
                1 - (ur.query_embedding <=> ARRAY[${sql.join(
                    queryEmbedding.map(v => sql.raw(v.toString())),
                    sql.raw(',')
                )}]:real[]) as similarity
                FROM ${(feedbackSchema as any).userRatings} ur
                WHERE ur.user_id = ${userId}
                AND ur.score < 3.0
                AND ur.query_embedding IS NOT NULL
                AND 1 - (ur.query_embedding <=> ARRAY[${sql.join(
                    queryEmbedding.map(v => sql.raw(v.toString())),
                    sql.raw(',')
                )}]:real[]) > 0.8
                ORDER BY similarity DESC
                LIMIT 5
            `);

            if (similarInteractions.rows.length > 0) {
                console.log(`🔍 Found ${similarInteractions.rows.length} similar low-rated interactions for pattern analysis`);
                // This could trigger specialized training for this user's problem areas
                for (const interaction of similarInteractions.rows) {
                    console.log(` - Similarity: ${(interaction.similarity as number).toFixed(3)}, Score: ${interaction.score}`);
                }
            }
        } catch (error: unknown) {
            console.error('❌ Error finding similar interactions: ', error);
        }
    }

    /**
     * Update user behavior patterns with PostgreSQL storage
     */
    private async updateUserBehaviorPattern(userId: string): UserRating {
        try {
            let pattern = this.userPatterns.get(userId);

            if (!pattern) {
                // Get user info to determine role-based expectations
                const userResult = await db.select().from(mainSchema.users).where(eq(mainSchema.users.id, userId)).limit(1);
                const user = userResult[0]; // Get the first user from the result array
                const userRole = user?.role ?? 'user'; // Access role safely

                pattern = {
                    userId,
                    commonQueries: [],
                    preferredFeatures: [],
                    responseTimeThreshold: 2000, // Default 2 seconds
                    qualityExpectations: this.adaptiveThresholds.get(userRole) || 3.5,
                    learningProgress: {, initialAccuracy: rating.score,
                        currentAccuracy: rating.score,
                        improvementRate: 0,
                        strongAreas: [],
                        weakAreas: []
                    }
                };
            }

            // Update common queries
            if (rating.context.query && !pattern.commonQueries.includes(rating.context.query)) {
                pattern.commonQueries.push(rating.context.query);
                // Keep only top 20 most recent queries
                if (pattern.commonQueries.length > 20) {
                    pattern.commonQueries = pattern.commonQueries.slice(-20);
                }
            }

            // Update preferred features
            if (rating.metadata.featureUsed) {
                const feature = rating.metadata.featureUsed;
                if (!pattern.preferredFeatures.includes(feature)) {
                    pattern.preferredFeatures.push(feature);
                }
            }

            // Update response time expectations
            if (rating.context.responseTime) {
                pattern.responseTimeThreshold = Math.max(
                    pattern.responseTimeThreshold * 0.9 + (rating.context.responseTime || 0) * 0.1,
                    500 // Minimum 500ms threshold
                );
            }

            // Update learning progress
            const previousAccuracy = pattern.learningProgress.currentAccuracy;
            pattern.learningProgress.currentAccuracy = pattern.learningProgress.currentAccuracy * 0.8 + rating.score * 0.2;
            pattern.learningProgress.improvementRate = pattern.learningProgress.currentAccuracy - previousAccuracy;

            // Update strong/weak areas
            if (rating.score >= 4) {
                if (rating.metadata.featureUsed && !pattern.learningProgress.strongAreas.includes(rating.metadata.featureUsed)) {
                    pattern.learningProgress.strongAreas.push(rating.metadata.featureUsed);
                }
            } else if (rating.score <= 2) {
                if (rating.metadata.featureUsed && !pattern.learningProgress.weakAreas.includes(rating.metadata.featureUsed)) {
                    pattern.learningProgress.weakAreas.push(rating.metadata.featureUsed);
                }
            }

            this.userPatterns.set(userId, pattern);
            console.log(`📊 User pattern updated for ${userId}: accuracy ${pattern.learningProgress.currentAccuracy.toFixed(2)}`);

        } catch (error: unknown) {
            console.error('❌ Error updating user pattern: ', error);
        }
    }

    /**
     * Trigger adaptive learning based on rating patterns
     */
    private triggerAdaptiveLearning(rating: UserRating) {
        // If user consistently rates below their expected threshold, trigger retraining
        const pattern = this.userPatterns.get(rating.userId);
        if (pattern && pattern.learningProgress.currentAccuracy < pattern.qualityExpectations) {
            console.log(`🧠 Triggering adaptive learning for user ${rating.userId}`);
            // Add personalized training data
            this.schedulePersonalizedTraining(rating.userId);
        }

        // If rating is significantly below average, trigger immediate attention
        if (rating.score <= 1.5) {
            console.log(`🚨 Critical rating detected: ${rating.score}/5 - escalating for immediate review`);
            this.escalateCriticalFeedback(rating);
        }
    }

    /**
     * Schedule personalized training for specific user patterns
     */
    private async schedulePersonalizedTraining(userId: string) {
        try {
            const pattern = this.userPatterns.get(userId);
            if (!pattern) return;

            // Create training scenarios based on user's common queries and weak areas
            for (const query of pattern.commonQueries.slice(0, 5)) {
                for (const weakArea of pattern.learningProgress.weakAreas) {
                    const trainingScenario: TrainingDataPoint = {
                        input: query,
                        expectedOutput: '', // To be filled by improved AI response
                        actualOutput: '', // Previous poor response
                        userRating: pattern.qualityExpectations,
                        contextTags: [weakArea, 'personalized_training'],
                        difficultyLevel: this.assessDifficultyLevel(query)
                    };
                    this.trainingQueue.push(trainingScenario);
                }
            }
            console.log(`📚 Scheduled personalized training for user ${userId}: ${this.trainingQueue.length} scenarios`);
        } catch (error: unknown) {
            console.error('❌ Error scheduling personalized training: ', error);
        }
    }

    /**
     * Escalate critical feedback for immediate attention
     */
    private escalateCriticalFeedback(rating: UserRating) {
        // This could trigger immediate alerts, admin notifications, etc.
        console.log(`🚨 CRITICAL FEEDBACK ESCALATION: `);
        console.log(` User: ${rating.userId}`);
        console.log(` Rating: ${rating.score}/5`);
        console.log(` Type: ${rating.ratingType}`);
        console.log(` Feedback: ${rating.feedback}`);
        console.log(` Context: ${JSON.stringify(rating.context, null, 2)}`);
        // Could integrate with monitoring systems, Slack alerts, etc.
    }

    /**
     * Assess difficulty level of a query/task
     */
    private assessDifficultyLevel(query: string): 'beginner' | 'intermediate' | 'expert' {
        const complexityIndicators = [
            'precedent', 'constitutional', 'appellate', 'jurisdiction', 'statute of limitations',
            'tort liability', 'contract interpretation', 'discovery process', 'motion to dismiss', 'summary judgment'
        ];
        const advancedIndicators = [
            'class action', 'securities litigation', 'patent infringement', 'antitrust', 'merger',
            'acquisition', 'regulatory compliance', 'international law', 'arbitration', 'mediation'
        ];

        const queryLower = query.toLowerCase();

        if (advancedIndicators.some(indicator => queryLower.includes(indicator))) {
            return 'expert';
        } else if (complexityIndicators.some(indicator => queryLower.includes(indicator))) {
            return 'intermediate';
        } else {
            return 'beginner';
        }
    }

    /**
     * Start the continuous training loop
     */
    private startTrainingLoop() {
        setInterval(async () => {
            if (this.trainingQueue.length > 0) {
                await this.processTrainingQueue();
            }
        }, 30000); // Process every 30 seconds
        console.log('🔄 Feedback training loop started');
    }

    /**
     * Process queued training data
     */
    private async processTrainingQueue() {
        try {
            const batchSize = Math.min(this.trainingQueue.length, 10);
            const batch = this.trainingQueue.splice(0, batchSize);

            for (const dataPoint of batch) {
                // This is where integration with actual AI training would occur
                console.log(`🧠 Processing training data: ${dataPoint.input.substring(0, 50)}...`);

                // Update processed flag in database
                await db
                    .update((feedbackSchema as any).trainingData)
                    .set({ processed: true, updatedAt: new Date() })
                    .where(eq((feedbackSchema as any).trainingData.input, dataPoint.input));
            }
            console.log(`✅ Processed ${batch.length} training data points`);
        } catch (error: unknown) {
            console.error('❌ Error processing training queue: ', error);
        }
    }

    /**
     * Load user patterns from database on startup
     */
    private async loadUserPatterns() {
        try {
            // Load recent user patterns to rebuild in-memory cache
            const recentRatings = await db
                .select()
                .from((feedbackSchema as any).userRatings)
                .where(gte((feedbackSchema as any).userRatings.timestamp, sql`NOW() - INTERVAL '7 days'`))
                .orderBy(desc((feedbackSchema as any).userRatings.timestamp));

            // Group by user and rebuild patterns
            const userGroups: { [userId: string]: any[] } = {};

            for (const rating of recentRatings) {
                if (!userGroups[rating.userId]) {
                    userGroups[rating.userId] = [];
                }
                userGroups[rating.userId].push(rating);
            }

            // Rebuild patterns for each user
            for (const [userId, ratings] of Object.entries(userGroups)) {
                for (const rating of ratings) {
                    await this.updateUserBehaviorPattern(userId, {
                        ...rating,
                        // Drizzle should automatically parse JSONB columns, no need for JSON.parse
                        context: rating.context as any,
                        metadata: rating.metadata as any
                    } as UserRating);
                }
            }
            console.log(`📊 Loaded patterns for ${Object.keys(userGroups).length} users`);
        } catch (error: unknown) {
            console.error('❌ Error loading user patterns: ', error);
        }
    }

    /**
     * Get user-specific recommendations based on patterns
     */
    async getUserRecommendations(userId: string): Promise<any> {
        const pattern = this.userPatterns.get(userId);
        if (!pattern) {
            return {
                suggestedFeatures: ['ai_chat', 'document_search', 'case_analysis'],
                qualityImprovements: [],
                personalizedSettings: {}
            };
        }

        return {
            suggestedFeatures: pattern.preferredFeatures.slice(0, 5, qualityImprovements: pattern.learningProgress.weakAreas.map(area => `Consider using improved ${area} features`, personalizedSettings: {, responseTimeThreshold: pattern.responseTimeThreshold,
                qualityExpectations: pattern.qualityExpectations,
                difficultyPreference: pattern.commonQueries.length > 5 ? 'intermediate' : 'beginner'
            }
        };
    }

    /**
     * Get service-wide feedback metrics
     */
    async getFeedbackMetrics(): Promise<any> {
        try {
            // Get recent ratings for analysis
            const recentRatings = await db
                .select()
                .from((feedbackSchema as any).userRatings)
                .where(gte((feedbackSchema as any).userRatings.timestamp, sql`NOW() - INTERVAL '30 days'`));

            const totalRatings = recentRatings.length;
            const averageRating = totalRatings > 0 ? recentRatings.reduce((sum, r) => sum + r.score, 0) / totalRatings : 0;

            // Calculate rating distribution
            const ratingDistribution: { [score: number]: number } = {};
            for (let i = 1; i <= 5; i++) {
                ratingDistribution[i] = recentRatings.filter(r => Math.floor(r.score) === i).length;
            }

            // Calculate improvement trends by feature area
            const improvementTrends: { [area: string]: number } = {};
            for (const pattern of this.userPatterns.values()) {
                for (const area of pattern.learningProgress.strongAreas) {
                    improvementTrends[area] = (improvementTrends[area] || 0) + 1;
                }
            }

            return {
                averageRating,
                totalRatings,
                ratingDistribution,
                improvementTrends,
                activeTrainingItems: this.trainingQueue.length
            };
        } catch (error: unknown) {
            console.error('❌ Error getting feedback metrics: ', error);
            return {
                averageRating: 0,
                totalRatings: 0,
                ratingDistribution: {},
                improvementTrends: {},
                activeTrainingItems: 0
            };
        }
    }
}

// Export singleton instance
export const feedbackLoopService = new FeedbackLoopService();







