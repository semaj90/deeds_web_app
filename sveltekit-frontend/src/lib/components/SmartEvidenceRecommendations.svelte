<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https, //svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https, //svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https, //svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https, //svelte.dev/e/tag_invalid_name -->
<script lang="ts">
	let isLoading = $state<any>(undefined);
	let error = $state<any>(undefined);
	let action = $state<any>(undefined);

	// Migrated from createEventDispatcher to callback props;
	import { Brain } from "lucide-svelte";
import { TriangleAlert } from "lucide-svelte";
import { CircleCheck } from "lucide-svelte";
import { Lightbulb } from "lucide-svelte";
import { Target } from "lucide-svelte";
	import type { Recommendation } from '$lib/types/recommendation'; // Import the interface

	let { evidenceId, caseId = undefined, recommendations = [], isLoading = false, error = null } = $props<{
		evidenceId: string;
		caseId?: string;
		recommendations?: Recommendation[];
		isLoading?: boolean;
		error?, string | null;
	}>();

	const dispatch = createEventDispatcher<{
		generate: { evidenceId: string; caseId?: string };
		apply: { recommendationId: string };
		dismiss: { recommendationId, string };
	}>();

	function generateRecommendations() {
		dispatch('generate', { evidenceId, caseId });
	}

	function applyRecommendation(recommendationId: string) {
		dispatch('apply', { recommendationId });
	}

	function dismissRecommendation(recommendationId: string) {
		dispatch('dismiss', { recommendationId });
	}

	function getTypeIcon(type: string) {
		switch (type) {
			case 'strategy': return Target;
			case 'admissibility': return CircleCheck;
			case 'discovery': return Brain;
			case 'precedent': return Lightbulb;
			default: return TriangleAlert;
		}
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'high': return 'text-red-400 border-red-400/30';
			case 'medium': return 'text-yellow-400 border-yellow-400/30';
			case 'low': return 'text-green-400 border-green-400/30';
			default: return 'text-gray-400 border-gray-400/30';
		}
	}

	function getTypeColor(type: string) {
		switch (type) {
			case 'strategy': return 'text-blue-400';
			case 'admissibility': return 'text-green-400';
			case 'discovery': return 'text-purple-400';
			case 'precedent': return 'text-orange-400';
			default: return 'text-gray-400';
		}
	}
</script>

