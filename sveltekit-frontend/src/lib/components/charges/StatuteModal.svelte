<script lang="ts">
	let onClose = $state<any>(undefined);
	let code = $state<any>(undefined);

	interface BundledCharge {
		statuteCode: string; title: string;
		reason: string; confidence: number;
		frequency: number;
	}

	let { isOpen = false, statute = null, caseId = '', onClose = () => {}, onAttach = (_charge: any) => {} } = $props<{
		isOpen?: boolean;
		statute?: any;
		caseId?: string;
		onClose?: () => void;
		onAttach?: (charge: any) => void;
	}>();

	let isAttaching = false;
	let attachError = '';

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
			felony: 'bg-red-900 border-red-700 text-red-100',
			wobbler: 'bg-orange-900 border-orange-700 text-orange-100',
			misdemeanor: 'bg-yellow-900 border-yellow-700 text-yellow-100',
			infraction: 'bg-blue-900 border-blue-700 text-blue-100'
		};
		return colors[penalty] || 'bg-gray-900 border-gray-700 text-gray-100';
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
		<div class="bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full border-4 border-red-900">
			<!-- Header -->
			<div class="bg-gradient-to-r from-red-900 to-gray-900 p-6 border-b-2 border-red-700">
				<div class="flex justify-between items-start">
					<div>
						<h2 class="text-2xl font-bold text-white">{statute.citation}</h2>
						<p class="text-red-200 text-lg mt-1">{statute.title}</p>
					</div>
					<button
						onclick={onClose}
						class="text-gray-400 hover:text-white text-3xl leading-none"
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
						<div class="px-4 py-2 rounded-lg font-bold border-2 bg-purple-900 border-purple-700 text-purple-100">
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
					<p class="text-gray-300">{statute.description}</p>
				</div>

				<!-- Penalty -->
				<div>
					<h3 class="text-lg font-semibold text-white mb-2">Penalty</h3>
					<p class="text-gray-300">{statute.penalty}</p>
				</div>

				<!-- Bundled Charges -->
				{#if statute.bundledCharges && statute.bundledCharges.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-white mb-3">🚔 Suggested Companion Charges</h3>
						<div class="space-y-3">
							{#each statute.bundledCharges as bundle}
								<div class="p-4 bg-red-950 border-2 border-red-700 rounded-lg hover:bg-red-900 transition">
									<div class="flex justify-between items-start">
										<div class="flex-1">
											<p class="font-bold text-red-100">{bundle.title}</p>
											<p class="text-sm text-red-300">{bundle.citation}</p>
											<p class="text-xs text-red-400 mt-2">{bundle.reason}</p>
										</div>
										<div class="text-right ml-4">
											<div class="text-lg font-bold text-red-300">
												{Math.round(bundle.frequency * 100)}%
											</div>
											<div class="text-xs text-red-400">filed together</div>
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
								<span class="px-3 py-1 bg-blue-900 text-blue-200 rounded-full text-sm border border-blue-700">
									{code}
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="bg-gray-800 border-t-2 border-red-700 p-4 flex gap-3 justify-end">
				<button
					onclick={onClose}
					class="px-4 py-2 text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition border border-gray-600"
				>
					Close
				</button>
				<button
					onclick={handleAttach}
					disabled={isAttaching}
					class="px-6 py-2 bg-red-900 hover:bg-red-800 text-white rounded-lg transition font-bold border-2 border-red-700 disabled:opacity-50"
				>
					{isAttaching ? '⏳ Attaching...' : '📎 Attach to Case'}
				</button>
			</div>

			{#if attachError}
				<div class="bg-red-900 text-red-100 p-3 text-center text-sm border-t border-red-700">
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
		from {
			transform: translateY(-20px); opacity: 0;
		}
		to {
			transform: translateY(0); opacity: 1;
		}
	}
</style>




