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
    .app-shell {
        min-height: 100vh;
        padding-left: 210px; /* Sidebar width */
        transition: padding-left 0.3s ease;
    }

    /* Adjust for collapsed sidebar */
    :global(body:has(.yorha-sidebar.collapsed)) .app-shell {
        padding-left: 60px;
    }

    .main-content {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .content {
        flex: 1;
        padding: 2rem;
        max-width: 100%;
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
    }
</style>