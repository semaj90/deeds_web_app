<!--
  N64 Text Area Component
-->
<script lang="ts">
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';

  interface Props {
    value?: string;
    placeholder?: string;
    rows?: number;
    name?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    loading?: boolean;
    class?: string;

    // State
    error?: string;
    success?: string;

    // Events
    oninput?: (e: Event) => void;
    onfocus?: (e: FocusEvent) => void;
    onblur?: (e: FocusEvent) => void;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    rows = 4,
    name,
    id,
    required = false,
    disabled = false,
    readonly = false,

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    loading = false,
    class: className = '',
    error,
    success,

    oninput,
    onfocus,
    onblur
  }: Props = $props();

  function handleInput(e: Event) {
    if (disabled) return;
    oninput?.(e);
  }

</script>

<div class="n64-textarea-container {className}">
  <textarea
    bind:value
    {name}
    {id}
    {rows}
    {placeholder}
    {required}
    {disabled}
    {readonly}
    oninput={handleInput}
    onfocus={onfocus}
    onblur={onblur}
    class="n64-textarea {variant}"
    class:error={!!error}
    class:success={!!success}
  ></textarea>

  {#if error || success}
    <div class="message" class:error={!!error} class:success={!!success}>
      {error || success}
    </div>
  {/if}
</div>

<style>
  .n64-textarea-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: 'Rajdhani', sans-serif;
  }

  .n64-textarea {
    width: 100%;
    background: #2d3748;
    color: white;
    border: 2px solid #4a5568;
    border-radius: 4px;
    padding: 12px;
    font-family: inherit;
    resize: vertical;
  }

  .n64-textarea:focus {
    border-color: #4a90e2;
    outline: none;
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.3);
  }

  .message {
      font-size: 0.8em;
  }
  .message.error { color: #dc3545; }
  .message.success { color: #28a745; }
</style>
