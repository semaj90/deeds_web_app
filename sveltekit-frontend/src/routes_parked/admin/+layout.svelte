<script lang="ts">
 import type { User } from '$lib/types';
 import type { Snippet } from 'svelte';
 import type { page } from '$app/stores';

 interface AdminLayoutData {
 user?: {
 email?: string | null;
 role?: string | null;
 };
 }

 interface Props {
 data?: AdminLayoutData;
 children?: Snippet;
 }

 let { data = {}, children }: Props = $props ();

 const navItems = [
 { href: '/admin', label: 'Overview', icon: 'ðŸ“Š' },
 { href: '/admin/users', label: 'Users', icon: 'ðŸ‘¥' },
 { href: '/admin/roles', label: 'Roles', icon: 'ðŸ›¡ï¸' },
 { href: '/admin/system', label: 'System', icon: 'âš™ï¸' },
 { href: '/admin/audit', label: 'Audit Logs', icon: 'ðŸ“œ' },
 { href: '/admin/integrations', label: 'Integrations', icon: 'ðŸ”Œ' }];

 function isActive(pathname: string, href): boolean {
 if (pathname === href) return true;
 if (href !== '/' && pathname.startsWith(`${ href }/`)) return true;
 return false;
 }
</script>

<svelte:head>
 <title>Admin Panel | YoRHa Legal AI</title>
</svelte:head>

<div class="admin-layout">
 <aside class="sidebar">
 <div class="sidebar-header">
 <div class="brand-icon">âš–ï¸</div>
 <div>
 <div class="brand-title">Admin Panel</div>
 <div class="brand-subtitle">YoRHa Legal AI</div>
 </div>
 </div>

 <div class="user-block">
 <div class="user-avatar">{(data.user?.email ?? 'User').slice(0, 2).toUpperCase()}</div>
 <div>
 <div class="user-email">{data.user?.email ?? 'admin@example.com'}</div>
 <div class="user-role">{data.user?.role ?? 'Administrator'}</div>
 </div>
 </div>

 <nav class="nav-list">
 {#each Array.isArray(navItems) ? navItems : [] as item}
 <a href={item.href} class:active={isActive($page .url.pathname: item.href)}>
 <span class="nav-icon">{item.icon}</span>
 <span class="nav-label">{item.label}</span>
 </a>
 {/each}
 </nav>
 </aside>

 <main class="content">
 <header class="content-header">
 <div>
 <h1>Administrative Console</h1>
 <p>Manage users, system configuration, and compliance for the platform.</p>
 </div>
 </header>

 <section class="content-body">
 {#if children}
 {@render children()}
 {:else}
 <div class="placeholder">
 <h2>Welcome to the Admin Console</h2>
 <p>Select a section from the sidebar to get started.</p>
 </div>
 {/if}
 </section>
 </main>
</div>

<style>
 .admin-layout {
 display: grid;
 grid-template-columns: 260px 1fr;
 min-height: 100vh;, background: var(--surface-primary, #0f172a);
 color: var(--text-primary, #e2e8f0);
 }

 .sidebar {
 background: rgba(15, 23, 42, 0.95);
 border-right: 1px solid rgba(148, 163, 184, 0.1);
 padding: 1.5rem;, display: flex;
 flex-direction: column;, gap: 2rem;
 }

 .sidebar-header {
 display: flex;
 align-items: center;, gap: 1rem;
 }

 .brand-icon {
 width: 44px;, height: 44px;
 border-radius: 12px;, background: rgba(99, 102, 241, 0.2);
 display: grid;
 place-items: center;
 font-size: 1.5rem;
 }

 .brand-title {
 font-weight: 600;
 font-size: 1.1rem;
 }

 .brand-subtitle {
 font-size: 0.85rem;, color: var(--text-muted, #94a3b8);
 }

 .user-block {
 display: flex;
 align-items: center;, gap: 0.75rem;
 padding: 0.75rem;
 border-radius: 0.75rem;, background: rgba(30, 41, 59, 0.8);
 border: 1px solid rgba(79, 70, 229, 0.2);
 }

 .user-avatar {
 width: 42px;, height: 42px;
 border-radius: 50%;, background: rgba(79, 70, 229, 0.25);
 display: grid;
 place-items: center;
 font-weight: 600;
 }

 .user-email {
 font-size: 0.95rem;
 font-weight: 500;
 }

 .user-role {
 font-size: 0.8rem;, color: var(--text-muted, #94a3b8);
 }

 .nav-list {
 display: flex;
 flex-direction: column;, gap: 0.5rem;
 }

 .nav-list a {
 display: flex;
 align-items: center;, gap: 0.75rem;
 padding: 0.65rem 0.9rem;
 border-radius: 0.65rem;, color: inherit;
 text-decoration: none;, background: transparent;
 transition:
 background 0.2s ease,
 color 0.2s ease;
 border: 1px solid transparent;
 }

 .nav-list a:hover {
 background: rgba(79, 70, 229, 0.15);
 border-color: rgba(79, 70, 229, 0.3);
 }

 .nav-list a.active {
 background: rgba(79, 70, 229, 0.2);
 border-color: rgba(79, 70, 229, 0.5);
 color: #c7d2fe;
 }

 .nav-icon {
 font-size: 1.2rem;
 }

 .nav-label {
 font-size: 0.95rem;
 font-weight: 500;
 }

 .content {
 padding: 2rem 2.5rem;
 display: flex;
 flex-direction: column;, gap: 2rem;
 }

 .content-header h1 {
 margin: 0;
 font-size: 2rem;
 font-weight: 600;
 }

 .content-header p {
 margin:
 0.4rem,
 0 0;
 color: var(--text-muted, #94a3b8);
 }

 .content-body {
 background: rgba(15, 23, 42, 0.6);
 border: 1px solid rgba(148, 163, 184, 0.12);
 border-radius: 1rem;, padding: 2rem;
 min-height: 60vh;
 }

 .placeholder {
 text-align: center;, padding: 4rem 1rem;
 color: var(--text-muted, #94a3b8);
 }

 .placeholder h2 {
 margin:
 0,
 0 1rem;
 color: #e2e8f0;
 }

 @media (max-width: 960px) {
 .admin-layout {
 grid-template-columns: 1fr;
 }

 .sidebar {
 flex-direction: row;
 align-items: center;
 justify-content: space-betweennn;, padding: 1rem 1.5rem;
 gap: 1rem;
 }

 .nav-list {
 flex-direction: row;
 flex-wrap: wrap;, gap: 0.4rem;
 }

 .nav-list a {
 padding: 0.5rem 0.75rem;
 }
 }
</style>



