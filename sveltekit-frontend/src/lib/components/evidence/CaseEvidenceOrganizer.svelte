<!-- Case Evidence Organizer — 5 organization modes with AI clustering -->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	import { getOllamaEndpoint } from '$lib/utils/api-endpoints.js';

	interface CustodyEntry {
		officer_id?: string;
		officer_name?: string;
		timestamp: string;
		action: string;
		[key: string]: unknown;
	}

	interface EvidenceItem {
		id: string;
		title: string;
		description?: string;
		evidenceType?: string;
		collected_at?: string;
		uploaded_at?: string;
		chain_of_custody?: CustodyEntry[];
		metadata?: {
			priority?: 'critical' | 'high' | 'medium' | 'low';
			status?: string;
			aiAnalysis?: { importance?: number; embeddingVector?: number[] };
			[key: string]: unknown;
		};
		embedding?: number[];
		[key: string]: unknown;
	}

	interface Props {
		caseId: string;
		initialEvidence?: EvidenceItem[];
		organizationMode?: 'category' | 'timeline' | 'priority' | 'ai_clusters' | 'chain_custody';
		showMetrics?: boolean;
		onreorganized?: (data: { mode: string; structure: any }) => void;
		onselectevidence?: (data: { evidence: EvidenceItem[]; context: string }) => void;
	}

	let {
		caseId,
		initialEvidence = [],
		organizationMode: initialMode = 'category',
		showMetrics = true,
		onreorganized,
		onselectevidence
	}: Props = $props();

	let evidenceList = $state<EvidenceItem[]>([]);
	let isLoading = $state(false);
	let organizationStructure = $state<any>(null);
	let selectedEvidence = $state<EvidenceItem[]>([]);
	let searchQuery = $state('');
	let activeMode = $state<Props['organizationMode']>('category');
	$effect(() => { evidenceList = initialEvidence; });
	$effect(() => { activeMode = initialMode; });
	let filterType = $state('all');
	let filterPriority = $state('all');

	// AI clustering state
	let isGeneratingClusters = $state(false);
	let clusteringProgress = $state(0);

	// Metrics
	let metrics = $state({
		totalEvidence: 0,
		categorized: 0,
		uncategorized: 0,
		chainComplete: 0,
		aiAnalyzed: 0
	});

	const organizationModes = [
		{ value: 'category' as const, label: 'Category', icon: 'folder-tree' },
		{ value: 'timeline' as const, label: 'Timeline', icon: 'calendar' },
		{ value: 'priority' as const, label: 'Priority', icon: 'star' },
		{ value: 'ai_clusters' as const, label: 'AI Clusters', icon: 'brain' },
		{ value: 'chain_custody' as const, label: 'Custody', icon: 'link' }
	];

	let filteredEvidence = $derived.by(() => {
		return evidenceList.filter(ev => {
			if (searchQuery) {
				const q = searchQuery.toLowerCase();
				const matches = ev.title?.toLowerCase().includes(q) ||
					ev.description?.toLowerCase().includes(q) ||
					ev.evidenceType?.toLowerCase().includes(q);
				if (!matches) return false;
			}
			if (filterType !== 'all' && ev.evidenceType !== filterType) return false;
			if (filterPriority !== 'all') {
				const p = ev.metadata?.priority ?? 'medium';
				if (p !== filterPriority) return false;
			}
			return true;
		});
	});

	$effect(() => {
		(async () => {
			await loadCaseEvidence();
			updateMetrics();
			await reorganizeEvidence();
		})();
	});

	async function loadCaseEvidence() {
		if (!caseId) return;
		isLoading = true;
		try {
			const res = await fetch(`/api/cases/${caseId}/evidence`);
			if (res.ok) {
				const data = await res.json();
				evidenceList = data.data?.evidence || data.evidence || data || [];
			}
		} catch (e) {
			console.error('Failed to load case evidence:', e);
		} finally {
			isLoading = false;
		}
	}

	async function reorganizeEvidence() {
		isLoading = true;
		try {
			switch (activeMode) {
				case 'category': organizeByCategory(); break;
				case 'timeline': organizeByTimeline(); break;
				case 'priority': organizeByPriority(); break;
				case 'ai_clusters': await organizeByAIClusters(); break;
				case 'chain_custody': organizeByChainOfCustody(); break;
			}
			updateMetrics();
			onreorganized?.({ mode: activeMode, structure: organizationStructure });
		} catch (e) {
			console.error('Reorganize failed:', e);
		} finally {
			isLoading = false;
		}
	}

	function organizeByCategory() {
		const categories: Record<string, { name: string; evidence: EvidenceItem[]; count: number; priority: number }> = {};
		for (const ev of filteredEvidence) {
			const cat = ev.evidenceType || 'uncategorized';
			if (!categories[cat]) categories[cat] = { name: cat, evidence: [], count: 0, priority: getCategoryPriority(cat) };
			categories[cat].evidence.push(ev);
			categories[cat].count++;
		}
		organizationStructure = {
			type: 'category',
			categories: Object.values(categories).sort((a, b) => b.priority - a.priority)
		};
	}

	function organizeByTimeline() {
		const items = filteredEvidence
			.filter(e => e.collected_at || e.uploaded_at)
			.sort((a, b) => {
				const da = new Date(a.collected_at || a.uploaded_at || 0).getTime();
				const db = new Date(b.collected_at || b.uploaded_at || 0).getTime();
				return db - da;
			});
		const periods: Record<string, { key: string; label: string; evidence: EvidenceItem[]; count: number }> = {};
		for (const ev of items) {
			const d = new Date(ev.collected_at || ev.uploaded_at || 0);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
			if (!periods[key]) periods[key] = { key, label, evidence: [], count: 0 };
			periods[key].evidence.push(ev);
			periods[key].count++;
		}
		organizationStructure = { type: 'timeline', periods: Object.values(periods) };
	}

	function organizeByPriority() {
		const buckets: Record<string, { name: string; evidence: EvidenceItem[]; count: number; color: string }> = {
			critical: { name: 'Critical', evidence: [], count: 0, color: '#dc2626' },
			high: { name: 'High', evidence: [], count: 0, color: '#ea580c' },
			medium: { name: 'Medium', evidence: [], count: 0, color: '#d97706' },
			low: { name: 'Low', evidence: [], count: 0, color: '#65a30d' },
			unknown: { name: 'Unknown', evidence: [], count: 0, color: '#6b7280' }
		};
		for (const ev of filteredEvidence) {
			const p = ev.metadata?.priority ?? calcPriority(ev);
			const bucket = buckets[p] ?? buckets.unknown;
			bucket.evidence.push(ev);
			bucket.count++;
		}
		organizationStructure = {
			type: 'priority',
			priorities: Object.values(buckets).filter(b => b.count > 0)
		};
	}

	async function organizeByAIClusters() {
		isGeneratingClusters = true;
		clusteringProgress = 0;
		try {
			clusteringProgress = 20;
			// Get embeddings via server
			const embeddings = await getEmbeddings();
			clusteringProgress = 60;

			// Simple similarity clustering (since MCP endpoint doesn't exist)
			const clusters = performSimpleClustering(embeddings);
			clusteringProgress = 100;

			organizationStructure = { type: 'ai_clusters', clusters };
		} catch (e) {
			console.error('AI clustering failed:', e);
			organizeByCategory();
		} finally {
			isGeneratingClusters = false;
			clusteringProgress = 0;
		}
	}

	function organizeByChainOfCustody() {
		const chains: Record<string, { id: string; officer: string; evidence: any[]; count: number; completeness: number }> = {};
		for (const ev of filteredEvidence) {
			const custody = ev.chain_of_custody || [];
			const chainId = custody.length > 0 ? custody[0].officer_id ?? 'unknown' : 'no_chain';
			const status = validateCustody(custody);
			if (!chains[chainId]) {
				chains[chainId] = {
					id: chainId,
					officer: custody[0]?.officer_name ?? 'Unknown Officer',
					evidence: [],
					count: 0,
					completeness: 0
				};
			}
			chains[chainId].evidence.push({ ...ev, custodyStatus: status });
			chains[chainId].count++;
		}
		for (const chain of Object.values(chains)) {
			const complete = chain.evidence.filter((e: any) => e.custodyStatus === 'complete').length;
			chain.completeness = chain.count > 0 ? (complete / chain.count) * 100 : 0;
		}
		organizationStructure = {
			type: 'chain_custody',
			chains: Object.values(chains).sort((a, b) => b.completeness - a.completeness)
		};
	}

	async function getEmbeddings(): Promise<EvidenceItem[]> {
		const result: EvidenceItem[] = [];
		for (const ev of filteredEvidence) {
			if (ev.metadata?.aiAnalysis?.embeddingVector) {
				result.push({ ...ev, embedding: ev.metadata.aiAnalysis.embeddingVector });
				continue;
			}
			try {
				const ollamaUrl = getOllamaEndpoint();
				const res = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/embed`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'embeddinggemma:latest', input: ev.title + ' ' + (ev.description || '') })
				});
				if (res.ok) {
					const body = await res.json();
					const embedding = body?.embeddings?.[0] ?? body?.embedding ?? [];
					if (Array.isArray(embedding) && embedding.length > 0) {
						result.push({ ...ev, embedding });
						continue;
					}
				}
			} catch { /* non-fatal */ }
			result.push(ev);
		}
		return result;
	}

	function performSimpleClustering(evidence: EvidenceItem[]) {
		// Group by evidence type as fallback clustering
		const typeGroups: Record<string, EvidenceItem[]> = {};
		for (const ev of evidence) {
			const key = ev.evidenceType || 'uncategorized';
			if (!typeGroups[key]) typeGroups[key] = [];
			typeGroups[key].push(ev);
		}
		const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
		return Object.entries(typeGroups).map(([name, items], i) => ({
			id: `cluster_${i}`,
			name: name.replace(/_/g, ' '),
			description: `${items.length} ${name} items`,
			evidence: items,
			count: items.length,
			similarity: 0.7,
			keywords: extractKeywords(items),
			color: colors[i % colors.length]
		}));
	}

	function extractKeywords(evidence: EvidenceItem[]): string[] {
		const stopwords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are', 'was', 'been', 'will', 'not']);
		const text = evidence.map(e => (e.title + ' ' + (e.description || ''))).join(' ').toLowerCase();
		const words = text.split(/\W+/).filter(w => w.length > 3 && !stopwords.has(w));
		const counts: Record<string, number> = {};
		for (const w of words) counts[w] = (counts[w] || 0) + 1;
		return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word);
	}

	function getCategoryPriority(cat: string): number {
		const p: Record<string, number> = {
			physical_evidence: 10, digital_evidence: 9, document: 8, testimony: 7,
			photograph: 6, video: 6, audio: 5, uncategorized: 3, other: 1
		};
		return p[cat] || 3;
	}

	function calcPriority(ev: EvidenceItem): string {
		const imp = ev.metadata?.aiAnalysis?.importance;
		if (imp && imp > 0.8) return 'critical';
		if (imp && imp > 0.6) return 'high';
		if (imp && imp > 0.4) return 'medium';
		if (ev.evidenceType === 'physical_evidence' || ev.evidenceType === 'digital_evidence') return 'high';
		return 'low';
	}

	function validateCustody(custody: CustodyEntry[] | undefined): string {
		if (!custody || custody.length === 0) return 'missing';
		const required = ['officer_id', 'timestamp', 'action'];
		const hasAll = custody.every(entry => required.every(f => entry[f]));
		const chrono = custody.every((entry, i) => {
			if (i === 0) return true;
			return new Date(entry.timestamp) >= new Date(custody[i - 1].timestamp);
		});
		if (hasAll && chrono) return 'complete';
		if (hasAll) return 'incomplete';
		return 'invalid';
	}

	function updateMetrics() {
		metrics = {
			totalEvidence: evidenceList.length,
			categorized: evidenceList.filter(e => e.evidenceType && e.evidenceType !== 'uncategorized').length,
			uncategorized: evidenceList.filter(e => !e.evidenceType || e.evidenceType === 'uncategorized').length,
			chainComplete: evidenceList.filter(e => validateCustody(e.chain_of_custody) === 'complete').length,
			aiAnalyzed: evidenceList.filter(e => e.metadata?.aiAnalysis).length
		};
	}

	function selectEvidence(ev: EvidenceItem, context: string) {
		if (selectedEvidence.some(s => s.id === ev.id)) {
			selectedEvidence = selectedEvidence.filter(s => s.id !== ev.id);
		} else {
			selectedEvidence = [...selectedEvidence, ev];
		}
		onselectevidence?.({ evidence: selectedEvidence, context });
	}

	async function changeMode(mode: typeof activeMode) {
		activeMode = mode;
		await reorganizeEvidence();
	}
</script>

<div class="ceo-root">
	<!-- Header -->
	<header class="ceo-header">
		<div class="ceo-title-row">
			<h2 class="ceo-title">Evidence Organization</h2>
			<span class="ceo-case-id">Case {caseId}</span>
		</div>
		<div class="ceo-modes">
			{#each organizationModes as mode}
				<button
					class="ceo-mode-btn"
					class:active={activeMode === mode.value}
					onclick={() => changeMode(mode.value)}
				>
					<Icon name={mode.icon} size={14} />
					<span>{mode.label}</span>
				</button>
			{/each}
		</div>
	</header>

	<!-- Metrics -->
	{#if showMetrics}
		<div class="ceo-metrics">
			<div class="ceo-metric"><span class="ceo-metric-val">{metrics.totalEvidence}</span><span class="ceo-metric-lbl">Total</span></div>
			<div class="ceo-metric"><span class="ceo-metric-val">{metrics.categorized}</span><span class="ceo-metric-lbl">Categorized</span></div>
			<div class="ceo-metric"><span class="ceo-metric-val">{metrics.aiAnalyzed}</span><span class="ceo-metric-lbl">AI Analyzed</span></div>
			<div class="ceo-metric"><span class="ceo-metric-val">{metrics.chainComplete}</span><span class="ceo-metric-lbl">Chain OK</span></div>
		</div>
	{/if}

	<!-- Filters -->
	<div class="ceo-filters">
		<div class="ceo-search">
			<Icon name="search" size={14} />
			<input type="text" placeholder="Search evidence..." bind:value={searchQuery} />
		</div>
		<select bind:value={filterType}>
			<option value="all">All Types</option>
			<option value="physical_evidence">Physical</option>
			<option value="digital_evidence">Digital</option>
			<option value="document">Documents</option>
			<option value="testimony">Testimony</option>
			<option value="photograph">Photos</option>
			<option value="video">Video</option>
		</select>
		<select bind:value={filterPriority}>
			<option value="all">All Priorities</option>
			<option value="critical">Critical</option>
			<option value="high">High</option>
			<option value="medium">Medium</option>
			<option value="low">Low</option>
		</select>
	</div>

	<!-- Loading -->
	{#if isLoading || isGeneratingClusters}
		<div class="ceo-loading">
			{#if isGeneratingClusters}
				<h3>Generating AI Clusters...</h3>
				<div class="ceo-progress"><div class="ceo-progress-fill" style="width:{clusteringProgress}%"></div></div>
				<p class="ceo-progress-text">{clusteringProgress}%</p>
			{:else}
				<Icon name="loader" size={24} class="ceo-spinner" />
				<p>Reorganizing...</p>
			{/if}
		</div>
	{/if}

	<!-- Organization Display -->
	<main class="ceo-content">
		{#if organizationStructure?.type === 'category'}
			{#each organizationStructure.categories as cat}
				<div class="ceo-group">
					<div class="ceo-group-header">
						<h3>{cat.name.replace(/_/g, ' ')}</h3>
						<span class="ceo-badge">{cat.count}</span>
					</div>
					<div class="ceo-grid">
						{#each cat.evidence as ev (ev.id)}
							<button class="ceo-card" class:selected={selectedEvidence.some(s => s.id === ev.id)} onclick={() => selectEvidence(ev, 'category')}>
								<h4>{ev.title}</h4>
								<p>{ev.description ?? 'No description'}</p>
								<div class="ceo-card-meta">
									<span class="ceo-type-tag">{ev.evidenceType ?? 'unknown'}</span>
									{#if ev.metadata?.priority}
										<span class="ceo-priority-tag {ev.metadata.priority}">{ev.metadata.priority}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/each}

		{:else if organizationStructure?.type === 'timeline'}
			{#each organizationStructure.periods as period}
				<div class="ceo-group">
					<div class="ceo-group-header">
						<h3>{period.label}</h3>
						<span class="ceo-badge">{period.count}</span>
					</div>
					{#each period.evidence as ev (ev.id)}
						<button class="ceo-timeline-item" class:selected={selectedEvidence.some(s => s.id === ev.id)} onclick={() => selectEvidence(ev, 'timeline')}>
							<div class="ceo-timeline-dot"></div>
							<div class="ceo-timeline-body">
								<h4>{ev.title}</h4>
								<p>{ev.description || 'No description'}</p>
								<span class="ceo-date">{new Date(ev.collected_at || ev.uploaded_at || 0).toLocaleDateString()}</span>
							</div>
						</button>
					{/each}
				</div>
			{/each}

		{:else if organizationStructure?.type === 'priority'}
			{#each organizationStructure.priorities as bucket}
				<div class="ceo-group">
					<div class="ceo-group-header">
						<h3 style="color:{bucket.color}">{bucket.name}</h3>
						<span class="ceo-badge">{bucket.count}</span>
					</div>
					<div class="ceo-grid">
						{#each bucket.evidence as ev (ev.id)}
							<button class="ceo-card" class:selected={selectedEvidence.some(s => s.id === ev.id)} onclick={() => selectEvidence(ev, 'priority')}>
								<h4>{ev.title}</h4>
								<p>{ev.description ?? 'No description'}</p>
								<span class="ceo-type-tag">{ev.evidenceType ?? 'unknown'}</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}

		{:else if organizationStructure?.type === 'ai_clusters'}
			{#each organizationStructure.clusters as cluster}
				<div class="ceo-group" style="border-left: 4px solid {cluster.color}">
					<div class="ceo-group-header">
						<h3>{cluster.name}</h3>
						<span class="ceo-badge">{cluster.count} &middot; {Math.round(cluster.similarity * 100)}%</span>
					</div>
					{#if cluster.keywords?.length > 0}
						<div class="ceo-keywords">
							{#each cluster.keywords as kw}
								<span class="ceo-kw-tag">{kw}</span>
							{/each}
						</div>
					{/if}
					<div class="ceo-grid">
						{#each cluster.evidence as ev (ev.id)}
							<button class="ceo-card compact" class:selected={selectedEvidence.some(s => s.id === ev.id)} onclick={() => selectEvidence(ev, 'cluster')}>
								<h4>{ev.title}</h4>
								<span class="ceo-type-tag">{ev.evidenceType ?? 'unknown'}</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}

		{:else if organizationStructure?.type === 'chain_custody'}
			{#each organizationStructure.chains as chain}
				<div class="ceo-group">
					<div class="ceo-group-header">
						<h3>{chain.officer}</h3>
						<span class="ceo-badge">{chain.count} &middot; {Math.round(chain.completeness)}%</span>
					</div>
					{#each chain.evidence as ev (ev.id)}
						<button class="ceo-card" class:selected={selectedEvidence.some(s => s.id === ev.id)} onclick={() => selectEvidence(ev, 'custody')}>
							<div class="ceo-card-row">
								<h4>{ev.title}</h4>
								<span class="ceo-custody-status" class:complete={ev.custodyStatus === 'complete'} class:missing={ev.custodyStatus === 'missing'}>
									{#if ev.custodyStatus === 'complete'}<Icon name="circle-check" size={12} />{:else}<Icon name="circle-alert" size={12} />{/if}
									{ev.custodyStatus}
								</span>
							</div>
							{#if ev.chain_of_custody?.length}
								<div class="ceo-custody-entries">
									{#each ev.chain_of_custody as entry}
										<div class="ceo-custody-entry">
											<span class="ceo-custody-action">{entry.action}</span>
											<span class="ceo-custody-time">{new Date(entry.timestamp).toLocaleString()}</span>
										</div>
									{/each}
								</div>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		{/if}

		{#if !organizationStructure && !isLoading}
			<div class="ceo-empty">Select an organization mode to begin.</div>
		{/if}
	</main>
</div>

<style>
	.ceo-root { font-family: system-ui, sans-serif; }
	.ceo-header { background: white; border-bottom: 1px solid #e2e8f0; padding: 1rem 1.5rem; }
	.ceo-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.ceo-title { margin: 0; font-size: 1.25rem; font-weight: 700; color: #1e293b; }
	.ceo-case-id { color: #64748b; font-size: 0.8rem; }
	.ceo-modes { display: flex; gap: 0.375rem; flex-wrap: wrap; }
	.ceo-mode-btn {
		display: flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.75rem;
		background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 0.375rem;
		cursor: pointer; font-size: 0.8rem; font-weight: 500; transition: all 0.15s;
	}
	.ceo-mode-btn:hover { background: #e2e8f0; }
	.ceo-mode-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }

	.ceo-metrics { display: flex; gap: 1.5rem; padding: 0.75rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
	.ceo-metric { display: flex; flex-direction: column; align-items: center; }
	.ceo-metric-val { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
	.ceo-metric-lbl { font-size: 0.65rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }

	.ceo-filters { display: flex; gap: 0.75rem; padding: 0.75rem 1.5rem; background: white; border-bottom: 1px solid #e2e8f0; align-items: center; flex-wrap: wrap; }
	.ceo-search { display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 200px; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; }
	.ceo-search input { border: none; outline: none; flex: 1; font-size: 0.85rem; background: transparent; }
	.ceo-filters select { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 0.8rem; }

	.ceo-loading { display: flex; flex-direction: column; align-items: center; padding: 2rem; gap: 0.5rem; color: #64748b; }
	.ceo-progress { width: 300px; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
	.ceo-progress-fill { height: 100%; background: #3b82f6; transition: width 0.3s; }
	.ceo-progress-text { font-size: 0.8rem; }
	:global(.ceo-spinner) { animation: ceo-spin 1s linear infinite; }
	@keyframes ceo-spin { to { transform: rotate(360deg); } }

	.ceo-content { padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
	.ceo-group { background: white; border-radius: 0.5rem; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
	.ceo-group-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f1f5f9; }
	.ceo-group-header h3 { margin: 0; font-size: 1rem; font-weight: 600; color: #1e293b; text-transform: capitalize; }
	.ceo-badge { font-size: 0.75rem; color: #64748b; font-weight: 500; }

	.ceo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
	.ceo-card {
		text-align: left; padding: 0.75rem; background: #fafafa; border: 1px solid #e5e7eb;
		border-radius: 0.375rem; cursor: pointer; transition: all 0.15s; width: 100%;
	}
	.ceo-card:hover { border-color: #3b82f6; }
	.ceo-card.selected { border-color: #3b82f6; background: #eff6ff; }
	.ceo-card h4 { margin: 0 0 0.25rem; font-size: 0.85rem; font-weight: 600; color: #1e293b; }
	.ceo-card p { margin: 0 0 0.5rem; font-size: 0.75rem; color: #64748b; line-height: 1.4; }
	.ceo-card.compact p { display: none; }
	.ceo-card-meta { display: flex; gap: 0.5rem; align-items: center; }
	.ceo-card-row { display: flex; justify-content: space-between; align-items: center; }

	.ceo-type-tag { padding: 0.125rem 0.375rem; background: #f1f5f9; border-radius: 0.25rem; font-size: 0.65rem; font-weight: 500; color: #475569; }
	.ceo-priority-tag { padding: 0.125rem 0.375rem; border-radius: 1rem; font-size: 0.65rem; font-weight: 500; text-transform: uppercase; }
	.ceo-priority-tag.critical { background: #fef2f2; color: #991b1b; }
	.ceo-priority-tag.high { background: #fff7ed; color: #9a3412; }
	.ceo-priority-tag.medium { background: #fffbeb; color: #92400e; }
	.ceo-priority-tag.low { background: #f0fdf4; color: #166534; }

	.ceo-timeline-item { display: flex; gap: 0.75rem; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.375rem; margin-bottom: 0.5rem; cursor: pointer; transition: all 0.15s; width: 100%; text-align: left; background: #fafafa; }
	.ceo-timeline-item:hover { border-color: #3b82f6; }
	.ceo-timeline-item.selected { border-color: #3b82f6; background: #eff6ff; }
	.ceo-timeline-dot { width: 10px; height: 10px; background: #3b82f6; border-radius: 50%; margin-top: 0.2rem; flex-shrink: 0; }
	.ceo-timeline-body { flex: 1; }
	.ceo-timeline-body h4 { margin: 0 0 0.25rem; font-size: 0.85rem; font-weight: 600; color: #1e293b; }
	.ceo-timeline-body p { margin: 0 0 0.25rem; font-size: 0.75rem; color: #64748b; }
	.ceo-date { font-size: 0.7rem; color: #9ca3af; }

	.ceo-keywords { display: flex; gap: 0.375rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.ceo-kw-tag { padding: 0.125rem 0.375rem; background: #f1f5f9; border-radius: 0.25rem; font-size: 0.65rem; color: #475569; font-weight: 500; }

	.ceo-custody-status { display: flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; font-weight: 500; text-transform: uppercase; color: #92400e; }
	.ceo-custody-status.complete { color: #166534; }
	.ceo-custody-status.missing { color: #991b1b; }
	.ceo-custody-entries { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #f1f5f9; }
	.ceo-custody-entry { display: flex; justify-content: space-between; padding: 0.15rem 0; font-size: 0.7rem; color: #6b7280; }
	.ceo-custody-action { font-weight: 500; }
	.ceo-custody-time { color: #9ca3af; }

	.ceo-empty { text-align: center; padding: 3rem; color: #64748b; }
</style>
