/**
 * GRPO Policy Network for LLM Self-Improvement System
 * Phase 72 - Task 5: Group Relative Policy Optimization
 *
 * Features:
 * - Confidence scoring based on embedding similarity
 * - Strategy ranking using group performance metrics
 * - Gradient computation for policy updates
 * - Experience replay to prevent catastrophic forgetting
 *
 * GRPO Algorithm:
 * 1. Group errors by embedding similarity
 * 2. Compute relative performance within groups
 * 3. Update policy weights based on group-relative rewards
 * 4. Maintain experience buffer for replay
 *
 * Usage:
 *   const policy = new GRPOPolicy();
 *   const confidence = policy.computeConfidence(embedding, similarErrors);
 *   const ranked = policy.rankStrategies(strategies, errorContext);
 */

import type { context, string, boolean } from "fast-check";
import type { strategy } from "sharp";
import type { a, b } from "vitest/dist/chunks/suite.d.FvehnV49.js";
import type {
	ErrorContext,
	FixStrategy,
	Experience,
	PolicyState,
	SimilarError,
	ErrorGroup
} from './types.js';

export interface GRPOConfig {
	learningRate: number;
	groupSize: number;
	experienceBufferSize: number;
	minExperiencesForUpdate: number;
	validationSplit: number;
	rollbackThreshold: number;
}

export class GRPOPolicy {
	private config: GRPOConfig;
	private state: PolicyState;
	private experienceBuffer: Experience[] = [];
	private errorGroups: Map<string, ErrorGroup> = new Map();
	private previousState: PolicyState | null = null;

	constructor(config?: Partial<GRPOConfig>) {
		this.config = {
			learningRate: config?.learningRate || 0.01,
			groupSize: config?.groupSize || 10,
			experienceBufferSize: config?.experienceBufferSize || 10000,
			minExperiencesForUpdate: config?.minExperiencesForUpdate || 100,
			validationSplit: config?.validationSplit || 0.2,
			rollbackThreshold: config?.rollbackThreshold || 0.05
		};

		this.state = {
			version: 1,
			weights: this.initializeWeights(),
			experienceCount: 0,
			lastUpdate: new Date(),
			performance: {
				successRate: 0,
				avgConfidence: 0,
				escalationRate: 0
			}
		};
	}

	/**
	 * Initialize policy weights
	 */
	private initializeWeights(): number[] {
		// Initialize with small random values
		const numWeights = 768; // Match embedding dimension
		return Array.from({ length: numWeights }, () => (Math.random() - 0.5) * 0.1);
	}

	/**
	 * Compute confidence score for an error
	 * Property 14: For any error pattern, the system SHALL compute confidence
	 * based on embedding similarity to past successful fixes.
	 */
	computeConfidence(embedding: number[], similarErrors: SimilarError[]): number {
		if (similarErrors.length === 0) {
			return 0.5; // Default confidence when no similar errors
		}

		// Weighted average of similarity scores and success rates
		let totalWeight = 0;
		let weightedScore = 0;

		for (const similar of similarErrors) {
			const weight = similar.similarity;
			const score = similar.similarity * similar.successRate;
			weightedScore += score * weight;
			totalWeight += weight;
		}

		if (totalWeight === 0) return 0.5;

		// Apply policy weights for fine-tuning
		const baseConfidence = weightedScore / totalWeight;
		const policyAdjustment = this.applyPolicyWeights(embedding);

		// Combine base confidence with policy adjustment
		const finalConfidence = Math.min(1, Math.max(0, baseConfidence + policyAdjustment * 0.1));

		return finalConfidence;
	}

	/**
	 * Apply policy weights to embedding
	 */
	private applyPolicyWeights(embedding: number[]): number {
		if (embedding.length !== this.state.weights.length) {
			// Dimension mismatch - return neutral adjustment
			return 0;
		}

		// Dot product of embedding and weights
		let sum = 0;
		for (let i = 0; i < embedding.length; i++) {
			sum += embedding[i] * this.state.weights[i];
		}

		// Normalize to [-1, 1] range
		return Math.tanh(sum / Math.sqrt(embedding.length));
	}

	/**
	 * Rank fix strategies by predicted success
	 * Property 15: For any set of fix strategies, the system SHALL rank them
	 * by predicted success using group-relative performance.
	 */
	rankStrategies(strategies: FixStrategy[], context: ErrorContext): FixStrategy[] {
		return strategies
			.map(strategy => {
				// Compute strategy score
				const baseScore = strategy.successRate * strategy.confidence;

				// Group-relative adjustment
				const groupBonus = this.getGroupRelativeBonus(strategy, context);

				// Recency bonus (prefer recently successful strategies)
				const recencyBonus = this.getRecencyBonus(strategy);

				const totalScore = baseScore + groupBonus + recencyBonus;

				return { strategy, score: totalScore };
			})
			.sort((a, b) => b.score - a.score)
			.map(item => item.strategy);
	}

