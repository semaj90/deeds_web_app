<script lang="ts">
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
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

<svelte:window onkeydown={handleKeydown} />

{#if open && report}
	<div
		class="rvm-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Report preview"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
	>
		<div class="rvm-panel">
			<!-- Header -->
			<div class="rvm-header">
				<div class="rvm-title-row">
					<Icon name="file-text" class="rvm-icon" />
					<div>
						<h2 class="rvm-title">{report.title}</h2>
						<div class="rvm-meta">
							{#if report.type}
								<span class="rvm-type-badge">{TYPE_LABELS[report.type] ?? report.type}</span>
							{/if}
							{#if report.status}
								<span class="rvm-status" style="color:{STATUS_COLOR[report.status] ?? '#94a3b8'}">
									{report.status}
								</span>
							{/if}
						</div>
					</div>
				</div>
				<button type="button" class="rvm-close" onclick={close} aria-label="Close">✕</button>
			</div>

			<!-- Body -->
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
					<div class="rvm-empty-content">
						<Icon name="file" class="w-8 h-8 text-[rgba(212,199,163,0.2)]" />
						<span>No content yet</span>
					</div>
				{/if}

				<!-- Metadata chips -->
				{#if report.metadata && typeof report.metadata === 'object'}
					{@const entries = Object.entries(report.metadata).filter(([k, v]) => v != null && k !== 'reportType')}
					{#if entries.length > 0}
						<div class="rvm-section">
							<div class="rvm-section-label">Metadata</div>
							<div class="rvm-chips">
								{#each entries as [k, v]}
									<span class="rvm-chip"><span class="chip-key">{k}:</span> {String(v).slice(0, 40)}</span>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="rvm-footer">
				<button type="button" class="rvm-btn ghost" onclick={close}>Close</button>
				<div class="rvm-actions">
					{#if onEdit}
						<button type="button" class="rvm-btn secondary" onclick={() => { onEdit?.(report.id); close(); }}>
							<Icon name="pencil" class="w-3.5 h-3.5" />
							Edit
						</button>
					{/if}
					<button type="button" class="rvm-btn primary" onclick={openFull}>
						<Icon name="arrow-right" class="w-3.5 h-3.5" />
						Open Report
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.rvm-backdrop {
		position: fixed; inset: 0; z-index: 60;
		display: flex; align-items: center; justify-content: center;
		background: rgba(0,0,0,.72); backdrop-filter: blur(4px); padding: 1rem;
	}
	.rvm-panel {
		width: 100%; max-width: 620px; max-height: 88vh;
		display: flex; flex-direction: column;
		background: #131519; border: 1px solid rgba(212,199,163,.12);
		border-radius: 10px; box-shadow: 0 24px 64px rgba(0,0,0,.6); overflow: hidden;
	}
	.rvm-header {
		display: flex; align-items: flex-start; justify-content: space-between;
		gap: 1rem; padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(212,199,163,.1);
		background: rgba(255,255,255,.02); flex-shrink: 0;
	}
	.rvm-title-row { display: flex; align-items: flex-start; gap: .75rem; flex: 1; min-width: 0; }
	:global(.rvm-icon) { width: 1.2rem; height: 1.2rem; color: rgba(212,199,163,.6); flex-shrink: 0; margin-top: 3px; }
	.rvm-title { font-size: 1.05rem; font-weight: 700; color: rgba(212,199,163,.95); margin: 0 0 .3rem; line-height: 1.3; word-break: break-word; }
	.rvm-meta { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
	.rvm-type-badge {
		display: inline-block; font-size: .68rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .05em; padding: .15rem .45rem;
		border: 1px solid rgba(96,165,250,.3); border-radius: 4px;
		background: rgba(96,165,250,.1); color: #93c5fd;
	}
	.rvm-status { font-size: .75rem; font-weight: 600; text-transform: capitalize; }
	.rvm-close {
		flex-shrink: 0; background: none; border: none;
		color: rgba(212,199,163,.4); cursor: pointer; font-size: 1rem;
		padding: .25rem; border-radius: 4px; transition: color .15s;
	}
	.rvm-close:hover { color: rgba(212,199,163,.9); }

	.rvm-body { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

	.rvm-dates {
		display: flex; flex-wrap: wrap; gap: .75rem 1.5rem;
		font-size: .78rem; color: rgba(212,199,163,.45);
	}
	.rvm-dates span { display: flex; align-items: center; gap: .3rem; }
	:global(.inline-icon) { width: .85rem; height: .85rem; }

	.rvm-section { display: flex; flex-direction: column; gap: .5rem; }
	.rvm-section-label {
		font-size: .68rem; text-transform: uppercase; letter-spacing: .08em;
		color: rgba(212,199,163,.35); font-weight: 700;
	}
	.rvm-content-preview {
		font-size: .85rem; line-height: 1.7; color: rgba(212,199,163,.75);
		margin: 0; white-space: pre-wrap; word-break: break-word;
	}
	.rvm-empty-content {
		display: flex; flex-direction: column; align-items: center; gap: .5rem;
		padding: 2rem; color: rgba(212,199,163,.3); font-size: .85rem;
	}
	.rvm-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
	.rvm-chip {
		font-size: .72rem; padding: .2rem .55rem;
		background: rgba(212,199,163,.06); border: 1px solid rgba(212,199,163,.15);
		border-radius: 4px; color: rgba(212,199,163,.7); word-break: break-all;
	}
	.chip-key { color: rgba(212,199,163,.45); }

	.rvm-footer {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.5rem; border-top: 1px solid rgba(212,199,163,.1);
		background: rgba(255,255,255,.02); flex-shrink: 0;
	}
	.rvm-actions { display: flex; gap: .5rem; }
	.rvm-btn {
		display: inline-flex; align-items: center; gap: .375rem;
		border: 1px solid; border-radius: 5px; font-size: .8rem; font-weight: 600;
		padding: .45rem .9rem; cursor: pointer; transition: background .15s, color .15s;
		text-decoration: none; background: none;
	}
	.rvm-btn.ghost { border-color: rgba(212,199,163,.2); color: rgba(212,199,163,.5); }
	.rvm-btn.ghost:hover { background: rgba(212,199,163,.06); color: rgba(212,199,163,.85); }
	.rvm-btn.secondary { background: rgba(212,199,163,.07); border-color: rgba(212,199,163,.25); color: rgba(212,199,163,.8); }
	.rvm-btn.secondary:hover { background: rgba(212,199,163,.14); }
	.rvm-btn.primary { background: rgba(52,211,153,.15); border-color: rgba(52,211,153,.4); color: #6ee7b7; }
	.rvm-btn.primary:hover { background: rgba(52,211,153,.25); }
</style>
