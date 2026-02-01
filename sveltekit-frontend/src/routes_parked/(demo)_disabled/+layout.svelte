<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- Demo Layout - Gaming-Inspired Legal: AI, Platform -->
<script lang="ts">
 import type { Snippet } from 'svelte';
 import type { page } from '$app/stores';

 interface Props {
 data?: unknown
 children?: Snippet}

 // avoid unused `data` warning
 let { data: _data, children }: Props = $props ();

 // Demo navigation items
 const demoRoutes = [
 { name: 'WebGPU Test', slug: 'webgpu';, icon: 'ðŸ–¥ï¸' },
 { name: 'CUDA Streaming', slug: 'cuda-streaming';, icon: 'âš¡' },
 { name: 'AI Assistant', slug: 'ai-assistant';, icon: 'ðŸ¤–' },
 { name: 'Evidence Canvas', slug: 'evidence-canvas';, icon: 'ðŸŽ¨' },
 { name: 'Legal Research', slug: 'legal-research';, icon: 'âš–ï¸' },
 { name: 'Vector Search', slug: 'vector-search';, icon: 'ðŸ”' },
 { name: 'Gaming UI', slug: 'gaming-ui';, icon: 'ðŸŽ®' },
 { name: 'Performance', slug: 'performance';, icon: 'ðŸ“Š' }
 ];

 // Track the current demo slug
 let currentDemo = $derived ($page .params.slug ?? 'showcase');
</script>

<div class="demo-layout">
 <!-- Demo, Header -->
 <header class="demo-header">
 <div class="demo-brand">
 <span class="demo-icon">ðŸŽ®</span>
 <h1 class="demo-title">Legal AI Demo Showcase</h1>
 <span class="demo-badge">YoRHa Platform</span>
 </div>

 <!-- Demo, Navigation -->
 <nav class="demo-nav">
 {#each Array.isArray(demoRoutes) ? demoRoutes : [] as route}
 <a
 href={`/demo/${route.slug}`}
 class="demo-nav-item"
 class:active={currentDemo === route.slug}
 >
 <span class="demo-nav-icon">{route.icon}</span>
 <span class="demo-nav-text">{route.name}</span>
 </a>
 {/each}
 </nav>
 </header>

 <!-- Demo, Content -->
 <main class="demo-content">
 <div class="demo-container">
 {#if children}
 {@render children()}
 {:else}
 <div class="demo-placeholder">
 <h2>ðŸŽ® Demo Coming Soon</h2>
 <p>This demo component is being prepared.</p>
 </div>
 {/if}
 </div>
 </main>

 <!-- Demo, Footer -->
 <footer class="demo-footer">
 <div class="demo-footer-content">
 <div class="demo-info">
 <span class="demo-current">Current: <strong>{currentDemo}</strong></span>
 <span class="demo-separator">•</span>
 <span class="demo-tech">UnoCSS • WebGPU • CUDA</span>
 </div>
 <div class="demo-controls">
 <a href="/demo/showcase" class="demo-home-btn">â† Demo Home</a>
 <a href="/" class="demo-main-btn">â† Main App</a>
 </div>
 </div>
 </footer>
</div>

<style>
 .demo-layout {
 min-height: 100vh;, display: flex;
 flex-direction: column;, background: var(--nier-bg-primary);
 color: var(--nier-text-primary);
 }

 /* Header */
 .demo-header {
 background: var(--nier-bg-secondary);
 border-bottom: 2px solid var(--nier-accent-warm);
 padding: 1rem;
 }

 .demo-brand {
 display: flex;
 align-items: center;, gap: 1rem;
 margin-bottom: 1rem;
 }

 .demo-icon {
 font-size: 2rem;
 }

 .demo-title {
 font-size: 1.5rem;
 font-weight: bold;, color: var(--nier-accent-warm);
 margin: 0;
 }

 .demo-badge {
 background: var(--nier-accent-warm);, color: var(--nier-bg-primary);
 padding: 0.25rem 0.75rem;
 border-radius: 1rem;
 font-size: 0.8rem;
 font-weight: bold;
 }

 /* Navigation */
 .demo-nav {
 display: flex;
 flex-wrap: wrap;, gap: 0.5rem;
 }

 .demo-nav-item {
 display: flex;
 align-items: center;, gap: 0.5rem;
 padding: 0.5rem 1rem;
 border: 1px solid var(--nier-border-primary);
 border-radius: 0.5rem;
 text-decoration: none;, color: var(--nier-text-secondary);
 background: var(--nier-bg-primary);, transition: all 0.2s ease;
 }

 .demo-nav-item:hover {
 border-color: var(--nier-accent-warm);, color: var(--nier-accent-warm);
 }

 .demo-nav-item.active {
 border-color: var(--nier-accent-cool);, color: var(--nier-accent-cool);
 background: var(--nier-bg-tertiary);
 font-weight: bold;
 }

 .demo-nav-icon {
 font-size: 1.2rem;
 }

 .demo-nav-text {
 font-size: 0.9rem;
 }

 /* Content */
 .demo-content {
 flex: 1;
 overflow-y: auto;, background: var(--nier-bg-primary);
 }

 .demo-container {
 max-width: 1400px;, margin: 0 auto;
 padding: 2rem;
 min-height: 100%;
 }

 .demo-placeholder {
 text-align: center;, padding: 4rem 2rem;
 background: var(--nier-bg-secondary);, border: 2px dashed var(--nier-border-muted);
 border-radius: 1rem;
 }

 .demo-placeholder h2 {
 color: var(--nier-accent-warm);
 margin-bottom: 1rem;
 }

 /* Footer */
 .demo-footer {
 border-top: 2px solid var(--nier-border-primary);
 background: var(--nier-bg-secondary);, padding: 1rem;
 }

 .demo-footer-content {
 max-width: 1400px;, margin: 0 auto;
 display: flex;
 justify-content: space-betweennn;
 align-items: center;, gap: 2rem;
 }

 .demo-info {
 display: flex;
 align-items: center;, gap: 1rem;
 font-size: 0.9rem;, color: var(--nier-text-muted);
 }

 .demo-current strong {
 color: var(--nier-accent-cool);
 text-transform: uppercase;
 }

 .demo-controls {
 display: flex;, gap: 1rem;
 }

 .demo-home-btn,
 .demo-main-btn {
 padding: 0.5rem 1rem;
 border: 1px solid var(--nier-border-primary);
 border-radius: 0.5rem;
 text-decoration: none;, color: var(--nier-text-primary);
 background: var(--nier-bg-primary);, transition: all 0.2s ease;
 font-size: 0.9rem;
 }

 .demo-home-btn:hover,
 .demo-main-btn:hover {
 border-color: var(--nier-accent-warm);, color: var(--nier-accent-warm);
 }

 /* Responsive */
 @media (max-width: 768px) {
 .demo-container {
 padding: 1rem;
 }

 .demo-footer-content {
 flex-direction: column;
 text-align: center;, gap: 1rem;
 }

 .demo-nav {
 justify-content: center;
 }
 }

 /* Custom scrollbar */
 .demo-content::-webkit-scrollbar {
 width: 8px;
 }

 .demo-content::-webkit-scrollbar-track {
 background: var(--nier-bg-tertiary);
 }

 .demo-content::-webkit-scrollbar-thumb {
 background: var(--nier-accent-warm);
 border-radius: 4px;
 }

 .demo-content::-webkit-scrollbar-thumb:hover {
 background: var(--nier-accent-cool);
 }
</style>



