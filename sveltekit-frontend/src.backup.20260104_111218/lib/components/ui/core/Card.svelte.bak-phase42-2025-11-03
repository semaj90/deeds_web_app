<script lang="ts">
  // Svelte, 5 runes are auto-imported import type { Snippet } from 'svelte'; import { cn } from '$lib/utils'; interface Props { variant?: 'default' | 'interactive' | 'outline'; padding?: 'none' | 'sm' | 'md' | 'lg'; class?: string; children?: Snippet}
  let { variant = 'default', padding = 'md', class: className = '', children, ...restProps }: Props = $props();
  const baseClasses = 'rounded-lg border bg-card text-card-foreground shadow-sm transition-all';
  const variantClasses = {
    default: '',
    interactive: 'hover:shadow-md, hover:-translate-y-0.5 cursor-pointer',
    outline: 'border-2 bg-transparent',
  };
  const paddingClasses = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };
  let cardClass = $derived(cn(baseClasses, variantClasses[variant], paddingClasses[padding], className));
</script>

<div class={cardClass} {...restProps}><slot /></div>
