<script lang="ts">
	import { evidenceCommandCenter } from '$lib/stores/evidenceCommandCenter.store';

	const commands = [
		{ id: 'board', label: 'Go to Evidence Board', hint: 'B' },
		{ id: 'graph', label: 'Open Evidence Graph Analyzer', hint: 'G' },
		{ id: 'chat', label: 'Focus AI Transcript', hint: 'C' }
	] as const;

	function runCommand(id: (typeof commands)[number]['id']) {
		if (id === 'board' || id === 'graph' || id === 'chat') {
			evidenceCommandCenter.setActiveView(id);
		}
		evidenceCommandCenter.closeCommandPalette();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			evidenceCommandCenter.closeCommandPalette();
		}
	}
</script>

{#if $evidenceCommandCenter.commandPaletteOpen}
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		onclick={() => evidenceCommandCenter.closeCommandPalette()}
		onkeydown={handleKeydown}
	>
		<div
			class="max-w-md border-[3px] border-[#f5f5f5] bg-[#101018] text-[#f5f5f5] shadow-[4px_4px_0_0_#000] p-3 rounded-none"
			role="presentation"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="text-[10px] uppercase tracking-[0.15em] text-[#ffdf6b] mb-1">
				Command Palette
			</div>
			<p class="text-[10px] text-[#aaa] mb-2">
				Use ↑↓ to choose, Enter to execute. ESC to close.
			</p>

			<ul class="flex flex-col gap-1 text-[11px]">
				{#each commands as cmd}
					<li>
						<button
							type="button"
							class="w-full flex items-center justify-between px-2 py-1 border border-[#f5f5f5] bg-[#15151f] hover:bg-[#262636]"
							onclick={() => runCommand(cmd.id)}
						>
							<span>{cmd.label}</span>
							<span class="text-[9px] text-[#ffdf6b]">[{cmd.hint}]</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

