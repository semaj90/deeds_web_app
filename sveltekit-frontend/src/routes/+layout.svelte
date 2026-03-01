<script lang="ts">
    import { appState, cleanupStores, initializeStores, tokenTracker, userPrefs } from '$lib/stores';
    import type { Snippet } from 'svelte';
    import { onMount } from 'svelte';
    import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
    import YorhaSidebar from '$lib/components/layout/YorhaSidebar.svelte';

    let { children }: { children: Snippet } = $props();
    let showDocumentWriter = $state(false);
    let mounted = $state(false);

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            showDocumentWriter = !showDocumentWriter;
        }
    }

    // Import webgpu modules dynamically to avoid SSR issues
    let webgpu: any = null;
    let cpuFallback: any = null;
    let webgpuReady = $state(false);
    let cpuFallbackReady = $state(false);

    $effect(() => {
        // Initialize Phase 76 Barrel Stores
        initializeStores();

        (async () => {
            try {
                const webgpuModule = await import('$lib/webgpu/webgpu-init');
                webgpu = webgpuModule.webgpu;
                await webgpu.initialize();
                webgpuReady = true;
            } catch (error) {
                console.warn('WebGPU initialization failed:', error);
            }

            try {
                const cpuFallbackModule = await import('$lib/webgpu/webgpu-cpu-fallback');
                cpuFallback = cpuFallbackModule.cpuFallback;
                await cpuFallback.initialize();
                cpuFallbackReady = true;
            } catch (error) {
                console.warn('CPU fallback initialization failed:', error);
            }
        })();
    });

    onMount(() => {
        mounted = true;
        return () => {
            cleanupStores();
        };
    });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- YoRHa Detective Sidebar -->
<YorhaSidebar />

<!-- Main Content Area -->
<div class="app-shell">
    <main class="main-content">
        {#if appState.globalError}
            <div class="error-toast">{appState.globalError}</div>
        {/if}

        <div class="content">
            {@render children()}
        </div>
    </main>
</div>

{#if mounted}
    <CaseDocumentWriter bind:isOpen={showDocumentWriter} />
{/if}

<style>
    :global(body) {
        background: #d4c9a9;
        color: #0f0f0f;
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        margin: 0;
        padding: 0;
        overflow-x: hidden;
    }

    .app-shell {
        min-height: 100vh;
        padding-left: 210px; /* Sidebar width */
        transition: padding-left 0.3s ease;
        background: #d4c9a9;
    }

    /* Adjust for collapsed sidebar */
    :global(body:has(.yorha-sidebar.collapsed)) .app-shell {
        padding-left: 60px;
    }

    .main-content {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: #d4c9a9;
    }

    .content {
        flex: 1;
        padding: 2rem;
        max-width: 100%;
        background: #d4c9a9;
    }

    .error-toast {
        position: fixed;
        top: 1rem;
        right: 1rem;
        background: #ff4444;
        color: white;
        padding: 1rem;
        border-radius: 4px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 9999;
        font-family: 'JetBrains Mono', monospace;
    }

    /* Global YoRHa styling for all child elements */
    :global(*) {
        box-sizing: border-box;
    }

    :global(h1, h2, h3, h4, h5, h6) {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #0f0f0f;
    }

    :global(p, span, div) {
        font-family: 'JetBrains Mono', monospace;
        color: #0f0f0f;
    }

    /* Ensure panels and cards inherit the theme */
    :global(.panel, .card, .container) {
        background: #b8b5a8;
        border: 2px solid #000;
        color: #0f0f0f;
    }

    /* Input styling */
    :global(input, textarea, select) {
        background: #fff;
        border: 1px solid #000;
        color: #0f0f0f;
        font-family: 'JetBrains Mono', monospace;
        padding: 0.5rem;
    }

    :global(input:focus, textarea:focus, select:focus) {
        outline: 2px solid #000;
        outline-offset: 2px;
    }

    /* Button base styling */
    :global(button) {
        font-family: 'JetBrains Mono', monospace;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border: 1px solid #000;
        background: #b8b5a8;
        color: #0f0f0f;
        cursor: pointer;
        transition: all 0.2s;
    }

    :global(button:hover) {
        background: rgba(0, 0, 0, 0.1);
    }

    /* Link styling */
    :global(a) {
        color: #0f0f0f;
        text-decoration: underline;
        font-family: 'JetBrains Mono', monospace;
    }

    :global(a:hover) {
        text-decoration: none;
        opacity: 0.8;
    }

    /* Scrollbar styling */
    :global(::-webkit-scrollbar) {
        width: 8px;
        height: 8px;
    }

    :global(::-webkit-scrollbar-track) {
        background: rgba(0, 0, 0, 0.1);
    }

    :global(::-webkit-scrollbar-thumb) {
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
        background: rgba(0, 0, 0, 0.5);
    }
</style>