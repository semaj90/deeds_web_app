<script lang="ts">
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let statusFilter = $state(data.status ?? '');
	let currentPage = $state(0);

	const pageSize = data.limit;
	const totalPages = Math.ceil(data.totalCount / pageSize);

	function formatDate(date: string | Date): string {
		return new Date(date).toLocaleString();
	}

	function formatDuration(ms: number | null): string {
		if (!ms) return '-';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800';
			case 'running':
				return 'bg-blue-100 text-blue-800';
			case 'failed':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
</script>

<div class="space-y-6 p-6">
	<div>
		<h1 class="text-3xl font-bold">Deep Research Dashboard</h1>
		<p class="text-gray-600 mt-2">
			Monitor LDR + ML ranking + Gemma4 synthesis pipelines
		</p>
	</div>

	<!-- Stats Overview -->
	<div class="grid grid-cols-4 gap-4">
		<div class="bg-white rounded-lg p-4 shadow">
			<div class="text-gray-600 text-sm">Total Tasks</div>
			<div class="text-2xl font-bold">{data.totalCount}</div>
		</div>
		<div class="bg-white rounded-lg p-4 shadow">
			<div class="text-gray-600 text-sm">Completed</div>
			<div class="text-2xl font-bold text-green-600">
				{data.statusDistribution?.find((s) => s.status === 'completed')?.count ?? 0}
			</div>
		</div>
		<div class="bg-white rounded-lg p-4 shadow">
			<div class="text-gray-600 text-sm">Running</div>
			<div class="text-2xl font-bold text-blue-600">
				{data.statusDistribution?.find((s) => s.status === 'running')?.count ?? 0}
			</div>
		</div>
		<div class="bg-white rounded-lg p-4 shadow">
			<div class="text-gray-600 text-sm">Failed</div>
			<div class="text-2xl font-bold text-red-600">
				{data.statusDistribution?.find((s) => s.status === 'failed')?.count ?? 0}
			</div>
		</div>
	</div>

	<!-- Filters -->
	<div class="flex gap-4 bg-white rounded-lg p-4 shadow">
		<select bind:value={statusFilter} class="border rounded px-3 py-2">
			<option value="">All Statuses</option>
			<option value="pending">Pending</option>
			<option value="running">Running</option>
			<option value="completed">Completed</option>
			<option value="failed">Failed</option>
		</select>
		<a
			href={`/admin/deep-research?${new URLSearchParams({ status: statusFilter, limit: String(pageSize) }).toString()}`}
			class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
		>
			Apply Filters
		</a>
	</div>

	<!-- Tasks Table -->
	<div class="bg-white rounded-lg shadow overflow-x-auto">
		<table class="w-full">
			<thead class="bg-gray-100 border-b">
				<tr>
					<th class="px-4 py-3 text-left text-sm font-semibold">Query</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">Status</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">Rank Model</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">Results</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">ML Score</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">Duration</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">Created</th>
					<th class="px-4 py-3 text-left text-sm font-semibold">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.tasks as task (task.id)}
					<tr class="border-b hover:bg-gray-50">
						<td class="px-4 py-3 text-sm">
							<div class="max-w-xs truncate font-mono text-xs">{task.query}</div>
						</td>
						<td class="px-4 py-3 text-sm">
							<span class="inline-block px-2 py-1 rounded text-xs font-semibold {getStatusColor(task.status)}">
								{task.status}
							</span>
						</td>
						<td class="px-4 py-3 text-sm">{task.rankModel}</td>
						<td class="px-4 py-3 text-sm text-center">{task.results?.length ?? 0}</td>
						<td class="px-4 py-3 text-sm text-center">
							{#if task.mlScore}
								{(task.mlScore * 100).toFixed(1)}%
							{:else}
								-
							{/if}
						</td>
						<td class="px-4 py-3 text-sm">{formatDuration(task.durationMs)}</td>
						<td class="px-4 py-3 text-sm text-gray-600">{formatDate(task.createdAt)}</td>
						<td class="px-4 py-3 text-sm space-x-2">
							{#if task.status === 'failed'}
								<form method="POST" action="?/retryTask" class="inline">
									<input type="hidden" name="taskId" value={task.id} />
									<button class="text-blue-600 hover:underline">Retry</button>
								</form>
							{/if}
							<button
								onclick={() => {
									if (confirm('Delete this task and all its results?')) {
										const form = document.createElement('form');
										form.method = 'POST';
										form.action = '?/deleteTask';
										const input = document.createElement('input');
										input.type = 'hidden';
										input.name = 'taskId';
										input.value = task.id;
										form.appendChild(input);
										document.body.appendChild(form);
										form.submit();
									}
								}}
								class="text-red-600 hover:underline"
							>
								Delete
							</button>
						</td>
					</tr>

					<!-- Results Rows -->
					{#if task.results && task.results.length > 0}
						<tr class="bg-gray-50">
							<td colspan="8" class="px-4 py-3">
								<details class="cursor-pointer">
									<summary class="font-semibold text-sm">
										Results ({task.results.length})
									</summary>
									<div class="mt-3 space-y-2">
										{#each task.results as result (result.id)}
											<div class="bg-white border rounded p-2 text-xs">
												<div class="flex justify-between">
													<div class="font-semibold">#{result.rank} {result.source}</div>
													<div class="text-gray-600">
														ML: {(result.mlScore * 100).toFixed(1)}%
													</div>
												</div>
												<div class="mt-1 text-gray-700">{result.text.substring(0, 100)}...</div>
												{#if result.url}
													<div class="text-blue-600 break-all">
														<a href={result.url} target="_blank">{result.url}</a>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</details>
							</td>
						</tr>
					{/if}

					<!-- Synthesis Row -->
					{#if task.synthesis}
						<tr class="bg-blue-50">
							<td colspan="8" class="px-4 py-3">
								<details class="cursor-pointer">
									<summary class="font-semibold text-sm">
										Synthesis ({task.synthesis.model})
									</summary>
									<div class="mt-3 bg-white border rounded p-3 text-sm">
										<p class="text-gray-800">{task.synthesis.synthesisText}</p>
										{#if task.synthesis.keyFindings}
											<div class="mt-2">
												<strong>Key Findings:</strong>
												<ul class="list-disc ml-4 mt-1">
													{#each task.synthesis.keyFindings as finding}
														<li>{finding}</li>
													{/each}
												</ul>
											</div>
										{/if}
									</div>
								</details>
							</td>
						</tr>
					{/if}

					<!-- Error Row -->
					{#if task.errorMessage}
						<tr class="bg-red-50">
							<td colspan="8" class="px-4 py-3">
								<details class="cursor-pointer">
									<summary class="font-semibold text-sm text-red-700">
										Error
									</summary>
									<div class="mt-2 bg-white border border-red-200 rounded p-2 text-xs font-mono">
										{task.errorMessage}
									</div>
								</details>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>

		{#if data.tasks.length === 0}
			<div class="p-8 text-center text-gray-500">
				No research tasks found
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex items-center justify-center gap-2">
			{#if currentPage > 0}
				<a
					href={`/admin/deep-research?offset=${(currentPage - 1) * pageSize}&limit=${pageSize}`}
					class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					← Previous
				</a>
			{/if}

			<div class="text-sm text-gray-600">
				Page {currentPage + 1} of {totalPages}
			</div>

			{#if currentPage < totalPages - 1}
				<a
					href={`/admin/deep-research?offset=${(currentPage + 1) * pageSize}&limit=${pageSize}`}
					class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					Next →
				</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	table {
		border-collapse: collapse;
	}
</style>
