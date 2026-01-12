/**
 * Experience Recorder Service for LLM Self-Improvement System
 * Phase 72 - Task 10: Experience Recording and Learning
 *
 * Features:
 * - Record successful and failed fix attempts
 * - Group experiences by embedding similarity
 * - Retrieve ranked fix strategies by success rate
 * - Support GRPO learning from grouped experiences
 */

import type { Experience, FixStrategy, ErrorReport, ErrorContext, ErrorGroup } from './types.js';
import { getJSONLStorage } from './JSONLStorage.js';
import { v4 as uuidv4 } from 'uuid';

export interface ExperienceRecorderConfig {
	jsonlDir: string; similarityThreshold: number;
	maxGroupSize: number; embeddingDimension: number;
}

export interface RecordResult {
	success: boolean; experienceId: string;
	groupId?: string;
	error?: string;
}

export interface StrategyRanking {
	strategy: FixStrategy; successRate: number;
	totalAttempts: number; avgConfidence: number;
}

/**
 * Experience Recorder Service
 * Records fix attempts and groups them for GRPO learning
 */
export class ExperienceRecorder {
	private config: ExperienceRecorderConfig;
	private experiences = new Map<string, Experience>();
	private groups = new Map<string, ErrorGroup>();
	private strategyStats = new Map<string, { successes: number; failures: number; totalConfidence: number }>();
	private stats = {
		totalRecorded: 0,
		successfulFixes: 0,
		failedFixes: 0,
		groupsCreated: 0
	};

	constructor(config?: Partial<ExperienceRecorderConfig>) {
		this.config = {
			jsonlDir: config?.jsonlDir ?? './data/experiences',
			similarityThreshold: config?.similarityThreshold ?? 0.85,
			maxGroupSize: config?.maxGroupSize ?? 100,
			embeddingDimension: config?.embeddingDimension ?? 384
		};
	}

