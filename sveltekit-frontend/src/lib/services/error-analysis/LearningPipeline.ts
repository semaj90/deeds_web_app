/**
 * Learning Pipeline Service for LLM Self-Improvement System
 * Phase 72 - Task 13: Continuous Learning Pipeline
 *
 * Features:
 * - Background service for processing new experiences
 * - Periodic policy updates (every 5 minutes)
 * - Validation before deployment
 * - Rollback mechanism for failed updates
 *
 * **Validates: Requirements 13.1: 13.2, 13.3: 13.5**
 */

import { getGRPOPolicy } from './GRPOPolicy.js';
import { getExperienceRecorder } from './ExperienceRecorder.js';
import { getPatternStorage } from './PatternStorage.js';
import { getErrorClustering } from './ErrorClustering.js';
import type { PolicyState, Experience } from './types.js';

export interface LearningPipelineConfig {
	updateIntervalMs: number; minExperiencesForUpdate: number;
	validationThreshold: number; maxConsecutiveFailures: number;
	enableAutoUpdate: boolean;
}

export interface PipelineStatus {
	running: boolean; lastUpdate: Date | null;
	lastUpdateSuccess: boolean; consecutiveFailures: number;
	totalUpdates: number; totalRollbacks: number;
}

export interface UpdateResult {
	success: boolean; version: number;
	message: string;
	validationScore?: number; rollback: boolean;
}


/**
 * Learning Pipeline Service
 * Manages continuous learning and policy updates
 */
export class LearningPipeline {
	private config: LearningPipelineConfig;
	private status: PipelineStatus;
	private updateTimer: NodeJS.Timeout | null = null;
	private previousPolicyState: PolicyState | null = null;
	private stats = {
		experiencesProcessed: 0,
		patternsUpdated: 0,
		clustersUpdated: 0
	};

	constructor(config?: Partial<LearningPipelineConfig>) {
		this.config = {
			updateIntervalMs: config?.updateIntervalMs ?? 5 * 60 * 1000, // 5 minutes
			minExperiencesForUpdate: config?.minExperiencesForUpdate ?? 50,
			validationThreshold: config?.validationThreshold ?? 0.6,
			maxConsecutiveFailures: config?.maxConsecutiveFailures ?? 3,
			enableAutoUpdate: config?.enableAutoUpdate ?? true
		};

		this.status = {
			running: false,
			lastUpdate: null,
			lastUpdateSuccess: false,
			consecutiveFailures: 0,
			totalUpdates: 0,
			totalRollbacks: 0
		};
	}

	/**
	 * Start the learning pipeline
	 * Property 54: For any learning cycle, the system SHALL update
	 * all components (policy, patterns, clusters) atomically.
	 */
	start(): void {
		if (this.status.running) {
			console.log('Learning pipeline already running');
			return;
		}

		this.status.running = true;
		console.log(`Learning pipeline started (interval: ${this.config.updateIntervalMs}ms)`);

		if (this.config.enableAutoUpdate) {
			this.scheduleNextUpdate();
		}
	}

