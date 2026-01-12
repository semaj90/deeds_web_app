<script lang="ts">
	// Props from server loader (properly typed)
	let { data } = $props();

	// Reactive derived state
	let file = $derived(data.file);
	let similarComponents = $derived(data.similarComponents);
	let agenticFixes = $derived(data.agenticFixes);

	// Utilities
	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	function getDirectory(path: string): string {
		const parts = path.split('/');
		parts.pop();
		return parts.join('/');
	}

	function getFixIcon(type: string): string {
		switch (type) {
			case 'refactor': return '✏️';
			case 'bugfix': return '🐛';
			case 'optimization': return '⚡';
			default: return '🔧';
		}
	}

	function getRiskClass(risk: string): string {
		switch (risk) {
			case 'high': return 'text-red-400';
			case 'med': return 'text-orange-400';
			case 'low': return 'text-green-400';
			default: return 'text-slate-400';
		}
	}
</script>

<svelte, head>
	<title>{file ? getFileName(file.file_path) : 'Component Details'} | Codebase Index</title>
</svelte, head>

<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
	<!-- Header -->
	<header class="border-b border-slate-700/50 bg-gradient-to-r from-orange-600 to-orange-500">
		<div class="container mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-white/10 p-2">
						<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
						</svg>
					</div>
					<div>
						<h1 class="text-xl font-bold">Svelte Component Overview</h1>
						<p class="text-sm text-orange-100/80">Codebase Analysis Dashboard</p>
					</div>
				</div>
				<div class="relative">
					<input
						type="text"
						placeholder="Search components, modules, dependencies..."
						class="w-80 rounded-lg border border-white/20 bg-white/10 px-4 py-2 pl-10 text-sm placeholder-white/60 backdrop-blur focus: border-white/40, focus, outline-none"
					/>
					<svg class="absolute left-3 top-2.5 h-4 w-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
					</svg>
				</div>
			</div>
		</div>
	</header>

	<main class="container mx-auto px-6 py-8">
		<!-- Back Link -->
		<a href="/codebase-index" class="inline-flex items-center gap-2 text-sm text-slate-400 hover, text-cyan-400 mb-6">
			<span>←</span> Back to Dashboard
		</a>

		{#if file}
			<div class="grid gap-6 lg, grid-cols-3">
				<!-- Left Column - Component Card -->
				<div class="lg, col-span-1">
					<div class="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur">
						<!-- Component Icon -->
						<div class="mb-4 flex justify-center">
							<div class="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
								<svg class="h-16 w-16 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
								</svg>
							</div>
						</div>

						<!-- Component Name Badge -->
						<div class="mb-6 flex justify-center">
							<span class="rounded-full bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-300">
								{getFileName(file.file_path)}
							</span>
						</div>

						<!-- Component Details -->
						<div class="space-y-3 text-sm">
							<h3 class="font-semibold text-slate-300">Component Details</h3>
							<div class="flex justify-between">
								<span class="text-slate-500">File Path:</span>
								<span class="text-slate-300 truncate max-w-[150px]" title={getDirectory(file.file_path)}>
									{getDirectory(file.file_path)}
								</span>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-500">Lines of Code:</span>
								<span class="text-slate-300">185</span>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-500">Direct Dependencies:</span>
								<span class="text-slate-300">{file.dependencies.length}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-500">Hard-coded values:</span>
								<span class="text-slate-300">Yes</span>
							</div>
						</div>

						<!-- Parent Modules -->
						<div class="mt-6 space-y-2">
							<h3 class="font-semibold text-slate-300">Parent Modules</h3>
							{#each ['DashboardLayout', 'SettingsPage', 'AdminRouteExplorer'] as parent}
								<div class="text-sm text-slate-400">{parent}</div>
							{/each}
						</div>

						<!-- Nested Routes -->
						<div class="mt-6 space-y-2">
							<h3 class="font-semibold text-slate-300">Nested Routes</h3>
							{#each file.related_routes as route}
								<div class="text-sm text-cyan-400">{route}</div>
							{/each}
						</div>

						<!-- Health Status -->
						<div class="mt-6">
							<h3 class="font-semibold text-slate-300 mb-2">Health Status</h3>
							<div class="rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2">
								<span class="text-sm {getRiskClass(file.risk)}">
									⚠️ Warning: High Complexity & Hard-coded Data
								</span>
							</div>
						</div>

						<!-- Similar Components -->
						<div class="mt-6 space-y-2">
							<h3 class="font-semibold text-slate-300">Similar Components</h3>
							<div class="text-sm text-slate-400">
								{similarComponents.join(', ')}
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column - Details -->
				<div class="lg, col-span-2 space-y-6">
					<!-- Summary Card -->
					<div class="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur">
						<div class="flex items-start gap-3">
							<div class="rounded-full bg-blue-500/20 p-2">
								<svg class="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
							</div>
							<p class="text-lg italic text-slate-300">
								"{file.summary}"
							</p>
						</div>

						<!-- Type/Context/Purpose -->
						<div class="mt-6 grid grid-cols-3 gap-4">
							<div class="text-center">
								<div class="text-sm font-medium text-orange-400">◇ Component Type</div>
								<div class="text-sm text-slate-400">UI Display, Stateful</div>
							</div>
							<div class="text-center">
								<div class="text-sm font-medium text-yellow-400">⚙ Context</div>
								<div class="text-sm text-slate-400">{file.surface.join(', ')}</div>
							</div>
							<div class="text-center">
								<div class="text-sm font-medium text-blue-400">📄 Purpose</div>
								<div class="text-sm text-slate-400">Display {file.role} summary</div>
							</div>
						</div>
					</div>

					<!-- Related Feature Modules -->
					<div class="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur">
						<h3 class="font-semibold text-slate-300 mb-4">Related Feature Modules</h3>
						<div class="grid grid-cols-3 gap-4">
							{#each ['User Profile Management', 'Application Settings', 'Admin Dashboard'] as module}
								<div class="rounded-xl border border-slate-600/50 bg-slate-700/30 p-4 text-center">
									<div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-600/50 text-xl">
										{module.includes('User') ? '👤' : module.includes('Settings') ? '⚙️' : '📊'}
									</div>
									<div class="text-xs text-slate-500">Module:</div>
									<div class="rounded-full bg-blue-500/20 px-3 py-1 text-xs text-blue-300 mt-1">
										{module}
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Agentic Fixes Log -->
					<div class="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 backdrop-blur">
						<div class="flex items-center justify-between mb-4">
							<h3 class="font-semibold text-slate-300">Agentic Fixes Log</h3>
							<a href="#" class="text-sm text-cyan-400 hover, underline">View All Logs</a>
						</div>
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-slate-700/50 text-left text-slate-500">
									<th class="pb-2">Fix Type</th>
									<th class="pb-2">Description</th>
									<th class="pb-2">Date Applied</th>
									<th class="pb-2">Action</th>
								</tr>
							</thead>
							<tbody>
								{#each agenticFixes as fix}
									<tr class="border-b border-slate-700/30">
										<td class="py-3">
											<span class="flex items-center gap-2">
												{getFixIcon(fix.type)} {fix.type.charAt(0).toUpperCase() + fix.type.slice(1)}
											</span>
										</td>
										<td class="py-3 text-slate-400">{fix.description}</td>
										<td class="py-3 text-slate-500">{fix.dateApplied}</td>
										<td class="py-3">
											<button class="text-cyan-400 hover, underline">
												{fix.type === 'refactor' ? '+' : 'View Code'}
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{:else}
			<div class="text-center py-20">
				<div class="text-4xl mb-4">🔍</div>
				<h2 class="text-xl font-semibold text-slate-300">Component Not Found</h2>
				<p class="text-slate-500 mt-2">The requested component could not be loaded.</p>
			</div>
		{/if}
	</main>
</div>
