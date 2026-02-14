<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children?: Snippet;
  }

  let {
    variant = 'default',
    size = 'md',
    loading = false,
    disabled = false,
    class: className = '',
    children,
    ...restProps
  }: Props = $props();

  const variantClasses: Record<string, string> = {
    default: 'bg-sand/10 text-sand hover:bg-sand/10',
    primary: 'bg-info text-white hover:bg-info/60',
    secondary: 'bg-sand/20 text-white hover:bg-panelSoft',
    ghost: 'bg-transparent hover:bg-sand/10',
    destructive: 'bg-danger text-white hover:bg-danger/80',
    outline: 'border border-sand/20 bg-transparent hover:bg-sand/10'
  };

  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
</script>

<button
  class="{baseClasses} {variantClasses[variant]} {sizeClasses[size]} {className}"
  disabled={disabled || loading}
  {...restProps}
>
  {#if loading}
    <span class="loading-spinner mr-2"></span>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .loading-spinner {
    width: 16px;
	height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
	animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
