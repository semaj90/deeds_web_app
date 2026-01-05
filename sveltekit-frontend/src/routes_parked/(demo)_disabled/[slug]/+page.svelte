<!-- Dynamic Demo Page - Showcase, Individual, Demos -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { SvelteComponent } from 'svelte';

	interface Props {
		data?: unknown;
	}

	let { data: data }: Props = $props();

	// Define a type for a Svelte component constructor
	type SvelteComponentConstructor = new (...args: unknown[]) => SvelteComponent;

	// Refine DemoLoader to expect a module that *might* have a default export or *is* the component itself
	type DemoLoader = () => Promise<SvelteComponentConstructor | { default: SvelteComponentConstructor }>;

	const demoComponents: Record<string, DemoLoader> = {
		webgpu: () => import('$lib/components/ai/webgpu/CacheOptimizerDemo.svelte'),
		'cuda-streaming': () => import('$lib/components/ai/OCRTensorDemo.svelte'),
		'ai-assistant': () => import('$lib/components/ai/EnhancedRAGDemo.svelte'),
		'evidence-canvas': () => import('$lib/components/evidence/EnhancedEvidenceBoard.svelte'),
		'legal-research': () => import('$lib/components/ai/LegalAIPipelineDemo.svelte'),
		'vector-search': () => import('$lib/components/ai/VectorIntelligenceDemo.svelte'),
		'gaming-ui': () => import('$lib/components/cache/CacheDemo.svelte', performance: () => import('$lib/components/ai/CachePerformanceDashboard.svelte'),
		'neural-topology': () => import('$lib/components/ai/NeuralTopology3DDemo.svelte'),
		'simd-ai': () => import('$lib/components/ai/SIMDAIAssistantDemo.svelte'),
		'realtime-comm': () => import('$lib/components/ai/RealtimeCommunicationDemo.svelte'),
		'autonomous-eng': () => import('$lib/components/ai/copilot/AutonomousEngineeringDemo.svelte')
	};

	let demoSlug = $derived($page.params.slug ?? 'showcase');
	let currentComponent = $state<SvelteComponentConstructor | null>(null);
	let loading = $state<boolean>(true);
	let error = $state<string | null>(null);

	async function loadDemoComponent(slug: string): Promise<any> {
		loading = true;
		error = null;

		try {
			const loader = demoComponents[slug];
			if (!loader) {
				error = `Demo "${slug}" not found.`;
				currentComponent = null;
				return;
			}

			const module = await loader();
			// Handle both cases: module is the component constructor directly, or it has a default export
			currentComponent = (module as { default: SvelteComponentConstructor }).default ?? (module as SvelteComponentConstructor);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			error = `Failed to load demo: ${message}`;
			currentComponent = null;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (demoSlug) {
			loadDemoComponent(demoSlug);
		}
	});

	const demoMetadata = {
		webgpu: {
			title: 'WebGPU Cache Optimizer',
			description: 'Hardware-accelerated cache optimization with WebGPU.',
			tags: ['WebGPU', 'Cache', 'Performance']
		},
		'cuda-streaming': {
			title: 'CUDA OCR & Tensor Processing',
			description: 'Real-time GPU-accelerated document OCR and tensor operations.',
			tags: ['CUDA', 'OCR', 'GPU']
		},
		'ai-assistant': {
			title: 'Enhanced RAG AI Assistant',
			description: 'Retrieval-Augmented Generation for legal research.',
			tags: ['RAG', 'AI', 'Legal']
		},
		'evidence-canvas': {
			title: 'Evidence Board Canvas',
			description: 'Interactive evidence organization and visualization.',
			tags: ['Evidence', 'Canvas', 'Visualization']
		},
		'legal-research': {
			title: 'Legal AI Pipeline',
			description: 'End-to-end legal document processing pipeline.',
			tags: ['Pipeline', 'Legal', 'AI']
		},
		'vector-search': {
			title: 'Vector Intelligence Search',
			description: 'Semantic search using vector embeddings and SIMD.',
			tags: ['Vector', 'Search', 'SIMD']
		},
		'gaming-ui': {
			title: 'Gaming Cache Demo',
			description: 'YoRHa-inspired caching system with Redis integration.',
			tags: ['Cache', 'Gaming', 'Redis']
		},
		performance: {
			title: 'Cache Performance Dashboard',
			description: 'Real-time cache performance monitoring and optimization.',
			tags: ['Performance', 'Cache', 'Monitoring']
		},
		'neural-topology': {
			title: 'Neural Topology 3D Visualization',
			description: '3D visualization of neural network topology.',
			tags: ['3D', 'Neural', 'Visualization']
		},
		'simd-ai': {
			title: 'SIMD AI Assistant',
			description: 'CPU-optimized AI assistant using SIMD instructions.',
			tags: ['SIMD', 'AI', 'Performance']
		},
		'realtime-comm': {
			title: 'Real-time Communication',
			description: 'WebSocket-based real-time AI communication.',
			tags: ['WebSocket', 'Real-time', 'Communication']
		},
		'autonomous-eng': {
			title: 'Autonomous Engineering Copilot',
			description: 'AI-powered autonomous code generation and engineering.',
			tags: ['Copilot', 'Autonomous', 'Engineering']
		}
	} satisfies Record<
		string,
		{
			title: string;
			description: string;
			tags: string[];
		}
	>;

	// safely index metadata by casting slug as key of demoMetadata
	let metadata = $derived(
		demoMetadata[demoSlug as keyof typeof demoMetadata] ?? {
			title: 'Unknown Demo',
			description: '',
			tags: []
		}
	);
</script>

<svelte:head>
	<title>{metadata.title} - Legal AI Demo</title>
	<meta name="description" content={metadata.description} />
</svelte:head>

<div class="demo-page">
	<header class="demo-page-header">
		<div class="demo-breadcrumb">
			<a href="/demo/showcase" class="breadcrumb-link">← Demos</a>
			<span class="breadcrumb-separator">›</span>
			<span class="breadcrumb-current">{demoSlug}</span>
		</div>

		<div class="demo-meta">
			<h1 class="demo-title">{metadata.title}</h1>
			<p class="demo-description">{metadata.description}</p>

			{#if metadata.tags.length > 0}
				<div class="demo-tags">
					{#each Array.isArray(metadata.tags) ? metadata.tags : [] as tag}
						<span class="demo-tag">{ tag: tag }</span>
					{/each}
				</div>
			{/if}
		</div>
	</header>

	<main class="demo-content">
		{#if loading}
			<div class="demo-loading">
				<div class="loading-spinner"></div>
				<p>Loading {metadata.title}...</p>
			</div>
		{:else if error}
			<div class="demo-error">
				<div class="error-icon">⚠️</div>
				<h2>Demo Load Failed</h2>
				<p>{error}</p>
				<div class="error-actions">
					<button type="button" onclick={() => loadDemoComponent(demoSlug)}>Retry</button>
					<a href="/demo/showcase">Back to Demos</a>
				</div>
			</div>
		{:else if currentComponent}
			<div class="demo-wrapper">
				<currentComponent { data: data } ></currentComponent>
			</div>
		{:else}
			<div class="demo-placeholder">
				<h2>Demo Under Construction</h2>
				<p>The "{demoSlug}" demo is being prepared.</p>
				<a href="/demo/showcase">Browse Other Demos</a>
			</div>
		{/if}
	</main>
</div>

<style>
	.demo-page {
		min-height: 100%;
	}

	.demo-page-header {
		padding: 2rem;
		background: var(--nier-bg-secondary);
		border-bottom: 1px solid var(--nier-border-muted);
	}

	.demo-breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--nier-text-muted);
		margin-bottom: 1rem;
	}

	.breadcrumb-link {
		color: var(--nier-accent-warm);
		text-decoration: none;
	}

	.breadcrumb-link:hover {
		text-decoration: underline;
	}

	.breadcrumb-separator {
		color: var(--nier-text-muted);
	}

	.breadcrumb-current {
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.demo-title {
		font-size: 2rem;
		margin: 0 0 0.5rem;
		color: var(--nier-text-primary);
	}

	.demo-description {
		font-size: 1.1rem;
		color: var(--nier-text-secondary);
		max-width: 800px;
		margin: 0 0 1.5rem;
	}

	.demo-tags {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.demo-tag {
		padding: 0.25rem 0.75rem;
		background: var(--nier-bg-tertiary);
		border: 1px solid var(--nier-border-muted);
		border-radius: 4px;
		font-size: 0.8rem;
		color: var(--nier-text-secondary);
	}

	.demo-content {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	.demo-loading,
	.demo-error,
	.demo-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		background: var(--nier-bg-secondary);
		border: 1px solid var(--nier-border-muted);
		border-radius: 8px;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--nier-border-muted);
		border-top-color: var(--nier-accent-warm);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.error-actions {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	button {
		padding: 0.5rem 1.5rem;
		background: var(--nier-accent-warm);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
	}

	button:hover {
		background: var(--nier-accent-cool);
	}

	a {
		padding: 0.5rem 1.5rem;
		color: var(--nier-text-primary);
		text-decoration: none;
		border: 1px solid var(--nier-border-muted);
		border-radius: 4px;
	}

	a:hover {
		background: var(--nier-bg-tertiary);
	}
</style>
