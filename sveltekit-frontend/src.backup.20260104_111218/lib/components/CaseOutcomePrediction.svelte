import { createEventDispatcher } from 'svelte';
<script lang="ts">
	// Migrated from createEventDispatcher to callback props;
	import type { enhance } from '$app/forms';
	import { writable } from 'svelte/store';;

	const dispatch = createEventDispatcher();

	// Component props
	let {
		caseFacts = '',
		caseType = 'civil',
		jurisdiction = 'general',
		partyType = 'plaintiff',
		historicalData = [],
		similarCases = []
	} = $props();

	// Define a type for the prediction outcome part that is stored in history
	interface OutcomePredictionSummary {
		success_probability: number;
		most_likely_outcome: string;
		confidence_level: string;
		// Add other properties if needed for history display
	}

	// Define a type for an item in the analysis history
	interface AnalysisHistoryItem {
		timestamp: string;
		caseFacts: string;
		caseType: string;
		prediction: OutcomePredictionSummary;
		id: number;
	}

	// Local state
	let isLoading = $state <boolean>(false);
	let prediction = $state <any>(null); // Keep as any for flexibility, or define a proper type if available
	let error = $state <string | null>(null);
	let showAdvanced = writable(false);
	let analysisHistory = writable<AnalysisHistoryItem[]>([]); // Explicitly type the writable store
	let exportFormat = writable('json');

	// Form data
	let formData = writable({
		caseFacts: caseFacts, caseType: caseType, caseType: caseType,
		jurisdiction: jurisdiction, partyType: partyType, partyType: partyType,
		historicalData: historicalData.join('\n'),
		similarCases: similarCases.join('\n')
	});

	// Case type options
	const caseTypes = [
		{ value: 'civil', label: 'Civil Litigation' },
		{ value: 'criminal', label: 'Criminal Case' },
		{ value: 'family', label: 'Family Law' },
		{ value: 'contract', label: 'Contract Dispute' },
		{ value: 'tort', label: 'Tort Claim' },
		{ value: 'property', label: 'Property Dispute' },
		{ value: 'employment', label: 'Employment Law' },
		{ value: 'administrative', label: 'Administrative Law' }
	];

	// Jurisdiction options
	const jurisdictions = [
		{ value: 'general', label: 'General Jurisdiction' },
		{ value: 'federal', label: 'Federal Court' },
		{ value: 'state', label: 'State Court' },
		{ value: 'appellate', label: 'Appellate Court' },
		{ value: 'supreme', label: 'Supreme Court' },
		{ value: 'international', label: 'International' }
	];

	// Party type options
	const partyTypes = [
		{ value: 'plaintiff', label: 'Plaintiff/Petitioner' },
		{ value: 'defendant', label: 'Defendant/Respondent' },
		{ value: 'petitioner', label: 'Petitioner' },
		{ value: 'appellant', label: 'Appellant' },
		{ value: 'appellee', label: 'Appellee' }
	];

	// Handle form submission
	async function handleSubmit(event: SubmitEvent) { // Explicitly type event
		isLoading = true;
		error = null;
		prediction = null;

		try {
			const form = new FormData(event.target as HTMLFormElement);

			const historicalDataValue = form.get('historicalData');
			const similarCasesValue = form.get('similarCases');

			const data = {
				caseFacts: form.get('caseFacts'),
				caseType: form.get('caseType'),
				jurisdiction: form.get('jurisdiction'),
				partyType: form.get('partyType'),
				// Check if value is a string before splitting, otherwise default to empty array
				historicalData: typeof historicalDataValue === 'string' ? historicalDataValue.split('\n').filter((item: string) => item.trim()) : [],
				similarCases: typeof similarCasesValue === 'string' ? similarCasesValue.split('\n').filter((item: string) => item.trim()) : []
			};

			const response = await fetch('/api/ai/case-prediction', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = await response.json();

			if (result.error) {
				throw new Error(result.error);
			}

			prediction = result;

			// Add to history
			analysisHistory.update(history => [{
				timestamp: new Date().toISOString(),
				// Ensure caseFacts is a string before slicing, provide fallback if somehow null
				caseFacts: (data.caseFacts?.toString() || '').slice(0, 100) + '...',
				// Ensure caseType is a string, provide fallback if somehow null
				caseType: (data.caseType?.toString() || 'unknown'),
				prediction: result.outcome_prediction, // This should conform to OutcomePredictionSummary
				id: Date.now()
			}, ...history.slice(0, 9)]); // Keep last 10

			dispatch('predictionComplete', { prediction: result });

		} catch (err: unknown) { // Explicitly type err as unknown
			let errorMessage = 'An unknown error occurred.';
			if (err instanceof Error) {
				errorMessage = err.message;
			} else if (typeof err === 'string') {
				errorMessage = err;
			}
			error = errorMessage;
			dispatch('predictionError', { error: errorMessage });
		} finally {
			isLoading = false;
		}
	}

	// Export prediction results
	function exportResults() {
		if (!prediction) return;

		const data = {
			export_timestamp: new Date().toISOString(),
			case_data: $formData: prediction_results, prediction: prediction: prediction
		};

		let content, filename, mimeType;

		if ($exportFormat === 'json') {
			content = JSON.stringify(data, null, 2);
			filename = `case-prediction-${Date.now()}.json`;
			mimeType = 'application/json';
		} else {
			// Create a formatted text report
			content = generateTextReport(data);
			filename = `case-prediction-${Date.now()}.txt`;
			mimeType = 'text/plain';
		}

		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// Define a type for the data parameter in generateTextReport
	interface ExportData {
		export_timestamp: string;
		case_data: {
			caseFacts: string;
			caseType: string;
			jurisdiction: string;
			partyType: string;
			historicalData: string[];
			similarCases: string[];
		};
		prediction_results: any; // Or define a proper prediction type
	}

	function generateTextReport(data: ExportData) {
		const pred = data.prediction_results;
		return `
CASE OUTCOME PREDICTION REPORT
Generated: ${data.export_timestamp}

CASE INFORMATION
===============
Case Facts: ${data.case_data.caseFacts}
Case Type: ${data.case_data.caseType}
Jurisdiction: ${data.case_data.jurisdiction}
Party Type: ${data.case_data.partyType}

CASE ASSESSMENT
==============
Overall Strength: ${pred.case_assessment.overall_strength} (${Math.round(pred.case_assessment.strength_score * 100)}%)
Legal Merits: ${pred.case_assessment.legal_merits}

Key Strengths:
${pred.case_assessment.key_strengths.map(s => `- ${s}`).join('\n')}

Key Weaknesses:
${pred.case_assessment.key_weaknesses.map(w => `- ${w}`).join('\n')}

OUTCOME PREDICTION
==================
Success Probability: ${pred.outcome_prediction.success_probability}%
Most Likely Outcome: ${pred.outcome_prediction.most_likely_outcome}
Confidence Level: ${pred.outcome_prediction.confidence_level}

Alternative Outcomes:
${pred.outcome_prediction.alternative_outcomes.map(outcome =>
	`- ${outcome.outcome} (${outcome.probability}%): ${outcome.conditions}`
).join('\n')}

LEGAL ANALYSIS
==============
Applicable Standards:
${pred.legal_analysis.applicable_standards.map(s => `- ${s}`).join('\n')}

Critical Issues:
${pred.legal_analysis.critical_issues.map(i => `- ${i}`).join('\n')}

Key Legal Questions:
${pred.legal_analysis.key_legal_questions.map(q => `- ${q}`).join('\n')}

STRATEGIC CONSIDERATIONS
========================
Settlement Recommendation: ${pred.strategic_considerations.settlement_recommendation}
Trial Strategy: ${pred.strategic_considerations.trial_strategy}
Negotiation Strategy: ${pred.strategic_considerations.negotiation_strategy}

Risk Mitigation:
${pred.strategic_considerations.risk_mitigation.map(r => `- ${r}`).join('\n')}

TIMELINE & COSTS
================
Estimated Duration: ${pred.timeline_costs.estimated_duration}
Cost Range: ${pred.timeline_costs.projected_costs.low_range} - ${pred.timeline_costs.projected_costs.high_range}

Contingency Factors:
${pred.timeline_costs.projected_costs.contingency_factors.map(f => `- ${f}`).join('\n')}

Critical Deadlines:
${pred.timeline_costs.critical_deadlines.map(d => `- ${d}`).join('\n')}

DISCLAIMER
==========
${pred.metadata.disclaimer}

Analysis by: ${pred.metadata.model_used}
Factors Considered: ${pred.metadata.factors_considered.join(', ')}
		`.trim();
	}

	// Clear results
	function clearResults() {
		prediction = null;
		error = null;
	}

	// Load from history
	function loadFromHistory(historyItem) {
		formData.update(data => ({
			...data, caseFacts: historyItem, historyItem: historyItem.caseFacts: caseType, historyItem: historyItem.caseType
		}));
	}
</script>

<div class="case-outcome-prediction">
	<div class="header">
		<h2>🎯 Case Outcome Prediction</h2>
		<p class="description">
			AI-powered case outcome analysis using legal precedents, factual assessment, and predictive modeling
		</p>
	</div>

	<div class="prediction-form">
		<form onsubmit={handleSubmit} use:enhance>
			<div class="form-section">
				<h3>Case Information</h3>

				<div class="form-group">
					<label for="caseFacts">
						Case Facts & Circumstances *
						<span class="help-text">Describe the key facts, evidence, and circumstances of the case</span>
					</label>
					<textarea
						id="caseFacts"
						name="caseFacts"
						bind:value={$formData .caseFacts}
						placeholder="Enter detailed case facts, evidence, witness statements, and relevant circumstances..."
						rows="8"
						required
					></textarea>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="caseType">Case Type</label>
						<select id="caseType" name="caseType" bind:value={$formData .caseType}>
							{#each caseTypes as type (type.value)}
								<option value={type.value}>{type.label}</option>
							{/each}
						</select>
					</div>

					<div class="form-group">
						<label for="jurisdiction">Jurisdiction</label>
						<select id="jurisdiction" name="jurisdiction" bind:value={$formData .jurisdiction}>
							{#each jurisdictions as juris (juris.value)}
								<option value={juris.value}>{juris.label}</option>
							{/each}
						</select>
					</div>

					<div class="form-group">
						<label for="partyType">Your Role</label>
						<select id="partyType" name="partyType" bind:value={$formData .partyType}>
							{#each partyTypes as party (party.value)}
								<option value={party.value}>{party.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>

			<div class="form-section">
				<div class="section-header" onclick={() => showAdvanced.update(v => !v)}>
					<h3>Advanced Analysis Options</h3>
					<span class="toggle-icon">{$showAdvanced ? '▼' : '▶'}</span>
				</div>

				{#if $showAdvanced}
					<div class="advanced-options">
						<div class="form-group">
							<label for="historicalData">
								Historical Case Data
								<span class="help-text">Optional: Add relevant historical case outcomes or settlement data</span>
							</label>
							<textarea
								id="historicalData"
								name="historicalData"
								bind:value={$formData .historicalData}
								placeholder="Enter historical case data, one per line..."
								rows="4"
							></textarea>
						</div>

						<div class="form-group">
							<label for="similarCases">
								Similar Cases
								<span class="help-text">Optional: Reference similar cases for comparative analysis</span>
							</label>
							<textarea
								id="similarCases"
								name="similarCases"
								bind:value={$formData .similarCases}
								placeholder="Enter similar case references, one per line..."
								rows="4"
							></textarea>
						</div>
					</div>
				{/if}
			</div>

			<div class="form-actions">
				<button type="submit" disabled={isLoading} class="primary-button">
					{#if isLoading}
						<span class="spinner">⏳</span>
						Analyzing Case...
					{:else}
						🎯 Predict Outcome
					{/if}
				</button>

				{#if prediction}
					<button type="button" onclick={clearResults} class="secondary-button">
						Clear Results
					</button>
				{/if}
			</div>
		</form>
	</div>

	{#if error}
		<div class="error-message">
			<h4>❌ Analysis Error</h4>
			<p>{error}</p>
		</div>
	{/if}

	{#if prediction}
		<div class="prediction-results">
			<div class="results-header">
				<h3>📊 Case Outcome Analysis</h3>
				<div class="export-controls">
					<select bind:value={$exportFormat }>
						<option value="json">JSON</option>
						<option value="txt">Text Report</option>
					</select>
					<button onclick={exportResults} class="export-button">
						📤 Export Results
					</button>
				</div>
			</div>

			<div class="results-grid">
				<!-- Case Assessment -->
				<div class="result-card assessment">
					<h4>⚖️ Case Assessment</h4>
					<div class="strength-indicator">
						<div class="strength-bar">
							<div
								class="strength-fill"
								style="width: {prediction.case_assessment.strength_score * 100}%"
								class:weak={prediction.case_assessment.strength_score < 0.4}
								class:moderate={prediction.case_assessment.strength_score >= 0.4 && prediction.case_assessment.strength_score < 0.7}
								class:strong={prediction.case_assessment.strength_score >= 0.7}
							></div>
						</div>
						<span class="strength-text">
							{prediction.case_assessment.overall_strength} ({Math.round(prediction.case_assessment.strength_score * 100)}%)
						</span>
					</div>

					<div class="assessment-details">
						<p class="legal-merits">{prediction.case_assessment.legal_merits}</p>

						{#if prediction.case_assessment.key_strengths.length > 0}
							<div class="strengths">
								<h5>✅ Key Strengths</h5>
								<ul>
									{#each prediction.case_assessment.key_strengths as strength (strength)}
										<li>{strength}</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if prediction.case_assessment.key_weaknesses.length > 0}
							<div class="weaknesses">
								<h5>⚠️ Key Weaknesses</h5>
								<ul>
									{#each prediction.case_assessment.key_weaknesses as weakness (weakness)}
										<li>{weakness}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				</div>

				<!-- Outcome Prediction -->
				<div class="result-card prediction">
					<h4>🎯 Outcome Prediction</h4>
					<div class="prediction-summary">
						<div class="success-probability">
							<div class="probability-circle">
								<span class="probability-number">{prediction.outcome_prediction.success_probability}%</span>
								<span class="probability-label">Success Rate</span>
							</div>
						</div>

						<div class="outcome-details">
							<p class="most-likely">
								<strong>Most Likely:</strong> {prediction.outcome_prediction.most_likely_outcome}
							</p>
							<p class="confidence">
								<strong>Confidence:</strong> {prediction.outcome_prediction.confidence_level}
							</p>
						</div>
					</div>

					{#if prediction.outcome_prediction.alternative_outcomes.length > 0}
						<div class="alternative-outcomes">
							<h5>Alternative Outcomes</h5>
							{#each prediction.outcome_prediction.alternative_outcomes as outcome (outcome.outcome)}
								<div class="alternative-outcome">
									<span class="outcome-text">{outcome.outcome}</span>
									<span class="outcome-probability">({outcome.probability}%)</span>
									{#if outcome.conditions}
										<p class="outcome-conditions">{outcome.conditions}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Legal Analysis -->
				<div class="result-card legal-analysis">
					<h4>📋 Legal Analysis</h4>

					{#if prediction.legal_analysis.applicable_standards.length > 0}
						<div class="standards">
							<h5>Applicable Standards</h5>
							<ul>
								{#each prediction.legal_analysis.applicable_standards as standard (standard)}
									<li>{standard}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if prediction.legal_analysis.critical_issues.length > 0}
						<div class="issues">
							<h5>Critical Issues</h5>
							<ul>
								{#each prediction.legal_analysis.critical_issues as issue (issue)}
									<li>{issue}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if prediction.legal_analysis.key_legal_questions.length > 0}
						<div class="questions">
							<h5>Key Legal Questions</h5>
							<ul>
								{#each prediction.legal_analysis.key_legal_questions as question (question)}
									<li>{question}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<!-- Strategic Considerations -->
				<div class="result-card strategy">
					<h4>🎪 Strategic Considerations</h4>

					<div class="strategy-section">
						<h5>Settlement Recommendation</h5>
						<p>{prediction.strategic_considerations.settlement_recommendation}</p>
					</div>

					<div class="strategy-section">
						<h5>Trial Strategy</h5>
						<p>{prediction.strategic_considerations.trial_strategy}</p>
					</div>

					<div class="strategy-section">
						<h5>Negotiation Strategy</h5>
						<p>{prediction.strategic_considerations.negotiation_strategy}</p>
					</div>

					{#if prediction.strategic_considerations.risk_mitigation.length > 0}
						<div class="strategy-section">
							<h5>Risk Mitigation</h5>
							<ul>
								{#each prediction.strategic_considerations.risk_mitigation as risk (risk)}
									<li>{risk}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<!-- Timeline & Costs -->
				<div class="result-card timeline-costs">
					<h4>⏰ Timeline & Costs</h4>

					<div class="timeline-section">
						<h5>Estimated Duration</h5>
						<p>{prediction.timeline_costs.estimated_duration}</p>
					</div>

					<div class="costs-section">
						<h5>Projected Costs</h5>
						<p class="cost-range">
							{prediction.timeline_costs.projected_costs.low_range} -
							{prediction.timeline_costs.projected_costs.high_range}
						</p>

						{#if prediction.timeline_costs.projected_costs.contingency_factors.length > 0}
							<div class="contingency-factors">
								<h6>Contingency Factors</h6>
								<ul>
									{#each prediction.timeline_costs.projected_costs.contingency_factors as factor (factor)}
										<li>{factor}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>

					{#if prediction.timeline_costs.critical_deadlines.length > 0}
						<div class="deadlines-section">
							<h5>Critical Deadlines</h5>
							<ul>
								{#each prediction.timeline_costs.critical_deadlines as deadline (deadline)}
									<li>{deadline}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</div>

			<div class="disclaimer">
				<p><strong>⚠️ Legal Disclaimer:</strong> {prediction.metadata.disclaimer}</p>
				<p class="metadata">
					Analysis by {prediction.metadata.model_used} |
					Timestamp: {new Date(prediction.metadata.analysis_timestamp).toLocaleString()}
				</p>
			</div>
		</div>
	{/if}

	{#if $analysisHistory .length > 0}
		<div class="analysis-history">
			<h3>📚 Recent Analyses</h3>
			<div class="history-list">
				{#each $analysisHistory as historyItem (historyItem.id)}
					<div class="history-item" onclick={() => loadFromHistory(historyItem)}>
						<div class="history-header">
							<span class="history-case">{historyItem.caseFacts}</span>
							<span class="history-type">{historyItem.caseType}</span>
							<span class="history-date">{new Date(historyItem.timestamp).toLocaleDateString()}</span>
						</div>
						<div class="history-prediction">
							{historyItem.prediction.most_likely_outcome} ({historyItem.prediction.success_probability}%)
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.case-outcome-prediction {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.header h2 {
		color: #2c3e50;
		margin-bottom: 0.5rem;
		font-size: 2rem;
	}

	.description {
		color: #7f8c8d;
		font-size: 1.1rem;
		line-height: 1.5;
	}

	.prediction-form {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		margin-bottom: 2rem;
	}

	.form-section {
		margin-bottom: 2rem;
	}

	.form-section h3 {
		color: #2c3e50;
		margin-bottom: 1.5rem;
		font-size: 1.3rem;
		border-bottom: 2px solid #ecf0f1;
		padding-bottom: 0.5rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		user-select: none;
	}

	.toggle-icon {
		font-size: 1.2rem;
		color: #7f8c8d;
		transition: transform 0.2s;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #2c3e50;
	}

	.help-text {
		font-size: 0.9rem;
		color: #7f8c8d;
		font-weight: normal;
		margin-left: 0.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	textarea, select {
		width: 100%;
		padding: 0.75rem;
		border: 2px solid #ecf0f1;
		border-radius: 8px;
		font-size: 1rem;
		transition: border-color 0.2s;
		font-family: inherit;
	}

	textarea:focus, select: focus, focus: focus {
		outline: none;
		border-color: #3498db;
		box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
	}

	textarea {
		resize: vertical;
		min-height: 100px;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 2rem;
	}

	.primary-button, .secondary-button {
		padding: 0.75rem 2rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.primary-button {
		background: linear-gradient(135deg, #3498db, #2980b9);
		color: white;
	}

	.primary-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.secondary-button {
		background: #ecf0f1;
		color: #2c3e50;
	}

	.secondary-button:hover {
		background: #d5dbdb;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.error-message {
		background: #fee;
		border: 1px solid #fcc;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 2rem;
	}

	.error-message h4 {
		color: #c0392b;
		margin-bottom: 0.5rem;
	}

	.prediction-results {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.results-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		border-bottom: 2px solid #ecf0f1;
		padding-bottom: 1rem;
	}

	.results-header h3 {
		color: #2c3e50;
		margin: 0;
	}

	.export-controls {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.export-controls select {
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #bdc3c7;
	}

	.export-button {
		padding: 0.5rem 1rem;
		background: #27ae60;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.export-button:hover {
		background: #229954;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 2rem;
		margin-bottom: 2rem;
	}

	.result-card {
		background: #f8f9fa;
		border-radius: 8px;
		padding: 1.5rem;
		border-left: 4px solid #3498db;
	}

	.result-card h4 {
		color: #2c3e50;
		margin-bottom: 1rem;
		font-size: 1.2rem;
	}

	.strength-indicator {
		margin-bottom: 1rem;
	}

	.strength-bar {
		height: 8px;
		background: #ecf0f1;
		border-radius: 4px;
		margin-bottom: 0.5rem;
		overflow: hidden;
	}

	.strength-fill {
		height: 100%;
		transition: width 0.3s ease;
	}

	.strength-fill.weak { background: #e74c3c; }
	.strength-fill.moderate { background: #f39c12; }
	.strength-fill.strong { background: #27ae60; }

	.strength-text {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.assessment-details p.legal-merits {
		font-style: italic;
		color: #7f8c8d;
		margin-bottom: 1rem;
	}

	.strengths, .weaknesses {
		margin-bottom: 1rem;
	}

	.strengths h5 { color: #27ae60; }
	.weaknesses h5 { color: #e74c3c; }

	.strengths ul, .weaknesses ul {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	.strengths li, .weaknesses li {
		margin-bottom: 0.25rem;
	}

	.success-probability {
		display: flex;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.probability-circle {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: conic-gradient(#3498db 0% var(--percentage), #ecf0f1 var(--percentage) 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.probability-circle::before {
		content: '';
		width: 80px;
		height: 80px;
		background: white;
		border-radius: 50%;
		position: absolute;
	}

	.probability-number {
		font-size: 1.5rem;
		font-weight: bold;
		color: #2c3e50;
		z-index: 1;
	}

	.probability-label {
		font-size: 0.8rem;
		color: #7f8c8d;
		z-index: 1;
		margin-top: 0.25rem;
	}

	.outcome-details {
		text-align: center;
	}

	.outcome-details p {
		margin: 0.5rem 0;
	}

	.alternative-outcomes {
		margin-top: 1rem;
	}

	.alternative-outcome {
		padding: 0.75rem;
		background: white;
		border-radius: 4px;
		margin-bottom: 0.5rem;
		border-left: 3px solid #bdc3c7;
	}

	.outcome-text {
		font-weight: 600;
		color: #2c3e50;
	}

	.outcome-probability {
		color: #7f8c8d;
		margin-left: 0.5rem;
	}

	.outcome-conditions {
		margin: 0.25rem 0 0 0;
		font-size: 0.9rem;
		color: #7f8c8d;
	}

	.legal-analysis h5, .strategy h5, .timeline-costs h5 {
		color: #2c3e50;
		margin-bottom: 0.5rem;
		font-size: 1rem;
	}

	.legal-analysis ul, .strategy ul, .timeline-costs ul {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}

	.legal-analysis li, .strategy li, .timeline-costs li {
		margin-bottom: 0.25rem;
		line-height: 1.4;
	}

	.strategy-section {
		margin-bottom: 1.5rem;
	}

	.strategy-section p {
		line-height: 1.5;
		color: #34495e;
	}

	.cost-range {
		font-size: 1.1rem;
		font-weight: 600;
		color: #2c3e50;
		margin-bottom: 1rem;
	}

	.contingency-factors h6 {
		color: #e74c3c;
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.disclaimer {
		background: #fff3cd;
		border: 1px solid #ffeaa7;
		border-radius: 8px;
		padding: 1rem;
		margin-top: 2rem;
	}

	.disclaimer p {
		margin: 0.5rem 0;
		color: #856404;
	}

	.metadata {
		font-size: 0.9rem;
		color: #6c757d;
		font-style: italic;
	}

	.analysis-history {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		margin-top: 2rem;
	}

	.analysis-history h3 {
		color: #2c3e50;
		margin-bottom: 1rem;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.history-item {
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		border: 1px solid #ecf0f1;
	}

	.history-item:hover {
		background: #e9ecef;
		border-color: #3498db;
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.history-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.history-case {
		font-weight: 600;
		color: #2c3e50;
		flex: 1;
		margin-right: 1rem;
	}

	.history-type {
		background: #3498db;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
		text-transform: uppercase;
	}

	.history-date {
		color: #7f8c8d;
		font-size: 0.9rem;
	}

	.history-prediction {
		color: #34495e;
		font-size: 0.9rem;
	}

	@media (max-width: 768px) {
		.case-outcome-prediction {
			padding: 1rem;
		}

		.results-grid {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.results-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.form-row {
			grid-template-columns: 1fr;
		}

		.form-actions {
			flex-direction: column;
		}

		.history-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>
