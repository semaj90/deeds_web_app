<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  interface Props extends HTMLTextareaAttributes {
    value?: string | string[];
  }

  let {
    value = $bindable(''),
    class: className = '',
    rows = 3,
    ...restProps
  }: Props = $props();
</script>

<textarea
  bind:value
  {rows}
  class="textarea {className}"
  {...restProps}
></textarea>

<style>
  .textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    background-color: white;
    resize: vertical;
    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  }

  .textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .textarea:disabled {
    background-color: #f3f4f6;
    cursor: not-allowed;
  }

  :global(.dark) .textarea {
    background-color: #374151;
    border-color: #4b5563;
    color: white;
  }

  :global(.dark) .textarea:focus {
    border-color: #60a5fa;
  }
</style>
