<script lang="ts">
	/**
	 * AddPoiModal — Add Person of Interest modal
	 * Rewritten Session 63: Svelte 5 snippets (replaced <slot>)
	 */
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import PoiImageUpload from './PoiImageUpload.svelte';

	interface Props {
		open?: boolean;
		trigger?: Snippet;
	}

	let { open = $bindable(false), trigger }: Props = $props();

	let formData = $state({
		name: '',
		alias: '',
		dateOfBirth: '',
		address: '',
		status: 'Person of Interest'
	});
	let tempPoiId = $state('');
	let createdPoiName = $state('');
	let loading = $state(false);
	let message = $state('');
	let messageType = $state<'success' | 'error'>('success');

	async function handleSubmit() {
		try {
			loading = true;
			message = '';

			const response = await fetch('/api/poi', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Failed to create POI' }));
				throw new Error(errorData.message || 'An unknown error occurred.');
			}

			const createdPoi = await response.json();
			tempPoiId = createdPoi.id;
			createdPoiName = formData.name;
			message = 'POI created successfully. Now upload a photo if desired.';
			messageType = 'success';

			formData = {
				name: '',
				alias: '',
				dateOfBirth: '',
				address: '',
				status: 'Person of Interest'
			};
		} catch (error) {
			message = error instanceof Error ? error.message : 'Failed to create POI';
			messageType = 'error';
		} finally {
			loading = false;
		}
	}

	function closeModal() {
		open = false;
	}
</script>

{#if trigger}
	{@render trigger()}
{:else}
	<button
		onclick={() => (open = true)}
		class="flex items-center gap-2 px-4 py-2 bg-info text-white rounded hover:bg-info/60"
	>
		+ Add Person
	</button>
{/if}

{#if open}
	<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>
	<div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-lg p-6">
		<div class="flex items-center justify-between">
			<h2 class="text-2xl font-bold">Add Person of Interest</h2>
			<button onclick={closeModal} class="p-2 hover:bg-sand/10 rounded-lg transition-colors">
				<X class="w-5 h-5" />
			</button>
		</div>

		{#if message}
			<div class="mb-6 p-4 rounded-lg text-sm {messageType === 'success' ? 'bg-accent/5 border border-accent/20 text-accent' : 'bg-danger/5 border border-danger/20 text-danger'}">
				{message}
			</div>
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
			<div>
				<label class="block text-sm font-medium text-sand/80">Full Name *</label>
				<input
					type="text"
					bind:value={formData.name}
					required
					class="w-full px-4 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info"
					placeholder="John Smith"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-sand/80">Alias / Nickname</label>
				<input
					type="text"
					bind:value={formData.alias}
					class="w-full px-4 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info"
					placeholder="JS, Johnny, etc."
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-sand/80">Date of Birth</label>
				<input
					type="date"
					bind:value={formData.dateOfBirth}
					class="w-full px-4 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-sand/80">Address</label>
				<textarea
					bind:value={formData.address}
					rows={3}
					class="w-full px-4 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info"
					placeholder="123 Main St, City, State ZIP"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium text-sand/80">Status</label>
				<select
					bind:value={formData.status}
					class="w-full px-4 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info"
				>
					<option value="Person of Interest">Person of Interest</option>
					<option value="Witness">Witness</option>
					<option value="Suspect">Suspect</option>
					<option value="Victim">Victim</option>
					<option value="Other">Other</option>
				</select>
			</div>

			{#if tempPoiId}
				<div class="border-t pt-4">
					<PoiImageUpload poiId={tempPoiId} poiName={createdPoiName} />
				</div>
			{/if}

			<div class="flex gap-4 pt-6">
				<button
					type="submit"
					disabled={loading || !formData.name}
					class="flex-1 px-4 py-2 bg-info text-white rounded-lg hover:bg-info/60"
				>
					{loading ? 'Creating...' : 'Create POI'}
				</button>
				<button
					type="button"
					onclick={closeModal}
					disabled={loading}
					class="flex-1 px-4 py-2 bg-sand/20 text-sand rounded-lg hover:bg-sand/20"
				>
					Close
				</button>
			</div>
		</form>
	</div>
{/if}
