<script lang="ts">
    import '../app.postcss';
    import 'uno.css';
    import { appState, cleanupStores, initializeStores } from '$lib/stores';
    import type { Snippet } from 'svelte';
    import { onMount } from 'svelte';
    import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
    import YorhaSidebar from '$lib/components/layout/YorhaSidebar.svelte';
    import { notificationStore } from '$lib/stores/notifications.svelte';
    import { analytics } from '$lib/stores/analytics.svelte';
    import { page } from '$app/state';
    import { toast } from 'svelte-sonner';
    import { browser } from '$app/environment';

    let { children, data }: { children: Snippet; data: { user?: { id: string } | null } } = $props();
    let showDocumentWriter = $state(false);
    let mounted = $state(false);

    function handleGlobalKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            showDocumentWriter = !showDocumentWriter;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            showCommandPalette = !showCommandPalette;
        }
    }

    import GlobalCommandPalette from '$lib/components/ui/GlobalCommandPalette.svelte';
    let showCommandPalette = $state(false);

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

    // Track page views automatically
    $effect(() => {
        if (browser) {
            analytics.trackPageView(page.url.pathname);
        }
    });

    import CaseOverviewModal from '$lib/components/cases/CaseOverviewModal.svelte';
    import DocumentDetailModal from '$lib/components/DocumentDetailModal.svelte';
    import AIAssistantButton from '$lib/components/ai/AIAssistantButton.svelte';
    import FloatingChatModal from '$lib/components/ai/FloatingChatModal.svelte';
    import CitationSaveTooltip from '$lib/components/legal/CitationSaveTooltip.svelte';

    let showAIChat = $state(false);

    // Extract caseId from URL when on a case route (/cases/[id]/...)
    let activeCaseId = $derived.by(() => {
        const match = page.url.pathname.match(/^\/cases\/([a-f0-9-]+)/i);
        return match?.[1] ?? undefined;
    });

    onMount(() => {
        mounted = true;
        analytics.init(data?.user?.id);
        return () => {
            analytics.destroy();
            cleanupStores();
        };
    });

    function closeCaseModal() {
        history.back();
    }

    function closeDocumentModal() {
        history.back();
    }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />
<GlobalCommandPalette bind:open={showCommandPalette} />

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
    <CitationSaveTooltip caseId={activeCaseId} />
    <CaseDocumentWriter bind:isOpen={showDocumentWriter} />
    <AIAssistantButton
        variant="floating"
        position="bottom-right"
        onclick={() => showAIChat = !showAIChat}
    />
    <FloatingChatModal bind:open={showAIChat} caseId={activeCaseId} currentRoute={page.url.pathname} />
{/if}

