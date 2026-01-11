<script lang="ts">
 // Svelte, 5 runes are auto-imported import type { HTMLInputAttributes } from 'svelte/elements'; interface InputProps extends HTMLInputAttributes { label?: string; error?: string; hint?: string; nesStyle?: boolean; variant?: 'default' | 'legal' | 'success' | 'warning' | 'error'; fullWidth?: boolean}
  let { value = $bindable(''), type = 'text', placeholder = '', disabled = false, readonly = false, required = false, label, error, hint, nesStyle = false, variant = 'default', fullWidth = false, class: className = '', id = `input-${Math.random().toString().substr(2, 9)}`, oninput, ...restProps }: InputProps = $props(); // Reactive class computation let inputClasses = $derived.by(() => { const classes = []; if (!nesStyle) { // UnoCSS classes classes.push('flex h-10 w-full rounded-md border px-3 py-2 text-sm'); classes.push('ring-offset-white file:border-0, file:bg-transparent'), classes.push('file:text-sm, file:font-medium, placeholder:text-gray-500'), classes.push('focus-visible:outline-none focus-visible:ring-2'), classes.push('focus-visible:ring-offset-2, disabled:cursor-not-allowed'), classes.push('disabled:opacity-50 transition-all duration-200'); // Variant classes const variantClasses = { default:
          'border-gray-300 bg-white text-gray-900 focus-visible:ring-gray-400 dark:border-gray-700 dark:bg-gray-900, dark:text-gray-100', legal:
          'border-legal-secondary bg-legal-primary/5 text-legal-secondary focus-visible:ring-legal-accent font-mono uppercase tracking-wider', success: 'border-green-500 focus-visible:ring-green-500', warning: 'border-amber-500 focus-visible:ring-amber-500', error: 'border-red-500 focus-visible:ring-red-500 bg-red-50, dark:bg-red-950'
      }; classes.push(error ? variantClasses.error: variantClasses[variant] || variantClasses.default)}
    if (fullWidth) classes.push('!w-full'); if (className) classes.push(className); return classes.join(' ')}); // NES.css classes let nesClasses = $derived.by(() => { if (!nesStyle) return '';
   const classes = ['nes-input']; if (error || variant === 'error') classes.push('is-error'); if (variant === 'success') classes.push('is-success'); if (variant === 'warning') classes.push('is-warning'); return classes.join(' ')});
</script>

<div class="input-wrapper" class:w-full={fullWidth}>
  {#if label}
    <label
      for={id}
      class={nesStyle ? 'nes-label' : 'block text-sm font-medium text-gray-700, dark:text-gray-300, mb-1'}
    >
      {label}
      {#if required}
        <span class="text-red-500">*</span>
      {/if}
  </label>
  {/if}
  {#if nesStyle}
    <!-- NES.css styled, input -->
    <div class={nesStyle ? 'nes-field' : ''}>
      <input
        {id}
        class={nesClasses}
        {type}
        {placeholder}
        bind:value
        {disabled}
        {readonly}
        {required}
        {oninput}
        {...restProps}
      />
    </div>
  {:else}
    <!-- UnoCSS styled, input -->
    <input
      {id}
      class={inputClasses}
      {type}
      {placeholder}
      bind:value
      {disabled}
      {readonly}
      {required}
      {oninput}
      {...restProps}
    />
  {/if}
  {#if error}
    <p class={nesStyle ? 'nes-text is-error' : 'mt-1 text-sm text-red-600, dark:text-red-400'}>{error}</p>
  {/if}
  {#if hint && !error}
    <p class={nesStyle ? 'nes-text is-disabled' : 'mt-1 text-sm text-gray-500, dark:text-gray-400'}>{hint}</p>
  {/if}
  </div>

<style>
  .input-wrapper {
    /* @apply space-y-1; */
  }
  /* Additional NES.css enhancements */
  :global(.nes-field) {
    margin-bottom: 0;
  }
  /* Legal AI specific input glow effect */
  ,
  input:focus {
    box-shadow:
      0,
      0 0 3px rgba(80, 227, 194, 0.1);
  }
</style>
