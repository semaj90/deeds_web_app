<script lang="ts">
 import type { dev } from '$app/environment';

 // Svelte 5: Use single $props () call to destructure all props
 const { status, error } = $props <{
 status: number;
 error: { message?: string } | undefined;
 }>();
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
