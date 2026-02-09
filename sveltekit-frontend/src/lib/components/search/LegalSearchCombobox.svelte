
<script lang="ts">
  import { Combobox } from "bits-ui";
import { fly } from "svelte/transition";
  import { Search, Scale, FileText, Check } from "lucide-svelte";

  // Props using Svelte 5 Runes
  let {
      placeholder = "Search legal database...",
      onSelect
  }: {
      placeholder?: string,
      onSelect?: (val: string) => void
  } = $props();

  let inputValue = $state("");
  let items = $state([
    { value: "Roe v. Wade", label: "Roe v. Wade (Overturned)" },
    { value: "Miranda v. Arizona", label: "Miranda v. Arizona" },
    { value: "Brown v. Board", label: "Brown v. Board of Education" }
  ]);

  // Filter items based on input (simple local filter)
  let filteredItems = $derived(
      inputValue
      ? items.filter(i => i.label.toLowerCase().includes(inputValue.toLowerCase()))
      : items
  );

</script>

<div class="legal-combobox w-full">
  <Combobox.Root
    bind:inputValue
    onOpenChange={(open) => { if(!open && onSelect) onSelect(inputValue) }}
  >
    <div class="relative">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <Search size={16} />
      </div>
      <Combobox.Input
        class="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 border rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 text-sm"
        {placeholder}
        aria-label="Search Legal Database"
      />
    </div>

    <Combobox.Content
      class="w-full bg-white dark:bg-gray-900 border rounded-md shadow-lg mt-1 overflow-hidden z-50 max-h-60 overflow-y-auto"
      transition={fly}
      params={{ y: -5, duration: 150 }}
    >
        {#each filteredItems as item (item.value)}
        <Combobox.Item
            value={item.value}
            label={item.label}
            class="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer data-[highlighted]:bg-gray-100"
        >
            <div class="flex items-center gap-2">
                <Scale size={14} class="text-blue-500"/>
                <span>{item.label}</span>
            </div>
            <Combobox.ItemIndicator>
                <Check size={14} />
            </Combobox.ItemIndicator>
        </Combobox.Item>
        {/each}

        {#if filteredItems.length === 0}
            <div class="px-3 py-2 text-sm text-gray-500">No results found</div>
        {/if}
    </Combobox.Content>
  </Combobox.Root>
</div>
