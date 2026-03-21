<script lang="ts">
	import {
		IconLawBook,
		IconCitation,
		IconGlossaryTerm,
		IconPrecedentCase,
		IconRegulation,
		IconSubjectProfile,
		IconEvidenceFile,
		IconTimeline,
		IconNetworkGraph,
		IconIntegrityShield,
		IconWarningFlag,
		IconAiAssistant
	} from '$lib/icons/yorha';

	let hoveredIcon = $state<string | null>(null);
	let selectedSize = $state(24);
	let selectedStroke = $state(1.5);
	let glowColor = $state('#e2e8f0');

	const icons = [
		{ component: IconLawBook, name: 'IconLawBook', label: 'Law Book', desc: 'Legal statutes & references' },
		{ component: IconCitation, name: 'IconCitation', label: 'Citation', desc: 'Quoted legal passages' },
		{ component: IconGlossaryTerm, name: 'IconGlossaryTerm', label: 'Glossary', desc: 'Legal terminology' },
		{ component: IconPrecedentCase, name: 'IconPrecedentCase', label: 'Precedent', desc: 'Case law & rulings' },
		{ component: IconRegulation, name: 'IconRegulation', label: 'Regulation', desc: 'Regulatory decrees' },
		{ component: IconSubjectProfile, name: 'IconSubjectProfile', label: 'Subject', desc: 'Person of interest' },
		{ component: IconEvidenceFile, name: 'IconEvidenceFile', label: 'Evidence', desc: 'Case evidence files' },
		{ component: IconTimeline, name: 'IconTimeline', label: 'Timeline', desc: 'Event chronology' },
		{ component: IconNetworkGraph, name: 'IconNetworkGraph', label: 'Network', desc: 'Relationship mapping' },
		{ component: IconIntegrityShield, name: 'IconIntegrityShield', label: 'Integrity', desc: 'Verification & trust' },
		{ component: IconWarningFlag, name: 'IconWarningFlag', label: 'Warning', desc: 'Alerts & red flags' },
		{ component: IconAiAssistant, name: 'IconAiAssistant', label: 'AI Assistant', desc: 'YoRHa neural agent' },
	];

	const sizes = [16, 20, 24, 32, 40, 48, 64];
	const strokes = [1, 1.5, 2, 2.5];
	const colors = [
		{ value: '#7dd3fc', label: 'Celestial Blue' },
		{ value: '#c4b5fd', label: 'Nebula Violet' },
		{ value: '#fcd34d', label: 'Solar Gold' },
		{ value: '#6ee7b7', label: 'Aurora Green' },
		{ value: '#fca5a5', label: 'Supernova Red' },
		{ value: '#e2e8f0', label: 'Starlight' },
	];
</script>

