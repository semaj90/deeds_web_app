<script lang="ts">
    import { appState, cleanupStores, initializeStores, tokenTracker, userPrefs } from '$lib/stores';
    import type { Snippet } from 'svelte';
    import { onMount } from 'svelte';
    import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
    import YorhaSidebar from '$lib/components/layout/YorhaSidebar.svelte';
    import { Toaster } from 'svelte-sonner';
    import { notificationStore } from '$lib/stores/notifications.svelte';
    import { toast } from 'svelte-sonner';

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

    // Bridge existing notificationStore → svelte-sonner toasts
    let lastNotificationCount = 0;
    $effect(() => {
        const notifications = notificationStore.notifications;
        if (notifications.length > lastNotificationCount) {
            const latest = notifications[notifications.length - 1];
            if (latest) {
                const toastFn = latest.type === 'error' ? toast.error
                    : latest.type === 'success' ? toast.success
                    : latest.type === 'warning' ? toast.warning
                    : toast.info;
                toastFn(latest.message, {
                    description: latest.title,
                    duration: latest.duration || 5000,
                });
            }
        }
        lastNotificationCount = notifications.length;
    });

    onMount(() => {
        mounted = true;
        return () => {
            cleanupStores();
        };
    });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- Toast notifications (svelte-sonner) -->
<Toaster
    position="top-right"
    richColors
    closeButton
    toastOptions={{
        style: 'font-family: "JetBrains Mono", monospace; font-size: 0.8125rem;'
    }}
/>

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
        background: linear-gradient(135deg, #d4c9a9 0%, #c9bfa0 100%);
        color: #1a1a1a;
        font-family: 'JetBrains Mono', 'Courier New', monospace;
        margin: 0;
        padding: 0;
        overflow-x: hidden;
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    .app-shell {
        min-height: 100vh;
        padding-left: 210px;
        transition: padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        background: linear-gradient(135deg, #d4c9a9 0%, #c9bfa0 100%);
    }

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
        padding: 2.5rem;
        max-width: 100%;
    }

    .error-toast {
        position: fixed;
        top: 1.5rem;
        right: 1.5rem;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.1);
        z-index: 9999;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.875rem;
        font-weight: 500;
        animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(2rem);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    /* Global Professional Styling */
    :global(*) {
        box-sizing: border-box;
    }

    /* Typography Hierarchy */
    :global(h1) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #1a1a1a;
        margin: 0 0 1.5rem 0;
        line-height: 1.2;
    }

    :global(h2) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #1a1a1a;
        margin: 0 0 1rem 0;
        line-height: 1.3;
    }

    :global(h3) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #2a2a2a;
        margin: 0 0 0.75rem 0;
        line-height: 1.4;
    }

    :global(h4, h5, h6) {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #2a2a2a;
        margin: 0 0 0.5rem 0;
    }

    :global(p) {
        font-family: 'JetBrains Mono', monospace;
        color: #1a1a1a;
        margin: 0 0 1rem 0;
        line-height: 1.6;
    }

    /* Professional Panels & Cards */
    :global(.panel),
    :global(.card),
    :global([class*="panel"]) {
        background: linear-gradient(135deg, #e8e4d8 0%, #ddd9cd 100%);
        border: 2px solid rgba(0, 0, 0, 0.15);
        border-radius: 8px;
        box-shadow:
            0 4px 6px rgba(0, 0, 0, 0.1),
            0 2px 4px rgba(0, 0, 0, 0.06),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        color: #1a1a1a;
        padding: 1.5rem;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :global(.panel:hover),
    :global(.card:hover) {
        box-shadow:
            0 10px 15px rgba(0, 0, 0, 0.15),
            0 4px 6px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        transform: translateY(-1px);
    }

    /* Professional Input Styling */
    :global(input),
    :global(textarea),
    :global(select) {
        background: #ffffff;
        border: 2px solid rgba(0, 0, 0, 0.2);
        border-radius: 6px;
        color: #1a1a1a;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.875rem;
        padding: 0.75rem 1rem;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
    }

    :global(input:focus),
    :global(textarea:focus),
    :global(select:focus) {
        outline: none;
        border-color: #1a1a1a;
        box-shadow:
            0 0 0 3px rgba(26, 26, 26, 0.1),
            inset 0 2px 4px rgba(0, 0, 0, 0.06);
    }

    :global(input::placeholder),
    :global(textarea::placeholder) {
        color: rgba(26, 26, 26, 0.4);
    }

    /* Professional Button Styling */
    :global(button) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border: 2px solid rgba(0, 0, 0, 0.2);
        border-radius: 6px;
        background: linear-gradient(135deg, #e8e4d8 0%, #ddd9cd 100%);
        color: #1a1a1a;
        padding: 0.75rem 1.5rem;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow:
            0 2px 4px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    :global(button:hover:not(:disabled)) {
        background: linear-gradient(135deg, #d4d0c4 0%, #c9c5b9 100%);
        border-color: rgba(0, 0, 0, 0.3);
        box-shadow:
            0 4px 6px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        transform: translateY(-1px);
    }

    :global(button:active:not(:disabled)) {
        transform: translateY(0);
        box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    :global(button:disabled) {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Primary Button Variant */
    :global(button.primary),
    :global(button[class*="btn-primary"]) {
        background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        color: #ffffff;
        border-color: rgba(0, 0, 0, 0.2);
        font-weight: 700;
    }

    :global(button.primary:hover:not(:disabled)),
    :global(button[class*="btn-primary"]:hover:not(:disabled)) {
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
        box-shadow:
            0 6px 8px rgba(34, 197, 94, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    /* Link Styling */
    :global(a) {
        color: #1a1a1a;
        text-decoration: none;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 500;
        border-bottom: 2px solid rgba(26, 26, 26, 0.2);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :global(a:hover) {
        border-bottom-color: #1a1a1a;
        opacity: 0.8;
    }

    /* Professional Scrollbar */
    :global(::-webkit-scrollbar) {
        width: 10px;
        height: 10px;
    }

    :global(::-webkit-scrollbar-track) {
        background: rgba(0, 0, 0, 0.05);
        border-radius: 5px;
    }

    :global(::-webkit-scrollbar-thumb) {
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.2) 100%);
        border-radius: 5px;
        border: 2px solid transparent;
        background-clip: padding-box;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
        background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.3) 100%);
        background-clip: padding-box;
    }

    /* Table Styling */
    :global(table) {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.875rem;
    }

    :global(th) {
        background: linear-gradient(135deg, #d4d0c4 0%, #c9c5b9 100%);
        color: #1a1a1a;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 2px solid rgba(0, 0, 0, 0.2);
    }

    :global(td) {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }

    :global(tr:hover) {
        background: rgba(0, 0, 0, 0.02);
    }

    /* Badge/Tag Styling */
    :global(.badge),
    :global(.tag),
    :global([class*="badge"]),
    :global([class*="tag"]) {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(0, 0, 0, 0.2);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    /* Loading/Spinner States */
    :global(.loading) {
        opacity: 0.6;
        pointer-events: none;
        animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 0.8; }
    }

    /* Mobile Responsiveness */
    @media (max-width: 768px) {
        .content {
            padding: 1.5rem;
        }

        :global(h1) {
            font-size: 1.5rem;
        }

        :global(h2) {
            font-size: 1.25rem;
        }
    }
</style>