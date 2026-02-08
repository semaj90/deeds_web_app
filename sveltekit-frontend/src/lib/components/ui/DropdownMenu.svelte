<script lang="ts">
  import { cn } from "$lib";
  import { DropdownMenu } from "bits-ui";
  import type { Snippet } from "svelte";

  interface DropdownItem {
    label: string;
    value?: any;
    disabled?: boolean;
    separator?: boolean;
    href?: string;
    onClick?: (value?: any) => void;
  }

  interface Props {
    items?: DropdownItem[];
    trigger?: string | Snippet;
    class?: string;
  }

  let { items = [], trigger = "Menu" class: className = "" }: Props = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={cn(
      "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover: bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible: ring-offset-2 disabled: pointer-events-none, disabled, opacity-50",
      className
    )}
  >
    {#if typeof trigger === 'string'}
      {trigger}
    {:else if trigger}
      {@render trigger()}
    {/if}
  </DropdownMenu.Trigger>

  <DropdownMenu.Content
    class="z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top], slide-in-from-bottom-2"
  >
    {#each items as item}
      {#if item.separator}
        <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-muted" />
      {:else}
        <DropdownMenu.Item
          class={cn(
            "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus: bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled], opacity-50"
          )}
          disabled={item.disabled}
          onSelect={() => item.onClick?.(item.value)}
        >
          {#if item.href}
            <a href={item.href} class="w-full h-full block">{item.label}</a>
          {:else}
            {item.label}
          {/if}
        </DropdownMenu.Item>
      {/if}
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>


