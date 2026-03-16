<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import CaseDocumentWriter from '$lib/components/legal-ai/CaseDocumentWriter.svelte';
	import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
	import LegalCorpusSearch from '$lib/components/LegalCorpusSearch.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { notificationStore } from '$lib/stores/unified/notification-store.svelte.js';
	import OfflineIndicator from '$lib/components/cache/OfflineIndicator.svelte';
	import { initTypingDetector } from '$lib/utils/telemetry.js';

	interface Props {
		data: LayoutData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();
	let showDocumentWriter = $state(false);
	let showShortcuts = $state(false);

	// Dynamic imports to avoid SSR TDZ crashes (browser-only components)
	let AccessibilityPanel = $state<typeof import('$lib/components/ui/AccessibilityPanel.svelte').default | null>(null);
	let AIChatWidget = $state<typeof import('$lib/components/ai/AIChatWidget.svelte').default | null>(null);
	let SetupWizard = $state<typeof import('$lib/components/onboarding/SetupWizard.svelte').default | null>(null);
	let KeyboardShortcutsPanel = $state<typeof import('$lib/components/KeyboardShortcutsPanel.svelte').default | null>(null);
	onMount(async () => {
		try {
			const [accMod, chatMod, wizardMod, shortcutsMod] = await Promise.all([
				import('$lib/components/ui/AccessibilityPanel.svelte').catch(() => null),
				import('$lib/components/ai/AIChatWidget.svelte').catch(() => null),
				import('$lib/components/onboarding/SetupWizard.svelte').catch(() => null),
				import('$lib/components/KeyboardShortcutsPanel.svelte').catch(() => null),
			]);
			if (accMod) AccessibilityPanel = accMod.default;
			if (chatMod) AIChatWidget = chatMod.default;
			if (wizardMod) SetupWizard = wizardMod.default;
			if (shortcutsMod) KeyboardShortcutsPanel = shortcutsMod.default;
		} catch { /* non-fatal: optional UI components */ }
	});

	// Initialize user activity telemetry (typing/idle detection)
	$effect(() => {
		if (browser) {
			let sid = sessionStorage.getItem('yorha-session-id');
			if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('yorha-session-id', sid); }
			const sessionId = sid;
			initTypingDetector(() => sessionId, () => data.user?.id ?? undefined);
		}
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
			e.preventDefault();
			showDocumentWriter = !showDocumentWriter;
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
	<AIChatWidget />
{/if}
{#if SetupWizard}
	<SetupWizard />
{/if}
{#if KeyboardShortcutsPanel}
	<KeyboardShortcutsPanel bind:open={showShortcuts} />
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
		background: #ecc94b;
		color: #000;
		padding: 0.375rem 1rem;
		text-align: center;
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		letter-spacing: 0.05em;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.app-content {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

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
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		font-family: 'JetBrains Mono', monospace;
		box-shadow: 0 4px 12px rgba(0,0,0,0.3);
		animation: toast-in 0.2s ease-out;
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(1rem); }
		to { opacity: 1; transform: translateX(0); }
	}

	.toast-info { background: #1a2332; color: #63b3ed; border: 1px solid #63b3ed40; }
	.toast-success { background: #1a2e1a; color: #48bb78; border: 1px solid #48bb7840; }
	.toast-warning { background: #2e2a1a; color: #ecc94b; border: 1px solid #ecc94b40; }
	.toast-error { background: #2e1a1a; color: #f56565; border: 1px solid #f5656540; }

	.toast-msg { flex: 1; }

	.toast-dismiss {
		background: none;
		border: none;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0;
		line-height: 1;
	}
	.toast-dismiss:hover { opacity: 1; }
</style>
