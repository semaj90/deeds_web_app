<!--
  VlmTagModal — clickable tag chip that opens a Dialog showing
  the tag's description, hit count, and example references from the DB.
  Migrated to Bits UI v2 Dialog primitives + Tactical HUD Aesthetic
-->
<script lang="ts">
	import { Dialog } from 'bits-ui';

	interface TagChip {
		/** Postgres UUID — if provided, fetches by ID (increments hit_count) */
		id?: string;
		/** Tag text displayed on the chip */
		name: string;
	}

	interface VlmTag {
		id: string;
		name: string;
		description: string | null;
		examples: string[] | null;
		source: string;
		hitCount: number;
		createdAt: string;
	}

	let { id, name }: TagChip = $props();

	let open      = $state(false);
	let tag       = $state<VlmTag | null>(null);
	let loading   = $state(false);
	let error     = $state<string | null>(null);

	async function openModal() {
		error   = null;
		loading = true;
		open    = true;

		try {
			const url = id
				? `/api/evidence/tags/${encodeURIComponent(id)}`
				: `/api/evidence/tags?name=${encodeURIComponent(name)}`;
			const res  = await fetch(url);
			const data = await res.json();
			tag = (data.tag as VlmTag) ?? null;
		} catch {
			error = 'Could not load tag details.';
		} finally {
			loading = false;
		}
	}

	function closeModal() {
		open  = false;
		tag   = null;
		error = null;
	}
</script>

<!-- Tag chip -->
<button
	type="button"
	class="tag-chip"
	onclick={openModal}
	title="Click to view tag details"
>
	{name}
</button>

<Dialog.Root bind:open onOpenChange={(isOpen) => { if (!isOpen) closeModal(); }}>
	<Dialog.Portal>
		<!-- Tactical Backdrop -->
		<Dialog.Overlay class="hud-modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />

		<!-- Centered Modal Content Container -->
		<div class="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
			<Dialog.Content
				class="pointer-events-auto relative w-full max-w-md bg-[#131b2a]/95 text-sand border border-[#f3d471]/30 rounded-xl shadow-2xl p-6 backdrop-blur-xl"
			>
				<!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
				<span class="hud-notch-tl" aria-hidden="true"></span>
				<span class="hud-notch-tr" aria-hidden="true"></span>
				<span class="hud-notch-bl" aria-hidden="true"></span>
				<span class="hud-notch-br" aria-hidden="true"></span>

				<!-- Top Highlight Bar -->
				<div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471]/80 to-transparent"></div>

				<!-- Header -->
				<header class="flex items-center justify-between pb-3.5 border-b border-[#f3d471]/20">
					<Dialog.Title class="text-base font-bold text-white flex items-center gap-2">
						<span class="text-[#f3d471]">🏷</span>
						<span>{tag?.name ?? name}</span>
					</Dialog.Title>
					<Dialog.Close
						class="text-neutral-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
						aria-label="Close"
					>
						✕
					</Dialog.Close>
				</header>

				<!-- Body -->
				<div class="py-4 space-y-4">
					{#if loading}
						<p class="text-xs text-sand/60 font-mono italic py-4 text-center animate-pulse">Loading tag telemetry…</p>
					{:else if error}
						<div class="p-3 rounded bg-red-950/40 border border-red-500/30 text-xs text-red-200">{error}</div>
					{:else if tag}
						{#if tag.description}
							<p class="text-xs leading-relaxed text-sand/90">{tag.description}</p>
						{:else}
							<p class="text-xs text-sand/40 italic">No description available in registry.</p>
						{/if}

						<dl class="p-3 bg-black/40 border border-sand/10 rounded-lg text-xs space-y-1.5 font-mono">
							<div class="flex justify-between items-center">
								<dt class="text-sand/50">Source</dt>
								<dd><span class="px-2 py-0.5 rounded text-[10px] bg-[#f3d471]/10 text-[#f3d471] border border-[#f3d471]/20 uppercase">{tag.source}</span></dd>
							</div>
							<div class="flex justify-between items-center">
								<dt class="text-sand/50">Searches matched</dt>
								<dd class="text-white font-bold">{tag.hitCount.toLocaleString()}</dd>
							</div>
						</dl>

						{#if tag.examples && tag.examples.length > 0}
							<section class="space-y-1.5">
								<h4 class="text-[11px] font-mono font-bold uppercase tracking-wider text-[#f3d471]">Examples</h4>
								<ul class="space-y-1">
									{#each tag.examples.slice(0, 6) as ex}
										<li class="text-[11px] font-mono text-sand/70 bg-black/30 px-2 py-1 rounded truncate border border-sand/5">{ex}</li>
									{/each}
								</ul>
							</section>
						{/if}
					{:else}
						<p class="text-xs text-sand/40 italic py-4 text-center">Tag not found in registry.</p>
					{/if}
				</div>
			</Dialog.Content>
		</div>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.55rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid rgba(243, 212, 113, 0.2);
		background: rgba(19, 27, 42, 0.8);
		color: #f3d471;
		transition: all 0.15s;
		line-height: 1.4;
	}
	.tag-chip:hover {
		background: rgba(243, 212, 113, 0.15);
		border-color: #f3d471;
		color: #ffffff;
		box-shadow: 0 0 8px rgba(243, 212, 113, 0.2);
	}

	.hud-notch-tl,
	.hud-notch-tr,
	.hud-notch-bl,
	.hud-notch-br {
		position: absolute;
		width: 8px;
		height: 8px;
		pointer-events: none;
	}
	.hud-notch-tl {
		top: -1px;
		left: -1px;
		border-top: 2px solid #f3d471;
		border-left: 2px solid #f3d471;
	}
	.hud-notch-tr {
		top: -1px;
		right: -1px;
		border-top: 2px solid #f3d471;
		border-right: 2px solid #f3d471;
	}
	.hud-notch-bl {
		bottom: -1px;
		left: -1px;
		border-bottom: 2px solid #f3d471;
		border-left: 2px solid #f3d471;
	}
	.hud-notch-br {
		bottom: -1px;
		right: -1px;
		border-bottom: 2px solid #f3d471;
		border-right: 2px solid #f3d471;
	}
</style>
