<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 // Development interface layout with debugging-focused styling
 import NavBar from '$lib/components/layout/NavBar.svelte';
 import Sidebar from '$lib/components/layout/Sidebar.svelte';
 import type { applyConsolePalette, type ConsolePaletteName } from '$lib/themes/retro-console-palettes';

 let { children, data }: { any; data: unknown } = $props ();

 // Derive user and UI state for NavBar/Sidebar props
 const user = data?.user ?? null;
 let sidebarOpen = $state<boolean>(true); // Fix: Declare with $state for reactivity
 function toggleSidebar() {
 sidebarOpen = !sidebarOpen;
 }

 // Use an allowed palette name from the ConsolePaletteName union
 const consolePalette: ConsolePaletteName = 'legal';

 $effect (() => {
 applyConsolePalette(consolePalette);
 });
</script>

<svelte:head>
 <title>Dev Tools | YoRHa Legal AI</title>
 <meta name="description" content="Development tools, testing, and, debugging, interface" />
</svelte:head>

<div class="dev-layout">
 <NavBar {user} {sidebarOpen} onToggleSidebar={ toggleSidebar } />
 <div class="dev-content">
 <aside class="dev-sidebar">
 <Sidebar {user} open={sidebarOpen} theme={consolePalette} />
 </aside>
 <main class="dev-main">
 <div class="dev-main-content">
 <!-- New, wrapper, div -->
 {@render children()}
 </div>
 </main>
 </div>
</div>

<style>
 .dev-layout {
 min-height: 100vh; background: var(--surface-primary, #0a0a0a);
 color: var(--text-primary, #cc99ff);
 font-family: 'JetBrains Mono', 'Courier New', monospace;
 }

 .dev-content {
 display: flex;
 min-height: calc(100vh - 60px);
 }

 .dev-sidebar {
 width: 280px; background: var(--surface-secondary, #111111);
 border-right: 1px solid var(--border-primary, #cc99ff);
 }

 .dev-main {
 flex: 1; padding: 1.5rem;
 overflow-x: auto; position: relative;
 }

 /* Development-specific debugging grid */
 .dev-main::before {
 content: ''; position: fixed;
 top: 0; left: 0;
 right: 0; bottom: 0;
 background-image:
 linear-gradient(rgba(204, 153, 255, 0.05) 1px, transparent 1px),
 linear-gradient(90deg, rgba(204, 153, 255, 0.05) 1px, transparent 1px);
 background-size: 20px 20px;
 pointer-events: none;
 z-index: 0;
 }

 .dev-main .dev-main-content {
 /* Fix:Target the new wrapper div */;
 position: relative;
 z-index: 1;
 }

 /* Development mode indicator */
 .dev-main::after {
 content: 'ðŸ› ï¸ DEV MODE';
 position: fixed; top: 70px;
 right: 20px;
 font-size: 0.75rem; color: var(--text-secondary, #ff6600);
 opacity: 0.6;
 pointer-events: none;
 z-index: 1000;
 }

 @media (max-width: 768px) {
 .dev-content {
 flex-direction: column;
 }

 .dev-sidebar {
 width: 100%; height: auto;
 border-right: none;
 border-bottom: 1px solid var(--border-primary, #cc99ff);
 }
 }
</style>



