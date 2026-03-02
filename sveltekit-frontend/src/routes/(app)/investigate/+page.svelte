<script lang="ts">
	import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Investigation {
		id: string;
		query: string;
		result: any;
		timestamp: Date;
	}

	let investigations = $state<Investigation[]>([]);
	let selectedExample = $state<string>('');

	// Example queries organized by category
	const exampleQueries = {
		'Detective Mode': [
			'Find all TODO comments and create a prioritized implementation roadmap',
			'Find all Svelte 4 patterns needing migration to Svelte 5',
			'Which files import bits-ui Dialog component?',
			'Count how many times any type is used in TypeScript files',
			'Review drizzle migrations for dangerous DROP TABLE statements'
		],
		'Codebase Analysis': [
			'How many training datasets exist and what infrastructure is missing?',
			'Which API endpoints are broken or returning 500 errors?',
			'Is Redis configured with connection pooling?',
			'What would break if we remove @lucide/svelte package?',
			'Show me the contents of the Icon.svelte component'
		],
		'Web Search': [
			'How do I migrate Svelte 4 to Svelte 5?',
			'What are LangChain ReAct agents?',
			'How to prevent SQL injection in Drizzle ORM?',
			'What is ripgrep and how does it work?',
			'Explain SearXNG self-hosted search engine'
		],
		'Multi-Step Investigations': [
			'Find all TypeScript any types and suggest how to fix them',
			'Analyze the evidence upload pipeline and identify bottlenecks',
			'Create a dependency graph for all Svelte components',
			'Audit the codebase for security vulnerabilities',
			'Generate a migration plan from Svelte 4 to Svelte 5'
		]
	};

	function handleComplete(result: any, query: string) {
		investigations.unshift({
			id: crypto.randomUUID(),
			query,
			result,
			timestamp: new Date()
		});
		investigations = investigations; // Trigger reactivity
	}

	function loadExample(query: string) {
		selectedExample = query;
		// Scroll to investigator
		document.getElementById('investigator')?.scrollIntoView({ behavior: 'smooth' });
	}

	function clearHistory() {
		if (confirm('Clear all investigation history?')) {
			investigations = [];
		}
	}

	function deleteInvestigation(id: string) {
		investigations = investigations.filter((inv) => inv.id !== id);
	}

	function exportInvestigation(investigation: Investigation) {
		const blob = new Blob([JSON.stringify(investigation.result, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `investigation-${investigation.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>AI Investigation Center - Autonomous Agent</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-6 space-y-8">
	<!-- Header -->
	<div class="flex items-center gap-4">
		<Icon name="bot" size="xl" class="text-accent" />
		<div>
			<h1 class="text-3xl font-bold text-sand-12">AI Investigation Center</h1>
			<p class="text-sand-11 mt-1">
				Autonomous multi-step investigation with 14 FastMCP tools
			</p>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<div class="panel p-4">
			<div class="flex items-center gap-2 mb-2">
				<Icon name="wrench" class="text-accent" />
				<div class="text-sm text-sand-11">Tools Available</div>
			</div>
			<div class="text-2xl font-bold text-sand-12">14</div>
			<div class="text-xs text-sand-10 mt-1">6 Detective + 8 Evidence</div>
		</div>

		<div class="panel p-4">
			<div class="flex items-center gap-2 mb-2">
				<Icon name="search" class="text-accent" />
				<div class="text-sm text-sand-11">Investigations</div>
			</div>
			<div class="text-2xl font-bold text-sand-12">{investigations.length}</div>
			<div class="text-xs text-sand-10 mt-1">This session</div>
		</div>

		<div class="panel p-4">
			<div class="flex items-center gap-2 mb-2">
				<Icon name="zap" class="text-accent" />
				<div class="text-sm text-sand-11">Avg Duration</div>
			</div>
			<div class="text-2xl font-bold text-sand-12">
				{investigations.length > 0
					? Math.round(
							investigations.reduce((sum, inv) => sum + (inv.result?.duration || 0), 0) /
								investigations.length
						)
					: 0}ms
			</div>
			<div class="text-xs text-sand-10 mt-1">Last 10 queries</div>
		</div>

		<div class="panel p-4">
			<div class="flex items-center gap-2 mb-2">
				<Icon name="activity" class="text-accent" />
				<div class="text-sm text-sand-11">Architecture</div>
			</div>
			<div class="text-sm font-semibold text-sand-12">ReAct Agent</div>
			<div class="text-xs text-sand-10 mt-1">LangChain + Ollama</div>
		</div>
	</div>

	<!-- Example Queries -->
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold text-sand-12">Example Queries</h2>
			<div class="text-xs text-sand-10">Click any example to load it</div>
		</div>

		<div class="space-y-4">
			{#each Object.entries(exampleQueries) as [category, queries]}
				<div class="panel p-4">
					<h3 class="text-sm font-medium text-sand-11 mb-3">{category}</h3>
					<div class="grid grid-cols-1 gap-2">
						{#each queries as query}
							<button
								type="button"
								onclick={() => loadExample(query)}
								class="text-left p-3 rounded bg-panel-soft hover:bg-accent/10 transition-colors border border-sand-6 hover:border-accent/50 text-sm text-sand-12"
							>
								{query}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Main Investigator -->
	<div id="investigator" class="scroll-mt-6">
		<AutonomousInvestigator
			initialQuery={selectedExample}
			onComplete={(result) => handleComplete(result, result.metadata?.query || selectedExample)}
		/>
	</div>

	<!-- Investigation History -->
	{#if investigations.length > 0}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-sand-12">Investigation History</h2>
				<button
					type="button"
					onclick={clearHistory}
					class="text-sm text-danger hover:underline flex items-center gap-1"
				>
					<Icon name="trash-2" size="sm" />
					Clear All
				</button>
			</div>

			<div class="space-y-4">
				{#each investigations as investigation (investigation.id)}
					<details class="panel p-4">
						<summary class="cursor-pointer flex items-center justify-between">
							<div class="flex-1">
								<div class="text-sand-12 font-medium">{investigation.query}</div>
								<div class="text-xs text-sand-10 mt-1 flex items-center gap-4">
									<span>{investigation.timestamp.toLocaleString()}</span>
									<span>•</span>
									<span>{investigation.result?.duration || 0}ms</span>
									<span>•</span>
									<span>{investigation.result?.toolCalls?.length || 0} tools used</span>
								</div>
							</div>
							<div class="flex items-center gap-2 ml-4">
								<button
									type="button"
									onclick={() => exportInvestigation(investigation)}
									class="p-2 rounded hover:bg-accent/10 text-sand-11 hover:text-accent"
									title="Export as JSON"
								>
									<Icon name="download" size="sm" />
								</button>
								<button
									type="button"
									onclick={() => deleteInvestigation(investigation.id)}
									class="p-2 rounded hover:bg-danger/10 text-sand-11 hover:text-danger"
									title="Delete"
								>
									<Icon name="trash-2" size="sm" />
								</button>
							</div>
						</summary>

						<div class="mt-4 pt-4 border-t border-sand-6 space-y-4">
							<!-- Answer -->
							<div>
								<div class="text-sm font-medium text-sand-11 mb-2">Answer</div>
								<div class="panel p-3 text-sm text-sand-12 whitespace-pre-wrap">
									{investigation.result?.answer || 'No answer'}
								</div>
							</div>

							<!-- Tool Calls -->
							{#if investigation.result?.toolCalls?.length > 0}
								<div>
									<div class="text-sm font-medium text-sand-11 mb-2">
										Tool Calls ({investigation.result.toolCalls.length})
									</div>
									<div class="space-y-2">
										{#each investigation.result.toolCalls as toolCall, idx}
											<div class="panel-soft p-3 text-xs">
												<div class="flex items-center justify-between mb-2">
													<code class="text-accent font-mono">{toolCall.tool}</code>
													<span class="text-sand-10">{toolCall.duration}ms</span>
												</div>
												<div class="space-y-1">
													<div class="text-sand-11">Input:</div>
													<pre class="bg-sand-3 p-2 rounded overflow-x-auto text-sand-12">{JSON.stringify(toolCall.input, null, 2)}</pre>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</details>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Footer Info -->
	<div class="panel p-6 text-sm text-sand-11 space-y-3">
		<h3 class="text-sand-12 font-semibold mb-2">About the Autonomous Investigator</h3>
		<ul class="space-y-2">
			<li class="flex items-start gap-2">
				<Icon name="check-circle" size="sm" class="text-accent mt-0.5" />
				<span
					><strong>14 FastMCP Tools:</strong> Evidence analysis, multimodal processing, codebase investigation,
					web search, and database queries</span
				>
			</li>
			<li class="flex items-start gap-2">
				<Icon name="check-circle" size="sm" class="text-accent mt-0.5" />
				<span
					><strong>ReAct Architecture:</strong> Reasons about which tools to use, then acts with those
					tools in a multi-step workflow</span
				>
			</li>
			<li class="flex items-start gap-2">
				<Icon name="check-circle" size="sm" class="text-accent mt-0.5" />
				<span
					><strong>ACE Context Engine:</strong> Optionally assembles context from 7 parallel data
					sources for enhanced investigation</span
				>
			</li>
			<li class="flex items-start gap-2">
				<Icon name="check-circle" size="sm" class="text-accent mt-0.5" />
				<span
					><strong>Detective Mode Training:</strong> 500 examples teaching codebase investigation with
					ripgrep, find, web search, and pattern analysis</span
				>
			</li>
		</ul>

		<div class="pt-3 border-t border-sand-6 text-xs text-sand-10">
			<strong>Tech Stack:</strong> LangChain + Ollama (gemma3-legal:latest) + 14 FastMCP Tools + ACE
			Context Engine + SearXNG (optional)
		</div>
	</div>
</div>

<style>
	details summary::-webkit-details-marker {
		display: none;
	}

	details summary::marker {
		content: '';
	}

	details summary::before {
		content: '▶';
		display: inline-block;
		margin-right: 0.5rem;
		transition: transform 0.2s;
	}

	details[open] summary::before {
		transform: rotate(90deg);
	}
</style>
