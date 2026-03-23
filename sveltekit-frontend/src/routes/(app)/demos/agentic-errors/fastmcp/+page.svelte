<script lang="ts">
	interface Tool {
		name: string;
		description: string;
		permissions: string[];
	}

	interface ExecutionResult {
		success: boolean;
		result?: unknown;
		error?: string;
		timestamp?: string;
	}

	let tools = $state<Tool[]>([]);
	let selectedTool = $state<Tool | null>(null);
	let argsInput = $state('{}');
	let executionResult = $state<ExecutionResult | null>(null);
	let executionHistory = $state<Array<{ tool: string; result: ExecutionResult; timestamp: string }>>([]);
	let loading = $state(false);
	let executing = $state(false);

	async function fetchTools() {
		loading = true;
		try {
			const res = await fetch('/api/tools/execute');
			const data = await res.json();
			tools = data.tools || [];
		} catch (err) {
			console.error('Failed to fetch tools:', err);
		} finally {
			loading = false;
		}
	}

	async function executeTool() {
		if (!selectedTool) return;
		executing = true;
		executionResult = null;
		try {
			let parsedArgs: unknown = undefined;
			try {
				parsedArgs = JSON.parse(argsInput);
			} catch {
				executionResult = { success: false, error: 'Invalid JSON in args field' };
				return;
			}

			const res = await fetch('/api/tools/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tool: selectedTool.name,
					args: parsedArgs
				})
			});
			const data: ExecutionResult = await res.json();
			executionResult = data;
			executionHistory = [
				{ tool: selectedTool.name, result: data, timestamp: new Date().toISOString() },
				...executionHistory.slice(0, 19)
			];
		} catch (err) {
			executionResult = {
				success: false,
				error: err instanceof Error ? err.message : 'Execution failed'
			};
		} finally {
			executing = false;
		}
	}

	function selectTool(tool: Tool) {
		selectedTool = tool;
		argsInput = '{}';
		executionResult = null;
	}

	$effect(() => {
		fetchTools();
	});
</script>

<svelte:head>
	<title>FastMCP Tools - Agentic Errors</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-black tracking-wide uppercase">FastMCP Tool Registry</h1>
		<p class="text-black/60 mt-2">
			Browse and execute registered ACE tools with JSON Schema validation
		</p>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Tool List -->
		<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-lg font-bold text-black uppercase tracking-wide">Tools ({tools.length})</h2>
				<button
					onclick={fetchTools}
					disabled={loading}
					class="px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
				>
					{loading ? 'Loading...' : 'Refresh'}
				</button>
			</div>

			{#if tools.length > 0}
				<div class="space-y-2 max-h-[65vh] overflow-y-auto">
					{#each tools as tool}
						<button
							onclick={() => selectTool(tool)}
							class="w-full text-left p-3 rounded-lg border-2 transition-colors {
								selectedTool?.name === tool.name
									? 'border-accent bg-accent/10'
									: 'border-black/20 bg-sand/10 hover:border-accent/50'
							}"
						>
							<div class="font-bold text-sm text-accent font-mono">{tool.name}</div>
							<div class="text-xs text-black/60 mt-1 line-clamp-2">{tool.description}</div>
							{#if tool.permissions?.length > 0}
								<div class="flex gap-1 mt-2">
									{#each tool.permissions as perm}
										<span class="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded">{perm}</span>
									{/each}
								</div>
							{/if}
						</button>
					{/each}
				</div>
			{:else if !loading}
				<div class="text-center text-black/60 py-8">
					No tools registered. Check tool handler configuration.
				</div>
			{/if}
		</div>

		<!-- Execution Panel -->
		<div class="lg:col-span-2 space-y-4">
			{#if selectedTool}
				<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
					<h2 class="text-xl font-bold text-accent mb-1 font-mono">{selectedTool.name}</h2>
					<p class="text-black/60 text-sm mb-4">{selectedTool.description}</p>

					<div class="mb-4">
						<label for="args-input" class="text-sm text-black/60 uppercase tracking-wide block mb-2">
							Arguments (JSON)
						</label>
						<textarea
							id="args-input"
							bind:value={argsInput}
							rows={4}
							class="w-full bg-sand/10 border-2 border-black/20 rounded-lg p-3 font-mono text-sm text-black focus:outline-none focus:border-accent"
							placeholder={'{\u007D'}
						></textarea>
					</div>

					<button
						onclick={executeTool}
						disabled={executing}
						class="w-full px-4 py-3 bg-accent hover:bg-accent/80 text-white rounded-lg font-bold disabled:opacity-50 transition-colors"
					>
						{executing ? 'Executing...' : 'Execute Tool'}
					</button>
				</div>

				<!-- Result -->
				{#if executionResult}
					<div class="bg-panel border-2 {executionResult.success ? 'border-green-600' : 'border-danger'} rounded-lg p-6">
						<div class="flex items-center gap-2 mb-3">
							<span class="text-lg">{executionResult.success ? '✓' : '✕'}</span>
							<h3 class="font-bold text-black uppercase tracking-wide text-sm">
								{executionResult.success ? 'Success' : 'Failed'}
							</h3>
						</div>

						{#if executionResult.error}
							<div class="bg-danger/10 border border-danger rounded p-3 text-sm text-danger mb-3">
								{executionResult.error}
							</div>
						{/if}

						{#if executionResult.result != null}
							<pre class="bg-black/90 text-green-400 rounded p-4 text-xs font-mono overflow-x-auto max-h-[40vh] overflow-y-auto">{JSON.stringify(executionResult.result, null, 2)}</pre>
						{/if}
					</div>
				{/if}
			{:else}
				<div class="bg-panel border-2 border-black/20 rounded-lg p-12 text-center">
					<div class="text-4xl mb-4">🔧</div>
					<p class="text-black/60">Select a tool from the registry to execute</p>
				</div>
			{/if}

			<!-- Execution History -->
			{#if executionHistory.length > 0}
				<div class="bg-panel border-2 border-black/20 rounded-lg p-6">
					<h3 class="text-sm font-bold text-black uppercase tracking-wide mb-3">
						Execution History ({executionHistory.length})
					</h3>
					<div class="space-y-2 max-h-[30vh] overflow-y-auto">
						{#each executionHistory as entry}
							<div class="flex items-center gap-3 p-2 bg-sand/10 rounded border border-black/10">
								<span class="text-sm">{entry.result.success ? '✓' : '✕'}</span>
								<span class="font-mono text-xs text-accent flex-1">{entry.tool}</span>
								<span class="text-[10px] text-black/40">
									{new Date(entry.timestamp).toLocaleTimeString()}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
