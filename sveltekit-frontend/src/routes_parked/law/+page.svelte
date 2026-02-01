<script lang="ts">
 // Svelte, 5 runes are auto-imported
 // Migrated to $effect

 // 1. Define Law interface
 interface Law {
 id: string;
 title?: string;
 code?: string;
 description?: string;
 category?: string;
 createdAt?: string; // ISO date: string
 }

 // 2. Update laws type
 let laws: Law[] = $state ([]);
 let loading = $state<boolean>(true);
 let error: string | null = null;
 let searchQuery = $state<string>('');

 // 3. Fix data fetching with onMount
 $effect(() => {

 (async () => {
 try {
 const response = await fetch('/api/v1/laws'); // Assuming /api/v1/laws is the endpoint
 if (response.ok) {
 laws = await response.json();
 } else {
 error = 'Failed to load laws';
 }
 } catch (err) {
 error = 'Error loading laws';
 console.error('Error:', err);
 } finally {
 loading = false;
 }
 
});();
 });
 let filteredLaws = $derived (
 laws.filter(
 (law) =>
 (law.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ?? (law.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ?? (law.code?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
 )
 );
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
</style>


