<script lang="ts" module>
	// Re-export sub-components for compound component pattern
	export { default as Content } from './SelectContent.svelte';
	export { default as Group } from './SelectGroup.svelte';
	export { default as Item } from './SelectItem.svelte';
	export { default as Label } from './SelectLabel.svelte';
	export { default as Root } from './SelectRoot.svelte';
	export { default as Separator } from './SelectSeparator.svelte';
	export { default as Trigger } from './SelectTrigger.svelte';
	export { default as Value } from './SelectValue.svelte';
</script>

<script lang="ts">
	import { Select } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface SelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		value?: string;
		defaultValue?: string;
		onValueChange?: (value: string) => void;
		disabled?: boolean;
		required?: boolean;
		name?: string;
		class?: string;
		placeholder?: string;
		options?: SelectOption[];
		children?: Snippet;
	}

	let {
		value = $bindable(''),
		defaultValue,
		onValueChange,
		disabled = false,
		required = false,
		name,
		class: className = '',
		placeholder = 'Select...',
		options = [],
		children,
	}: Props = $props();

	// Build labels map from options
	const selectedLabel = $derived(
		options.find(opt => opt.value === value)?.label ?? placeholder
	);
</script>

<Select.Root bind:value {disabled} {name} {required} {onValueChange}>
	<Select.Trigger
		class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {className}"
	>
		<span class:text-muted-foreground={!value}>{selectedLabel}</span>
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
			class="opacity-50"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			class="relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
		>
			<Select.Viewport class="p-1">
				{#if options.length > 0}
					{#each options as option (option.value)}
						<Select.Item
							value={option.value}
							label={option.label}
							disabled={option.disabled}
							class="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
						>
							{#snippet children({ selected })}
								{#if selected}
									<span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
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
										>
											<polyline points="20 6 9 17 4 12" />
										</svg>
									</span>
								{/if}
								{option.label}
							{/snippet}
						</Select.Item>
					{/each}
				{/if}
				{#if children}
					{@render children()}
				{/if}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
