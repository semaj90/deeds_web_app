<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		onSettingsChange?: (settings: AccessibilityConfig) => void;
		children?: Snippet;
	}

	interface AccessibilityConfig {
		fontSize: 'sm' | 'md' | 'lg' | 'xl';
		highContrast: boolean;
		reducedMotion: boolean;
		screenReaderMode: boolean;
	}

	let {
		class: className = '',
		onSettingsChange,
		children,
	}: Props = $props();

	let fontSize = $state<'sm' | 'md' | 'lg' | 'xl'>('md');
	let highContrast = $state(false);
	let reducedMotion = $state(false);
	let screenReaderMode = $state(false);

	const fontSizeOptions = [
		{ value: 'sm' as const, label: 'Small', scale: '0.875rem' },
		{ value: 'md' as const, label: 'Medium', scale: '1rem' },
		{ value: 'lg' as const, label: 'Large', scale: '1.125rem' },
		{ value: 'xl' as const, label: 'Extra Large', scale: '1.25rem' },
	];

	function emitChange() {
		onSettingsChange?.({
			fontSize,
			highContrast,
			reducedMotion,
			screenReaderMode,
		});
	}

	$effect(() => {
		if (reducedMotion) {
			document.documentElement.style.setProperty('--transition-speed', '0s');
		} else {
			document.documentElement.style.removeProperty('--transition-speed');
		}
	});

	$effect(() => {
		const scale = fontSizeOptions.find(o => o.value === fontSize)?.scale ?? '1rem';
		document.documentElement.style.setProperty('--base-font-size', scale);
	});
</script>

<div class="space-y-6 {className}" role="region" aria-label="Accessibility Settings">
	<h3 class="text-lg font-semibold text-white">Accessibility</h3>

	<div class="space-y-4">
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium text-sand/70">Font Size</legend>
			<div class="flex gap-2">
				{#each fontSizeOptions as opt}
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded border transition-colors
							{fontSize === opt.value
								? 'bg-accent text-white border-accent'
								: 'bg-panel text-sand/60 border-sand/30 hover:border-sand/50'}"
						onclick={() => { fontSize = opt.value; emitChange(); }}
						aria-pressed={fontSize === opt.value}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</fieldset>

		<label class="flex items-center justify-between gap-3 cursor-pointer">
			<div>
				<span class="text-sm font-medium text-white">High Contrast</span>
				<p class="text-xs text-sand/50">Increase contrast for better visibility</p>
			</div>
			<input
				type="checkbox"
				bind:checked={highContrast}
				onchange={emitChange}
				class="h-4 w-4 rounded border-sand/30 bg-panel accent-accent"
			/>
		</label>

		<label class="flex items-center justify-between gap-3 cursor-pointer">
			<div>
				<span class="text-sm font-medium text-white">Reduced Motion</span>
				<p class="text-xs text-sand/50">Minimize animations and transitions</p>
			</div>
			<input
				type="checkbox"
				bind:checked={reducedMotion}
				onchange={emitChange}
				class="h-4 w-4 rounded border-sand/30 bg-panel accent-accent"
			/>
		</label>

		<label class="flex items-center justify-between gap-3 cursor-pointer">
			<div>
				<span class="text-sm font-medium text-white">Screen Reader Mode</span>
				<p class="text-xs text-sand/50">Optimize layout for assistive technology</p>
			</div>
			<input
				type="checkbox"
				bind:checked={screenReaderMode}
				onchange={emitChange}
				class="h-4 w-4 rounded border-sand/30 bg-panel accent-accent"
			/>
		</label>
	</div>

	{#if children}
		{@render children()}
	{/if}
</div>
