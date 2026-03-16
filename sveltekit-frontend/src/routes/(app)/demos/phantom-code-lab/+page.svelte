<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface PhantomFile {
		name: string;
		originalPath: string;
		lines: number;
		reason: string;
		pattern: string;
	}

	const extracted: PhantomFile[] = [
		{ name: 'citation-cache.ts', originalPath: 'src/lib/citations/', lines: 560, reason: 'Duplicate of ai/citation-cache.ts — zero imports', pattern: 'CHR-ROM97 cartridge tensors' },
		{ name: 'chrrom-cache.ts', originalPath: 'src/lib/gpu/', lines: 29, reason: 'Re-exported by gpu/index.ts but zero consumers', pattern: 'NES CHR-ROM pattern Map' },
		{ name: 'chr-rom-pattern-cache.ts', originalPath: 'src/lib/cache/', lines: 773, reason: 'Nintendo-themed Redis cache — zero imports', pattern: 'NES tile banks + Redis' },
		{ name: 'integration-status.ts', originalPath: 'src/lib/', lines: 172, reason: 'Diagnostic phantom — zero imports', pattern: 'WebGPU/WASM/CHR-ROM status checks' },
		{ name: 'citations-manager.ts', originalPath: 'src/lib/modules/', lines: 490, reason: 'Dead chain: only used by auth-demo.ts', pattern: 'Citation CRUD manager class' },
		{ name: 'auth-demo.ts', originalPath: 'src/lib/modules/', lines: 130, reason: 'Zero route/component consumers', pattern: 'Auth demo placeholder' },
	];

	const totalLines = extracted.reduce((s, f) => s + f.lines, 0);

	interface WiredSystem {
		name: string;
		status: string;
		files: string[];
		endpoints: string[];
	}

	const wiredSystems: WiredSystem[] = [
		{
			name: 'CHR-ROM97 Cartridge Pipeline',
			status: '100% wired',
			files: [
				'lib/models/ChatSession.svelte.ts → prefetch',
				'lib/ai/client-cache.ts → IndexedDB storage',
				'lib/server/cartridge/chr97-builder.ts → binary builder',
				'lib/server/cache/cartridge-tensor-bridge.ts → Redis + search',
				'lib/shared/chr97-reader.ts → browser parser',
			],
			endpoints: [
				'POST /api/cartridge/export — build + cache',
				'POST /api/cartridge/search — tensor similarity',
				'GET  /api/cartridge/stats — Redis cache stats',
				'POST /api/cartridge/invalidate — evict cache',
			]
		},
		{
			name: 'WebGPU Init (root layout)',
			status: 'CRITICAL — every page',
			files: [
				'+layout.svelte line 36 → $lib/webgpu/webgpu-init',
				'+layout.svelte line 45 → $lib/webgpu/webgpu-cpu-fallback',
			],
			endpoints: []
		},
		{
			name: 'NES Memory Palace',
			status: 'Demo route active',
			files: [
				'lib/memory/nes-memory-architecture.ts → NES banks',
				'lib/memory/rune-to-legal-doc.ts → converter',
				'demos/memory-palace/+page.svelte → visualization',
			],
			endpoints: []
		},
	];

	let statsLoading = $state(false);
	let statsData = $state<Record<string, unknown> | null>(null);

	async function fetchStats() {
		statsLoading = true;
		try {
			const res = await fetch('/api/cartridge/stats');
			if (res.ok) statsData = await res.json();
		} catch { /* */ }
		statsLoading = false;
	}
</script>

<div class="max-w-4xl mx-auto py-8 px-6">
	<div class="mb-8">
		<h1 class="text-2xl font-bold m-0 mb-1">Phantom Code Lab</h1>
		<p class="text-sm opacity-50 m-0">Extracted phantom files + wired system map. Audit reference for safe file archival.</p>
	</div>

	<section class="mb-8">
		<h2 class="flex items-center gap-2 text-base font-semibold m-0 mb-3 pb-2 border-b border-sand-dark">
			<Icon name="trash-2" size={16} />
			Extracted Phantom Files ({extracted.length} files, {totalLines} lines)
		</h2>
		<p class="text-xs opacity-40 mb-3">Moved to deeds_labs/phantom-code-lab/ — zero active consumers verified via grep audit.</p>
		<div class="grid gap-2">
			{#each extracted as file}
				<div class="p-3 border border-red-500/20 rounded-lg bg-panel-soft">
					<div class="flex items-center gap-2 mb-1">
						<Icon name="file-x" size={14} />
						<span class="text-sm font-mono font-semibold">{file.name}</span>
						<span class="text-[11px] opacity-40 font-mono ml-auto">{file.lines}L</span>
					</div>
					<p class="text-xs opacity-50 m-0">{file.originalPath} — {file.reason}</p>
					<p class="text-[11px] opacity-30 m-0 mt-1">Pattern: {file.pattern}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="mb-8">
		<h2 class="flex items-center gap-2 text-base font-semibold m-0 mb-3 pb-2 border-b border-sand-dark">
			<Icon name="cable" size={16} />
			Wired Systems (DO NOT MOVE)
		</h2>
		<div class="grid gap-3">
			{#each wiredSystems as sys}
				<div class="p-4 border border-green-500/30 rounded-lg bg-panel-soft">
					<div class="flex items-center gap-2 mb-2">
						<Icon name="check-circle" size={16} />
						<span class="text-sm font-semibold">{sys.name}</span>
						<span class="text-[11px] px-2 py-0.5 rounded bg-green-500/20 text-green-400 ml-auto">{sys.status}</span>
					</div>
					<div class="text-xs opacity-60 mb-1">
						{#each sys.files as f}
							<div class="font-mono">{f}</div>
						{/each}
					</div>
					{#if sys.endpoints.length > 0}
						<div class="text-xs opacity-40 mt-2 pt-2 border-t border-sand-dark/50">
							{#each sys.endpoints as ep}
								<div class="font-mono">{ep}</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<section class="mb-8">
		<h2 class="flex items-center gap-2 text-base font-semibold m-0 mb-3 pb-2 border-b border-sand-dark">
			<Icon name="database" size={16} />
			Cartridge Cache Stats (Live)
		</h2>
		<button onclick={fetchStats} disabled={statsLoading} class="px-3 py-1.5 text-sm border border-sand-dark rounded bg-panel hover:bg-accent/10 disabled:opacity-50">
			{statsLoading ? 'Loading...' : 'Fetch Stats'}
		</button>
		{#if statsData}
			<pre class="mt-3 p-3 text-xs font-mono bg-black/30 rounded overflow-auto">{JSON.stringify(statsData, null, 2)}</pre>
		{/if}
	</section>

	<section class="p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
		<h3 class="flex items-center gap-2 text-sm font-semibold m-0 mb-2">
			<Icon name="alert-triangle" size={16} />
			5-Point Wiring Audit (MANDATORY before archiving files)
		</h3>
		<ol class="text-xs opacity-70 m-0 pl-4 space-y-1">
			<li><code>grep -r 'from.*$lib/module'</code> across entire src/</li>
			<li>Check root <code>+layout.svelte</code> for dynamic imports</li>
			<li>Check all <code>+page.svelte</code> files for lazy/dynamic imports</li>
			<li>Check barrel <code>index.ts</code> re-exports and downstream consumers</li>
			<li>Check API routes (<code>src/routes/api/</code>) for server-side imports</li>
		</ol>
	</section>
</div>
