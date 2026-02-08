<script lang="ts">
	import { CacheStrategies, useCache } from '$lib/cache/cache-service.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import Save from 'lucide-svelte/icons/save';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import { onMount } from 'svelte';
	// Migrated to $effect

	const cache = useCache();

	interface CaseFormData { title: string; description: string;
		priority: 'low' | 'medium' | 'high' | 'critical';
		caseType: string;
	assignedTo: string;
	}

	let formData = $state<CaseFormData>({
		title: '',
		description: '',
		priority: 'medium',
		caseType: '',
		assignedTo: ''
	});

	let saving = $state(false);
	let hasDraft = $state(false);
	let lastSaved = $state<Date | null>(null);
	let autoSaveEnabled = $state(true);

	const DRAFT_KEY = 'draft-case-form';

	// Auto-save form data to cache on every change
	$effect(() => {
		if (autoSaveEnabled && (formData.title || formData.description)) {
			const timeoutId = setTimeout(async () => {
				await saveDraft();
			},
	1000); // Debounce 1 second

			return () => clearTimeout(timeoutId);
		}
	});

	async function saveDraft() {
		try {
			await cache.set(DRAFT_KEY, formData, CacheStrategies.SESSION);
			lastSaved = new Date();
			hasDraft = true;
			console.log('💾 Auto-saved draft at', lastSaved.toLocaleTimeString());
		} catch (error) {
			console.error('Failed to save draft:', error);
		}
	}

	async function loadDraft() {
		try {
			const draft = await cache.get<CaseFormData>(DRAFT_KEY);
			if (draft) {
				formData = draft;
				hasDraft = true;
				console.log('✅ Restored draft from cache');
			}
		} catch (error) {
			console.error('Failed to load draft:', error);
		}
	}

	async function clearDraft() {
		await cache.delete(DRAFT_KEY);
		formData = {
			title: '',
			description: '',
			priority: 'medium',
			caseType: '',
			assignedTo: ''
		};
		hasDraft = false;
		lastSaved = null;
		console.log('🗑️ Draft cleared');
	}

	async function submitForm() {
		saving = true;
		try {
			// Simulate API call
			await new Promise(resolve => setTimeout(resolve, 1000));

			const response = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(formData)
			});

			if (response.ok) {
				// Clear draft after successful submission
				await clearDraft();
				console.log('✅ Case created successfully');
				// Redirect or show success message
			}
		} catch (error) {
			console.error('Failed to create case:', error);
		} finally {
			saving = false;
		}
	}

	onMount(loadDraft);
</script>

<div class="container mx-auto p-6 max-w-4xl">
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center justify-between">
				<span>Create New Case</span>
				{#if hasDraft && lastSaved}
					<span class="text-sm font-normal text-muted-foreground flex items-center gap-2">
						<Save class="w-4 h-4" />
						Auto-saved {lastSaved.toLocaleTimeString()}
					</span>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-6">
			<!-- Draft Notice -->
			{#if hasDraft}
				<div class="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-md">
					<AlertCircle class="w-5 h-5 text-blue-600" />
					<div class="flex-1">
						<p class="text-sm font-medium text-blue-900">Draft Found</p>
						<p class="text-xs text-blue-700">Your previous work has been restored from cache</p>
					</div>
					<Button onclick={clearDraft} variant="ghost" size="sm">
						<Trash2 class="w-4 h-4 mr-2" />
						Discard
					</Button>
				</div>
			{/if}

			<!-- Auto-save Toggle -->
			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					id="autosave"
					bind:checked={autoSaveEnabled}
					class="w-4 h-4"
				/>
				<label for="autosave" class="text-sm">
					Enable auto-save (saves to browser cache every 1 second)
				</label>
			</div>

			<!-- Form Fields -->
			<div class="space-y-4">
				<div>
					<label for="title" class="block text-sm font-medium mb-1">
						Case Title *
					</label>
					<input
						id="title"
						type="text"
						bind:value={formData.title}
						placeholder="Enter case title"
						class="w-full px-3 py-2 border rounded-md"
						required
					/>
				</div>

				<div>
					<label for="description" class="block text-sm font-medium mb-1">
						Description *
					</label>
					<textarea
						id="description"
						bind:value={formData.description}
						placeholder="Provide case details..."
						rows="6"
						class="w-full px-3 py-2 border rounded-md"
						required
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="priority" class="block text-sm font-medium mb-1">
							Priority
						</label>
						<select
							id="priority"
							bind:value={formData.priority}
							class="w-full px-3 py-2 border rounded-md"
						>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="critical">Critical</option>
						</select>
					</div>

					<div>
						<label for="caseType" class="block text-sm font-medium mb-1">
							Case Type
						</label>
						<input
							id="caseType"
							type="text"
							bind:value={formData.caseType}
							placeholder="e.g., Criminal, Civil"
							class="w-full px-3 py-2 border rounded-md"
						/>
					</div>
				</div>

				<div>
					<label for="assignedTo" class="block text-sm font-medium mb-1">
						Assigned To
					</label>
					<input
						id="assignedTo"
						type="text"
						bind:value={formData.assignedTo}
						placeholder="Attorney name"
						class="w-full px-3 py-2 border rounded-md"
					/>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex gap-3 pt-4">
				<Button onclick={submitForm} disabled={saving || !formData.title || !formData.description}>
					{#if saving}
						Creating...
					{:else}
						Create Case
					{/if}
				</Button>

				<Button onclick={saveDraft} variant="outline">
					<Save class="w-4 h-4 mr-2" />
					Save Draft
				</Button>

				<Button onclick={clearDraft} variant="ghost">
					<Trash2 class="w-4 h-4 mr-2" />
					Clear Form
				</Button>
			</div>
		</CardContent>
	</Card>

	<!-- Cache Statistics -->
	<Card class="mt-6">
		<CardHeader>
			<CardTitle class="text-sm">Cache Statistics</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="grid grid-cols-3 gap-4 text-sm">
				<div>
					<p class="text-muted-foreground">Memory Hits</p>
					<p class="text-lg font-semibold">{cache.stats.memoryHits}</p>
				</div>
				<div>
					<p class="text-muted-foreground">Persistent Hits</p>
					<p class="text-lg font-semibold">{cache.stats.persistentHits}</p>
				</div>
				<div>
					<p class="text-muted-foreground">Hit Rate</p>
					<p class="text-lg font-semibold">{cache.stats.hitRate}</p>
				</div>
			</div>
		</CardContent>
	</Card>
</div>
