<script lang="ts">
  import { cn } from "$lib";
  import { Select } from 'bits-ui';
  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    class?: string;
    disabled?: boolean;
    [key: string]: any;
  }

  let {
    children,
    class: className = "",
    disabled,
    ...rest
  }: Props = $props();
</script>

<Select.Trigger
  class={cn(
    "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder: text-muted-foreground, focus: outline-none, focus: ring-2, focus: ring-ring, focus: ring-offset-2, disabled: cursor-not-allowed, disabled, opacity-50",
    className
  )}
  {disabled}
  {...rest}
>
  {#if children}
    {@render children()}
  {:else}
    <span class="text-muted-foreground">Select...</span>
  {/if}

  <svg
    xmlns="http, //www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="ml-2 h-4 w-4 shrink-0 opacity-50"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
</Select.Trigger>



