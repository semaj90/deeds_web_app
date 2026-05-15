<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface ScoreFactor {
		category: string;
		weight: number;
		impact: number;
		description: string;
		confidence: number;
	}

	interface CaseScore {
		id: string;
		title: string;
		description: string;
		score: number;
		priority: 'critical' | 'high' | 'medium' | 'low';
		confidence: number;
		dateCreated: string;
		lastUpdated: string;
		factors: ScoreFactor[];
		recommendations: string[];
		riskLevel: 'low' | 'medium' | 'high' | 'critical';
	}

	let cases = $state<CaseScore[]>([]);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let expandedId = $state<string | null>(null);
	let scoreFilter = $state<'all' | 'high' | 'medium' | 'low'>('all');
	let searchQuery = $state('');

	const mockCases: CaseScore[] = [
		{
			id: 'case-001',
			title: 'Johnson v. Tech Corp — Patent Infringement',
			description: 'Complex patent dispute involving AI technology and trade secrets',
			score: 87,
			priority: 'critical',
			confidence: 92,
			dateCreated: '2024-01-15',
			lastUpdated: new Date().toISOString(),
			factors: [
				{ category: 'Financial Risk', weight: 0.3, impact: 0.9, description: 'Potential damages exceed $10M', confidence: 95 },
				{ category: 'Legal Precedent', weight: 0.25, impact: 0.85, description: 'Limited favorable precedents', confidence: 88 },
				{ category: 'Evidence Strength', weight: 0.2, impact: 0.7, description: 'Key documents under dispute', confidence: 82 },
				{ category: 'Timeline Pressure', weight: 0.15, impact: 0.95, description: 'Trial date approaching rapidly', confidence: 100 },
			],
			recommendations: [
				'Prioritize settlement negotiations before trial date',
				'Strengthen expert witness testimony on technical claims',
				'Prepare comprehensive prior art documentation',
			],
			riskLevel: 'high',
		},
		{
			id: 'case-002',
			title: 'State v. Anderson — Criminal Defense',
			description: 'White collar crime case involving financial fraud allegations',
			score: 72,
			priority: 'high',
			confidence: 85,
			dateCreated: '2024-02-01',
			lastUpdated: new Date(Date.now() - 86400000).toISOString(),
			factors: [
				{ category: 'Evidence Strength', weight: 0.35, impact: 0.75, description: 'Prosecution has substantial documentation', confidence: 90 },
				{ category: 'Witness Credibility', weight: 0.25, impact: 0.6, description: 'Key witness reliability questionable', confidence: 70 },
				{ category: 'Legal Complexity', weight: 0.2, impact: 0.8, description: 'Multiple intersecting statutes', confidence: 85 },
			],
			recommendations: [
				'Challenge prosecution witness credentials',
				'File motion to suppress financial records obtained without warrant',
				'Engage forensic accounting expert',
			],
			riskLevel: 'medium',
		},
		{
			id: 'case-003',
			title: 'Smith Estate — Probate Dispute',
			description: 'Multi-party estate dispute with contested will validity',
			score: 54,
			priority: 'medium',
			confidence: 78,
			dateCreated: '2024-03-10',
			lastUpdated: new Date(Date.now() - 172800000).toISOString(),
			factors: [
				{ category: 'Document Validity', weight: 0.4, impact: 0.5, description: 'Will executed with proper witnesses', confidence: 80 },
				{ category: 'Beneficiary Claims', weight: 0.3, impact: 0.6, description: 'Three competing claims from family members', confidence: 75 },
			],
			recommendations: [
				'Mediation may resolve competing beneficiary claims',
				'Obtain independent handwriting analysis of contested signatures',
			],
			riskLevel: 'low',
		},
		{
			id: 'case-004',
			title: 'Metro City v. Industrial Corp — Environmental',
			description: 'Environmental contamination class action with multiple plaintiffs',
			score: 91,
			priority: 'critical',
			confidence: 96,
			dateCreated: '2024-04-05',
			lastUpdated: new Date().toISOString(),
			factors: [
				{ category: 'Regulatory Exposure', weight: 0.35, impact: 0.95, description: 'EPA violations confirmed by independent testing', confidence: 98 },
				{ category: 'Class Size', weight: 0.25, impact: 0.9, description: '2,400+ affected residents identified', confidence: 94 },
				{ category: 'Financial Impact', weight: 0.25, impact: 0.85, description: 'Estimated remediation cost: $45M+', confidence: 90 },
			],
			recommendations: [
				'Engage environmental remediation experts immediately',
				'Prepare comprehensive timeline of contamination events',
				'Begin settlement framework discussions with lead plaintiffs',
				'Retain toxicology expert for health impact assessment',
			],
			riskLevel: 'critical',
		},
	];

	async function loadScores() {
		isLoading = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/ai/case-scoring');
			if (!response.ok) throw new Error('API unavailable');
			cases = await response.json();
		} catch {
			cases = mockCases;
		} finally {
			isLoading = false;
		}
	}

	let filtered = $derived.by(() => {
		let result = cases;
		if (scoreFilter === 'high') result = result.filter(c => c.score >= 75);
		else if (scoreFilter === 'medium') result = result.filter(c => c.score >= 40 && c.score < 75);
		else if (scoreFilter === 'low') result = result.filter(c => c.score < 40);
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
		}
		return result.sort((a, b) => b.score - a.score);
	});

	function getScoreColor(score: number): string {
		if (score >= 80) return '#ef4444';
		if (score >= 60) return '#f59e0b';
		if (score >= 40) return '#3b82f6';
		return '#10b981';
	}

	function getPriorityStyle(priority: string): string {
		const map: Record<string, string> = {
			critical: 'border-color: #ef4444; color: #ef4444;',
			high: 'border-color: #f97316; color: #f97316;',
			medium: 'border-color: #eab308; color: #eab308;',
			low: 'border-color: #3b82f6; color: #3b82f6;',
		};
		return map[priority] ?? '';
	}

	$effect(() => {
		loadScores();
	});
