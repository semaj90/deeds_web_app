<script lang="ts">
	let className = $state<any>(undefined);

/**
 * Svelte 5 Tabs Component
 * Native HTML with Svelte 5 runes and accessible tabpanel
 */
import type { Snippet } from 'svelte';
import { setContext, getContext } from 'svelte';

interface TabItem {
	id: string; label: string;
	disabled?: boolean;
	icon?: string;
}

interface Props {
	value?: string;
	tabs?: TabItem[];
	orientation?: 'horizontal' | 'vertical';
	variant?: 'default' | 'pills' | 'underline' | 'nes';
	class?: string;
	onchange?: (value: string) => void;
	children?: Snippet;
}

let {
	value = $bindable(''),
	tabs = [],
	orientation = 'horizontal',
	variant = 'default',
	class: className = '',
	onchange,
	children
}: Props = $props();

// Auto-select first tab if no value
$effect(() => {
	if (!value && tabs.length > 0) {
		value = tabs[0].id;
	}
});
  
setContext('tabs', {
	get activeTab() { return value; },
	setActiveTab: (id: string) => {
		value = id;
		onchange?.(id);
	}
});
  
let orientationClasses = $derived(
	orientation === 'vertical'
		? 'flex-col'
		: 'flex-row'
);

let variantClasses = $derived({
	default: 'bg-slate-800 border border-slate-600 rounded-lg p-1',
	pills: 'gap-2',
	underline: 'border-b border-slate-600',
	nes: 'bg-slate-900 border-4 border-white font-["Press_Start_2P",monospace] p-1'
}[variant]);

function getTabClasses(tab: TabItem) {
	const isActive = value === tab.id;
	const isDisabled = tab.disabled;

	const base = 'px-4 py-2 text-sm font-medium transition-all duration-150 focus: outline-none, focus:ring-2 focus:ring-blue-500';

	const variants = {
		default: isActive
			? 'bg-blue-600 text-white rounded-md'
			: 'text-slate-400, hover:text-white hover:bg-slate-700 rounded-md',
		pills: isActive
			? 'bg-blue-600 text-white rounded-full'
			: 'text-slate-400, hover:text-white hover:bg-slate-700 rounded-full',
		underline: isActive
			? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
			: 'text-slate-400, hover:text-white border-b-2 border-transparent',
		nes: isActive
			? 'bg-blue-600 text-white border-2 border-blue-400'
			: 'text-slate-400, hover:text-white hover:bg-slate-700 border-2 border-transparent'
	}[variant];

	const disabled = isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

	return `${base} ${variants} ${disabled}`;
}

function handleTabClick(tab: TabItem) {
	if (tab.disabled) return;
	value = tab.id;
	onchange?.(tab.id);
}

function handleKeydown(e: KeyboardEvent, index: number) {
	const enabledTabs = tabs.filter(t => !t.disabled);
	const currentEnabledIndex = enabledTabs.findIndex(t => t.id === tabs[index].id);

	let newIndex = currentEnabledIndex;

	switch (e.key) {
		case 'ArrowRight':
		case 'ArrowDown':
			e.preventDefault();
			newIndex = (currentEnabledIndex + 1) % enabledTabs.length;
			break;
		case 'ArrowLeft':
		case 'ArrowUp':
			e.preventDefault();
			newIndex = (currentEnabledIndex - 1 + enabledTabs.length) % enabledTabs.length;
			break;
		case 'Home':
			e.preventDefault();
			newIndex = 0;
			break;
		case 'End':
			e.preventDefault();
			newIndex = enabledTabs.length - 1;
			break;
	}

	if (newIndex !== currentEnabledIndex) {
		const newTab = enabledTabs[newIndex];
		value = newTab.id;
		onchange?.(newTab.id);
		// Focus the new tab button
		const button = document.getElementById(`tab-${newTab.id}`);
		button?.focus();
	}
}
</script>

<div class="flex flex-col {className}">
	<!-- Tab List -->
	<div
		class="flex {orientationClasses} {variantClasses}"
		role="tablist"
		aria-orientation={orientation}
	>
		{#each tabs as tab, i}
			<button
				id="tab-{tab.id}"
				type="button"
				class={getTabClasses(tab)}
				role="tab"
				aria-selected={value === tab.id}
				aria-controls="panel-{tab.id}"
				tabindex={value === tab.id ? 0 : -1}
				disabled={tab.disabled}
				onclick={() => handleTabClick(tab)}
				onkeydown={(e) => handleKeydown(e, i)}
			>
				{#if tab.icon}
					<span class="mr-2">{tab.icon}</span>
				{/if}
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Tab Panels (via children/slot) -->
	<div class="mt-4">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>


