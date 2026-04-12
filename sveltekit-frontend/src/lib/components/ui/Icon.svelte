<script lang="ts">
	import IconLawBook from '$lib/icons/yorha/IconLawBook.svelte';
	import IconCitation from '$lib/icons/yorha/IconCitation.svelte';
	import IconGlossaryTerm from '$lib/icons/yorha/IconGlossaryTerm.svelte';
	import IconPrecedentCase from '$lib/icons/yorha/IconPrecedentCase.svelte';
	import IconRegulation from '$lib/icons/yorha/IconRegulation.svelte';
	import IconSubjectProfile from '$lib/icons/yorha/IconSubjectProfile.svelte';
	import IconEvidenceFile from '$lib/icons/yorha/IconEvidenceFile.svelte';
	import IconTimeline from '$lib/icons/yorha/IconTimeline.svelte';
	import IconNetworkGraph from '$lib/icons/yorha/IconNetworkGraph.svelte';
	import IconIntegrityShield from '$lib/icons/yorha/IconIntegrityShield.svelte';
	import IconWarningFlag from '$lib/icons/yorha/IconWarningFlag.svelte';
	import IconAiAssistant from '$lib/icons/yorha/IconAiAssistant.svelte';
	import IconPanelClose from '$lib/icons/yorha/IconPanelClose.svelte';
	import IconPanelOpen from '$lib/icons/yorha/IconPanelOpen.svelte';

	const yorhaMap: Record<string, typeof IconLawBook> = {
		'yorha-law-book': IconLawBook,
		'yorha-citation': IconCitation,
		'yorha-glossary': IconGlossaryTerm,
		'yorha-precedent': IconPrecedentCase,
		'yorha-regulation': IconRegulation,
		'yorha-subject': IconSubjectProfile,
		'yorha-evidence': IconEvidenceFile,
		'yorha-timeline': IconTimeline,
		'yorha-network': IconNetworkGraph,
		'yorha-integrity': IconIntegrityShield,
		'yorha-warning': IconWarningFlag,
		'yorha-ai-assistant': IconAiAssistant,
		'yorha-panel-close': IconPanelClose,
		'yorha-panel-open': IconPanelOpen
	};

	let { name, size, class: className = '', label }: {
		name: string;
		size?: string | number;
		class?: string;
		label?: string;
	} = $props();

	let isYorha = $derived(name.startsWith('yorha-'));
	let yorhaComponent = $derived(isYorha ? yorhaMap[name] : null);

	let numericSize = $derived.by(() => {
		if (!size) return 24;
		return typeof size === 'number' ? size : parseInt(size, 10) || 24;
	});

	let sizeStyle = $derived.by(() => {
		if (!size) return '';
		const val = typeof size === 'number' ? `${size}px` : size;
		return `width:${val};height:${val};`;
	});
</script>

{#if isYorha && yorhaComponent}
	{@const YorhaIcon = yorhaComponent}
	<YorhaIcon size={numericSize} class={className} />
{:else}
	<span
		class="i-lucide-{name} inline-block {className}"
		style={sizeStyle}
		aria-hidden={label ? undefined : 'true'}
		aria-label={label}
		role={label ? 'img' : undefined}
	></span>
{/if}
