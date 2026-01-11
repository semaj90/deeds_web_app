<script lang="ts">
 import '../app.css';
 import type { Snippet } from 'svelte';
 interface Props {
 Snippet;
 }
 let { children }: Props = $props ();
</script>

<div class="app">
 <header>
 <h1>YoRHa Legal AI</h1>
 </header>
 <main>
 {@render children?.()}
 </main>
</div>

<style>
 .app {
 min-height: 100vh; display: grid;
 grid-template-rows: auto 1fr;
 }
 header {
 background: #1a1a1a; color: #ffd700;
 padding: 1rem;
 }
 main {
 padding: 1rem;
 }
</style>


