<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';

	interface DialogProps {
		open?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';
		title?: string;
		variant?: 'default' | 'legal' | 'evidence' | 'case' | 'nes';
		glassmorphism?: boolean;
		pixelated?: boolean;
		webgpuEffects?: boolean;
		collaboration?: {
			enabled?: boolean;
			users?: Array<{
				id: string;
				name: string;
				color: string;
				cursor?: { x: number; y: number };
			}>;
			sessionId?: string;
		};
		legalContext?: {
			aiAnalysis?: {
				riskLevel?: 'low' | 'medium' | 'high';
				confidence?: number;
				suggestions?: string[];
			};
		};
		onOpenChange?: (o: boolean) => void;
		onClose?: () => void;
		className?: string;
		children?: Snippet;
		footer?: Snippet;
	}

	let {
		open = false,
		size = 'md',
		title = '',
		variant = 'default',
		glassmorphism = false,
		pixelated = false,
		webgpuEffects = false,
		collaboration = undefined,
		legalContext = undefined,
		onOpenChange = undefined,
		onClose = undefined,
		className = '',
		children,
		footer,
	}: DialogProps = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let device: GPUDevice | null = null;
	let animationFrame = $state<number | null>(null);

	let dialogClasses = $derived.by(() => {
		return [
			'fixed inset-0 z-50 flex items-center justify-center p-4',
			size === 'sm' ? 'max-w-sm' :
			size === 'md' ? 'max-w-md' :
			size === 'lg' ? 'max-w-2xl' :
			size === 'xl' ? 'max-w-4xl' :
			size === 'fullscreen' ? 'max-w-full h-full' : '',
			className
		].filter(Boolean).join(' ');
	});

	let contentClasses = $derived.by(() => {
		return [
			'relative rounded-lg shadow-xl max-h-[90vh] overflow-hidden',
			variant === 'legal' ? 'border-l-4 border-accent' :
			variant === 'evidence' ? 'border-l-4 border-warning' :
			variant === 'case' ? 'border-l-4 border-info' : '',
			glassmorphism ? 'backdrop-blur-md bg-white/80' : 'bg-white',
			pixelated ? 'image-rendering-pixelated' : '',
			variant === 'nes' ? 'border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : ''
		].filter(Boolean).join(' ');
	});

	function closeDialog() {
		open = false;
		onClose?.();
		onOpenChange?.(false);
	}

	function renderCollaborationCursors() {
		if (!collaboration?.enabled || !collaboration?.users) return [];
		return (collaboration.users || []).map((user) => ({
			id: user.id ?? Math.random().toString(36).slice(2, 8),
			x: user.cursor?.x ?? 0,
			y: user.cursor?.y ?? 0,
			color: user.color ?? '#333',
			name: user.name ?? 'User'
		}));
	}

	async function initWebGPU(): Promise<void> {
		if (!webgpuEffects) return;
		if (!canvas || typeof (navigator as any).gpu === 'undefined') {
			return;
		}
		try {
			const adapter = await (navigator as any).gpu.requestAdapter();
			if (!adapter) return;
			device = await adapter.requestDevice();
		} catch (err) {
			console.warn('WebGPU initialization failed:', err);
			device = null;
		}
	}

	$effect(() => {
		if (webgpuEffects) initWebGPU();

		return () => {
			if (animationFrame) cancelAnimationFrame(animationFrame);
			try {
				if (device && (device as any).destroy) (device as any).destroy();
			} catch {
				// ignore
			}
			device = null;
		};
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50">
		{#if webgpuEffects}
			<canvas
				bind:this={canvas}
				class="absolute inset-0 w-full h-full"
				width="800"
				height="600"
				style="mix-blend-mode: multiply; opacity: 0.6;"
			></canvas>
		{/if}

		<!-- Overlay -->
		<button
			type="button"
			class="fixed inset-0 bg-black/50 backdrop-blur-sm appearance-none border-none p-0 m-0"
			transition:fade={{ duration: 150 }}
			onclick={() => closeDialog()}
			aria-label="Close dialog"
		></button>

		<!-- Dialog Container -->
		<div class={dialogClasses} aria-hidden={!open}>
			<!-- Dialog Content -->
			<div
				class={contentClasses}
				transition:scale={{ duration: 200, easing: cubicInOut }}
				role="dialog"
				aria-modal="true"
			>
				<!-- Collaboration Users -->
				{#if collaboration?.enabled}
					<div class="absolute -top-8 right-0 flex -space-x-2">
						{#each collaboration.users ?? [] as user (user.id)}
							<div
								class="w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xs font-bold text-white"
								style="background-color: {user.color}"
								title={user.name}
							>
								{user.name ? user.name.charAt(0).toUpperCase() : 'U'}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Legal AI Risk Indicator -->
				{#if legalContext?.aiAnalysis?.riskLevel === 'high'}
					<div class="absolute -top-2 -right-2 w-4 h-4 bg-danger rounded-full animate-pulse border-2 border-white"></div>
				{/if}

				<!-- Header -->
				{#if title}
					<div class="px-6 py-4 border-b">
						<h2 class="text-lg font-semibold text-sand flex items-center gap-2">
							{title}
							{#if legalContext?.aiAnalysis}
								<span
									class="px-2 py-1 text-xs rounded-full"
									class:bg-accent/10={legalContext.aiAnalysis.riskLevel === 'low'}
									class:text-accent={legalContext.aiAnalysis.riskLevel === 'low'}
									class:bg-warning/10={legalContext.aiAnalysis.riskLevel === 'medium'}
									class:text-warning={legalContext.aiAnalysis.riskLevel === 'medium'}
									class:bg-danger/10={legalContext.aiAnalysis.riskLevel === 'high'}
									class:text-danger={legalContext.aiAnalysis.riskLevel === 'high'}
								>
									AI: {Math.round((legalContext.aiAnalysis.confidence ?? 0) * 100)}%
								</span>
							{/if}
						</h2>
					</div>
				{/if}

				<!-- Content -->
				<div class="px-6 py-4 overflow-y-auto">
					{#if children}
						{@render children()}
					{/if}

					{#if legalContext?.aiAnalysis?.suggestions && legalContext.aiAnalysis.suggestions.length > 0}
						<div class="mt-4 p-3 bg-info/5 rounded-lg border border-info/20">
							<h4 class="text-sm font-medium text-info mb-1">AI Suggestions:</h4>
							<ul class="text-sm text-info list-disc list-inside">
								{#each legalContext.aiAnalysis.suggestions as suggestion}
									<li>{suggestion}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				{#if footer}
					<div class="px-6 py-4 border-t border-sand/20">
						{@render footer()}
					</div>
				{:else}
					<div class="px-6 py-4 border-t border-sand/20 bg-sand/5 flex justify-end">
						<button
							class="px-3 py-1 text-sm rounded-md border border-sand/20 bg-white text-sand/80 hover:bg-sand/5 shadow-sm"
							type="button"
							onclick={closeDialog}
						>
							Close
						</button>
					</div>
				{/if}

				<!-- Close button -->
				<button
					class="absolute top-4 right-4 text-sand/40 hover:text-sand/60 transition-colors"
					onclick={closeDialog}
					aria-label="Close"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>

				<!-- Collaboration Cursors -->
				{#each renderCollaborationCursors() as cursor (cursor.id)}
					<div
						class="absolute pointer-events-none z-10"
						style="left: {cursor.x}px; top: {cursor.y}px; color: {cursor.color}"
						transition:fade={{ duration: 200 }}
					>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M7 2L17 12L12 13L13 18L7 2Z"/>
						</svg>
						<span
							class="ml-2 px-1 py-0.5 text-xs font-medium text-white rounded shadow-lg"
							style="background-color: {cursor.color}"
						>
							{cursor.name}
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.image-rendering-pixelated {
		image-rendering: -moz-crisp-edges;
		image-rendering: -webkit-crisp-edges;
		image-rendering: pixelated;
		image-rendering: crisp-edges;
	}

	canvas {
		will-change: transform;
		transform: translateZ(0);
	}
</style>
