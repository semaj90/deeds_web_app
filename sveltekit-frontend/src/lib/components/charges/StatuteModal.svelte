<script lang="ts">


	interface BundledCharge { statuteCode: string, title: string;
		reason: string;
	confidence: number;
		frequency: number;
	}

	let { isOpen = false, statute = null, caseId = '', onClose = () => {},
	onAttach = (_charge: any) => {} } = $props<{
		isOpen?: boolean;
		statute?: any;
		caseId?: string;
		onClose?: () => void;
		onAttach?: (charge: any) => void;
	}>();

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
			felony: 'bg-danger/20 border-danger/60 text-danger/20',
			wobbler: 'bg-warning/20 border-warning/60 text-warning/20',
			misdemeanor: 'bg-warning/20 border-warning/60 text-warning',
			infraction: 'bg-info/20 border-info/60 text-info/20'
		};
		return colors[penalty] || 'bg-panel border-sand/20 text-sand/20';
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

{#if isOpen && statute}
	<div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
		<div class="bg-panel rounded-lg shadow-2xl max-w-2xl w-full border-4 border-danger/30">
			<!-- Header -->
			<div class="bg-gradient-to-r from-danger/20 to-panel p-6 border-b-2 border-danger/60">
				<div class="flex justify-between items-start">
					<div>
						<h2 class="text-2xl font-bold text-white">{statute.citation}</h2>
						<p class="text-danger/40 text-lg mt-1">{statute.title}</p>
					</div>
					<button
						onclick={onClose}
						class="text-sand/40 hover:text-white text-3xl leading-none"
					>
						✕
					</button>
				</div>

				<!-- Badges -->
				<div class="flex gap-3 mt-4 flex-wrap">
					{#if statute.severity}
						<div
							class={`px-4 py-2 rounded-lg font-bold border-2 ${getPenaltyColor(statute.severity)}`}
						>
							⚖️ {statute.severity.toUpperCase()}
						</div>
					{/if}
					{#if statute.victimClass}
						<div class="px-4 py-2 rounded-lg font-bold border-2 bg-info/20 border-info/60 text-info/20">
							{getVictimIcon(statute.victimClass)} {statute.victimClass.toUpperCase()}
						</div>
					{/if}
				</div>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-6 max-h-96 overflow-y-auto">
				<!-- Description -->
				<div>
					<h3 class="text-lg font-semibold text-white mb-2">Definition</h3>
					<p class="text-sand/40">{statute.description}</p>
				</div>

				<!-- Penalty -->
				<div>
					<h3 class="text-lg font-semibold text-white mb-2">Penalty</h3>
					<p class="text-sand/40">{statute.penalty}</p>
				</div>

				<!-- Bundled Charges -->
				{#if statute.bundledCharges && statute.bundledCharges.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-white mb-3">🚔 Suggested Companion Charges</h3>
						<div class="space-y-3">
							{#each statute.bundledCharges as bundle}
								<div class="p-4 bg-danger/10 border-2 border-danger/60 rounded-lg hover:bg-danger/20 transition">
									<div class="flex justify-between items-start">
										<div class="flex-1">
											<p class="font-bold text-danger/20">{bundle.title}</p>
											<p class="text-sm text-danger/60">{bundle.citation}</p>
											<p class="text-xs text-danger/80 mt-2">{bundle.reason}</p>
										</div>
										<div class="text-right ml-4">
											<div class="text-lg font-bold text-danger/60">
												{Math.round(bundle.frequency * 100)}%
											</div>
											<div class="text-xs text-danger/80">filed together</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Related Statutes -->
				{#if statute.relatedStatutes && statute.relatedStatutes.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-white mb-2">Related Statutes</h3>
						<div class="flex flex-wrap gap-2">
							{#each statute.relatedStatutes as code}
								<span class="px-3 py-1 bg-info/20 text-info/40 rounded-full text-sm border border-info/60">
									{code}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="bg-panelSoft border-t-2 border-danger/60 p-4 flex gap-3 justify-end">
				<button
					onclick={onClose}
					class="px-4 py-2 text-sand/40 bg-panelSoft hover:bg-sand/20 rounded-lg transition border border-sand/30"
				>
					Close
				</button>
				<button
					onclick={handleAttach}
					disabled={isAttaching}
					class="px-6 py-2 bg-danger/20 hover:bg-danger/60 text-white rounded-lg transition font-bold border-2 border-danger/60 disabled:opacity-50"
				>
					{isAttaching ? '⏳ Attaching...' : '📎 Attach to Case'}
				</button>
			</div>

			{#if attachError}
				<div class="bg-danger/20 text-danger/20 p-3 text-center text-sm border-t border-danger/60">
					{attachError}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	:global(.statute-modal) {
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from { transform: translateY(-20px);
		opacity: 0;
		}
		to { transform: translateY(0);
		opacity: 1;
		}
	}
</style>




