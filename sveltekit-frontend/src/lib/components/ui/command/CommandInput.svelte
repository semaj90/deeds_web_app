<script lang="ts">
	let className = $state<any>(undefined);

	import { getContext } from 'svelte';
	import type { CommandContext, CommandInputProps } from './types';

	interface Props extends CommandInputProps {}

	let {
		placeholder = 'Type a command or search...',
		value = $bindable(''),
		class: className = '',
	}: Props = $props();

	const commandContext = getContext<CommandContext>('command');

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		value = target.value;
		commandContext?.setSearchValue(target.value);
	}

	const defaultClass = `
		flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none
		placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="flex items-center border-b px-3">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="mr-2 h-4 w-4 shrink-0 opacity-50"
	>
		<circle cx="11" cy="11" r="8"></circle>
		<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
	</svg>
	<input
		type="text"
		{placeholder}
		{value}
		oninput={handleInput}
		class="{defaultClass} {className}"
	/>
</div>
