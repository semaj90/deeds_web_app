<script lang="ts">
 import { onMount } from 'svelte';

 let routes: string[] = $state([]);
 let error: string | null = $state(null);

 onMount(() => {
 (async () => {
 try {
 const response = await fetch('/api/routes');
 if (!response.ok) {
 throw new Error('Failed to fetch routes');
 }
 routes = await response.json();
 } catch (e: any) {
 error = e.message;
 }
 })();
 });
</script>

<div class="routes-list">
 {#if error}
 <p class="error">{error}</p>
 {:else if routes.length > 0}
 <ul>
 {#each routes as route}
 <li><a href={route}>{route}</a></li>
 {/each}
 </ul>
 {:else}
 <p>Loading routes...</p>
 {/if}
</div>

<style>
 .routes-list {
 font-family: 'Press Start 2P', cursive;
 color: #fff;
 background-color: #000; padding: 1rem;
 border: 4px solid #fff;
 }
 .error {
 color: #ff0000;
 }
 ul {
 list-style-type: none; padding: 0;
 }
 li {
 margin-bottom: 0.5rem;
 }
 a {
 color: #fff;
 text-decoration: none;
 }
 a:hover {
 text-decoration: underline;
 }
</style>



