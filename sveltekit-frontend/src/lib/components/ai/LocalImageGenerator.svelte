<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface ImageResult {
		id: string;
		prompt: string;
		imageUrl: string;
		provider: string;
		timestamp: number;
		processingTime?: number;
		seed?: number;
		width: number;
		height: number;
	}

	interface Props {
		caseId?: string;
		onImageGenerated?: (result: ImageResult) => void;
		compact?: boolean;
	}

	let { caseId = '', onImageGenerated, compact = false }: Props = $props();

	let prompt = $state('');
	let negativePrompt = $state('blurry, low quality, distorted, text, watermark');
	let selectedStyle = $state<'realistic' | 'sketch' | 'legal-diagram' | 'evidence-recreation' | 'artistic'>('realistic');
	let selectedProvider = $state<'ollama-vision' | 'stable-diffusion' | 'comfyui'>('ollama-vision');
	let width = $state(512);
	let height = $state(512);
	let steps = $state(20);
	let cfgScale = $state(7.5);
	let seed = $state(-1);
	let advancedMode = $state(false);
	let isGenerating = $state(false);
	let progress = $state(0);
	let currentStep = $state('');
	let generatedImage = $state<ImageResult | null>(null);
	let history = $state<ImageResult[]>([]);
	let showHistory = $state(false);
	let errorMsg = $state<string | null>(null);

	const legalTemplates = [
		{ name: 'Crime Scene Recreation', icon: 'search', prompt: 'detailed crime scene recreation, professional forensic photography, evidence markers, accurate lighting, overhead view' },
		{ name: 'Traffic Accident Diagram', icon: 'map', prompt: 'traffic accident scene diagram, aerial view, road markings, vehicle positions, impact points, technical illustration' },
		{ name: 'Property Damage', icon: 'house', prompt: 'property damage documentation, insurance photo style, clear structural details, professional lighting, measurement references' },
		{ name: 'Evidence Visualization', icon: 'eye', prompt: 'forensic evidence visualization, scientific illustration, laboratory setting, detailed analysis, annotated' },
		{ name: 'Legal Flowchart', icon: 'git-branch', prompt: 'legal process flowchart, clean professional diagram, clear annotations, decision tree, formal presentation' },
		{ name: 'Suspect Composite', icon: 'user', prompt: 'police sketch style, facial composite, professional law enforcement illustration, neutral background' },
	];

	// Wire to /api/ai/generate-image (LLM descriptor — no local SD model configured)
	async function generateImage() {
		if (!prompt.trim()) return;
		isGenerating = true;
		errorMsg = null;
		progress = 0;

		try {
			currentStep = 'Preparing prompt...';
			progress = 10;

			currentStep = `Generating with ${selectedProvider}...`;
			progress = 40;

			const res = await fetch('/api/ai/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt, negativePrompt, width, height, steps, cfgScale, seed, style: selectedStyle, provider: selectedProvider })
			});

			progress = 80;
			currentStep = 'Processing response...';

			if (!res.ok) throw new Error(`Generation failed: ${res.statusText}`);

			const data = await res.json();
			progress = 100;
			currentStep = 'Complete';

			// API returns an LLM descriptor (no local image model). Show description as result.
			const imageUrl = data.imageUrl ??
				`https://placehold.co/${width}x${height}/1a1a2e/ffd700?text=${encodeURIComponent((data.metadata?.mood as string | undefined) ?? selectedStyle)}`;

			const result: ImageResult = {
				id: crypto.randomUUID(),
				prompt: prompt.trim(),
				imageUrl,
				provider: selectedProvider,
				timestamp: Date.now(),
				processingTime: Date.now(),
				seed: seed === -1 ? Math.floor(Math.random() * 999999) : seed,
				width,
				height,
			};

			generatedImage = result;
			history = [result, ...history].slice(0, 20);
			onImageGenerated?.(result);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Generation failed';
		} finally {
			isGenerating = false;
		}
	}

	function useAsEvidence(result: ImageResult) {
		onImageGenerated?.(result);
	}

	function applyTemplate(template: typeof legalTemplates[0]) {
		prompt = template.prompt;
	}
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Icon name="image" size={20} />
			<h3 class="text-base font-semibold m-0">AI Image Generation</h3>
		</div>
		<div class="flex items-center gap-2 text-xs opacity-60">
			<span class="px-2 py-0.5 rounded bg-white/8">{selectedProvider}</span>
			<span class="px-2 py-0.5 rounded bg-white/8">{selectedStyle}</span>
		</div>
	</div>

	<!-- Legal Templates -->
	<div>
		<label class="block text-xs font-medium mb-1.5 opacity-70">Legal Templates</label>
		<div class="flex flex-wrap gap-1.5">
			{#each legalTemplates as template}
				<button
					onclick={() => applyTemplate(template)}
					class="flex items-center gap-1 px-2 py-1 text-xs border border-sand-dark rounded bg-panel-soft hover:border-accent transition-colors cursor-pointer"
				>
					<Icon name={template.icon} size={12} />
					{template.name}
				</button>
			{/each}
		</div>
	</div>

	<!-- Prompt -->
	<div>
		<label for="img-prompt" class="block text-xs font-medium mb-1 opacity-70">Prompt</label>
		<textarea
			id="img-prompt"
			bind:value={prompt}
			placeholder="Describe the image to generate..."
			rows={compact ? 2 : 3}
			class="w-full p-2.5 text-sm border border-sand-dark rounded-lg bg-panel-soft resize-y focus:border-accent focus:outline-none"
		></textarea>
	</div>

	<!-- Style & Provider -->
	<div class="grid grid-cols-2 gap-3">
		<div>
			<label for="img-style" class="block text-xs font-medium mb-1 opacity-70">Style</label>
			<select id="img-style" bind:value={selectedStyle} class="w-full p-2 text-sm border border-sand-dark rounded-lg bg-panel-soft">
				<option value="realistic">Realistic</option>
				<option value="sketch">Sketch</option>
				<option value="legal-diagram">Legal Diagram</option>
				<option value="evidence-recreation">Evidence Recreation</option>
				<option value="artistic">Artistic</option>
			</select>
		</div>
		<div>
			<label for="img-provider" class="block text-xs font-medium mb-1 opacity-70">Provider</label>
			<select id="img-provider" bind:value={selectedProvider} class="w-full p-2 text-sm border border-sand-dark rounded-lg bg-panel-soft">
				<option value="ollama-vision">Ollama Vision</option>
				<option value="stable-diffusion">Stable Diffusion</option>
				<option value="comfyui">ComfyUI</option>
			</select>
		</div>
	</div>

	<!-- Advanced Toggle -->
	<button
		onclick={() => (advancedMode = !advancedMode)}
		class="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none p-0"
	>
		<Icon name={advancedMode ? 'chevron-down' : 'chevron-right'} size={14} />
		Advanced Settings
	</button>

	{#if advancedMode}
		<div class="p-3 border border-sand-dark rounded-lg bg-panel-soft space-y-3">
			<div>
				<label for="neg-prompt" class="block text-xs font-medium mb-1 opacity-70">Negative Prompt</label>
				<textarea id="neg-prompt" bind:value={negativePrompt} rows={2} class="w-full p-2 text-xs border border-sand-dark rounded bg-panel-soft resize-y"></textarea>
			</div>
			<div class="grid grid-cols-5 gap-2">
				<div>
					<label for="img-w" class="block text-[11px] opacity-60 mb-0.5">Width</label>
					<input id="img-w" type="number" bind:value={width} min={256} max={1024} step={64} class="w-full p-1.5 text-xs border border-sand-dark rounded bg-panel-soft" />
				</div>
				<div>
					<label for="img-h" class="block text-[11px] opacity-60 mb-0.5">Height</label>
					<input id="img-h" type="number" bind:value={height} min={256} max={1024} step={64} class="w-full p-1.5 text-xs border border-sand-dark rounded bg-panel-soft" />
				</div>
				<div>
					<label for="img-steps" class="block text-[11px] opacity-60 mb-0.5">Steps</label>
					<input id="img-steps" type="number" bind:value={steps} min={1} max={100} class="w-full p-1.5 text-xs border border-sand-dark rounded bg-panel-soft" />
				</div>
				<div>
					<label for="img-cfg" class="block text-[11px] opacity-60 mb-0.5">CFG</label>
					<input id="img-cfg" type="number" bind:value={cfgScale} min={1} max={30} step={0.5} class="w-full p-1.5 text-xs border border-sand-dark rounded bg-panel-soft" />
				</div>
				<div>
					<label for="img-seed" class="block text-[11px] opacity-60 mb-0.5">Seed</label>
					<input id="img-seed" type="number" bind:value={seed} min={-1} max={999999999} class="w-full p-1.5 text-xs border border-sand-dark rounded bg-panel-soft" />
				</div>
			</div>
		</div>
	{/if}

	<!-- Generate Button + Progress -->
	<div class="flex items-center gap-3">
		<Button onclick={generateImage} disabled={isGenerating || !prompt.trim()} class="bits-btn flex-1">
			{#if isGenerating}
				<Icon name="loader-circle" size={16} />
				{currentStep} ({progress}%)
			{:else}
				<Icon name="sparkles" size={16} />
				Generate Image
			{/if}
		</Button>
		{#if history.length > 0}
			<button
				onclick={() => (showHistory = !showHistory)}
				class="text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none p-0"
			>
				History ({history.length})
			</button>
		{/if}
	</div>

	{#if isGenerating}
		<div class="h-1.5 rounded-full bg-sand-dark overflow-hidden">
			<div class="h-full bg-accent rounded-full transition-all duration-300" style="width: {progress}%"></div>
		</div>
	{/if}

	{#if errorMsg}
		<div class="p-2.5 text-xs text-danger border border-danger/20 rounded-lg bg-danger/5">
			{errorMsg}
			<button onclick={() => (errorMsg = null)} class="ml-2 underline cursor-pointer bg-transparent border-none text-danger">dismiss</button>
		</div>
	{/if}

	<!-- Generated Image -->
	{#if generatedImage}
		<div class="border border-accent/30 rounded-lg overflow-hidden">
			<img
				src={generatedImage.imageUrl}
				alt={generatedImage.prompt}
				class="w-full h-auto block"
			/>
			<div class="p-3 space-y-2">
				<p class="text-xs opacity-70 m-0 line-clamp-2">{generatedImage.prompt}</p>
				<div class="flex items-center gap-2 text-[11px] opacity-50">
					<span>{generatedImage.width}x{generatedImage.height}</span>
					<span>seed: {generatedImage.seed}</span>
					{#if generatedImage.processingTime}
						<span>{generatedImage.processingTime}ms</span>
					{/if}
				</div>
				<div class="flex gap-2">
					<Button variant="ghost" size="sm" onclick={() => { prompt = generatedImage!.prompt; generateImage(); }} class="bits-btn text-xs">
						<Icon name="refresh-cw" size={12} /> Regenerate
					</Button>
					{#if caseId}
						<Button variant="ghost" size="sm" onclick={() => useAsEvidence(generatedImage!)} class="bits-btn text-xs">
							<Icon name="file-plus" size={12} /> Use as Evidence
						</Button>
					{/if}
					<Button variant="ghost" size="sm" onclick={() => navigator.clipboard.writeText(generatedImage!.prompt)} class="bits-btn text-xs">
						<Icon name="copy" size={12} /> Copy Prompt
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- History -->
	{#if showHistory && history.length > 0}
		<div class="border-t border-sand-dark pt-3">
			<h4 class="text-xs font-medium m-0 mb-2 opacity-70">Generation History</h4>
			<div class="grid grid-cols-3 gap-2">
				{#each history as item (item.id)}
					<button
						onclick={() => (generatedImage = item)}
						class="border border-sand-dark rounded overflow-hidden cursor-pointer bg-transparent p-0 hover:border-accent transition-colors"
					>
						<img src={item.imageUrl} alt={item.prompt} class="w-full h-20 object-cover block" />
						<p class="text-[10px] p-1 m-0 truncate opacity-60">{item.prompt}</p>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
