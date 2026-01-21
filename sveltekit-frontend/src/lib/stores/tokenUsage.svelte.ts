/**
 * Phase 76: Token Usage Tracker
 * Monitors AI API token consumption across Ollama/Gemini
 */

export class TokenTracker {
	// ========================================
	// Reactive State
	// ========================================

	/**
	 * Total tokens used in current session
	 */
	totalTokens = $state(0);

	/**
	 * Token limit (configurable)
	 */
	tokenLimit = $state(100000);

	/**
	 * Tokens used per model
	 */
	tokensByModel = $state<Record<string, number>>({
		ollama: 0, gemini: 0, other: 0
	});

	/**
	 * Request count
	 */
	requestCount = $state(0);

	/**
	 * Last reset timestamp
	 */
	lastReset = $state(Date.now());

	// ========================================
	// Computed Properties
	// ========================================

	/**
	 * Percentage of tokens used
	 */
	get percentageUsed(): number {
		return (this.totalTokens / this.tokenLimit) * 100;
	}

	/**
	 * Remaining tokens
	 */
	get remainingTokens(): number {
		return Math.max(0, this.tokenLimit - this.totalTokens);
	}

	/**
	 * Average tokens per request
	 */
	get averageTokensPerRequest(): number {
		return this.requestCount > 0
			? Math.round(this.totalTokens / this.requestCount)
			: 0;
	}

	/**
	 * Is approaching limit (>80%)
	 */
	get isApproachingLimit(): boolean {
		return this.percentageUsed > 80;
	}

	/**
	 * Is over limit
	 */
	get isOverLimit(): boolean {
		return this.totalTokens >= this.tokenLimit;
	}

	/**
	 * Status color for UI
	 */
	get statusColor(): string {
		if (this.percentageUsed < 50) return 'green';
		if (this.percentageUsed < 80) return 'yellow';
		return 'red';
	}

	// ========================================
	// Methods
	// ========================================

	/**
	 * Track token usage from AI response
	 */
	trackUsage(tokens: number, model: 'ollama' | 'gemini' | 'other' = 'ollama') {
		this.totalTokens += tokens;
		this.tokensByModel[model] = (this.tokensByModel[model] ?? 0) + tokens;
		this.requestCount++;

		// Warn if approaching limit
		if (this.isApproachingLimit && !this.isOverLimit) {
			console.warn(`⚠️ Token usage at ${this.percentageUsed.toFixed(1)}%`);
		}

		if (this.isOverLimit) {
			console.error(`❌ Token limit exceeded: ${this.totalTokens}/${this.tokenLimit}`);
		}
	}

	/**
	 * Reset token counter
	 */
	reset() {
		this.totalTokens = 0;
		this.tokensByModel = { ollama: 0, gemini: 0, other: 0 };
		this.requestCount = 0;
		this.lastReset = Date.now();

		console.log('✅ Token tracker reset');
	}

	/**
	 * Set custom token limit
	 */
	setLimit(limit: number) {
		this.tokenLimit = limit;
	}

	/**
	 * Get usage report
	 */
	getReport() {
		return {
			total: this.totalTokens,
			limit: this.tokenLimit,
			remaining: this.remainingTokens,
			percentage: this.percentageUsed,
			requests: this.requestCount,
			average: this.averageTokensPerRequest,
			byModel: { ...this.tokensByModel },
			lastReset: new Date(this.lastReset).toISOString(),
			status: this.isOverLimit ? 'over_limit' : this.isApproachingLimit ? 'warning' : 'ok'
		};
	}

	/**
	 * Export usage data as JSON
	 */
	export() {
		return this.getReport();
	}

	/**
	 * Import usage data from JSON
	 */
	import(data: ReturnType<typeof this.export>) {
		this.totalTokens = data.total;
		this.tokenLimit = data.limit;
		this.requestCount = data.requests;
		this.tokensByModel = data.byModel;
		this.lastReset = new Date(data.lastReset).getTime();
	}
}

export const tokenTracker = new TokenTracker();


