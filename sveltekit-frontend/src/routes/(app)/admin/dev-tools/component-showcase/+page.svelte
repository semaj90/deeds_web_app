<script lang="ts">
	import CommandPalette from '$lib/components/ui/CommandPalette.svelte';
	import ExpandGrid from '$lib/components/ui/ExpandGrid.svelte';
	import EvidenceCard from '$lib/components/EvidenceCard.svelte';
	import RichEvidenceCard from '$lib/components/evidence/EvidenceCard.svelte';
	import CasesEvidenceCard from '$lib/components/cases/EvidenceCard.svelte';
	import DetectiveEvidenceCard from '$lib/components/detective/EvidenceCard.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let commandPaletteOpen = $state(false);
	let activeSection = $state('command-palette');

	const sections = [
		{ id: 'command-palette', label: 'CommandPalette + Fuse.js', icon: 'search' },
		{ id: 'expand-grid', label: 'ExpandGrid', icon: 'grid-3x3' },
		{ id: 'evidence-cards', label: 'EvidenceCard Variants', icon: 'file-text' },
	];

	const sampleEvidence = [
		{ id: 'ev-1', file_name: 'Contract_v2.pdf', evidence_type: 'document' as const, file_type: 'application/pdf', file_size: 2_400_000, uploaded_at: new Date(Date.now() - 86400000 * 3), ai_summary: 'Employment agreement with non-compete clause.', tags: ['contract', 'employment'], ai_tags: ['legal-binding'] },
		{ id: 'ev-2', file_name: 'Scene_Photo.jpg', evidence_type: 'image' as const, file_type: 'image/jpeg', file_size: 3_800_000, uploaded_at: new Date(Date.now() - 86400000), ai_summary: 'Exterior photograph showing property boundary.', tags: ['property'], ai_tags: ['geolocation'] },
		{ id: 'ev-3', file_name: 'Witness_Statement.docx', evidence_type: 'document' as const, file_type: 'application/docx', file_size: 156_000, uploaded_at: new Date(Date.now() - 86400000 * 7), ai_summary: '', tags: ['witness', 'deposition'], ai_tags: ['testimony'] },
	];

	// Bridge the legacy {document,video,audio,other,image} enum (used by basic card +
	// sample array) to the canonical {document,photo,video,...,scientific} enum that
	// the rich card consumes.
	const toCanonicalEvidenceType = (
		t: 'document' | 'image' | 'video' | 'audio' | 'other'
	): 'document' | 'photo' | 'video' | 'audio' =>
		t === 'image' ? 'photo' : t === 'other' ? 'document' : t;

	const richEvidenceItems = sampleEvidence.map(item => ({
		id:            item.id,
		caseId:        '00000000-0000-0000-0000-000000000000',
		title:         item.file_name,
		description:   item.ai_summary ?? '',
		evidenceType:  toCanonicalEvidenceType(item.evidence_type),
		fileName:      item.file_name,
		fileUrl:       `/evidence/${item.id}`,
		mimeType:      item.file_type,
		sizeBytes:     item.file_size,
		tags:          item.tags ?? [],
		canvasPosition: { x: 0, y: 0 },
		metadata: {
			format:     item.file_type,
			size:       item.file_size,
			createdAt:  item.uploaded_at?.toISOString() ?? '',
			uploadedAt: item.uploaded_at?.toISOString() ?? '',
			updatedAt:  new Date().toISOString(),
			uploadedBy: 'system'
		}
	}));

	const detectiveItems = sampleEvidence.map(item => ({
		id: item.id,
		title: item.file_name,
		evidenceType: item.evidence_type,
		fileSize: item.file_size,
		createdAt: item.uploaded_at,
		tags: item.tags ?? [],
	}));
</script>

<svelte:head>
	<title>Component Showcase | Dev Tools</title>
</svelte:head>

