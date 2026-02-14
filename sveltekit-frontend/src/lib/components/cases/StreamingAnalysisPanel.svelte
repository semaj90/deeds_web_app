<script lang="ts">
	type AnalysisType = 'summary' | 'legal_issues' | 'risks' | 'evidence_review';

	interface Props {
		caseId: string;
	}

	let { caseId }: Props = $props();

	let selectedType = $state<AnalysisType>('summary');
	let analysis = $state('');
	let isStreaming = $state(false);
	let error = $state<string | null>(null);
	let abortController = $state<AbortController | null>(null);

	const analysisTypes: { value: AnalysisType; label: string; icon: string }[] = [
		{ value: 'summary', label: 'Summary', icon: '📋' },
		{ value: 'legal_issues', label: 'Legal Issues', icon: '⚖️' },
		{ value: 'risks', label: 'Risk Assessment', icon: '⚠️' },
		{ value: 'evidence_review', label: 'Evidence Review', icon: '🔍' }
	];

	async function startAnalysis() {
		if (isStreaming && abortController) {
			abortController.abort();
			isStreaming = false;
			return;
		}

		isStreaming = true;
		analysis = '';
		error = null;

		const controller = new AbortController();
		abortController = controller;

		try {
			const response = await fetch(`/api/cases/${caseId}/analyze/stream`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ analysisType: selectedType }),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Analysis request failed (${response.status})`);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response stream');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					try {
						const data = JSON.parse(line.slice(6));
						if (data.type === 'token') {
							analysis += data.content;
						} else if (data.type === 'error') {
							error = data.error;
						}
					} catch {
						// skip malformed SSE lines
					}
				}
			}
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				// User cancelled
			} else {
				error = err instanceof Error ? err.message : 'Analysis failed';
			}
		} finally {
			isStreaming = false;
			abortController = null;
		}
	}
</script>

<div class="bg-white rounded-lg shadow p-6">
	<h3 class="font-semibold text-sand mb-3">AI Case Analysis</h3>

	<!-- Analysis Type Selector -->
	<div class="flex flex-wrap gap-2 mb-4">
		{#each analysisTypes as type (type.value)}
			<button
				onclick={() => (selectedType = type.value)}
				disabled={isStreaming}
				class={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
					selectedType === type.value
						? 'bg-info/60 text-white'
						: 'bg-sand/10 text-sand/60 hover:bg-sand/10'
				} disabled:opacity-50`}
			>
				{type.icon} {type.label}
			</button>
		{/each}
	</div>

	<!-- Analyze Button -->
	<button
		onclick={startAnalysis}
		class={`w-full px-4 py-2 rounded-lg text-sm font-medium transition mb-4 ${
			isStreaming
				? 'bg-danger text-white hover:bg-danger'
				: 'bg-info/60 text-white hover:bg-info/40'
		}`}
	>
		{isStreaming ? 'Stop Analysis' : 'Run Analysis'}
	</button>

	<!-- Output -->
	{#if error}
		<div class="p-3 bg-danger/5 border border-danger/20 rounded-lg mb-3">
			<p class="text-danger text-sm">{error}</p>
		</div>
	{/if}

	{#if analysis}
		<div class="analysis-output p-4 bg-sand/5 rounded-lg border border-sand/20 max-h-[400px] overflow-y-auto">
			<div class="prose prose-sm max-w-none text-sand whitespace-pre-wrap">{analysis}</div>
		</div>
	{:else if !isStreaming && !error}
		<p class="text-sm text-sand/40 text-center py-4">
			Select an analysis type and click "Run Analysis" to get AI insights about this case.
		</p>
	{/if}

	{#if isStreaming}
		<div class="flex items-center gap-2 mt-3">
			<div class="flex gap-1">
				<span class="w-2 h-2 bg-info rounded-full animate-bounce"></span>
				<span class="w-2 h-2 bg-info rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
				<span class="w-2 h-2 bg-info rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
			</div>
			<span class="text-xs text-sand/60">Analyzing...</span>
		</div>
	{/if}
</div>
