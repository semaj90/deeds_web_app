<script lang="ts">
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
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

<svelte:window onkeydown={handleKeydown} />

{#if open && citation}
	<div
		class="cvm-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Citation preview"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
	>
		<div class="cvm-panel">
			<!-- Header -->
			<div class="cvm-header">
				<div class="cvm-title-row">
					<Icon name="scale" class="cvm-icon" />
					<div class="cvm-title-content">
						<h2 class="cvm-title">{citation.formattedCitation ?? 'Citation'}</h2>
						<div class="cvm-meta">
							{#if citation.citationType}
								<span class="cvm-type-badge">{TYPE_LABELS[citation.citationType] ?? citation.citationType}</span>
							{/if}
							{#if citation.isKeyAuthority}
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
				<button type="button" class="cvm-close" onclick={close} aria-label="Close">&#x2715;</button>
			</div>

			<!-- Body -->
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

				<!-- Quoted Text -->
				{#if citation.quotedText}
					<div class="cvm-section">
						<div class="cvm-section-label">Quoted Text</div>
						<blockquote class="cvm-quote">{citation.quotedText}</blockquote>
					</div>
				{/if}

				<!-- Source info -->
				{#if citation.documentTitle || citation.caseTitle}
					<div class="cvm-section">
						<div class="cvm-section-label">Source</div>
						<div class="cvm-source-chips">
							{#if citation.caseTitle}
								<span class="cvm-chip"><span class="chip-key">Case:</span> {citation.caseTitle}</span>
							{/if}
							{#if citation.documentTitle && citation.documentTitle !== citation.caseTitle}
								<span class="cvm-chip"><span class="chip-key">Document:</span> {citation.documentTitle}</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Verification status -->
				<div class="cvm-verification">
					{#if citation.sourceUrl}
						<span class="cvm-verified">
							<Icon name="circle-check" class="inline-icon" /> Verified Source
						</span>
					{:else}
						<span class="cvm-unverified">
							<Icon name="circle-help" class="inline-icon" /> Unverified
						</span>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="cvm-footer">
				<button type="button" class="cvm-btn ghost" onclick={close}>Close</button>
				<div class="cvm-actions">
					{#if citation.sourceUrl}
						<a href={citation.sourceUrl} target="_blank" rel="noopener noreferrer" class="cvm-btn secondary">
							<Icon name="external-link" class="btn-icon" />
							Official Text
						</a>
					{/if}
					{#if onAttachToCase}
						<button type="button" class="cvm-btn secondary" onclick={() => { onAttachToCase?.(citation); close(); }}>
							<Icon name="link" class="btn-icon" />
							Attach to Case
						</button>
					{/if}
					{#if onViewFull}
						<button type="button" class="cvm-btn primary" onclick={() => { onViewFull?.(citation); close(); }}>
							<Icon name="arrow-right" class="btn-icon" />
							Full Detail
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.cvm-backdrop {
		position: fixed; inset: 0; z-index: 60;
		display: flex; align-items: center; justify-content: center;
		background: rgba(0,0,0,.72); backdrop-filter: blur(4px); padding: 1rem;
	}
	.cvm-panel {
		width: 100%; max-width: 620px; max-height: 88vh;
		display: flex; flex-direction: column;
		background: #131519; border: 1px solid rgba(212,199,163,.12);
		border-radius: 10px; box-shadow: 0 24px 64px rgba(0,0,0,.6); overflow: hidden;
	}

	/* Header */
	.cvm-header {
		display: flex; align-items: flex-start; justify-content: space-between;
		gap: 1rem; padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(212,199,163,.1);
		background: rgba(255,255,255,.02); flex-shrink: 0;
	}
	.cvm-title-row { display: flex; align-items: flex-start; gap: .75rem; flex: 1; min-width: 0; }
	:global(.cvm-icon) { width: 1.2rem; height: 1.2rem; color: rgba(196,117,43,.7); flex-shrink: 0; margin-top: 3px; }
	.cvm-title-content { flex: 1; min-width: 0; }
	.cvm-title {
		font-size: 1.05rem; font-weight: 700; color: rgba(212,199,163,.95);
		margin: 0 0 .3rem; line-height: 1.3; font-family: 'JetBrains Mono', 'Fira Code', monospace;
		word-break: break-word;
	}
	.cvm-meta { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
	.cvm-type-badge {
		display: inline-block; font-size: .68rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .05em; padding: .15rem .45rem;
		border: 1px solid rgba(96,165,250,.3); border-radius: 4px;
		background: rgba(96,165,250,.1); color: #93c5fd;
	}
	.cvm-key-badge {
		display: inline-block; font-size: .68rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .05em; padding: .15rem .45rem;
		border: 1px solid rgba(196,117,43,.4); border-radius: 4px;
		background: rgba(196,117,43,.12); color: #c4752b;
	}
	.cvm-relevance { font-size: .75rem; font-weight: 600; }
	.cvm-close {
		flex-shrink: 0; background: none; border: none;
		color: rgba(212,199,163,.4); cursor: pointer; font-size: 1rem;
		padding: .25rem; border-radius: 4px; transition: color .15s;
	}
	.cvm-close:hover { color: rgba(212,199,163,.9); }

	/* Body */
	.cvm-body { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

	.cvm-dates {
		display: flex; flex-wrap: wrap; gap: .75rem 1.5rem;
		font-size: .78rem; color: rgba(212,199,163,.45);
	}
	.cvm-dates span { display: flex; align-items: center; gap: .3rem; }
	:global(.inline-icon) { width: .85rem; height: .85rem; }

	.cvm-section { display: flex; flex-direction: column; gap: .5rem; }
	.cvm-section-label {
		font-size: .68rem; text-transform: uppercase; letter-spacing: .08em;
		color: rgba(212,199,163,.35); font-weight: 700;
	}

	.cvm-principle {
		font-size: .85rem; line-height: 1.7; color: rgba(212,199,163,.8);
		margin: 0;
	}

	.cvm-quote {
		font-size: .82rem; line-height: 1.7; color: rgba(212,199,163,.65);
		margin: 0; padding: .75rem 1rem;
		border-left: 3px solid rgba(196,117,43,.35);
		background: rgba(196,117,43,.04);
		border-radius: 0 4px 4px 0;
		font-style: italic;
	}

	.cvm-source-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
	.cvm-chip {
		font-size: .72rem; padding: .2rem .55rem;
		background: rgba(212,199,163,.06); border: 1px solid rgba(212,199,163,.15);
		border-radius: 4px; color: rgba(212,199,163,.7); word-break: break-all;
	}
	.chip-key { color: rgba(212,199,163,.45); }

	.cvm-verification {
		display: flex; align-items: center; gap: .5rem;
		font-size: .78rem;
	}
	.cvm-verified {
		display: flex; align-items: center; gap: .3rem;
		color: #34d399;
	}
	.cvm-unverified {
		display: flex; align-items: center; gap: .3rem;
		color: rgba(212,199,163,.35);
	}

	/* Footer */
	.cvm-footer {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.5rem; border-top: 1px solid rgba(212,199,163,.1);
		background: rgba(255,255,255,.02); flex-shrink: 0;
	}
	.cvm-actions { display: flex; gap: .5rem; }
	.cvm-btn {
		display: inline-flex; align-items: center; gap: .375rem;
		border: 1px solid; border-radius: 5px; font-size: .8rem; font-weight: 600;
		padding: .45rem .9rem; cursor: pointer; transition: background .15s, color .15s;
		text-decoration: none; background: none;
	}
	:global(.btn-icon) { width: .85rem; height: .85rem; }
	.cvm-btn.ghost { border-color: rgba(212,199,163,.2); color: rgba(212,199,163,.5); }
	.cvm-btn.ghost:hover { background: rgba(212,199,163,.06); color: rgba(212,199,163,.85); }
	.cvm-btn.secondary { background: rgba(212,199,163,.07); border-color: rgba(212,199,163,.25); color: rgba(212,199,163,.8); }
	.cvm-btn.secondary:hover { background: rgba(212,199,163,.14); }
	.cvm-btn.primary { background: rgba(196,117,43,.2); border-color: rgba(196,117,43,.45); color: #c4752b; }
	.cvm-btn.primary:hover { background: rgba(196,117,43,.3); }
</style>