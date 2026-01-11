<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- Public Layout - Gaming-Inspired Legal, AI, Platform -->
<script lang="ts">
 import type { Snippet } from 'svelte';
 import NavBar from '$lib/components/layout/NavBar.svelte';
 import type { applyConsolePalette, type ConsolePalette } from '$lib/themes/retro-console-palettes';

 interface Props {
 children?: Snippet;
 }

 let { children }: Props = $props ();

 // State management for public layout
 let selectedTheme = $state <ConsolePalette>('legal');

 // No user for public pages
 let user = $derived (null);

 // Initialize theme on mount
 $effect (() => {
 if (typeof localStorage !== 'undefined') {
 const stored = localStorage.getItem('legal-ai-theme');
 // Define valid palettes to ensure type safety when retrieving from localStorage
 const validPalettes: ConsolePalette[] = ['legal', 'dark', 'light', 'retro', 'cyberpunk'];
 if (stored && validPalettes.includes(stored as ConsolePalette)) {
 selectedTheme = stored as ConsolePalette;
 applyConsolePalette(stored as ConsolePalette);
 } else {
 applyConsolePalette('legal');
 }
 }
 });
</script>

<div class="public-layout">
 <!-- Navigation Bar for, Public, Pages -->
 <!-- NOTE: The NavBar.svelte component needs its 'user' prop to accept 'UserType | null'
 and its 'sidebarOpen' prop to accept 'boolean' to resolve type errors. -->
 <NavBar {user} sidebarOpen={false} />

 <!-- Main, Content, Area -->
 <main class="public-content">
 <div class="content-container">
 {#if children}
 {@render children()}
 {/if}
 </div>
 </main>

 <!-- Footer -->
 <footer class="public-footer">
 <div class="footer-content">
 <div class="footer-brand">
 <span class="footer-icon">🎮</span>
 <span class="footer-text">Legal AI Platform</span>
 <span class="footer-theme">{(selectedTheme as string)?.toUpperCase()}</span>
 </div>
 <div class="footer-info">
 <p>&copy; 2024 Enhanced Legal AI Platform - Gaming-Inspired Innovation</p>
 <p class="footer-subtitle">Justice Through Technology</p>
 </div>
 </div>
 </footer>
</div>

<style>
 .public-layout {
 min-height: 100vh;
 display: flex;
 flex-direction: column;
 background: var(--console-gradient-main, linear-gradient(135deg, #0f0f23, #1a1a2e));
 color: var(--console-fg, white);
 }

 .public-content {
 flex: 1;
 overflow-y: auto;
 background: var(--console-gradient-main, linear-gradient(135deg, #0f0f23, #1a1a2e));
 }

 .content-container {
 padding: 2rem;
 max-width: 1400px;
 margin: 0 auto;
 min-height: 100%;
 }

 .public-footer {
 border-top: 2px solid var(--console-primary, #00aa00);
 background: var(--console-gradient-footer, linear-gradient(45deg, #0f0f23, #1a1a2e));
 padding: 1.5rem 0;
 }

 .footer-content {
 max-width: 1400px;
 margin: 0 auto;
 padding: 0 2rem;
 display: flex;
 align-items: center;
 justify-content: space-between;
 gap: 2rem;
 }

 .footer-brand {
 display: flex;
 align-items: center;
 gap: 0.75rem;
 }

 .footer-icon {
 font-size: 1.5rem;
 }

 .footer-text {
 font-size: 1.1rem;
 font-weight: 600;
 color: var(--console-primary, #00aa00);
 font-family: monospace;
 }

 .footer-theme {
 font-size: 0.7rem;
 padding: 0.25rem 0.5rem;
 background: var(--console-primary, #00aa00);
 color: var(--console-bg, #0f0f23);
 border-radius: 4px;
 font-weight: bold;
 font-family: 'Courier New', monospace;
 }

 .footer-info {
 text-align: right;
 }

 .footer-info p {
 margin: 0;
 color: rgba(255, 255, 255, 0.8);
 font-size: 0.9rem;
 }

 .footer-subtitle {
 font-size: 0.8rem !important
 ;
 color: rgba(255, 255, 255, 0.6) !important;
 margin-top: 0.25rem;
 font-style: italic;
 }
 /* Gaming theme integration */
 :global(body) {
 font-family: var(--console-font, 'Inter', sans-serif);
 background: var(--console-bg, #0f0f23);
 color: var(--console-fg, white);
 }
 /* Scrollbar styling */
 .public-content::-webkit-scrollbar {
 width: 8px;
 }

 .public-content::-webkit-scrollbar-track {
 background: var(--console-bg-light, #1a1a2e);
 }

 .public-content::-webkit-scrollbar-thumb {
 background: var(--console-primary, #00aa00);
 border-radius: 4px;
 }

 .public-content::-webkit-scrollbar-thumb:hover {
 background: var(--console-primary-light, #00cc00);
 }
 /* Responsive design */
 @media (max-width: 768px) {
 .content-container {
 padding: 1rem;
 }

 .footer-content {
 flex-direction: column;
 text-align: center;
 gap: 1rem;
 }

 .footer-info {
 text-align: center;
 }
 }
</style>
