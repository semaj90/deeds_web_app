<script lang="ts">
 import { page } from '$app/state';

 let id = $derived(page.params.id);
 let persons = $state<any[]>([]);
 let loading = $state(true);
 let showAddModal = $state(false);

 async function loadPersons() {
 loading = true;
 try {
 const res = await fetch(`/api/cases/${id}/persons`);
 if (res.ok) {
 persons = await res.json();
 }
 } catch (err) {
 console.error('Failed to load persons:', err);
 } finally {
 loading = false;
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
 <button class="btn-add" onclick={() => showAddModal = true}>
 ➕ Add Person
 </button>
 </div>

 {#if loading}
 <div class="loading">Loading persons...</div>
 {:else if persons.length === 0}
 <div class="empty-state">
 <div class="empty-icon">👥</div>
 <h3>No persons linked to this case yet</h3>
 <p>Add suspects, victims, or witnesses to get started.</p>
 <button class="btn-primary" onclick={() => showAddModal = true}>
 Add First Person
 </button>
 </div>
 {:else}
 <div class="persons-list">
 {#each persons as person (person.id)}
 <div class="person-card">
 <div class="person-header">
 <div class="person-name">{person.name}</div>
 <div class="person-role">{person.role}</div>
 </div>
 <div class="person-details">
 <p><strong>Status:</strong> {person.status || 'Unknown'}</p>
 {#if person.notes}
 <p><strong>Notes:</strong> {person.notes}</p>
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
 border-bottom: 1px solid #e5e7eb;
 padding-bottom: 1rem;
 }

 .persons-header h2 {
 margin: 0;
 }

 .btn-add {
 padding: 0.5rem 1rem;
 background: #3b82f6;
	color: white;
 border: none;
 border-radius: 4px;
	cursor: pointer;
 font-size: 0.875rem;
 }

 .btn-primary {
 padding: 0.75rem 1.5rem;
 background: #3b82f6;
	color: white;
 border: none;
 border-radius: 4px;
	cursor: pointer;
 }

 .loading,
 .empty-state {
 text-align: center;
	padding: 2rem;
 color: #6b7280;
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
 border: 1px solid #e5e7eb;
 border-radius: 8px;
	padding: 1rem;
 background: #f9fafb;
 }

 .person-header {
 margin-bottom: 0.75rem;
 }

 .person-name {
 font-weight: 600;
 font-size: 1rem;
 }

 .person-role {
 font-size: 0.875rem;
	color: #6b7280;
 }

 .person-details {
 font-size: 0.875rem;
 line-height: 1.5;
 }

 .person-details p {
 margin: 0.5rem 0;
 }
</style>
