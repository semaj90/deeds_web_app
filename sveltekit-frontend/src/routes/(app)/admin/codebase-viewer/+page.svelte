<script lang="ts">
	import { Tabs } from 'bits-ui';

	let { data } = $props();

	let selectedCollection = $state<string | null>(null);
	let searchQuery = $state('');

	// Filter embeddings based on search
	const filteredEmbeddings = $derived(
		(data.postgres?.embeddings ?? []).filter((e: any) =>
			!searchQuery || e.source?.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	const qdrantCollections = $derived(data.qdrant?.collections ?? []);
	const timelineItems = $derived(data.postgres?.timeline ?? []);
	const stats = $derived(data.postgres?.stats ?? {});
	const totalPoints = $derived(data.qdrant?.totalPoints ?? 0);
</script>

<div class="mx-auto max-w-[1400px] p-6">
	<!-- Header -->
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-sand">Codebase Viewer</h1>
		<p class="mt-1 text-sm text-sand/60">
			Indexed embeddings &bull; Tagged files &bull; Vector database explorer
		</p>
	</header>

	<!-- Stats Grid -->
	<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex items-center gap-3 rounded-lg border-2 border-blue-500/40 bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">🔢</span>
			<div>
				<div class="text-xl font-bold text-sand">{totalPoints.toLocaleString()}</div>
				<div class="text-xs uppercase tracking-wide text-sand/60">Qdrant Vectors</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-emerald-500/40 bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">📁</span>
			<div>
				<div class="text-xl font-bold text-sand">{stats.total_files || 0}</div>
				<div class="text-xs uppercase tracking-wide text-sand/60">Indexed Files</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-amber-500/40 bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">🧬</span>
			<div>
				<div class="text-xl font-bold text-sand">{stats.total_errors || 0}</div>
				<div class="text-xs uppercase tracking-wide text-sand/60">Total Errors</div>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-lg border-2 border-violet-500/40 bg-panel p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span class="text-3xl">📊</span>
			<div>
				<div class="text-xl font-bold text-sand">
					{(stats.embedding_coverage || 0).toFixed(1)}%
				</div>
				<div class="text-xs uppercase tracking-wide text-sand/60">Embedding Coverage</div>
			</div>
		</div>
	</div>

	<!-- Tabbed View (bits-ui Tabs) -->
	<Tabs.Root value="qdrant" class="w-full">
		<Tabs.List class="mb-4 flex gap-1 border-b-2 border-sand/20">
			<Tabs.Trigger
				value="qdrant"
				class="rounded-t-md px-4 py-2 text-sm font-mono uppercase tracking-wider text-sand/60 transition data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent hover:text-sand"
			>
				🔢 Qdrant Collections
			</Tabs.Trigger>
			<Tabs.Trigger
				value="postgres"
				class="rounded-t-md px-4 py-2 text-sm font-mono uppercase tracking-wider text-sand/60 transition data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent hover:text-sand"
			>
				🗃️ PostgreSQL Embeddings
			</Tabs.Trigger>
			<Tabs.Trigger
				value="timeline"
				class="rounded-t-md px-4 py-2 text-sm font-mono uppercase tracking-wider text-sand/60 transition data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-accent hover:text-sand"
			>
				📅 File Timeline
			</Tabs.Trigger>
		</Tabs.List>

		<!-- Qdrant Collections Tab -->
		<Tabs.Content value="qdrant">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each qdrantCollections as collection}
					<button
						type="button"
						class="w-full rounded-lg border-2 bg-panel p-4 text-left transition hover:border-blue-500/60 hover:shadow-md {selectedCollection === collection.name ? 'border-blue-500 bg-blue-500/10' : 'border-sand/20'}"
						onclick={() => selectedCollection = collection.name}
					>
						<div class="mb-3 flex items-center justify-between">
							<h3 class="font-semibold text-sand">{collection.name}</h3>
							<span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
								{collection.status}
							</span>
						</div>

						<div class="space-y-1 text-sm">
							<div class="flex justify-between">
								<span class="text-sand/60">Points:</span>
								<span class="font-semibold text-sand">{collection.pointsCount.toLocaleString()}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-sand/60">Vector Size:</span>
								<span class="font-semibold text-sand">{collection.vectorSize}d</span>
							</div>
						</div>
					</button>
				{/each}

				{#if qdrantCollections.length === 0}
					<div class="col-span-full rounded-lg border-2 border-dashed border-sand/20 p-8 text-center text-sand/40">
						No Qdrant collections found. Is Qdrant running on port 6333?
					</div>
				{/if}
			</div>
		</Tabs.Content>

		<!-- PostgreSQL Embeddings Tab -->
		<Tabs.Content value="postgres">
			<!-- Search Bar -->
			<div class="mb-4">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search files..."
					class="w-full rounded-lg border-2 border-sand/20 bg-panel px-4 py-2 text-sand placeholder-sand/40 transition focus:border-accent focus:outline-none"
				/>
			</div>

			<div class="overflow-hidden rounded-lg border-2 border-sand/20 bg-panel">
				<table class="w-full border-collapse">
					<thead>
						<tr class="border-b-2 border-sand/20 bg-panelSoft">
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">File Path</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Error Count</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Error Codes</th>
							<th class="p-3 text-left text-xs font-bold uppercase tracking-wider text-sand/60">Last Indexed</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredEmbeddings as embedding}
							<tr class="border-b border-sand/10 transition hover:bg-sand/5">
								<td class="p-3">
									<code class="rounded bg-sand/10 px-2 py-0.5 text-xs text-sand">{embedding.source}</code>
								</td>
								<td class="p-3">
									<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400">
										{embedding.error_count}
									</span>
								</td>
								<td class="p-3">
									{#each (embedding.error_codes || []) as code}
										<span class="mr-1 mb-1 inline-block rounded bg-danger/20 px-2 py-0.5 text-[10px] font-bold text-danger">
											{code}
										</span>
									{/each}
								</td>
								<td class="p-3 text-xs text-sand/60">
									{embedding.last_indexed
										? new Date(embedding.last_indexed).toLocaleString()
										: 'Never'}
								</td>
							</tr>
						{/each}

						{#if filteredEmbeddings.length === 0}
							<tr>
								<td colspan="4" class="p-8 text-center text-sand/40">
									{searchQuery ? `No files matching "${searchQuery}"` : 'No embeddings found. Is PostgreSQL running?'}
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</Tabs.Content>

		<!-- Timeline Tab -->
		<Tabs.Content value="timeline">
			<div class="relative pl-8">
				{#each timelineItems as item, i}
					<div class="relative mb-6 pl-6">
						<!-- Marker -->
						<div class="absolute left-0 top-2 h-3 w-3 rounded-full border-2 border-panel bg-accent shadow-[0_0_0_2px] shadow-accent/40"></div>

						<!-- Line -->
						{#if i < timelineItems.length - 1}
							<div class="absolute left-[5px] top-5 bottom--4 w-0.5 bg-sand/20"></div>
						{/if}

						<!-- Content -->
						<div class="rounded-lg border-2 border-sand/20 bg-panel p-4">
							<h4 class="mb-2 font-semibold text-sand">{item.file_path}</h4>
							<div class="flex flex-wrap gap-2">
								{#if item.indexed_at}
									<span class="rounded-md bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400">
										📥 Indexed: {new Date(item.indexed_at).toLocaleString()}
									</span>
								{/if}
								{#if item.tagged_at}
									<span class="rounded-md bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
										🏷️ Tagged: {new Date(item.tagged_at).toLocaleString()}
									</span>
								{/if}
								{#if item.edited_at}
									<span class="rounded-md bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
										✏️ Edited: {new Date(item.edited_at).toLocaleString()}
									</span>
								{/if}
								{#if item.analyzed_at}
									<span class="rounded-md bg-violet-500/20 px-3 py-1 text-xs font-medium text-violet-400">
										🔍 Analyzed: {new Date(item.analyzed_at).toLocaleString()}
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}

				{#if timelineItems.length === 0}
					<div class="rounded-lg border-2 border-dashed border-sand/20 p-8 text-center text-sand/40">
						No timeline data available.
					</div>
				{/if}
			</div>
		</Tabs.Content>
	</Tabs.Root>
</div>