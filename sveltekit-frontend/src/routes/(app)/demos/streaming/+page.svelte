<script lang="ts">
	import StreamingResponse from '$lib/components/StreamingResponse.svelte';

	let response = $state('');
	let isStreaming = $state(false);

	const sampleText = `Based on the analysis of the evidence presented in Case #2024-CR-0847, there are several key findings:

1. **Chain of Custody**: The evidence chain remains intact from collection through laboratory analysis. All transfer points are documented with proper signatures and timestamps.

2. **Forensic Analysis**: Digital forensics confirmed the authenticity of the documents. No evidence of tampering was detected in the metadata analysis.

3. **Witness Statements**: Three corroborating witness statements support the timeline established by the prosecution. Minor discrepancies in peripheral details do not undermine the core narrative.

4. **Legal Precedent**: The applicable case law (Smith v. Jones, 2019) establishes that similar evidence patterns meet the preponderance standard required for civil proceedings.`;

	function simulateStream() {
		response = '';
		isStreaming = true;
		let i = 0;
		const interval = setInterval(() => {
			if (i < sampleText.length) {
				response = sampleText.slice(0, i + 3);
				i += 3;
			} else {
				isStreaming = false;
				clearInterval(interval);
			}
		}, 20);
	}

	export const ssr = false;
</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Streaming Response</h1>
		<p class="text-sm opacity-60">AI response streaming display with cursor animation, loading indicator, and role badge.</p>
	</header>

	<button class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 text-sm mb-4" onclick={simulateStream} disabled={isStreaming}>
		{isStreaming ? 'Streaming...' : 'Start Stream Demo'}
	</button>

	<StreamingResponse {response} />
</div>
