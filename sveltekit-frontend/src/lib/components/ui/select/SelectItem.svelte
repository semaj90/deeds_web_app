<script lang="ts">
  import { cn } from "$lib/utils/cn";
  import type { Snippet } from "svelte";

  interface Props {
    value: string;
    label?: string;
    disabled?: boolean;
    children?: Snippet;
    class?: string;
    [key: string]: any;
  }

  let {
    value,
    label,
    disabled = false,
    children,
    class: className = "",
    ...rest
  }: Props = $props();
</script>

<Select.Item
  {value}
  {label}
  {disabled}
  class={cn(
    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    className
  )}
  {...rest}
>
  <Select.ItemIndicator
    class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </Select.ItemIndicator>

  {#if children}
    {@render children()}
  {:else if label}
    {label}
  {:else}
    {value}
  {/if}
</Select.Item>

