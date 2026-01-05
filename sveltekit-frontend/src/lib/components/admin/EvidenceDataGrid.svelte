<script lang="ts">

	interface EvidenceFile {
		id: string;
		filename: string;
		file_type: string;
		file_size: number;
		jurisdiction: string;
		processing_status: string;
		created_at: string;
		chunk_count: number;
	}

	interface DataGridProps {
		items: EvidenceFile[];
		total: number;
		page: number;
		pageSize: number;
		isLoading: boolean;
		onRowClick: (item: EvidenceFile) => void;
		onPageChange: (page: number) => void;
		onSearch: (query: string) => void;
		onFilterChange: (filters: Record<string, string>) => void;
	}

	let {
		items = [],
		total = 0,
		page = 1,
		pageSize = 50,
		isLoading = false,
		onRowClick = () => {},
		onPageChange = () => {},
		onSearch = () => {},
		onFilterChange = () => {}
	}: DataGridProps = $props();

	let searchQuery = $state('');
	let filters = $state({
		jurisdiction: '',
		status: '',
		file_type: ''
	});

	let sortColumn = $state('created_at');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	const jurisdictions = ['CA', 'NY', 'TX', 'Fed-US', 'Other'];
	const statuses = ['pending', 'processing', 'completed', 'failed'];
	const fileTypes = ['pdf', 'docx', 'txt'];

	const totalPages = Math.ceil(total / pageSize);

	function handleSearch(e: Event) {
		const target = e.target as HTMLInputElement;
		searchQuery = target.value;
		onSearch(searchQuery);
	}

	function handleFilterChange(key: string, value): string {
		filters[key] = value;
		onFilterChange(filters);
	}

	function handleSort(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'completed':
				return 'badge-success';
			case 'processing':
				return 'badge-info';
			case 'failed':
				return 'badge-error';
			default:
				return 'badge-warning';
		}
	}
</script>

