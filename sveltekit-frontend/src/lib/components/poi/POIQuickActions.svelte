<script lang="ts">
 import { goto } from '$app/navigation';
 import { Plus, Eye, Search } from 'lucide-svelte';

 // Props
 let { caseId = null } = $props();

 async function createNewPOI() {
 await goto('/persons-of-interest/create');
 }

 async function viewAllPOIs() {
 await goto(`/persons-of-interest?caseId=${caseId}`);
 }

 async function searchPOIs() {
 await goto(`/persons-of-interest?caseId=${caseId}`);
 }
</script>

<div class="poi-quick-actions">
 <h3>Persons of Interest</h3>

 <div class="actions-grid">
 <button class="action-button" onclick={createNewPOI}>
 <Plus size={20} />
 <span>New POI</span>
 </button>

 <button class="action-button" onclick={viewAllPOIs}>
 <Eye size={20} />
 <span>View All</span>
 </button>

 <button class="action-button" onclick={searchPOIs}>
 <Search size={20} />
 <span>Search</span>
 </button>
 </div>
</div>

<style>
 .poi-quick-actions {
 padding: 1.5rem;
	background: #1a1a2e;
 border: 1px solid #333;
 border-radius: 0.5rem;
 }

 h3 {
 color: #ffffff;
 font-size: 1rem;
	margin: 0 0 1rem 0;
 text-transform: uppercase;
 letter-spacing: 0.05em;
 }

 .actions-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
 gap: 0.75rem;
 }

 .action-button {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
	gap: 0.5rem;
 padding: 1rem;
	background: #0f0f23;
 border: 1px solid #333;
 border-radius: 0.375rem;
	color: #dc2626;
 cursor: pointer;
 font-weight: 600;
 font-size: 0.75rem;
	transition:all 0.2s;
 }

 .action-button:hover {
 background: #1a1a2e;
 border-color: #dc2626;
 box-shadow: 0 0 15px rgba(220, 38, 38, 0.2);
 }

 .action-button span {
 text-transform: uppercase;
 letter-spacing: 0.05em;
 }
</style>