{#if page.state.showCaseModal && page.state.caseId}
    <CaseOverviewModal
        id={page.state.caseId}
        onClose={closeCaseModal}
    />
{/if}

{#if page.state.showDocumentModal && page.state.documentId}
    <DocumentDetailModal
        id={page.state.documentId}
        onClose={closeDocumentModal}
    />
{/if}

<style>
    :global(:root) {
        /* Shell vars — bridged to unified theme contract (--t-*) */
        --shell-base: var(--t-bg, #060a12);
        --shell-base-elevated: var(--t-bg-elevated, #0d1423);
        --shell-base-deep: var(--t-panel-2, #121b30);
        --shell-surface: var(--t-panel, rgba(17, 24, 39, 0.82));
        --shell-surface-strong: var(--t-panel-2, rgba(17, 24, 39, 0.94));
        --shell-border: var(--t-border, rgba(120, 160, 220, 0.18));
        --shell-border-strong: var(--t-accent-2, rgba(126, 231, 255, 0.28));
        --shell-text: var(--t-text, rgba(233, 240, 255, 0.88));
        --shell-text-soft: var(--t-text-muted, rgba(184, 198, 226, 0.72));
        --shell-muted: var(--t-text-muted, rgba(140, 160, 199, 0.52));
        --shell-accent: var(--t-accent-2, #7ee7ff);
        --shell-accent-strong: var(--t-accent, #53b7ff);
        --shell-warm: var(--t-accent, #ffd479);
        --shell-success: var(--t-success, #53e2a4);
        --shell-danger: var(--t-danger, #ff6b78);
        --shell-radius-sm: 12px;
        --shell-radius-md: 18px;
        --shell-radius-lg: 24px;
        --shell-radius-curve: 26px 26px 18px 18px / 22px 22px 30px 30px;
    }

    :global(body) {
        background: var(--t-bg, #060a12);
        color: var(--t-text, var(--shell-text));
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
        background:
            radial-gradient(circle at top left, rgba(126, 231, 255, 0.14), transparent 30%),
            radial-gradient(circle at top right, rgba(255, 212, 121, 0.12), transparent 24%),
            radial-gradient(circle at bottom right, rgba(83, 183, 255, 0.12), transparent 30%),
            linear-gradient(180deg, #101728 0%, #0a0f1c 52%, #060910 100%);
        position: relative;
    }

    :global(body:has(.yorha-sidebar.collapsed)) .app-shell {
        padding-left: 60px;
    }

    .app-shell::before {
        content: '';
        position: fixed;
        inset: 0 0 0 210px;
        pointer-events: none;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 32%),
            repeating-linear-gradient(
                0deg,
                rgba(126, 231, 255, 0.02),
                rgba(126, 231, 255, 0.02) 1px,
                transparent 1px,
                transparent 7px
            );
        mix-blend-mode: screen;
        opacity: 0.45;
        transition: inset 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :global(body:has(.yorha-sidebar.collapsed)) .app-shell::before {
		inset: 0 0 0 60px;
    }

    .main-content {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
		position: relative;
		z-index: 1;
    }

    .content {
        flex: 1;
		padding: 2rem 2.5rem;
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

    /* ═══ Global Reset & Foundations ═══ */
    :global(*) {
        box-sizing: border-box;
    }

    :global(html) {
        scroll-behavior: smooth;
    }

    /* Branded text selection */
    :global(::selection) {
        background: rgba(126, 231, 255, 0.22);
        color: #f5fbff;
    }

    /* Accessible focus ring — visible only on keyboard nav */
    :global(:focus-visible) {
        outline: 2px solid rgba(126, 231, 255, 0.42);
        outline-offset: 2px;
    }

    /* Inputs handle their own focus styles */
    :global(input:focus-visible),
    :global(textarea:focus-visible),
    :global(select:focus-visible) {
        outline: none;
    }

    /* Typography Hierarchy */
    :global(h1) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #e8e4c8;
        margin: 0 0 1.5rem 0;
        line-height: 1.2;
    }

    :global(h2) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #ddd7b8;
        margin: 0 0 1rem 0;
        line-height: 1.3;
    }

    :global(h3) {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #c9c39f;
        margin: 0 0 0.75rem 0;
        line-height: 1.4;
    }

    :global(h4, h5, h6) {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #bdb691;
        margin: 0 0 0.5rem 0;
    }

    :global(p) {
        font-family: 'JetBrains Mono', monospace;
		color: var(--shell-text-soft);
        margin: 0 0 1rem 0;
        line-height: 1.6;
    }

    /* Professional Panels & Cards */
    :global(.panel),
    :global(.card),
    :global([class*="panel"]) {
        background: linear-gradient(180deg, rgba(23, 31, 48, 0.95) 0%, rgba(10, 15, 25, 0.98) 100%);
        border: 1px solid var(--shell-border);
        border-radius: var(--shell-radius-lg);
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(126, 231, 255, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        color: var(--shell-text);
        padding: 1.5rem;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :global(.panel:hover),
    :global(.card:hover) {
        box-shadow:
            0 24px 48px rgba(0, 0, 0, 0.38),
            0 0 0 1px rgba(126, 231, 255, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        border-color: var(--shell-border-strong);
        transform: translateY(-1px);
    }

    /* Professional Input Styling */
    :global(input),
    :global(textarea),
    :global(select) {
        background: linear-gradient(180deg, rgba(8, 12, 20, 0.92) 0%, rgba(14, 19, 31, 0.96) 100%);
        border: 1px solid var(--shell-border);
        border-radius: var(--shell-radius-sm);
        color: var(--shell-text);
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.875rem;
        padding: 0.75rem 1rem;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.04),
            inset 0 -1px 0 rgba(255, 255, 255, 0.02),
            0 10px 20px rgba(0, 0, 0, 0.12);
    }

    :global(input:focus),
    :global(textarea:focus),
    :global(select:focus) {
        outline: none;
        border-color: var(--shell-border-strong);
        box-shadow:
            0 0 0 3px rgba(126, 231, 255, 0.12),
            0 10px 24px rgba(0, 0, 0, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    :global(input::placeholder),
    :global(textarea::placeholder) {
		color: var(--shell-muted);
    }

    :global(input[type='file']) {
		padding: 0.625rem;
		border-style: dashed;
		background: linear-gradient(180deg, rgba(10, 15, 25, 0.88) 0%, rgba(19, 27, 42, 0.92) 100%);
    }

    :global(input[type='file']::file-selector-button) {
		margin-right: 0.85rem;
		padding: 0.625rem 1rem;
		border: 1px solid var(--shell-border);
		border-radius: 999px;
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.18) 0%, rgba(83, 183, 255, 0.18) 100%);
		color: var(--shell-text);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
    }

    :global(input[type='file']::file-selector-button:hover) {
		border-color: var(--shell-border-strong);
		background: linear-gradient(135deg, rgba(126, 231, 255, 0.26) 0%, rgba(255, 212, 121, 0.18) 100%);
    }

    /* Professional Button Styling */
    :global(button),
    :global(a[class*="btn"]),
    :global(a.empty-action) {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.55rem;
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
		border: 1px solid var(--shell-border);
        border-radius: var(--shell-radius-md);
		background: linear-gradient(180deg, rgba(24, 33, 50, 0.96) 0%, rgba(11, 15, 25, 0.98) 100%);
		color: var(--shell-text);
        padding: 0.75rem 1.5rem;
        cursor: pointer;
        text-decoration: none;
        border-bottom: none;
        overflow: hidden;
        isolation: isolate;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow:
			0 14px 26px rgba(0, 0, 0, 0.22),
			0 0 0 1px rgba(126, 231, 255, 0.04),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    :global(button)::before,
    :global(a[class*="btn"])::before,
    :global(a.empty-action)::before {
        content: '';
        position: absolute;
        inset: 1px;
        border-radius: calc(var(--shell-radius-md) - 4px);
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 38%),
            linear-gradient(90deg, rgba(126, 231, 255, 0.08), transparent 42%, rgba(255, 212, 121, 0.06));
        pointer-events: none;
    }

    :global(button:hover:not(:disabled)),
    :global(a[class*="btn"]:hover),
    :global(a.empty-action:hover) {
        background: linear-gradient(180deg, rgba(34, 46, 70, 0.98) 0%, rgba(15, 21, 33, 1) 100%);
        border-color: var(--shell-border-strong);
        box-shadow:
            0 18px 34px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(126, 231, 255, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
        transform: translateY(-1px);
    }

    :global(button:active:not(:disabled)) {
        transform: translateY(1px) scale(0.98);
        box-shadow:
            0 0px 1px rgba(0, 0, 0, 0.4),
            inset 0 2px 4px rgba(0, 0, 0, 0.15);
        transition-duration: 0.05s;
    }

    :global(button:disabled) {
        opacity: 0.35;
        cursor: not-allowed;
        filter: grayscale(0.3);
    }

    /* Danger Button */
    :global(button.danger),
    :global(button[class*="btn-danger"]) {
        background: linear-gradient(135deg, #ff7585 0%, #ff5b71 48%, #db3d58 100%);
        color: #fff;
        border-color: rgba(255, 107, 120, 0.45);
    }

    :global(button.danger:hover:not(:disabled)),
    :global(button[class*="btn-danger"]:hover:not(:disabled)) {
        background: linear-gradient(135deg, #ff8a97 0%, #ff6074 48%, #e0445f 100%);
        box-shadow: 0 18px 32px rgba(255, 91, 113, 0.18);
    }

    /* Primary Button Variant */
    :global(button.primary),
    :global(button[class*="btn-primary"]) {
        background: linear-gradient(135deg, #7ee7ff 0%, #53b7ff 45%, #ffd479 100%);
        color: #06101b;
        border-color: rgba(255, 255, 255, 0.2);
        font-weight: 700;
    }

    :global(button.primary:hover:not(:disabled)),
    :global(button[class*="btn-primary"]:hover:not(:disabled)) {
        background: linear-gradient(135deg, #98efff 0%, #69c2ff 45%, #ffe08f 100%);
        box-shadow:
            0 18px 34px rgba(0, 0, 0, 0.22),
            0 0 26px rgba(126, 231, 255, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
    }

    /* Link Styling */
    :global(a) {
        color: rgba(183, 224, 255, 0.88);
        text-decoration: none;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 500;
		border-bottom: 1px solid rgba(126, 231, 255, 0.16);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :global(a:hover) {
		border-bottom-color: rgba(126, 231, 255, 0.45);
		color: #f6fbff;
    }

    :global(a:active) {
        opacity: 0.7;
    }

    /* Professional Scrollbar */
    :global(::-webkit-scrollbar) {
        width: 10px;
        height: 10px;
    }

    :global(::-webkit-scrollbar-track) {
		background: rgba(255, 255, 255, 0.03);
        border-radius: 5px;
    }

    :global(::-webkit-scrollbar-thumb) {
		background: linear-gradient(180deg, rgba(83, 183, 255, 0.42) 0%, rgba(120, 160, 220, 0.46) 100%);
        border-radius: 5px;
        border: 2px solid transparent;
        background-clip: padding-box;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
		background: linear-gradient(180deg, rgba(126, 231, 255, 0.52) 0%, rgba(255, 212, 121, 0.42) 100%);
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
        background: linear-gradient(135deg, rgba(22, 31, 48, 0.98) 0%, rgba(14, 20, 32, 1) 100%);
        color: rgba(213, 233, 255, 0.88);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 2px solid rgba(126, 231, 255, 0.14);
    }

    :global(td) {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid rgba(120, 160, 220, 0.12);
        color: rgba(214, 226, 248, 0.82);
    }

    :global(tr:nth-child(even)) {
        background: rgba(120, 160, 220, 0.025);
    }

    :global(tr:hover) {
        background: rgba(126, 231, 255, 0.06);
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
        background: rgba(212, 199, 163, 0.08);
        border: 1px solid rgba(212, 199, 163, 0.15);
        color: #d4c7a5;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }

    /* ═══ Loading & Skeleton States ═══ */
    :global(.loading) {
        opacity: 0.45;
        pointer-events: none;
        animation: shimmer 2s ease-in-out infinite;
    }

    @keyframes shimmer {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 0.65; }
    }

    :global(.skeleton) {
        background: linear-gradient(
            90deg,
            rgba(212, 199, 163, 0.04) 25%,
            rgba(212, 199, 163, 0.08) 50%,
            rgba(212, 199, 163, 0.04) 75%
        );
        background-size: 200% 100%;
        animation: skeletonWave 1.8s ease-in-out infinite;
        border-radius: 6px;
    }

    @keyframes skeletonWave {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }

    /* ═══ Semantic Status Colors ═══ */
    :global(.text-success) { color: #4ade80; }
    :global(.text-warning) { color: #fbbf24; }
    :global(.text-danger)  { color: #f87171; }
    :global(.text-info)    { color: #60a5fa; }
    :global(.text-muted)   { color: rgba(212, 199, 165, 0.4); }

    /* ═══ Fade-in for page content ═══ */
    :global(.fade-in) {
        animation: fadeIn 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Mobile Responsiveness */
    @media (max-width: 768px) {
        .content {
            padding: 1.5rem;
        }

		.app-shell::before {
            inset: 0 0 0 60px;
		}

        :global(h1) {
            font-size: 1.5rem;
        }

        :global(h2) {
            font-size: 1.25rem;
        }
    }
</style>