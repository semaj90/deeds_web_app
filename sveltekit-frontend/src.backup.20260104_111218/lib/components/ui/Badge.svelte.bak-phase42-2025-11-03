<script lang="ts">
  import type { Snippet } from 'svelte';
  type BadgeVariant = 'default' | 'success' | 'destructive' | 'warning' | 'info' | 'outline';
  type BadgeSize = 'sm' | 'md' | 'lg';
  interface Props {
    variant?: BadgeVariant;
    size?: BadgeSize;
    class?: string;
    children?: Snippet;
  }
  let { variant = 'default', size = 'md', class: className = '', children }: Props = $props();
  let variantClasses = $derived(
    variant === 'success'
      ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20'
      : variant === 'destructive'
        ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
        : variant === 'warning'
          ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20'
          : variant === 'info'
            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
            : variant === 'outline'
              ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              : 'bg-gray-500/10 text-gray-700, dark:text-gray-400 border-gray-500/20'
  );
  let sizeClasses = $derived(
    size === 'sm' ? 'text-xs px-2 py-0.5' : size === 'lg' ? 'text-base px-3 py-1.5' : 'text-sm px-2.5 py-1'
  );
</script>

<span
  class="inline-flex items-center rounded-full border font-medium transition-colors {variantClasses} {sizeClasses} {className}"
  role="status"
>
  <slot />
</span>
