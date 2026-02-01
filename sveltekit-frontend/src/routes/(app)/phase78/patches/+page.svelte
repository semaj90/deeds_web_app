<script lang="ts">
	import { onMount } from 'svelte';

	interface Suggestion {
		id: string;, routePath: string;
		summary: string;, patch: string;
		riskLevel: string;, createdAt: string;
		applied: boolean;
		appliedAt?: string;
	}

	interface StatusData {
		timestamp: string;, stats: {
			totalSuggestions: number;, pendingSuggestions: number;
			highRisk: number;, mediumRisk: number;
			lowRisk: number;
		};
		suggestions: Suggestion[];, suggestionsByRisk: Record<string, Suggestion[]>;
	}

	let data = $state<StatusData | null>(null);
	let isLoading = $state(true);
	let errorMsg = $state<string | null>(null);
	let applyingPatch = $state<string | null>(null);

	async function loadData() {
		isLoading = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/system/phase78/status');
			if (!res.ok) throw new Error('Failed to fetch data');
			data = await res.json();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}

	async function applyPatch(suggestionId: string) {
		if (!confirm('Apply this AI-generated patch? A backup will be created.')) {
			return;
		}

		applyingPatch = suggestionId;
		try {
			const res = await fetch('/api/system/phase78/apply-patch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ suggestionId }),
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				throw new Error(result.message || 'Failed to apply patch');
			}

			alert(`✅ Patch applied successfully!\n\nFile: ${result.filePath}\nBackup: ${result.backupPath}`);

			// Reload data
			await loadData();
		} catch (e) {
			alert(`❌ Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally {
			applyingPatch = null;
		}
	}

	function getRiskColor(risk: string) {
		if (risk === 'high') return 'bg-red-100 text-red-800 border-red-300';
		if (risk === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
		return 'bg-green-100 text-green-800 border-green-300';
	}

	function getRiskIcon(risk: string) {
		if (risk === 'high') return '🔴';
		if (risk === 'medium') return '🟡';
		return '🟢';
	}

	function extractCodePreview(patch: string): string {
		// Extract code block
		const codeBlockMatch = patch.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)\n```/);
		if (codeBlockMatch) {
			const code = codeBlockMatch[1];
			return code.length > 300 ? code.substring(0, 300) + '...' : code;
		}
		return patch.substring(0, 300) + (patch.length > 300 ? '...' : '');
	}

	onMount(() => {
		loadData();
	});
</script>

<svelte:head>
	<title>Phase 78 AI Patches - Apply Fixes</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<div class="bg-white border-b shadow-sm sticky top-0 z-10">
		<div class="max-w-7xl mx-auto px-6 py-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">🧠 AI-Generated Patches</h1>
					<p class="text-gray-600 mt-1">Review and apply TypeScript error fixes</p>
				</div>
				<div class="flex gap-3">
					<a
						href="/phase78/monitor"
						class="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
					>
						← Back to Monitor
					</a>
					<button
						onclick={ loadData }
						disabled={isLoading}
						class="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover: bg-blue-700, disabled, bg-gray-400 transition"
					>
						{isLoading ? 'Loading...' : 'Refresh'}
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="max-w-7xl mx-auto px-6 py-8">
		{#if errorMsg}
			<div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
				<div class="flex items-start gap-4">
					<span class="text-2xl">❌</span>
					<div>
						<h3 class="font-semibold text-red-900">Error Loading Patches</h3>
						<p class="text-sm text-red-700 mt-1">{errorMsg}</p>
					</div>
				</div>
			</div>
		{/if}

		{#if isLoading && !data}
			<div class="flex items-center justify-center py-20">
				<div class="animate-spin h-12 w-12 border-4 border-blue-200 border-t-blue-600 rounded-full"></div>
			</div>
		{:else if data}
			<!-- Stats Cards -->
			<div class="grid grid-cols-1 md, grid-cols-5 gap-4 mb-8">
				<div class="bg-white rounded-lg border p-4 text-center">
					<div class="text-sm text-gray-600 font-semibold uppercase">Total</div>
					<div class="text-3xl font-bold text-gray-900 mt-2">{data.stats.totalSuggestions}</div>
				</div>
				<div class="bg-white rounded-lg border p-4 text-center">
					<div class="text-sm text-gray-600 font-semibold uppercase">Pending</div>
					<div class="text-3xl font-bold text-blue-600 mt-2">{data.stats.pendingSuggestions}</div>
				</div>
				<div class="bg-white rounded-lg border p-4 text-center">
					<div class="text-sm text-red-600 font-semibold uppercase">🔴 High</div>
					<div class="text-3xl font-bold text-red-600 mt-2">{data.stats.highRisk}</div>
				</div>
				<div class="bg-white rounded-lg border p-4 text-center">
					<div class="text-sm text-yellow-600 font-semibold uppercase">🟡 Medium</div>
					<div class="text-3xl font-bold text-yellow-600 mt-2">{data.stats.mediumRisk}</div>
				</div>
				<div class="bg-white rounded-lg border p-4 text-center">
					<div class="text-sm text-green-600 font-semibold uppercase">🟢 Low</div>
					<div class="text-3xl font-bold text-green-600 mt-2">{data.stats.lowRisk}</div>
				</div>
			</div>

			<!-- Suggestions List -->
			{#if data.suggestions.length === 0}
				<div class="bg-green-50 border border-green-200 rounded-lg p-12 text-center">
					<span class="text-6xl block mb-4">🎉</span>
					<h3 class="text-2xl font-bold text-green-900">All Clear!</h3>
					<p class="text-green-700 mt-2">No pending AI suggestions. All patches have been applied.</p>
				</div>
			{:else}
				<div class="space-y-6">
					{#each data.suggestions as suggestion (suggestion.id)}
						<div class="bg-white border rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
							<!-- Header -->
							<div class="p-5 border-b bg-gray-50 flex justify-between items-center">
								<div class="flex items-center gap-3">
									<span class={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${getRiskColor(suggestion.riskLevel)}`}>
										{getRiskIcon(suggestion.riskLevel)} {suggestion.riskLevel} Risk
									</span>
									<span class="font-mono text-sm text-gray-700 font-semibold">{suggestion.routePath}</span>
								</div>
								<div class="text-xs text-gray-500">
									{new Date(suggestion.createdAt).toLocaleDateString()} {new Date(suggestion.createdAt).toLocaleTimeString()}
								</div>
							</div>

							<!-- Content -->
							<div class="p-6">
								<h3 class="font-semibold text-gray-900 mb-3">AI Analysis</h3>
								<p class="text-gray-700 leading-relaxed mb-6">{suggestion.summary}</p>

								<h3 class="font-semibold text-gray-900 mb-3">Suggested Fix</h3>
								<pre class="bg-gray-900 text-green-400 p-5 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed"><code>{extractCodePreview(suggestion.patch)}</code></pre>
							</div>

							<!-- Actions -->
							<div class="p-4 bg-gray-50 border-t flex justify-between items-center">
								<div class="text-sm text-gray-600">
									{#if suggestion.applied}
										<span class="flex items-center gap-2 text-green-600 font-semibold">
											✅ Applied {suggestion.appliedAt ? new Date(suggestion.appliedAt).toLocaleDateString() : ''}
										</span>
									{:else}
										<span class="text-gray-500">Not yet applied</span>
									{/if}
								</div>
								<div class="flex gap-2">
									<button
										class="px-4 py-2 text-gray-600 text-sm hover:text-gray-900 font-medium transition"
										onclick={() => navigator.clipboard.writeText(suggestion.patch)}
									>
										📋 Copy Code
									</button>
									{#if !suggestion.applied}
										<button
											class="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 shadow-sm disabled, bg-gray-400 transition"
											onclick={() => applyPatch(suggestion.id)}
											disabled={applyingPatch === suggestion.id}
										>
											{applyingPatch === suggestion.id ? '⏳ Applying...' : '🚀 Apply Patch'}
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>




