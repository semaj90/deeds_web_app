<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
	import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
	import LegalCorpusSearch from '$lib/components/LegalCorpusSearch.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { notificationStore } from '$lib/stores/unified/notification-store.svelte.js';
	import { authStore } from '$lib/stores/auth-store.svelte.js';
	import OfflineIndicator from '$lib/components/cache/OfflineIndicator.svelte';
	import Breadcrumbs from '$lib/components/ui/Breadcrumbs.svelte';
	import { initTypingDetector } from '$lib/utils/telemetry.js';
	import { analytics } from '$lib/stores/analytics.svelte.js';
	import { analysisPanel } from '$lib/stores/analysis-panel.svelte.js';

	interface Props {
		data: LayoutData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();
	let showDocumentWriter = $state(false);
	let showShortcuts = $state(false);
	let showAnalysisPanel = $state(false);
	let currentPathname = $derived(page.url.pathname);

	// Dynamic imports to avoid SSR TDZ crashes (browser-only components)
	let AccessibilityPanel = $state<typeof import('$lib/components/ui/AccessibilityPanel.svelte').default | null>(null);
	let AIChatWidget = $state<typeof import('$lib/components/ai/AIChatWidget.svelte').default | null>(null);
	let SetupWizard = $state<typeof import('$lib/components/onboarding/SetupWizard.svelte').default | null>(null);
	let KeyboardShortcutsPanel = $state<typeof import('$lib/components/KeyboardShortcutsPanel.svelte').default | null>(null);
	let AnalysisPanelComp = $state<typeof import('$lib/components/analysis/AnalysisPanel.svelte').default | null>(null);
	onMount(() => {
		// Dynamic imports (async, no cleanup return)
		Promise.all([
			import('$lib/components/ui/AccessibilityPanel.svelte').catch(() => null),
			import('$lib/components/ai/AIChatWidget.svelte').catch(() => null),
			import('$lib/components/onboarding/SetupWizard.svelte').catch(() => null),
			import('$lib/components/KeyboardShortcutsPanel.svelte').catch(() => null),
			import('$lib/components/analysis/AnalysisPanel.svelte').catch(() => null),
		]).then(([accMod, chatMod, wizardMod, shortcutsMod, analysisMod]) => {
			if (accMod) AccessibilityPanel = accMod.default;
			if (chatMod) AIChatWidget = chatMod.default;
			if (wizardMod) SetupWizard = wizardMod.default;
			if (shortcutsMod) KeyboardShortcutsPanel = shortcutsMod.default;
			if (analysisMod) AnalysisPanelComp = analysisMod.default;
		}).catch(() => { /* non-fatal: optional UI components */ });

		const handleOpenAnalysis = () => { showAnalysisPanel = true; };
		window.addEventListener('yorha:open-analysis', handleOpenAnalysis);
		return () => window.removeEventListener('yorha:open-analysis', handleOpenAnalysis);
	});

	// Hydrate client-side auth store from server layout data (avoids extra /api/auth/me fetch)
	$effect(() => {
		if (data.user) {
			authStore.session = {
				user: data.user as import('$lib/stores/auth-store.svelte').AuthUser,
				session: { id: 'server-hydrated', expiresAt: '' }
			};
		} else {
			authStore.session = null;
		}
	});

	// Initialize user activity telemetry (typing/idle detection) + analytics
	$effect(() => {
		if (browser) {
			let sid = sessionStorage.getItem('yorha-session-id');
			if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('yorha-session-id', sid); }
			const sessionId = sid;
			initTypingDetector(() => sessionId, () => data.user?.id ?? undefined);
			analytics.init(data.user?.id);
		}
	});

	// Track page views on navigation + update analysis panel context
	$effect(() => {
		if (browser) {
			analytics.trackPageView(currentPathname);
			analysisPanel.setRoute(currentPathname);
		}
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
			e.preventDefault();
			showDocumentWriter = !showDocumentWriter;
		}
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'g') {
			e.preventDefault();
			showAnalysisPanel = !showAnalysisPanel;
		}
		// ? key toggles keyboard shortcuts panel (only when not typing in an input)
		if (e.key === '?' && !e.ctrlKey && !e.altKey) {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target as HTMLElement)?.isContentEditable) {
				e.preventDefault();
				showShortcuts = !showShortcuts;
			}
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if data.devBypass}
	<div class="dev-banner">
		DEV MODE: Authentication bypassed (DEV_BYPASS_AUTH=true)
	</div>
{/if}

