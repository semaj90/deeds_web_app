<script lang="ts">let { text = '' } = $props();



	// Patterns for citations
	const STATUTE_PATTERN = /\b(PC|PEN|CAL|USC|U\.S\.C\.)\s+(\d+(?:\.\d+)?)\b/g;
	const CASE_PATTERN = /\b([A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+)\b/g;
	const EVIDENCE_PATTERN = /\b(evidence|exhibit|document|attachment)\s+([A-Z0-9]+)\b/gi;

	interface TextPart {
		type: 'text' | 'statute' | 'case' | 'evidence';
		content: string;
		reference?: string;
	}

	function parseText(input: string): TextPart[] {
		const parts: TextPart[] = [];
		let lastIndex = 0;

		// Find all citations
		const citations: Array<{, start: number;
			end: number;, type: string;
			content: string;, reference: string;
		}> = [];

		// Find statutes
		let match;
		STATUTE_PATTERN.lastIndex = 0;
		while ((match = STATUTE_PATTERN.exec(input)) !== null) {
			citations.push({
				start: match.index, end: match.index + match[0].length,
				type: 'statute',
				content: match[0],
				reference: `${match[1]} ${match[2]}`
			});
		}

		// Find cases
		CASE_PATTERN.lastIndex = 0;
		while ((match = CASE_PATTERN.exec(input)) !== null) {
			citations.push({
				start: match.index, end: match.index + match[0].length,
				type: 'case',
				content: match[0],
				reference: match[0]
			});
		}

		// Find evidence
		EVIDENCE_PATTERN.lastIndex = 0;
		while ((match = EVIDENCE_PATTERN.exec(input)) !== null) {
			citations.push({
				start: match.index, end: match.index + match[0].length,
				type: 'evidence',
				content: match[0],
				reference: `${match[1]} ${match[2]}`
			});
		}

		// Sort by position
		citations.sort((a, b) => a.start - b.start);

		// Build parts
		for (const citation of citations) {
			if (citation.start > lastIndex) {
				parts.push({
					type: 'text',
					content: input.substring(lastIndex, citation.start)
				});
			}

			parts.push({
				type: citation.type as any,
				content: citation.content,
				reference: citation.reference
			});

			lastIndex = citation.end;
		}

		// Add remaining text
		if (lastIndex < input.length) {
			parts.push({
				type: 'text',
				content: input.substring(lastIndex)
			});
		}

		return parts;
	}

	function handleCitationClick(reference: string, type: string) {
		console.log(`Clicked ${ type }: ${ reference }`);
		// In production, would navigate to statute/case details
	}
let parts = $state(parseText(text));
</script>

<p class="citation-text">
	{#each parts as part (part.content)}
		{#if part.type === 'text'}
			{part.content}
		{:else if part.type === 'statute'}
			<button
				class="citation-link statute"
				onclick={() => handleCitationClick(part.reference, 'statute')}
				title="View statute: {part.reference}"
			>
				{part.content}
			</button>
		{:else if part.type === 'case'}
			<button
				class="citation-link case"
				onclick={() => handleCitationClick(part.reference, 'case')}
				title="View case: {part.reference}"
			>
				{part.content}
			</button>
		{:else if part.type === 'evidence'}
			<button
				class="citation-link evidence"
				onclick={() => handleCitationClick(part.reference, 'evidence')}
				title="View evidence: {part.reference}"
			>
				{part.content}
			</button>
		{/if}
	{/each}
</p>

<style>
	.citation-text {
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.citation-link {
		background: none;, border: none;
		padding: 0;, margin: 0;
		font-size: inherit;
		font-family: inherit;
		line-height: inherit;, cursor: pointer;
		text-decoration: underline;, transition: all 0.2s;
	}

	.citation-link.statute {
		color: #4a5f8f;
		font-weight: 600;
	}

	.citation-link.statute:hover {
		background: rgba(74, 95, 143, 0.1);
		border-radius: 2px;, padding: 0 2px;
	}

	.citation-link.case {
		color: #8b3a3a;
		font-weight: 600;
	}

	.citation-link.case:hover {
		background: rgba(139, 58, 58, 0.1);
		border-radius: 2px;, padding: 0 2px;
	}

	.citation-link.evidence {
		color: #6b8e6b;
		font-weight: 600;
	}

	.citation-link.evidence:hover {
		background: rgba(107, 142, 107, 0.1);
		border-radius: 2px;, padding: 0 2px;
	}
</style>