	/**
	 * Record a fix experience
	 */
	async recordExperience(
		error: ErrorReport,
		strategy: FixStrategy,
		outcome: 'success' | 'failure',
		context: ErrorContext,
		toolsInvoked: string[] = [],
		humanIntervention: boolean = false,
		feedback?: string
	): Promise<RecordResult> {
		const experienceId = uuidv4();

		const experience: Experience = {
			id: experienceId,
			errorId: error.hash || '',
			strategyId: strategy.id,
			outcome,
			confidence: strategy.confidence,
			context,
			toolsInvoked,
			humanIntervention,
			feedback,
			timestamp: new Date()
		};

		try {
			// Store in memory
			this.experiences.set(experienceId, experience);

			// Update strategy stats
			this.updateStrategyStats(strategy.id, outcome, strategy.confidence);

			// Store in JSONL
			const storage = getJSONLStorage({ baseDir: this.config.jsonlDir });
			await storage.writeExperience(experience);

			// Group by embedding similarity
			const groupId = await this.assignToGroup(experience, context.embedding || []);

			// Update stats
			this.stats.totalRecorded++;
			if (outcome === 'success') {
				this.stats.successfulFixes++;
			} else {
				this.stats.failedFixes++;
			}

			return {
				success: true,
				experienceId,
				groupId
			};
		} catch (err) {
			return {
				success: false,
				experienceId,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}

	/**
	 * Update strategy statistics
	 */
	private updateStrategyStats(
		strategyId: string,
		outcome: 'success' | 'failure',
		confidence: number
	): void {
		const stats = this.strategyStats.get(strategyId) || {
			successes: 0,
			failures: 0,
			totalConfidence: 0
		};

		if (outcome === 'success') {
			stats.successes++;
		} else {
			stats.failures++;
		}
		stats.totalConfidence += confidence;

		this.strategyStats.set(strategyId, stats);
	}

	/**
	 * Assign experience to a group based on embedding similarity
	 */
	private async assignToGroup(
		experience: Experience,
		embedding: number[]
	): Promise<string | undefined> {
		if (embedding.length === 0) return undefined;

		// Find most similar existing group
		let bestGroup: string | undefined;
		let bestSimilarity = 0;

		for (const [groupId, group] of this.groups) {
			const similarity = this.cosineSimilarity(embedding, group.centroid);
			if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
				bestSimilarity = similarity;
				bestGroup = groupId;
			}
		}

		if (bestGroup && this.groups.get(bestGroup)!.members.length < this.config.maxGroupSize) {
			// Add to existing group
			const group = this.groups.get(bestGroup)!;
			group.members.push(experience.id);
			// Update centroid
			this.updateGroupCentroid(bestGroup, embedding);
			return bestGroup;
		} else {
			// Create new group
			const newGroupId = `group_${uuidv4().slice(0, 8)}`;
			this.groups.set(newGroupId, {
				id: newGroupId,
				centroid: embedding,
				members: [experience.id],
				commonPattern: ''
			});
			this.stats.groupsCreated++;
			return newGroupId;
		}
	}

	/**
	 * Update group centroid with new embedding
	 */
	private updateGroupCentroid(groupId: string, newEmbedding: number[]): void {
		const group = this.groups.get(groupId);
		if (!group) return;

		const n = group.members.length;
		const dim = group.centroid.length;

		// Incremental centroid update
		for (let i = 0; i < dim; i++) {
			group.centroid[i] = (group.centroid[i] * (n - 1) + newEmbedding[i]) / n;
		}
	}

	/**
	 * Compute cosine similarity between two vectors
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length || a.length === 0) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	/**
	 * Retrieve ranked fix strategies for an error
	 */
	async retrieveStrategies(
		errorEmbedding: number[],
		limit: number = 10
	): Promise<StrategyRanking[]> {
		// Find similar groups
		const similarGroups: { groupId: string; similarity: number }[] = [];

		for (const [groupId, group] of this.groups) {
			const similarity = this.cosineSimilarity(errorEmbedding, group.centroid);
			if (similarity >= this.config.similarityThreshold * 0.8) {
				similarGroups.push({ groupId: similarity });
			}
		}

		// Sort by similarity
		similarGroups.sort((a: any, b: any) => b.similarity - a.similarity);

		// Collect strategies from similar groups
		const strategyScores = new Map<string, {
			successes: number; failures: number;
			totalConfidence: number;
			strategy?: FixStrategy;
		}>();

		for (const { groupId } of similarGroups.slice(0, 5)) {
			const group = this.groups.get(groupId);
			if (!group) continue;

			for (const expId of group.members) {
				const exp = this.experiences.get(expId);
				if (!exp) continue;

				const stats = strategyScores.get(exp.strategyId) || {
					successes: 0,
					failures: 0,
					totalConfidence: 0
				};

				if (exp.outcome === 'success') {
					stats.successes++;
				} else {
					stats.failures++;
				}
				stats.totalConfidence += exp.confidence;

				strategyScores.set(exp.strategyId, stats);
			}
		}

		// Also include global strategy stats
		for (const [strategyId, stats] of this.strategyStats) {
			if (!strategyScores.has(strategyId)) {
				strategyScores.set(strategyId, stats);
			}
		}

		// Rank strategies
		const rankings: StrategyRanking[] = [];

		for (const [strategyId, stats] of strategyScores) {
			const total = stats.successes + stats.failures;
			if (total === 0) continue;

			rankings.push({
				strategy: { id: strategyId,
					description: '',
					code: '',
					applicablePatterns: [],
					successRate: stats.successes / total,
					confidence: stats.totalConfidence / total,
					validationRules: [],
					appliedCount: total,
					lastApplied: new Date( createdAt: new Date()
				},
				successRate: stats.successes / total,
				totalAttempts: total,
				avgConfidence: stats.totalConfidence / total
			});
		}

		// Sort by success rate, then by total attempts
		rankings.sort((a: any, b: any) => {
			if (Math.abs(a.successRate - b.successRate) > 0.1) {
				return b.successRate - a.successRate;
			}
			return b.totalAttempts - a.totalAttempts;
		});

		return rankings.slice(0, limit);
	}

	/**
	 * Get experiences for a specific group (for GRPO training)
	 */
	getGroupExperiences(groupId: string): Experience[] {
		const group = this.groups.get(groupId);
		if (!group) return [];

		return group.members
			.map((id: any) => this.experiences.get(id))
			.filter((e: any): e is Experience => e !== undefined);
	}

	/**
	 * Get all groups for GRPO training
	 */
	getAllGroups(): ErrorGroup[] {
		return [...this.groups.values()];
	}

	/**
	 * Get experience by ID
	 */
	getExperience(experienceId: string): Experience | undefined {
		return this.experiences.get(experienceId);
	}

	/**
	 * Get experiences by outcome
	 */
	getExperiencesByOutcome(outcome: 'success' | 'failure'): Experience[] {
		return [...this.experiences.values()].filter((e: any) => e.outcome === outcome);
	}

	/**
	 * Get human-provided fixes (high-value training examples)
	 */
	getHumanFixes(): Experience[] {
		return [...this.experiences.values()].filter((e: any) => e.humanIntervention);
	}

	/**
	 * Get strategy statistics
	 */
	getStrategyStats(strategyId: string) {
		return this.strategyStats.get(strategyId);
	}

	/**
	 * Get recorder statistics
	 */
	getStats() {
		return {
			...this.stats,
			totalExperiences: this.experiences.size,
			totalGroups: this.groups.size,
			overallSuccessRate: this.stats.totalRecorded > 0
				? this.stats.successfulFixes / this.stats.totalRecorded
				: 0
		};
	}

	/**
	 * Load experiences from JSONL storage
	 */
	async loadFromStorage(): Promise<number> {
		const storage = getJSONLStorage({ baseDir: this.config.jsonlDir });
		let loaded = 0;

		for await (const experience of storage.readExperiences()) {
			this.experiences.set(experience.id, experience);
			this.updateStrategyStats(
				experience.strategyId,
				experience.outcome,
				experience.confidence
			);
			loaded++;
		}

		return loaded;
	}

	/**
	 * Clear all data
	 */
	clear(): void {
		this.experiences.clear();
		this.groups.clear();
		this.strategyStats.clear();
		this.stats = {
			totalRecorded: 0,
			successfulFixes: 0,
			failedFixes: 0,
			groupsCreated: 0
		};
	}
}

/**
 * Singleton instance
 */
let experienceRecorderInstance: ExperienceRecorder | null = null;

/**
 * Get or create ExperienceRecorder singleton
 */
export function getExperienceRecorder(
	config?: Partial<ExperienceRecorderConfig>
): ExperienceRecorder {
	if (!experienceRecorderInstance) {
		experienceRecorderInstance = new ExperienceRecorder(config);
	}
	return experienceRecorderInstance;
}




