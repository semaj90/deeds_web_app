<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { goto } from '$app/navigation';

	let {
		report,
		open = $bindable(false),
		onClose = () => {},
		onEdit
	}: {
		report: any | null;
		open?: boolean;
		onClose?: () => void;
		onEdit?: (id: string) => void;
	} = $props();

	function close() {
		open = false;
		onClose();
	}

	function openFull() {
		if (report?.id) {
			close();
			goto(`/reports/${report.id}`);
		}
	}

	function formatDate(val: string | Date | null | undefined) {
		if (!val) return null;
		const d = new Date(val as string);
		if (isNaN(d.getTime())) return String(val);
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const TYPE_LABELS: Record<string, string> = {
		charging_memo: 'Charging Memo', intake_summary: 'Intake Summary',
		discovery_list: 'Discovery List', hearing_prep: 'Hearing Prep',
		analysis: 'Analysis', summary: 'Summary', timeline: 'Timeline',
		evidence_review: 'Evidence Review', legal_memo: 'Legal Memo', custom: 'Custom'
	};
	const STATUS_COLOR: Record<string, string> = {
		draft: '#94a3b8', pending: '#fbbf24', completed: '#34d399', published: '#60a5fa'
	};

	// Strip HTML tags for plain-text preview
	function stripHtml(html: string) {
		return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	}

	let contentPreview = $derived.by(() => {
		const raw = report?.content ?? report?.contentHtml ?? '';
		if (!raw) return null;
		const plain = stripHtml(raw);
		return plain.length > 600 ? plain.slice(0, 600) + '…' : plain;
	});
</script>

<Dialog.Root open={open && Boolean(report)} onOpenChange={(v) => { if (!v) close(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="rvm-backdrop" />
		<Dialog.Content class="rvm-panel">
			<!-- Tactical HUD Corner Notches -->
			<div class="hud-notch-tl" aria-hidden="true"></div>
			<div class="hud-notch-tr" aria-hidden="true"></div>
			<div class="hud-notch-bl" aria-hidden="true"></div>
			<div class="hud-notch-br" aria-hidden="true"></div>

			<!-- Top accent gradient -->
			<div class="rvm-top-line" aria-hidden="true"></div>

			<!-- Header -->
			<div class="rvm-header">
				<div class="rvm-title-row">
					<Icon name="file-text" class="rvm-icon" />
					<div class="min-w-0">
						<Dialog.Title class="rvm-title">{report?.title ?? 'Report Preview'}</Dialog.Title>
						<div class="rvm-meta">
							{#if report?.type}
								<span class="rvm-type-badge">{TYPE_LABELS[report.type] ?? report.type}</span>
							{/if}
							{#if report?.status}
								<span class="rvm-status" style="color:{STATUS_COLOR[report.status] ?? '#94a3b8'}">
									{report.status}
								</span>
							{/if}
						</div>
					</div>
				</div>
				<Dialog.Close class="rvm-close" onclick={close} aria-label="Close">✕</Dialog.Close>
			</div>

			<!-- Body -->
			{#if report}
				<div class="rvm-body">
					<!-- Dates row -->
					<div class="rvm-dates">
						{#if report.createdAt}
							<span><Icon name="calendar" class="inline-icon" /> Created {formatDate(report.createdAt)}</span>
						{/if}
						{#if report.updatedAt && report.updatedAt !== report.createdAt}
							<span><Icon name="clock" class="inline-icon" /> Updated {formatDate(report.updatedAt)}</span>
						{/if}
						{#if report.generatedAt}
							<span><Icon name="zap" class="inline-icon" /> Generated {formatDate(report.generatedAt)}</span>
						{/if}
					</div>

					<!-- Content preview -->
					{#if contentPreview}
						<div class="rvm-section">
							<div class="rvm-section-label">Content Preview</div>
							<p class="rvm-content-preview">{contentPreview}</p>
						</div>
					{:else}
						<div class="rvm-empty-preview">No content preview available for this report.</div>
					{/if}

					<!-- Metadata -->
					<div class="rvm-grid">
						{#if report.caseId}
							<div class="rvm-meta-item">
								<span class="meta-label">Case ID</span>
								<span class="meta-val font-mono">{report.caseId}</span>
							</div>
						{/if}
						{#if report.author}
							<div class="rvm-meta-item">
								<span class="meta-label">Author</span>
								<span class="meta-val">{report.author}</span>
							</div>
						{/if}
						{#if report.exportFormat}
							<div class="rvm-meta-item">
								<span class="meta-label">Format</span>
								<span class="meta-val uppercase font-mono">{report.exportFormat}</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Footer -->
				<div class="rvm-footer">
					<button type="button" class="rvm-btn ghost" onclick={close}>Close</button>
					<div class="rvm-actions">
						{#if onEdit}
							<button type="button" class="rvm-btn secondary" onclick={() => { onEdit?.(report.id); close(); }}>
								<Icon name="edit" class="btn-icon" />
								Edit
							</button>
						{/if}
						<button type="button" class="rvm-btn primary" onclick={openFull}>
							<Icon name="external-link" class="btn-icon" />
							Open Full Report
						</button>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.rvm-backdrop) {
		position: fixed; inset: 0; z-index: 10000;
		display: flex; align-items: center; justify-content: center;
		background: rgba(4, 7, 14, 0.85); backdrop-filter: blur(12px) saturate(1.15); padding: 1rem;
		animation: rvmFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}
	:global(.rvm-panel) {
		position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
		z-index: 10001;
		width: min(44rem, calc(100vw - 2rem)); max-height: 88vh;
		display: flex; flex-direction: column;
		background: linear-gradient(180deg, rgba(18, 24, 36, 0.98) 0%, rgba(9, 13, 20, 0.99) 100%);
		border: 1px solid rgba(243, 212, 113, 0.32);
		border-radius: 8px; box-shadow: 0 0 0 1px rgba(243, 212, 113, 0.08), 0 28px 70px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(243, 212, 113, 0.1);
		backdrop-filter: blur(20px); overflow: hidden;
		animation: rvmScale 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.rvm-top-line {
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

	.rvm-header {
		display: flex; align-items: flex-start; justify-content: space-between;
		gap: 1rem; padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(243, 212, 113, 0.2);
		background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
		position: relative; z-index: 1;
	}
	.rvm-title-row { display: flex; align-items: flex-start; gap: .75rem; flex: 1; min-width: 0; }
	:global(.rvm-icon) { width: 1.25rem; height: 1.25rem; color: #f3d471; flex-shrink: 0; margin-top: 3px; }
	:global(.rvm-title) {
		font-size: 1.125rem; font-weight: 700; color: #f3d471;
		margin: 0 0 .25rem; line-height: 1.3; font-family: 'JetBrains Mono', 'Fira Code', monospace;
		word-break: break-word; letter-spacing: 0.05em;
	}
	.rvm-meta { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
	.rvm-type-badge {
		font-size: .68rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .05em; padding: .15rem .45rem;
		border: 1px solid rgba(126, 231, 255, 0.35); border-radius: 4px;
		background: rgba(126, 231, 255, 0.1); color: #7ee7ff;
	}
	.rvm-status { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
	:global(.rvm-close) {
		flex-shrink: 0; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(243, 212, 113, 0.25);
		color: rgba(212, 199, 163, 0.7); cursor: pointer; font-size: 0.875rem;
		width: 1.875rem; height: 1.875rem; border-radius: 4px; display: flex; align-items: center; justify-content: center;
		transition: all 0.15s ease;
	}
	:global(.rvm-close:hover) { color: #f3d471; background: rgba(243, 212, 113, 0.15); border-color: rgba(243, 212, 113, 0.5); }

	.rvm-body { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
	.rvm-body::-webkit-scrollbar { width: 6px; }
	.rvm-body::-webkit-scrollbar-thumb { background: rgba(243, 212, 113, 0.18); border-radius: 3px; }

	.rvm-dates {
		display: flex; flex-wrap: wrap; gap: .75rem 1.5rem;
		font-size: .78rem; color: rgba(212, 199, 163, 0.6); font-family: monospace;
	}
	.rvm-dates span { display: flex; align-items: center; gap: .3rem; }
	:global(.inline-icon) { width: .85rem; height: .85rem; }

	.rvm-section { display: flex; flex-direction: column; gap: .5rem; }
	.rvm-section-label {
		font-size: .68rem; text-transform: uppercase; letter-spacing: .08em;
		color: #f3d471; font-weight: 700; font-family: monospace;
	}
	.rvm-content-preview {
		font-size: .85rem; line-height: 1.7; color: rgba(233, 240, 255, 0.88);
		margin: 0; background: rgba(0, 0, 0, 0.25); padding: 0.75rem 1rem; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05);
	}
	.rvm-empty-preview {
		font-size: .82rem; color: rgba(212, 199, 163, 0.65); font-style: normal; padding: 1rem 0;
	}
	.rvm-grid {
		display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .75rem;
	}
	.rvm-meta-item { display: flex; flex-direction: column; gap: .15rem; }
	.meta-label { font-size: .68rem; text-transform: uppercase; color: rgba(212, 199, 163, 0.45); font-family: monospace; }
	.meta-val { font-size: .82rem; color: rgba(212, 199, 163, 0.85); }

	.rvm-footer {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.5rem; border-top: 1px solid rgba(243, 212, 113, 0.15);
		background: rgba(0, 0, 0, 0.35); flex-shrink: 0;
	}
	.rvm-actions { display: flex; gap: .5rem; }
	.rvm-btn {
		display: inline-flex; align-items: center; gap: .375rem;
		border: 1px solid; border-radius: 5px; font-size: .8rem; font-weight: 600;
		padding: .45rem .9rem; cursor: pointer; transition: background .15s, color .15s;
		text-decoration: none; font-family: monospace; text-transform: uppercase;
	}
	:global(.btn-icon) { width: .85rem; height: .85rem; }
	.rvm-btn.ghost { background: transparent; border-color: rgba(212, 199, 163, 0.25); color: rgba(212, 199, 163, 0.7); }
	.rvm-btn.ghost:hover { background: rgba(212, 199, 163, 0.1); color: #f3d471; }
	.rvm-btn.secondary { background: rgba(212, 199, 163, 0.08); border-color: rgba(212, 199, 163, 0.3); color: rgba(212, 199, 163, 0.9); }
	.rvm-btn.secondary:hover { background: rgba(212, 199, 163, 0.16); }
	.rvm-btn.primary { background: rgba(243, 212, 113, 0.15); border-color: rgba(243, 212, 113, 0.5); color: #f3d471; }
	.rvm-btn.primary:hover { background: rgba(243, 212, 113, 0.25); box-shadow: 0 0 10px rgba(243, 212, 113, 0.2); }

	@keyframes rvmFade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes rvmScale { from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
</style>
