<script lang="ts">
	type TabId = 'summary' | 'official-text' | 'cases' | 'regulations' | 'glossary' | 'history';

	let activeTab = $state<TabId>('summary');

	const navItems = [
		{ label: 'Dashboard', status: 'live' },
		{ label: 'Evidence Library', status: 'indexed' },
		{ label: 'Legal Library', status: 'active' },
		{ label: 'Glossary', status: 'live' },
		{ label: 'Retrieval', status: 'hybrid' },
		{ label: 'Sources', status: 'verified' },
		{ label: 'History', status: 'versioned' },
	];

	const corpusMetrics = [
		{ label: 'Docs', value: '40', detail: 'constitutions, codes, charters' },
		{ label: 'Nodes', value: '6,021', detail: 'structured legal hierarchy' },
		{ label: 'Chunks', value: '6,072', detail: 'searchable retrieval blocks' },
		{ label: 'Embeddings', value: '3,713', detail: 'cached vector coverage' },
	];

	const truthCards = [
		{ title: 'Repo Truth', detail: 'route + schema audit aligned', tools: ['rg', 'jq'], tone: 'blue' },
		{ title: 'DB Truth', detail: 'rows inserted and citation labels resolved', tools: ['psql', 'pgvector'], tone: 'blue' },
		{ title: 'Vector Truth', detail: 'semantic index hot and queryable', tools: ['Qdrant', 'Ollama'], tone: 'blue' },
		{ title: 'Storage Truth', detail: 'raw PDFs + normalized text persisted', tools: ['mc', 'SeaweedFS'], tone: 'slate' },
		{ title: 'API Truth', detail: 'glossary, citations, corpus routes healthy', tools: ['curl', 'jq'], tone: 'amber' },
	];

	const documentStats = [
		{ label: 'Jurisdiction', value: 'California', tone: 'blue' },
		{ label: 'Status', value: 'Verified', tone: 'amber' },
		{ label: 'Pages', value: '468', tone: 'slate' },
		{ label: 'Node Count', value: '3,697', tone: 'slate' },
		{ label: 'Chunk Count', value: '3,748', tone: 'slate' },
		{ label: 'Embeddings', value: '3,713', tone: 'slate' },
		{ label: 'Source Confidence', value: '0.98', tone: 'blue' },
		{ label: 'Last Amended', value: '2024-05-24', tone: 'slate' },
	];

	const structureItems = [
		{ label: 'Article I', title: 'Declaration of Rights', note: 'Sections 1-32 indexed' },
		{ label: 'Article II', title: 'Voting, Initiative, and Referendum', note: 'Section lineage captured' },
		{ label: 'Article III', title: 'State of California', note: 'Government powers normalized' },
		{ label: 'Article XIII A', title: 'Tax Limitation', note: 'Citation pages generated for Sec. 2' },
		{ label: 'Article XIX B', title: 'Transportation Funding', note: 'Chunk references verified' },
	];

	const keyProvisions = [
		{
			title: 'Due Process and Equal Protection',
			body: 'Cross-linked to glossary concepts, cited source snippets, and constitutional structure anchors for fast legal review.',
			cite: 'Art. I, Sec. 7'
		},
		{
			title: 'Tax Limitation Lineage',
			body: 'Section-level provenance tracks amendment date, citation label normalization, and downstream chunk coverage for retrieval.',
			cite: 'Art. XIII A, Sec. 2'
		},
		{
			title: 'Water and Transportation References',
			body: 'Related nodes surface official text, cited excerpts, and version-aware trust indicators instead of a flat PDF blob.',
			cite: 'Art. X A, Sec. 2'
		},
	];

	const glossaryTerms = [
		'due process',
		'equal protection',
		'police power',
		'public trust doctrine',
		'tax limitation',
		'initiative measure',
		'jurisdiction',
		'official source'
	];

	const citedSources = [
		{
			label: 'Official Source Snippet',
			text: 'Sec. 2. (a) The full cash value means the county assessor\'s valuation as shown on the 1975-76 tax bill...',
			ref: 'node 6ccaf481 • chunk 968 • Art. XIII A, Sec. 2'
		},
		{
			label: 'Cited Excerpt',
			text: 'The local government bears the burden of proving that a levy, charge, or exaction is not a tax...',
			ref: 'node 00c9af9d • chunk 1045 • Art. XIII C, Sec. 2'
		},
		{
			label: 'Verification Anchor',
			text: 'Transportation Investment Fund allocations were matched to citation label Sec. 2 and retained in normalized lineage.',
			ref: 'node 1a64a2ab • chunk 1236 • Art. XIX B, Sec. 2'
		},
	];

	const provenanceRows = [
		{ label: 'Source Authority', value: 'official_state' },
		{ label: 'Version Lineage', value: 'v2023.11 -> v2024.05' },
		{ label: 'Fetch Timestamp', value: '2026-03-17 09:42 UTC' },
		{ label: 'Normalized Hash', value: 'sha256:f5b1...92e4' },
		{ label: 'SeaweedFS Object', value: 'legal-library/constitutions/ca-2024.pdf' },
		{ label: 'Search Mode', value: 'fts + pgvector + citations' },
	];

	const lineageEvents = [
		{ title: 'Official PDF fetched', detail: 'Raw PDF stored in SeaweedFS and source hash stamped for provenance replay.' },
		{ title: 'Structure and chunking completed', detail: 'Article and section hierarchy resolved into legal_nodes and legal_chunks.' },
		{ title: 'Embeddings cached', detail: 'Vector coverage backfilled for semantic search and citation page retrieval.' },
		{ title: 'Truth-check validated', detail: 'Rows inserted, Qdrant indexed, glossary live, API routes healthy.' },
	];

	const verificationItems = [
		'6,072 rows inserted and queryable',
		'3,713 embeddings present in cache',
		'Qdrant collection indexed and warm',
		'Glossary terms API live and linked',
	];