<div class="page">
	<!-- Celestial background with stars -->
	<div class="star-field" aria-hidden="true">
		{#each { length: 80 } as _, i}
			<div
				class="star"
				style="left:{Math.random()*100}%;top:{Math.random()*100}%;animation-delay:{Math.random()*4}s;width:{1+Math.random()*2}px;height:{1+Math.random()*2}px"
			></div>
		{/each}
	</div>

	<!-- Hero section with celestial image -->
	<header class="hero">
		<div class="hero-image-wrap">
			<img src="/yorha-celestial.png" alt="YoRHa Legal AI — Celestial Theme" class="hero-image" />
			<div class="hero-glow" style="--glow:{glowColor}"></div>
		</div>
		<h1 class="hero-title">
			<span class="title-yorha">YoRHa</span>
			<span class="title-legal">Legal Icon System</span>
		</h1>
		<p class="hero-sub">12 monochrome geometric SVG icons — celestial precision for legal intelligence</p>
	</header>

	<!-- Controls bar -->
	<section class="controls">
		<div class="control-group">
			<label>Size</label>
			<div class="pill-row">
				{#each sizes as s}
					<button
						class="pill"
						class:active={selectedSize === s}
						onclick={() => selectedSize = s}
					>{s}px</button>
				{/each}
			</div>
		</div>
		<div class="control-group">
			<label>Stroke</label>
			<div class="pill-row">
				{#each strokes as sw}
					<button
						class="pill"
						class:active={selectedStroke === sw}
						onclick={() => selectedStroke = sw}
					>{sw}</button>
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
	</section>

	<!-- Icon constellation grid - legal icons centered -->
	<section class="constellation">
		<div class="grid">
			{#each icons as icon}
				<button
					class="icon-card"
					class:hovered={hoveredIcon === icon.name}
					onmouseenter={() => hoveredIcon = icon.name}
					onmouseleave={() => hoveredIcon = null}
					style="--glow:{glowColor}"
				>
					<div class="icon-orb">
						<icon.component size={selectedSize} strokeWidth={selectedStroke} class="icon-svg" />
					</div>
					<span class="icon-label">{icon.label}</span>
					<span class="icon-desc">{icon.desc}</span>
					{#if hoveredIcon === icon.name}
						<div class="icon-code">
							<code>{`<${icon.name} />`}</code>
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</section>

	<!-- Usage section -->
	<section class="usage">
		<h2>Usage</h2>
		<pre><code>{`import { IconLawBook, IconCitation } from '$lib/icons/yorha';

<IconLawBook size={${selectedSize}} strokeWidth={${selectedStroke}} class="text-accent" />
<IconCitation size={${selectedSize}} strokeWidth={${selectedStroke}} />`}</code></pre>
	</section>

	<!-- Size comparison strip -->
	<section class="size-strip">
		<h2>Scale Reference</h2>
		<div class="strip-row">
			{#each [16, 20, 24, 32, 40, 48, 64] as s}
				<div class="strip-item">
					<IconAiAssistant size={s} strokeWidth={selectedStroke} class="strip-icon" />
					<span>{s}px</span>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	/* === Base === */
	.page {
		position: relative;
		min-height: 100vh;
		background: #0a0a12;
		color: #e2e8f0;
		overflow-x: hidden;
		padding: 2rem 1.5rem 4rem;
		font-family: 'Segoe UI', system-ui, sans-serif;
	}

	/* === Starfield === */
	.star-field {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 0;
	}
	.star {
		position: absolute;
		border-radius: 50%;
		background: white;
		opacity: 0;
		animation: twinkle 4s ease-in-out infinite;
	}
	@keyframes twinkle {
		0%, 100% { opacity: 0.1; }
		50% { opacity: 0.8; }
	}

	/* === Hero === */
	.hero {
		position: relative;
		z-index: 1;
		text-align: center;
		margin-bottom: 3rem;
	}
	.hero-image-wrap {
		position: relative;
		display: inline-block;
		margin-bottom: 1.5rem;
	}
	.hero-image {
		width: min(400px, 80vw);
		height: auto;
		border-radius: 16px;
		border: 1px solid rgba(125, 211, 252, 0.2);
		box-shadow: 0 0 60px rgba(125, 211, 252, 0.15);
	}
	.hero-glow {
		position: absolute;
		inset: -20px;
		border-radius: 24px;
		background: radial-gradient(ellipse at center, color-mix(in srgb, var(--glow) 15%, transparent), transparent 70%);
		pointer-events: none;
		z-index: -1;
	}
	.hero-title {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
	}
	.title-yorha {
		font-size: clamp(2rem, 5vw, 3.5rem);
		font-weight: 200;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: rgba(255,255,255,0.9);
	}
	.title-legal {
		font-size: clamp(0.9rem, 2vw, 1.2rem);
		font-weight: 400;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: rgba(125, 211, 252, 0.7);
	}
	.hero-sub {
		margin-top: 0.75rem;
		font-size: 0.875rem;
		color: rgba(255,255,255,0.4);
		letter-spacing: 0.05em;
	}

	/* === Controls === */
	.controls {
		position: relative;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 3rem;
		padding: 1.25rem 1.5rem;
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 12px;
		max-width: 800px;
		margin-inline: auto;
	}
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.control-group label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: rgba(255,255,255,0.35);
	}
	.pill-row {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
	}
	.pill {
		padding: 0.3rem 0.65rem;
		border-radius: 6px;
		border: 1px solid rgba(255,255,255,0.1);
		background: rgba(255,255,255,0.04);
		color: rgba(255,255,255,0.6);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.pill:hover {
		border-color: rgba(125, 211, 252, 0.3);
		color: rgba(255,255,255,0.9);
	}
	.pill.active {
		background: rgba(125, 211, 252, 0.15);
		border-color: rgba(125, 211, 252, 0.4);
		color: #7dd3fc;
	}
	.color-dot {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid rgba(255,255,255,0.1);
		background: var(--dot);
		cursor: pointer;
		transition: all 0.2s;
	}
	.color-dot:hover {
		border-color: rgba(255,255,255,0.4);
		transform: scale(1.15);
	}
	.color-dot.active {
		border-color: white;
		box-shadow: 0 0 12px var(--dot);
	}

	/* === Constellation Grid === */
	.constellation {
		position: relative;
		z-index: 1;
		max-width: 1000px;
		margin-inline: auto;
		margin-bottom: 3rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 1rem;
	}
	.icon-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem 1rem 1rem;
		border-radius: 12px;
		border: 1px solid rgba(255,255,255,0.06);
		background: rgba(255,255,255,0.02);
		cursor: default;
		transition: all 0.3s ease;
		text-align: center;
	}
	.icon-card:hover {
		border-color: color-mix(in srgb, var(--glow) 40%, transparent);
		background: rgba(255,255,255,0.04);
		transform: translateY(-4px);
		box-shadow: 0 8px 32px color-mix(in srgb, var(--glow) 12%, transparent);
	}
	.icon-orb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%);
		transition: all 0.3s;
	}
	.icon-card:hover .icon-orb {
		background: radial-gradient(circle, color-mix(in srgb, var(--glow) 15%, transparent) 0%, transparent 70%);
		box-shadow: 0 0 24px color-mix(in srgb, var(--glow) 20%, transparent);
	}
	.icon-card :global(.icon-svg) {
		color: rgba(255,255,255,0.75);
		transition: color 0.3s;
	}
	.icon-card:hover :global(.icon-svg) {
		color: var(--glow);
		filter: drop-shadow(0 0 6px color-mix(in srgb, var(--glow) 50%, transparent));
	}
	.icon-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(255,255,255,0.8);
		letter-spacing: 0.02em;
	}
	.icon-desc {
		font-size: 0.65rem;
		color: rgba(255,255,255,0.35);
		line-height: 1.3;
	}
	.icon-code {
		position: absolute;
		bottom: -2rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.25rem 0.5rem;
		border-radius: 6px;
		background: rgba(0,0,0,0.85);
		border: 1px solid rgba(255,255,255,0.1);
		white-space: nowrap;
		z-index: 10;
	}
	.icon-code code {
		font-size: 0.65rem;
		color: #7dd3fc;
		font-family: 'Cascadia Code', 'Fira Code', monospace;
	}

	/* === Usage === */
	.usage {
		position: relative;
		z-index: 1;
		max-width: 700px;
		margin-inline: auto;
		margin-bottom: 3rem;
	}
	.usage h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: rgba(255,255,255,0.35);
		margin-bottom: 0.75rem;
	}
	.usage pre {
		padding: 1.25rem;
		border-radius: 10px;
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.06);
		overflow-x: auto;
	}
	.usage code {
		font-size: 0.8rem;
		color: rgba(125, 211, 252, 0.8);
		font-family: 'Cascadia Code', 'Fira Code', monospace;
		line-height: 1.6;
	}

	/* === Size Strip === */
	.size-strip {
		position: relative;
		z-index: 1;
		max-width: 700px;
		margin-inline: auto;
	}
	.size-strip h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: rgba(255,255,255,0.35);
		margin-bottom: 1rem;
		text-align: center;
	}
	.strip-row {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 2rem;
	}
	.strip-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.strip-item :global(.strip-icon) {
		color: rgba(255,255,255,0.6);
	}
	.strip-item span {
		font-size: 0.65rem;
		color: rgba(255,255,255,0.3);
	}
</style>
