<script lang="ts">
	import { page } from '$app/state';

	let id = $derived(page.params.id);
	let persons = $state<any[]>([]);
	let loading = $state(true);
	let showAddForm = $state(false);
	let saving = $state(false);
	let newPerson = $state({ name: '', relationship: 'person_of_interest', description: '' });

	async function loadPersons() {
		loading = true;
		try {
			const res = await fetch(`/api/persons?caseId=${id}`);
			if (res.ok) {
				const result = await res.json();
				persons = result.data ?? [];
			}
		} catch (err) {
			console.error('Failed to load persons:', err);
		} finally {
			loading = false;
		}
	}

	async function addPerson() {
		if (!newPerson.name.trim()) return;
		saving = true;
		try {
			const res = await fetch('/api/persons', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newPerson.name.trim(),
					relationship: newPerson.relationship,
					description: newPerson.description.trim(),
					caseIds: [id],
					status: 'active',
					threatLevel: 'low'
				})
			});
			if (res.ok) {
				newPerson = { name: '', relationship: 'person_of_interest', description: '' };
				showAddForm = false;
				await loadPersons();
			}
		} catch (err) {
			console.error('Failed to add person:', err);
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		if (id) {
			loadPersons();
		}
	});
</script>

<div class="persons-tab">
	<div class="persons-header">
		<h2>Persons of Interest</h2>
		<button class="btn-add" onclick={() => (showAddForm = !showAddForm)}>
			{showAddForm ? 'Cancel' : '+ Add Person'}
		</button>
	</div>

	{#if showAddForm}
		<form class="add-form" onsubmit={(e) => { e.preventDefault(); addPerson(); }}>
			<div class="form-row">
				<label>
					<span>Name *</span>
					<input type="text" bind:value={newPerson.name} required placeholder="Full name" />
				</label>
				<label>
					<span>Role</span>
					<select bind:value={newPerson.relationship}>
						<option value="person_of_interest">Person of Interest</option>
						<option value="suspect">Suspect</option>
						<option value="witness">Witness</option>
						<option value="victim">Victim</option>
						<option value="informant">Informant</option>
					</select>
				</label>
			</div>
			<label>
				<span>Notes</span>
				<textarea bind:value={newPerson.description} rows={2} placeholder="Optional notes..."></textarea>
			</label>
			<button type="submit" class="btn-primary" disabled={saving || !newPerson.name.trim()}>
				{saving ? 'Saving...' : 'Add Person'}
			</button>
		</form>
	{/if}

	{#if loading}
		<div class="loading">Loading persons...</div>
	{:else if persons.length === 0}
		<div class="empty-state">
			<div class="empty-icon">👥</div>
			<h3>No persons linked to this case yet</h3>
			<p>Add suspects, victims, or witnesses to get started.</p>
			<button class="btn-primary" onclick={() => (showAddForm = true)}>
				Add First Person
			</button>
		</div>
	{:else}
		<div class="persons-list">
			{#each persons as person (person.id)}
				<div class="person-card">
					<div class="card-header">
						<div class="person-name">{person.name}</div>
						<div class="person-role">{person.relationship ?? 'Unknown'}</div>
					</div>
					<div class="person-details">
						<p><strong>Status:</strong> {person.status || 'Unknown'}</p>
						{#if person.threatLevel && person.threatLevel !== 'low'}
							<p><strong>Threat:</strong> {person.threatLevel}</p>
						{/if}
						{#if person.description}
							<p><strong>Notes:</strong> {person.description}</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.persons-tab {
		padding: 1.5rem;
	}

	.persons-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--sand-dark, #3a3a3a);
		padding-bottom: 1rem;
	}

	.persons-header h2 {
		margin: 0;
	}

	.btn-add {
		padding: 0.5rem 1rem;
		background: var(--accent, #3b82f6);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: var(--accent, #3b82f6);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--sand-dark, #3a3a3a);
		border-radius: 8px;
		background: var(--panel-soft, #1a1a1a);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.add-form label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}

	.add-form label span {
		font-weight: 500;
		opacity: 0.8;
	}

	.add-form input,
	.add-form select,
	.add-form textarea {
		padding: 0.5rem;
		border: 1px solid var(--sand-dark, #3a3a3a);
		border-radius: 4px;
		background: var(--panel, #111);
		color: inherit;
		font-size: 0.875rem;
	}

	.loading,
	.empty-state {
		text-align: center;
		padding: 2rem;
		opacity: 0.7;
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.persons-list {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	}

	.person-card {
		border: 1px solid var(--sand-dark, #3a3a3a);
		border-radius: 8px;
		padding: 1rem;
		background: var(--panel-soft, #1a1a1a);
	}

	.card-header {
		margin-bottom: 0.75rem;
	}

	.person-name {
		font-weight: 600;
		font-size: 1rem;
	}

	.person-role {
		font-size: 0.875rem;
		opacity: 0.7;
		text-transform: capitalize;
	}

	.person-details {
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.person-details p {
		margin: 0.5rem 0;
	}
</style>
