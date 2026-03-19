<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface SidebarSection {
		id: string;
		label: string;
		icon: string;
	}

	interface RelatedStatute {
		id: string;
		title?: string | null;
		section?: string | null;
		category?: string | null;
	}

	interface Props {
		sections?: SidebarSection[];
		activeSection?: string;
		relatedStatutes?: RelatedStatute[];
		jurisdiction?: string | null;
		category?: string | null;
		casesCount?: number;
		glossaryCount?: number;
		onSectionClick?: (id: string) => void;
	}

	let {
		sections = [],
		activeSection = '',
		relatedStatutes = [],
		jurisdiction = null,
		category = null,
		casesCount = 0,
		glossaryCount = 0,
		onSectionClick,
	}: Props = $props();

	// Collapsible state
	let topicsOpen = $state(true);
	let jurisdictionsOpen = $state(true);
	let casesOpen = $state(false);

	// Legal topic categories (static reference)
	const topics = [
		{ id: 'constitutional', label: 'Constitutional Law', icon: 'landmark' },
		{ id: 'contracts', label: 'Contracts', icon: 'file-text' },
		{ id: 'criminal', label: 'Criminal Law', icon: 'shield' },
		{ id: 'evidence', label: 'Evidence', icon: 'eye' },
		{ id: 'intellectual-property', label: 'Intellectual Property', icon: 'lightbulb' },
		{ id: 'labor', label: 'Labor & Employment', icon: 'briefcase' },
		{ id: 'property', label: 'Property', icon: 'house' },
		{ id: 'civil-procedure', label: 'Civil Procedure', icon: 'scale' },
		{ id: 'torts', label: 'Torts', icon: 'triangle-alert' },
	];

	const jurisdictions = [
		{ id: 'federal', label: 'Federal', count: 1234 },
		{ id: 'california', label: 'California', count: null },
		{ id: 'texas', label: 'Texas', count: null },
		{ id: 'new-york', label: 'New York', count: null },
	];

	// Highlight active topic based on category
	let activeTopic = $derived(category?.toLowerCase().replace(/\s+/g, '-') ?? '');
	let activeJurisdiction = $derived(jurisdiction?.toLowerCase().replace(/\s+/g, '-') ?? '');
</script>

