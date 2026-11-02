<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface CitationData {
		id: string;
		citationType?: string;
		formattedCitation?: string;
		quotedText?: string;
		legalPrinciple?: string;
		relevanceScore?: number;
		isKeyAuthority?: boolean;
		documentTitle?: string;
		caseTitle?: string;
		sourceUrl?: string;
		jurisdiction?: string;
		effectiveDate?: string;
		createdAt?: string;
	}

	let {
		citation = null,
		open = $bindable(false),
		onClose = () => {},
		onViewFull,
		onAttachToCase,
	}: {
		citation: CitationData | null;
		open?: boolean;
		onClose?: () => void;
		onViewFull?: (citation: CitationData) => void;
		onAttachToCase?: (citation: CitationData) => void;
	} = $props();

	function close() {
		open = false;
		onClose();
	}

	function formatDate(val: string | null | undefined) {
		if (!val) return null;
		const d = new Date(val);
		if (isNaN(d.getTime())) return String(val);
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const TYPE_LABELS: Record<string, string> = {
		statute: 'Statute',
		case_law: 'Case Law',
		regulation: 'Regulation',
		rule: 'Rule',
		executive_order: 'Exec. Order',
		treaty: 'Treaty',
	};

	let relevancePct = $derived(
		citation?.relevanceScore != null ? Math.round(citation.relevanceScore * 100) : null
	);

	let relevanceColor = $derived.by(() => {
		if (relevancePct == null) return '#94a3b8';
		if (relevancePct >= 80) return '#34d399';
		if (relevancePct >= 50) return '#fbbf24';
		return '#f87171';
	});
</script>

<Dialog.Root open={open && Boolean(citation)} onOpenChange={(v) => { if (!v) close(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="cvm-backdrop" />
		<Dialog.Content class="cvm-panel">
			<!-- Tactical HUD Corner Notches -->
			<div class="hud-notch-tl" aria-hidden="true"></div>
			<div class="hud-notch-tr" aria-hidden="true"></div>
			<div class="hud-notch-bl" aria-hidden="true"></div>
			<div class="hud-notch-br" aria-hidden="true"></div>

			<!-- Top accent gradient -->
			<div class="cvm-top-line" aria-hidden="true"></div>

			<!-- Header -->
			<div class="cvm-header">
				<div class="cvm-title-row">
					<Icon name="scale" class="cvm-icon" />
					<div class="cvm-title-content">
						<Dialog.Title class="cvm-title">{citation?.formattedCitation ?? 'Citation'}</Dialog.Title>
						<div class="cvm-meta">
							{#if citation?.citationType}
								<span class="cvm-type-badge">{TYPE_LABELS[citation.citationType] ?? citation.citationType}</span>
							{/if}
							{#if citation?.isKeyAuthority}
								<span class="cvm-key-badge">Key Authority</span>
							{/if}
							{#if relevancePct != null}
								<span class="cvm-relevance" style="color: {relevanceColor}">
									{relevancePct}% relevance
								</span>
							{/if}
						</div>
					</div>
				</div>
				<Dialog.Close class="cvm-close" onclick={close} aria-label="Close">&#x2715;</Dialog.Close>
			</div>

			<!-- Body -->
			{#if citation}
				<div class="cvm-body">
					<!-- Dates row -->
					<div class="cvm-dates">
						{#if citation.createdAt}
							<span><Icon name="calendar" class="inline-icon" /> {formatDate(citation.createdAt)}</span>
						{/if}
						{#if citation.effectiveDate}
							<span><Icon name="clock" class="inline-icon" /> Effective {formatDate(citation.effectiveDate)}</span>
						{/if}
						{#if citation.jurisdiction}
							<span><Icon name="map-pin" class="inline-icon" /> {citation.jurisdiction}</span>
						{/if}
					</div>

					<!-- Legal Principle -->
					{#if citation.legalPrinciple}
						<div class="cvm-section">
							<div class="cvm-section-label">Legal Principle</div>
							<p class="cvm-principle">{citation.legalPrinciple}</p>
						</div>
					{/if}

					<!-- Quoted text -->
					{#if citation.quotedText}
						<div class="cvm-section">
							<div class="cvm-section-label">Quoted Text</div>
							<blockquote class="cvm-quote">{citation.quotedText}</blockquote>
						</div>
					{/if}

					<!-- Source Document / Case -->
					{#if citation.documentTitle || citation.caseTitle || citation.sourceUrl}
						<div class="cvm-section">
							<div class="cvm-section-label">Source Context</div>
							<div class="cvm-source-chips">
								{#if citation.documentTitle}
									<span class="cvm-chip">
										<span class="chip-key">Doc:</span> {citation.documentTitle}
									</span>
								{/if}
								{#if citation.caseTitle}
									<span class="cvm-chip">
										<span class="chip-key">Case:</span> {citation.caseTitle}
									</span>
								{/if}
								{#if citation.sourceUrl}
									<a
										href={citation.sourceUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="cvm-chip cvm-link"
									>
										<Icon name="external-link" class="inline-icon" /> View Source
									</a>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div class="cvm-footer">
					<button type="button" class="cvm-btn ghost" onclick={close}>Close</button>
					<div class="cvm-actions">
						{#if onAttachToCase}
							<button
								type="button"
								class="cvm-btn secondary"
								onclick={() => { onAttachToCase?.(citation); close(); }}
							>
								<Icon name="paperclip" class="btn-icon" />
								Attach to Case
							</button>
						{/if}
						{#if onViewFull}
							<button
								type="button"
								class="cvm-btn primary"
								onclick={() => { onViewFull?.(citation); close(); }}
							>
								<Icon name="arrow-right" class="btn-icon" />
								View Full
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.cvm-backdrop) {
		position: fixed; inset: 0; z-index: 10000;
		display: flex; align-items: center; justify-content: center;
		background: rgba(4, 7, 14, 0.85); backdrop-filter: blur(12px) saturate(1.15); padding: 1rem;
		animation: cvmFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}
	:global(.cvm-panel) {
		position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
		z-index: 10001;
		width: min(44rem, calc(100vw - 2rem)); max-height: 88vh;
		display: flex; flex-direction: column;
		background: linear-gradient(180deg, rgba(18, 24, 36, 0.98) 0%, rgba(9, 13, 20, 0.99) 100%);
		border: 1px solid rgba(243, 212, 113, 0.32);
		border-radius: 8px; box-shadow: 0 0 0 1px rgba(243, 212, 113, 0.08), 0 28px 70px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(243, 212, 113, 0.1);
		backdrop-filter: blur(20px); overflow: hidden;
		animation: cvmScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.cvm-top-line {
		position: absolute; top: 0; left: 1.5rem; right: 1.5rem; height: 1px;
		background: linear-gradient(90deg, transparent, rgba(243, 212, 113, 0.9), rgba(126, 231, 255, 0.6), transparent);
		pointer-events: none; z-index: 2;
	}

	.hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
		position: absolute; width: 8px; height: 8px; pointer-events: none; z-index: 3;
	}
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2px solid #f3d471; border-right: 2px solid #f3d471; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #f3d471; border-left: 2px solid #f3d471; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2px solid #f3d471; border-right: 2px solid #f3d471; }

	/* Header */
	.cvm-header {
		display: flex; align-items: flex-start; justify-content: space-between;
		gap: 1rem; padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(243, 212, 113, 0.2);
		background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
		position: relative; z-index: 1;
	}
	.cvm-title-row { display: flex; align-items: flex-start; gap: .75rem; flex: 1; min-width: 0; }
	:global(.cvm-icon) { width: 1.2rem; height: 1.2rem; color: #f3d471; flex-shrink: 0; margin-top: 3px; }
	.cvm-title-content { flex: 1; min-width: 0; }
	:global(.cvm-title) {
		font-size: 1.05rem; font-weight: 700; color: #f3d471;
		margin: 0 0 .3rem; line-height: 1.3; font-family: 'JetBrains Mono', 'Fira Code', monospace;
		word-break: break-word; letter-spacing: 0.05em;
	}
	.cvm-meta { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
	.cvm-type-badge {
		display: inline-block; font-size: .68rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .05em; padding: .15rem .45rem;
		border: 1px solid rgba(126, 231, 255, 0.35); border-radius: 4px;
		background: rgba(126, 231, 255, 0.1); color: #7ee7ff;
	}
	.cvm-key-badge {
		display: inline-block; font-size: .68rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .05em; padding: .15rem .45rem;
		border: 1px solid rgba(243, 212, 113, 0.4); border-radius: 4px;
		background: rgba(243, 212, 113, 0.12); color: #f3d471;
	}
	.cvm-relevance { font-size: .75rem; font-weight: 600; font-family: monospace; }
	:global(.cvm-close) {
		flex-shrink: 0; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(243, 212, 113, 0.25);
		color: rgba(212, 199, 163, 0.7); cursor: pointer; font-size: 0.875rem;
		width: 1.875rem; height: 1.875rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;
		transition: all 0.15s ease;
	}
	:global(.cvm-close:hover) { color: #f3d471; background: rgba(243, 212, 113, 0.15); border-color: rgba(243, 212, 113, 0.5); }

	/* Body */
	.cvm-body { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
	.cvm-body::-webkit-scrollbar { width: 6px; }
	.cvm-body::-webkit-scrollbar-thumb { background: rgba(243, 212, 113, 0.18); border-radius: 3px; }

	.cvm-dates {
		display: flex; flex-wrap: wrap; gap: .75rem 1.5rem;
		font-size: .78rem; color: rgba(212, 199, 163, 0.6); font-family: monospace;
	}
	.cvm-dates span { display: flex; align-items: center; gap: .3rem; }
	:global(.inline-icon) { width: .85rem; height: .85rem; }

	.cvm-section { display: flex; flex-direction: column; gap: .5rem; }
	.cvm-section-label {
		font-size: .68rem; text-transform: uppercase; letter-spacing: .08em;
		color: #f3d471; font-weight: 700; font-family: monospace;
	}

	.cvm-principle {
		font-size: .85rem; line-height: 1.7; color: rgba(233, 240, 255, 0.88);
		margin: 0; background: rgba(0, 0, 0, 0.25); padding: 0.75rem 1rem; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.cvm-quote {
		font-size: .82rem; line-height: 1.7; color: rgba(212, 199, 163, 0.85);
		margin: 0; padding: .75rem 1rem;
		border-left: 3px solid #f3d471;
		background: rgba(243, 212, 113, 0.05);
		border-radius: 0 4px 4px 0;
		font-style: normal;
	}

	.cvm-source-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
	.cvm-chip {
		font-size: .72rem; padding: .2rem .55rem;
		background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(243, 212, 113, 0.2);
		border-radius: 4px; color: rgba(212, 199, 163, 0.8); word-break: break-all;
	}
	.chip-key { color: #f3d471; }
	.cvm-link { text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem; color: #7ee7ff; border-color: rgba(126, 231, 255, 0.3); }
	.cvm-link:hover { color: white; background: rgba(126, 231, 255, 0.15); }

	/* Footer */
	.cvm-footer {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.5rem; border-top: 1px solid rgba(243, 212, 113, 0.15);
		background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
	}
	.cvm-actions { display: flex; gap: .5rem; }
	.cvm-btn {
		display: inline-flex; align-items: center; gap: .375rem;
		border: 1px solid; border-radius: 5px; font-size: .8rem; font-weight: 600;
		padding: .45rem .9rem; cursor: pointer; transition: background .15s, color .15s;
		text-decoration: none; font-family: monospace; text-transform: uppercase;
	}
	:global(.btn-icon) { width: .85rem; height: .85rem; }
	.cvm-btn.ghost { background: transparent; border-color: rgba(212, 199, 163, 0.25); color: rgba(212, 199, 163, 0.7); }
	.cvm-btn.ghost:hover { background: rgba(212, 199, 163, 0.1); color: #f3d471; }
	.cvm-btn.secondary { background: rgba(212, 199, 163, 0.08); border-color: rgba(212, 199, 163, 0.3); color: rgba(212, 199, 163, 0.9); }
	.cvm-btn.secondary:hover { background: rgba(212, 199, 163, 0.16); }
	.cvm-btn.primary { background: rgba(243, 212, 113, 0.15); border-color: rgba(243, 212, 113, 0.5); color: #f3d471; }
	.cvm-btn.primary:hover { background: rgba(243, 212, 113, 0.25); box-shadow: 0 0 10px rgba(243, 212, 113, 0.2); }

	@keyframes cvmFade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes cvmScale { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
</style>
