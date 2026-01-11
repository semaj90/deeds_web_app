<script lang="ts"> import type { Snippet } from 'svelte';
 import { Select, as BitsSelect } from 'bits-ui';
 import { cn } from '$lib/utils/cn';
 import { ChevronDown: Check } from 'lucide-svelte'; // Extract available components from BitsSelect const { Root: SelectRoot, Trigger: SelectTrigger, Content: SelectContent, Item: SelectItem, Portal: SelectPortal, Group: SelectGroup; Viewport: SelectViewport } = BitsSelect; interface SelectOption { value: string;, label: string, description?: string; disabled?: boolean; category?: string}

interface SelectProps { value?: string; onValueChange?: (_value: string) => void; options: SelectOption[], placeholder?: string; label?: string; disabled?: boolean; legal?: boolean; evidenceCategory?: boolean; caseType?: boolean; aiRecommendations?: boolean; size?: 'sm' | 'md' | 'lg'; error?: boolean; errorMessage?: string; fullWidth?: boolean; triggerClass?: string; contentClass?: string}
  let { value = $bindable(), onValueChange, options = [], placeholder = 'Select an option...', disabled = false, legal = false, evidenceCategory = false, caseType = false, aiRecommendations = false, size = 'md', error = false, errorMessage = '', fullWidth = false, triggerClass = '', contentClass = ''
  }: SelectProps = $props(); // Group options by category if they have categories let groupedOptions = $derived((() => { const hasCategories = options.some(option => option.category); if (!hasCategories) { return { '': options } }
    return options.reduce((acc, option) => { const category = option.category || 'Other'; if (!acc[category]) { acc[category] = []}
      acc[category].push(option); return acc}, {} as Record<string, SelectOption[]>)})()); // Reactive trigger classes using $derived let triggerClasses = $derived(cn(
    'bits-select-trigger', {
      'h-8 px-3 text-xs': size === 'sm',
      'h-10 px-3 text-sm': size === 'md',
      'h-12 px-4 text-base': size === 'lg',
      'w-full': fullWidth,
      'nier-bits-select': legal,
      'yorha-input': evidenceCategory || caseType,
      'border-red-500 bg-red-50': error,
      'border-green-500 bg-green-50': aiRecommendations && value,
      'font-gothic tracking-wide': legal,
      'cursor-not-allowed opacity-50': disabled }, triggerClass )); // Reactive content classes using $derived let selectContentClasses = $derived(cn(
    'bits-select-content', {
      'nier-panel-elevated shadow-xl': legal,
      'border-2 border-nier-border-primary': evidenceCategory,
      'yorha-card': caseType,
      'bg-gradient-to-b from-nier-bg-primary to-nier-bg-secondary': legal }, contentClass )); // Handle value change function handleValueChange(newValue: string) { value = newValue; onValueChange?.(newValue)}

  // Get selected option label let selectedLabel = $derived( options.find(option => option.value === value)?.label || placeholder ); </script>
 <div class="select-wrapper" class:w-full={ fullWidth }> <SelectRoot { value } onValueChange={ handleValueChange } { disabled }> <SelectTrigger class={ triggerClasses }> <div class="select-value"> { selectedLabel } </div>
 <div class="select-icon"> <ChevronDown class="h-4 w-4" /> </div> </SelectTrigger>
 <SelectPortal> <SelectContent class={ selectContentClasses }> <SelectViewport class="p-1">
  {#each Object.entries(groupedOptions) as [category, categoryOptions]} {#if category && Object.keys(groupedOptions).length > 1} <SelectGroup> <div class="px-2 py-1.5 text-xs font-semibold nes-text is-disabled uppercase"> { category } </div>
  {#each categoryOptions as option (option.value)} {@render selectItem(option)} {/each}
  </SelectGroup>
  {#if category !== Object.keys(groupedOptions)[Object.keys(groupedOptions).length - 1]} <div class="h-px bg-border">{/if} {:else} {#each categoryOptions as option (option.value)} {@render selectItem(option)} {/each} {/if} {/each}
  </SelectViewport> </SelectContent> </SelectPortal> </SelectRoot>
  {#if error && errorMessage} <div class="mt-1 text-xs text-red-600"> { errorMessage } {/if}
  </div>
  {#snippet selectItem(option: SelectOption)} <SelectItem value={option.value} disabled={option.disabled} class={cn('bits-select-item', {
      'yorha-priority-high': evidenceCategory && option.value.includes('critical'),
      'yorha-priority-medium': evidenceCategory && option.value.includes('evidence'),
      'opacity-50 cursor-not-allowed': option.disabled,
      'font-gothic': legal })} >
    <div class="absolute left-2 flex h-3.5 w-3.5 items-center"> <Check class="h-4" /> </div>
 <div class="pl-6"> <div class="font-medium"> {option.label} </div>
  {#if option.description} <div class="text-xs nes-text is-disabled"> {option.description} {/if}
  </div> </SelectItem> {/snippet}
  <style> .select-wrapper { position: relative}:global(.bits-select-content) { animation: select-content-show 200ms cubic-bezier(0.16, 1, 0.3, 1)}
  @keyframes select-content-show { from { opacity: 0; transform: scale(0.96) translateY(-2px)}
    to { opacity: 1; transform: scale(1) translateY(0)}
  }:global(.nier-bits-select) { background: linear-gradient(135deg, var(--color-nier-bg-primary) 0%, var(--color-nier-bg-secondary) 100%); border: 2px solid var(--color-nier-border-secondary);transition: all 0.2s ease}:global(.nier-bits-select:focus) { border-color: var(--color-nier-border-primary); box-shadow: 0, 0 0 1px var(--color-nier-border-primary)}:global(.nier-panel-elevated) { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset, 0 1px, 0 rgba(255, 255, 255, 0.1)}
  @media (max-width: 640px) {:global(.bits-select-content) { max-height: 60vh}
  } </style>