<div class="sidebar-root">

	<!-- Corpus Header -->
	<div class="sidebar-header">
		<span class="sidebar-section-label">Corpus</span>
		<button class="sidebar-close-btn">
			<Icon name="x" size={14} />
		</button>
	</div>

	<!-- Active Corpus Dropdown -->
	{#if jurisdiction || category}
		<div class="corpus-dropdown">
			<span class="corpus-dropdown-text">
				{jurisdiction ? `${jurisdiction} Law` : category ?? 'All'}
			</span>
			<Icon name="chevron-down" size={14} class="corpus-dropdown-chevron" />
		</div>
	{/if}

	<!-- Selected items (like the screenshot pills) -->
	{#if sections.length > 0}
		<div class="section-nav">
			{#each sections as section}
				<button
					class="section-nav-item {activeSection === section.id ? 'section-nav-active' : ''}"
					onclick={() => onSectionClick?.(section.id)}
				>
					<Icon name={section.icon} size={12} />
					<span class="section-nav-label">{section.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Topics Section (Collapsible) -->
	<div class="accordion-group">
		<button
			class="accordion-header"
			onclick={() => topicsOpen = !topicsOpen}
		>
			<span class="sidebar-section-label">Topics</span>
			<Icon name={topicsOpen ? 'chevron-down' : 'chevron-right'} size={14} class="accordion-chevron" />
		</button>
		{#if topicsOpen}
			<div class="accordion-body">
				{#each topics as topic}
					<button
						class="accordion-item {activeTopic === topic.id ? 'accordion-item-active' : ''}"
					>
						<span class="accordion-item-left">
							<Icon name={topic.icon} size={12} />
							{topic.label}
						</span>
						<Icon name="chevron-right" size={12} class="accordion-item-chevron" />
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Jurisdictions Section (Collapsible) -->
	<div class="accordion-group">
		<button
			class="accordion-header"
			onclick={() => jurisdictionsOpen = !jurisdictionsOpen}
		>
			<span class="sidebar-section-label">Jurisdictions</span>
			<Icon name={jurisdictionsOpen ? 'chevron-down' : 'chevron-right'} size={14} class="accordion-chevron" />
		</button>
		{#if jurisdictionsOpen}
			<div class="accordion-body">
				{#each jurisdictions as jur}
					<button
						class="accordion-item {activeJurisdiction === jur.id ? 'accordion-item-active' : ''}"
					>
						<span class="accordion-item-left">
							<Icon name="map-pin" size={12} />
							{jur.label}
						</span>
						<span class="accordion-item-right">
							{#if jur.count}
								<span class="accordion-count">{jur.count.toLocaleString()}</span>
							{/if}
							<Icon name="chevron-right" size={12} class="accordion-item-chevron" />
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Cases Section (Collapsible) -->
	<div class="accordion-group">
		<button
			class="accordion-header"
			onclick={() => casesOpen = !casesOpen}
		>
			<span class="sidebar-section-label">Cases</span>
			<Icon name={casesOpen ? 'chevron-down' : 'chevron-right'} size={14} class="accordion-chevron" />
		</button>
		{#if casesOpen}
			<div class="accordion-body">
				{#if casesCount > 0}
					<div class="accordion-stat-row">
						<span class="accordion-item-left"><Icon name="clock" size={12} /> Recent</span>
						<span class="accordion-count">{casesCount}</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Related Statutes -->
	{#if relatedStatutes.length > 0}
		<div class="accordion-group">
			<div class="accordion-header-static">
				<span class="sidebar-section-label">Related</span>
			</div>
			<div class="accordion-body">
				{#each relatedStatutes as rs}
					<a href="/legal-corpus/{rs.id}" class="related-link">
						{#if rs.section}
							<span class="related-section">&sect; {rs.section}</span>
						{/if}
						<span class="related-title">{rs.title?.slice(0, 40)}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.sidebar-root {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	/* Section label */
	.sidebar-section-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(42, 37, 32, 0.4);
		font-weight: 700;
	}

	/* Header */
	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
	}

	.sidebar-close-btn {
		color: rgba(42, 37, 32, 0.3);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.sidebar-close-btn:hover { color: rgba(42, 37, 32, 0.6); }

	/* Corpus dropdown */
	.corpus-dropdown {
		margin: 0 0.5rem 0.5rem;
		padding: 0.5rem 0.75rem;
		background: white;
		border-radius: 0.5rem;
		border: 1px solid rgba(42, 37, 32, 0.12);
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
	}

	.corpus-dropdown-text {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(42, 37, 32, 0.8);
	}

	.corpus-dropdown :global(.corpus-dropdown-chevron) {
		color: rgba(42, 37, 32, 0.3);
	}

	/* Section navigation */
	.section-nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0 0.5rem;
		margin-bottom: 0.5rem;
	}

	.section-nav-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		text-align: left;
		background: none;
		border: none;
		border-left: 2px solid transparent;
		color: rgba(42, 37, 32, 0.5);
		cursor: pointer;
		transition: all 0.15s;
	}

	.section-nav-item:hover {
		background: rgba(42, 37, 32, 0.03);
		color: rgba(42, 37, 32, 0.75);
	}

	.section-nav-active {
		background: rgba(196, 117, 43, 0.08);
		color: #c4752b;
		border-left-color: #c4752b;
	}

	.section-nav-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Accordion groups */
	.accordion-group {
		border-top: 1px solid rgba(42, 37, 32, 0.08);
	}

	.accordion-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.625rem 0.75rem;
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.accordion-header:hover {
		background: rgba(42, 37, 32, 0.03);
	}

	.accordion-header-static {
		padding: 0.625rem 0.75rem;
	}

	.accordion-header :global(.accordion-chevron) {
		color: rgba(42, 37, 32, 0.25);
	}

	.accordion-body {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0 0.5rem 0.5rem;
	}

	.accordion-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		text-align: left;
		background: none;
		border: none;
		color: rgba(42, 37, 32, 0.55);
		cursor: pointer;
		transition: all 0.15s;
	}

	.accordion-item:hover {
		background: rgba(42, 37, 32, 0.03);
		color: rgba(42, 37, 32, 0.8);
	}

	.accordion-item-active {
		background: rgba(196, 117, 43, 0.08);
		color: #c4752b;
		font-weight: 500;
	}

	.accordion-item-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.accordion-item-right {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.accordion-item :global(.accordion-item-chevron) {
		color: rgba(42, 37, 32, 0.15);
	}

	.accordion-item:hover :global(.accordion-item-chevron) {
		color: rgba(42, 37, 32, 0.3);
	}

	.accordion-count {
		font-size: 10px;
		font-family: monospace;
		color: rgba(42, 37, 32, 0.3);
	}

	.accordion-stat-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		color: rgba(42, 37, 32, 0.55);
	}

	/* Related statutes */
	.related-link {
		display: flex;
		flex-direction: column;
		padding: 0.375rem 0.5rem;
		border-radius: 0.25rem;
		text-decoration: none;
		border-left: 2px solid transparent;
		transition: all 0.15s;
	}

	.related-link:hover {
		border-left-color: rgba(196, 117, 43, 0.3);
		background: rgba(42, 37, 32, 0.02);
	}

	.related-section {
		font-size: 11px;
		color: rgba(196, 117, 43, 0.7);
		font-family: monospace;
	}

	.related-title {
		font-size: 11px;
		color: rgba(42, 37, 32, 0.45);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
