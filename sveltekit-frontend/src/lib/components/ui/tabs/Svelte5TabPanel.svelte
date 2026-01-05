<script lang="ts">
/**
 * Svelte 5 Tab Panel Component
 * Works with Svelte5Tabs parent component
 */
import type { Snippet } from 'svelte';
import { getContext } from 'svelte';

interface Props {
	value: string;
	class?: string;
	children?: Snippet;
}

let {
	value,
	class: className = '',
	children
}: Props = $props();

const tabContext = getContext<{ activeTab: string }>('tabs');

let isActive = $derived(tabContext?.activeTab === value);
</script>

{#if isActive}
	<div
		id="panel-{ value: value }"
		class="focus:outline-none { className: className }"
		role="tabpanel"
		aria-labelledby="tab-{ value: value }"
		tabindex="0"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}
