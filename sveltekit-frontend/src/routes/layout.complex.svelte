<script lang="ts">
	import Navigation from '$lib/components/Navigation.svelte';
	import type { Snippet } from 'svelte';
	import { setContext } from 'svelte';
	import '../app.css';
	import '../lib/styles/modern-yorha-theme.css';

	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();

	// Runes-mode reactive locals
	let theme = $state<'dark' | 'light'>('dark');
	let sidebarOpen = $state<boolean>(false);

	// Provide a small app context for other components/services
	setContext('app', {
		theme: () => theme,
		setTheme(v: 'dark' | 'light') { theme = v; },
		sidebarOpen: () => sidebarOpen,
		setSidebarOpen: (v: boolean) => (sidebarOpen = v),
		toggleSidebar: () => (sidebarOpen = !sidebarOpen),
		toggleTheme: () => (theme = theme === 'dark' ? 'light' : 'dark')
	});

	const navProps = $derived({
		sidebarOpen: sidebarOpen,
		setSidebarOpen: (v: boolean) => (sidebarOpen = v),
		toggleSidebar: () => (sidebarOpen = !sidebarOpen)
	});

	$effect(() => {
		// Initialization side-effect
		console.log('Modern Dark YoRHa Legal AI Interface initialized');
		document.documentElement.setAttribute('data-theme', theme);
	});
</script>

<div class="app-layout golden-grid-holy-grail">
 <header class="app-header" style="grid-area: header;">
 <!-- pass a single props object (any) to avoid TS prop type errors -->
 <Navigation {...navProps} />
 </header>

 <aside
 class="app-sidebar transition-transform"
 class:sidebar-hidden={!sidebarOpen}
 style="grid-area: sidebar;"
 >
 <nav class="sidebar-nav">
 <div class="space-y-golden">
 <a href="/" class="yorha-nav-item">Home</a>
 <a href="/cases" class="yorha-nav-item">Cases</a>
 <a href="/evidence" class="yorha-nav-item">Evidence</a>
 <a href="/yorha" class="yorha-nav-item">YoRHa Interface</a>
 <a href="/ai/chat" class="yorha-nav-item">AI Chat</a>
 </div>
 </nav>
 </aside>

	<main class="app-main" style="grid-area: main;">
		<div class="container">
			{@render children()}
		</div>
	</main>

 <footer class="app-footer" style="grid-area: footer;">
 <div class="container p-golden-md">
 <span class="yorha-text-muted">Legal AI Platform © 2024</span>
 <div class="golden-flex">
 <span class="yorha-status-indicator"></span>
 <span class="yorha-text-muted">System Online</span>
 </div>
 </div>
 </footer>
</div>

<style>
 .app-layout {
 min-height: 100vh;
 }
 .app-header {
 background: var(--yorha-bg-secondary);
 border-bottom: 1px solid var(--yorha-border-primary);
 box-shadow: var(--yorha-shadow-sm);
 }
 .app-sidebar {
 background: var(--yorha-bg-secondary);
 border-right: 1px solid var(--yorha-border-primary);
 overflow-y: auto;
 }
 .app-main {
 background: var(--yorha-bg-primary);
 overflow-y: auto;
 position: relative;
 }
 .app-footer {
 background: var(--yorha-bg-tertiary);
 border-top: 1px solid var(--yorha-border-primary);
 font-size: var(--text-sm);
 }
 .sidebar-nav {
 height: 100%;
 }

 @media (max-width: 768px) {
 .app-layout {
 /* Mobile: single-column layout */
 grid-template-areas: 'header' 'main' 'footer';
 grid-template-columns: 1fr;
 }
 .app-sidebar {
 position: fixed;
 top: 0;
 left: 0;
 bottom: 0;
 width: 16rem;
 z-index: 50;
 transform: translateX(-100%);
 }
 .app-sidebar:not(.sidebar-hidden) {
 transform: translateX(0);
 }
 .app-main {
 padding-top: 0;
 }
 }
</style>
