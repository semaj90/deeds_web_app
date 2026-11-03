<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import ModalLight from '$lib/components/ui/ModalLight.svelte';
	import ModalAlt from '$lib/components/ui/modal/Modal.svelte';
	import YoRHaModal from '$lib/components/yorha/YoRHaModal.svelte';

	let modal1Open = $state(false);
	let modal2Open = $state(false);
	let modal3Open = $state(false);
	let yorhaModalOpen = $state(false);
	let lightModalOpen = $state(false);
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<div class="flex items-center gap-2 mb-1">
			<span class="text-xs uppercase tracking-widest text-[#f3d471] font-mono">Design System / Primitives</span>
		</div>
		<h1 class="text-2xl font-bold tracking-tight text-white mb-2">Bits UI v2 Dialog & HUD Modal Showcase</h1>
		<p class="text-sm text-sand/70 leading-relaxed">
			Unified modal architecture powered by <strong>Bits UI v2 Dialog primitives</strong> (<code class="text-xs font-mono bg-black/40 px-1 py-0.5 rounded text-[#f3d471]">Dialog.Root</code>, <code class="text-xs font-mono bg-black/40 px-1 py-0.5 rounded text-[#f3d471]">Dialog.Portal</code>, <code class="text-xs font-mono bg-black/40 px-1 py-0.5 rounded text-[#f3d471]">Dialog.Overlay</code>, <code class="text-xs font-mono bg-black/40 px-1 py-0.5 rounded text-[#f3d471]">Dialog.Content</code>).
			Fully portaled to <code class="text-xs font-mono bg-black/40 px-1 py-0.5 rounded text-[#7ee7ff]">document.body</code> with <code class="text-xs font-mono bg-black/40 px-1 py-0.5 rounded text-[#7ee7ff]">z-[9990+]</code> to eliminate clipping and sidebar overlap, tactical corner notches, frosted obsidian glass or crisp ivory court parchment, and full keyboard focus trapping.
		</p>
	</header>

	<div class="flex gap-3 flex-wrap mb-8">
		<button
			class="px-4 py-2.5 rounded bg-black/40 border border-[#f3d471]/40 hover:border-[#f3d471] text-xs font-mono uppercase tracking-wider text-[#f3d471] transition-all hover:shadow-[0_0_12px_rgba(243,212,113,0.2)] cursor-pointer"
			onclick={() => (modal1Open = true)}
		>
			⚖️ Canonical Modal (Dark HUD)
		</button>
		<button
			class="px-4 py-2.5 rounded bg-[#fcfbf9] border border-[#c59e2b] hover:border-[#dfb847] text-xs font-mono uppercase tracking-wider text-slate-900 font-bold transition-all shadow-[0_0_14px_rgba(197,158,43,0.3)] hover:scale-102 cursor-pointer"
			onclick={() => (lightModalOpen = true)}
		>
			📜 Custom Modal Light (Parchment)
		</button>
		<button
			class="px-4 py-2.5 rounded bg-black/40 border border-[#7ee7ff]/40 hover:border-[#7ee7ff] text-xs font-mono uppercase tracking-wider text-[#7ee7ff] transition-all hover:shadow-[0_0_12px_rgba(126,231,255,0.2)] cursor-pointer"
			onclick={() => (modal2Open = true)}
		>
			🛡️ Modal Alt (Re-Export)
		</button>
		<button
			class="px-4 py-2.5 rounded bg-black/40 border border-sand/30 hover:border-sand/60 text-xs font-mono uppercase tracking-wider text-sand/80 transition-all cursor-pointer"
			onclick={() => (modal3Open = true)}
		>
			📐 Large Layout Modal
		</button>
		<button
			class="px-4 py-2.5 rounded bg-black/40 border border-[#ffaa00]/40 hover:border-[#ffaa00] text-xs font-mono uppercase tracking-wider text-[#ffaa00] transition-all hover:shadow-[0_0_12px_rgba(255,170,0,0.2)] cursor-pointer"
			onclick={() => (yorhaModalOpen = true)}
		>
			🦊 Phoenix / YoRHa System HUD
		</button>
	</div>

	<!-- Canonical Modal -->
	<Modal
		bind:open={modal1Open}
		title="Canonical Bits UI Modal"
		subtitle="PORTALED TO BODY • ZERO CLIPPING • CORNER NOTCHES"
		size="md"
		variant="courtroom"
	>
		<div class="space-y-4">
			<p class="text-sm leading-relaxed text-zinc-200">
				This modal runs on <strong>Bits UI v2 Dialog primitives</strong>. Because it is portaled to <code class="font-mono text-xs bg-black/40 px-1 py-0.5 rounded text-[#f3d471]">document.body</code> via <code class="font-mono text-xs bg-black/40 px-1 py-0.5 rounded text-[#f3d471]">Dialog.Portal</code>, it floats cleanly above all drawers, assistant sidebars, and nested overflow layouts.
			</p>
			<div class="p-3.5 bg-black/40 border border-[#f3d471]/20 rounded text-xs space-y-2">
				<div class="flex items-center gap-2 text-[#f3d471] font-mono uppercase tracking-wider">
					<span>✓ Accessibility Verified</span>
				</div>
				<ul class="list-disc pl-4 space-y-1 text-sand/70">
					<li>Focus trapped automatically inside dialog</li>
					<li>Escape key dismisses without manual event listeners</li>
					<li>Outside overlay click dismisses cleanly</li>
					<li>ARIA roles and labels managed by Bits UI</li>
				</ul>
			</div>
		</div>
		{#snippet footer()}
			<div class="flex justify-end gap-2">
				<button
					class="px-4 py-2 text-xs font-mono uppercase tracking-wider bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold rounded transition-colors shadow-[0_0_10px_rgba(243,212,113,0.3)] cursor-pointer"
					onclick={() => (modal1Open = false)}
				>
					Confirm & Close
				</button>
			</div>
		{/snippet}
	</Modal>

	<!-- Custom Modal Light with Celestial Legal-AI Styling -->
	<ModalLight
		bind:open={lightModalOpen}
		title="Custom Legal Light Modal"
		subtitle="PARCHMENT DOSSIER • BURNISHED GOLD NOTCHES • 3D CONTRAST"
		coordBadge="LEX ET IUSTITIA • CONST-768"
		icon="celestial"
		size="lg"
	>
		<div class="space-y-4 text-slate-800">
			<div class="flex items-center justify-between pb-2 border-b border-[#eedfca]">
				<div class="flex items-center gap-2">
					<span class="text-amber-700 text-sm">✦</span>
					<span class="text-xs font-mono uppercase tracking-widest text-[#8c6a23] font-bold">Parent Atlas Constellation Docket</span>
				</div>
				<span class="text-[11px] font-mono text-slate-500 bg-[#efe5d6] px-2 py-0.5 rounded border border-[#dfd0bd]">REV: sha256:768-d</span>
			</div>

			<p class="text-sm leading-relaxed text-slate-700">
				This celestial light modal delivers the <strong>crisp legal brief / court dossier presentation</strong> inspired by the Parent Atlas Detective Constellation and high-contrast light notifications.
			</p>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div class="p-3.5 bg-[#f5efe6] border border-[#dfd0bd] rounded-lg text-xs space-y-2">
					<div class="flex items-center gap-1.5 text-[#966b1a] font-mono font-bold uppercase tracking-wider">
						<span>✦ Court Record Specification</span>
					</div>
					<ul class="list-disc pl-4 space-y-1 text-slate-700">
						<li><strong>Ivory Parchment Base:</strong> Clean legal aesthetic (<code class="bg-[#ebe2d3] px-1 py-0.5 rounded text-slate-900 font-mono">#fcfbf9</code>).</li>
						<li><strong>Celestial Notches:</strong> Signature attorney gold accents in <code class="bg-[#ebe2d3] px-1 py-0.5 rounded text-amber-900 font-mono">#c59e2b</code> with crosshairs.</li>
						<li><strong>3D Scrim Contrast:</strong> Portaled over a softened backdrop blur for razor-sharp contrast.</li>
						<li><strong>Bits UI v2 Primitives:</strong> Accessible focus trap, body scroll locking, and Escape key dismissal.</li>
					</ul>
				</div>

				<div class="p-3.5 bg-[#f5efe6] border border-[#dfd0bd] rounded-lg text-xs space-y-2">
					<div class="flex items-center gap-1.5 text-[#966b1a] font-mono font-bold uppercase tracking-wider">
						<span>⚖ Legal-AI Verification Envelope</span>
					</div>
					<div class="space-y-1.5 text-slate-700 font-mono text-[11px]">
						<div class="flex justify-between py-0.5 border-b border-[#e5dccf]">
							<span class="text-slate-500">CANONICAL STORE:</span>
							<span class="font-bold text-slate-900">PostgreSQL 18.4 (pgvector)</span>
						</div>
						<div class="flex justify-between py-0.5 border-b border-[#e5dccf]">
							<span class="text-slate-500">EMBEDDING LANE:</span>
							<span class="text-emerald-800 font-bold">EmbeddingGemma 768-D</span>
						</div>
						<div class="flex justify-between py-0.5 border-b border-[#e5dccf]">
							<span class="text-slate-500">GRAPH TRAVERSAL:</span>
							<span class="text-amber-800 font-bold">KAG AST Lineage Bound</span>
						</div>
						<div class="flex justify-between py-0.5">
							<span class="text-slate-500">AUDIT PROOF:</span>
							<span class="text-blue-800 font-bold">Zero Residual Rows</span>
						</div>
					</div>
				</div>
			</div>
		</div>
		{#snippet footer()}
			<div class="flex justify-between items-center w-full">
				<div class="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
					<span class="text-[#c59e2b]">✧</span>
					<span>Constellation Node: #E-002 • Witness Statement</span>
				</div>
				<div class="flex gap-2">
					<button
						type="button"
						class="px-4 py-2 text-xs font-mono uppercase tracking-wider bg-[#ebe2d3] hover:bg-[#ded2c0] text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
						onclick={() => (lightModalOpen = false)}
					>
						Dismiss
					</button>
					<button
						type="button"
						class="px-5 py-2 text-xs font-mono uppercase tracking-wider bg-gradient-to-r from-[#c59e2b] to-[#dfb847] hover:from-[#b58e1b] hover:to-[#cfa837] text-slate-950 font-bold rounded-lg transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
						onclick={() => (lightModalOpen = false)}
					>
						<span>✦</span>
						<span>Accept Precedent</span>
					</button>
				</div>
			</div>
		{/snippet}
	</ModalLight>

	<!-- Modal Alt Re-Export -->
	<ModalAlt
		bind:open={modal2Open}
		title="Modal Alt (Forwarded Implementation)"
		description="Unified with canonical Modal — zero duplication"
		size="md"
		variant="legal"
	>
		<p class="text-sm text-zinc-200 leading-relaxed mb-3">
			<code class="font-mono text-xs bg-black/40 px-1 py-0.5 rounded text-[#7ee7ff]">ui/modal/Modal.svelte</code> now safely forwards props to the canonical Bits UI modal implementation.
		</p>
		<p class="text-xs text-sand/70 leading-relaxed">
			This completely resolves the bug where alternative modal implementations had conflicting z-indexes or became obscured behind the floating Legal AI Assistant panel.
		</p>
		{#snippet footer()}
			<div class="flex justify-end gap-2">
				<button
					class="px-4 py-2 text-xs font-mono uppercase tracking-wider bg-sand/20 hover:bg-sand/30 text-white rounded transition-colors cursor-pointer"
					onclick={() => (modal2Open = false)}
				>
					Close Alt Modal
				</button>
			</div>
		{/snippet}
	</ModalAlt>

	<!-- Large Modal with Multi-Column Content -->
	<Modal
		bind:open={modal3Open}
		title="Case Intelligence Hub — Dossier Audit"
		subtitle="CASE #2026-CA-0042 • RAG + GRAPH HYPERLINKING"
		size="xl"
		variant="legal"
	>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div class="p-3 bg-black/30 border border-sand/20 rounded space-y-2">
				<h4 class="text-xs font-mono uppercase tracking-wider text-[#f3d471]">Active Statutes</h4>
				<ul class="text-xs space-y-1 text-sand/80 font-mono">
					<li class="p-1.5 bg-black/20 rounded border border-sand/10">18 U.S.C. § 1030 (CFAA)</li>
					<li class="p-1.5 bg-black/20 rounded border border-sand/10">18 U.S.C. § 1001 (Statements)</li>
					<li class="p-1.5 bg-black/20 rounded border border-sand/10">18 U.S.C. § 1343 (Wire Fraud)</li>
				</ul>
			</div>
			<div class="p-3 bg-black/30 border border-sand/20 rounded space-y-2">
				<h4 class="text-xs font-mono uppercase tracking-wider text-[#7ee7ff]">Vector Geometry</h4>
				<div class="text-xs space-y-1 text-sand/80 font-mono">
					<div>DIMENSIONS: 768</div>
					<div>METRIC: COSINE</div>
					<div>QUANTIZATION: SQ_U8</div>
					<div>QDRANT POINTS: 328,348</div>
				</div>
			</div>
			<div class="p-3 bg-black/30 border border-sand/20 rounded space-y-2">
				<h4 class="text-xs font-mono uppercase tracking-wider text-sand">Topology Status</h4>
				<div class="text-xs space-y-1 text-sand/80 font-mono">
					<div>AST GRAPH: ONLINE</div>
					<div>TREE-SITTER: SYNCED</div>
					<div>ACE PACKETS: READY</div>
				</div>
			</div>
		</div>
		{#snippet footer()}
			<div class="flex justify-end gap-2">
				<button
					class="px-4 py-2 text-xs font-mono uppercase tracking-wider bg-black/40 border border-sand/40 hover:border-sand text-sand rounded transition-colors cursor-pointer"
					onclick={() => (modal3Open = false)}
				>
					Dismiss Dossier
				</button>
			</div>
		{/snippet}
	</Modal>

	<!-- YoRHa / Phoenix Justice HUD Modal -->
	<YoRHaModal
		open={yorhaModalOpen}
		title="COURT RECORD // EVIDENCE AUDIT"
		subtitle="PHOENIX JUSTICE PROTOCOL • TRIAL LOG #42"
		type="system"
		onClose={() => (yorhaModalOpen = false)}
	>
		<div class="space-y-4">
			<div class="p-3.5 bg-black/40 border border-[#f3d471]/30 rounded text-xs space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-[#f3d471] font-mono font-bold uppercase tracking-wider">Tactical System Status</span>
					<span class="font-mono text-[10px] text-zinc-400">STATUS: ACTIVE</span>
				</div>
				<p class="text-zinc-300 leading-relaxed">
					Equipped with YoRHa gold corner brackets (<code class="text-[#f3d471]">.hud-notch-tl/tr/bl/br</code>), pulsing status indicator, scanline texture, and Bits UI accessible dialog portaling.
				</p>
			</div>
			<div class="grid grid-cols-3 gap-2 text-center font-mono text-xs">
				<div class="p-2.5 bg-black/30 border border-white/10 rounded">
					<span class="text-[10px] text-sand/60 block">SPIRIT POWER</span>
					<span class="text-sm font-bold text-[#7ee7ff]">85 / 100</span>
				</div>
				<div class="p-2.5 bg-black/30 border border-white/10 rounded">
					<span class="text-[10px] text-sand/60 block">LOGIC GAUGE</span>
					<span class="text-sm font-bold text-[#f3d471]">100 / 100</span>
				</div>
				<div class="p-2.5 bg-black/30 border border-white/10 rounded">
					<span class="text-[10px] text-sand/60 block">COURT RECORD</span>
					<span class="text-sm font-bold text-white">4 EXHIBITS</span>
				</div>
			</div>
		</div>
		{#snippet footer()}
			<div class="flex justify-end gap-2">
				<button
					class="px-4 py-2 text-xs font-mono uppercase tracking-wider bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold rounded transition-colors shadow-[0_0_12px_rgba(243,212,113,0.35)] cursor-pointer"
					onclick={() => (yorhaModalOpen = false)}
				>
					Resume Trial
				</button>
			</div>
		{/snippet}
	</YoRHaModal>
</div>
