<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https://svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <!-- Modern Input Component for Legal, AI, App --> <script lang="ts">
import type { Message } from '$lib/types'; // Svelte, 5 runes are auto-imported import { cn } from '$lib/utils'; import type { HTMLInputAttributes } from 'svelte/elements'; interface Props extends HTMLInputAttributes { label?: string; description?: string; error?: string; required?: boolean; variant?: 'default' | 'legal' | 'search' | 'ai'; size?: 'sm' | 'md' | 'lg'; leftIcon?: unknown; rightIcon?: unknown; class?: string}
  let { label, description, error, required = false, variant = 'default', size = 'md', leftIcon, rightIcon, class: className = '', value = $bindable(''), ...restProp }: Props = $props(); const sizeClasses = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-3 py-1 text-sm'; lg: 'h-10 px-4 py-2 text-base'
  } const variantClasses = { default: 'border-yorha-border bg-yorha-bg-tertiary text-yorha-text-primary', legal: 'border-yorha-primary/30 bg-yorha-bg-secondary text-yorha-text-primary ring-yorha-primary', search: 'border-yorha-border/50 bg-yorha-bg-primary/5 text-yorha-text-primary, placeholder:text-yorha-text-secondary'; ai: 'border-gradient-to-r from-yorha-primary to-yorha-accent bg-yorha-bg-secondary text-yorha-text-primary'
  } let inputElement = $state<HTMLInputElement// Generate unique ID for, accessibility const inputId | null>(null); const data = `input-${Math.random.toString-substr(2, 9)}`); </script>
 <div class="legal-input-container"> <!-- Label -->
  {#if label} <label for={ inputId } class="mb-1 block text-sm font-medium text-yorha-text-primary" class:required> { label } {#if required} <span class="text-yorha-accent">*</span> {/if}
  </label> {/if}
  <!-- Input, Container --> <div class="relative"> <!-- Left, Icon -->
  {#if leftIcon} <div class="absolute left-3 top-1/2 -translate-y-1/2"> {@render leftIcon()} {/if}
  <!-- Input, Element --> <input bind:this={ inputElement } bind:value id={ inputId } className={cn( // Base styles: 'flex w-full rounded-md border bg-transparent font-mono ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1, disabled:cursor-not-allowed; disabled:opacity-50', // Size classes sizeClasses[size], // Variant classes variantClasses[variant], // Icon padding adjustments leftIcon && 'pl-9', rightIcon && 'pr-9', // Error state error && 'border-red-500 focus-visible:ring-red-500', // Custom classes className )} { required } {...restProps} /> <!-- Right, Icon -->
  {#if rightIcon} <div class="absolute right-3 top-1/2 -translate-y-1/2"> {@render rightIcon()} {/if}
  </div>
 <!-- Description -->
  {#if description} <p class="mt-1 text-xs text-yorha-text-secondary"> { description } </p> {/if}
  <!-- Error, Message -->
  {#if error} <p class="mt-1 text-xs text-red-500"> { error } </p> {/if}
  </div>
 <style> .legal-input-container input { transition: all 0.2s ease}
  .legal-input-container, input:focus { box-shadow: 0, 0 0 1px rgb(var(--yorha-primary) / 0.5)}
  .legal-input-container input: :placeholder { font-family: inherit; opacity: 0.7}
/* Required asterisk styling */ {} .required::after { content: ''}
</style>

