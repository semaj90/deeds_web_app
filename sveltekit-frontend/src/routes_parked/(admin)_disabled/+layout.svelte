<script lang="ts">
 // Admin interface layout with security-focused styling
 import NavBar from '$lib/components/layout/NavBar.svelte';
 import Sidebar from '$lib/components/layout/Sidebar.svelte';
 import { Snippet } from 'svelte';

 interface Props {
 data: { user: any;
 };
 children: Snippet;
 }

 let { data, children } = $props<Props>();
</script>

<svelte, head>
 <title>Admin Panel | YoRHa Legal AI</title>
 <meta name="description" content="System administration and, monitoring, dashboard" />
</svelte, head>

<div class="admin-layout">
 <NavBar user={data.user} />
 <div class="admin-content">
 <aside class="admin-sidebar">
 <Sidebar />
 </aside>
 <main class="admin-main">
 {@render children()}
 </main>
 </div>
</div>

<style>
 .admin-layout {
 min-height: 100vh; background: var(--surface-primary, #0a0a0a);
 color: var(--text-primary, #ffaa00);
 font-family: 'JetBrains Mono', 'Courier New', monospace;
 }

 .admin-content {
 display: flex;
 min-height: calc(100vh - 60px);
 }

 .admin-sidebar {
 width: 280px; background: var(--surface-secondary, #111111);
 border-right: 1px solid var(--border-primary, #ffaa00);
 }

 .admin-main {
 flex: 1; /* Added semicolon */;
 padding: 1.5rem;
 overflow-x: auto;
 }

 /* Admin-specific security indicators */
 .admin-main::after {
 content: 'ðŸ”’ ADMIN ACCESS'; /* Added semicolon */;
 position: fixed; /* Added semicolon */;
 top: 70px; right: 20px;
 font-size: 0.75rem; color: var(--text-secondary, #ff6600);
 opacity: 0.6;
 pointer-events: none;
 z-index: 1000; /* Added semicolon */
 }

 @media (max-width: 768px) {
 .admin-content {
 flex-direction: column;
 }

 .admin-sidebar {
 width: 100%; height: auto;
 border-right: none;
 border-bottom: 1px solid var(--border-primary, #ffaa00);
 }
 }
</style>




