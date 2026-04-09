<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	let hoveredIcon = $state<string | null>(null);
	let selectedSize = $state(32);
	let glowColor = $state('#7dd3fc');
	let searchQuery = $state('');

	const yorhaIcons = [
		{ name: 'yorha-law-book', label: 'Law Book', desc: 'Legal statutes & references' },
		{ name: 'yorha-citation', label: 'Citation', desc: 'Quoted legal passages' },
		{ name: 'yorha-glossary', label: 'Glossary', desc: 'Legal terminology' },
		{ name: 'yorha-precedent', label: 'Precedent', desc: 'Case law & rulings' },
		{ name: 'yorha-regulation', label: 'Regulation', desc: 'Regulatory decrees' },
		{ name: 'yorha-subject', label: 'Subject', desc: 'Person of interest' },
		{ name: 'yorha-evidence', label: 'Evidence', desc: 'Case evidence files' },
		{ name: 'yorha-timeline', label: 'Timeline', desc: 'Event chronology' },
		{ name: 'yorha-network', label: 'Network', desc: 'Relationship mapping' },
		{ name: 'yorha-integrity', label: 'Integrity', desc: 'Verification & trust' },
		{ name: 'yorha-warning', label: 'Warning', desc: 'Alerts & red flags' },
		{ name: 'yorha-ai-assistant', label: 'AI Assistant', desc: 'YoRHa neural agent' },
	];

	const lucideLegalIcons = [
		{ name: 'gavel', label: 'Gavel', desc: 'Court rulings & judgment' },
		{ name: 'scale', label: 'Scale', desc: 'Justice & balance' },
		{ name: 'briefcase', label: 'Briefcase', desc: 'Case management' },
		{ name: 'shield-check', label: 'Shield Check', desc: 'Verified & protected' },
		{ name: 'shield-alert', label: 'Shield Alert', desc: 'Security warning' },
		{ name: 'fingerprint', label: 'Fingerprint', desc: 'Forensic evidence' },
		{ name: 'scan-face', label: 'Scan Face', desc: 'Identity verification' },
		{ name: 'landmark', label: 'Landmark', desc: 'Court & institutions' },
		{ name: 'file-text', label: 'File Text', desc: 'Document content' },
		{ name: 'file-search', label: 'File Search', desc: 'Document discovery' },
		{ name: 'file-check', label: 'File Check', desc: 'Verified document' },
		{ name: 'search-code', label: 'Search Code', desc: 'Deep analysis' },
		{ name: 'book-open', label: 'Book Open', desc: 'Legal reference' },
		{ name: 'scroll-text', label: 'Scroll Text', desc: 'Legal scroll' },
		{ name: 'lock', label: 'Lock', desc: 'Sealed evidence' },
		{ name: 'unlock', label: 'Unlock', desc: 'Declassified' },
		{ name: 'eye', label: 'Eye', desc: 'Surveillance' },
		{ name: 'crosshair', label: 'Crosshair', desc: 'Target identification' },
		{ name: 'brain', label: 'Brain', desc: 'AI reasoning' },
		{ name: 'sparkles', label: 'Sparkles', desc: 'AI generation' },
		{ name: 'dna', label: 'DNA', desc: 'Forensic trace' },
		{ name: 'scan-search', label: 'Scan Search', desc: 'Deep forensic scan' },
		{ name: 'database', label: 'Database', desc: 'Case database' },
		{ name: 'network', label: 'Network', desc: 'Connection mapping' },
	];

	const lucideUIIcons = [
		{ name: 'search', label: 'Search', desc: 'Find content' },
		{ name: 'settings', label: 'Settings', desc: 'Configuration' },
		{ name: 'user', label: 'User', desc: 'Account' },
		{ name: 'users', label: 'Users', desc: 'Team members' },
		{ name: 'home', label: 'Home', desc: 'Dashboard' },
		{ name: 'bell', label: 'Bell', desc: 'Notifications' },
		{ name: 'star', label: 'Star', desc: 'Favorites' },
		{ name: 'heart', label: 'Heart', desc: 'Save' },
		{ name: 'trash-2', label: 'Trash', desc: 'Delete' },
		{ name: 'download', label: 'Download', desc: 'Export' },
		{ name: 'upload', label: 'Upload', desc: 'Import' },
		{ name: 'copy', label: 'Copy', desc: 'Duplicate' },
		{ name: 'check', label: 'Check', desc: 'Confirm' },
		{ name: 'x', label: 'Close', desc: 'Dismiss' },
		{ name: 'plus', label: 'Plus', desc: 'Create new' },
		{ name: 'minus', label: 'Minus', desc: 'Remove' },
		{ name: 'info', label: 'Info', desc: 'Information' },
		{ name: 'alert-triangle', label: 'Alert', desc: 'Warning' },
		{ name: 'loader-circle', label: 'Loader', desc: 'Processing' },
		{ name: 'refresh-cw', label: 'Refresh', desc: 'Reload' },
		{ name: 'send', label: 'Send', desc: 'Submit' },
		{ name: 'terminal', label: 'Terminal', desc: 'Command line' },
		{ name: 'zap', label: 'Zap', desc: 'Quick action' },
		{ name: 'activity', label: 'Activity', desc: 'Monitoring' },
	];

	const sizes = [16, 20, 24, 32, 40, 48];
	const colors = [
		{ value: '#7dd3fc', label: 'Celestial Blue' },
		{ value: '#c4b5fd', label: 'Nebula Violet' },
		{ value: '#fcd34d', label: 'Solar Gold' },
		{ value: '#6ee7b7', label: 'Aurora Green' },
		{ value: '#fca5a5', label: 'Supernova Red' },
		{ value: '#e2e8f0', label: 'Starlight' },
	];

	let filteredYorha = $derived(
		yorhaIcons.filter(i => !searchQuery || i.label.toLowerCase().includes(searchQuery.toLowerCase()) || i.name.includes(searchQuery.toLowerCase()))
	);
	let filteredLegal = $derived(
		lucideLegalIcons.filter(i => !searchQuery || i.label.toLowerCase().includes(searchQuery.toLowerCase()) || i.name.includes(searchQuery.toLowerCase()))
	);
	let filteredUI = $derived(
		lucideUIIcons.filter(i => !searchQuery || i.label.toLowerCase().includes(searchQuery.toLowerCase()) || i.name.includes(searchQuery.toLowerCase()))
	);
	let totalShown = $derived(filteredYorha.length + filteredLegal.length + filteredUI.length);
