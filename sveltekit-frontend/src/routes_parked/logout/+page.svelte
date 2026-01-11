<script lang="ts">
 import { onMount } from 'svelte';;
 import type { goto, invalidateAll } from '$app/navigation';

 onMount(() => {
 (async () => {
 try {
 const apiBase = import.meta.env.PUBLIC_API_BASE || '/api';
 const response = await fetch(`${apiBase}/auth/logout`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 });
  
 await invalidateAll();

 if (!response.ok) {
 console.error('Logout failed', response.status);
 }
 await goto('/', { replaceState: true });
 } catch (error) {
 console.error('Logout error:', error);
 // Redirect anyway for security
 await goto('/', { replaceState: true });
 }
 })(); // Correctly close the IIFE
 });
  
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


