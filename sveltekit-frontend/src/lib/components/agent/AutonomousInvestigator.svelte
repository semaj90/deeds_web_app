<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		caseId?: string;
		initialQuery?: string;
		onComplete?: (result: InvestigationResult) => void;
	}

	let { caseId, initialQuery = '', onComplete }: Props = $props();

	interface ToolCall {
		tool: string;
		input: any;
		output: string;
		duration: number;
	}

	interface InvestigationResult {
		answer: string;
		toolCalls: ToolCall[];
		reasoning: string[];
		aceContext?: any;
		duration: number;
		metadata?: {
			userId?: string;
			caseId?: string | null;
			useACE: boolean;
			maxIterations: number;
			timestamp: string;
		};
	}

	interface AgentCapabilities {
		name: string;
		architecture: string;
		model: string;
		tools: Array<{
			name: string;
			category: string;
			description: string;
		}>;
		capabilities: {
			aceContextEngine: boolean;
			multiStepReasoning: boolean;
			parallelToolExecution: boolean;
			maxIterations: number;
			temperature: number;
		};
		examples: Array<{
			query: string;
			expectedTools: string[];
			description: string;
			category?: string;
		}>;
	}

	// State
	let query = $state(initialQuery);
	let useACE = $state(true);
	let maxIterations = $state(10);
	let verbose = $state(false);

	let investigating = $state(false);
	let result = $state<InvestigationResult | null>(null);
	let error = $state<string | null>(null);
	let showAdvanced = $state(false);
	let showCapabilities = $state(false);

	let capabilities = $state<AgentCapabilities | null>(null);
	let loadingCapabilities = $state(false);

	// Load agent capabilities
	async function loadCapabilities() {
		if (capabilities) return;

		loadingCapabilities = true;
		try {
			const res = await fetch('/api/agent/investigate');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			capabilities = await res.json();
		} catch (err) {
			console.error('Failed to load agent capabilities:', err);
		} finally {
			loadingCapabilities = false;
		}
	}

	onMount(() => {
		loadCapabilities();
	});

	// Execute investigation
	async function investigate() {
		if (!query.trim()) {
			error = 'Please enter an investigation query';
			return;
		}

		investigating = true;
		error = null;
		result = null;

		try {
			const res = await fetch('/api/agent/investigate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					useACE,
					maxIterations,
					caseId,
					verbose
				})
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.message || `HTTP ${res.status}`);
			}

			result = await res.json();
			if (onComplete) onComplete(result);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Investigation failed';
		} finally {
			investigating = false;
		}
	}

	// Load example query
	function loadExample(exampleQuery: string) {
		query = exampleQuery;
		showCapabilities = false;
	}

	// Tool category colors
	function getCategoryColor(category: string): string {
		const colors: Record<string, string> = {
			'Evidence Analysis': 'bg-blue-500/20 text-blue-300',
			Multimodal: 'bg-purple-500/20 text-purple-300',
			'Detective Mode': 'bg-amber-500/20 text-amber-300',
			Database: 'bg-green-500/20 text-green-300',
			RAG: 'bg-cyan-500/20 text-cyan-300',
			'Code Analysis': 'bg-pink-500/20 text-pink-300'
		};
		return colors[category] || 'bg-sand/20 text-sand-12';
	}
</script>

