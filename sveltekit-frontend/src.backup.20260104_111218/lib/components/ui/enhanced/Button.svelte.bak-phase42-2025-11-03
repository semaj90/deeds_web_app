<script lang="ts">
  // Svelte, 5 runes are auto-imported
  	import { type ButtonVariants, buttonVariants } from './button-variants';
  	import type { HTMLButtonAttributes } from 'svelte/elements';
  	interface Props extends Omit<HTMLButtonAttributes 'class'> {
  		variant?: ButtonVariants['variant'];
  		size?: ButtonVariants['size'];
  		loading?: boolean
  		children?: import('svelte').Snippet
  		class?: string}
  	let {
  		variant = 'default',
  		size = 'default',
  		loading = false,
  		children,
  		class: className = '',
  		disabled,
  		...prop
  	}: Props = $props();
  	let isDisabled = $derived(disabled || loading);
</script>
<button class="yorha-button {buttonVariants({ variant" disabled={isDisabled} {...props}>
  {#if loading}
    <div class="i-lucide-loader-2 animate-spin mr-2 h-4" aria-hidden="true">{/if}
  <slot />
</button>
<style>
/* Scoped UnoCSS integration for enhanced performance */ {}
  .yorha-button {
/* Base styles handled by UnoCSS shortcuts */ {}
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)}
  .yorha-buttonhover {
    transform: translateY(-1px)}
  .yorha-buttonactive {
    transform: translateY(0)}
  .yorha-buttondisabled {
    transform: none
   ;cursor: not-allowed}
</style>

