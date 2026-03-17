<script lang="ts">
	import type { PageData } from './$types';
	import Icon from '$lib/components/ui/Icon.svelte';
	import ExecutiveSummary from '$lib/components/legal/ExecutiveSummary.svelte';
	import KeyProvisions from '$lib/components/legal/KeyProvisions.svelte';
	import LegalImplications from '$lib/components/legal/LegalImplications.svelte';
	import CitedSourcesOverlay from '$lib/components/legal/CitedSourcesOverlay.svelte';

	let { data }: { data: PageData } = $props();

	let showCitations = $state(false);

	const CORPUS_LABELS: Record<string, string> = {
		constitution: 'Constitution',
		statute: 'Statute',
		regulation: 'Regulation',
		bill: 'Bill',
		case: 'Case Law',
		glossary: 'Glossary',
		other: 'Other',
	};
</script>

<svelte:head>
	<title>{data.node.heading} — {data.document.title}</title>
</svelte:head>

<div class="legal-dashboard-root">
	<!-- Top Navigation / Breadcrumbs -->
	<header class="dashboard-navbar">
		<nav class="breadcrumb-nav">
			<a href="/library" class="crumb">Legal Library</a>
			<span class="sep">/</span>
			<a href="/library/{data.document.id}" class="crumb">{data.document.title}</a>
			<span class="sep">/</span>
			<span class="current">{data.node.heading}</span>
		</nav>

		<div class="header-actions">
			<button class="action-btn">
				<Icon name="share-2" size={14} />
				<span>Compare</span>
			</button>
			<button class="action-btn highlight">
				<Icon name="download" size={14} />
				<span>Export</span>
			</button>
		</div>
	</header>

	<!-- Main Dashboard Layout -->
	<div class="dashboard-container">
		<!-- Central Content Feed -->
		<main class="dashboard-main">
			<div class="main-header">
				<div class="title-section">
					<div class="badge-row">
						<span class="risk-badge low">Low Risk</span>
						<span class="type-badge">{CORPUS_LABELS[data.document.corpusType] || 'Statute'}</span>
					</div>
					<h1 class="node-title">{data.node.citationLabel || data.node.heading}</h1>
					<div class="meta-row">
						<span>Effective: {data.document.effectiveDate ? new Date(data.document.effectiveDate).toLocaleDateString() : 'Active'}</span>
						<span class="dot"></span>
						<span>Last Updated: Today</span>
					</div>
				</div>

				<div class="search-within">
					<div class="search-box">
						<Icon name="search" size={14} />
						<input type="text" placeholder="Search this section..." />
					</div>
				</div>
			</div>

			<!-- Tab Navigation -->
			<nav class="dashboard-tabs">
				<button class="tab active">Summary</button>
				<button class="tab">Official Text</button>
				<button class="tab">Cases (0)</button>
				<button class="tab">Regulations</button>
				<button class="tab">History</button>
				<button class="tab" onclick={() => showCitations = true}>
					Citations ({data.definitions.length})
				</button>
			</nav>

			<!-- Content Area -->
			<div class="dashboard-content">
				<!-- Top Section: Executive Summary -->
				<section class="content-block">
					<ExecutiveSummary
						node={data.node}
						document={data.document}
						imagePath="/images/legal-dashboard-hero.png"
					/>
				</section>

				<!-- Mid Section: Key Provisions Grid -->
				<section class="content-block mt-8">
					<KeyProvisions
						provisions={data.children}
						documentId={data.document.id}
					/>
				</section>
			</div>
		</main>

		<!-- Right Rail: Contextual Implications -->
		<aside class="dashboard-sidebar">
			<section class="sidebar-block">
				<LegalImplications node={data.node} />
			</section>

			<section class="sidebar-block mt-4">
				<div class="precedents-list-card">
					<div class="card-header">
						<Icon name="gavel" size={16} class="text-accent" />
						<h4>Legal Precedents</h4>
					</div>
					<div class="precedent-items">
						<div class="precedent-teaser">
							<span class="teaser-title">Van Buren v. United States (2021)</span>
							<p>Resolved the "authorized access" ambiguity regarding internal misuse.</p>
							<button class="view-details-link">View Case Details →</button>
						</div>
						<div class="precedent-teaser border-t border-sand/5 pt-3 mt-3">
							<span class="teaser-title">HiQ Labs, Inc. v. LinkedIn Corp. (2022)</span>
							<p>Addressed web scraping under CFAA authorization limits.</p>
							<button class="view-details-link">View Case Details →</button>
						</div>
					</div>
				</div>
			</section>
		</aside>
	</div>

	<!-- Overlay Component -->
	<CitedSourcesOverlay
		bind:isOpen={showCitations}
		definitions={data.definitions}
		citations={[]}
	/>
</div>

<style>
	.legal-dashboard-root {
		background: #0a0b10;
		color: #e0e0e0;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: 'Inter', sans-serif;
	}

	/* Navigation Bar */
	.dashboard-navbar {
		height: 56px;
		padding: 0 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #0d0e14;
	}

	.breadcrumb-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}

	.crumb {
		color: #60a5fa;
		text-decoration: none;
	}

	.sep {
		color: rgba(255, 255, 255, 0.2);
	}

	.current {
		color: rgba(255, 255, 255, 0.4);
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.8rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: #e0e0e0;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.action-btn.highlight {
		background: #ef4444;
		border-color: #ef4444;
		color: white;
	}

	/* Layout Container */
	.dashboard-container {
		display: grid;
		grid-template-columns: 1fr 320px;
		flex: 1;
		overflow: hidden;
	}

	/* Main Central Area */
	.dashboard-main {
		overflow-y: auto;
		padding: 2rem;
		border-right: 1px solid rgba(255, 255, 255, 0.05);
	}

	.main-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	.risk-badge {
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(34, 197, 94, 0.15);
		color: #4ade80;
	}

	.type-badge {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.4);
		margin-left: 0.75rem;
	}

	.node-title {
		font-size: 2rem;
		font-weight: 800;
		margin: 0.75rem 0;
		color: #e0e0e0;
		letter-spacing: -0.02em;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.4);
	}

	.dot {
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 99px;
		width: 240px;
	}

	.search-box input {
		background: transparent;
		border: none;
		color: #e0e0e0;
		font-size: 0.8125rem;
		width: 100%;
	}

	.search-box input:focus {
		outline: none;
	}

	/* Tabs */
	.dashboard-tabs {
		display: flex;
		gap: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 2rem;
	}

	.tab {
		padding: 0.75rem 0;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab:hover {
		color: #e0e0e0;
	}

	.tab.active {
		color: #60a5fa;
		border-bottom-color: #60a5fa;
	}

	/* Sidebar Blocks */
	.dashboard-sidebar {
		padding: 2rem 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.precedents-list-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		padding: 1.25rem;
	}

	.precedents-list-card .card-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.precedents-list-card h4 {
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		color: #e0e0e0;
	}

	.precedent-teaser .teaser-title {
		display: block;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #60a5fa;
		margin-bottom: 0.25rem;
	}

	.precedent-teaser p {
		font-size: 0.75rem;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.5);
		margin: 0;
	}

	.view-details-link {
		background: transparent;
		border: none;
		padding: 0;
		color: #ef4444;
		font-size: 0.6875rem;
		margin-top: 0.5rem;
		cursor: pointer;
	}

	.view-details-link:hover {
		text-decoration: underline;
	}
</style>
