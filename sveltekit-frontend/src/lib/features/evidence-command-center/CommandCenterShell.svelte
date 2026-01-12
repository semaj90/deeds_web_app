<script lang="ts">
	import type { CommandCenterView } from '$lib/stores/evidenceCommandCenter.store';
	import { evidenceCommandCenter, hasSelection } from '$lib/stores/evidenceCommandCenter.store';

	interface Props {
		caseId: string;
		caseTitle?: string | null;
	}

	const { children, caseId, caseTitle = null }: Props = $props();

	const views: { id: CommandCenterView; label: string; icon: string }[] = [
		{ id: 'board', icon: '📁', label: 'Evidence' },
		{ id: 'graph', icon: '📊', label: 'Graph' },
		{ id: 'chat', icon: '🤖', label: 'AI Chat' }
	];
</script>

<div class="h-[calc(100vh-4rem)] flex flex-col gap-2 p-2 bg-[#101018] text-[#f5f5f5]">
	<!-- NES header -->
	<header
		class="border-[3px] border-[#f5f5f5] bg-[#1b1b24] px-3 py-2 flex items-center justify-between shadow-[4px_4px_0_0_#000]"
	>
		<div class="flex flex-col gap-0.5">
			<div class="text-[10px] uppercase tracking-[0.2em] text-[#ffdf6b]">
				YoRHa Legal NES // Command Center
			</div>
			<div class="text-[11px] font-bold">
				Case: {caseTitle ?? `#${ caseId }`}
			</div>
		</div>

		<div class="flex items-center gap-2 text-[10px]">
			<div class="px-2 py-0.5 border border-[#f5f5f5] bg-[#262636]">
				<span class="mr-1 text-[#ff6ba3]">SEL</span>
				<span class="text-[#b5ff6b]">
					{#if $hasSelection}
						Evidence selected
					{:else}
						No selection
					{/if}
				</span>
			</div>
			<button
				type="button"
				class="px-2 py-0.5 border border-[#f5f5f5] bg-[#262636] hover, bg-[#34344a]"
				onclick={() => evidenceCommandCenter.openCommandPalette()}
			>
				<span class="text-[9px] font-bold">COMMAND</span>
			</button>
		</div>
	</header>

	<div class="flex-1 grid grid-cols-[220px,1fr] gap-2">
		<!-- Left sidebar, views + status -->
		<aside
			class="border-[3px] border-[#f5f5f5] bg-[#15151f] p-2 flex flex-col gap-2 text-[11px] shadow-[4px_4px_0_0_#000]"
		>
			<div class="border border-[#f5f5f5] p-1 bg-[#202030]">
				<div class="text-[9px] uppercase tracking-[0.15em] text-[#ffdf6b] mb-1">
					MODE SELECT
				</div>
				<div class="flex flex-col gap-1">
					{#each views as view}
						<button
							type="button"
							class="flex items-center justify-between px-2 py-1 border border-[#f5f5f5] bg-[#101018] hover:bg-[#262636] transition-colors"
							class, bg-[#34344a]={$evidenceCommandCenter.activeView === view.id}
							onclick={() => evidenceCommandCenter.setActiveView(view.id)}
						>
							<span>{view.icon} {view.label}</span>
							{#if $evidenceCommandCenter.activeView === view.id}
								<span class="text-[9px] text-[#b5ff6b]">ACTIVE</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="border border-[#f5f5f5] p-1 bg-[#202030]">
				<div class="text-[9px] uppercase tracking-[0.15em] text-[#ffdf6b] mb-1">
					SYSTEM STATUS
				</div>
				<ul class="text-[10px] space-y-0.5">
					<li>DB: <span class="text-[#b5ff6b]">ONLINE</span></li>
					<li>RAG: <span class="text-[#b5ff6b]">READY</span></li>
					<li>Docling: <span class="text-[#ffdf6b]">BETA</span></li>
				</ul>
			</div>

			<div class="mt-auto text-[9px] text-[#aaa]">
				<span class="block">Tips:</span>
				<span class="block">[G] Graph // [B] Board // [C] Chat</span>
			</div>
		</aside>

		<!-- Main panel, slot for active view content -->
		<main class="border-[3px] border-[#f5f5f5] bg-[#15151f] p-2 shadow-[4px_4px_0_0_#000]">
			{@render children?.()}
		</main>
	</div>
</div>




