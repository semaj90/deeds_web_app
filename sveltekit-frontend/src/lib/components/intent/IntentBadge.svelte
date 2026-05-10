<!--
  IntentBadge — small pill showing intent label + confidence.

  Phase C of the 2026-05-10 service-worker + regex-tool-router design.
  Renders neutral grey when fallback=true or label='unknown'; tinted
  by label otherwise. Optional chain trace tooltip when steps are present.
-->
<script lang="ts">
	import type { IntentResult } from '$lib/intent/regex-intent';
	import type { ContextualChatRoute } from '$lib/stores/contextual-chat.svelte';

	interface Props {
		intent?: IntentResult | null;
		route?: ContextualChatRoute | null;
		/** Compact form for inline message rendering. Default false. */
		compact?: boolean;
	}

	let { intent = null, route = null, compact = false }: Props = $props();

	// Per-label tint — matches the theme tokens in CLAUDE.md (sand/panel/accent palette)
	const TINTS: Record<string, string> = {
		evidence_upload: 'bg-info/15 text-info border-info/40',
		schema_drift:    'bg-warning/15 text-warning border-warning/40',
		graph_search:    'bg-accent/15 text-accent border-accent/40',
		gpu_rerank:      'bg-accent/15 text-accent border-accent/40',
		ui_bug:          'bg-danger/15 text-danger border-danger/40',
		legal_research:  'bg-accentSoft/15 text-accentSoft border-accentSoft/40',
		unknown:         'bg-panel text-sand/60 border-panel',
	};

	const tint = $derived(
		!intent || intent.fallback ? TINTS.unknown : (TINTS[intent.label] ?? TINTS.unknown)
	);

	const confidencePct = $derived(
		intent ? Math.round(intent.confidence * 100) : 0
	);

	const failedSteps  = $derived(route?.trace.filter((t) => !t.ok).length ?? 0);
	const totalSteps   = $derived(route?.trace.length ?? 0);
	const partialBadge = $derived(failedSteps > 0 && failedSteps < totalSteps);
	const degradedBadge = $derived(failedSteps > 0 && failedSteps === totalSteps);

	function trapTitle(): string {
		if (!route) return intent?.keywords.join(', ') ?? '';
		const lines = [
			`reason: ${route.reason}`,
			...route.trace.map((t) => `  ${t.ok ? '✓' : '✗'} ${t.tool} (${t.ms}ms)${t.error ? ' — ' + t.error : ''}`),
		];
		return lines.join('\n');
	}
</script>

{#if intent}
	<span
		class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono {tint}"
		class:text-[10px]={compact}
		class:text-xs={!compact}
		title={trapTitle()}
	>
		<span class="font-semibold tracking-tight">
			{intent.fallback ? 'fallback' : intent.label}
		</span>
		<span class="opacity-70">·</span>
		<span>{confidencePct}%</span>

		{#if partialBadge}
			<span class="ml-1 rounded-sm bg-warning/30 px-1 py-px text-[9px] font-bold uppercase">partial</span>
		{:else if degradedBadge}
			<span class="ml-1 rounded-sm bg-danger/30 px-1 py-px text-[9px] font-bold uppercase">degraded</span>
		{/if}
	</span>
{/if}