<div class="flex flex-col gap-4 app-bg p-4 rounded-lg border border-sand-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Icon name="bot" class="text-accent" />
			<h3 class="text-lg font-semibold text-sand-12">Autonomous Investigator</h3>
		</div>

		<button
			type="button"
			onclick={() => (showCapabilities = !showCapabilities)}
			class="text-sm text-sand-11 hover:text-accent transition-colors flex items-center gap-1"
		>
			<Icon name="info" size="sm" />
			{showCapabilities ? 'Hide' : 'Show'} Capabilities
		</button>
	</div>

	<!-- Capabilities Panel -->
	{#if showCapabilities}
		<div class="panel p-4 space-y-3 border-l-2 border-accent/50">
			{#if loadingCapabilities}
				<div class="text-sm text-sand-11">Loading agent capabilities...</div>
			{:else if capabilities}
				<div class="grid gap-3">
					<!-- Architecture Info -->
					<div class="space-y-1">
						<div class="text-xs text-sand-11">Architecture</div>
						<div class="text-sm text-sand-12 font-medium">{capabilities.architecture}</div>
						<div class="text-xs text-sand-10">Model: {capabilities.model}</div>
					</div>

					<!-- Tools -->
					<div class="space-y-2">
						<div class="text-xs text-sand-11">Available Tools ({capabilities.tools.length})</div>
						<div class="flex flex-wrap gap-2">
							{#each capabilities.tools as tool}
								<div
									class="px-2 py-1 rounded text-xs font-mono {getCategoryColor(tool.category)}"
									title={tool.description}
								>
									{tool.name}
								</div>
							{/each}
						</div>
					</div>

					<!-- Examples -->
					<div class="space-y-2">
						<div class="text-xs text-sand-11">Example Queries</div>
						<div class="space-y-2">
							{#each capabilities.examples as example}
								<button
									type="button"
									onclick={() => loadExample(example.query)}
									class="w-full text-left p-2 rounded bg-panel-soft hover:bg-accent/10 transition-colors border border-sand-6"
								>
									<div class="text-sm text-sand-12 mb-1">{example.query}</div>
									<div class="text-xs text-sand-10">{example.description}</div>
									<div class="flex flex-wrap gap-1 mt-1">
										{#each example.expectedTools as toolName}
											<span class="px-1 py-0.5 rounded text-xs font-mono bg-sand-3 text-sand-11">
												{toolName}
											</span>
										{/each}
									</div>
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Query Input -->
	<div class="space-y-2">
		<label for="agent-query" class="text-sm text-sand-11">Investigation Query</label>
		<textarea
			id="agent-query"
			bind:value={query}
			placeholder="What would you like to investigate? (e.g., 'Analyze evidence ID xyz for forensic patterns')"
			rows="3"
			class="w-full px-3 py-2 bg-panel-soft border border-sand-6 rounded text-sand-12 placeholder:text-sand-9 focus:outline-none focus:border-accent transition-colors resize-none"
		/>
	</div>

	<!-- Advanced Options -->
	<div class="space-y-2">
		<button
			type="button"
			onclick={() => (showAdvanced = !showAdvanced)}
			class="text-sm text-sand-11 hover:text-accent transition-colors flex items-center gap-1"
		>
			<Icon name={showAdvanced ? 'chevron-down' : 'chevron-right'} size="sm" />
			Advanced Options
		</button>

		{#if showAdvanced}
			<div class="grid gap-3 pl-6 border-l-2 border-sand-6">
				<!-- ACE Context Toggle -->
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={useACE} class="rounded border-sand-6" />
					<span class="text-sm text-sand-11">
						Use ACE Context Engine (7 parallel data sources)
					</span>
				</label>

				<!-- Verbose Logging -->
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={verbose} class="rounded border-sand-6" />
					<span class="text-sm text-sand-11">Verbose logging (intermediate steps)</span>
				</label>

				<!-- Max Iterations -->
				<div class="space-y-1">
					<label for="max-iter" class="text-sm text-sand-11">
						Max Tool Invocations: {maxIterations}
					</label>
					<input
						id="max-iter"
						type="range"
						bind:value={maxIterations}
						min="1"
						max="20"
						step="1"
						class="w-full"
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Action Button -->
	<Button onclick={investigate} disabled={investigating || !query.trim()} class="w-full">
		{#if investigating}
			<Icon name="loader-2" class="animate-spin" />
			Investigating...
		{:else}
			<Icon name="play" />
			Start Investigation
		{/if}
	</Button>

	<!-- Error Display -->
	{#if error}
		<div class="p-3 bg-danger/10 border border-danger/30 rounded text-sm text-danger">
			<div class="flex items-start gap-2">
				<Icon name="alert-circle" size="sm" class="mt-0.5" />
				<div>{error}</div>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if result}
		<div class="space-y-4 border-t border-sand-6 pt-4">
			<!-- Answer -->
			<div class="space-y-2">
				<div class="flex items-center gap-2">
					<Icon name="check-circle" class="text-green-500" />
					<h4 class="font-semibold text-sand-12">Investigation Complete</h4>
					<span class="text-xs text-sand-10">({result.duration}ms)</span>
				</div>
				<div class="panel p-4 text-sm text-sand-12 whitespace-pre-wrap">{result.answer}</div>
			</div>

			<!-- Tool Calls -->
			{#if result.toolCalls?.length > 0}
				<div class="space-y-2">
					<h5 class="text-sm font-medium text-sand-11">
						Tool Calls ({result.toolCalls.length})
					</h5>
					<div class="space-y-2">
						{#each result.toolCalls as toolCall, idx}
							<details class="panel p-3 cursor-pointer">
								<summary class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span class="text-xs text-sand-10">#{idx + 1}</span>
										<code class="text-sm font-mono text-accent">{toolCall.tool}</code>
									</div>
									<span class="text-xs text-sand-10">{toolCall.duration}ms</span>
								</summary>
								<div class="mt-2 space-y-2 text-xs">
									<div>
										<div class="text-sand-11 mb-1">Input:</div>
										<pre
											class="bg-sand-3 p-2 rounded overflow-x-auto text-sand-12">{JSON.stringify(toolCall.input, null, 2)}</pre>
									</div>
									<div>
										<div class="text-sand-11 mb-1">Output:</div>
										<pre class="bg-sand-3 p-2 rounded overflow-x-auto text-sand-12 max-h-64">{toolCall.output}</pre>
									</div>
								</div>
							</details>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Reasoning Steps -->
			{#if result.reasoning?.length > 0}
				<div class="space-y-2">
					<h5 class="text-sm font-medium text-sand-11">
						Reasoning Steps ({result.reasoning.length})
					</h5>
					<ol class="space-y-1 list-decimal list-inside text-sm text-sand-12">
						{#each result.reasoning as step}
							<li class="text-sand-10">{step}</li>
						{/each}
					</ol>
				</div>
			{/if}

			<!-- ACE Context Metadata -->
			{#if result.aceContext}
				<details class="panel p-3 cursor-pointer">
					<summary class="text-sm font-medium text-sand-11">ACE Context Engine Data</summary>
					<pre
						class="mt-2 text-xs bg-sand-3 p-2 rounded overflow-x-auto text-sand-12 max-h-96">{JSON.stringify(result.aceContext, null, 2)}</pre>
				</details>
			{/if}

			<!-- Metadata -->
			{#if result.metadata}
				<div class="text-xs text-sand-10 flex flex-wrap gap-2">
					<span>Case: {result.metadata.caseId || 'N/A'}</span>
					<span>•</span>
					<span>ACE: {result.metadata.useACE ? 'Enabled' : 'Disabled'}</span>
					<span>•</span>
					<span>Max Iterations: {result.metadata.maxIterations}</span>
					<span>•</span>
					<span>{new Date(result.metadata.timestamp).toLocaleString()}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
