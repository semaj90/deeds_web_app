<script lang="ts">
	import { Dialog } from 'bits-ui';

	interface BundledCharge {
		statuteCode: string;
		title: string;
		reason: string;
		confidence: number;
		frequency: number;
		citation?: string;
	}

	let {
		isOpen = false,
		statute = null,
		caseId = '',
		onClose = () => {},
		onAttach = (_charge: any) => {}
	}: {
		isOpen?: boolean;
		statute?: any;
		caseId?: string;
		onClose?: () => void;
		onAttach?: (charge: any) => void;
	} = $props();

	let isAttaching = $state(false);
	let attachError = $state('');

	async function handleAttach() {
		if (!statute || !caseId) return;

		isAttaching = true;
		attachError = '';

		try {
			const response = await fetch('/api/charges/add', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					caseId,
					statuteCode: statute.citation,
					statuteTitle: statute.title,
					query: statute.title
				})
			});

			if (response.ok) {
				const result = await response.json();
				onAttach(result.charge);
				onClose();
			} else {
				attachError = 'Failed to attach charge';
			}
		} catch (error) {
			console.error('Error attaching charge:', error);
			attachError = 'Error attaching charge';
		} finally {
			isAttaching = false;
		}
	}

	function getPenaltyColor(penalty: string): string {
		const colors: Record<string, string> = {
			felony: 'bg-[#ff0041]/15 border-[#ff0041]/60 text-[#ff4d6d]',
			wobbler: 'bg-[#ffaa00]/15 border-[#ffaa00]/60 text-[#ffaa00]',
			misdemeanor: 'bg-[#f3d471]/15 border-[#f3d471]/60 text-[#f3d471]',
			infraction: 'bg-[#7ee7ff]/15 border-[#7ee7ff]/60 text-[#7ee7ff]'
		};
		return colors[penalty] || 'bg-black/30 border-sand/30 text-sand/60';
	}

	function getVictimIcon(victim: string): string {
		const icons: Record<string, string> = {
			child: '👶',
			elder: '👴',
			spouse: '💑',
			disabled: '♿',
			general: '👤'
		};
		return icons[victim] || '👤';
	}
</script>