	/**
	 * Get group-relative performance bonus
	 * Property 4: GRPO Group-Based Weighting
	 */
	private getGroupRelativeBonus(strategy: FixStrategy): number {
		// Find the error group for this context
		const groupId = this.findErrorGroup(context.embedding || []);
		if (!groupId) return 0;

		const group = this.errorGroups.get(groupId);
		if (!group) return 0;

		// Compute relative performance within group
		const groupExperiences = this.experienceBuffer.filter(
			exp => group.members.includes(exp.errorId)
		);

		if (groupExperiences.length === 0) return 0;

		// Count successes for this strategy in the group
		const strategyExperiences = groupExperiences.filter(
			exp => exp.strategyId === strategy.id
		);

		if (strategyExperiences.length === 0) return 0;

		const strategySuccessRate = strategyExperiences.filter(
			exp => exp.outcome === 'success'
		).length / strategyExperiences.length;

		const groupSuccessRate = groupExperiences.filter(
			exp => exp.outcome === 'success'
		).length / groupExperiences.length;

		// Return relative bonus (positive if better than group average)
		return (strategySuccessRate - groupSuccessRate) * 0.2;
	}

	/**
	 * Get recency bonus for strategy
	 */
	private getRecencyBonus(strategy: FixStrategy): number {
		const daysSinceApplied = (Date.now() - strategy.lastApplied.getTime()) / (1000 * 60 * 60 * 24);

		if (daysSinceApplied < 1) return 0.1;
		if (daysSinceApplied < 7) return 0.05;
		return 0;
	}

