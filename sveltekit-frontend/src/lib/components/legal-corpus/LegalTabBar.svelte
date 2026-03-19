<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { Tabs } from 'bits-ui';

	type TabId = 'summary' | 'official-text' | 'cases' | 'regulations' | 'glossary' | 'history' | 'citations';

	interface TabDef {
		id: TabId;
		label: string;
		icon: string;
		count?: number;
	}

	interface Props {
		activeTab: TabId;
		onTabChange?: (tab: TabId) => void;
		casesCount?: number;
		glossaryCount?: number;
		citationsCount?: number;
	}

	let {
		activeTab = $bindable('summary'),
		onTabChange,
		casesCount = 0,
		glossaryCount = 0,
		citationsCount = 0,
	}: Props = $props();

	let tabs = $derived<TabDef[]>([
		{ id: 'summary', label: 'Summary', icon: 'file-text' },
		{ id: 'official-text', label: 'Official Text', icon: 'scroll-text' },
		{ id: 'cases', label: 'Cases', icon: 'folder', count: casesCount || undefined },
		{ id: 'regulations', label: 'Regulations', icon: 'landmark' },
		{ id: 'glossary', label: 'Glossary', icon: 'book-text', count: glossaryCount || undefined },
		{ id: 'history', label: 'History', icon: 'clock' },
		{ id: 'citations', label: 'Citations', icon: 'bookmark', count: citationsCount || undefined },
	]);

	function handleChange(value: string) {
		activeTab = value as TabId;
		onTabChange?.(value as TabId);
	}
</script>

<Tabs.Root value={activeTab} onValueChange={handleChange}>
	<Tabs.List class="flex border-b border-white/10 mb-4 overflow-x-auto">
		{#each tabs as tab}
			<Tabs.Trigger
				value={tab.id}
				class="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors
					{activeTab === tab.id
						? 'border-orange-400 text-orange-400'
						: 'border-transparent text-white/50 hover:text-white/80'}"
			>
				<Icon name={tab.icon} size={14} />
				{tab.label}
				{#if tab.count}
					<span class="text-[10px] px-1.5 py-0 rounded bg-orange-400/15 text-orange-300 font-semibold">
						{tab.count}
					</span>
				{/if}
			</Tabs.Trigger>
		{/each}
	</Tabs.List>
</Tabs.Root>