<Dialog.Root
	open={isOpen && Boolean(statute)}
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			onClose();
		}
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="statute-modal-backdrop" />
		<Dialog.Content class="statute-modal-panel">
			<!-- Tactical HUD Corner Notches -->
			<div class="hud-notch-tl" aria-hidden="true"></div>
			<div class="hud-notch-tr" aria-hidden="true"></div>
			<div class="hud-notch-bl" aria-hidden="true"></div>
			<div class="hud-notch-br" aria-hidden="true"></div>

			<!-- Top accent gradient -->
			<div class="statute-top-line" aria-hidden="true"></div>

			<!-- Header -->
			<div class="statute-modal-header">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<div class="flex items-center gap-2 mb-1">
							<span class="text-xs uppercase tracking-widest text-[#f3d471] font-mono">Statute Citation</span>
						</div>
						<Dialog.Title class="text-xl sm:text-2xl font-bold text-white tracking-wide">
							{statute?.citation}
						</Dialog.Title>
						<Dialog.Description class="text-sand/70 text-sm mt-0.5">
							{statute?.title}
						</Dialog.Description>
					</div>
					<Dialog.Close
						onclick={onClose}
						class="statute-modal-close"
						aria-label="Close statute details"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</Dialog.Close>
				</div>

				<!-- Severity and Victim Badges -->
				<div class="flex gap-2.5 mt-3 flex-wrap">
					{#if statute?.severity}
						<div class="px-3 py-1 rounded text-xs font-bold font-mono uppercase tracking-wider border {getPenaltyColor(statute.severity)}">
							⚖️ {statute.severity.toUpperCase()}
						</div>
					{/if}
					{#if statute?.victimClass}
						<div class="px-3 py-1 rounded text-xs font-bold font-mono uppercase tracking-wider border bg-[#7ee7ff]/15 border-[#7ee7ff]/50 text-[#7ee7ff]">
							{getVictimIcon(statute.victimClass)} {statute.victimClass.toUpperCase()}
						</div>
					{/if}
				</div>
			</div>

			<!-- Content Body -->
			<div class="statute-modal-body space-y-5">
				<!-- Definition -->
				{#if statute?.description}
					<div class="bg-black/25 p-4 rounded border border-white/5">
						<h3 class="text-xs font-mono uppercase tracking-widest text-[#f3d471] mb-1.5">Definition & Elements</h3>
						<p class="text-sm leading-relaxed text-zinc-200">{statute.description}</p>
					</div>
				{/if}

				<!-- Penalty -->
				{#if statute?.penalty}
					<div class="bg-black/25 p-4 rounded border border-white/5">
						<h3 class="text-xs font-mono uppercase tracking-widest text-[#ffaa00] mb-1.5">Statutory Penalty</h3>
						<p class="text-sm text-zinc-200">{statute.penalty}</p>
					</div>
				{/if}

				<!-- Suggested Companion Charges -->
				{#if statute?.bundledCharges && statute.bundledCharges.length > 0}
					<div>
						<h3 class="text-xs font-mono uppercase tracking-widest text-[#7ee7ff] mb-2.5">
							🚔 Suggested Companion Charges
						</h3>
						<div class="space-y-2.5">
							{#each statute.bundledCharges as bundle}
								<div class="p-3 bg-black/40 border border-[#bad0ff]/20 rounded hover:border-[#f3d471]/50 transition-colors">
									<div class="flex justify-between items-start gap-3">
										<div class="min-w-0">
											<p class="font-bold text-sm text-[#e0e6ed]">{bundle.title}</p>
											<p class="text-xs text-[#7ee7ff] font-mono mt-0.5">{bundle.citation || bundle.statuteCode}</p>
											<p class="text-xs text-zinc-400 mt-1">{bundle.reason}</p>
										</div>
										<div class="text-right shrink-0">
											<div class="text-base font-bold text-[#f3d471] font-mono">
												{Math.round(bundle.frequency * 100)}%
											</div>
											<div class="text-[10px] uppercase tracking-wider text-zinc-500">Co-filed</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Related Statutes -->
				{#if statute?.relatedStatutes && statute.relatedStatutes.length > 0}
					<div>
						<h3 class="text-xs font-mono uppercase tracking-widest text-sand/60 mb-2">Related Statutes</h3>
						<div class="flex flex-wrap gap-2">
							{#each statute.relatedStatutes as code}
								<span class="px-2.5 py-1 bg-black/40 text-sand/80 font-mono text-xs rounded border border-sand/20">
									{code}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="statute-modal-footer">
				<button
					type="button"
					onclick={onClose}
					class="px-4 py-2 text-xs font-mono uppercase text-sand/70 hover:text-white border border-sand/30 hover:border-sand/60 rounded transition-colors"
				>
					Close
				</button>
				<button
					type="button"
					onclick={handleAttach}
					disabled={isAttaching}
					class="px-5 py-2 text-xs font-mono uppercase bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold rounded transition-colors shadow-[0_0_12px_rgba(243,212,113,0.3)] disabled:opacity-50"
				>
					{isAttaching ? '⏳ Attaching...' : '📎 Attach to Case'}
				</button>
			</div>

			{#if attachError}
				<div class="bg-[#ff0041]/20 text-[#ff4d6d] p-3 text-center text-xs font-mono border-t border-[#ff0041]/40">
					{attachError}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.statute-modal-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(4, 7, 14, 0.85);
		backdrop-filter: blur(12px) saturate(1.15);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: statuteFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	:global(.statute-modal-panel) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 10001;
		width: min(44rem, calc(100vw - 2rem));
		max-height: 88vh;
		background: linear-gradient(180deg, rgba(18, 24, 36, 0.98) 0%, rgba(9, 13, 20, 0.99) 100%);
		border: 1px solid rgba(243, 212, 113, 0.35);
		border-radius: 8px;
		box-shadow:
			0 0 0 1px rgba(243, 212, 113, 0.1),
			0 25px 60px -15px rgba(0, 0, 0, 0.85),
			0 0 35px rgba(243, 212, 113, 0.12);
		backdrop-filter: blur(20px);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: statuteScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.statute-top-line {
		position: absolute;
		top: 0;
		left: 1.5rem;
		right: 1.5rem;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.9), rgba(255, 100, 100, 0.7), transparent);
		pointer-events: none;
		z-index: 2;
	}

	.hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
		position: absolute;
		width: 8px;
		height: 8px;
		pointer-events: none;
		z-index: 3;
	}
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

	.statute-modal-header {
		background: rgba(0, 0, 0, 0.35);
		border-bottom: 1px solid rgba(243, 212, 113, 0.2);
		padding: 1.25rem 1.5rem;
		position: relative;
		z-index: 1;
	}

	:global(.statute-modal-close) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(243, 212, 113, 0.25);
		cursor: pointer;
		padding: 0;
		color: rgba(212, 199, 163, 0.7);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	:global(.statute-modal-close:hover) {
		color: #f3d471;
		background: rgba(243, 212, 113, 0.15);
		border-color: rgba(243, 212, 113, 0.5);
	}

	.statute-modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.statute-modal-body::-webkit-scrollbar {
		width: 6px;
	}
	.statute-modal-body::-webkit-scrollbar-track {
		background: transparent;
	}
	.statute-modal-body::-webkit-scrollbar-thumb {
		background: rgba(243, 212, 113, 0.18);
		border-radius: 3px;
	}

	.statute-modal-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid rgba(243, 212, 113, 0.15);
		background: rgba(0, 0, 0, 0.35);
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		align-items: center;
	}

	@keyframes statuteFade {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes statuteScale {
		from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
		to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
	}
</style>
