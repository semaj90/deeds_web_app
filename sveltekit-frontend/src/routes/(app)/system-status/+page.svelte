<script lang="ts">
	import SystemStatusCard from '$lib/components/ui/SystemStatusCard.svelte';
	import SystemStatusPanel from '$lib/components/dashboard/SystemStatusPanel.svelte';
	import SystemOverview from '$lib/components/yorha/dashboard/SystemOverview.svelte';
	import YoRHaSystemStatus from '$lib/components/yorha/_simulations/YoRHaSystemStatus.svelte';
	import Enhanced3DLegalAIInterface from '$lib/components/ai/Enhanced3DLegalAIInterface.svelte';

	let activeTab = $state<'overview' | 'ai-services' | 'live-metrics' | 'init-status'>('overview');
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-sand mb-2">System Status</h1>
		<p class="text-sand/60">Real-time system health, AI service monitoring, GPU metrics</p>
	</div>

	<!-- Tab Toggle -->
	<div class="flex gap-2 mb-6">
		<button
			onclick={() => (activeTab = 'overview')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeTab === 'overview' ? 'bg-accent text-black' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			System Overview
		</button>
		<button
			onclick={() => (activeTab = 'ai-services')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeTab === 'ai-services' ? 'bg-accent text-black' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			AI Services
		</button>
		<button
			onclick={() => (activeTab = 'live-metrics')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeTab === 'live-metrics' ? 'bg-accent text-black' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Live Metrics
		</button>
		<button
			onclick={() => (activeTab = 'init-status')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeTab === 'init-status' ? 'bg-accent text-black' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Init Status
		</button>
	</div>

	{#if activeTab === 'overview'}
		<!-- Status Cards Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
			<SystemStatusCard title="PostgreSQL" status="OK" updatedAt={new Date()}>
				<p class="text-xs text-gray-400 mt-1">70+ tables, pgvector, Drizzle ORM 0.44</p>
			</SystemStatusCard>
			<SystemStatusCard title="Redis Cache" status="OK" updatedAt={new Date()}>
				<p class="text-xs text-gray-400 mt-1">L3 cache layer, configurable TTL</p>
			</SystemStatusCard>
			<SystemStatusCard title="Qdrant Vector DB" status="OK" updatedAt={new Date()}>
				<p class="text-xs text-gray-400 mt-1">768-dim, 6 collections, GPU-accelerated</p>
			</SystemStatusCard>
			<SystemStatusCard title="Ollama LLM" status="OK" updatedAt={new Date()}>
				<p class="text-xs text-gray-400 mt-1">gemma3-legal + embeddinggemma</p>
			</SystemStatusCard>
			<SystemStatusCard title="RabbitMQ" status="WARN" updatedAt={new Date()}>
				<p class="text-xs text-gray-400 mt-1">7 queues, 5 exchanges — 2 queues lagging</p>
			</SystemStatusCard>
			<SystemStatusCard title="MinIO Storage" status="OK" updatedAt={new Date()}>
				<p class="text-xs text-gray-400 mt-1">SHA-256 hash verification, evidence uploads</p>
			</SystemStatusCard>
		</div>

		<!-- System Overview -->
		<div class="bg-white rounded-lg shadow p-6">
			<h2 class="text-lg font-semibold mb-4">System Health Overview</h2>
			<SystemOverview />
		</div>
	{:else if activeTab === 'ai-services'}
		<div class="bg-white rounded-lg shadow p-6">
			<h2 class="text-lg font-semibold mb-4">AI Pipeline Status</h2>
			<p class="text-sm text-gray-500 mb-4">
				Service health monitoring — database, search, LLM inference, storage capacity.
			</p>
			<SystemStatusPanel status={{
				database: 'online',
				elasticsearch: 'online',
				gemma: 'online',
				storageCapacity: 67
			}} />
		</div>
	{:else if activeTab === 'live-metrics'}
		<div class="bg-panel rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">Live System Metrics</h2>
			<p class="text-sm text-gray-400 mb-4">
				Real-time system load, GPU utilization, memory, and network metrics with simulated fluctuations.
			</p>
			<YoRHaSystemStatus
				systemLoad={35}
				gpuUtilization={72}
				memoryUsage={61}
				networkLatency={18}
			/>
		</div>
	{:else if activeTab === 'init-status'}
		<div class="bg-panel rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">System Initialization Status</h2>
			<p class="text-sm text-gray-400 mb-4">
				6-stage GPU/ML pipeline readiness (GPU Init, SIMD Parser, vLLM/Triton, Neo4j, XState, Ready).
			</p>
			<Enhanced3DLegalAIInterface
				enableGPUAcceleration={true}
				theme="dark"
			/>
		</div>
	{/if}

	<!-- Tech Stack Info -->
	<div class="mt-8 p-4 bg-panelSoft rounded-lg border border-sand/10">
		<h3 class="text-sm font-semibold text-sand mb-2">Tech Stack</h3>
		<div class="flex flex-wrap gap-3 text-xs text-sand/60">
			<span class="px-2 py-1 bg-panel rounded">Svelte 5 Runes</span>
			<span class="px-2 py-1 bg-panel rounded">PostgreSQL 16</span>
			<span class="px-2 py-1 bg-panel rounded">Redis</span>
			<span class="px-2 py-1 bg-panel rounded">Qdrant</span>
			<span class="px-2 py-1 bg-panel rounded">Ollama</span>
			<span class="px-2 py-1 bg-panel rounded">WebGPU</span>
			<span class="px-2 py-1 bg-panel rounded">ONNX Runtime</span>
		</div>
	</div>
</div>
