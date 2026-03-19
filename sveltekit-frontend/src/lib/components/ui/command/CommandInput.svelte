<script lang="ts">
	import { getContext } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
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
</script>

<div class="cmd-input-row">
	<Icon name="search" size={16} />
	<input
		type="text"
		{placeholder}
		{value}
		oninput={handleInput}
		class="cmd-input {className}"
	/>
</div>

<style>
	.cmd-input-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.35);
	}

	.cmd-input {
		flex: 1;
		height: 1.5rem;
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		font-size: 0.875rem;
		color: rgba(212, 199, 163, 0.85);
	}
	.cmd-input::placeholder {
		color: rgba(212, 199, 163, 0.3);
	}
</style>