</script>

<div class="scoring-dashboard">
	<div class="scoring-header">
		<div class="scoring-title">
			<Icon name="bar-chart-3" size={18} />
			<h3>AI Case Scoring</h3>
		</div>
		<div class="scoring-controls">
			<div class="search-box">
				<Icon name="search" size={14} />
				<input type="text" placeholder="Search cases..." bind:value={searchQuery} />
			</div>
			<select bind:value={scoreFilter}>
				<option value="all">All Scores</option>
				<option value="high">High Risk (75+)</option>
				<option value="medium">Medium (40-74)</option>
				<option value="low">Low (&lt;40)</option>
			</select>
			<button onclick={loadScores} class="refresh-btn" disabled={isLoading}>
				<Icon name="refresh-cw" size={14} class={isLoading ? "spin" : ""} />
			</button>
		</div>
	</div>

	{#if errorMessage}
		<div class="error-bar">
			<Icon name="triangle-alert" size={14} />
			<span>{errorMessage}</span>
		</div>
	{/if}

	{#if isLoading && cases.length === 0}
		<div class="loading">Analyzing cases...</div>
	{:else if filtered.length === 0}
		<div class="empty">No cases match the current filter.</div>
	{:else}
		<div class="cases-list">
			{#each filtered as caseItem (caseItem.id)}
				{@const expanded = expandedId === caseItem.id}
				<div class="case-card" class:expanded>
					<button class="case-summary" onclick={() => { expandedId = expanded ? null : caseItem.id; }}>
						<div class="score-ring" style="--score-color: {getScoreColor(caseItem.score)}">
							<span class="score-value">{caseItem.score}</span>
						</div>
						<div class="case-info">
							<div class="case-title-row">
								<span class="case-name">{caseItem.title}</span>
								<span class="priority-tag" style={getPriorityStyle(caseItem.priority)}>
									{caseItem.priority.toUpperCase()}
								</span>
							</div>
							<span class="case-desc">{caseItem.description}</span>
							<div class="case-meta">
								<span><Icon name="shield" size={12} /> {caseItem.confidence}% confidence</span>
								<span><Icon name="trending-up" size={12} /> {caseItem.riskLevel} risk</span>
							</div>
						</div>
						{#if expanded}
							<Icon name="chevron-up" size={16} />
						{:else}
							<Icon name="chevron-down" size={16} />
						{/if}
					</button>

					{#if expanded}
						<div class="case-details">
							<div class="factors-section">
								<h4>Scoring Factors</h4>
								{#each caseItem.factors as factor}
									<div class="factor-row">
										<div class="factor-label">
											<span>{factor.category}</span>
											<span class="factor-weight">w:{(factor.weight * 100).toFixed(0)}%</span>
										</div>
										<div class="factor-bar-track">
											<div
												class="factor-bar-fill"
												style="width: {factor.impact * 100}%; background: {getScoreColor(factor.impact * 100)}"
											></div>
										</div>
										<span class="factor-pct">{(factor.impact * 100).toFixed(0)}%</span>
									</div>
									<p class="factor-desc">{factor.description} ({factor.confidence}% confidence)</p>
								{/each}
							</div>

							{#if caseItem.recommendations.length > 0}
								<div class="recommendations-section">
									<h4>Recommendations</h4>
									<ul>
										{#each caseItem.recommendations as rec}
											<li>{rec}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.scoring-dashboard {
		background: rgba(15, 23, 42, 0.95);
		border: 1px solid rgba(34, 211, 238, 0.2);
		border-radius: 4px;
		padding: 1rem;
		font-family: monospace;
	}

	.scoring-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.scoring-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #22d3ee;
	}

	.scoring-title h3 {
		margin: 0;
		font-size: 0.95rem;
	}

	.scoring-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		padding: 0.25rem 0.5rem;
		color: #94a3b8;
	}

	.search-box input {
		background: none;
		border: none;
		color: #e2e8f0;
		font-family: monospace;
		font-size: 0.75rem;
		width: 120px;
		outline: none;
	}

	select {
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		color: #e2e8f0;
		font-family: monospace;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
	}

	.refresh-btn {
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid rgba(148, 163, 184, 0.2);
		color: #94a3b8;
		cursor: pointer;
		padding: 0.25rem 0.4rem;
		display: flex;
		align-items: center;
	}

	.refresh-btn:hover { color: #22d3ee; }
	.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	.error-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #f87171;
		font-size: 0.8rem;
		margin-bottom: 0.75rem;
	}

	.loading, .empty {
		text-align: center;
		padding: 2rem;
		color: #94a3b8;
		font-size: 0.85rem;
	}

	.cases-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.case-card {
		border: 1px solid rgba(148, 163, 184, 0.15);
		background: rgba(30, 41, 59, 0.5);
		transition: border-color 0.15s;
	}

	.case-card:hover, .case-card.expanded {
		border-color: rgba(34, 211, 238, 0.3);
	}

	.case-summary {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.75rem;
		background: none;
		border: none;
		color: #e2e8f0;
		cursor: pointer;
		text-align: left;
		font-family: monospace;
	}

	.score-ring {
		width: 48px;
		height: 48px;
		border: 3px solid var(--score-color, #3b82f6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.score-value {
		font-size: 1rem;
		font-weight: 700;
		color: var(--score-color, #3b82f6);
	}

	.case-info {
		flex: 1;
		min-width: 0;
	}

	.case-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.case-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: #e2e8f0;
	}

	.priority-tag {
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid;
		letter-spacing: 0.05em;
	}

	.case-desc {
		display: block;
		font-size: 0.75rem;
		color: #94a3b8;
		margin-top: 0.2rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.case-meta {
		display: flex;
		gap: 1rem;
		margin-top: 0.3rem;
		font-size: 0.7rem;
		color: #64748b;
	}

	.case-meta span {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.case-details {
		padding: 0 0.75rem 0.75rem;
		border-top: 1px solid rgba(148, 163, 184, 0.1);
	}

	.factors-section h4, .recommendations-section h4 {
		font-size: 0.8rem;
		color: #22d3ee;
		margin: 0.75rem 0 0.5rem;
	}

	.factor-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.15rem;
	}

	.factor-label {
		width: 140px;
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: #cbd5e1;
		flex-shrink: 0;
	}

	.factor-weight {
		color: #64748b;
		font-size: 0.6rem;
	}

	.factor-bar-track {
		flex: 1;
		height: 6px;
		background: rgba(148, 163, 184, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}

	.factor-bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s;
	}

	.factor-pct {
		width: 32px;
		text-align: right;
		font-size: 0.7rem;
		color: #94a3b8;
	}

	.factor-desc {
		font-size: 0.65rem;
		color: #64748b;
		margin: 0 0 0.5rem 0;
		padding-left: 140px;
	}

	.recommendations-section ul {
		margin: 0;
		padding-left: 1.2rem;
	}

	.recommendations-section li {
		font-size: 0.75rem;
		color: #94a3b8;
		margin-bottom: 0.3rem;
		line-height: 1.4;
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