</script>

<svelte:head>
	<title>Legal Corpus Premium Preview</title>
</svelte:head>

<div class="showcase-shell">
	<div class="browser-frame">
		<div class="browser-chrome">
			<div class="browser-leading">
				<span class="browser-dot muted"></span>
				<span class="browser-dot"></span>
				<span class="browser-dot blue"></span>
			</div>
			<div class="browser-tab">Legal Corpus</div>
			<div class="browser-address">https://legal-corpus.local/library/corpus/california-constitution-2023-24</div>
			<div class="browser-status">Secure corpus session</div>
		</div>

		<div class="platform-shell">
			<aside class="sidebar">
				<div class="brand-block">
					<div class="brand-mark">LC</div>
					<div>
						<p class="eyebrow">Premium Legal AI</p>
						<h1>Legal Corpus</h1>
					</div>
				</div>

				<nav class="nav-list" aria-label="Primary">
					{#each navItems as item}
						<button class:item-active={item.label === 'Legal Library'} class="nav-item">
							<span>{item.label}</span>
							<small>{item.status}</small>
						</button>
					{/each}
				</nav>

				<div class="sidebar-panel">
					<p class="panel-label">Knowledge Scope</p>
					<div class="scope-stack">
						<span>State constitutions</span>
						<span>Federal codes</span>
						<span>County charters</span>
						<span>Versioned sources</span>
					</div>
				</div>

				<div class="sidebar-panel muted-panel">
					<p class="panel-label">Ingestion Provenance</p>
					<p class="sidebar-copy">Timestamped fetches, last amended metadata, source authority, and citation lineage are first-class retrieval signals.</p>
				</div>
			</aside>

			<section class="workspace-shell">
				<header class="workspace-header">
					<div>
						<p class="eyebrow">Verified legal knowledge system</p>
						<h2>Legal Corpus</h2>
						<p class="workspace-subtitle">Production-grade research workspace for constitutions, federal law, local charters, glossary concepts, and provenance-aware citation search.</p>
					</div>

					<div class="header-actions">
						<div class="search-pill">Search USC, constitutions, county charters, and citation pages</div>
						<div class="session-pill">truth-check toolbelt online</div>
					</div>
				</header>

				<div class="metric-strip">
					{#each corpusMetrics as metric}
						<div class="metric-card">
							<span class="metric-label">{metric.label}</span>
							<strong>{metric.value}</strong>
							<small>{metric.detail}</small>
						</div>
					{/each}
				</div>

				<div class="truth-strip">
					{#each truthCards as card}
						<section class:amber-card={card.tone === 'amber'} class="truth-card">
							<div class="truth-header">
								<span>{card.title}</span>
								<div class="status-dot good"></div>
							</div>
							<p>{card.detail}</p>
							<div class="tool-row">
								{#each card.tools as tool}
									<span>{tool}</span>
								{/each}
							</div>
						</section>
					{/each}
				</div>

				<div class="workspace-grid">
					<main class="main-column">
						<section class="hero-card">
							<div class="section-heading">
								<span class="section-kicker">Executive Summary</span>
								<div class="chip-row">
									<span class="chip chip-amber">Verified corpus</span>
									<span class="chip chip-blue">Last amended metadata enabled</span>
								</div>
							</div>
							<h3>California Constitution 2023-24 is fully chunked, citation-addressable, and ready for provenance-aware legal search.</h3>
							<p>The corpus now behaves like a legal knowledge base instead of a loose PDF archive: official text, node lineage, citation pages, glossary concepts, and source verification all sit in one retrieval surface. The next lift is not search quality; it is trustworthy provenance across state, federal, and local sources.</p>
						</section>

						<section class="document-card">
							<div class="document-header">
								<div>
									<p class="section-kicker">Live document view</p>
									<h3>California Constitution 2023-24</h3>
									<p class="document-subtitle">Official constitutional text with citation resolution, glossary context, and version lineage.</p>
								</div>
								<div class="chip-row wrap-row">
									<span class="chip chip-blue">California</span>
									<span class="chip chip-amber">Verified</span>
									<span class="chip chip-slate">Constitution</span>
									<span class="chip chip-slate">official_state</span>
								</div>
							</div>

							<div class="document-stats">
								{#each documentStats as stat}
									<div class:stat-blue={stat.tone === 'blue'} class:stat-amber={stat.tone === 'amber'} class="document-stat">
										<span>{stat.label}</span>
										<strong>{stat.value}</strong>
									</div>
								{/each}
							</div>

							<div class="tab-row">
								{#each [
									{ id: 'summary', label: 'Summary' },
									{ id: 'official-text', label: 'Official Text' },
									{ id: 'cases', label: 'Cases' },
									{ id: 'regulations', label: 'Regulations' },
									{ id: 'glossary', label: 'Glossary' },
									{ id: 'history', label: 'History' },
								] as { id: TabId; label: string }[] as tabs}
									<button class:tab-active={activeTab === tabs.id} class="tab-button" onclick={() => (activeTab = tabs.id)}>
										{tabs.label}
									</button>
								{/each}
							</div>

							{#if activeTab === 'summary'}
								<div class="document-grid">
									<section class="inner-card structure-card">
										<div class="inner-heading">
											<h4>Constitution Structure</h4>
											<span>Article and section hierarchy</span>
										</div>
										<div class="structure-list">
											{#each structureItems as item}
												<div class="structure-item">
													<div>
														<p class="structure-label">{item.label}</p>
														<h5>{item.title}</h5>
													</div>
													<small>{item.note}</small>
												</div>
											{/each}
										</div>
									</section>

									<section class="inner-card provisions-card">
										<div class="inner-heading">
											<h4>Key Provisions</h4>
											<span>Production-ready citation surface</span>
										</div>
										<div class="provision-list">
											{#each keyProvisions as item}
												<article class="provision-item">
													<div class="provision-copy">
														<h5>{item.title}</h5>
														<p>{item.body}</p>
													</div>
													<span class="cite-pill">{item.cite}</span>
												</article>
											{/each}
										</div>

										<div class="concept-block">
											<div class="inner-heading compact-heading">
												<h4>Glossary Concepts</h4>
												<span>Linked legal terms</span>
											</div>
											<div class="concept-row">
												{#each glossaryTerms as term}
													<span class="concept-chip">{term}</span>
												{/each}
											</div>
										</div>
									</section>
								</div>
							{:else}
								<div class="placeholder-panel">
									<h4>{activeTab === 'history' ? 'Version history preview' : activeTab === 'glossary' ? 'Glossary-linked text preview' : 'Related authorities preview'}</h4>
									<p>This showcase keeps Summary active for the screenshot, but the remaining tabs are reserved for official text, cited cases, regulations, glossary links, and amendment history.</p>
								</div>
							{/if}
						</section>
					</main>

					<aside class="right-column">
						<section class="side-card">
							<div class="inner-heading">
								<h4>Source Verification</h4>
								<span>Authority and lineage</span>
							</div>
							<div class="source-table">
								{#each provenanceRows as row}
									<div class="source-row">
										<span>{row.label}</span>
										<strong>{row.value}</strong>
									</div>
								{/each}
							</div>
						</section>

						<section class="side-card">
							<div class="inner-heading">
								<h4>Cited Sources</h4>
								<span>Node and chunk references</span>
							</div>
							<div class="source-stack">
								{#each citedSources as item}
									<article class="excerpt-card">
										<p class="excerpt-label">{item.label}</p>
										<blockquote>{item.text}</blockquote>
										<small>{item.ref}</small>
									</article>
								{/each}
							</div>
						</section>

						<section class="side-card amber-side-card">
							<div class="inner-heading">
								<h4>Truth-Check Verification</h4>
								<span>Compact diagnostics</span>
							</div>
							<div class="verification-stack">
								{#each verificationItems as item}
									<div class="verification-item">
										<div class="status-dot good"></div>
										<span>{item}</span>
									</div>
								{/each}
							</div>
							<div class="tool-row wide-tools">
								<span>psql</span>
								<span>curl</span>
								<span>jq</span>
								<span>mc</span>
								<span>Qdrant</span>
							</div>
						</section>

						<section class="side-card">
							<div class="inner-heading">
								<h4>History</h4>
								<span>Timestamped lineage</span>
							</div>
							<div class="timeline">
								{#each lineageEvents as event}
									<div class="timeline-item">
										<div class="timeline-line"></div>
										<div>
											<h5>{event.title}</h5>
											<p>{event.detail}</p>
										</div>
									</div>
								{/each}
							</div>
						</section>
					</aside>
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.showcase-shell {
		--bg: #0b1017;
		--bg-soft: #111823;
		--bg-panel: rgba(17, 24, 35, 0.88);
		--bg-card: rgba(20, 29, 43, 0.95);
		--bg-card-soft: rgba(24, 33, 49, 0.92);
		--line: rgba(148, 163, 184, 0.16);
		--line-strong: rgba(148, 163, 184, 0.24);
		--text: #e8eef9;
		--muted: #92a1b5;
		--blue: #7d9ec7;
		--blue-strong: #8fb4dd;
		--amber: #d2a86d;
		--shadow: 0 32px 80px rgba(2, 6, 23, 0.58);
		min-height: 100vh;
		overflow: hidden;
		background:
			radial-gradient(circle at top left, rgba(77, 98, 132, 0.22), transparent 32%),
			radial-gradient(circle at top right, rgba(205, 155, 86, 0.12), transparent 24%),
			linear-gradient(180deg, #0c1118 0%, #080c12 100%);
		color: var(--text);
		font-family: 'IBM Plex Sans', 'Segoe UI Variable', 'Segoe UI', sans-serif;
		padding: 22px;
		box-sizing: border-box;
	}

	.browser-frame {
		width: min(1520px, calc(100vw - 44px));
		height: min(940px, calc(100vh - 44px));
		margin: 0 auto;
		border-radius: 28px;
		border: 1px solid rgba(148, 163, 184, 0.1);
		background: rgba(7, 11, 17, 0.84);
		box-shadow: var(--shadow);
		overflow: hidden;
		backdrop-filter: blur(18px);
	}

	.browser-chrome {
		height: 58px;
		display: grid;
		grid-template-columns: 88px 190px minmax(0, 1fr) 170px;
		align-items: center;
		gap: 12px;
		padding: 0 18px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
		background: linear-gradient(180deg, rgba(14, 19, 28, 0.96), rgba(11, 16, 24, 0.94));
	}

	.browser-leading {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.browser-dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: rgba(148, 163, 184, 0.28);
	}

	.browser-dot.blue {
		background: rgba(123, 158, 210, 0.8);
	}

	.browser-dot.muted {
		background: rgba(210, 168, 109, 0.58);
	}

	.browser-tab,
	.browser-status,
	.browser-address {
		border: 1px solid rgba(148, 163, 184, 0.12);
		background: rgba(21, 29, 41, 0.82);
		color: var(--muted);
		border-radius: 14px;
		height: 36px;
		display: flex;
		align-items: center;
		padding: 0 14px;
		box-sizing: border-box;
		font-size: 13px;
	}

	.browser-tab {
		color: var(--text);
		font-weight: 600;
	}

	.browser-status {
		justify-content: center;
		font-size: 12px;
	}

	.browser-address {
		font-family: 'IBM Plex Mono', 'Cascadia Code', Consolas, monospace;
		font-size: 12px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.platform-shell {
		display: grid;
		grid-template-columns: 248px minmax(0, 1fr);
		height: calc(100% - 58px);
	}

	.sidebar {
		background:
			linear-gradient(180deg, rgba(15, 21, 31, 0.98), rgba(10, 15, 23, 0.98));
		border-right: 1px solid rgba(148, 163, 184, 0.12);
		padding: 22px 18px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.brand-block {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.brand-mark {
		width: 48px;
		height: 48px;
		border-radius: 16px;
		background: linear-gradient(180deg, rgba(135, 168, 210, 0.24), rgba(70, 92, 126, 0.16));
		border: 1px solid rgba(143, 180, 221, 0.24);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--blue-strong);
	}

	.eyebrow {
		margin: 0 0 6px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: rgba(146, 161, 181, 0.72);
	}

	.brand-block h1,
	.workspace-header h2,
	.hero-card h3,
	.document-card h3 {
		margin: 0;
		font-weight: 650;
		letter-spacing: -0.02em;
	}

	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.nav-item {
		border: 1px solid transparent;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 16px;
		padding: 12px 14px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: var(--text);
		font-size: 14px;
		cursor: default;
	}

	.nav-item small {
		font-size: 11px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.item-active {
		background: linear-gradient(180deg, rgba(122, 151, 191, 0.2), rgba(55, 71, 95, 0.16));
		border-color: rgba(143, 180, 221, 0.22);
		box-shadow: inset 0 0 0 1px rgba(143, 180, 221, 0.08);
	}

	.sidebar-panel {
		border: 1px solid rgba(148, 163, 184, 0.14);
		background: rgba(22, 30, 42, 0.82);
		border-radius: 18px;
		padding: 14px;
	}

	.panel-label {
		margin: 0 0 10px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text);
	}

	.scope-stack {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.scope-stack span,
	.tool-row span,
	.concept-chip,
	.chip,
	.cite-pill {
		font-family: 'IBM Plex Mono', 'Cascadia Code', Consolas, monospace;
	}

	.scope-stack span {
		padding: 6px 8px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		color: var(--muted);
		font-size: 11px;
	}

	.muted-panel {
		margin-top: auto;
	}

	.sidebar-copy {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.6;
	}

	.workspace-shell {
		background: linear-gradient(180deg, rgba(13, 18, 27, 0.96), rgba(9, 13, 19, 0.98));
		padding: 22px 22px 18px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		overflow: hidden;
	}

	.workspace-header {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		align-items: flex-start;
	}

	.workspace-subtitle,
	.document-subtitle,
	.hero-card p,
	.truth-card p,
	.provision-item p,
	.timeline-item p,
	.placeholder-panel p {
		margin: 0;
		color: var(--muted);
		line-height: 1.62;
	}

	.workspace-subtitle {
		margin-top: 8px;
		max-width: 760px;
		font-size: 14px;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.search-pill,
	.session-pill {
		height: 40px;
		padding: 0 16px;
		border-radius: 14px;
		border: 1px solid rgba(148, 163, 184, 0.14);
		background: rgba(18, 26, 38, 0.88);
		display: flex;
		align-items: center;
		font-size: 12px;
		color: var(--muted);
	}

	.session-pill {
		color: var(--amber);
	}

	.metric-strip,
	.truth-strip {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.truth-strip {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}

	.metric-card,
	.truth-card,
	.hero-card,
	.document-card,
	.side-card,
	.inner-card,
	.placeholder-panel {
		border-radius: 22px;
		border: 1px solid var(--line);
		background: var(--bg-card);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
	}

	.metric-card {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.metric-card strong {
		font-size: 24px;
		font-weight: 650;
	}

	.metric-label,
	.section-kicker,
	.structure-label,
	.excerpt-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: rgba(146, 161, 181, 0.76);
	}

	.metric-card small {
		font-size: 12px;
		color: var(--muted);
	}

	.truth-card {
		padding: 14px;
		background: var(--bg-card-soft);
	}

	.truth-header,
	.section-heading,
	.inner-heading,
	.document-header {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}

	.truth-header span,
	.inner-heading h4,
	.section-heading span,
	.document-header h3,
	.side-card h4,
	.structure-item h5,
	.provision-item h5,
	.timeline-item h5,
	.placeholder-panel h4 {
		margin: 0;
		font-weight: 600;
	}

	.truth-card p {
		margin-top: 10px;
		font-size: 12px;
	}

	.tool-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 12px;
	}

	.tool-row span,
	.concept-chip,
	.chip,
	.cite-pill {
		padding: 5px 8px;
		border-radius: 999px;
		font-size: 11px;
		background: rgba(255, 255, 255, 0.05);
		color: var(--muted);
		border: 1px solid rgba(148, 163, 184, 0.12);
	}

	.amber-card {
		background: linear-gradient(180deg, rgba(40, 33, 24, 0.78), rgba(26, 22, 17, 0.82));
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 338px;
		gap: 16px;
		min-height: 0;
		overflow: hidden;
	}

	.main-column,
	.right-column {
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-right: 2px;
	}

	.hero-card,
	.document-card,
	.side-card,
	.placeholder-panel {
		padding: 18px 20px;
	}

	.hero-card h3 {
		margin-top: 10px;
		font-size: 28px;
		line-height: 1.16;
		max-width: 920px;
	}

	.hero-card p {
		margin-top: 12px;
		font-size: 14px;
	}

	.chip-row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.wrap-row {
		justify-content: flex-end;
	}

	.chip-blue {
		background: rgba(80, 110, 151, 0.18);
		color: #adc5e2;
		border-color: rgba(143, 180, 221, 0.2);
	}

	.chip-amber {
		background: rgba(123, 92, 48, 0.18);
		color: #e0bf8d;
		border-color: rgba(210, 168, 109, 0.24);
	}

	.chip-slate {
		background: rgba(255, 255, 255, 0.04);
		color: var(--muted);
	}

	.document-subtitle {
		margin-top: 8px;
		font-size: 14px;
	}

	.document-stats {
		margin-top: 18px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.document-stat {
		padding: 12px 14px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(148, 163, 184, 0.12);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.document-stat span {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(146, 161, 181, 0.72);
	}

	.document-stat strong {
		font-size: 18px;
		font-weight: 600;
	}

	.stat-blue {
		background: rgba(73, 102, 141, 0.12);
	}

	.stat-amber {
		background: rgba(110, 82, 43, 0.16);
	}

	.tab-row {
		margin-top: 18px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.tab-button {
		height: 38px;
		padding: 0 14px;
		border-radius: 12px;
		border: 1px solid rgba(148, 163, 184, 0.12);
		background: rgba(255, 255, 255, 0.03);
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
	}

	.tab-active {
		background: rgba(80, 110, 151, 0.2);
		color: var(--text);
		border-color: rgba(143, 180, 221, 0.24);
	}

	.document-grid {
		margin-top: 18px;
		display: grid;
		grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
		gap: 14px;
	}

	.inner-card {
		padding: 16px;
		background: rgba(16, 23, 34, 0.88);
	}

	.inner-heading span {
		font-size: 12px;
		color: var(--muted);
	}

	.structure-list,
	.provision-list,
	.source-stack,
	.timeline,
	.verification-stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 14px;
	}

	.structure-item,
	.provision-item,
	.excerpt-card,
	.timeline-item {
		border-radius: 16px;
		padding: 14px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(148, 163, 184, 0.1);
	}

	.structure-item {
		display: flex;
		justify-content: space-between;
		gap: 14px;
		align-items: flex-start;
	}

	.structure-item h5,
	.provision-item h5,
	.timeline-item h5,
	.excerpt-card blockquote {
		font-size: 15px;
	}

	.structure-item small,
	.excerpt-card small,
	.timeline-item p {
		font-size: 12px;
		color: var(--muted);
		line-height: 1.58;
	}

	.provision-item {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}

	.provision-copy p {
		margin-top: 8px;
		font-size: 13px;
	}

	.concept-block {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid rgba(148, 163, 184, 0.12);
	}

	.compact-heading {
		align-items: center;
	}

	.concept-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 12px;
	}

	.side-card {
		background: rgba(17, 24, 35, 0.96);
	}

	.source-table {
		margin-top: 14px;
		display: grid;
		gap: 10px;
	}

	.source-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 12px;
		color: var(--muted);
	}

	.source-row strong {
		color: var(--text);
		font-weight: 600;
		text-align: right;
	}

	.excerpt-card blockquote {
		margin: 10px 0 8px;
		line-height: 1.6;
		color: var(--text);
		font-style: normal;
	}

	.amber-side-card {
		background: linear-gradient(180deg, rgba(38, 29, 18, 0.92), rgba(23, 18, 12, 0.96));
		border-color: rgba(210, 168, 109, 0.16);
	}

	.verification-item {
		display: flex;
		gap: 10px;
		align-items: center;
		color: var(--text);
		font-size: 13px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		flex: 0 0 auto;
	}

	.good {
		background: #7ab48f;
		box-shadow: 0 0 0 4px rgba(122, 180, 143, 0.14);
	}

	.wide-tools {
		margin-top: 14px;
	}

	.timeline-item {
		display: grid;
		grid-template-columns: 16px minmax(0, 1fr);
		gap: 10px;
	}

	.timeline-line {
		width: 2px;
		border-radius: 999px;
		background: linear-gradient(180deg, rgba(143, 180, 221, 0.9), rgba(210, 168, 109, 0.25));
		margin-left: 7px;
	}

	.placeholder-panel {
		margin-top: 18px;
	}

	@media (max-width: 1360px) {
		.browser-frame {
			height: auto;
			min-height: calc(100vh - 44px);
		}

		.platform-shell,
		.workspace-grid,
		.document-grid,
		.truth-strip,
		.metric-strip,
		.document-stats {
			grid-template-columns: 1fr;
		}

		.browser-chrome {
			grid-template-columns: 88px minmax(0, 1fr);
			grid-template-areas:
				'leading status'
				'tab tab'
				'address address';
			height: auto;
			padding: 14px 18px;
		}

		.browser-leading {
			grid-area: leading;
		}

		.browser-tab {
			grid-area: tab;
		}

		.browser-address {
			grid-area: address;
		}

		.browser-status {
			grid-area: status;
		}

		.platform-shell {
			grid-template-columns: 1fr;
		}

		.sidebar {
			display: none;
		}
	}
</style>
