<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = '',
		rows = 4,
		className = '',
		id = undefined,
		oninput
	}: {
		value?: string;
		placeholder?: string;
		rows?: number;
		className?: string;
		id?: string;
		oninput?: (e: Event & { currentTarget: HTMLTextAreaElement }) => void;
	} = $props();

	function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
		value = e.currentTarget.value;
		oninput?.(e);
	}
</script>

<textarea
	{rows}
	{placeholder}
	{id}
	class={className}
	oninput={handleInput}
	bind:value
></textarea>

<style>
	textarea {
		width: 100%;
		box-sizing: border-box;
	padding: 0.5rem;
		font-size: 1rem;
	border: 1px solid var(--border-color, #ccc);
		border-radius: 4px;
	background: var(--input-bg, white);
		color: var(--text-color, inherit);
	}
</style>
