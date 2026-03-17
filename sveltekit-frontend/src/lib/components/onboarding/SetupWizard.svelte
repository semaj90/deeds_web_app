<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface WizardStep {
		id: string;
		title: string;
		description: string;
		icon: string;
		targetSelector?: string;
		route?: string;
		action?: string;
		tip?: string;
	}

	const WIZARD_STEPS: WizardStep[] = [
		{
			id: 'welcome',
			title: 'Welcome to Legal AI Platform',
			description: 'Your intelligent legal case management system powered by AI. Let\'s take a quick tour to help you get started.',
			icon: 'sparkles',
			tip: 'Press Enter or → to continue, Esc to skip',
		},
		{
			id: 'sidebar',
			title: 'Navigation Sidebar',
			description: 'Your main navigation hub. Access cases, evidence, search, AI tools, and system settings from here. It collapses for more workspace.',
			icon: 'panel-left',
			targetSelector: '.yorha-sidebar',
			tip: 'The sidebar is always accessible — click the hamburger icon to toggle it',
		},
		{
			id: 'dashboard',
			title: 'Your Dashboard',
			description: 'This is your command center. View active cases, recent evidence, AI insights, and system health at a glance.',
			icon: 'layout-dashboard',
			targetSelector: '#main-content',
			route: '/dashboard',
			tip: 'Press Ctrl+K anytime to open the Command Palette',
		},
		{
			id: 'cases',
			title: 'Case Management',
			description: 'Create, organize, and track legal cases. Link evidence, add notes, and collaborate with AI-powered analysis.',
			icon: 'briefcase',
			route: '/cases',
			tip: 'Press Ctrl+N on the dashboard to quickly create a new case',
		},
		{
			id: 'evidence',
			title: 'Evidence Library',
			description: 'Upload documents, images, and files. The AI automatically extracts text, entities, and patterns for your investigation.',
			icon: 'file-search',
			route: '/evidence',
			tip: 'Drag & drop files anywhere in the evidence library to upload',
		},
		{
			id: 'ai-assistant',
			title: 'AI Research Assistant',
			description: 'Ask legal questions, search case law, and get AI-powered analysis. The assistant understands legal context and citations.',
			icon: 'message-square',
			action: 'openChat',
			tip: 'The AI chat widget appears in the bottom-right corner of every page',
		},
		{
			id: 'search',
			title: 'GPU-Accelerated Search',
			description: 'Search across all cases, evidence, and documents with semantic understanding. Results are reranked using your GPU for precision.',
			icon: 'search',
			route: '/global-search',
			tip: 'Semantic search understands meaning, not just keywords',
		},
		{
			id: 'models',
			title: 'AI Models Setup',
			description: 'The platform uses local AI models for privacy. Install Ollama and download the required models to enable full AI features.',
			icon: 'cpu',
			route: '/system-configuration',
			action: 'showModelSetup',
			tip: 'All AI processing happens locally — your data never leaves your machine',
		},
		{
			id: 'shortcuts',
			title: 'Keyboard Shortcuts',
			description: 'Power users love shortcuts. Here are the most useful ones to speed up your workflow.',
			icon: 'keyboard',
			tip: 'Press Ctrl+Shift+D to toggle the Document Writer',
		},
		{
			id: 'complete',
			title: 'You\'re All Set!',
			description: 'You\'re ready to start investigating. Create your first case or explore the demo data to see the platform in action.',
			icon: 'check-circle',
			tip: 'You can restart this tutorial anytime from Settings',
		},
	];

	const STORAGE_KEY = 'deeds-onboarding-completed';
	const STEP_KEY = 'deeds-onboarding-step';
	const MAX_STEP_INDEX = WIZARD_STEPS.length - 1;

	const SHORTCUTS = [
		{ keys: 'Ctrl + K', desc: 'Command Palette' },
		{ keys: 'Ctrl + N', desc: 'New Case' },
		{ keys: 'Ctrl + Shift + D', desc: 'Document Writer' },
		{ keys: '←  →', desc: 'Navigate wizard' },
		{ keys: 'Esc', desc: 'Skip tutorial' },
	];

	let isVisible = $state(false);
	let currentStep = $state(0);
	let spotlightRect = $state<DOMRect | null>(null);
	let isAnimating = $state(false);
	let cardPosition = $state<'center' | 'bottom-right' | 'bottom-left'>('center');
	let onboardingReady = $state(false);

	type OnboardingState = {
		hasCompletedOnboarding: boolean;
		onboardingStep: number;
	};

	function clampStep(step: number): number {
		return Math.max(0, Math.min(MAX_STEP_INDEX, step));
	}

	function readLocalState(): OnboardingState {
		const completed = localStorage.getItem(STORAGE_KEY) === 'true';
		const rawStep = parseInt(localStorage.getItem(STEP_KEY) ?? '0', 10);

		return {
			hasCompletedOnboarding: completed,
			onboardingStep: Number.isFinite(rawStep) ? clampStep(rawStep) : 0,
		};
	}

	function writeLocalState(state: Partial<OnboardingState>) {
		if (typeof state.hasCompletedOnboarding === 'boolean') {
			if (state.hasCompletedOnboarding) {
				localStorage.setItem(STORAGE_KEY, 'true');
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		}

		if (typeof state.onboardingStep === 'number') {
			localStorage.setItem(STEP_KEY, String(clampStep(state.onboardingStep)));
		}
	}

	async function persistState(state: Partial<OnboardingState>) {
		if (!browser) return;

		writeLocalState(state);

		try {
			const response = await fetch('/api/onboarding', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(state),
			});

			if (!response.ok && response.status !== 401) {
				console.warn('Failed to persist onboarding state', response.status);
			}
		} catch (error) {
			console.warn('Failed to persist onboarding state', error);
		}
	}

	async function initializeWizard() {
		if (!browser || onboardingReady) return;

		let state = readLocalState();

		try {
			const response = await fetch('/api/onboarding');
			if (response.ok) {
				const serverState = (await response.json()) as Partial<OnboardingState>;
				state = {
					hasCompletedOnboarding: serverState.hasCompletedOnboarding === true,
					onboardingStep: clampStep(serverState.onboardingStep ?? 0),
				};
				writeLocalState(state);
			}
		} catch (error) {
			console.warn('Failed to load onboarding state', error);
		}

		currentStep = state.onboardingStep;
		onboardingReady = true;
		runStepSideEffects(currentStep);

		if (!state.hasCompletedOnboarding) {
			setTimeout(() => {
				isVisible = true;
			}, 600);
		}
	}

	onMount(() => {
		void initializeWizard();
	});

	function runStepSideEffects(stepIndex: number) {
		const activeStep = WIZARD_STEPS[stepIndex];
		if (!activeStep) return;

		if (activeStep.route && browser && window.location.pathname !== activeStep.route) {
			void goto(activeStep.route);
		}

		if (activeStep.action === 'openChat' && browser) {
			window.dispatchEvent(new CustomEvent('yorha:open-chat'));
		}
	}

	function goToStep(stepIndex: number) {
		currentStep = clampStep(stepIndex);
		void persistState({ onboardingStep: currentStep });
		runStepSideEffects(currentStep);
	}

	// Update spotlight when step changes
	$effect(() => {
		if (browser && isVisible) {
			const step = WIZARD_STEPS[currentStep];
			if (step?.targetSelector) {
				const el = document.querySelector(step.targetSelector);
				if (el) {
					const rect = el.getBoundingClientRect();
					spotlightRect = rect;
					// Position card to avoid overlapping the spotlight
					if (rect.left < window.innerWidth / 2) {
						cardPosition = 'bottom-right';
					} else {
						cardPosition = 'bottom-left';
					}
					// Scroll element into view if needed
					el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					return;
				}
			}
			spotlightRect = null;
			cardPosition = 'center';
		}
	});

	// Resize handler to update spotlight position
	function handleResize() {
		if (!browser || !isVisible) return;
		const step = WIZARD_STEPS[currentStep];
		if (step?.targetSelector) {
			const el = document.querySelector(step.targetSelector);
			if (el) {
				spotlightRect = el.getBoundingClientRect();
			}
		}
	}

	// Keyboard navigation
	function handleKeydown(e: KeyboardEvent) {
		if (!isVisible) return;
		switch (e.key) {
			case 'ArrowRight':
			case 'Enter':
				e.preventDefault();
				nextStep();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				prevStep();
				break;
			case 'Escape':
				e.preventDefault();
				skipWizard();
				break;
		}
	}

	function nextStep() {
		if (isAnimating) return;
		isAnimating = true;

		if (currentStep < WIZARD_STEPS.length - 1) {
			goToStep(currentStep + 1);
		} else {
			completeWizard();
		}

		setTimeout(() => { isAnimating = false; }, 300);
	}

	function prevStep() {
		if (isAnimating || currentStep <= 0) return;
		isAnimating = true;
		goToStep(currentStep - 1);
		setTimeout(() => { isAnimating = false; }, 300);
	}

	function skipWizard() {
		completeWizard();
	}

	function completeWizard() {
		isVisible = false;
		void persistState({
			hasCompletedOnboarding: true,
			onboardingStep: MAX_STEP_INDEX,
		});
	}

	function restartWizard() {
		writeLocalState({ hasCompletedOnboarding: false, onboardingStep: 0 });
		void persistState({ hasCompletedOnboarding: false, onboardingStep: 0 });
		currentStep = 0;
		isVisible = true;
		runStepSideEffects(0);
	}

	export { restartWizard };

	const step = $derived(WIZARD_STEPS[currentStep]);
	const progress = $derived(((currentStep + 1) / WIZARD_STEPS.length) * 100);
	const isFirstStep = $derived(currentStep === 0);
	const isLastStep = $derived(currentStep === WIZARD_STEPS.length - 1);
