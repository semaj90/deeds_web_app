<script lang="ts">
	import EvidenceUploadResults from '$lib/components/evidence/EvidenceUploadResults.svelte';

	// Test chunks from our seeded evidence
	const testChunks = [
		{
			type: 'ARTICLE',
			identifier: 'Article I',
			content:
				'ARTICLE I - GENERAL PROVISIONS\n\nSection 1.01 Purpose and Scope\nThis Agreement sets forth the terms and conditions governing the relationship between the parties with respect to the subject matter herein.\n\nSection 1.02 Definitions\nFor purposes of this Agreement, the following terms shall have the meanings set forth below:\n(a) "Effective Date" means the date first written above;\n(b) "Party" or "Parties" means the entities identified in the preamble;\n(c) "Agreement" means this document and all exhibits attached hereto.',
			page: 1,
			confidence: 0.95
		},
		{
			type: 'SECTION',
			identifier: 'Section 2.01',
			content:
				'Section 2.01 Obligations of First Party\n\nThe First Party shall:\n(a) Provide all necessary documentation within 30 days of the Effective Date;\n(b) Maintain confidentiality of all proprietary information;\n(c) Comply with all applicable laws and regulations;\n(d) Notify Second Party of any material changes within 5 business days.',
			page: 2,
			confidence: 0.92
		},
		{
			type: 'SECTION',
			identifier: 'Section 2.02',
			content:
				'Section 2.02 Obligations of Second Party\n\nThe Second Party shall:\n(a) Review all submissions within 15 business days;\n(b) Provide written notice of any deficiencies;\n(c) Maintain accurate records of all transactions;\n(d) Ensure compliance with data protection requirements.',
			page: 2,
			confidence: 0.94
		},
		{
			type: 'SUBSECTION',
			identifier: 'Section 3.01(a)',
			content:
				'Section 3.01(a) Payment Terms\n\nAll payments shall be made within thirty (30) days of invoice date. Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, whichever is less.',
			page: 3,
			confidence: 0.89
		},
		{
			type: 'ARTICLE',
			identifier: 'Article IV',
			content:
				'ARTICLE IV - CONFIDENTIALITY\n\nSection 4.01 Confidential Information\nEach Party acknowledges that in the course of performance under this Agreement, it may have access to confidential and proprietary information of the other Party.\n\nSection 4.02 Non-Disclosure\nNeither Party shall disclose, reproduce, or use any confidential information except as necessary to perform its obligations hereunder.',
			page: 4,
			confidence: 0.96
		},
		{
			type: 'SUBSECTION',
			identifier: 'Section 4.03(b)',
			content:
				'Section 4.03(b) Exceptions to Confidentiality\n\nConfidential information shall not include information that:\n(i) is or becomes publicly available through no breach of this Agreement;\n(ii) is rightfully received from a third party without restriction;\n(iii) is independently developed without use of confidential information.',
			page: 5,
			confidence: 0.91
		},
		{
			type: 'SECTION',
			identifier: 'Section 5.01',
			content:
				'Section 5.01 Term and Termination\n\nThis Agreement shall commence on the Effective Date and continue for a period of two (2) years unless earlier terminated pursuant to this Section. Either Party may terminate this Agreement upon thirty (30) days written notice.',
			page: 6,
			confidence: 0.93
		},
		{
			type: 'ARTICLE',
			identifier: 'Article VI',
			content:
				'ARTICLE VI - DISPUTE RESOLUTION\n\nSection 6.01 Negotiation\nThe Parties shall attempt in good faith to resolve any dispute arising out of or relating to this Agreement through negotiation.\n\nSection 6.02 Arbitration\nIf the Parties are unable to resolve the dispute through negotiation within thirty (30) days, the dispute shall be submitted to binding arbitration in accordance with the rules of the American Arbitration Association.',
			page: 7,
			confidence: 0.97
		}
	];
</script>

<svelte:head>
	<title>Chunks UI Demo | Legal AI</title>
</svelte:head>

<div class="demo-container">
	<div class="demo-header">
		<h1>Evidence Chunks UI Demo</h1>
		<p class="demo-description">
			This demo showcases the expandable chunks interface from <code
				>EvidenceUploadResults.svelte</code
			>
		</p>
		<div class="demo-stats">
			<span class="stat">📊 Total Chunks: {testChunks.length}</span>
			<span class="stat"
				>🏷️ ARTICLE: {testChunks.filter((c) => c.type === 'ARTICLE').length}</span
			>
			<span class="stat"
				>🏷️ SECTION: {testChunks.filter((c) => c.type === 'SECTION').length}</span
			>
			<span class="stat"
				>🏷️ SUBSECTION: {testChunks.filter((c) => c.type === 'SUBSECTION').length}</span
			>
		</div>
	</div>

	<div class="demo-content">
		<EvidenceUploadResults
			chunks={testChunks}
			evidenceId="26c42a93-1a4f-47b2-b439-ea6e3e9d72e0"
			fileName="service_agreement.pdf"
			extractedText=""
			caseId="713334f0-1161-42df-8b69-899f798ab275"
		/>
	</div>

	<div class="demo-footer">
		<p>
			<strong>Instructions:</strong> Click the chevron icons to expand/collapse chunks. Notice the
			color coding:
		</p>
		<ul>
			<li><span class="color-swatch article"></span> ARTICLE (cyan)</li>
			<li><span class="color-swatch section"></span> SECTION (orange)</li>
			<li><span class="color-swatch subsection"></span> SUBSECTION (purple)</li>
		</ul>
	</div>
</div>

<style>
	.demo-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.demo-header {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--t-surface, #1e1e1e);
		border-radius: 8px;
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.1));
	}

	.demo-header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 1.75rem;
		color: var(--t-heading, #e8e6e3);
	}

	.demo-description {
		margin: 0.5rem 0 1rem 0;
		color: var(--t-text-secondary, rgba(255, 255, 255, 0.7));
		font-size: 0.95rem;
	}

	.demo-description code {
		background: rgba(255, 255, 255, 0.1);
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-family: 'Courier New', monospace;
		font-size: 0.9em;
	}

	.demo-stats {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	.stat {
		font-size: 0.9rem;
		color: var(--t-text, rgba(255, 255, 255, 0.9));
		padding: 0.4rem 0.8rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
	}

	.demo-content {
		margin: 2rem 0;
	}

	.demo-footer {
		margin-top: 2rem;
		padding: 1.5rem;
		background: var(--t-surface, #1e1e1e);
		border-radius: 8px;
		border: 1px solid var(--t-border, rgba(255, 255, 255, 0.1));
	}

	.demo-footer p {
		margin: 0 0 0.75rem 0;
		color: var(--t-text, rgba(255, 255, 255, 0.9));
	}

	.demo-footer ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.demo-footer li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--t-text-secondary, rgba(255, 255, 255, 0.7));
	}

	.color-swatch {
		display: inline-block;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.color-swatch.article {
		background: rgba(126, 231, 255, 0.3);
	}

	.color-swatch.section {
		background: rgba(255, 212, 121, 0.3);
	}

	.color-swatch.subsection {
		background: rgba(200, 180, 255, 0.3);
	}
</style>