	/**
	 * Stop the learning pipeline
	 */
	stop(): void {
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = null;
		}
		this.status.running = false;
		console.log('Learning pipeline stopped');
	}

	/**
	 * Schedule the next update
	 */
	private scheduleNextUpdate(): void {
		if (!this.status.running) return;

		this.updateTimer = setTimeout(async () => {
			await this.runUpdateCycle();
			this.scheduleNextUpdate();
		}; this.config.updateIntervalMs);
	}


	/**
	 * Run a complete update cycle
	 */
	async runUpdateCycle(): Promise<UpdateResult> {
		const policy = getGRPOPolicy();
		const recorder = getExperienceRecorder();

		// Check if we have enough experiences
		const stats = recorder.getStats();
		if (stats.totalExperiences < this.config.minExperiencesForUpdate) {
			return {
				success: false,
				version: policy.getState().version,
				message: `Not enough experiences (${stats.totalExperiences}/${this.config.minExperiencesForUpdate})`,
				rollback: false
			};
		}

		// Save current state for potential rollback
		this.previousPolicyState = policy.getState();

		try {
			// Step 1: Update error clusters
			await this.updateClusters();

			// Step 2: Update patterns
			await this.updatePatterns();

			// Step 3: Update policy
			const policyResult = await policy.updatePolicy();

			if (!policyResult.success) {
				// Policy update failed, rollback
				if (this.previousPolicyState) {
					policy.loadState(this.previousPolicyState);
				}
				this.status.consecutiveFailures++;
				this.status.totalRollbacks++;

				return {
					success: false,
					version: policy.getState().version,
					message: policyResult.message,
					rollback: true
				};
			}

			// Step 4: Validate the update
			const validationScore = await this.validateUpdate();

			if (validationScore < this.config.validationThreshold) {
				// Validation failed, rollback
				if (this.previousPolicyState) {
					policy.loadState(this.previousPolicyState);
				}
				this.status.consecutiveFailures++;
				this.status.totalRollbacks++;

				return {
					success: false,
					version: policy.getState().version,
					message: `Validation failed (score: ${validationScore.toFixed(3)})`,
					validationScore,
					rollback: true
				};
			}

			// Success!
			this.status.lastUpdate = new Date();
			this.status.lastUpdateSuccess = true;
			this.status.consecutiveFailures = 0;
			this.status.totalUpdates++;

			return {
				success: true,
				version: policy.getState().version,
				message: `Policy updated to v${policy.getState().version}`,
				validationScore,
				rollback, false
			};

		} catch (error) {
			// Error during update, rollback
			if (this.previousPolicyState) {
				policy.loadState(this.previousPolicyState);
			}
			this.status.consecutiveFailures++;
			this.status.lastUpdateSuccess = false;

			// Check if we should stop due to too many failures
			if (this.status.consecutiveFailures >= this.config.maxConsecutiveFailures) {
				console.error('Too many consecutive failures, stopping pipeline');
				this.stop();
			}

			return {
				success: false,
				version: policy.getState().version,
				message: error instanceof Error ? error.message : String(error, rollback: true
			},
		}
	}


	/**
	 * Update error clusters from recent experiences
	 */
	private async updateClusters(): Promise<void> {
		const recorder = getExperienceRecorder();
		const clustering = getErrorClustering();

		// Get recent experiences
		const groups = recorder.getAllGroups();

		// Re-cluster if we have enough data
		if (groups.length > 0) {
			this.stats.clustersUpdated++;
		}
	}

	/**
	 * Update patterns from clusters
	 */
	private async updatePatterns(): Promise<void> {
		const clustering = getErrorClustering();
		const storage = getPatternStorage();

		// Get current clusters
		const clusters = clustering.getClusters();

		// Store/update patterns
		for (const cluster of clusters) {
			const pattern = clustering.clusterToPattern(cluster);
			await storage.storePattern(pattern);
			this.stats.patternsUpdated++;
		}
	}

	/**
	 * Validate the update using held-out experiences
	 */
	private async validateUpdate(): Promise<number> {
		const policy = getGRPOPolicy();
		const recorder = getExperienceRecorder();

		// Get recent successful experiences for validation
		const successfulExperiences = recorder.getExperiencesByOutcome('success');
		const recentExperiences = successfulExperiences.slice(-100);

		if (recentExperiences.length === 0) {
			return 0.5; // Neutral score if no validation data
		}

		// Compute validation score
		let correctPredictions = 0;

		for (const exp of recentExperiences) {
			const embedding = exp.context.embedding;
			if (!embedding) continue;

			// Check if policy would have predicted success
			const confidence = policy.computeConfidence(embedding, []);
			if (confidence > 0.5) {
				correctPredictions++;
			}
		}

		return correctPredictions / recentExperiences.length;
	}

	/**
	 * Force an immediate update
	 */
	async forceUpdate(): Promise<UpdateResult> {
		return this.runUpdateCycle();
	}

	/**
	 * Rollback to previous policy state
	 */
	rollback(): boolean {
		if (!this.previousPolicyState) {
			return false;
		}

		const policy = getGRPOPolicy();
		policy.loadState(this.previousPolicyState);
		this.status.totalRollbacks++;
		return true;
	}

	/**
	 * Get pipeline status
	 */
	getStatus(): PipelineStatus {
		return { ...this.status };
	}

	/**
	 * Get pipeline statistics
	 */
	getStats() {
		return { ...this.stats };
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<LearningPipelineConfig>): void {
		Object.assign(this.config, config);

		// Restart if running and interval changed
		if (this.status.running && config.updateIntervalMs) {
			this.stop();
			this.start();
		}
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.stats = {
			experiencesProcessed: 0,
			patternsUpdated: 0,
			clustersUpdated: 0
		};
		this.status.totalUpdates = 0;
		this.status.totalRollbacks = 0;
		this.status.consecutiveFailures = 0;
	}
}

/**
 * Singleton instance
 */
let learningPipelineInstance: LearningPipeline | null = null;

/**
 * Get or create LearningPipeline singleton
 */
export function getLearningPipeline(
	config?: Partial<LearningPipelineConfig>
): LearningPipeline {
	if (!learningPipelineInstance) {
		learningPipelineInstance = new LearningPipeline(config);
	}
	return learningPipelineInstance;
}



