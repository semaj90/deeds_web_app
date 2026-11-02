<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

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

	const analysisTypes: { value: AnalysisType; label: string; icon: string; dot: string }[] = [
		{ value: 'summary', label: 'Summary', icon: 'yorha-precedent', dot: '#FFE59A' },
		{ value: 'legal_issues', label: 'Legal Issues', icon: 'yorha-law-book', dot: '#B7E1D1' },
		{ value: 'risks', label: 'Risk Flags', icon: 'yorha-warning', dot: '#F6C1C8' },
		{ value: 'evidence_review', label: 'Exhibit Audit', icon: 'yorha-evidence', dot: '#A9D3FF' }
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

<div class="bento-botanical-card">
	<div class="bento-inner-filigree" aria-hidden="true"></div>
	<span class="bento-flourish bento-tl" aria-hidden="true">❖</span>
	<span class="bento-flourish bento-tr" aria-hidden="true">❖</span>
	<span class="bento-flourish bento-bl" aria-hidden="true">❖</span>
	<span class="bento-flourish bento-br" aria-hidden="true">❖</span>

	<div class="bento-card-header">
		<span class="ryuo-plaque">
			<Icon name="yorha-ai-assistant" size={13} class="text-[#FFE59A] shrink-0" />
			<span class="ryuo-plaque-text">AI Case Synthesis</span>
		</span>
		<span class="bento-soft-tag">SSE · Ornith</span>
	</div>

	<div class="bento-card-body">
		<!-- Soft Rounded 2x2 Bento Lens Pills -->
		<div class="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Analysis mode">
			{#each analysisTypes as type (type.value)}
				{@const active = selectedType === type.value}
				<button
					type="button"
					data-unstyled
					role="radio"
					aria-checked={active}
					onclick={() => (selectedType = type.value)}
					disabled={isStreaming}
					class={['miyama-lens-pill', active ? 'miyama-lens-active' : 'miyama-lens-idle']}
				>
					<span class="flex items-center gap-2 min-w-0">
						<span class="miyama-dot" style={`background:${type.dot}`} aria-hidden="true"></span>
						<span class="truncate">{type.label}</span>
					</span>
					<span class="miyama-mini-arrow" aria-hidden="true">›</span>
				</button>
			{/each}
		</div>

		<!-- Miyama Soft Full-Pill Primary Button with Butter-Gold Arrow Circle -->
		<button
			type="button"
			data-unstyled
			onclick={startAnalysis}
			class={['miyama-primary-pill', isStreaming && 'miyama-primary-stop']}
		>
			<span>{isStreaming ? 'Halt Synthesis Stream' : 'Execute Synthesis'}</span>
			<span class="miyama-arrow-circle" aria-hidden="true">
				{isStreaming ? '✕' : '→'}
			</span>
		</button>

		{#if error}
			<div class="mt-3 px-3.5 py-2.5 bg-[#FFF1F3] border border-[#E8A7B1] rounded-2xl text-xs text-[#7A2832]">
				{error}
			</div>
		{/if}

		{#if analysis}
			<div class="mt-3 p-3.5 bg-[#FFFFFF] rounded-2xl border border-[#E4D9CB] max-h-[340px] overflow-y-auto shadow-sm">
				<div class="text-[13px] leading-relaxed text-[#2C2520] whitespace-pre-wrap">{analysis}</div>
			</div>
		{:else if !isStreaming && !error}
			<div class="bento-lens-hint">
				<p>
					Choose an analysis lens above and click <strong>Execute Synthesis</strong> for grounded brief insights.
				</p>
			</div>
		{/if}

		{#if isStreaming}
			<div class="flex items-center justify-center gap-2 mt-3 py-2 bg-[#FAF4EC] border border-[#E4D9CB] rounded-full">
				<div class="flex gap-1">
					<span class="w-1.5 h-1.5 bg-[#B97F62] rounded-full animate-bounce"></span>
					<span class="w-1.5 h-1.5 bg-[#D47A85] rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
					<span class="w-1.5 h-1.5 bg-[#E5B95C] rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
				</div>
				<span class="text-[11px] font-medium tracking-wider uppercase text-[#7A5A4A]">Streaming counsel brief…</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.bento-botanical-card {
		position: relative;
		background: linear-gradient(180deg, #FFFCF9 0%, #FAF4EC 100%);
		border: 1px solid #E2D7C9;
		border-radius: 22px;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.9) inset,
			0 12px 32px -12px rgba(72, 61, 54, 0.09);
		color: #2B241F;
		font-family: 'Inter', 'InterLocal', system-ui, -apple-system, sans-serif;
		overflow: hidden;
	}

	.bento-inner-filigree {
		position: absolute;
		inset: 6px;
		border: 1px solid rgba(185, 127, 98, 0.22);
		border-radius: 17px;
		pointer-events: none;
		z-index: 1;
	}

	.bento-flourish {
		position: absolute;
		font-size: 9px;
		line-height: 1;
		color: #B97F62;
		opacity: 0.65;
		pointer-events: none;
		z-index: 2;
	}
	.bento-tl { top: 9px; left: 11px; }
	.bento-tr { top: 9px; right: 11px; }
	.bento-bl { bottom: 9px; left: 11px; }
	.bento-br { bottom: 9px; right: 11px; }

	.bento-card-header {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.95rem 1.1rem 0.45rem;
	}

	/* RYUOpresents Roasted-Mocha Ribbon Plaque */
	.ryuo-plaque {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		padding: 0.28rem 0.82rem;
		border-radius: 9999px;
		background: linear-gradient(180deg, #5C493F 0%, #483D36 100%);
		border: 1px solid #C9BCAB;
		box-shadow: 0 3px 10px -3px rgba(72, 61, 54, 0.28);
	}

	.ryuo-plaque-text {
		font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #FFF7EE;
	}

	.bento-soft-tag {
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		background: #F4ECE1;
		border: 1px solid #E2D5C5;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #7A5A4A;
	}

	.bento-card-body {
		position: relative;
		z-index: 2;
		padding: 0.55rem 1.1rem 1.05rem;
	}

	.miyama-lens-pill {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem;
		height: 36px;
		padding: 0 0.75rem;
		border-radius: 9999px;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.73rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
		transition: all 0.16s ease;
	}

	.miyama-lens-idle {
		background: #FFFFFF;
		border: 1px solid #E2D7C9;
		color: #3B322C;
		box-shadow: 0 2px 6px rgba(72, 61, 54, 0.04);
	}
	.miyama-lens-idle:hover:not(:disabled) {
		background: #FFF9F2;
		border-color: #C9A882;
		transform: translateY(-1px);
	}

	.miyama-lens-active {
		background: #231E1B;
		border: 1px solid #483D36;
		color: #FFF9F2;
		box-shadow: 0 6px 14px -4px rgba(35, 30, 27, 0.28);
	}

	.miyama-dot {
		width: 8px;
		height: 8px;
		border-radius: 9999px;
		flex-shrink: 0;
	}

	.miyama-mini-arrow {
		font-size: 0.85rem;
		opacity: 0.65;
	}

	/* Miyama Signature Pill Button with Butter-Gold Arrow Circle */
	.miyama-primary-pill {
		width: 100%;
		height: 40px;
		padding: 0 0.45rem 0 1.15rem;
		border-radius: 9999px;
		background: #1F1B18;
		border: 1px solid #3D342E;
		color: #FFFDF9;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: 'Inter', 'InterLocal', system-ui, sans-serif;
		font-size: 0.76rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		cursor: pointer;
		box-shadow: 0 8px 18px -6px rgba(31, 27, 24, 0.26);
		transition: all 0.18s ease;
	}
	.miyama-primary-pill:hover {
		background: #332A25;
		transform: translateY(-1px);
	}
	.miyama-primary-stop {
		background: #8B3A42;
		border-color: #D47A85;
	}

	.miyama-arrow-circle {
		width: 28px;
		height: 28px;
		border-radius: 9999px;
		background: #FFE59A;
		color: #1F1B18;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.82rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.bento-lens-hint {
		margin-top: 0.7rem;
		padding-top: 0.6rem;
		border-top: 1px dashed #E5DACB;
		text-align: center;
	}
	.bento-lens-hint p {
		margin: 0;
		font-size: 0.74rem;
		line-height: 1.5;
		color: #7A6B5E;
	}
	.bento-lens-hint strong {
		color: #483D36;
		font-weight: 600;
	}
</style>
