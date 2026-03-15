<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	// Props from server load (properly typed via SvelteKit)
	let { data } = $props();

	// Reactive derived state from server data
	let files = $derived(data.files || []);
	let stats = $derived(data.stats || {
		totalFiles: 0,
		byRole: {},
	byRisk: {},
	bySurface: {}
	});
	let error = $derived(data.error);

	// Local UI state
	let searchQuery = $state('');
	let selectedRole = $state('all');
	let selectedRisk = $state('all');
	let loading = $state(false);

	function refreshData() {
		invalidateAll();
	}

	// Computed filtered files
	let filteredFiles = $derived(() => {
		let result = Array.isArray(files) ? [...files] : [];

		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			result = result.filter(f =>
				f.payload.file_path.toLowerCase().includes(q) ||
				f.payload.summary.toLowerCase().includes(q) ||
				f.payload.tags.some(t => t.toLowerCase().includes(q))
			);
		}

		if (selectedRole !== 'all') {
			result = result.filter(f => f.payload.role === selectedRole);
		}

		if (selectedRisk !== 'all') {
			result = result.filter(f => f.payload.risk === selectedRisk);
		}

		return result;
	});

	function getRiskColor(risk: string): string {
		switch (risk) {
			case 'high': return 'bg-red-500/20 text-red-400 border-red-500/50';
			case 'med': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
			case 'low': return 'bg-green-500/20 text-green-400 border-green-500/50';
			default:return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
		}
	}

	function getRoleIcon(role: string): string {
		switch (role) {
			case 'route': return '📄';
			case 'service': return '⚙️';
			case 'component': return '🧩';
			case 'utility': return '🔧';
			case 'schema': return '📋';
			case 'worker': return '👷';
			default:return '📁';
		}
	}

	function getFileName(path: string): string {
		return path.split('/').pop() || path;
	}

	function getDirectory(path: string): string {
		const parts = path.split('/');
		parts.pop();
		return parts.join('/');
	}
</script>

