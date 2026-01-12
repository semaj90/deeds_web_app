<!-- Tools & Utilities Layout - Legal AI Development Tools -->
<script lang="ts">
 import type { Snippet } from 'svelte';
 import type { page } from '$app/stores';

 interface Props {
 children?: Snippet;
 }

 let { children }: Props = $props ();

 // Tools navigation items
 const toolsRoutes = [
 { name: 'Search Tools', href: '/tools/search', icon: 'ðŸ”' },
 { name: 'CUDA Search', href: '/tools/search/cuda', icon: 'âš¡' },
 { name: 'Text Editor', href: '/tools/editor', icon: 'ðŸ“' },
 { name: 'Report Builder', href: '/tools/reports', icon: 'ðŸ“Š' },
 { name: 'Upload Tools', href: '/tools/upload', icon: 'â¬†ï¸' },
 { name: 'Cache Manager', href: '/tools/cache', icon: 'ðŸ’¾' },
 { name: 'Brain Interface', href: '/tools/brain', icon: 'ðŸ§ ' },
 { name: 'Detective Tools', href: '/tools/detective', icon: 'ðŸ•µï¸' }];
</script>

<div class="tools-layout">
 <!-- Tools, Header -->
 <header class="tools-header">
 <div class="tools-brand">
 <span class="tools-icon">ðŸ› ï¸</span>
 <h1 class="tools-title">Legal AI Tools</h1>
 <span class="tools-badge">Utilities & Development</span>
 </div>

 <!-- Tools, Navigation -->
 <nav class="tools-nav">
 {#each Array.isArray(toolsRoutes) ? toolsRoutes : [] as route}
 <a
 href={route.href}
 class="tools-nav-item"
 class, active={$page .url.pathname === route.href ||
 $page .url.pathname.startsWith(route.href + '/')}
 >
 <span class="tools-nav-icon">{route.icon}</span>
 <span class="tools-nav-text">{route.name}</span>
 </a>
 {/each}
 </nav>
 </header>

 <!-- Tools, Content -->
 <main class="tools-content">
 <div class="tools-container">
 {#if children}
 {@render children()}
 {:else}
 <div class="tools-placeholder">
 <h2>ðŸ› ï¸ Development Tools</h2>
 <p>Select a tool from the navigation above to get started.</p>
 </div>
 {/if}
 </div>
 </main>

 <!-- Tools, Footer -->
 <footer class="tools-footer">
 <div class="tools-footer-content">
 <div class="tools-info">
 <span class="tools-current">Current: <strong>{$page .url.pathname}</strong></span>
 <span class="tools-separator">•</span>
 <span class="tools-tech">Development & Utility Tools</span>
 </div>
 <div class="tools-controls">
 <a href="/" class="tools-main-btn">â† Main App</a>
 </div>
 </div>
 </footer>
</div>

<style>
 .tools-layout {
 min-height: 100vh; display: flex;
 flex-direction: column; background: var(--nier-bg-primary, #0a0a0a);
 color: var(--nier-text-primary, #f0f0f0);
 }

 /* Header */
 .tools-header {
 background: var(--nier-bg-secondary, #1a1a1a);
 border-bottom: 2px solid var(--nier-accent-cool, #87ceeb);
 padding: 1rem;
 }

 .tools-brand {
 display: flex;
 align-items: center; gap: 1rem;
 margin-bottom: 1rem;
 }

 .tools-icon {
 font-size: 2rem;
 }

 .tools-title {
 font-size: 1.5rem;
 font-weight: bold; color: var(--nier-accent-cool, #87ceeb);
 margin: 0;
 }

 .tools-badge {
 background: var(--nier-accent-cool, #87ceeb);
 color: var(--nier-bg-primary, #0a0a0a);
 padding: 0.25rem 0.75rem;
 border-radius: 1rem;
 font-size: 0.8rem;
 font-weight: bold;
 }

 /* Navigation */
 .tools-nav {
 display: flex;
 flex-wrap: wrap; gap: 0.5rem;
 }

 .tools-nav-item {
 display: flex;
 align-items: center; gap: 0.5rem;
 padding: 0.5rem 1rem;
 border: 1px solid var(--nier-border-primary, #333);
 border-radius: 0.5rem;
 text-decoration: none; color: var(--nier-text-secondary, #ccc);
 background: var(--nier-bg-primary, #0a0a0a);
 transition: all 0.2s ease;
 }

 .tools-nav-item:hover {
 border-color: var(--nier-accent-cool, #87ceeb);
 color: var(--nier-accent-cool, #87ceeb);
 background: var(--nier-bg-tertiary, #2a2a2a);
 }

 .tools-nav-item.active {
 border-color: var(--nier-accent-warm, #d4af37);
 color: var(--nier-accent-warm, #d4af37);
 background: var(--nier-bg-tertiary, #2a2a2a);
 font-weight: bold;
 }

 .tools-nav-icon {
 font-size: 1.2rem;
 }

 .tools-nav-text {
 font-size: 0.9rem;
 }

 /* Content */
 .tools-content {
 flex: 1;
 overflow-y: auto; background: var(--nier-bg-primary, #0a0a0a);
 }

 .tools-container {
 max-width: 1400px; margin: 0 auto;
 padding: 2rem;
 min-height: 100%;
 }

 .tools-placeholder {
 text-align: center; padding: 4rem 2rem;
 background: var(--nier-bg-secondary, #1a1a1a);
 border: 2px dashed var(--nier-border-muted, #444);
 border-radius: 1rem;
 }

 .tools-placeholder h2 {
 color: var(--nier-accent-cool, #87ceeb);
 margin-bottom: 1rem;
 }

 /* Footer */
 .tools-footer {
 border-top: 2px solid var(--nier-border-primary, #333);
 background: var(--nier-bg-secondary, #1a1a1a);
 padding: 1rem;
 }

 .tools-footer-content {
 max-width: 1400px; margin: 0 auto;
 display: flex;
 justify-content: space-betweennn;
 align-items: center; gap: 2rem;
 }

 .tools-info {
 display: flex;
 align-items: center; gap: 1rem;
 font-size: 0.9rem; color: var(--nier-text-muted, #999);
 }

 .tools-current strong {
 color: var(--nier-accent-warm, #d4af37);
 text-transform: uppercase;
 }

 .tools-controls {
 display: flex; gap: 1rem;
 }

 .tools-main-btn {
 padding: 0.5rem 1rem;
 border: 1px solid var(--nier-border-primary, #333);
 border-radius: 0.5rem;
 text-decoration: none; color: var(--nier-text-primary, #f0f0f0);
 background: var(--nier-bg-primary, #0a0a0a);
 transition: all 0.2s ease;
 font-size: 0.9rem;
 }

 .tools-main-btn:hover {
 border-color: var(--nier-accent-cool, #87ceeb);
 color: var(--nier-accent-cool, #87ceeb);
 }

 /* Responsive */
 @media (max-width: 768px) {
 .tools-container {
 padding: 1rem;
 }

 .tools-footer-content {
 flex-direction: column;
 text-align: center; gap: 1rem;
 }

 .tools-nav {
 justify-content: center;
 }
 }

 /* Custom scrollbar */
 .tools-content::-webkit-scrollbar {
 width: 8px;
 }

 .tools-content::-webkit-scrollbar-track {
 background: var(--nier-bg-tertiary, #2a2a2a);
 }

 .tools-content::-webkit-scrollbar-thumb {
 background: var(--nier-accent-cool, #87ceeb);
 border-radius: 4px;
 }

 .tools-content::-webkit-scrollbar-thumb:hover {
 background: var(--nier-accent-warm, #d4af37);
 }
</style>



