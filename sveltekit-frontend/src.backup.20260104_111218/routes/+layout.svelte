<script lang="ts">
    import { appState, cleanupStores, initializeStores, tokenTracker, userPrefs } from '$lib/stores';
    import type { Snippet } from 'svelte';
    import { onDestroy, onMount } from 'svelte';

    let { children }: { children: Snippet } = $props();

    // Import webgpu modules dynamically to avoid SSR issues
    let webgpu: any = null;
    let cpuFallback: any = null;
    let webgpuReady = $state(false);
    let cpuFallbackReady = $state(false);

    onMount(() => {
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

    onDestroy(() => {
        cleanupStores();
    });
</script>

<div class="app-shell" class:dark={userPrefs.theme === 'dark'}>
    <aside class:closed={!appState.isSidebarOpen}>
        <div class="status-panel">
            <h3>Legal AI Status</h3>
            <p>Tokens: {tokenTracker.percentageUsed.toFixed(1)}% used</p>
            <progress value={tokenTracker.percentageUsed} max="100"></progress>
        </div>

        <button onclick={() => userPrefs.toggleTheme()}>
            Toggle {userPrefs.theme === 'light' ? 'Dark' : 'Light'} Mode
        </button>
    </aside>

    <main>
        <header>
            <button onclick={() => appState.toggleSidebar()}>☰</button>
            {#if appState.globalError}
                <div class="error-toast">{appState.globalError}</div>
            {/if}
            <div class="header-title">YoRHa Legal AI</div>
        </header>

        <div class="content">
            {@render children()}
        </div>
    </main>
</div>

<style>
    .app-shell { display: flex; height: 100vh; font-family: monospace; }
    aside { width: 250px; background: #f0f0f0; padding: 1rem; transition: width 0.3s; border-right: 1px solid #ccc; }
    aside.closed { width: 0; padding: 0; overflow: hidden; border: none; }
    main { flex: 1; display: flex; flex-direction: column; }
    header { padding: 1rem; background: #e0e0e0; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid #ccc; }
    .content { flex: 1; overflow: auto; padding: 1rem; }

    .dark { background: #1a1a1a; color: #e0e0e0; }
    .dark aside { background: #2a2a2a; border-color: #444; }
    .dark header { background: #333; border-color: #444; }
    .dark button { background: #444; color: white; border: 1px solid #555; }

    .status-panel { margin-bottom: 2rem; }
    progress { width: 100%; }
    button { padding: 0.5rem 1rem; cursor: pointer; }
    .error-toast { background: #ff4444; color: white; padding: 0.5rem; border-radius: 4px; }
</style>