</script>

<div class="page">
	<div class="star-field" aria-hidden="true">
		{#each { length: 60 } as _, i}
			<div
				class="star"
				style="left:{Math.random()*100}%;top:{Math.random()*100}%;animation-delay:{Math.random()*4}s;width:{1+Math.random()*2}px;height:{1+Math.random()*2}px"
			></div>
		{/each}
	</div>

	<header class="hero">
		<h1 class="hero-title">
			<span class="title-glow" style="--glow:{glowColor}">Unified Icon System</span>
		</h1>
		<p class="hero-sub">YoRHa celestial SVGs + Lucide CSS icons — one <code>&lt;Icon&gt;</code> component</p>
		<p class="hero-count">{totalShown} icons available</p>
	</header>

	<section class="controls">
		<div class="control-group">
			<label>Size</label>
			<div class="pill-row">
				{#each sizes as s}
					<button class="pill" class:active={selectedSize === s} onclick={() => selectedSize = s}>{s}px</button>
				{/each}
			</div>
		</div>
		<div class="control-group">
			<label>Glow</label>
			<div class="pill-row">
				{#each colors as c}
					<button
						class="color-dot"
						class:active={glowColor === c.value}
						style="--dot:{c.value}"
						title={c.label}
						onclick={() => glowColor = c.value}
					></button>
				{/each}
			</div>
		</div>
		<div class="control-group search-group">
			<label>Filter</label>
			<input type="text" class="search-input" placeholder="Search icons..." bind:value={searchQuery} />
		</div>
	</section>

	<!-- YoRHa Celestial Icons -->
	{#if filteredYorha.length > 0}
		<section class="icon-section">
			<div class="section-header">
				<h2 class="section-title yorha-badge">YoRHa Celestial</h2>
				<span class="section-count">{filteredYorha.length} icons</span>
				<p class="section-desc">Custom SVG legal icons — domain-specific, celestial themed</p>
			</div>
			<div class="section-usage">
				<code>&lt;Icon name="yorha-law-book" size=&#123;{selectedSize}&#125; /&gt;</code>
			</div>
			<div class="grid">
				{#each filteredYorha as icon}
					<button
						class="icon-card yorha-card"
						class:hovered={hoveredIcon === icon.name}
						onmouseenter={() => hoveredIcon = icon.name}
						onmouseleave={() => hoveredIcon = null}
						style="--glow:{glowColor}"
					>
						<div class="icon-orb">
							<Icon name={icon.name} size={selectedSize} />
						</div>
						<span class="icon-label">{icon.label}</span>
						<span class="icon-desc">{icon.desc}</span>
						{#if hoveredIcon === icon.name}
							<div class="icon-code"><code>{icon.name}</code></div>
						{/if}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Lucide Legal Icons -->
	{#if filteredLegal.length > 0}
		<section class="icon-section">
			<div class="section-header">
				<h2 class="section-title lucide-badge">Lucide Legal</h2>
				<span class="section-count">{filteredLegal.length} icons</span>
				<p class="section-desc">UnoCSS Lucide icons for legal workflows — pure CSS, SSR-safe</p>
			</div>
			<div class="section-usage">
				<code>&lt;Icon name="gavel" size=&#123;{selectedSize}&#125; /&gt;</code>
			</div>
			<div class="grid">
				{#each filteredLegal as icon}
					<button
						class="icon-card lucide-card"
						class:hovered={hoveredIcon === icon.name}
						onmouseenter={() => hoveredIcon = icon.name}
						onmouseleave={() => hoveredIcon = null}
						style="--glow:{glowColor}"
					>
						<div class="icon-orb">
							<Icon name={icon.name} size={selectedSize} />
						</div>
						<span class="icon-label">{icon.label}</span>
						<span class="icon-desc">{icon.desc}</span>
						{#if hoveredIcon === icon.name}
							<div class="icon-code"><code>{icon.name}</code></div>
						{/if}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Lucide UI Icons -->
	{#if filteredUI.length > 0}
		<section class="icon-section">
			<div class="section-header">
				<h2 class="section-title ui-badge">Lucide UI</h2>
				<span class="section-count">{filteredUI.length} icons</span>
				<p class="section-desc">General UI icons for navigation, actions, feedback</p>
			</div>
			<div class="grid">
				{#each filteredUI as icon}
					<button
						class="icon-card ui-card"
						class:hovered={hoveredIcon === icon.name}
						onmouseenter={() => hoveredIcon = icon.name}
						onmouseleave={() => hoveredIcon = null}
						style="--glow:{glowColor}"
					>
						<div class="icon-orb">
							<Icon name={icon.name} size={selectedSize} />
						</div>
						<span class="icon-label">{icon.label}</span>
						<span class="icon-desc">{icon.desc}</span>
						{#if hoveredIcon === icon.name}
							<div class="icon-code"><code>{icon.name}</code></div>
						{/if}
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Scale reference -->
	<section class="scale-section">
		<h2 class="section-title">Scale Reference</h2>
		<div class="scale-row">
			{#each [16, 20, 24, 32, 40, 48] as s}
				<div class="scale-item" style="--glow:{glowColor}">
					<Icon name="yorha-ai-assistant" size={s} />
					<span class="scale-label">{s}px</span>
				</div>
			{/each}
		</div>
		<div class="scale-row" style="margin-top: 1rem">
			{#each [16, 20, 24, 32, 40, 48] as s}
				<div class="scale-item" style="--glow:{glowColor}">
					<Icon name="gavel" size={s} />
					<span class="scale-label">{s}px</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Wiring docs -->
	<section class="docs-section">
		<h2 class="section-title">How It Works</h2>
		<div class="doc-grid">
			<div class="doc-card">
				<h3>YoRHa Prefix</h3>
				<p>Names starting with <code>yorha-</code> render custom SVG Svelte components from <code>$lib/icons/yorha/</code></p>
				<pre><code>&lt;Icon name="yorha-law-book" /&gt;
&lt;Icon name="yorha-evidence" /&gt;</code></pre>
			</div>
			<div class="doc-card">
				<h3>Lucide Fallback</h3>
				<p>All other names render via UnoCSS <code>i-lucide-&#123;name&#125;</code> CSS class (259 icons safelisted)</p>
				<pre><code>&lt;Icon name="gavel" /&gt;
&lt;Icon name="search" size=&#123;20&#125; /&gt;</code></pre>
			</div>
			<div class="doc-card">
				<h3>Import</h3>
				<p>Single import — both systems through one component</p>
				<pre><code>import Icon from '$lib/components/ui/Icon.svelte';</code></pre>
			</div>
		</div>
	</section>
</div>

<style>
	.page {
		position: relative;
		min-height: 100vh;
		background: #0a0a12;
		color: #e2e8f0;
		overflow-x: hidden;
		padding: 2rem 1.5rem 4rem;
		font-family: 'Segoe UI', system-ui, sans-serif;
	}

	/* Starfield */
	.star-field { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
	.star {
		position: absolute;
		background: white;
		border-radius: 50%;
		animation: twinkle 3s ease-in-out infinite alternate;
	}
	@keyframes twinkle { 0% { opacity: 0.2; } 100% { opacity: 0.9; } }

	/* Hero */
	.hero { text-align: center; position: relative; z-index: 1; padding: 2rem 0 1.5rem; }
	.hero-title { font-size: 2rem; font-weight: 700; margin: 0; }
	.title-glow {
		background: linear-gradient(135deg, var(--glow), #e2e8f0);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		filter: drop-shadow(0 0 20px color-mix(in srgb, var(--glow) 40%, transparent));
	}
	.hero-sub { color: #94a3b8; margin: 0.5rem 0 0.25rem; font-size: 0.9rem; }
	.hero-sub code { color: #7dd3fc; background: rgba(125,211,252,0.1); padding: 0.1em 0.4em; border-radius: 3px; font-size: 0.85em; }
	.hero-count { color: #64748b; font-size: 0.8rem; margin: 0; }

	/* Controls */
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		align-items: flex-end;
		padding: 1rem 1.25rem;
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 12px;
		margin: 1.5rem auto;
		max-width: 800px;
		position: relative;
		z-index: 1;
	}
	.control-group { display: flex; flex-direction: column; gap: 0.4rem; }
	.control-group label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
	.pill-row { display: flex; gap: 0.35rem; }
	.pill {
		background: rgba(255,255,255,0.05);
		border: 1px solid rgba(255,255,255,0.08);
		color: #94a3b8;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.pill:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
	.pill.active { background: rgba(125,211,252,0.15); border-color: rgba(125,211,252,0.3); color: #7dd3fc; }
	.color-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--dot);
		border: 2px solid transparent;
		cursor: pointer;
		transition: all 0.15s;
	}
	.color-dot:hover { transform: scale(1.15); }
	.color-dot.active { border-color: white; box-shadow: 0 0 10px var(--dot); }
	.search-group { flex: 1; min-width: 150px; }
	.search-input {
		background: rgba(255,255,255,0.05);
		border: 1px solid rgba(255,255,255,0.08);
		color: #e2e8f0;
		padding: 0.35rem 0.65rem;
		border-radius: 6px;
		font-size: 0.8rem;
		width: 100%;
		outline: none;
	}
	.search-input:focus { border-color: rgba(125,211,252,0.4); }

	/* Sections */
	.icon-section {
		position: relative;
		z-index: 1;
		margin: 2.5rem auto;
		max-width: 1000px;
	}
	.section-header { margin-bottom: 0.75rem; }
	.section-title {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
		display: inline-block;
	}
	.section-count { color: #64748b; font-size: 0.75rem; margin-left: 0.5rem; }
	.section-desc { color: #64748b; font-size: 0.78rem; margin: 0.2rem 0 0; }
	.section-usage {
		margin-bottom: 1rem;
		padding: 0.4rem 0.75rem;
		background: rgba(125,211,252,0.06);
		border: 1px solid rgba(125,211,252,0.12);
		border-radius: 6px;
		display: inline-block;
	}
	.section-usage code { color: #7dd3fc; font-size: 0.78rem; }

	.yorha-badge { color: #c4b5fd; }
	.lucide-badge { color: #7dd3fc; }
	.ui-badge { color: #6ee7b7; }

	/* Grid */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
	}

	/* Icon card */
	.icon-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 1rem 0.5rem 0.75rem;
		background: rgba(255,255,255,0.025);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 10px;
		cursor: default;
		transition: all 0.2s;
		position: relative;
		color: #e2e8f0;
	}
	.icon-card:hover {
		background: rgba(255,255,255,0.05);
		border-color: rgba(255,255,255,0.12);
		transform: translateY(-2px);
	}
	.icon-card.hovered {
		box-shadow: 0 0 20px color-mix(in srgb, var(--glow) 25%, transparent);
		border-color: color-mix(in srgb, var(--glow) 30%, transparent);
	}
	.yorha-card:hover .icon-orb { color: #c4b5fd; filter: drop-shadow(0 0 8px rgba(196,181,253,0.5)); }
	.lucide-card:hover .icon-orb { color: #7dd3fc; filter: drop-shadow(0 0 8px rgba(125,211,252,0.5)); }
	.ui-card:hover .icon-orb { color: #6ee7b7; filter: drop-shadow(0 0 8px rgba(110,231,183,0.5)); }

	.icon-orb {
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
	}
	.icon-label { font-size: 0.72rem; font-weight: 500; line-height: 1.2; }
	.icon-desc { font-size: 0.62rem; color: #64748b; line-height: 1.2; text-align: center; }
	.icon-code {
		position: absolute;
		bottom: -24px;
		left: 50%;
		transform: translateX(-50%);
		background: #1e1e2e;
		border: 1px solid rgba(255,255,255,0.1);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		white-space: nowrap;
		z-index: 10;
	}
	.icon-code code { font-size: 0.65rem; color: #7dd3fc; }

	/* Scale section */
	.scale-section {
		position: relative;
		z-index: 1;
		margin: 3rem auto;
		max-width: 800px;
		text-align: center;
	}
	.scale-row {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 2rem;
		margin-top: 1rem;
	}
	.scale-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		color: #e2e8f0;
		transition: color 0.2s;
	}
	.scale-item:hover { color: var(--glow); }
	.scale-label { font-size: 0.65rem; color: #64748b; }

	/* Docs */
	.docs-section {
		position: relative;
		z-index: 1;
		margin: 3rem auto;
		max-width: 800px;
	}
	.doc-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}
	.doc-card {
		background: rgba(255,255,255,0.025);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 10px;
		padding: 1.25rem;
	}
	.doc-card h3 { font-size: 0.9rem; color: #7dd3fc; margin: 0 0 0.5rem; }
	.doc-card p { font-size: 0.78rem; color: #94a3b8; margin: 0 0 0.75rem; line-height: 1.5; }
	.doc-card code { color: #c4b5fd; font-size: 0.78rem; }
	.doc-card pre {
		background: rgba(0,0,0,0.3);
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0;
	}
	.doc-card pre code { color: #6ee7b7; font-size: 0.72rem; line-height: 1.6; }
</style>