<!-- Skip to main content (WCAG 2.4.1) -->
<a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-white focus:outline-none">
	Skip to main content
</a>

<!-- Main Content (Sidebar is in root layout) -->
<main id="main-content" class="app-content">
	<div class="breadcrumb-bar">
		<Breadcrumbs />
	</div>
	<ErrorBoundary showDetails={data.devBypass}>
		{@render children?.()}
	</ErrorBoundary>
</main>

<CaseDocumentWriter bind:isOpen={showDocumentWriter} />
<CodebaseSearch />
<LegalCorpusSearch />
<OfflineIndicator />
{#if AccessibilityPanel}
	<AccessibilityPanel />
{/if}
{#if AIChatWidget}
	<AIChatWidget currentRoute={currentPathname} />
{/if}
{#if SetupWizard && data.user}
	<SetupWizard
		isAuthenticated={data.isAuthenticated}
		userId={data.user.id}
		initialHasCompletedOnboarding={data.user.hasCompletedOnboarding ?? true}
		initialOnboardingStep={data.user.onboardingStep ?? 0}
	/>
{/if}
{#if KeyboardShortcutsPanel}
	<KeyboardShortcutsPanel bind:open={showShortcuts} />
{/if}
{#if AnalysisPanelComp}
	<AnalysisPanelComp bind:open={showAnalysisPanel} />
{/if}

<!-- Toast Notifications Overlay -->
{#if notificationStore.toasts.length > 0}
	<div class="toast-container">
		{#each notificationStore.toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}" role="alert">
				<span class="toast-msg">{toast.message}</span>
				<button class="toast-dismiss" onclick={() => notificationStore.dismissToast(toast.id)} aria-label="Dismiss">&times;</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.dev-banner {
		background: rgba(12, 18, 31, 0.65);
		color: rgba(255, 221, 145, 0.96);
		border-bottom: none;
		padding: 0.375rem 1rem;
		text-align: center;
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		letter-spacing: 0.08em;
		position: sticky;
		top: 0;
		z-index: 100;
		backdrop-filter: blur(12px);
	}

	.app-content {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.breadcrumb-bar {
		padding: 0.5rem 2rem 0.25rem;
		border-bottom: none;
		background: linear-gradient(180deg, rgba(9, 14, 23, 0.48) 0%, transparent 100%);
		backdrop-filter: blur(18px);
	}

	/* ═══ Toast Notifications ═══ */
	.toast-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 360px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		border: none;
		box-shadow:
			0 18px 34px rgba(0, 0, 0, 0.35);
		animation: toast-in 0.35s cubic-bezier(0.22, 1, 0.36, 1);
		backdrop-filter: blur(16px);
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(1rem) scale(0.96); }
		to { opacity: 1; transform: translateX(0) scale(1); }
	}

	.toast-info {
		background: rgba(14, 27, 44, 0.75);
		color: #8adfff;
	}
	.toast-success {
		background: rgba(11, 32, 26, 0.75);
		color: #7df0ba;
	}
	.toast-warning {
		background: rgba(34, 25, 11, 0.75);
		color: #ffd479;
	}
	.toast-error {
		background: rgba(40, 16, 22, 0.75);
		color: #ff99a3;
	}

	.toast-msg { flex: 1; }

	.toast-dismiss {
		background: none;
		border: none;
		color: inherit;
		opacity: 0.4;
		cursor: pointer;
		font-size: 1.125rem;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 999px;
		transition: opacity 0.15s ease;
	}
	.toast-dismiss:hover { opacity: 0.9; }
</style>
