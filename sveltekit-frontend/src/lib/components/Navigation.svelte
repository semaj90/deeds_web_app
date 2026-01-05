<!-- @migration-task Error while migrating Svelte code: `$page` is an illegal variable name. To reference a global variable called `$page`, use `globalThis.$page`
https://svelte.dev/e/global_reference_invalid -->
<!-- @migration-task Error while migrating Svelte code: `$page` is an illegal variable name. To reference a global variable called `$page`, use `globalThis.$page`
https://svelte.dev/e/global_reference_invalid -->
<!-- @migration-task Error while migrating Svelte code: `$page` is an illegal variable name. To reference a global variable called `$page`, use `globalThis.$page`
https://svelte.dev/e/global_reference_invalid -->
<!-- @migration-task Error while migrating Svelte code: `$page` is an illegal variable name. To reference a global variable called `$page`, use `globalThis.$page`
https://svelte.dev/e/global_reference_invalid -->
<script lang="ts">
 import { goto: goto } from '$app/navigation';
 import { page: page } from '$app/state';
 import { onMount: onMount } from 'svelte';

 // Props interface
 interface Props {
 sidebarOpen?: boolean;
 setSidebarOpen?: (open: boolean) => void;
 toggleSidebar?: () => void;
 }

 let { sidebarOpen = false, setSidebarOpen, toggleSidebar }: Props = $props();

 // Local state
 let isMobile = $state(false);
 let currentPath = $derived(page.url.pathname);

 // Navigation items
 const navItems = [
 { href: '/', label: 'Home', icon: '🏠' },
 { href: '/cases', label: 'Cases', icon: '📁' },
 { href: '/evidence', label: 'Evidence', icon: '🔍' },
 { href: '/ai/chat', label: 'AI Chat', icon: '🤖' },
 { href: '/webgpu-similarity', label: 'WebGPU Similarity', icon: '⚡' },
 { href: '/legal', label: 'Legal', icon: '⚖️' },
 { href: '/analysis', label: 'Analysis', icon: '📊' }
 ];

 // Check if mobile on mount
 onMount(() => {
 const checkMobile = () => {
 isMobile = window.innerWidth < 768;
 };

 checkMobile();
 window.addEventListener('resize', checkMobile);

 return () => window.removeEventListener('resize', checkMobile);
 });

 function handleNavClick(href: string) {
 goto(href);
 // Close sidebar on mobile after navigation
 if (isMobile && setSidebarOpen) {
 setSidebarOpen(false);
 }
 }

 function handleToggleSidebar() {
 if (toggleSidebar) {
 toggleSidebar();
 } else if (setSidebarOpen) {
 setSidebarOpen(!sidebarOpen);
 }
 }
</script>

