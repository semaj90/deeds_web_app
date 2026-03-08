<script lang="ts">
	/**
	 * AccessibilityPanel — Quick-access overlay for accessibility settings
	 * Wraps AccessibilitySettings in a slide-out panel with keyboard shortcut
	 *
	 * Open: Alt+A or programmatically via `open` prop
	 * Close: Escape key or clicking outside
	 */
	import { Dialog } from 'bits-ui';
	import AccessibilitySettings from '$lib/components/ui/AccessibilitySettings.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { userPrefs } from '$lib/stores/preferences.svelte';

	interface Props {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	}

	let { open = $bindable(false), onOpenChange }: Props = $props();

	// Keyboard shortcut: Alt+A to toggle
	function handleKeydown(e: KeyboardEvent) {
		if (e.altKey && e.key === 'a') {
			e.preventDefault();
			open = !open;
			onOpenChange?.(open);
		}
	}

	function handleSettingsChange(settings: { fontSize: string; highContrast: boolean; reducedMotion: boolean; screenReaderMode: boolean }) {
		// Sync font size to user preferences store
		const scaleMap: Record<string, number> = { sm: 0.875, md: 1.0, lg: 1.125, xl: 1.25 };
		const scale = scaleMap[settings.fontSize] ?? 1.0;
		userPrefs.fontSize = scale;
	}

	$effect(() => {
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', handleKeydown);
			return () => window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

<Dialog.Root bind:open onOpenChange={(v) => { open = v; onOpenChange?.(v); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 bg-black/40 z-40" />
		<Dialog.Content
			class="fixed right-0 top-0 h-full w-80 max-w-[90vw] bg-panel border-l border-sand/20 shadow-xl z-50 overflow-y-auto"
			aria-label="Accessibility Settings Panel"
		>
			<div class="p-6">
				<div class="flex items-center justify-between mb-6">
					<div class="flex items-center gap-2">
						<Icon name="accessibility" class="w-5 h-5 text-accent" />
						<Dialog.Title class="text-lg font-bold text-white">
							Accessibility
						</Dialog.Title>
					</div>
					<Dialog.Close class="p-1.5 rounded hover:bg-sand/10 text-sand/60 hover:text-white transition-colors" aria-label="Close accessibility panel">
						<Icon name="x" class="w-4 h-4" />
					</Dialog.Close>
				</div>

				<Dialog.Description class="text-xs text-sand/50 mb-4">
					Customize display and interaction preferences. Press Alt+A to toggle this panel.
				</Dialog.Description>

				<AccessibilitySettings onSettingsChange={handleSettingsChange} />

				<!-- Quick Actions -->
				<div class="mt-6 pt-4 border-t border-sand/20 space-y-2">
					<h4 class="text-sm font-medium text-sand/70 mb-2">Quick Actions</h4>

					<button
						type="button"
						class="w-full flex items-center gap-3 px-3 py-2 text-sm text-sand/60 hover:text-white hover:bg-sand/10 rounded transition-colors"
						onclick={() => userPrefs.toggleTheme()}
					>
						<Icon name="sun-moon" class="w-4 h-4" />
						Toggle Theme ({userPrefs.theme === 'dark' ? 'Dark' : 'Light'})
					</button>

					<button
						type="button"
						class="w-full flex items-center gap-3 px-3 py-2 text-sm text-sand/60 hover:text-white hover:bg-sand/10 rounded transition-colors"
						onclick={() => userPrefs.increaseFontSize()}
					>
						<Icon name="zoom-in" class="w-4 h-4" />
						Increase Font Size ({(userPrefs.fontSize * 100).toFixed(0)}%)
					</button>

					<button
						type="button"
						class="w-full flex items-center gap-3 px-3 py-2 text-sm text-sand/60 hover:text-white hover:bg-sand/10 rounded transition-colors"
						onclick={() => userPrefs.decreaseFontSize()}
					>
						<Icon name="zoom-out" class="w-4 h-4" />
						Decrease Font Size ({(userPrefs.fontSize * 100).toFixed(0)}%)
					</button>

					<button
						type="button"
						class="w-full flex items-center gap-3 px-3 py-2 text-sm text-danger/60 hover:text-danger hover:bg-danger/10 rounded transition-colors"
						onclick={() => userPrefs.reset()}
					>
						<Icon name="rotate-ccw" class="w-4 h-4" />
						Reset All to Defaults
					</button>
				</div>

				<!-- Keyboard Shortcuts Reference -->
				<div class="mt-4 pt-4 border-t border-sand/20">
					<h4 class="text-sm font-medium text-sand/70 mb-2">Keyboard Shortcuts</h4>
					<div class="space-y-1 text-xs text-sand/50">
						<div class="flex justify-between">
							<span>Toggle this panel</span>
							<kbd class="px-1.5 py-0.5 bg-sand/10 rounded font-mono">Alt+A</kbd>
						</div>
						<div class="flex justify-between">
							<span>Close panel</span>
							<kbd class="px-1.5 py-0.5 bg-sand/10 rounded font-mono">Esc</kbd>
						</div>
					</div>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>