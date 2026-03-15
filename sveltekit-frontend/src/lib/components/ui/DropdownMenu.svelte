<script lang="ts">
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

  let { items = [], trigger = "Menu", class: className = "" }: Props = $props();
  let open = $state(false);
  let menuRef = $state<HTMLDivElement>();

  function toggle() { open = !open; }
  function close() { open = false; }

  function handleItemClick(item: DropdownItem) {
    if (item.disabled) return;
    item.onClick?.(item.value);
    close();
  }

  function handleClickOutside(e: MouseEvent) {
    if (menuRef && !menuRef.contains(e.target as Node)) close();
  }

  $effect(() => {
    if (open) {
      document.addEventListener("click", handleClickOutside, true);
      return () => document.removeEventListener("click", handleClickOutside, true);
    }
  });
</script>

<div class="relative inline-block" bind:this={menuRef}>
  <button
    type="button"
    class="inline-flex items-center justify-center rounded-md border border-current/20 bg-transparent px-4 py-2 text-sm font-semibold uppercase tracking-wider transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 {className}"
    onclick={toggle}
    aria-haspopup="true"
    aria-expanded={open}
  >
    {#if typeof trigger === "string"}
      {trigger}
    {:else if trigger}
      {@render trigger()}
    {/if}
  </button>

  {#if open}
    <div
      class="absolute right-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-md border-2 border-current/15 bg-white shadow-lg"
      role="menu"
    >
      {#each items as item}
        {#if item.separator}
          <div class="my-1 h-px bg-current/10"></div>
        {:else if item.href}
          <a
            href={item.href}
            class="block w-full px-3 py-2 text-left text-sm font-medium uppercase tracking-wider transition-colors hover:bg-black/5"
            role="menuitem"
            onclick={close}
          >
            {item.label}
          </a>
        {:else}
          <button
            type="button"
            class="block w-full px-3 py-2 text-left text-sm font-medium uppercase tracking-wider transition-colors hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
            role="menuitem"
            disabled={item.disabled}
            onclick={() => handleItemClick(item)}
          >
            {item.label}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
