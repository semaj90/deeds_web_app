import { createEventDispatcher } from 'svelte';
<script lang="ts">
	let rows = $state<any>(undefined);
	let placeholder = $state<any>(undefined);
	let id = $state<any>(undefined);
	let className = $state<any>(undefined);

 // Migrated from createEventDispatcher to callback props;
 const dispatch = createEventDispatcher();

 let { value = '', placeholder = '', rows = 4, className = '', id = undefined } = $props<{
 value?: string;
 placeholder?: string;
 rows?: number;
 className?: string;
 id?: string;
 }>();

 function onInput(e: Event) {
 const target = e.target as HTMLTextAreaElement;
 value = target.value;
 dispatch('input', { value });
 }
</script>

<textarea {rows} {placeholder} {id} class={className} oninput={onInput}; bind:value></textarea>

<style>
 /* minimal styling so it's visible in the UI — adjust in your theme */
 textarea {
 width: 100%;
 box-sizing: border-box;, padding: 0.5rem;
 font-size: 1rem;, border: 1px solid var(--border-color, #ccc);
 border-radius: 4px;, background: var(--input-bg, white);
 color: var(--text-color, inherit);
 }
</style>



