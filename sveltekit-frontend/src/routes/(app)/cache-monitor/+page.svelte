<script lang="ts">
	/**
	 * Cache Monitoring Dashboard Page
	 *
	 * Showcases the real-time cache monitoring widget for the 3-tier LLM cache system.
	 */

	import CacheMonitoringWidget from '$lib/components/monitoring/CacheMonitoringWidget.svelte';
	import CacheWarmUpSimple from '$lib/components/monitoring/CacheWarmUpSimple.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
</script>

<svelte:head>
	<title>Cache Monitor | Legal AI Platform</title>
</svelte:head>

<div class="cache-monitor-page min-h-screen bg-app-bg p-6">
	<div class="max-w-4xl mx-auto space-y-6">
		<!-- Page Header -->
		<div class="flex items-center gap-3">
			<div class="w-12 h-12 bg-accent text-white rounded-lg flex items-center justify-center">
				<Icon name="activity" size={24} />
			</div>
			<div>
				<h1 class="text-3xl font-bold text-sand-12">Cache Monitoring Dashboard</h1>
				<p class="text-sand-11">Real-time performance metrics for the 3-tier LLM cache system</p>
			</div>
		</div>

		<!-- Info Banner -->
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
			<div class="flex items-start gap-3">
				<Icon name="info" size={20} class="text-blue-600 mt-0.5" />
				<div class="flex-1 text-sm">
					<p class="font-semibold text-blue-900 mb-1">About the Cache System</p>
					<p class="text-blue-800">
						The Legal AI Platform uses a 3-tier cache hierarchy to minimize inference latency and cost:
					</p>
					<ul class="mt-2 space-y-1 text-blue-800">
						<li><strong>L0 (Redis)</strong> — Exact-match cache with 3-5ms lookups, 6,542× speedup vs CPU</li>
						<li><strong>L2 (Qdrant)</strong> — Semantic similarity cache with 500ms vector search</li>
						<li><strong>L3 (Ollama)</strong> — Cold GPU inference fallback at 2.8s average latency</li>
					</ul>
					<p class="mt-2 text-blue-800">
						Combined hit rate: <strong>90-95%</strong> &nbsp;•&nbsp; Cost reduction: <strong>90%</strong> &nbsp;•&nbsp; Throughput: <strong>12,000 QPM</strong>
					</p>
				</div>
			</div>
		</div>

		<!-- Cache Monitoring Widget -->
		<CacheMonitoringWidget />

		<!-- Cache Warm-Up Control (Simplified) -->
		<CacheWarmUpSimple />

		<!-- Documentation -->
		<div class="bg-panel border border-sand-6 rounded-lg p-6 space-y-4">
			<h2 class="text-xl font-semibold text-sand-12">Integration Guide</h2>

			<div class="space-y-3 text-sm">
				<div>
					<h3 class="font-semibold text-sand-12 mb-1">Usage in Other Components</h3>
					<pre class="bg-sand-2 p-3 rounded text-xs overflow-x-auto"><code>&lt;script&gt;
  import CacheMonitoringWidget from '$lib/components/monitoring/CacheMonitoringWidget.svelte';
&lt;/script&gt;

&lt;CacheMonitoringWidget /&gt;</code></pre>
				</div>

				<div>
					<h3 class="font-semibold text-sand-12 mb-1">API Endpoints Used</h3>
					<ul class="list-disc list-inside space-y-1 text-sand-11">
						<li><code class="bg-sand-2 px-1 rounded">GET /api/cache/stats</code> — Comprehensive cache statistics</li>
						<li><code class="bg-sand-2 px-1 rounded">POST /api/cache/invalidate</code> — Manual cache clearing</li>
						<li><code class="bg-sand-2 px-1 rounded">POST /api/cache/warm-up</code> — Pre-populate cache with common queries</li>
					</ul>
				</div>

				<div>
					<h3 class="font-semibold text-sand-12 mb-1">CLI Warm-Up Script</h3>
					<pre class="bg-sand-2 p-3 rounded text-xs overflow-x-auto"><code># Warm up all queries with defaults
node scripts/cache-warmup.mjs

# Warm up specific domain only
node scripts/cache-warmup.mjs --domain evidence

# Dry run to see what would be processed
node scripts/cache-warmup.mjs --dry-run</code></pre>
				</div>

				<div>
					<h3 class="font-semibold text-sand-12 mb-1">Features</h3>
					<ul class="list-disc list-inside space-y-1 text-sand-11">
						<li>Real-time polling every 3 seconds (pause/resume controls)</li>
						<li>Health indicators: Green (≥70%), Yellow (40-70%), Red (&lt;40%)</li>
						<li>Live memory usage and key count tracking</li>
						<li>Recent operations log (last 10 cache hits/misses)</li>
						<li>Manual cache invalidation button</li>
					</ul>
				</div>

				<div>
					<h3 class="font-semibold text-sand-12 mb-1">Performance Metrics</h3>
					<table class="w-full text-xs border border-sand-5">
						<thead class="bg-sand-3">
							<tr>
								<th class="px-3 py-2 text-left">Tier</th>
								<th class="px-3 py-2 text-left">Latency</th>
								<th class="px-3 py-2 text-left">Speedup</th>
								<th class="px-3 py-2 text-left">Use Case</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-sand-5">
							<tr>
								<td class="px-3 py-2"><span class="w-2 h-2 rounded-full bg-green-500 inline-block mr-1"></span> L0 Redis</td>
								<td class="px-3 py-2">3-5ms</td>
								<td class="px-3 py-2">6,542× (vs CPU)</td>
								<td class="px-3 py-2">Exact query repeats</td>
							</tr>
							<tr>
								<td class="px-3 py-2"><span class="w-2 h-2 rounded-full bg-yellow-500 inline-block mr-1"></span> L2 Qdrant</td>
								<td class="px-3 py-2">500ms</td>
								<td class="px-3 py-2">5-10× (semantic)</td>
								<td class="px-3 py-2">Similar queries</td>
							</tr>
							<tr>
								<td class="px-3 py-2"><span class="w-2 h-2 rounded-full bg-red-500 inline-block mr-1"></span> L3 Ollama</td>
								<td class="px-3 py-2">2.8s avg</td>
								<td class="px-3 py-2">1× (baseline)</td>
								<td class="px-3 py-2">Cold inference</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.cache-monitor-page {
		min-height: 100vh;
	}
</style>