<div class="showcase-page">
	<header class="showcase-header">
		<h1>Component Showcase</h1>
		<p>Interactive demos of reusable UI components with Svelte 5 runes, bits-ui, UnoCSS, and Fuse.js</p>
	</header>

	<nav class="showcase-nav">
		{#each sections as section}
			<button
				class="nav-btn"
				class:active={activeSection === section.id}
				onclick={() => (activeSection = section.id)}
			>
				<Icon name={section.icon} size={16} />
				{section.label}
			</button>
		{/each}
	</nav>

	<div class="showcase-content">
		{#if activeSection === 'command-palette'}
			<section class="demo-section">
				<h2>CommandPalette with Fuse.js Fuzzy Search</h2>
				<p class="demo-desc">Fuzzy matching across titles, descriptions, and categories. Try misspelling "dashbord" or partial matches like "evid".</p>
				<div class="demo-actions">
					<button class="demo-btn" onclick={() => (commandPaletteOpen = true)}>
						<Icon name="search" size={16} />
						Open Command Palette
						<kbd class="demo-kbd">Ctrl+K</kbd>
					</button>
				</div>
				<div class="demo-info">
					<h3>Features</h3>
					<ul>
						<li>Fuse.js v7 weighted fuzzy search (title 50%, description 30%, category 20%)</li>
						<li>Threshold 0.4 — tolerates typos and partial matches</li>
						<li>Keyboard navigation (Arrow keys, Enter, Escape)</li>
						<li>Category grouping with visual separators</li>
						<li>Keyboard shortcut badges</li>
					</ul>
				</div>
			</section>

			<CommandPalette bind:open={commandPaletteOpen} />
		{:else if activeSection === 'expand-grid'}
			<section class="demo-section">
				<h2>ExpandGrid — Responsive Expanding Grid</h2>
				<p class="demo-desc">Hover over the grid below to see columns expand from 1 to 3 with CSS transition animation.</p>

				<h3>1 → 3 columns on hover</h3>
				<ExpandGrid columns={1} expandedColumns={3} gap="1rem" expandOnHover={true}>
					{#each Array(6) as _, i}
						<div class="grid-item demo-card">
							<Icon name="file-text" size={24} />
							<span>Item {i + 1}</span>
						</div>
					{/each}
				</ExpandGrid>

				<h3>2 → 4 columns on hover</h3>
				<ExpandGrid columns={2} expandedColumns={4} gap="0.75rem" expandOnHover={true}>
					{#each Array(8) as _, i}
						<div class="grid-item demo-card">
							<Icon name="briefcase" size={24} />
							<span>Case {i + 1}</span>
						</div>
					{/each}
				</ExpandGrid>

				<div class="demo-info">
					<h3>Props</h3>
					<ul>
						<li><code>columns</code> — initial column count (default: 1)</li>
						<li><code>expandedColumns</code> — expanded column count (default: 3)</li>
						<li><code>gap</code> — CSS gap value</li>
						<li><code>expandDuration</code> — transition duration (default: 0.4s)</li>
						<li><code>expandOnHover</code> / <code>expandOnFocus</code> — trigger mode</li>
					</ul>
				</div>
			</section>
		{:else if activeSection === 'evidence-cards'}
			<section class="demo-section">
				<h2>EvidenceCard Variants (4 Clean Implementations)</h2>
				<p class="demo-desc">Each variant serves a different purpose. All use Svelte 5 runes.</p>

				<h3>1. Basic EvidenceCard (357L) — AI Analysis Display</h3>
				<p class="variant-desc">Shows AI summary, AI tags, chat insights with keywords + suggestions. Best for AI analysis views.</p>
				<div class="card-grid">
					{#each sampleEvidence as item (item.id)}
						<EvidenceCard
							evidence={item}
							onAskAI={(ev) => console.log('Ask AI:', ev.file_name)}
							onDelete={(id) => console.log('Delete:', id)}
						/>
					{/each}
				</div>

				<h3>2. Rich EvidenceCard (226L) — Media Preview + Compare</h3>
				<p class="variant-desc">Image/video previews, PDF comparison, expand-on-hover transitions. Best for evidence gallery.</p>
				<div class="card-grid">
					{#each richEvidenceItems as item (item.id)}
						<RichEvidenceCard
							evidence={item}
							showCompare={true}
							expandOnHover={true}
						/>
					{/each}
				</div>

				<h3>3. Cases EvidenceCard (162L) — CRUD Actions</h3>
				<p class="variant-desc">View/edit/download/delete actions, type-based colors, disabled state. Best for case detail views.</p>
				<div class="card-grid">
					{#each richEvidenceItems as item (item.id)}
						<CasesEvidenceCard
							evidence={{ ...item, evidenceType: item.evidenceType }}
							onview={() => console.log('View:', item.id)}
							onedit={() => console.log('Edit:', item.id)}
							ondelete={() => console.log('Delete:', item.id)}
							ondownload={() => console.log('Download:', item.id)}
						/>
					{/each}
				</div>

				<h3>4. Detective EvidenceCard (84L) — Compact bits-ui</h3>
				<p class="variant-desc">Compact card using bits-ui Card.Root + Badge. Best for detective board sidebar.</p>
				<div class="card-grid compact">
					{#each detectiveItems as item (item.id)}
						<DetectiveEvidenceCard
							{item}
							onview={() => console.log('View:', item.id)}
						/>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>

<style>
	.showcase-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.showcase-header {
		margin-bottom: 2rem;
	}

	.showcase-header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.showcase-header p {
		color: var(--sand-dark, #666);
		margin: 0;
	}

	.showcase-nav {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
		border-bottom: 1px solid var(--sand-light, #e5e5e5);
		padding-bottom: 0.5rem;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		background: transparent;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.15s;
	}

	.nav-btn:hover {
		background: var(--panel-soft, #f5f5f5);
	}

	.nav-btn.active {
		background: var(--accent, #a51c30);
		color: white;
		border-color: var(--accent, #a51c30);
	}

	.demo-section {
		margin-bottom: 3rem;
	}

	.demo-section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
	}

	.demo-section h3 {
		font-size: 1rem;
		font-weight: 600;
		margin: 1.5rem 0 0.75rem;
	}

	.demo-desc {
		color: var(--sand-dark, #666);
		margin: 0 0 1rem;
	}

	.variant-desc {
		color: var(--sand-dark, #888);
		font-size: 0.875rem;
		margin: 0 0 0.75rem;
	}

	.demo-actions {
		margin-bottom: 1.5rem;
	}

	.demo-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		background: var(--accent, #a51c30);
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.demo-btn:hover {
		opacity: 0.9;
	}

	.demo-kbd {
		padding: 0.125rem 0.375rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 0.25rem;
		font-size: 0.75rem;
	}

	.demo-info {
		margin-top: 1.5rem;
		padding: 1rem;
		background: var(--panel-soft, #f9f9f9);
		border-radius: 0.5rem;
		border: 1px solid var(--sand-light, #e5e5e5);
	}

	.demo-info h3 {
		margin: 0 0 0.5rem;
		font-size: 0.875rem;
	}

	.demo-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		line-height: 1.6;
	}

	.demo-info code {
		padding: 0.125rem 0.375rem;
		background: var(--panel, #eee);
		border-radius: 0.25rem;
		font-size: 0.75rem;
	}

	.demo-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem;
		background: white;
		border: 1px solid var(--sand-light, #e5e5e5);
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.card-grid.compact {
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}
</style>
