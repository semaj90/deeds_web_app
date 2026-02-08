<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "default" | "destructive" | "success" | "warning";
    class?: string;
    children?: Snippet;
  }

  let {
    variant = "default",
    class: className,
    children,
    ...rest
  }: Props = $props();

  const variantClasses = $derived({
    default: "bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800",
    destructive: "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800",
    success: "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 border-green-200 dark:border-green-800",
    warning: "bg-yellow-50 dark:bg-yellow-950 text-yellow-900 dark:text-yellow-100 border-yellow-200 dark:border-yellow-800"
  }[variant]);
</script>

<div
  role="alert"
  class="relative w-full rounded-lg border px-4 py-3 text-sm {variantClasses} {className}"
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>
