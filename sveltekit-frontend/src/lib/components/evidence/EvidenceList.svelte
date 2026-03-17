<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { formatFileSize, formatDate, getIcon, getTypeLabel } from './evidence-utils.js';

	let {
		evidence = [],
		viewMode = 'grid',
		hasActiveFilters = false,
		onOpenDetail,
		onAnalyze,
		onReport,
		onLegal,
		onEdit,
		onDelete,
		onClearFilters,
		onLinkCase
	}: {
		evidence?: any[];
		viewMode?: 'grid' | 'list';
		hasActiveFilters?: boolean;
		onOpenDetail?: (e: MouseEvent, id: string) => void;
		onAnalyze?: (doc: any) => void;
		onReport?: (id: string) => void;
		onLegal?: (id: string, title: string) => void;
		onEdit?: (id: string) => void;
		onDelete?: (id: string, name: string) => void;
		onClearFilters?: () => void;
		onLinkCase?: (id: string) => void;
	} = $props();
</script>

{#if evidence.length === 0}
	<div class="ev-empty">
		<div class="ev-empty-icon">
			<Icon name="folder-open" class="w-10 h-10" />
		</div>
		<p class="ev-empty-title">
			{hasActiveFilters ? 'No evidence matches your filters' : 'No evidence uploaded yet'}
		</p>
		<p class="ev-empty-sub">
			{hasActiveFilters ? 'Try adjusting your search or filter criteria' : 'Upload files to get started with evidence management'}
		</p>
		{#if hasActiveFilters}
			<button type="button" class="ev-empty-clear" onclick={onClearFilters}>
				Clear all filters
			</button>
		{/if}
	</div>
{:else if viewMode === 'grid'}
	<div class="ev-grid">
		{#each evidence as doc (doc.id)}
			<div
				class="ev-card"
				role="button"
				tabindex="0"
				onclick={(e) => onOpenDetail?.(e, doc.id)}
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenDetail?.(e as any, doc.id); }}
			>
				<div class="ev-card-top">
					<span class="ev-card-icon">{getIcon(doc.fileType ?? doc.file_type ?? '')}</span>
					<div class="ev-card-info">
						<h3 class="ev-card-title">{doc.title || doc.fileName || doc.file_name || ''}</h3>
						<span class="ev-card-meta">
							{getTypeLabel(doc.fileType ?? doc.file_type ?? '')} &middot; {formatFileSize(doc.fileSize ?? doc.file_size ?? 0)}
						</span>
					</div>
					{#if doc.similarity !== undefined}
						<span class="ev-score" class:high={doc.similarity >= 0.7} class:medium={doc.similarity >= 0.4 && doc.similarity < 0.7} class:low={doc.similarity < 0.4}>
							{Math.round(doc.similarity * 100)}%
						</span>
					{/if}
				</div>

				{#if doc.description || doc.content}
					<p class="ev-card-desc">{doc.description || doc.content}</p>
				{/if}

				<div class="ev-card-footer">
					<span class="ev-card-date">{formatDate(doc.createdAt ?? doc.created_at)}</span>
					{#if !doc.similarity}
						<div class="ev-card-actions">
							<button type="button" onclick={(e) => { e.stopPropagation(); onAnalyze?.(doc); }} title="AI Analysis">
								<Icon name="sparkles" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onReport?.(doc.id); }} title="Report">
								<Icon name="file-text" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onLegal?.(doc.id, doc.title || doc.fileName || doc.id); }} title="Legal Analysis">
								<Icon name="scale" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onLinkCase?.(doc.id); }} title="Link to Case">
								<Icon name="link" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onEdit?.(doc.id); }} title="Edit">
								<Icon name="pencil" class="w-3.5 h-3.5" />
							</button>
							<button type="button" class="action-danger" onclick={(e) => { e.stopPropagation(); onDelete?.(doc.id, doc.title || doc.fileName || doc.id); }} title="Delete">
								<Icon name="trash-2" class="w-3.5 h-3.5" />
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div class="ev-table-wrap">
		<table class="ev-table">
			<thead>
				<tr>
					<th>File</th>
					<th>Type</th>
					<th>Size</th>
					<th>Uploaded</th>
					<th class="th-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each evidence as doc (doc.id)}
					<tr
						class="ev-row"
						onclick={(e) => onOpenDetail?.(e, doc.id)}
					>
						<td>
							<div class="ev-row-file">
								<span class="ev-row-icon">{getIcon(doc.fileType ?? doc.file_type ?? '')}</span>
								<div>
									<p class="ev-row-name">{doc.title || doc.fileName || doc.file_name || ''}</p>
									{#if doc.description}
										<p class="ev-row-desc">{doc.description}</p>
									{/if}
								</div>
							</div>
						</td>
						<td class="ev-row-type">{getTypeLabel(doc.fileType ?? doc.file_type ?? '')}</td>
						<td class="ev-row-size">{formatFileSize(doc.fileSize ?? doc.file_size ?? 0)}</td>
						<td class="ev-row-date">{formatDate(doc.createdAt ?? doc.created_at)}</td>
						<td class="ev-row-actions">
							<button type="button" onclick={(e) => { e.stopPropagation(); onAnalyze?.(doc); }} title="Analyze">
								<Icon name="sparkles" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onReport?.(doc.id); }} title="Report">
								<Icon name="file-text" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onLegal?.(doc.id, doc.title || doc.fileName || doc.id); }} title="Legal">
								<Icon name="scale" class="w-3.5 h-3.5" />
							</button>
							<button type="button" onclick={(e) => { e.stopPropagation(); onEdit?.(doc.id); }} title="Edit">
								<Icon name="pencil" class="w-3.5 h-3.5" />
							</button>
							<button type="button" class="action-danger" onclick={(e) => { e.stopPropagation(); onDelete?.(doc.id, doc.title || doc.fileName || doc.id); }} title="Delete">
								<Icon name="trash-2" class="w-3.5 h-3.5" />
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	/* Empty State */
	.ev-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}
	.ev-empty-icon {
		color: rgba(212, 199, 163, 0.15);
		margin-bottom: 1rem;
	}
	.ev-empty-title {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.6);
		margin: 0 0 0.375rem;
	}
	.ev-empty-sub {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.3);
		margin: 0;
	}
	.ev-empty-clear {
		margin-top: 1rem;
		padding: 0.375rem 1rem;
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.2);
		border-radius: 6px;
		color: #60a5fa;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ev-empty-clear:hover {
		background: rgba(96, 165, 250, 0.2);
	}

	/* Grid View */
	.ev-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 0.75rem;
		padding: 1rem 1.5rem;
	}
	.ev-card {
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		padding: 1rem 1.125rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ev-card:hover {
		background: rgba(255, 255, 255, 0.045);
		border-color: rgba(255, 255, 255, 0.1);
	}
	.ev-card-top {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.625rem;
	}
	.ev-card-icon {
		font-size: 1.75rem;
		flex-shrink: 0;
	}
	.ev-card-info {
		flex: 1;
		min-width: 0;
	}
	.ev-card-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.9);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ev-card-meta {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.35);
	}
	.ev-score {
		flex-shrink: 0;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.03em;
	}
	.ev-score.high {
		background: rgba(34, 197, 94, 0.12);
		color: #4ade80;
		border: 1px solid rgba(34, 197, 94, 0.2);
	}
	.ev-score.medium {
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.2);
	}
	.ev-score.low {
		background: rgba(239, 68, 68, 0.12);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.2);
	}
	.ev-card-desc {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.5);
		margin: 0 0 0.625rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.5;
	}
	.ev-card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ev-card-date {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.25);
	}
	.ev-card-actions {
		display: flex;
		gap: 0.125rem;
	}
	.ev-card-actions button {
		padding: 0.25rem;
		border-radius: 4px;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ev-card-actions button:hover {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.08);
	}
	.ev-card-actions button.action-danger:hover {
		color: #f87171;
		background: rgba(239, 68, 68, 0.08);
	}

	/* Table View */
	.ev-table-wrap {
		margin: 0 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		overflow: hidden;
	}
	.ev-table {
		width: 100%;
		border-collapse: collapse;
	}
	.ev-table thead tr {
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.ev-table th {
		padding: 0.625rem 1rem;
		text-align: left;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(212, 199, 163, 0.3);
	}
	.th-right {
		text-align: right;
	}
	.ev-row {
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
		cursor: pointer;
		transition: background 0.1s;
	}
	.ev-row:hover {
		background: rgba(255, 255, 255, 0.03);
	}
	.ev-row td {
		padding: 0.625rem 1rem;
	}
	.ev-row-file {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.ev-row-icon {
		font-size: 1.25rem;
	}
	.ev-row-name {
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(212, 199, 163, 0.85);
		margin: 0;
	}
	.ev-row-desc {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.35);
		margin: 0.125rem 0 0;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ev-row-type, .ev-row-size {
		font-size: 0.78rem;
		color: rgba(212, 199, 163, 0.5);
	}
	.ev-row-date {
		font-size: 0.75rem;
		color: rgba(212, 199, 163, 0.35);
	}
	.ev-row-actions {
		text-align: right;
	}
	.ev-row-actions button {
		padding: 0.25rem;
		border-radius: 4px;
		color: rgba(212, 199, 163, 0.3);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ev-row-actions button:hover {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.08);
	}
	.ev-row-actions button.action-danger:hover {
		color: #f87171;
		background: rgba(239, 68, 68, 0.08);
	}
</style>