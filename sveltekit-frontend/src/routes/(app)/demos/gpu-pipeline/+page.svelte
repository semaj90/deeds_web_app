<script lang="ts">
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const STATUS_COLORS: Record<string, string> = {
		todo: 'bg-blue-500',
		doing: 'bg-yellow-400',
		blocked: 'bg-red-500',
		done: 'bg-green-500',
	};
	const STATUS_TEXT: Record<string, string> = {
		todo: 'text-blue-400',
		doing: 'text-yellow-400',
		blocked: 'text-red-400',
		done: 'text-green-400',
	};
	const STATUS_LABELS: Record<string, string> = {
		todo: 'TO DO',
		doing: 'IN PROGRESS',
		blocked: 'BLOCKED',
		done: 'DONE',
	};

	let triggerStatus = $state<'idle' | 'loading' | 'done' | 'error'>('idle');
	let triggerMsg = $state('');

	async function triggerPacket() {
		triggerStatus = 'loading';
		try {
			const res = await fetch('/api/tasks/packets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					feature_id: `demo_${Date.now()}`,
					status: 'todo',
					summary_llm: 'GPU pipeline demo packet — created from /demos/gpu-pipeline',
					next_action: 'Assign to agent for processing',
					confidence: 0.8,
					related_feature_ids: ['gpu-pipeline-demo'],
				}),
			});
			const json = await res.json();
			if (res.ok) {
				triggerStatus = 'done';
				triggerMsg = `Packet #${json.packet?.id ?? '?'} created`;
			} else {
				triggerStatus = 'error';
				triggerMsg = json.error ?? 'Unknown error';
			}
		} catch (e) {
			triggerStatus = 'error';
			triggerMsg = String(e);
		}
		setTimeout(() => {
			triggerStatus = 'idle';
			triggerMsg = '';
		}, 3000);
	}

	const total = $derived(data.totalPackets || 1);

	function pct(n: number) {
		return Math.round((n / total) * 100);
	}

	function fmtBlend(n: number) {
		if (n > 100) return n.toFixed(0);
		return n.toFixed(3);
	}

	function truncPath(p: string) {
		if (p.length <= 52) return p;
		const parts = p.split('/');
		return '…/' + parts.slice(-2).join('/');
	}

	function relTime(d: Date | string | null | undefined) {
		if (!d) return '—';
		const ms = Date.now() - new Date(d).getTime();
		if (ms < 60000) return `${Math.round(ms / 1000)}s ago`;
		if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
		return `${Math.round(ms / 3600000)}h ago`;
	}
</script>

<svelte:head>
	<title>GPU Pipeline Monitor</title>
</svelte:head>

