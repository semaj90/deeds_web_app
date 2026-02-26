<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		enabled?: boolean;
		loading?: boolean;
		premium?: boolean;
		size?: 'sm' | 'md' | 'lg';
		ontoggle?: (event: { enabled: boolean }) => void;
		onconfigure?: () => void;
		onupgrade?: () => void;
	}

	let {
		enabled = $bindable(false),
		loading = false,
		premium = true,
		size = 'md',
		ontoggle,
		onconfigure,
		onupgrade
	}: Props = $props();

	let showTooltip = $state(false);
	let showConfig = $state(false);
	let thinkingDepth = $state('detailed');
	let focusAreas = $state({
		precedents: true,
		evidence: true,
		compliance: true,
		alternatives: false
	});

	let iconSize = $derived(size === 'sm' ? 16 : size === 'md' ? 20 : 24);
	let btnSize = $derived.by(() => {
		if (size === 'sm') return 'sm' as const;
		if (size === 'lg') return 'lg' as const;
		return 'md' as const;
	});

	function handleToggle() {
		if (!premium) {
			onupgrade?.();
			return;
		}
		enabled = !enabled;
		ontoggle?.({ enabled });
	}

	function handleConfigure() {
		if (!premium) return;
		showConfig = !showConfig;
		onconfigure?.();
	}
</script>

<div class="relative flex flex-col gap-3">
	<div
		class="relative flex items-center"
		onmouseenter={() => (showTooltip = true)}
		onmouseleave={() => (showTooltip = false)}
		role="group"
	>
		<Button
			size={btnSize}
			disabled={loading || (!premium && !enabled)}
			onclick={handleToggle}
			class="min-w-[140px] justify-start"
		>
			<span class="flex items-center justify-center w-5 h-5 mr-2">
				{#if loading}
					<span class="inline-block w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin"></span>
				{:else if enabled}
					<Icon name="brain" size={iconSize} />
				{:else}
					<Icon name="zap" size={iconSize} />
				{/if}
			</span>
			<span class="text-sm">
				{#if loading}
					Analyzing...
				{:else if enabled}
					Thinking Style
				{:else}
					Quick Mode
				{/if}
			</span>
		</Button>

		{#if premium}
			<Button variant="ghost" size="sm" onclick={handleConfigure} disabled={loading} class="ml-2">
				<Icon name="settings" size={14} />
			</Button>
		{/if}

		{#if !premium}
			<Button variant="ghost" size="sm" onclick={() => onupgrade?.()} class="ml-2">
				<Icon name="info" size={14} />
			</Button>
		{/if}

		{#if showTooltip}
			<div class="absolute top-full mt-2 left-0 z-50 pointer-events-none" transition:fade={{ duration: 200 }}>
				{#if !premium}
					<div class="bg-panel-soft border border-sand-dark rounded-lg p-3 shadow-xl max-w-xs flex gap-3 items-start">
						<Icon name="crown" size={16} />
						<div>
							<strong class="block mb-1">Premium Feature</strong>
							<p class="mb-2 opacity-90 text-[13px] leading-snug m-0">Thinking Style requires Premium access for advanced AI reasoning</p>
						</div>
					</div>
				{:else if enabled}
					<div class="bg-panel-soft border border-sand-dark rounded-lg p-3 shadow-xl max-w-xs flex gap-3 items-start">
						<Icon name="brain" size={16} />
						<div>
							<strong class="block mb-1">Thinking Style Active</strong>
							<p class="mb-2 opacity-90 text-[13px] leading-snug m-0">AI shows step-by-step reasoning process</p>
							<div class="flex flex-col gap-0.5">
								<span class="text-xs opacity-80">Deeper legal analysis</span>
								<span class="text-xs opacity-80">Transparent reasoning</span>
								<span class="text-xs opacity-80">Higher accuracy</span>
								<span class="text-xs opacity-80">Detailed explanations</span>
							</div>
						</div>
					</div>
				{:else}
					<div class="bg-panel-soft border border-sand-dark rounded-lg p-3 shadow-xl max-w-xs flex gap-3 items-start">
						<Icon name="zap" size={16} />
						<div>
							<strong class="block mb-1">Quick Mode Active</strong>
							<p class="mb-2 opacity-90 text-[13px] leading-snug m-0">Fast AI responses without reasoning details</p>
							<div class="flex flex-col gap-0.5">
								<span class="text-xs opacity-80">Instant results</span>
								<span class="text-xs opacity-80">Concise answers</span>
								<span class="text-xs opacity-80">Lower resource usage</span>
								<span class="text-xs opacity-80">Basic analysis</span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if showConfig && premium}
		<div class="bg-panel-soft border border-sand-dark rounded-xl p-5" transition:slide={{ duration: 300 }}>
			<div class="mb-4">
				<h4 class="text-[15px] font-semibold m-0">Thinking Style Configuration</h4>
				<p class="text-[13px] opacity-60 mt-1 m-0">Customize AI reasoning parameters</p>
			</div>

			<div class="flex flex-col gap-4 mb-4">
				<div class="flex flex-col gap-2">
					<label for="thinking-depth" class="text-sm font-medium">Reasoning Depth</label>
					<select id="thinking-depth" bind:value={thinkingDepth} class="w-full px-3 py-2 border border-sand-dark rounded-md bg-panel text-inherit text-sm focus:outline-none focus:border-accent">
						<option value="basic">Basic (3-5 steps)</option>
						<option value="detailed">Detailed (5-10 steps)</option>
						<option value="comprehensive">Comprehensive (10+ steps)</option>
					</select>
				</div>

				<div class="flex flex-col gap-2">
					<label class="text-sm font-medium">Focus Areas</label>
					<div class="flex flex-col gap-1.5">
						<label class="flex items-center gap-2 text-sm cursor-pointer">
							<input type="checkbox" bind:checked={focusAreas.precedents} />
							<span>Legal precedents & case law</span>
						</label>
						<label class="flex items-center gap-2 text-sm cursor-pointer">
							<input type="checkbox" bind:checked={focusAreas.evidence} />
							<span>Evidence quality assessment</span>
						</label>
						<label class="flex items-center gap-2 text-sm cursor-pointer">
							<input type="checkbox" bind:checked={focusAreas.compliance} />
							<span>Procedural compliance</span>
						</label>
						<label class="flex items-center gap-2 text-sm cursor-pointer">
							<input type="checkbox" bind:checked={focusAreas.alternatives} />
							<span>Alternative interpretations</span>
						</label>
					</div>
				</div>
			</div>

			<div class="flex gap-3 justify-end">
				<Button variant="ghost" size="sm" onclick={() => (showConfig = false)}>Cancel</Button>
				<Button size="sm" onclick={() => (showConfig = false)}>Save Configuration</Button>
			</div>
		</div>
	{/if}

	{#if !premium}
		<div class="bg-gradient-to-br from-[#c9a96e] to-[#8b7355] text-[#0c0a09] rounded-lg p-4" transition:slide={{ duration: 300 }}>
			<div class="flex items-center gap-4">
				<Icon name="crown" size={20} />
				<div class="flex-1">
					<strong class="block mb-1 font-semibold">Unlock Advanced AI Reasoning</strong>
					<p class="m-0 text-sm opacity-90">Get step-by-step legal analysis with transparent thinking process</p>
				</div>
				<Button size="sm" onclick={() => onupgrade?.()}>Upgrade Now</Button>
			</div>
		</div>
	{/if}
</div>
