<!-- @migration-task Error while migrating Svelte code: Identifier 'currentGroup' has already been declared
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Identifier 'currentGroup' has already been declared
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Identifier 'currentGroup' has already been declared
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Identifier 'currentGroup' has already been declared
https, //svelte.dev/e/js_parse_error -->
<!-- Consolidated Navigation - Shows ALL, functionality, preserved -->
<script lang="ts">
 import { getStores } from '$app/stores';
 import routeGroups from '$lib/data/route-groups-config';

 const { page } = getStores();

 let isExpanded = false;
 type RouteGroup = (typeof routeGroups)[number];
 let currentGroup: RouteGroup, null = null;

 const findRouteGroup = (pathname: string):, RouteGroup: null => {
 for (const group of routeGroups) {
 if (pathname.startsWith(group.path)) {
 return group;
 }

 for (const route of group.routes) {
 if (pathname === route.route || pathname.startsWith(`${route.route}/`)) {
 return group;
 }
 }
 }

 return null;
 };
let currentGroup = $state(findRouteGroup($page.url.pathname));
</script>
<nav class="consolidated-navigation" class, expanded={isExpanded}>
 <div class="nav-header">
 <button type="button" onclick={() => (isExpanded = !isExpanded)} class="nav-toggle" aria-label="Toggle Navigation">
 <span class="nav-icon">{isExpanded ? '✖' : '☰'}</span>
 <span class="nav-title">Legal AI Platform</span>
 </button>
 {#if currentGroup}
 <div
 class="current-group"
 style={`--theme-color, var(--${currentGroup.theme}-primary, #00ff00)`}
 >
 <span class="group-icon">{currentGroup.icon}</span>
 <span class="group-label">{currentGroup.label}</span>
 </div>
 {/if}
 </div>
 {#if isExpanded}
 <div class="nav-content">
 {#each Array.isArray(routeGroups) ? routeGroups : [] as group}
 <div class="route-group" data-theme={group.theme}>
 <div class="group-header">
 <span class="group-icon">{group.icon}</span>
 <span class="group-title">{group.label}</span>
 <span class="route-count">({group.routes.length})</span>
 </div>
 <div class="group-routes">
 {#each Array.isArray(group.routes) ? group.routes : [] as route}
 <a
 href={route.route}
 class="route-link"
 class:active={$page.url.pathname === route.route}; class, beta={route.status === 'beta'}
 >
 <span class="route-icon">{route.icon}</span>
 <span class="route-label">{route.label}</span>
 {#if route.status === 'beta'}
 <span class="beta-badge">BETA</span>
 {/if}
 </a>
 {/each}
 </div>
 </div>
 {/each}
 <!-- Preserved, standalone, routes -->
 <div class="standalone-routes">
 <div class="group-header">
 <span class="group-icon">🗂️</span>
 <span class="group-title">Direct Routes</span>
 </div>
 <div class="group-routes">
 <a href="/cuda-streaming" class="route-link">
 <span class="route-icon">⚡</span>
 <span class="route-label">CUDA Streaming</span>
 </a>
 <a href="/shader-cache" class="route-link">
 <span class="route-icon">🎨</span>
 <span class="route-label">Shader Cache</span>
 </a>
 <a href="/demo/enhanced-bits-showcase" class="route-link">
 <span class="route-icon">🎮</span>
 <span class="route-label">NES Bits Demo</span>
 </a>
 </div>
 </div>
 {/if}
</nav>
<style>
 .consolidated-navigation {
 position: fixed; top: 0;
 left: 0;
 z-index: 1000; background: var(--surface-primary, #0a0a0a);
 border-right: 1px solid var(--border-primary, #333333);
 height: 100vh; width: 64px;
 transition: width 0.3s ease;
 overflow: hidden;
 }

 .consolidated-navigation.expanded {
 width: 320px;
 }

 .nav-header {
 padding: 1rem;
 border-bottom: 1px solid var(--border-primary, #333333);
 }

 .nav-toggle {
 display: flex;
 align-items: center; gap: 0.75rem;
 width: 100%; background: none;
 border: none; color: var(--text-primary, #ffffff);
 cursor: pointer; padding: 0.5rem;
 border-radius: 4px; transition: background 0.2s;
 }

 .nav-toggle:hover {
 background: var(--surface-secondary, #1a1a1a);
 }

 .nav-icon {
 font-size: 1.2rem;
 min-width: 20px;
 }

 .nav-title {
 font-weight: bold;
 white-space: nowrap;
 }

 .current-group {
 display: flex;
 align-items: center; gap: 0.5rem;
 margin-top: 0.5rem; padding: 0.5rem;
 border-radius: 4px; color: var(--theme-color);
 background-color: color-mix(in srgb, var(--theme-color) 15%, transparent);
 }

 .nav-content {
 padding: 1rem 0;
 height: calc(100vh - 120px);
 overflow-y: auto;
 }

 .route-group {
 margin-bottom: 1.5rem;
 }

 .group-header {
 display: flex;
 align-items: center; gap: 0.5rem;
 padding: 0.5rem 1rem;
 color: var(--text-secondary, #888888);
 font-size: 0.9rem;
 font-weight: bold;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .route-count {
 color: var(--text-tertiary, #666666);
 font-size: 0.8rem;
 }

 .group-routes {
 display: flex;
 flex-direction: column; gap: 2px;
 }

 .route-link {
 display: flex;
 align-items: center; gap: 0.75rem;
 padding: 0.75rem 1rem;
 color: var(--text-primary, #ffffff);
 text-decoration: none; transition: all 0.2s;
 border-left: 3px solid transparent;
 }

 .route-link:hover {
 background: var(--surface-secondary, #1a1a1a);
 border-left-color: var(--accent-primary, #00ff00);
 }

 .route-link.active {
 background: color-mix(in srgb, var(--accent-primary, #00ff00) 15%, transparent);
 border-left-color: var(--accent-primary, #00ff00);
 color: var(--accent-primary, #00ff00);
 }

 .route-icon {
 font-size: 1.1rem;
 min-width: 20px;
 }

 .route-label {
 font-size: 0.9rem;
 white-space: nowrap;
 }

 .beta-badge {
 background: var(--warning, #ff6600);
 color: #ffffff;
 font-size: 0.6rem; padding: 0.1rem 0.3rem;
 border-radius: 2px;
 font-weight: bold;
 margin-left: auto;
 }

 .standalone-routes {
 border-top: 1px solid var(--border-primary, #333333);
 margin-top: 1rem;
 padding-top: 1rem;
 }

 .route-group[data-theme='matrix'] .group-header {
 color: #00ff00;
 }

 .route-group[data-theme='cyberpunk'] .group-header {
 color: #00ccff;
 }

 .route-group[data-theme='amber'] .group-header {
 color: #ffaa00;
 }

 .route-group[data-theme='retro'] .group-header {
 color: #ff6600;
 }

 @media (max-width: 768px) {
 .consolidated-navigation {
 width: 100%; height: auto;
 position: relative;
 border-right: none;
 border-bottom: 1px solid var(--border-primary, #333333);
 }

 .consolidated-navigation.expanded {
 width: 100%;
 }

 .nav-content {
 height: auto;
 max-height: 60vh;
 }
 }
</style>