<div class="datagrid-container">
	<!-- Filter Bar -->
	<div class="filter-bar">
		<div class="search-box">
			<input
				type="text"
				placeholder="Search filename..."
				value={searchQuery}
				onchange={handleSearch}
				class="search-input"
			/>
			<span class="search-icon">🔍</span>
		</div>

		<div class="filter-group">
			<select
				value={filters.jurisdiction}
				onchange={(e) => handleFilterChange('jurisdiction', (e.target as HTMLSelectElement).value)}
				class="filter-select"
			>
				<option value="">All Jurisdictions</option>
				{#each jurisdictions as j}
					<option value={j}>{j}</option>
				{/each}
			</select>

			<select
				value={filters.status}
				onchange={(e) => handleFilterChange('status', (e.target as HTMLSelectElement).value)}
				class="filter-select"
			>
				<option value="">All Statuses</option>
				{#each statuses as s}
					<option value={s}>{s}</option>
				{/each}
			</select>

			<select
				value={filters.file_type}
				onchange={(e) => handleFilterChange('file_type', (e.target as HTMLSelectElement).value)}
				class="filter-select"
			>
				<option value="">All Types</option>
				{#each fileTypes as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Table -->
	<div class="table-wrapper">
		{#if isLoading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading evidence files...</p>
			</div>
		{:else if items.length === 0}
			<div class="empty-state">
				<p>No evidence files found</p>
			</div>
		{:else}
			<table class="datagrid">
				<thead>
					<tr>
						<th onclick={() => handleSort('filename')} class="sortable">
							Filename
							{#if sortColumn === 'filename'}
								<span class="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</th>
						<th>Type</th>
						<th>Size</th>
						<th>Jurisdiction</th>
						<th onclick={() => handleSort('processing_status')} class="sortable">
							Status
							{#if sortColumn === 'processing_status'}
								<span class="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</th>
						<th>Chunks</th>
						<th onclick={() => handleSort('created_at')} class="sortable">
							Created
							{#if sortColumn === 'created_at'}
								<span class="sort-indicator">{sortDirection === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item (item.id)}
						<tr onclick={() => onRowClick(item)} class="clickable">
							<td class="filename">{item.filename}</td>
							<td class="type">{item.file_type}</td>
							<td class="size">{formatFileSize(item.file_size)}</td>
							<td class="jurisdiction">{item.jurisdiction}</td>
							<td class="status">
								<span class="badge {getStatusBadgeClass(item.processing_status)}">
									{item.processing_status}
								</span>
							</td>
							<td class="chunks">{item.chunk_count}</td>
							<td class="date">{formatDate(item.created_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<!-- Pagination -->
	<div class="pagination">
		<div class="pagination-info">
			Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} items
		</div>

		<div class="pagination-controls">
			<button
				onclick={() => onPageChange(page - 1)}
				disabled={page === 1}
				class="pagination-btn"
			>
				← Previous
			</button>

			<div class="page-numbers">
				{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
					const startPage = Math.max(1, page - 2);
					return startPage + i;
				}) as p}
					<button
						onclick={() => onPageChange(p)}
						class="page-number"
						class:active={p === page}
					>
						{ p: p }
					</button>
				{/each}
			</div>

			<button
				onclick={() => onPageChange(page + 1)}
				disabled={page === totalPages}
				class="pagination-btn"
			>
				Next →
			</button>
		</div>
	</div>
</div>

<style>
	.datagrid-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #0d0d0f;
		border-radius: 4px;
		overflow: hidden;
	}

	/* Filter Bar */
	.filter-bar {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: #111;
		border-bottom: 1px solid #222;
		flex-wrap: wrap;
	}

	.search-box {
		position: relative;
		flex: 1;
		min-width: 200px;
	}

	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem 0.5rem 2rem;
		background: #16161a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #ddd;
		font-size: 0.9rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #9df;
		box-shadow: 0 0 0 2px rgba(153, 221, 255, 0.1);
	}

	.search-icon {
		position: absolute;
		left: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		color: #666;
	}

	.filter-group {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.filter-select {
		padding: 0.5rem 0.75rem;
		background: #16161a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #ddd;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.filter-select:focus {
		outline: none;
		border-color: #9df;
	}

	/* Table */
	.table-wrapper {
		flex: 1;
		overflow: auto;
		position: relative;
	}

	.datagrid {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.datagrid thead {
		position: sticky;
		top: 0;
		background: #111;
		border-bottom: 1px solid #333;
		z-index: 10;
	}

	.datagrid th {
		padding: 0.75rem;
		text-align: left;
		color: #999;
		font-weight: 600;
		border-right: 1px solid #222;
		white-space: nowrap;
	}

	.datagrid th.sortable {
		cursor: pointer;
		user-select: none;
	}

	.datagrid th.sortable:hover {
		background: #16161a;
		color: #bbb;
	}

	.sort-indicator {
		margin-left: 0.25rem;
		font-size: 0.8rem;
		color: #9df;
	}

	.datagrid tbody tr {
		border-bottom: 1px solid #222;
		transition: background 0.15s ease;
	}

	.datagrid tbody tr.clickable:hover {
		background: #16161a;
		cursor: pointer;
	}

	.datagrid td {
		padding: 0.75rem;
		color: #ddd;
		border-right: 1px solid #222;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.datagrid td.filename {
		max-width: 200px;
		font-weight: 500;
	}

	.datagrid td.type {
		width: 80px;
		text-align: center;
	}

	.datagrid td.size {
		width: 100px;
		text-align: right;
	}

	.datagrid td.jurisdiction {
		width: 100px;
		text-align: center;
	}

	.datagrid td.status {
		width: 120px;
	}

	.datagrid td.chunks {
		width: 80px;
		text-align: center;
	}

	.datagrid td.date {
		width: 160px;
		font-size: 0.85rem;
		color: #999;
	}

	/* Status Badges */
	.badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 3px;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.badge-success {
		background: rgba(68, 170, 68, 0.2);
		color: #4a4;
	}

	.badge-info {
		background: rgba(153, 221, 255, 0.2);
		color: #9df;
	}

	.badge-warning {
		background: rgba(255, 204, 0, 0.2);
		color: #fc0;
	}

	.badge-error {
		background: rgba(255, 68, 68, 0.2);
		color: #f44;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 300px;
		color: #666;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #333;
		border-top-color: #9df;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Empty State */
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 300px;
		color: #666;
		font-size: 1rem;
	}

	/* Pagination */
	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #111;
		border-top: 1px solid #222;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.pagination-info {
		color: #999;
		font-size: 0.9rem;
	}

	.pagination-controls {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.pagination-btn {
		padding: 0.5rem 0.75rem;
		background: #16161a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #ddd;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.15s ease;
	}

	.pagination-btn:hover:not(:disabled) {
		background: #1a1a1f;
		border-color: #9df;
		color: #9df;
	}

	.pagination-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-numbers {
		display: flex;
		gap: 0.25rem;
	}

	.page-number {
		width: 32px;
		height: 32px;
		padding: 0;
		background: #16161a;
		border: 1px solid #333;
		border-radius: 4px;
		color: #ddd;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.15s ease;
	}

	.page-number:hover {
		background: #1a1a1f;
		border-color: #9df;
	}

	.page-number.active {
		background: #9df;
		border-color: #9df;
		color: #000;
		font-weight: 600;
	}

	/* Scrollbar */
	::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	::-webkit-scrollbar-track {
		background: #0d0d0f;
	}

	::-webkit-scrollbar-thumb {
		background: #333;
		border-radius: 3px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #444;
	}
</style>
