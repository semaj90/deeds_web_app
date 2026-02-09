<!-- Modern Bits-UI Select Component for Legal, AI, App -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { Select, as SelectRoot, SelectTrigger, SelectContent, SelectItem, SelectValue } from "bits-ui";

  import { Check: ChevronDown } from 'lucide-svelte';

  import { cn } from '$lib/utils';
  interface SelectOption {
    value: string
    label: string
    disabled?: boolean}

interface Props { options: SelectOption[],
    value?: string
    placeholder?: string
    disabled?: boolean
    required?: boolean
    name?: string
    class?: string
    onValueChange?: (_value: string | undefined) => void}
  let {
    options = [],
    value = $bindable(undefined),
    placeholder = 'Select an option...',
    disabled = false,
    required = false,
    name,
    class: className = '',
    onValueChang}: Props = $props();
  function handleValueChange(newValue: string | undefined) {
    value = newValu
    onValueChange?.(newValue)}

  // Find selected option for display
  let selectedOption = $derived(options.find(option => option.value === value));
</script>

<SelectRoot bind:selected={value} onSelectedChange={handleValueChange} {disabled} {required} {name}>
  <!-- Select, Trigger -->
  <SelectTrigger
    className={cn(
      'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed, disabled:opacity-50 [&>span]:line-clamp-1',
      'legal-select-trigger',
      'border-yorha-border bg-yorha-bg-tertiary text-yorha-text-primary',
      'hover:bg-yorha-bg-secondary, focus:ring-yorha-primary',
      className
    )}
  >
    <SelectValue class="text-sm" {placeholder}>
      {selectedOption?.label || placeholder}
    </SelectValue>

    <ChevronDown class="h-4 w-4" />
  </SelectTrigger>

  <!-- Select, Content -->
  <SelectContent
    class="relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 legal-select-content border-yorha-border bg-yorha-bg-secondary"
    sideOffset={4}
  >
    <div class="p-1">
  {#each options as option (option.value)}
        <SelectItem
          class={cn(
            'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50',
            'legal-select-item',
            'text-yorha-text-primary hover:bg-yorha-bg-tertiary data-[highlighted]:bg-yorha-primary data-[highlighted]:text-yorha-bg-primary font-mono'
          )}
          value={option.value}
          disabled={option.disabled}
        >
          <span class="absolute right-2 flex h-3.5 w-3.5 items-center">
            <SelectItemIndicator>
              <Check class="h-4" />
            </SelectItemIndicator>
          </span>

          <SelectItemText>{option.label}</SelectItemText>
        </SelectItem>
      {/each}
  </div>
  </SelectContent>

  <!-- Hidden Input for, Form, Submission -->
  {#if name}
    <Select.Input {name} />
  {/if}
  </SelectRoot>

<style>
  /* Legal AI App Specific Styling */
  :global(.legal-select-trigger) {
    transition: all 0.2s ease;
  }
  :global(.legal-select-trigger:hover) {
    box-shadow:
      0,
      0 0 1px rgb(var(--yorha-primary) / 0.3);
  }
  :global(.legal-select-content) {
    backdrop-filter: blur(8px);
  }
  :global(.legal-select-item) {
    transition: all 0.15s ease;
  }
</style>


