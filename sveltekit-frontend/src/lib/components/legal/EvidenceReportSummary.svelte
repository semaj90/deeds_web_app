<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import CheckCircle from '@lucide/svelte/icons/circle-check';
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import FileText from '@lucide/svelte/icons/file-text';
	import Scale from '@lucide/svelte/icons/scale';
	import Target from '@lucide/svelte/icons/target';

	export interface EvidenceReport {
		id: string;
		title: string;
		type?:
			| 'digital_forensics'
			| 'dna_analysis'
			| 'ballistics'
			| 'financial'
			| 'document_analysis'
			| 'witness_statement';
		status: 'pending' | 'in_progress' | 'completed' | 'reviewed' | 'challenged';
		priority: 'low' | 'medium' | 'high' | 'critical';
		createdAt: string;
		updatedAt: string;
		analyst: {
			name: string;
			credentials: string;
			department: string;
		};
		evidence: {
			itemNumber: string;
			description: string;
			chainOfCustody: string[];
			dateCollected: string;
			location: string;
		};
		methodology: {
			procedures: string[];
			tools: string[];
			standards: string[];
		};
		findings: {
			summary: string;
			keyPoints: string[];
			confidence: number;
			limitations: string[];
		};
		legalImplications: {
			charges: string[];
			precedents: string[];
			challengePoints: string[];
		};
		attachments: {
			id: string;
			name: string;
			type: string;
			size: number;
		}[];
	}

	interface Props {
		evidenceId: string;
		caseId: string;
		reportData: EvidenceReport;
		allowExport?: boolean;
	}

	let {
		evidenceId,
		caseId,
		reportData,
		allowExport = false
	}: Props = $props();

	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'text-accent bg-accent/10';
			case 'reviewed':
				return 'text-info bg-info/10';
			case 'in_progress':
				return 'text-warning bg-warning/10';
			case 'challenged':
				return 'text-danger bg-danger/10';
			case 'pending':
			default:
				return 'text-sand/60 bg-sand/10';
		}
	}

	function getPriorityColor(priority: string): string {
		switch (priority) {
			case 'critical':
				return 'text-danger bg-danger/10 border-danger/20';
			case 'high':
				return 'text-warning bg-warning/10 border-warning/20';
			case 'medium':
				return 'text-warning bg-warning/10 border-warning/20';
			case 'low':
			default:
				return 'text-sand/60 bg-sand/10 border-sand/20';
		}
	}

	function getTypeIcon(type: string): string {
		switch (type) {
			case 'digital_forensics':
				return '\u{1F4BB}';
			case 'dna_analysis':
				return '\u{1F9EC}';
			case 'ballistics':
				return '\u{1F52B}';
			case 'financial':
				return '\u{1F4B0}';
			case 'document_analysis':
				return '\u{1F4C4}';
			case 'witness_statement':
				return '\u{1F464}';
			default:
				return '\u{1F4CB}';
		}
	}

	function exportReport() {
		const content = `# Evidence Analysis Report

Case ID: ${caseId}
Evidence Item: ${reportData.evidence.itemNumber}
Report Type: ${(reportData.type || 'unknown').replace(/_/g, ' ').toUpperCase()}
Priority: ${reportData.priority.toUpperCase()}
Status: ${reportData.status.toUpperCase()}

## Analyst
- Name: ${reportData.analyst.name}
- Credentials: ${reportData.analyst.credentials}
- Department: ${reportData.analyst.department}

## Evidence Details
- Description: ${reportData.evidence.description}
- Collected: ${reportData.evidence.dateCollected}
- Location: ${reportData.evidence.location}
- Chain of Custody: ${reportData.evidence.chainOfCustody.join(' \u2192 ')}

## Methodology
- Procedures: ${reportData.methodology.procedures.join(', ')}
- Tools: ${reportData.methodology.tools.join(', ')}
- Standards: ${reportData.methodology.standards.join(', ')}

## Findings
${reportData.findings.summary}

Key Points:
${reportData.findings.keyPoints.map((p) => `- ${p}`).join('\n')}

Confidence: ${Math.round(reportData.findings.confidence * 100)}%

Limitations:
${reportData.findings.limitations.map((l) => `- ${l}`).join('\n')}

## Legal Implications
- Charges: ${reportData.legalImplications.charges.join(', ')}
- Precedents: ${reportData.legalImplications.precedents.join(', ')}
- Challenge Points: ${reportData.legalImplications.challengePoints.join(', ')}

## Attachments
${reportData.attachments.map((a) => `- ${a.name} (${a.type})`).join('\n')}
`.trim();

		const blob = new Blob([content], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `evidence-report-${evidenceId}-${new Date().toISOString().split('T')[0]}.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<div class="evidence-report-summary">
	<!-- Report Header -->
	<div class="report-header">
		<div class="header-top">
			<div class="header-info">
				<div class="type-icon">{getTypeIcon(reportData.type || 'unknown')}</div>
				<div>
					<h2 class="report-title">{reportData.title}</h2>
					<div class="header-meta">
						<span>Case {caseId}</span>
						<span>Evidence: {reportData.evidence.itemNumber}</span>
						<span>Updated: {new Date(reportData.updatedAt).toLocaleDateString()}</span>
					</div>
				</div>
			</div>
			<div class="header-actions">
				<div class="badges">
					<span class="badge {getStatusColor(reportData.status)}">
						{reportData.status.toUpperCase()}
					</span>
					<span class="badge {getPriorityColor(reportData.priority)}">
						{reportData.priority.toUpperCase()} PRIORITY
					</span>
				</div>
				{#if allowExport}
					<button onclick={exportReport} class="export-btn" title="Export Report">
						<Download size={18} />
					</button>
				{/if}
			</div>
		</div>

		<!-- Quick Stats -->
		<div class="stats-grid">
			<div class="stat">
				<div class="stat-value">{Math.round(reportData.findings.confidence * 100)}%</div>
				<div class="stat-label">Confidence</div>
			</div>
			<div class="stat">
				<div class="stat-value">{reportData.evidence.chainOfCustody.length}</div>
				<div class="stat-label">Chain Links</div>
			</div>
			<div class="stat">
				<div class="stat-value">{reportData.methodology.procedures.length}</div>
				<div class="stat-label">Procedures</div>
			</div>
			<div class="stat">
				<div class="stat-value">{reportData.attachments.length}</div>
				<div class="stat-label">Attachments</div>
			</div>
		</div>
	</div>

	<!-- Three-Column Detail Grid -->
	<div class="detail-grid">
		<!-- Evidence Information -->
		<div class="detail-card">
			<h3 class="detail-heading">
				<Eye size={18} /> Evidence Details
			</h3>
			<div class="detail-fields">
				<div>
					<label class="field-label">Item Number</label>
					<p class="field-value">{reportData.evidence.itemNumber}</p>
				</div>
				<div>
					<label class="field-label">Description</label>
					<p class="field-value">{reportData.evidence.description}</p>
				</div>
				<div>
					<label class="field-label">Collection Details</label>
					<div class="field-value text-sm">
						<p><strong>Date:</strong> {new Date(reportData.evidence.dateCollected).toLocaleString()}</p>
						<p><strong>Location:</strong> {reportData.evidence.location}</p>
					</div>
				</div>
				<div>
					<label class="field-label">Chain of Custody</label>
					<div class="chain-list">
						{#each reportData.evidence.chainOfCustody as custodian, index}
							<div class="chain-item">
								<span class="chain-number">{index + 1}</span>
								<span>{custodian}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Analysis Details -->
		<div class="detail-card">
			<h3 class="detail-heading">
				<Target size={18} /> Analysis Details
			</h3>
			<div class="detail-fields">
				<div>
					<label class="field-label">Analyst</label>
					<div>
						<p class="field-value font-medium">{reportData.analyst.name}</p>
						<p class="field-value text-sm">{reportData.analyst.credentials}</p>
						<p class="field-value text-sm">{reportData.analyst.department}</p>
					</div>
				</div>
				<div>
					<label class="field-label">Procedures</label>
					<ul class="field-list">
						{#each reportData.methodology.procedures as procedure}
							<li>{procedure}</li>
						{/each}
					</ul>
				</div>
				<div>
					<label class="field-label">Tools</label>
					<div class="tag-list">
						{#each reportData.methodology.tools as tool}
							<span class="tag">{tool}</span>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- Legal Impact -->
		<div class="detail-card">
			<h3 class="detail-heading">
				<Scale size={18} /> Legal Implications
			</h3>
			<div class="detail-fields">
				<div>
					<label class="field-label">Potential Charges</label>
					<div class="item-list">
						{#each reportData.legalImplications.charges as charge}
							<div class="item-row">
								<CheckCircle size={14} class="text-accent" />
								<span>{charge}</span>
							</div>
						{/each}
					</div>
				</div>
				<div>
					<label class="field-label">Challenge Points</label>
					<div class="item-list">
						{#each reportData.legalImplications.challengePoints as challenge}
							<div class="item-row">
								<AlertTriangle size={14} class="text-warning" />
								<span>{challenge}</span>
							</div>
						{/each}
					</div>
				</div>
				<div>
					<label class="field-label">Relevant Precedents</label>
					<div class="item-list">
						{#each reportData.legalImplications.precedents as precedent}
							<div class="precedent-link">{precedent}</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Key Findings -->
	<div class="findings-section">
		<h3 class="section-title">Key Findings</h3>
		<div class="findings-grid">
			<div>
				<h4 class="subsection-title">Summary</h4>
				<p class="findings-text">{reportData.findings.summary}</p>
				<div class="confidence-bar-container">
					<div class="confidence-header">
						<span>Confidence Level</span>
						<span class="confidence-value">{Math.round(reportData.findings.confidence * 100)}%</span>
					</div>
					<div class="confidence-track">
						<div
							class="confidence-fill"
							class:high={reportData.findings.confidence >= 0.8}
							class:medium={reportData.findings.confidence >= 0.6 && reportData.findings.confidence < 0.8}
							class:low={reportData.findings.confidence < 0.6}
							style="width: {reportData.findings.confidence * 100}%"
						></div>
					</div>
				</div>
			</div>
			<div>
				<h4 class="subsection-title">Key Points</h4>
				<ul class="key-points">
					{#each reportData.findings.keyPoints as point}
						<li>
							<CheckCircle size={14} class="text-accent" />
							<span>{point}</span>
						</li>
					{/each}
				</ul>
				{#if reportData.findings.limitations.length > 0}
					<h4 class="subsection-title mt-4">Limitations</h4>
					<ul class="key-points">
						{#each reportData.findings.limitations as limitation}
							<li>
								<AlertTriangle size={14} class="text-warning" />
								<span>{limitation}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>

	<!-- Attachments -->
	{#if reportData.attachments.length > 0}
		<div class="attachments-section">
			<h3 class="section-title">Attachments</h3>
			<div class="attachments-grid">
				{#each reportData.attachments as attachment}
					<div class="attachment-card">
						<div class="attachment-icon">
							<FileText size={18} />
						</div>
						<div class="attachment-info">
							<p class="attachment-name">{attachment.name}</p>
							<p class="attachment-meta">{attachment.type} &bull; {(attachment.size / 1024).toFixed(1)} KB</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.evidence-report-summary {
		max-width: 80rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.report-header {
		background: var(--color-panel, #1a1a2e);
		border: 1px solid rgba(194, 178, 128, 0.2);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.header-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 1.5rem;
		gap: 1rem;
	}

	.header-info {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.type-icon {
		font-size: 2.5rem;
		line-height: 1;
	}

	.report-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
		margin: 0 0 0.25rem;
	}

	.header-meta {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.875rem;
		color: rgba(194, 178, 128, 0.6);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.badges {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.export-btn {
		padding: 0.5rem;
		color: rgba(194, 178, 128, 0.6);
		border: none;
		background: none;
		border-radius: 0.375rem;
		cursor: pointer;
	}
	.export-btn:hover {
		color: white;
		background: rgba(194, 178, 128, 0.1);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		padding: 1rem;
		background: rgba(194, 178, 128, 0.05);
	}

	.stat {
		text-align: center;
	}
	.stat-value {
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
	}
	.stat-label {
		font-size: 0.75rem;
		color: rgba(194, 178, 128, 0.6);
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}

	.detail-card {
		background: var(--color-panel, #1a1a2e);
		border: 1px solid rgba(194, 178, 128, 0.2);
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.detail-heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
		margin: 0 0 1rem;
	}

	.detail-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(194, 178, 128, 0.5);
		display: block;
		margin-bottom: 0.25rem;
	}
	.field-value {
		color: rgba(194, 178, 128, 0.8);
		margin: 0;
	}
	.field-list {
		list-style: disc;
		padding-left: 1rem;
		font-size: 0.875rem;
		color: rgba(194, 178, 128, 0.8);
		margin: 0;
	}
	.field-list li {
		margin-bottom: 0.25rem;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.tag {
		padding: 0.125rem 0.5rem;
		background: rgba(194, 178, 128, 0.1);
		color: rgba(194, 178, 128, 0.8);
		font-size: 0.75rem;
		border-radius: 0.25rem;
	}

	.chain-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-top: 0.25rem;
	}
	.chain-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: rgba(194, 178, 128, 0.8);
	}
	.chain-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		background: rgba(99, 179, 237, 0.1);
		color: #63b3ed;
		font-size: 0.75rem;
		border-radius: 9999px;
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.item-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: rgba(194, 178, 128, 0.8);
	}
	.precedent-link {
		font-size: 0.875rem;
		color: #63b3ed;
		cursor: pointer;
	}
	.precedent-link:hover {
		text-decoration: underline;
	}

	.findings-section,
	.attachments-section {
		background: var(--color-panel, #1a1a2e);
		border: 1px solid rgba(194, 178, 128, 0.2);
		border-radius: 0.5rem;
		padding: 1.5rem;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
		margin: 0 0 1rem;
	}

	.findings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	.subsection-title {
		font-weight: 500;
		color: white;
		margin: 0 0 0.5rem;
	}

	.findings-text {
		color: rgba(194, 178, 128, 0.8);
		margin: 0 0 1rem;
	}

	.confidence-bar-container {
		margin-top: 1rem;
	}
	.confidence-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: rgba(194, 178, 128, 0.6);
		margin-bottom: 0.375rem;
	}
	.confidence-value {
		font-weight: 600;
		color: white;
	}
	.confidence-track {
		width: 100%;
		height: 0.5rem;
		background: rgba(194, 178, 128, 0.1);
		border-radius: 9999px;
		overflow: hidden;
	}
	.confidence-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.3s ease;
	}
	.confidence-fill.high {
		background: var(--color-accent, #48bb78);
	}
	.confidence-fill.medium {
		background: var(--color-warning, #ecc94b);
	}
	.confidence-fill.low {
		background: var(--color-danger, #f56565);
	}

	.key-points {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.key-points li {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		color: rgba(194, 178, 128, 0.8);
		font-size: 0.875rem;
	}

	.attachments-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}
	.attachment-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid rgba(194, 178, 128, 0.2);
		border-radius: 0.5rem;
		padding: 1rem;
	}
	.attachment-card:hover {
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
	}
	.attachment-icon {
		padding: 0.5rem;
		background: rgba(99, 179, 237, 0.1);
		border-radius: 0.375rem;
		color: #63b3ed;
	}
	.attachment-name {
		font-weight: 500;
		color: white;
		margin: 0;
		font-size: 0.875rem;
	}
	.attachment-meta {
		font-size: 0.75rem;
		color: rgba(194, 178, 128, 0.5);
		margin: 0;
	}

	.mt-4 {
		margin-top: 1rem;
	}

	@media (max-width: 1024px) {
		.detail-grid {
			grid-template-columns: 1fr;
		}
		.findings-grid {
			grid-template-columns: 1fr;
		}
		.attachments-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
