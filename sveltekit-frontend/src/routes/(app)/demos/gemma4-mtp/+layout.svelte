<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { page } from '$app/state';

	let { children }: { children: Snippet } = $props();

	const architectureLinks = [
		{ href: '/demos/gemma4-mtp', label: 'Gemma 4 MTP Assistant', icon: 'zap' },
		{ href: '/demos/client-inference', label: 'Inference Lab', icon: 'cpu' },
		{ href: '/demos/webgpu-showcase', label: 'WebGPU Showcase', icon: 'monitor' },
		{ href: '/admin/ai-dashboard/lab', label: 'AI Dashboard Lab', icon: 'server' }
	];
</script>

<div class="gemma4-layout-container min-h-screen bg-[#0d0e14] text-[#e0e0e0]">
	<!-- Architectural Header -->
	<header class="border-b border-[#222533] bg-[#12141c]/90 backdrop-blur sticky top-0 z-30 px-6 py-4">
		<div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
					<Icon name="sparkles" class="w-5 h-5" />
				</div>
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-lg font-bold tracking-tight text-white">Gemma 4 MTP & WebGPU Alignment</h1>
						<span class="px-2 py-0.5 text-[10px] font-mono uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-700/50 rounded">Browser SLM</span>
						<span class="px-2 py-0.5 text-[10px] font-mono uppercase bg-amber-950/80 text-amber-400 border border-amber-700/50 rounded">MTP Drafter</span>
					</div>
					<p class="text-xs text-gray-400">
						Client WebGPU E2B + MTP Speculative Drafting | LiteRT CPU Sidecar (:8070) | Server Synthesis: Ornith 1.5-9B (:8090)
					</p>
				</div>
			</div>

			<!-- Topology Indicators -->
			<div class="flex flex-wrap items-center gap-2 text-xs font-mono">
				<div class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181a24] border border-[#2a2d3d]">
					<span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
					<span class="text-gray-400">WebGPU:</span>
					<span class="text-cyan-300 font-semibold">E2B q4f16</span>
				</div>
				<div class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181a24] border border-[#2a2d3d]">
					<span class="w-2 h-2 rounded-full bg-amber-400"></span>
					<span class="text-gray-400">MTP:</span>
					<span class="text-amber-300 font-semibold">4 Heads (~1.78x)</span>
				</div>
				<div class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181a24] border border-[#2a2d3d]">
					<span class="w-2 h-2 rounded-full bg-emerald-400"></span>
					<span class="text-gray-400">Server LLM:</span>
					<span class="text-emerald-300 font-semibold">Ornith 1.5-9B</span>
				</div>
			</div>
		</div>

		<!-- Nav Tabs -->
		<nav class="max-w-7xl mx-auto flex items-center gap-2 mt-4 pt-3 border-t border-[#1c1f2e]">
			{#each architectureLinks as link}
				<a
					href={link.href}
					class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors {page.url.pathname === link.href ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1c28]'}"
				>
					<Icon name={link.icon} class="w-3.5 h-3.5" />
					{link.label}
				</a>
			{/each}
		</nav>
	</header>

	<!-- Content Slot -->
	<main class="max-w-7xl mx-auto p-6">
		{@render children()}
	</main>
</div>

<style>
	:global(.gemma4-layout-container) {
		color-scheme: dark;
	}
</style>
