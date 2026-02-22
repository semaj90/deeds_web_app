<script lang="ts">
	import YoRHaTerminal from '$lib/components/yorha/YoRHaTerminal.svelte';
	import YoRHaSystemStatus from '$lib/components/yorha/_simulations/YoRHaSystemStatus.svelte';
	import YoRHaDialog from '$lib/components/yorha/YoRHaDialog.svelte';
	import YoRHaCommandCenter from '$lib/components/yorha/YoRHaCommandCenter.svelte';

	let activeSection = $state<'command-center' | 'terminal' | 'system-status' | 'dialogs'>('command-center');
	let showInfoDialog = $state(false);
	let showConfirmDialog = $state(false);
	let showWarningDialog = $state(false);
	let showErrorDialog = $state(false);
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-sand mb-2">NieR: Automata UI Showcase</h1>
		<p class="text-sand/60">YoRHa-themed components — command center, terminal, system status, dialogs</p>
	</div>

	<!-- Section Toggle -->
	<div class="flex flex-wrap gap-2 mb-6">
		<button
			onclick={() => (activeSection = 'command-center')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'command-center' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Command Center
		</button>
		<button
			onclick={() => (activeSection = 'terminal')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'terminal' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Terminal
		</button>
		<button
			onclick={() => (activeSection = 'system-status')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'system-status' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			System Status
		</button>
		<button
			onclick={() => (activeSection = 'dialogs')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'dialogs' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Dialogs
		</button>
	</div>

	<!-- Content Sections -->
	{#if activeSection === 'command-center'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">YoRHa Command Center</h2>
			<p class="text-sm text-gray-400 mb-4">
				Cluster health monitoring with real-time metrics from /api/yorha/cluster-health.
			</p>
			<YoRHaCommandCenter />
		</div>
	{:else if activeSection === 'terminal'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">YoRHa Legal Terminal</h2>
			<p class="text-sm text-gray-400 mb-4">
				Interactive terminal. Type "help" for commands.
			</p>
			<YoRHaTerminal
				title="YORHA LEGAL TERMINAL v4.0.0"
				prompt="YoRHa:demo>"
				onCommand={(cmd) => { console.log('Terminal command:', cmd); }}
			/>
		</div>
	{:else if activeSection === 'system-status'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">System Status Monitor</h2>
			<p class="text-sm text-gray-400 mb-4">
				Live system metrics with simulated fluctuations (CPU, GPU, memory, network).
			</p>
			<YoRHaSystemStatus
				systemLoad={42}
				gpuUtilization={65}
				memoryUsage={58}
				networkLatency={24}
			/>
		</div>
	{:else if activeSection === 'dialogs'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">YoRHa Dialog System</h2>
			<p class="text-sm text-gray-400 mb-6">
				Themed modal dialogs for confirmations, alerts, and prompts.
			</p>

			<div class="flex flex-wrap gap-3">
				<button
					onclick={() => (showInfoDialog = true)}
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 text-sm"
				>
					Info Dialog
				</button>
				<button
					onclick={() => (showConfirmDialog = true)}
					class="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-500 text-sm"
				>
					Confirm Dialog
				</button>
				<button
					onclick={() => (showWarningDialog = true)}
					class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-500 text-sm"
				>
					Warning Dialog
				</button>
				<button
					onclick={() => (showErrorDialog = true)}
					class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 text-sm"
				>
					Error Dialog
				</button>
			</div>

			<YoRHaDialog
				open={showInfoDialog}
				title="SYSTEM NOTIFICATION"
				message="All YoRHa units have been updated to the latest combat protocols. Legal AI subsystems operating within normal parameters."
				type="info"
				onConfirm={() => (showInfoDialog = false)}
				onCancel={() => (showInfoDialog = false)}
			/>
			<YoRHaDialog
				open={showConfirmDialog}
				title="CONFIRMATION REQUIRED"
				message="Deploy updated case analysis model to production? This action will restart active inference sessions."
				type="confirm"
				onConfirm={() => { console.log('Confirmed!'); showConfirmDialog = false; }}
				onCancel={() => (showConfirmDialog = false)}
			/>
			<YoRHaDialog
				open={showWarningDialog}
				title="WARNING"
				message="GPU memory utilization exceeding 85% threshold. Consider reducing batch size for embedding operations."
				type="warning"
				onConfirm={() => (showWarningDialog = false)}
				onCancel={() => (showWarningDialog = false)}
			/>
			<YoRHaDialog
				open={showErrorDialog}
				title="SYSTEM ERROR"
				message="Connection to Qdrant vector database lost. Attempting automatic reconnection. Evidence search functionality temporarily unavailable."
				type="error"
				onConfirm={() => (showErrorDialog = false)}
				onCancel={() => (showErrorDialog = false)}
			/>
		</div>
	{/if}

	<!-- Tech Stack Info -->
	<div class="mt-8 p-4 bg-panelSoft rounded-lg border border-sand/10">
		<h3 class="text-sm font-semibold text-sand mb-2">Tech Stack</h3>
		<div class="flex flex-wrap gap-3 text-xs text-sand/60">
			<span class="px-2 py-1 bg-panel rounded">Svelte 5 Runes</span>
			<span class="px-2 py-1 bg-panel rounded">YoRHa Design System</span>
			<span class="px-2 py-1 bg-panel rounded">$state / $derived / $effect</span>
			<span class="px-2 py-1 bg-panel rounded">SSE Real-Time</span>
			<span class="px-2 py-1 bg-panel rounded">Snippet API</span>
		</div>
	</div>
</div>