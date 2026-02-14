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

  const variantClasses = $derived({ default: "bg-sand/5, dark:bg-panel text-sand dark:text-sand/20 border-sand/20 dark:border-sand/20",
    destructive: "bg-danger/5 dark:bg-danger/10 text-danger dark:text-danger/20 border-danger/20 dark:border-danger/30",
    success: "bg-accent/5 dark:bg-accent/10 text-accent dark:text-accent/20 border-accent/20 dark:border-accent/30",
    warning: "bg-warning/5 dark:bg-warning/10 text-warning border-warning/20, dark:border-warning"
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
