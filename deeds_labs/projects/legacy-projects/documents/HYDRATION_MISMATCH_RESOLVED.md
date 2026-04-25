# Hydration Mismatch Error (SvelteKit 2)

A hydration mismatch happens when the HTML generated on the server (SSR) does not exactly match what Svelte expects to reconcile on the client during hydration.

## Common Causes
- Browser-only APIs (window, document, localStorage, matchMedia) used in a component's top-level (module or instance) script.
- Non-deterministic values in the initial template: Date.now(), Math.random(), new Date(), crypto APIs, UUIDs.
- Conditional blocks ({#if ...}) depending on client-only state (viewport width, prefers-color-scheme, localStorage flags).
- Data differences: server load() returns one value, client immediately mutates it before hydration completes.
- Timezone / locale formatting (Intl.DateTimeFormat, toLocaleString) differing between server and client.
- Order of arrays not fixed (e.g. Object.keys(obj) without guaranteed key order, random shuffles).
- Access to environment-dependent branches (e.g. process.env, import { dev } from '$app/environment') that diverge between server and client.
- Using crypto/random IDs for keyed each blocks during SSR.

## Quick Diagnosis
1. Observe the dev console warning: it usually pinpoints a node path.
2. View page source (server HTML) vs Elements panel (hydrated DOM).
3. Temporarily log suspicious values inside onMount to see what changed.
4. Strip sections progressively until mismatch disappears (binary search).

## Fix Patterns
- Gate browser-only logic:
    - import { onMount } from 'svelte'; and run inside onMount.
    - Or guard with import { browser } from '$app/environment' and only run imperative code when browser is true (avoid changing initial markup).
- Move async/data logic to +page.server.ts or +layout.server.ts load and pass deterministic props.
- Precompute stable IDs server-side; avoid Math.random()/crypto in markup.
- For responsive logic: render a universal fallback, then enhance after mount.
- Ensure consistent serialization: JSON.stringify on server, JSON.parse client, no lossy transforms.
- Avoid timezone-sensitive formatting in markup; produce a preformatted string in server load().
- Use stable keys in {#each}: data.id, not index or random().

## Anti-Pattern (Time-Based Value in Initial Markup)
<script>
    let ts = Date.now(); // Server vs client differ
</script>
<p>{ts}</p>

## Corrected
<script>
    import { onMount } from 'svelte';
    let ts;
    onMount(() => {
        ts = Date.now();
    });
</script>
<p>{ts ?? '...'}</p>

## Browser API Access
Bad:
<script>
    let w = window.innerWidth;
</script>

Better:
<script>
    import { onMount } from 'svelte';
    let w;
    onMount(() => w = window.innerWidth);
</script>

Or guarded (no markup difference introduced until value set):
<p>{w ?? '...'}</p>

## Using browser Flag
<script>
    import { browser } from '$app/environment';
    let theme = 'light';
    if (browser) {
        const saved = localStorage.getItem('theme');
        if (saved) theme = saved; // Might mismatch if server assumed 'light'
    }
</script>

Fix: derive a deterministic initial theme in server load() and pass as prop.

## Data Loading Pattern
+page.server.ts
export const load = async () => {
    const items = await fetch('https://api.example.com/items').then(r => r.json());
    return { items }; // Deterministic SSR snapshot
};

+page.svelte
<script>
    export let data;
    const { items } = data;
</script>
{#each items as item (item.id)}
    <p>{item.name}</p>
{/each}

Avoid immediate client refetch that mutates items before hydration finishes unless identical.

## Responsive / Client-Only Widgets
If a subtree must be client-only:
{#if browser}
    <ClientOnlyChart />
{/if}
Or (page-wide) you can disable SSR (only when acceptable):
<script>
    export const ssr = false; // Use sparingly
</script>

## Debug Checklist
Search codebase for:
- Date.now
- Math.random
- new Date
- crypto.
- window.
- document.
- localStorage
- UUID / nanoid
- toLocaleString / Intl.*
- Object.keys / Object.values ordering dependencies

Verify:
- load() server data equals initial client state.
- Feature flags / env values match (PUBLIC_ variables vs private).
- No mutation of props before hydration completes.

## Logging Mismatch Context (Manual Diff)
if (typeof document !== 'undefined') {
    window.__SSR_HTML__ = document.documentElement.outerHTML;
    // After a tick, compare a container's innerHTML if needed
    queueMicrotask(() => {
        // custom diff logic here if investigating deeply
    });
}

## When Suppression Is Acceptable
- Truly client-only experiences (e.g., dashboards) can set export const ssr = false.
- Isolate volatile widgets behind {#if browser} so SSR omits them entirely (no mismatch).

## Summary
Produce deterministic, environment-agnostic HTML during SSR. Defer any variability (time, randomness, viewport, storage, user agent) to onMount or guarded client-only branches. Keep server-provided data stable through first paint to eliminate hydration mismatches in SvelteKit 2.