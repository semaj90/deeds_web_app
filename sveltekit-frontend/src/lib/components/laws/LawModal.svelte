<script lang="ts">
	let code = $state<any>(undefined);

	interface BundledCharge {
		citation: string;, title: string;
		reason: string;, frequency: number;
	}

	interface Precedent {
		caseId: string;, title: string;
		year: number;, court: string;
		relevance: number;
	}

	let { isOpen = false, statute = null, onClose = () => {}, onAttachToCase = (statute: any) => {} } = $props<{
		isOpen?: boolean;
		statute?: any;
		onClose?: () => void;
		onAttachToCase?: (statute: any) => void;
	}>();

	let bundledCharges: BundledCharge[] = [];
	let precedents: Precedent[] = [];
	let relatedStatutes: string[] = [];

	$effect(() => {
		if (statute) {
			bundledCharges = statute.bundledCharges || [];
			precedents = statute.precedents || [];
			relatedStatutes = statute.relatedStatutes || [];
		}
	});

	function getSeverityColor(severity: string): string {
		const colors: Record<string, string> = {
			felony: 'bg-red-100 text-red-800 border-red-300',
			wobbler: 'bg-orange-100 text-orange-800 border-orange-300',
			misdemeanor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
			infraction: 'bg-blue-100 text-blue-800 border-blue-300'
		};
		return colors[severity] || 'bg-gray-100 text-gray-800 border-gray-300';
	}

	function getVictimIcon(victimClass: string | null): string {
		const icons: Record<string, string> = {
			child: '👶',
			spouse: '💑',
			elder: '👴',
			disabled: '♿',
			general: '👤'
		};
		return icons[victimClass || 'general'] || '👤';
	}

	function getVictimLabel(victimClass: string | null): string {
		const labels: Record<string, string> = {
			child: 'Child',
			spouse: 'Spouse',
			elder: 'Elder',
			disabled: 'Disabled',
			general: 'General'
		};
		return labels[victimClass || 'general'] || 'Unknown';
	}

	function handleAttach() {
		onAttachToCase(statute);
		onClose();
	}

	function handleClose() {
		onClose();
	}
</script>

{#if isOpen && statute}
	<div class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
		<div class="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto">
			<!-- Header -->
			<div class="sticky top-0 bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6 border-b border-gray-700">
				<div class="flex justify-between items-start">
					<div>
						<h2 class="text-2xl font-bold">{statute.title}</h2>
						<p class="text-gray-300 text-sm mt-1">{statute.citation}</p>
					</div>
					<button
						onclick={handleClose}
						class="text-gray-400 hover:text-white text-2xl leading-none"
					>
						✕
					</button>
				</div>

				<!-- Badges -->
				<div class="flex gap-2 mt-4 flex-wrap">
					<div class={`px-3 py-1 rounded-full text-sm font-semibold border ${getSeverityColor(statute.severity)}`}>
						{statute.severity.toUpperCase()}
					</div>
					{#if statute.victimClass}
						<div class="px-3 py-1 rounded-full text-sm font-semibold bg-purple-100 text-purple-800 border border-purple-300">
							{getVictimIcon(statute.victimClass)} {getVictimLabel(statute.victimClass)}
						</div>
					{/if}
				</div>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-6">
				<!-- Description -->
				<div>
					<h3 class="text-lg font-semibold text-gray-900 mb-2">Definition</h3>
					<p class="text-gray-700">{statute.description}</p>
				</div>

				<!-- Penalty -->
				<div>
					<h3 class="text-lg font-semibold text-gray-900 mb-2">Penalty</h3>
					<p class="text-gray-700">{statute.penalty}</p>
				</div>

				<!-- Related Statutes -->
				{#if relatedStatutes.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-2">Related Statutes</h3>
						<div class="flex flex-wrap gap-2">
							{#each relatedStatutes as code}
								<span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm border border-blue-200">
									{code}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Bundled Charges -->
				{#if bundledCharges.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-3">⚖️ Suggested Companion Charges</h3>
						<div class="space-y-2">
							{#each bundledCharges as charge}
								<div class="p-3 bg-red-50 border border-red-200 rounded-lg">
									<div class="flex justify-between items-start">
										<div>
											<p class="font-semibold text-gray-900">{charge.title}</p>
											<p class="text-sm text-gray-600">{charge.citation}</p>
											<p class="text-xs text-gray-500 mt-1">{charge.reason}</p>
										</div>
										<div class="text-right">
											<div class="text-sm font-semibold text-red-700">
												{Math.round(charge.frequency * 100)}%
											</div>
											<div class="text-xs text-gray-500">filed together</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Precedents -->
				{#if precedents.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-3">📋 Key Precedents</h3>
						<div class="space-y-2">
							{#each precedents as precedent}
								<div class="p-3 bg-gray-50 border border-gray-200 rounded-lg">
									<div class="flex justify-between items-start">
										<div>
											<p class="font-semibold text-gray-900">{precedent.caseId}</p>
											<p class="text-sm text-gray-600">{precedent.title}</p>
											<p class="text-xs text-gray-500">{precedent.court} ({precedent.year})</p>
										</div>
										<div class="text-right">
											<div class="text-sm font-semibold text-blue-700">
												{Math.round(precedent.relevance * 100)}%
											</div>
											<div class="text-xs text-gray-500">relevant</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex gap-3 justify-end">
				<button
					onclick={handleClose}
					class="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
				>
					Close
				</button>
				<button
					onclick={ handleAttach }
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
				>
					📎 Attach to Case
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.law-modal-overlay) {
		animation: fadeIn 0.2s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>



