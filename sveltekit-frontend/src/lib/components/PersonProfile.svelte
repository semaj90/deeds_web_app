<script lang="ts">
	import Button from '$lib/components/ui/button/Button.svelte';
	import type { FugitiveDexPerson } from './types';

	interface Props {
		selectedPerson: FugitiveDexPerson | null;
		onOpenAIModal: (person: FugitiveDexPerson) => void;
	}

	let { selectedPerson, onOpenAIModal }: Props = $props();
</script>

<div class="nes-container with-title bg-gray-100 rounded-xl p-6">
	<p class="title">Profile</p>

	{#if !selectedPerson}
		<p class="italic text-gray-500 text-center mt-12">Select a person to view details</p>
	{:else}
		<!-- Top Section -->
		<div class="flex gap-6 mb-6">
			<img src={selectedPerson.photo || '/placeholder-person.jpg'} alt="" class="w-40 h-40 rounded-xl border shadow-lg" />

			<div class="flex-1 space-y-2">
				<h1 class="text-3xl font-bold">{selectedPerson.name}</h1>
				<p class="text-sm opacity-60">{selectedPerson.alias}</p>

				<div class="flex gap-4 mt-4">
					<span class="nes-badge {selectedPerson.status.toLowerCase() === 'wanted' ? 'is-error' : selectedPerson.status.toLowerCase() === 'monitoring' ? 'is-warning' : 'is-success'}">
						{selectedPerson.status}
					</span>
					<span class="nes-badge {selectedPerson.priority.toLowerCase() === 'high' ? 'is-error' : selectedPerson.priority.toLowerCase() === 'medium' ? 'is-warning' : 'is-success'}">
						{selectedPerson.priority}
					</span>
				</div>
			</div>
		</div>

		<hr class="my-6" />

		<!-- Characteristics -->
		<div class="grid grid-cols-3 gap-4 mb-6">
			<div class="nes-container is-dark p-3">
				<p class="text-sm opacity-70">Age</p>
				<p class="text-xl font-bold">{selectedPerson.age}</p>
			</div>
			<div class="nes-container is-dark p-3">
				<p class="text-sm opacity-70">Height</p>
				<p class="text-xl font-bold">{selectedPerson.height}</p>
			</div>
			<div class="nes-container is-dark p-3">
				<p class="text-sm opacity-70">Hair</p>
				<p class="text-xl font-bold">{selectedPerson.hair}</p>
			</div>
		</div>

		<hr class="my-6" />

		<!-- Modus Operandi -->
		<h2 class="text-2xl mb-2">Modus Operandi</h2>
		<p class="nes-container bg-gray-200 rounded p-4 mb-6">{selectedPerson.modusOperandi}</p>

		<!-- Known Associates -->
		<h2 class="text-2xl mb-2">Known Associates</h2>
		<div class="grid grid-cols-2 gap-3 mb-6">
			{#each selectedPerson.knownAssociates as associate}
				<div class="nes-container p-2 bg-white">{associate}</div>
			{/each}
		</div>

		<!-- Known Habits -->
		<h2 class="text-2xl mb-2">Known Habits</h2>
		<div class="grid grid-cols-2 gap-3 mb-6">
			{#each selectedPerson.knownHabits as habit}
				<div class="nes-container p-2 bg-white">{habit}</div>
			{/each}
		</div>

		<!-- AI Button -->
		<div class="mt-8">
			<Button
				class="nes-btn is-primary w-full"
				onclick={() => onOpenAIModal(selectedPerson)}
			>
				AI REPORT
			</Button>
		</div>
	{/if}
</div>
