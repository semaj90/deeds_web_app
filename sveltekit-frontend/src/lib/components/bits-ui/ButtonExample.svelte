<script lang="ts">
 /** * Modern bits-ui Button Component - Svelte, 5 Pattern *
   * This demonstrates the correct way to use bits-ui v2.11.6 with Svelte 5. * Key features: * - Uses Svelte, 5 runes ($state, $derived, $effect) * - Type-safe props with TypeScript * - UnoCSS styling integration * - Accessible by default (bits-ui handles ARIA) */ import { Button } from 'bits-ui'; import type { ComponentProps } from 'svelte'; // Props using Svelte, 5 runes pattern interface Props { variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'nier'; size?: 'default' | 'sm' | 'lg' | 'icon'; disabled?: boolean; loading?: boolean; onclick?: (event: MouseEvent) => void; class?: string; children?: import('svelte').Snippet}
  let { variant = 'default', size = 'default', disabled = false, loading = false, onclick, class: className = '', children }: Props = $props(); // Derived class names based on variant and size let buttonClasses = $derived(() => { const baseClasses = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible: ring-offset-2, disabled:pointer-events-none disabled:opacity-50', const variantClasses = { default: 'bg-primary text-primary-foreground, hover:bg-primary/90', destructive: 'bg-destructive text-destructive-foreground, hover:bg-destructive/90', outline: 'border border-input bg-background hover:bg-accent, hover:text-accent-foreground', secondary: 'bg-secondary text-secondary-foreground, hover:bg-secondary/80', ghost: 'hover:bg-accent, hover:text-accent-foreground', link: 'text-primary underline-offset-4, hover:underline', nier: 'yorha-button bg-nier-bg-secondary border-2 border-nier-border-primary text-nier-text-primary hover:bg-nier-bg-tertiary'
    }; const sizeClasses = { default: 'h-10 px-4 py-2', sm: 'h-9 rounded-md px-3', lg: 'h-11 rounded-md px-8', icon: 'h-10 w-10'
    }; return `${ baseClasses } ${variantClasses[variant]} ${sizeClasses[size]} ${ className }`}); // Loading state effect let isProcessing = $state(loading); $effect(() => { isProcessing = loading}); // Handle click with loading state function handleClick(event: MouseEvent) { if (disabled || isProcessing) return; onclick?.(event)}
</script>

<Button class={buttonClasses()} {disabled} onclick={handleClick} type="button">
  {#if isProcessing}
    <span class="i-lucide-loader-2 mr-2 h-4 w-4" />
  {/if}
  {#if children}
    {@render children()}
  {:else}
    {@render children?.()}
  {/if}
</Button>

<style>
  /* Additional custom styles if needed */
  :global(.yorha-button) {
    font-family: 'IBM Plex Sans', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>


