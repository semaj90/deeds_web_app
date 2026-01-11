<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let value: string = '';
  export let placeholder: string = '';
  export let rows: number = 4;
  export let className: string = '';
  export let id: string | undefined = undefined;

  function onInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    value = target.value;
    dispatch('input', { value });
  }
</script>

<textarea {rows} {placeholder} {id} class={className} oninput={onInput} bind:value></textarea>

<style>
  /* minimal styling so it's visible in the UI — adjust in your theme */
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
