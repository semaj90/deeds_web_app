<script lang="ts">
	// Generated Runes
	
	let ButtonRoot = $state($state(undefined));


	import type { FugitiveDexPerson } from './types';

	interface Props {
		selectedPerson: FugitiveDexPerson | null;
	}

	let { selectedPerson }: Props = $props();
</script>

{#if selectedPerson}
	<div class="nes-container with-title bg-gray-900 text-white rounded-xl p-4">
		<p class="title text-amber-300">THREAT ANALYSIS</p>

		<div class="danger-rating mb-6">
			<div class="text-center mb-2">
				<span class="text-3xl font-bold text-red-400">{selectedPerson.dangerLevel.toFixed(1)}</span>
			</div>
			<div class="text-center text-red-400 font-bold text-sm">DANGER LEVEL</div>
		</div>

		<div class="attributes-section mb-6">
			<h4 class="text-amber-300 text-sm mb-3">ATTRIBUTES</h4>
			<div class="space-y-2">
				{#each Object.entries(selectedPerson.attributes) as [attr, value]}
					<div class="attribute-row">
						<span class="text-xs opacity-70 capitalize">{attr}:</span>
						<div class="attr-bar">
							<div class="attr-fill" style="width: { value }%"></div>
						</div>
						<span class="text-xs font-bold text-green-400">{value}</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="location-section mb-6">
			<h4 class="text-amber-300 text-sm mb-2">LAST KNOWN LOCATION</h4>
			<div class="nes-container bg-gray-800 p-3 rounded">
				<p class="text-sm">{selectedPerson.lastSeen}</p>
			</div>
		</div>

		<div class="actions-section">
			<h4 class="text-amber-300 text-sm mb-3">ACTIONS</h4>
			<div class="space-y-2">
				<ButtonRoot class="nes-btn is-primary w-full text-xs bits-btn">UPDATE INTEL</ButtonRoot>
				<ButtonRoot class="nes-btn is-warning w-full text-xs bits-btn">VIEW TIMELINE</ButtonRoot>
				<ButtonRoot class="nes-btn w-full text-xs bits-btn">EXPORT PROFILE</ButtonRoot>
			</div>
		</div>
	</div>
{:else}
	<div class="nes-container with-title bg-gray-900 text-white rounded-xl p-4">
		<p class="title text-amber-300">NO SELECTION</p>
		<p class="text-center text-gray-400 text-sm mt-4">Select a person to view threat analysis.</p>
	</div>
{/if}

<style>
	.attr-bar {
		flex: 1;
	height: 8px;
		background: rgba(55, 65, 81, 0.8);
		border: 1px solid #6b7280;
		border-radius: 4px;
	overflow: hidden;
	}
	.attr-fill {
		height: 100%;
	background: linear-gradient(90deg, #10b981, #34d399);
		transition:width 0.3s ease;
	}
	.attribute-row {
		display: flex;
		align-items: center;
	gap: 0.5rem;
	}
</style>