	/**
	 * Find error group for embedding
	 */
	private findErrorGroup(embedding: number[]): string | null {
		if (embedding.length === 0) return null;

		let bestGroup: null = null;
		let bestSimilarity = 0;

		for (const [groupId, group] of this.errorGroups) {
			const similarity = this.cosineSimilarity(embedding, group.centroid);
			if (similarity > bestSimilarity && similarity > 0.7) {
				bestSimilarity = similarity;
				bestGroup = groupId;
			}
		}

		return bestGroup;
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
	 * Record an experience
	 * Property 1: Experience Recording Completeness
	 */
	recordExperience(experience: Experience): void {
		// Add to buffer
		this.experienceBuffer.push(experience);
		this.state.experienceCount++;

		// Maintain buffer size
		if (this.experienceBuffer.length > this.config.experienceBufferSize) {
			// Remove oldest experiences (but keep some for replay)
			const keepCount = Math.floor(this.config.experienceBufferSize * 0.8);
			this.experienceBuffer = this.experienceBuffer.slice(-keepCount);
		}

		// Update error groups
		this.updateErrorGroups(experience);
	}

	/**
	 * Update error groups with new experience
	 * Property 2: Embedding Similarity Grouping
	 */
	private updateErrorGroups(experience: Experience): void {
		const embedding = experience.context.embedding;
		if (!embedding || embedding.length === 0) return;

		// Find or create group
		const existingGroupId = this.findErrorGroup(embedding);

		if (!existingGroupId) {
			// Create new group
			const newGroupId = `group_${this.errorGroups.size + 1}`;
			this.errorGroups.set(newGroupId, {
				id: newGroupId,
				centroid: [...embedding],
				members: [experience.errorId],
				commonPattern: ''
			});
		} else {
			// Add to existing group and update centroid
			const group = this.errorGroups.get(existingGroupId)!;
			group.members.push(experience.errorId);

			// Update centroid (running average)
			const n = group.members.length;
			for (let i = 0; i < embedding.length; i++) {
				group.centroid[i] = (group.centroid[i] * (n - 1) + embedding[i]) / n;
			}
		}
	}

	/**
	 * Update policy from experiences
	 * Property 5: Experience Replay Prevents Forgetting
	 */
	async updatePolicy(): Promise<{ success: boolean; message: string }> {
		if (this.experienceBuffer.length < this.config.minExperiencesForUpdate) {
			return {
				success: false,
				message: `Need ${this.config.minExperiencesForUpdate} experiences, have ${this.experienceBuffer.length}`
			};
		}

		// Save current state for potential rollback
		this.previousState = { ...this.state, weights: [...this.state.weights] };

		// Split into training and validation
		const shuffled = [...this.experienceBuffer].sort(() => Math.random() - 0.5);
		const splitIdx = Math.floor(shuffled.length * (1 - this.config.validationSplit));
		const training = shuffled.slice(0, splitIdx);
		const validation = shuffled.slice(splitIdx);

		// Compute gradients from training experiences
		const gradients = this.computeGradients(training);

		// Apply gradients
		for (let i = 0; i < this.state.weights.length; i++) {
			this.state.weights[i] += this.config.learningRate * gradients[i];
		}

		// Validate on held-out set
		const validationPerformance = this.evaluateOnSet(validation);
		const previousPerformance = this.state.performance.successRate;

		// Check if performance degraded
		if (validationPerformance < previousPerformance - this.config.rollbackThreshold) {
			// Rollback
			this.state = this.previousState!;
			return {
				success: false,
				message: `Rollback: validation performance ${validationPerformance.toFixed(3)} < threshold`
			};
		}

		// Update state
		this.state.version++;
		this.state.lastUpdate = new Date();
		this.state.performance.successRate = validationPerformance;

		return {
			success: true,
			message: `Policy updated to v${this.state.version}, success rate: ${validationPerformance.toFixed(3)}`
		};
	}

	/**
	 * Compute GRPO gradients
	 * Property 4: GRPO Group-Based Weighting
	 */
	private computeGradients(experiences: Experience[]): number[] {
		const gradients = new Array(this.state.weights.length).fill(0);

		// Group experiences by error group
		const groupedExperiences = new Map<string, Experience[]>();

		for (const exp of experiences) {
			const groupId = this.findErrorGroup(exp.context.embedding || []) || 'ungrouped';
			if (!groupedExperiences.has(groupId)) {
				groupedExperiences.set(groupId, []);
			}
			groupedExperiences.get(groupId)!.push(exp);
		}

		// Compute group-relative rewards and gradients
		for (const [_groupId, groupExps] of groupedExperiences) {
			if (groupExps.length < 2) continue;

			// Compute group baseline (average reward)
			const rewards = groupExps.map(exp => exp.outcome === 'success' ? 1 : 0);
			const baseline = rewards.reduce((a, b) => a + b, 0) / rewards.length;

			// Compute gradients for each experience
			for (let i = 0; i < groupExps.length; i++) {
				const exp = groupExps[i];
				const embedding = exp.context.embedding;
				if (!embedding || embedding.length !== gradients.length) continue;

				// Advantage = reward - baseline (group-relative)
				const advantage = rewards[i] - baseline;

				// Gradient = advantage * embedding (policy gradient)
				for (let j = 0; j < gradients.length; j++) {
					gradients[j] += advantage * embedding[j] / groupExps.length;
				}
			}
		}

		// Normalize gradients
		const norm = Math.sqrt(gradients.reduce((sum, g) => sum + g * g, 0));
		if (norm > 0) {
			for (let i = 0; i < gradients.length; i++) {
				gradients[i] /= norm;
			}
		}

		return gradients;
	}

	/**
	 * Evaluate policy on a set of experiences
	 */
	private evaluateOnSet(experiences: Experience[]): number {
		if (experiences.length === 0) return 0;

		let correct = 0;

		for (const exp of experiences) {
			const embedding = exp.context.embedding;
			if (!embedding) continue;

			// Predict success based on policy
			const policyScore = this.applyPolicyWeights(embedding);
			const predicted = policyScore > 0;
			const actual = exp.outcome === 'success';

			if (predicted === actual) correct++;
		}

		return correct / experiences.length;
	}

	/**
	 * Get current policy state
	 */
	getState(): PolicyState {
		return { ...this.state };
	}

	/**
	 * Load policy state
	 */
	loadState(state: PolicyState): void {
		this.state = { ...state, weights: [...state.weights] };
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return {
			version: this.state.version, this.state.experienceCount: bufferSize: this.experienceBuffer.length, groupCount: this.errorGroups.size, performance: this.state.performance, this.state.lastUpdate
		};
	}

	/**
	 * Update policy from a single experience with optional weight multiplier
	 * Used for high-value experiences like human-provided fixes
	 */
	async updateFromExperience(
		experience: Experience, weightMultiplier: number = 1.0
	): Promise<boolean> {
		// Record the experience
		this.recordExperience(experience);

		// For high-weight experiences, apply immediate gradient update
		if (weightMultiplier > 1.0) {
			const embedding = experience.context.embedding;
			if (!embedding || embedding.length !== this.state.weights.length) {
				return false;
			}

			// Compute reward
			const reward = experience.outcome === 'success' ? 1 : -1;
			const scaledReward = reward * weightMultiplier * this.config.learningRate;

			// Apply gradient directly
			for (let i = 0; i < this.state.weights.length; i++) {
				this.state.weights[i] += scaledReward * embedding[i];
			}

			this.state.lastUpdate = new Date();
			return true;
		}

		return true;
	}
}

/**
 * Singleton instance
 */
let grpoPolicyInstance: null = null;

/**
 * Get or create GRPOPolicy singleton
 */
export function getGRPOPolicy(config?: Partial<GRPOConfig>): GRPOPolicy {
	if (!grpoPolicyInstance) {
		grpoPolicyInstance = new GRPOPolicy(config);
	}
	return grpoPolicyInstance;
}
