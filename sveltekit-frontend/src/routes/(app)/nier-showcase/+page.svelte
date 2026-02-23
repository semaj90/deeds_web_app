<script lang="ts">
	import YoRHaTerminal from '$lib/components/yorha/YoRHaTerminal.svelte';
	import YoRHaSystemStatus from '$lib/components/yorha/_simulations/YoRHaSystemStatus.svelte';
	import YoRHaDialog from '$lib/components/yorha/YoRHaDialog.svelte';
	import YoRHaCommandCenter from '$lib/components/yorha/YoRHaCommandCenter.svelte';
	import DiamondModal from '$lib/components/ui/DiamondModal.svelte';
	import SNES16BitButton from '$lib/components/ui/gaming/16bit/SNES16BitButton.svelte';
	import ProgressiveGamingProvider from '$lib/components/ui/gaming/core/ProgressiveGamingProvider.svelte';
	import GPUCacheIntegrationDemo from '$lib/components/ui/gaming/demo/GPUCacheIntegrationDemo.svelte';
	import NES3DLODProcessor from '$lib/components/ui/gaming/effects/NES3DLODProcessor.svelte';
	import RetroRecommendationModal from '$lib/components/ui/gaming/modals/RetroRecommendationModal.svelte';
	import BitsUIDemo from '$lib/components/ui/BitsUIDemo.svelte';
	import YoRHaCommandInterface from '$lib/components/yorha/_simulations/YoRHaCommandInterface.svelte';

	let activeSection = $state<'command-center' | 'terminal' | 'system-status' | 'dialogs' | 'diamond-modal' | 'gaming-retro' | 'bits-ui' | 'command-interface'>('command-center');
	let showInfoDialog = $state(false);
	let showDiamondModal = $state(false);
	let diamondPalette = $state<'nes' | 'snes' | 'ps1' | 'n64' | 'ps2'>('ps1');
	let diamondSize = $state<'small' | 'medium' | 'large'>('medium');
	let showConfirmDialog = $state(false);
	let showWarningDialog = $state(false);
	let showErrorDialog = $state(false);
	let showRetroModal = $state(false);
	let selectedGamingEra = $state<'8bit' | '16bit' | '32bit' | '64bit' | 'modern'>('16bit');
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
		<button
			onclick={() => (activeSection = 'diamond-modal')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'diamond-modal' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Diamond Modal
		</button>
		<button
			onclick={() => (activeSection = 'gaming-retro')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'gaming-retro' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Gaming Retro
		</button>
		<button
			onclick={() => (activeSection = 'bits-ui')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'bits-ui' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Bits UI
		</button>
		<button
			onclick={() => (activeSection = 'command-interface')}
			class="px-4 py-2 rounded-lg text-sm font-medium transition {activeSection === 'command-interface' ? 'bg-accent text-white' : 'bg-panelSoft text-sand hover:bg-panel'}"
		>
			Command Interface
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
	{:else if activeSection === 'diamond-modal'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">Diamond Modal System</h2>
			<p class="text-sm text-gray-400 mb-4">
				Retro gaming-themed modal with animated diamond canvas pattern, glass effect, and card-corner decorations.
			</p>

			<div class="mb-4">
				<label class="text-sm text-gray-400 block mb-2">Palette</label>
				<div class="flex flex-wrap gap-2">
					{#each ['nes', 'snes', 'ps1', 'n64', 'ps2'] as p}
						<button
							onclick={() => (diamondPalette = p as typeof diamondPalette)}
							class="px-3 py-1 rounded text-xs font-mono transition {diamondPalette === p ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
						>
							{p.toUpperCase()}
						</button>
					{/each}
				</div>
			</div>

			<div class="mb-6">
				<label class="text-sm text-gray-400 block mb-2">Size</label>
				<div class="flex flex-wrap gap-2">
					{#each ['small', 'medium', 'large'] as s}
						<button
							onclick={() => (diamondSize = s as typeof diamondSize)}
							class="px-3 py-1 rounded text-xs font-mono transition {diamondSize === s ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
						>
							{s.toUpperCase()}
						</button>
					{/each}
				</div>
			</div>

			<button
				onclick={() => (showDiamondModal = true)}
				class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500 text-sm"
			>
				Open Diamond Modal
			</button>

			<DiamondModal
				bind:open={showDiamondModal}
				title="DIAMOND PROTOCOL"
				size={diamondSize}
				palette={diamondPalette}
				glassEffect={true}
				diamondPattern={true}
				onclose={() => (showDiamondModal = false)}
			>
				{#snippet children()}
					<p class="mb-3">This modal features an animated diamond canvas pattern with retro gaming aesthetics.</p>
					<p class="text-sm opacity-70">Current palette: <strong>{diamondPalette.toUpperCase()}</strong> | Size: <strong>{diamondSize}</strong></p>
				{/snippet}
			</DiamondModal>
		</div>
	{:else if activeSection === 'gaming-retro'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">Gaming Retro Components</h2>
			<p class="text-sm text-gray-400 mb-6">
				Retro gaming-era UI — SNES buttons, progressive era theming, GPU cache visualization, LOD processing, recommendation modals.
			</p>

			<!-- SNES Buttons -->
			<div class="mb-6">
				<h3 class="text-sm font-medium text-gray-300 mb-3">SNES 16-Bit Buttons</h3>
				<div class="flex flex-wrap gap-3">
					<SNES16BitButton variant="primary" onclick={() => console.log('Primary')}>
						{#snippet children()}PRIMARY{/snippet}
					</SNES16BitButton>
					<SNES16BitButton variant="secondary" onclick={() => console.log('Secondary')}>
						{#snippet children()}SECONDARY{/snippet}
					</SNES16BitButton>
					<SNES16BitButton variant="danger" onclick={() => console.log('Danger')}>
						{#snippet children()}DANGER{/snippet}
					</SNES16BitButton>
					<SNES16BitButton variant="success" onclick={() => console.log('Success')}>
						{#snippet children()}SUCCESS{/snippet}
					</SNES16BitButton>
					<SNES16BitButton variant="primary" size="sm" disabled>
						{#snippet children()}DISABLED{/snippet}
					</SNES16BitButton>
				</div>
			</div>

			<!-- Progressive Gaming Provider -->
			<div class="mb-6">
				<h3 class="text-sm font-medium text-gray-300 mb-3">Progressive Gaming Provider (Era Themes)</h3>
				<div class="flex flex-wrap gap-2 mb-3">
					{#each ['8bit', '16bit', '32bit', '64bit', 'modern'] as era}
						<button
							onclick={() => (selectedGamingEra = era as typeof selectedGamingEra)}
							class="px-3 py-1 rounded text-xs font-mono transition {selectedGamingEra === era ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}"
						>
							{era.toUpperCase()}
						</button>
					{/each}
				</div>
				<ProgressiveGamingProvider era={selectedGamingEra} scanlines={true} crtEffect={selectedGamingEra === '32bit'}>
					{#snippet children()}
						<div style="padding: 1rem;">
							<p style="margin: 0 0 0.5rem;">Sample content in <strong>{selectedGamingEra}</strong> era theme.</p>
							<p style="margin: 0; font-size: 0.8rem; opacity: 0.7;">Scanlines + CRT effects applied based on era.</p>
						</div>
					{/snippet}
				</ProgressiveGamingProvider>
			</div>

			<!-- GPU Cache Demo -->
			<div class="mb-6">
				<h3 class="text-sm font-medium text-gray-300 mb-3">GPU Cache Integration Demo</h3>
				<GPUCacheIntegrationDemo />
			</div>

			<!-- NES 3D LOD Processor -->
			<div class="mb-6">
				<h3 class="text-sm font-medium text-gray-300 mb-3">NES 3D LOD Processor</h3>
				<NES3DLODProcessor />
			</div>

			<!-- Retro Recommendation Modal -->
			<div class="mb-4">
				<h3 class="text-sm font-medium text-gray-300 mb-3">Retro Recommendation Modal</h3>
				<button
					onclick={() => (showRetroModal = true)}
					class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 text-sm"
				>
					Open AI Recommendations
				</button>
				<RetroRecommendationModal
					bind:open={showRetroModal}
					onclose={() => (showRetroModal = false)}
					onselect={(rec) => console.log('Selected:', rec)}
				/>
			</div>
		</div>
	{:else if activeSection === 'bits-ui'}
		<div class="bg-gray-900 rounded-lg shadow-xl p-6 border border-amber-900/30">
			<h2 class="text-lg font-semibold text-amber-400 mb-4">Bits UI Component Library</h2>
			<p class="text-sm text-gray-400 mb-4">
				bits-ui v2.16.2 headless primitives — Dialog, Select, Button, Input with YoRHa styling.
			</p>
			<BitsUIDemo />
		</div>
	{:else if activeSection === 'command-interface'}
		<div class="bg-gray-900 rounded-lg shadow-xl border border-amber-900/30 overflow-hidden">
			<h2 class="text-lg font-semibold text-amber-400 p-6 pb-2">YoRHa Command Interface</h2>
			<p class="text-sm text-gray-400 px-6 pb-4">
				Advanced 3D holographic command terminal with WebGL, module monitoring, and AI command routing.
			</p>
			<YoRHaCommandInterface />
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