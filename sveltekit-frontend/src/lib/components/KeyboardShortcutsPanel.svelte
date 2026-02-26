<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		open?: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(false), onclose }: Props = $props();

	const shortcuts = [
		{ category: 'Navigation', items: [
			{ keys: ['Ctrl', 'Shift', 'D'], action: 'Toggle Document Writer' },
			{ keys: ['Ctrl', 'K'], action: 'Open Global Search' },
			{ keys: ['Ctrl', '/'], action: 'Focus Terminal Input' },
			{ keys: ['Escape'], action: 'Close Modal / Panel' },
		]},
		{ category: 'Evidence', items: [
			{ keys: ['Ctrl', 'U'], action: 'Upload Evidence' },
			{ keys: ['Ctrl', 'E'], action: 'Open Evidence Library' },
			{ keys: ['Ctrl', 'F'], action: 'Search Current Page' },
		]},
		{ category: 'Chat', items: [
			{ keys: ['Enter'], action: 'Send Message' },
			{ keys: ['Shift', 'Enter'], action: 'New Line in Chat' },
			{ keys: ['Ctrl', 'L'], action: 'Clear Chat History' },
		]},
		{ category: 'General', items: [
			{ keys: ['?'], action: 'Show This Panel' },
			{ keys: ['Ctrl', 'S'], action: 'Save Current Note' },
			{ keys: ['Ctrl', 'Z'], action: 'Undo' },
		]},
	];

	function handleBackdropClick() {
		open = false;
		onclose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			onclose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="Keyboard Shortcuts"
	>
		<div
			class="relative w-[550px] max-w-[90vw] max-h-[80vh] bg-[#1c1917] border border-stone-700 rounded-lg shadow-2xl overflow-hidden flex flex-col"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-3 border-b border-stone-800">
				<div class="flex items-center gap-2">
					<Icon name="keyboard" size={18} class="text-emerald-400" />
					<span class="font-mono text-sm text-stone-200 tracking-wider">KEYBOARD SHORTCUTS</span>
				</div>
				<button
					class="text-stone-500 hover:text-white bg-transparent border-none cursor-pointer p-1"
					onclick={() => { open = false; onclose?.(); }}
				>
					<Icon name="x" size={18} />
				</button>
			</div>

			<!-- Shortcuts Grid -->
			<div class="flex-1 overflow-y-auto p-5">
				<div class="grid grid-cols-1 gap-5">
					{#each shortcuts as section}
						<div>
							<h3 class="text-[11px] text-emerald-500 font-mono tracking-widest uppercase mb-2.5">{section.category}</h3>
							<div class="flex flex-col gap-1.5">
								{#each section.items as shortcut}
									<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-stone-800/50">
										<span class="text-sm text-stone-300">{shortcut.action}</span>
										<div class="flex items-center gap-1">
											{#each shortcut.keys as key, i}
												{#if i > 0}
													<span class="text-stone-600 text-xs">+</span>
												{/if}
												<kbd class="inline-block px-2 py-0.5 text-[11px] font-mono bg-stone-800 border border-stone-600 rounded text-stone-300 min-w-6 text-center">{key}</kbd>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Footer -->
			<div class="px-5 py-2.5 border-t border-stone-800 text-[10px] text-stone-600 text-center">
				Press <kbd class="px-1.5 py-px bg-stone-800 border border-stone-700 rounded text-stone-400 text-[10px]">?</kbd> anywhere to toggle this panel
			</div>
		</div>
	</div>
{/if}