<div class="min-h-screen bg-gray-950 text-gray-100 p-6 font-mono">
	<!-- Header -->
	<div class="mb-8 flex items-start justify-between flex-wrap gap-4">
		<div>
			<h1 class="text-2xl font-bold text-green-400 tracking-widest">GPU PIPELINE MONITOR</h1>
			<p class="text-xs text-gray-500 mt-1">
				task_semantic_packets &middot; agent_pickup_queue &middot; karpathy blend scores
			</p>
		</div>
		<div class="flex gap-3 items-center flex-wrap">
			<a
				href="/admin/ast-topology"
				target="_blank"
				class="text-xs px-3 py-1.5 border border-gray-700 text-gray-400 hover:border-green-500 hover:text-green-400 transition-colors"
			>
				AST TOPOLOGY &nearr;
			</a>
			<a
				href="/admin/search-intelligence"
				class="text-xs px-3 py-1.5 border border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
			>
				SEARCH INTEL &nearr;
			</a>
			<button
				onclick={triggerPacket}
				disabled={triggerStatus === 'loading'}
				class="text-xs px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold transition-colors"
			>
				{#if triggerStatus === 'loading'}
					CREATING&hellip;
				{:else if triggerStatus === 'done'}
					&#10003; {triggerMsg}
				{:else if triggerStatus === 'error'}
					&#10007; {triggerMsg}
				{:else}
					+ NEW PACKET
				{/if}
			</button>
		</div>
	</div>

	<!-- Pipeline stage bars -->
	<section class="mb-8">
		<h2 class="text-xs text-gray-500 uppercase tracking-widest mb-3">
			Pipeline Stages &mdash; {data.totalPackets} packets total
		</h2>
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
			{#each ['todo', 'doing', 'blocked', 'done'] as stage}
				{@const n = data.statusMap[stage] ?? 0}
				<div class="border border-gray-800 bg-gray-900 p-4">
					<div class="text-xs text-gray-500 mb-1">{STATUS_LABELS[stage]}</div>
					<div class="text-3xl font-bold {STATUS_TEXT[stage]}">{n}</div>
					<div class="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
						<div
							class="{STATUS_COLORS[stage]} h-full rounded-full transition-all"
							style="width:{pct(n)}%"
						></div>
					</div>
					<div class="text-xs text-gray-600 mt-1">{pct(n)}%</div>
				</div>
			{/each}
		</div>
	</section>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Agent pickup queue -->
		<section>
			<div class="flex items-center gap-3 mb-3 flex-wrap">
				<h2 class="text-xs text-gray-500 uppercase tracking-widest">Agent Pickup Queue</h2>
				<span class="text-xs px-2 py-0.5 bg-yellow-900 text-yellow-400 font-bold">
					{data.queueDepth} pending
				</span>
			</div>
			<div class="border border-gray-800 bg-gray-900 divide-y divide-gray-800">
				{#if data.queueItems.length === 0}
					<div class="p-6 text-xs text-gray-600 text-center">
						Queue empty &mdash; create a packet above and it will appear here
					</div>
				{:else}
					{#each data.queueItems as item}
						<div
							class="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-gray-800/50 transition-colors"
						>
							<span
								class="w-20 shrink-0 {item.picked_up_at
									? 'text-green-500'
									: item.status === 'pending'
										? 'text-yellow-400'
										: 'text-gray-500'}"
							>
								{item.picked_up_at ? 'PICKED' : (item.status ?? 'pending').toUpperCase()}
							</span>
							<span class="text-gray-400 truncate flex-1">{item.lane}</span>
							<span class="text-gray-600 shrink-0">{relTime(item.created_at)}</span>
							{#if (item.attempts ?? 0) > 0}
								<span class="text-orange-400 shrink-0">&times;{item.attempts}</span>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</section>

		<!-- Karpathy blend scores -->
		<section>
			<div class="flex items-center gap-3 mb-3 flex-wrap">
				<h2 class="text-xs text-gray-500 uppercase tracking-widest">Karpathy Authority Blend</h2>
				{#if data.karpathy.summary}
					{@const s = data.karpathy.summary as Record<string, unknown>}
					<span class="text-xs text-gray-600">
						{s.candidates ?? '?'} files &middot; {new Date(s.ts as string).toLocaleTimeString()}
					</span>
				{/if}
			</div>
			<div class="border border-gray-800 bg-gray-900">
				<!-- Column headers -->
				<div
					class="px-4 py-2 grid gap-3 text-xs text-gray-600 border-b border-gray-800"
					style="grid-template-columns:1fr 3.5rem 3.5rem 4rem"
				>
					<span>FILE</span><span>PR</span><span>ATTN</span><span>BLEND</span>
				</div>
				{#if data.karpathy.scores.length === 0}
					<div class="p-6 text-xs text-gray-600 text-center">
						No scores &mdash; run <code class="text-green-500">npm run karpathy:gpu</code>
					</div>
				{:else}
					{#each data.karpathy.scores as s}
						<div
							class="px-4 py-2 grid gap-3 text-xs hover:bg-gray-800/50 border-b border-gray-800/50 transition-colors"
							style="grid-template-columns:1fr 3.5rem 3.5rem 4rem"
						>
							<a
								href="/admin/ast-topology?route={encodeURIComponent(s.file)}"
								target="_blank"
								class="text-cyan-400 hover:text-cyan-300 truncate"
								title={s.file}
							>
								{truncPath(s.file)}
							</a>
							<span class="text-purple-400 tabular-nums text-right">{s.pr?.toFixed(2) ?? '—'}</span>
							<span class="text-orange-400 tabular-nums text-right">{s.attention?.toFixed(3) ?? '—'}</span>
							<span class="text-green-400 font-bold tabular-nums text-right">{fmtBlend(s.blend)}</span>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Summary stats -->
			{#if data.karpathy.summary}
				{@const s = data.karpathy.summary as Record<string, unknown>}
				<div class="mt-2 grid grid-cols-3 gap-2 text-xs">
					<div class="border border-gray-800 bg-gray-900 p-2 text-center">
						<div class="text-gray-500">Top blend</div>
						<div class="text-green-400 font-bold">
							{typeof s.topBlend === 'number' ? s.topBlend.toFixed(0) : '—'}
						</div>
					</div>
					<div class="border border-gray-800 bg-gray-900 p-2 text-center">
						<div class="text-gray-500">Clusters</div>
						<div class="text-purple-400 font-bold">{s.clustersIndexed ?? '—'}</div>
					</div>
					<div class="border border-gray-800 bg-gray-900 p-2 text-center">
						<div class="text-gray-500">Files scored</div>
						<div class="text-cyan-400 font-bold">{s.candidates ?? '—'}</div>
					</div>
				</div>
			{/if}
		</section>
	</div>

	<!-- Formula legend -->
	<div class="mt-6 border border-gray-800 bg-gray-900/50 p-4 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
		<span>
			<span class="text-gray-400 font-bold">Blend:</span>
			0.4 &times; <span class="text-purple-400">PageRank</span>
			+ 0.3 &times; <span class="text-orange-400">attention</span>
			+ 0.3 &times; <span class="text-cyan-400">authority</span>
		</span>
		<span>Cached 24h &rarr; <code class="text-green-500">gpu:karpathy:scores</code> (Redis)</span>
		<span>Tables: <code class="text-gray-400">task_semantic_packets</code> &middot; <code class="text-gray-400">agent_pickup_queue</code> &middot; <code class="text-gray-400">nes_chrom_packets</code></span>
	</div>
</div>