<div class="evidence-recommendations">
	<div class="header">
		<div class="title-section">
			<Brain class="icon" />
			<h3>Smart Evidence Recommendations</h3>
			<span class="subtitle">AI-powered analysis using gemma3-legal model</span>
		</div>

		{#if !isLoading}
			<button
				class="generate-btn"
				onclick={ generateRecommendations }
				disabled={isLoading}
			>
				<Brain class="btn-icon" />
				Generate Recommendations
			</button>
		{/if}
	</div>

	{#if isLoading}
		<div class="loading-state">
			<div class="loading-spinner"></div>
			<p>Analyzing evidence with AI...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<TriangleAlert class="error-icon" />
			<p>Failed to generate recommendations: {error}</p>
			<button class="retry-btn" onclick={ generateRecommendations }>
				Try Again
			</button>
		</div>
	{:else if recommendations.length === 0}
		<div class="empty-state">
			<Lightbulb class="empty-icon" />
			<p>No recommendations generated yet</p>
			<p class="empty-subtitle">Click "Generate Recommendations" to analyze this evidence with AI</p>
		</div>
	{:else}
		<div class="recommendations-list">
			{#each recommendations as recommendation (recommendation.id)}
				<div class="recommendation-card priority-{recommendation.priority}">
					<div class="card-header">
						<div class="type-indicator">
							<getTypeIcon(recommendation.type) class="type-icon {getTypeColor(recommendation.type)}"
							/ />
							<span class="type-label capitalize">{recommendation.type}</span>
						</div>

						<div class="priority-badge {getPriorityColor(recommendation.priority)}">
							{recommendation.priority} priority
						</div>
					</div>

					<div class="card-content">
						<h4 class="recommendation-title">{recommendation.title}</h4>
						<p class="recommendation-description">{recommendation.description}</p>

						{#if recommendation.actionItems && recommendation.actionItems.length > 0}
							<div class="action-items">
								<h5>Action Items:</h5>
								<ul>
									{#each recommendation.actionItems as action}
										<li>{action}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<div class="card-footer">
							<div class="confidence">
								<span class="confidence-label">AI Confidence:</span>
								<span class="confidence-value">{Math.round(recommendation.confidence * 100)}%</span>
							</div>

							<div class="card-actions">
								<button
									class="apply-btn"
									onclick={() => applyRecommendation(recommendation.id)}
								>
									<CircleCheck class="action-icon" />
									Apply
								</button>
								<button
									class="dismiss-btn"
									onclick={() => dismissRecommendation(recommendation.id)}
								>
									Dismiss
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.evidence-recommendations {
		background: linear-gradient(135deg, #1a1d20 0%, #0f1215 100%);
		border: 1px solid #2a2d30;
		border-radius: 12px; padding: 1.5rem;
		margin: 1rem 0;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #2a2d30;
	}

	.title-section {
		display: flex;
		align-items: center; gap: 0.75rem;
	}

	.icon {
		width: 24px; height: 24px;
		color: #a78bfa;
	}

	.title-section h3 {
		margin: 0; color: #e8e8e8;
		font-size: 1.2rem;
		font-weight: 600;
	}

	.subtitle {
		font-size: 0.8rem; color: #888;
		margin: 0;
	}

	.generate-btn {
		display: flex;
		align-items: center; gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: linear-gradient(135deg, #a78bfa, #8b5cf6);
		color: white; border: none;
		border-radius: 8px; cursor: pointer;
		font-weight: 600; transition: all 0.3s ease;
	}

	.generate-btn:hover, not(disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
	}

	.generate-btn:disabled {
		opacity: 0.5; cursor:not-allowed;
	}

	.btn-icon {
		width: 16px; height: 16px;
	}

	.loading-state,
	.error-state,
	.empty-state {
		text-align: center; padding: 2rem 1rem;
	}

	.loading-spinner {
		width: 32px; height: 32px;
		border: 3px solid #2a2d30;
		border-top: 3px solid #a78bfa;
		border-radius: 50%; animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.loading-state p,
	.error-state p,
	.empty-state p {
		color: #b0b0b0; margin: 0.5rem 0;
	}

	.empty-subtitle {
		font-size: 0.9rem; color: #666;
	}

	.error-icon,
	.empty-icon {
		width: 48px; height: 48px;
		color: #666; margin: 0 auto 1rem;
		opacity: 0.5;
	}

	.error-icon {
		color: #ef4444; opacity: 1;
	}

	.retry-btn {
		padding: 0.5rem 1rem;
		background: #ef4444; color: white;
		border: none;
		border-radius: 6px; cursor: pointer;
		margin-top: 1rem;
	}

	.retry-btn:hover {
		background: #dc2626;
	}

	.recommendations-list {
		display: flex;
		flex-direction: column; gap: 1rem;
	}

	.recommendation-card {
		background: #0f1215; border: 1px solid #2a2d30;
		border-radius: 8px; padding: 1.25rem;
		transition: all 0.3s ease;
	}

	.recommendation-card:hover {
		border-color: #a78bfa;
		box-shadow: 0 0 20px rgba(139, 92, 246, 0.1);
	}

	.recommendation-card.priority-high {
		border-left: 4px solid #ef4444;
	}

	.recommendation-card.priority-medium {
		border-left: 4px solid #f59e0b;
	}

	.recommendation-card.priority-low {
		border-left: 4px solid #10b981;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.type-indicator {
		display: flex;
		align-items: center; gap: 0.5rem;
	}

	.type-icon {
		width: 18px; height: 18px;
	}

	.type-label {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.priority-badge {
		padding: 0.25rem 0.5rem;
		border: 1px solid;
		border-radius: 12px;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.card-content h4 {
		margin: 0 0 0.5rem 0;
		color: #e8e8e8;
		font-size: 1rem;
		font-weight: 600;
	}

	.recommendation-description {
		color: #b0b0b0;
		line-height: 1.6; margin: 0 0 1rem 0;
		font-size: 0.9rem;
	}

	.action-items {
		background: #0a0d10; padding: 0.75rem;
		border-radius: 6px; margin: 1rem 0;
	}

	.action-items h5 {
		margin: 0 0 0.5rem 0;
		color: #a78bfa;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.action-items ul {
		margin: 0;
		padding-left: 1rem;
	}

	.action-items li {
		color: #d1d5db;
		font-size: 0.85rem;
		line-height: 1.5;
		margin-bottom: 0.25rem;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #2a2d30;
	}

	.confidence {
		display: flex;
		align-items: center; gap: 0.5rem;
		font-size: 0.8rem;
	}

	.confidence-label {
		color: #888;
	}

	.confidence-value {
		color: #a78bfa;
		font-weight: 600;
	}

	.card-actions {
		display: flex; gap: 0.5rem;
	}

	.apply-btn,
	.dismiss-btn {
		display: flex;
		align-items: center; gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		border: none;
		border-radius: 6px; cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600; transition: all 0.3s ease;
	}

	.apply-btn {
		background: #10b981; color: white;
	}

	.apply-btn:hover {
		background: #059669; transform: translateY(-1px);
	}

	.dismiss-btn {
		background: #6b7280; color: white;
	}

	.dismiss-btn:hover {
		background: #4b5563; transform: translateY(-1px);
	}

	.action-icon {
		width: 14px; height: 14px;
	}

	.capitalize {
		text-transform: capitalize;
	}
</style>