</script>

<svelte:window onkeydown={handleKeydown} onresize={handleResize} />

{#if isVisible}
	<!-- Backdrop overlay with spotlight cutout -->
	<div
		class="wizard-overlay"
		transition:fade={{ duration: 300 }}
		role="dialog"
		aria-modal="true"
		aria-label="Setup Wizard - Step {currentStep + 1} of {WIZARD_STEPS.length}"
	>
		<!-- Spotlight effect -->
		{#if spotlightRect}
			<div
				class="spotlight"
				style="
					top: {spotlightRect.top - 8}px;
					left: {spotlightRect.left - 8}px;
					width: {spotlightRect.width + 16}px;
					height: {spotlightRect.height + 16}px;
				"
				transition:fade={{ duration: 200 }}
			></div>
		{/if}

		<!-- Animated background particles (welcome & complete steps) -->
		{#if step.id === 'welcome' || step.id === 'complete'}
			<div class="particles" aria-hidden="true">
				{#each Array(12) as _, i}
					<div
						class="particle"
						style="
							--delay: {i * 0.3}s;
							--x: {Math.random() * 100}%;
							--y: {Math.random() * 100}%;
							--size: {3 + Math.random() * 4}px;
							--duration: {3 + Math.random() * 4}s;
						"
					></div>
				{/each}
			</div>
		{/if}

		<!-- Wizard modal card -->
		<div
			class="wizard-card"
			class:card-bottom-right={cardPosition === 'bottom-right'}
			class:card-bottom-left={cardPosition === 'bottom-left'}
			transition:scale={{ duration: 300, start: 0.9, easing: cubicOut }}
		>
			<!-- Close button -->
			<button class="btn-close" onclick={skipWizard} aria-label="Close tutorial">
				<Icon name="x" size={16} />
			</button>

			<!-- Progress bar -->
			<div class="progress-track">
				<div class="progress-fill" style="width: {progress}%"></div>
			</div>

			<!-- Step indicator -->
			<div class="step-dots">
				{#each WIZARD_STEPS as _, i}
					<button
						class="step-dot"
						class:active={i === currentStep}
						class:completed={i < currentStep}
						onclick={() => {
							goToStep(i);
						}}
						aria-label="Go to step {i + 1}: {WIZARD_STEPS[i].title}"
					></button>
				{/each}
			</div>

			<!-- Content area -->
			{#key currentStep}
				<div class="wizard-content" in:fly={{ x: 30, duration: 250, delay: 50 }} out:fly={{ x: -30, duration: 200 }}>
					<div class="step-icon" class:icon-success={step.id === 'complete'}>
						<Icon name={step.icon} size={32} />
					</div>

					<h2 class="step-title">{step.title}</h2>
					<p class="step-description">{step.description}</p>

					<!-- Keyboard shortcuts step -->
					{#if step.id === 'shortcuts'}
						<div class="shortcuts-grid">
							{#each SHORTCUTS as shortcut}
								<div class="shortcut-row">
									<kbd class="shortcut-keys">{shortcut.keys}</kbd>
									<span class="shortcut-desc">{shortcut.desc}</span>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Model setup step -->
					{#if step.id === 'models'}
						<div class="model-info">
							<div class="model-row">
								<span class="model-name">gemma3-legal</span>
								<span class="model-detail">11.8B params — Legal reasoning</span>
							</div>
							<div class="model-row">
								<span class="model-name">embeddinggemma</span>
								<span class="model-detail">307M params — Document search</span>
							</div>
							<div class="model-cmds">
								<code class="model-cmd">ollama pull gemma3-legal:latest</code>
								<code class="model-cmd">ollama pull embeddinggemma:latest</code>
							</div>
							<p class="model-note">
								<Icon name="shield" size={12} />
								All models run locally — your data stays on your machine
							</p>
						</div>
					{/if}

					<!-- Completion step -->
					{#if step.id === 'complete'}
						<div class="completion-actions">
							<button class="btn-action" onclick={() => { completeWizard(); goto('/cases'); }}>
								<Icon name="plus" size={16} />
								Create First Case
							</button>
							<button class="btn-action btn-secondary" onclick={() => { completeWizard(); goto('/dashboard'); }}>
								<Icon name="layout-dashboard" size={16} />
								Go to Dashboard
							</button>
						</div>
					{/if}

					<!-- Contextual tip -->
					{#if step.tip}
						<div class="step-tip" in:fade={{ duration: 200, delay: 300 }}>
							<Icon name="lightbulb" size={12} />
							<span>{step.tip}</span>
						</div>
					{/if}
				</div>
			{/key}

			<!-- Navigation -->
			<div class="wizard-nav">
				<button class="btn-skip" onclick={skipWizard}>
					Skip
				</button>

				<div class="nav-buttons">
					{#if !isFirstStep}
						<button class="btn-prev" onclick={prevStep} disabled={isAnimating}>
							<Icon name="chevron-left" size={16} />
							Back
						</button>
					{/if}

					<button class="btn-next" onclick={nextStep} disabled={isAnimating}>
						{isLastStep ? 'Get Started' : 'Next'}
						{#if !isLastStep}
							<Icon name="chevron-right" size={16} />
						{/if}
					</button>
				</div>
			</div>

			<!-- Step counter -->
			<div class="step-counter">
				{currentStep + 1} / {WIZARD_STEPS.length}
			</div>
		</div>
	</div>
{/if}

<style>
	.wizard-overlay {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(2px);
	}

	/* Particles */
	.particles {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 10000;
		overflow: hidden;
	}

	.particle {
		position: absolute;
		width: var(--size);
		height: var(--size);
		left: var(--x);
		top: var(--y);
		background: radial-gradient(circle, rgba(99, 179, 237, 0.6), rgba(128, 90, 213, 0.3));
		border-radius: 50%;
		animation: particle-drift var(--duration) ease-in-out var(--delay) infinite;
		opacity: 0;
	}

	@keyframes particle-drift {
		0% { opacity: 0; transform: translateY(0) scale(0.5); }
		20% { opacity: 0.8; }
		80% { opacity: 0.4; }
		100% { opacity: 0; transform: translateY(-60px) scale(1.2); }
	}

	/* Spotlight */
	.spotlight {
		position: fixed;
		border-radius: 8px;
		box-shadow:
			0 0 0 9999px rgba(0, 0, 0, 0.7),
			0 0 30px 4px rgba(99, 179, 237, 0.4);
		border: 2px solid rgba(99, 179, 237, 0.6);
		pointer-events: none;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 10001;
		animation: spotlight-pulse 2s ease-in-out infinite;
	}

	@keyframes spotlight-pulse {
		0%, 100% { box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 30px 4px rgba(99, 179, 237, 0.4); }
		50% { box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7), 0 0 40px 8px rgba(99, 179, 237, 0.6); }
	}

	/* Close button */
	.btn-close {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 10;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: #718096;
		cursor: pointer;
		padding: 0;
		transition: all 0.15s;
	}

	.btn-close:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #e2e8f0;
	}

	/* Card */
	.wizard-card {
		position: relative;
		z-index: 10002;
		background: #0d1117;
		border: 1px solid rgba(99, 179, 237, 0.3);
		border-radius: 12px;
		padding: 0;
		width: 480px;
		max-width: 90vw;
		overflow: hidden;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.5),
			0 0 40px rgba(99, 179, 237, 0.1);
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.wizard-card.card-bottom-right {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		top: auto;
		left: auto;
	}

	.wizard-card.card-bottom-left {
		position: fixed;
		bottom: 2rem;
		left: 2rem;
		top: auto;
		right: auto;
	}

	.progress-track {
		height: 3px;
		background: rgba(255, 255, 255, 0.06);
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #63b3ed, #805ad5);
		transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.step-dots {
		display: flex;
		justify-content: center;
		gap: 6px;
		padding: 16px 24px 0;
	}

	.step-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.1);
		cursor: pointer;
		padding: 0;
		transition: all 0.2s;
	}

	.step-dot:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.step-dot.active {
		background: #63b3ed;
		border-color: #63b3ed;
		transform: scale(1.2);
		box-shadow: 0 0 8px rgba(99, 179, 237, 0.4);
	}

	.step-dot.completed {
		background: #805ad5;
		border-color: #805ad5;
	}

	.wizard-content {
		padding: 24px 32px 16px;
		text-align: center;
		min-height: 220px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.step-icon {
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: linear-gradient(135deg, rgba(99, 179, 237, 0.15), rgba(128, 90, 213, 0.15));
		display: flex;
		align-items: center;
		justify-content: center;
		color: #63b3ed;
		animation: icon-float 3s ease-in-out infinite;
	}

	.step-icon.icon-success {
		background: linear-gradient(135deg, rgba(72, 187, 120, 0.2), rgba(56, 161, 105, 0.1));
		color: #48bb78;
		animation: success-bounce 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	@keyframes icon-float {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-4px); }
	}

	@keyframes success-bounce {
		0% { transform: scale(0); }
		60% { transform: scale(1.15); }
		100% { transform: scale(1); }
	}

	.step-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: #e2e8f0;
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
	}

	.step-description {
		font-size: 0.875rem;
		color: #a0aec0;
		line-height: 1.6;
		margin: 0;
		max-width: 400px;
	}

	/* Contextual tip */
	.step-tip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: rgba(99, 179, 237, 0.08);
		border: 1px solid rgba(99, 179, 237, 0.15);
		border-radius: 6px;
		font-size: 0.6875rem;
		color: #63b3ed;
		font-family: 'JetBrains Mono', monospace;
		margin-top: 4px;
	}

	/* Keyboard shortcuts grid */
	.shortcuts-grid {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		margin-top: 4px;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 6px;
	}

	.shortcut-keys {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: #e2e8f0;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		padding: 2px 8px;
		min-width: 7rem;
		text-align: center;
	}

	.shortcut-desc {
		font-size: 0.75rem;
		color: #a0aec0;
	}

	/* Model info */
	.model-info {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 12px 16px;
		width: 100%;
		margin-top: 4px;
	}

	.model-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 4px 0;
	}

	.model-name {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		color: #63b3ed;
		font-weight: 600;
	}

	.model-detail {
		font-size: 0.75rem;
		color: #718096;
	}

	.model-cmds {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
	}

	.model-cmd {
		display: block;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 4px;
		font-size: 0.75rem;
		color: #48bb78;
		font-family: 'JetBrains Mono', monospace;
		user-select: all;
	}

	.model-note {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 8px;
		font-size: 0.6875rem;
		color: #48bb78;
		opacity: 0.8;
	}

	/* Completion */
	.completion-actions {
		display: flex;
		gap: 10px;
		margin-top: 8px;
	}

	.btn-action {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 6px;
		border: none;
		font-size: 0.8125rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 500;
		cursor: pointer;
		background: #63b3ed;
		color: #0d1117;
		transition: all 0.15s;
	}

	.btn-action:hover { background: #4299e1; }

	.btn-action.btn-secondary {
		background: transparent;
		color: #a0aec0;
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.btn-action.btn-secondary:hover {
		background: rgba(255, 255, 255, 0.05);
		color: #e2e8f0;
	}

	/* Navigation */
	.wizard-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 24px 16px;
	}

	.nav-buttons {
		display: flex;
		gap: 8px;
	}

	.btn-skip {
		background: none;
		border: none;
		color: #718096;
		font-size: 0.75rem;
		cursor: pointer;
		padding: 4px 8px;
		font-family: 'JetBrains Mono', monospace;
	}

	.btn-skip:hover { color: #a0aec0; }

	.btn-prev,
	.btn-next {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 14px;
		border-radius: 6px;
		font-size: 0.8125rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 500;
		cursor: pointer;
		border: none;
		transition: all 0.15s;
	}

	.btn-prev {
		background: transparent;
		color: #a0aec0;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.btn-prev:hover { background: rgba(255, 255, 255, 0.05); }

	.btn-next {
		background: linear-gradient(135deg, #63b3ed, #805ad5);
		color: white;
	}

	.btn-next:hover { filter: brightness(1.1); }
	.btn-next:disabled,
	.btn-prev:disabled { opacity: 0.5; cursor: not-allowed; }

	.step-counter {
		text-align: center;
		padding: 0 0 12px;
		font-size: 0.6875rem;
		color: #4a5568;
		font-family: 'JetBrains Mono', monospace;
	}
</style>
