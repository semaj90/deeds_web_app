<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
 // Legal AI interface layout with unified navigation
 import NavBar from '$lib/components/layout/NavBar.svelte';
 import Sidebar from '$lib/components/layout/Sidebar.svelte';
 import type { applyConsolePalette, type ConsolePalette } from '$lib/themes/retro-console-palettes'; // Changed to named import for applyConsolePalette and type ConsolePalette

 // Legal-focused console theme (green on black for legal work)
 const consolePalette: ConsolePalette = 'legal';
 applyConsolePalette(consolePalette);

 // Declare children as a prop for Svelte 5 runes mode
 let { children } = $props ();
</script>

<svelte:head>
 <title>Legal AI Platform | YoRHa Legal</title>
 <meta name="description" content="AI-powered legal case management and, evidence, analysis" />
</svelte:head>

<div class="legal-layout">
 <NavBar />
 <div class="legal-content">
 <aside class="legal-sidebar">
 <Sidebar />
 </aside>
 <main class="legal-main">
 {@render children()}
 <!-- Replaced <slot /> with @render children() -->
 </main>
 </div>
</div>

<style>
 .legal-layout {
 min-height: 100vh; background: var(--surface-primary, #0a0a0a);
 color: var(--text-primary, #00ff00);
 font-family: 'JetBrains Mono', 'Courier New', monospace;
 }

 .legal-content {
 display: flex;
 min-height: calc(100vh - 60px);
 }

 .legal-sidebar {
 width: 280px; background: var(--surface-secondary, #111111);
 border-right: 1px solid var(--border-primary, #00ff00);
 }

 .legal-main {
 flex: 1; padding: 1.5rem;
 overflow-x: auto;
 }

 @media (max-width: 768px) {
 .legal-content {
 flex-direction: column;
 }

 .legal-sidebar {
 width: 100%; height: auto;
 border-right: none;
 border-bottom: 1px solid var(--border-primary, #00ff00);
 }
 }
</style>