<svelte:head>
	<title>Codebase Index | ACE Admin</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
	<!-- Header -->
	<header class="border-b border-slate-700/50 bg-gradient-to-r from-orange-600 to-orange-500">
		<div class="container mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-white/10 p-2">
						<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
						</svg>
					</div>
					<div>
						<h1 class="text-xl font-bold">Codebase Index</h1>
						<p class="text-sm text-orange-100/80">ACE Analysis Dashboard</p>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<div class="relative">
						<input
							type="text"
							placeholder="Search components, modules, dependencies..."
							bind:value={searchQuery}
							class="w-80 rounded-lg border border-white/20 bg-white/10 px-4 py-2 pl-10 text-sm placeholder-white/60 backdrop-blur focus:border-white/40 focus:outline-none"
						/>
						<svg class="absolute left-3 top-2.5 h-4 w-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
						</svg>
					</div>
					<button
						onclick={refreshData}
						class="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 transition-colors"
					>
						🔄 Refresh
					</button>
				</div>
			</div>
		</div>
	</header>

	<main class="container mx-auto px-6 py-8">
		<!-- Stats Cards -->
		<div class="mb-8 grid grid-cols-4 gap-4">
			<div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur">
				<div class="text-3xl font-bold text-cyan-400">{stats.totalFiles}</div>
				<div class="text-sm text-slate-400">Total Indexed Files</div>
			</div>
			<div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur">
				<div class="text-3xl font-bold text-purple-400">{Object.keys(stats.byRole).length}</div>
				<div class="text-sm text-slate-400">Role Types</div>
			</div>
			<div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur">
				<div class="text-3xl font-bold text-green-400">{stats.byRisk['low'] || 0}</div>
				<div class="text-sm text-slate-400">Low Risk Files</div>
			</div>
			<div class="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur">
				<div class="text-3xl font-bold text-red-400">{stats.byRisk['high'] || 0}</div>
				<div class="text-sm text-slate-400">High Risk Files</div>
			</div>
		</div>

		<!-- Filters -->
		<div class="mb-6 flex items-center gap-4">
			<div class="flex items-center gap-2">
				<label for="codebase-role-filter" class="text-sm text-slate-400">Role:</label>
				<select
					id="codebase-role-filter"
					bind:value={selectedRole}
					class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm focus:border-cyan-500 focus:outline-none"
				>
					<option value="all">All Roles</option>
					<option value="route">Routes</option>
					<option value="service">Services</option>
					<option value="component">Components</option>
					<option value="utility">Utilities</option>
					<option value="schema">Schemas</option>
				</select>
			</div>
			<div class="flex items-center gap-2">
				<label for="codebase-risk-filter" class="text-sm text-slate-400">Risk:</label>
				<select
					id="codebase-risk-filter"
					bind:value={selectedRisk}
					class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm focus:border-cyan-500 focus:outline-none"
				>
					<option value="all">All Risk Levels</option>
					<option value="high">High Risk</option>
					<option value="med">Medium Risk</option>
					<option value="low">Low Risk</option>
				</select>
			</div>
			<div class="ml-auto text-sm text-slate-400">
				Showing {filteredFiles().length} of {files.length} files
			</div>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-20">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
				<span class="ml-3 text-slate-400">Loading indexed files...</span>
			</div>
		{:else if error}
			<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-6">
				<h3 class="font-semibold text-amber-400">⚠️ Backend Status</h3>
				<p class="mt-2 text-sm text-slate-300">{error}</p>
				<p class="mt-1 text-sm text-slate-400">Showing cached/demo view.</p>
			</div>
		{/if}

		<!-- File Cards Grid -->
		<div class="grid gap-4">
			{#each filteredFiles() as file (file.id)}
				<div class="group rounded-xl border border-slate-700/50 bg-slate-800/30 p-5 backdrop-blur transition-all hover:border-cyan-500/50 hover:bg-slate-800/50">
					<div class="flex items-start gap-4">
						<!-- Icon -->
						<div class="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-2xl">
							{getRoleIcon(file.payload.role)}
						</div>

						<!-- Main Content -->
						<div class="flex-1">
							<div class="flex items-start justify-between">
								<div>
									<h3 class="font-semibold text-white group-hover:text-cyan-400 transition-colors">
										{getFileName(file.payload.file_path)}
									</h3>
									<p class="text-sm text-slate-400">{getDirectory(file.payload.file_path)}</p>
								</div>
								<div class="flex items-center gap-2">
									<span class="rounded-full border px-2 py-0.5 text-xs {getRiskColor(file.payload.risk)}">
										{file.payload.risk} risk
									</span>
									<span class="rounded-full border border-slate-600 bg-slate-700/50 px-2 py-0.5 text-xs text-slate-300">
										{file.payload.role}
									</span>
								</div>
							</div>

							<!-- Summary -->
							<p class="mt-3 text-sm text-slate-300 italic">
								"{file.payload.summary}"
							</p>

							<!-- Tags -->
							<div class="mt-3 flex flex-wrap gap-2">
								{#each file.payload.surface as surface}
									<span class="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
										{surface}
									</span>
								{/each}
								{#each file.payload.tags.slice(0, 4) as tag}
									<span class="rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
										{tag}
									</span>
								{/each}
							</div>

							<!-- Footer Metrics -->
							<div class="mt-4 flex items-center gap-6 text-xs text-slate-500">
								<span>📦 {file.payload.dependencies.length} deps</span>
								<span>📤 {file.payload.exports.length} exports</span>
								<span>📥 {file.payload.imports.length} imports</span>
								<span>💬 {file.payload.comments.length} comments</span>
								<span class="ml-auto">
									🕐 {new Date(file.payload.generated_at).toLocaleDateString()}
								</span>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if !loading && filteredFiles().length === 0}
			<div class="rounded-xl border border-slate-700/50 bg-slate-800/30 p-12 text-center">
				<div class="text-4xl">🔍</div>
				<h3 class="mt-4 font-semibold text-slate-300">No files found</h3>
				<p class="mt-2 text-sm text-slate-500">Try adjusting your search or filters.</p>
			</div>
		{/if}
	</main>
</div>