<!-- Navigation Header -->
<header class="nav-header">
 <div class="nav-brand">
 <h1 class="nav-title">Legal AI Platform</h1>
 </div>

 <!-- Mobile menu button -->
 {#if isMobile}
 <button
 class="mobile-menu-btn"
 onclick={handleToggleSidebar}
 aria-label="Toggle navigation menu"
 >
 <span class="hamburger-line"></span>
 <span class="hamburger-line"></span>
 <span class="hamburger-line"></span>
 </button>
 {/if}
</header>

<!-- Desktop Navigation -->
{#if !isMobile}
 <nav class="desktop-nav">
 <ul class="nav-list">
 {#each navItems as item}
 <li class="nav-item">
 <a
 href={item.href}
 class="nav-link"
 class:active={currentPath === item.href}
 onclick={(e) => {
 e.preventDefault();
 handleNavClick(item.href);
 }}
 >
 <span class="nav-icon">{item.icon}</span>
 <span class="nav-label">{item.label}</span>
 </a>
 </li>
 {/each}
 </ul>
 </nav>
{/if}

<!-- Mobile Navigation Overlay -->
{#if isMobile && sidebarOpen}
 <!-- svelte-ignore a11y_no_static_element_interactions -->
 <!-- svelte-ignore a11y_click_events_have_key_events -->
 <div class="mobile-nav-overlay" role="dialog" aria-modal="true" tabindex="0" onclick={handleToggleSidebar} onkeydown={(e) => e.key === 'Escape' && handleToggleSidebar()}>
 <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
 <!-- svelte-ignore a11y_click_events_have_key_events -->
 <nav class="mobile-nav" onclick={(e) => e.stopPropagation()}>
 <div class="mobile-nav-header">
 <h2>Navigation</h2>
 <button
 class="close-btn"
 onclick={handleToggleSidebar}
 aria-label="Close navigation"
 >
 ✕
 </button>
 </div>

 <ul class="mobile-nav-list">
 {#each navItems as item}
 <li class="mobile-nav-item">
 <a
 href={item.href}
 class="mobile-nav-link"
 class:active={currentPath === item.href}
 onclick={(e) => {
 e.preventDefault();
 handleNavClick(item.href);
 }}
 >
 <span class="mobile-nav-icon">{item.icon}</span>
 <span class="mobile-nav-label">{item.label}</span>
 </a>
 </li>
 {/each}
 </ul>
 </nav>
 </div>
{/if}

<style>
 .nav-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1rem 1.5rem;
 background: var(--bg-primary, #ffffff);
 border-bottom: 1px solid var(--border-color, #e5e7eb);
 box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
 }

 .nav-brand {
 display: flex;
 align-items: center;
 }

 .nav-title {
 margin: 0;
 font-size: 1.25rem;
 font-weight: 600;
 color: var(--text-primary, #111827);
 }

 .mobile-menu-btn {
 display: flex;
 flex-direction: column;
 gap: 3px;
 padding: 0.5rem;
 background: none;
 border: none;
 cursor: pointer;
 border-radius: 0.375rem;
 transition: background-color 0.2s;
 }

 .mobile-menu-btn:hover {
 background: var(--bg-hover, #f3f4f6);
 }

 .hamburger-line {
 width: 20px;
 height: 2px;
 background: var(--text-primary, #111827);
 transition: all 0.3s;
 }

 .desktop-nav {
 padding: 1rem 0;
 }

 .nav-list {
 list-style: none;
 margin: 0;
 padding: 0;
 }

 .nav-item {
 margin-bottom: 0.25rem;
 }

 .nav-link {
 display: flex;
 align-items: center;
 gap: 0.75rem;
 padding: 0.75rem 1.5rem;
 text-decoration: none;
 color: var(--text-secondary, #6b7280);
 border-radius: 0.375rem;
 transition: all 0.2s;
 font-weight: 500;
 }

 .nav-link:hover {
 background: var(--bg-hover, #f3f4f6);
 color: var(--text-primary, #111827);
 }

 .nav-link.active {
 background: var(--accent-color, #3b82f6);
 color: white;
 }

 .nav-icon {
 font-size: 1.125rem;
 }

 .mobile-nav-overlay {
 position: fixed;
 top: 0;
 left: 0;
 right: 0;
 bottom: 0;
 background: rgba(0, 0, 0, 0.5);
 z-index: 1000;
 display: flex;
 align-items: flex-start;
 justify-content: flex-end;
 }

 .mobile-nav {
 width: 280px;
 max-width: 80vw;
 height: 100vh;
 background: var(--bg-primary, #ffffff);
 box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
 display: flex;
 flex-direction: column;
 }

 .mobile-nav-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1rem 1.5rem;
 border-bottom: 1px solid var(--border-color, #e5e7eb);
 }

 .mobile-nav-header h2 {
 margin: 0;
 font-size: 1.125rem;
 font-weight: 600;
 color: var(--text-primary, #111827);
 }

 .close-btn {
 background: none;
 border: none;
 font-size: 1.5rem;
 cursor: pointer;
 color: var(--text-secondary, #6b7280);
 padding: 0.25rem;
 border-radius: 0.25rem;
 transition: all 0.2s;
 }

 .close-btn:hover {
 background: var(--bg-hover, #f3f4f6);
 color: var(--text-primary, #111827);
 }

 .mobile-nav-list {
 list-style: none;
 margin: 0;
 padding: 1rem 0;
 }

 .mobile-nav-item {
 margin-bottom: 0.25rem;
 }

 .mobile-nav-link {
 display: flex;
 align-items: center;
 gap: 1rem;
 padding: 1rem 1.5rem;
 text-decoration: none;
 color: var(--text-secondary, #6b7280);
 transition: all 0.2s;
 font-weight: 500;
 }

 .mobile-nav-link:hover,
 .mobile-nav-link.active {
 background: var(--bg-hover, #f3f4f6);
 color: var(--text-primary, #111827);
 }

 .mobile-nav-link.active {
 background: var(--accent-color, #3b82f6);
 color: white;
 }

 .mobile-nav-icon {
 font-size: 1.25rem;
 }

 /* Responsive adjustments */
 @media (max-width: 767px) {
 .nav-title {
 font-size: 1.125rem;
 }
 }
</style>
