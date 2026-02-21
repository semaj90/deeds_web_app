<script lang="ts">

	interface BundledCharge { citation: string, title: string;
		reason: string;
	frequency: number;
	}

	interface Precedent { caseId: string, title: string;
		year: number;
	court: string;
		relevance: number;
	}

	let { isOpen = false, statute = null, onClose = () => {},
	onAttachToCase = (statute: any) => {} } = $props<{
		isOpen?: boolean;
		statute?: any;
		onClose?, () => void;
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
			felony: 'bg-danger/10 text-danger border-danger/30',
			wobbler: 'bg-warning/10 text-warning border-warning/30',
			misdemeanor: 'bg-warning/10 text-warning border-warning/30',
			infraction: 'bg-info/10 text-info border-info/40'
		};
		return colors[severity] || 'bg-sand/10 text-sand border-sand/20';
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
			<div class="sticky top-0 bg-gradient-to-r from-panel to-gray-800 text-white p-6 border-b border-sand/20">
				<div class="flex justify-between items-start">
					<div>
						<h2 class="text-2xl font-bold">{statute.title}</h2>
						<p class="text-sand/40 text-sm mt-1">{statute.citation}</p>
					</div>
					<button
						onclick={handleClose}
						class="text-sand/40 hover:text-white text-2xl leading-none"
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
						<div class="px-3 py-1 rounded-full text-sm font-semibold bg-info/10 text-info border border-info/40">
							{getVictimIcon(statute.victimClass)} {getVictimLabel(statute.victimClass)}
						</div>
					{/if}
				</div>
			</div>

			<!-- Content -->
			<div class="p-6 space-y-6">
				<!-- Description -->
				<div>
					<h3 class="text-lg font-semibold text-sand mb-2">Definition</h3>
					<p class="text-sand/80">{statute.description}</p>
				</div>

				<!-- Penalty -->
				<div>
					<h3 class="text-lg font-semibold text-sand mb-2">Penalty</h3>
					<p class="text-sand/80">{statute.penalty}</p>
				</div>

				<!-- Related Statutes -->
				{#if relatedStatutes.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-sand mb-2">Related Statutes</h3>
						<div class="flex flex-wrap gap-2">
							{#each relatedStatutes as code}
								<span class="px-3 py-1 bg-info/5 text-info rounded-full text-sm border border-info/20">
									{code}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Bundled Charges -->
				{#if bundledCharges.length > 0}
					<div>
						<h3 class="text-lg font-semibold text-sand mb-3">⚖️ Suggested Companion Charges</h3>
						<div class="space-y-2">
							{#each bundledCharges as charge}
								<div class="p-3 bg-danger/5 border border-danger/20 rounded-lg">
									<div class="flex justify-between items-start">
										<div>
											<p class="font-semibold text-sand">{charge.title}</p>
											<p class="text-sm text-sand/60">{charge.citation}</p>
											<p class="text-xs text-sand/60 mt-1">{charge.reason}</p>
										</div>
										<div class="text-right">
											<div class="text-sm font-semibold text-danger">
												{Math.round(charge.frequency * 100)}%
											</div>
											<div class="text-xs text-sand/60">filed together</div>
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
						<h3 class="text-lg font-semibold text-sand mb-3">📋 Key Precedents</h3>
						<div class="space-y-2">
							{#each precedents as precedent}
								<div class="p-3 bg-sand/5 border border-sand/20 rounded-lg">
									<div class="flex justify-between items-start">
										<div>
											<p class="font-semibold text-sand">{precedent.caseId}</p>
											<p class="text-sm text-sand/60">{precedent.title}</p>
											<p class="text-xs text-sand/60">{precedent.court} ({precedent.year})</p>
										</div>
										<div class="text-right">
											<div class="text-sm font-semibold text-info">
												{Math.round(precedent.relevance * 100)}%
											</div>
											<div class="text-xs text-sand/60">relevant</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="sticky bottom-0 bg-sand/5 border-t border-sand/20 p-4 flex gap-3 justify-end">
				<button
					onclick={handleClose}
					class="px-4 py-2 text-sand/80 bg-white border border-sand/20 rounded-lg hover:bg-sand/5 transition"
				>
					Close
				</button>
				<button
					onclick={ handleAttach }
					class="px-4 py-2 bg-info text-white rounded-lg hover:bg-info/60 transition font-semibold"
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



