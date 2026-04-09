<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Progress from '$lib/components/ui/Progress.svelte';
	import Kbd from '$lib/components/ui/Kbd.svelte';
	import Tooltip from '$lib/components/ui/Tooltip.svelte';
	import ChatFeedback from '$lib/components/ai/ChatFeedback.svelte';
	import BoardMinimap from '$lib/components/evidence/BoardMinimap.svelte';
	import TypewriterPrompt from '$lib/components/ui/TypewriterPrompt.svelte';
	import MarkdownSceneViewer from '$lib/components/ui/MarkdownSceneViewer.svelte';
	import AdaptiveRenderingEngine from '$lib/components/ui/AdaptiveRenderingEngine.svelte';

	// Interactive state
	let progressValue = $state(65);
	let feedbackLog = $state<string[]>([]);
	let minimapViewport = $state({ zoom: 1, panX: -200, panY: -100 });

	// Typewriter prompts
	const typewriterPrompts = [
		{ text: 'Analyzing evidence timeline for Case #2847...', caseId: '2847' },
		{ text: 'Cross-referencing witness statements with financial records...' },
		{ text: 'Searching for precedent cases matching fraud pattern...' },
	];
	let activePromptIdx = $state(0);
	let typewriterKey = $state(0);

	function cyclePrompt() {
		activePromptIdx = (activePromptIdx + 1) % typewriterPrompts.length;
		typewriterKey++;
	}

	// Mock scene for MarkdownSceneViewer
	const mockScene = {
		id: 'scene-001',
		title: 'Financial Transaction Summary',
		markdown: '**Key Finding:** Three wire transfers totaling **$2.4M** were made between March 12-15, 2024.\n\n- Transfer 1: $800,000 → Offshore Account #4471\n- Transfer 2: $1,100,000 → Shell Corp "Meridian Holdings"\n- Transfer 3: $500,000 → Personal Account (flagged)\n\n> Pattern matches known layering technique per FinCEN guidelines.',
		confidence: 0.87,
		sourceFiles: ['bank_records_q1.pdf', 'wire_log_march.csv'],
		aiGenerated: true,
		validated: false,
	};
	let sceneValidated = $state(false);
	let sceneAction = $state('');

	function handleSceneValidate(id: string) {
		sceneValidated = true;
		sceneAction = `Validated scene ${id}`;
	}
	function handleSceneReject(id: string) {
		sceneAction = `Rejected scene ${id}`;
	}

	// Mock nodes for BoardMinimap
	const minimapNodes = [
		{ id: '1', x: 100, y: 80, evidenceType: 'document' },
		{ id: '2', x: 350, y: 150, evidenceType: 'photo' },
		{ id: '3', x: 220, y: 300, evidenceType: 'testimony' },
		{ id: '4', x: 500, y: 200, evidenceType: 'document' },
		{ id: '5', x: 150, y: 400, evidenceType: 'forensic' },
		{ id: '6', x: 450, y: 350, evidenceType: 'photo' },
		{ id: '7', x: 300, y: 50, evidenceType: 'financial' },
		{ id: '8', x: 600, y: 100, evidenceType: 'testimony' },
		{ id: '9', x: 700, y: 300, evidenceType: 'document' },
		{ id: '10', x: 50, y: 250, evidenceType: 'forensic' },
	];

	function getCategoryColor(type: string): string {
		const map: Record<string, string> = {
			document: '#7dd3fc',
			photo: '#fcd34d',
			testimony: '#c4b5fd',
			forensic: '#fca5a5',
			financial: '#6ee7b7',
		};
		return map[type] ?? '#94a3b8';
	}

	function handleFeedback(index: number, helpful: boolean) {
		feedbackLog = [...feedbackLog, `Message ${index}: ${helpful ? '👍' : '👎'}`];
	}

	function handleMinimapNavigate(x: number, y: number) {
		minimapViewport = { zoom: 1, panX: -x + 400, panY: -y + 300 };
	}
</script>

<div class="page">
	<!-- Stars -->
	<div class="star-field" aria-hidden="true">
		{#each { length: 50 } as _, i}
			<div
				class="star"
				style="left:{Math.random()*100}%;top:{Math.random()*100}%;animation-delay:{Math.random()*4}s;width:{1+Math.random()*2}px;height:{1+Math.random()*2}px"
			></div>
		{/each}
	</div>

	<header class="hero">
		<h1 class="hero-title">UI Components Showcase</h1>
		<p class="hero-sub">Orphan components — rescued, wired, and alive</p>
		<p class="hero-meta">11 components • Svelte 5 runes • Celestial theme</p>
	</header>

	<!-- ─── Badges ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="yorha-integrity" size={20} class="section-icon" />
			<h2>Badge</h2>
			<span class="component-path">ui/Badge.svelte</span>
		</div>
		<p class="section-desc">Status labels — 7 variants × 3 sizes</p>

		<div class="demo-row">
			<h3 class="demo-label">Variants</h3>
			<div class="demo-flex">
				<Badge variant="default">Default</Badge>
				<Badge variant="primary">Primary</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="success">Success</Badge>
				<Badge variant="warning">Warning</Badge>
				<Badge variant="destructive">Danger</Badge>
				<Badge variant="outline">Outline</Badge>
			</div>
		</div>

		<div class="demo-row">
			<h3 class="demo-label">Sizes</h3>
			<div class="demo-flex">
				<Badge size="sm" variant="primary">SM</Badge>
				<Badge size="md" variant="primary">MD</Badge>
				<Badge size="lg" variant="primary">LG</Badge>
			</div>
		</div>

		<div class="demo-row">
			<h3 class="demo-label">Contextual</h3>
			<div class="demo-flex">
				<Badge variant="success"><Icon name="check" size={10} class="mr-1" /> Verified</Badge>
				<Badge variant="warning"><Icon name="alert-triangle" size={10} class="mr-1" /> Pending</Badge>
				<Badge variant="destructive"><Icon name="x" size={10} class="mr-1" /> Sealed</Badge>
				<Badge variant="outline"><Icon name="yorha-law-book" size={12} class="mr-1" /> Legal</Badge>
			</div>
		</div>
	</section>

	<!-- ─── Card ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="yorha-evidence" size={20} class="section-icon" />
			<h2>Card</h2>
			<span class="component-path">ui/Card.svelte</span>
		</div>
		<p class="section-desc">Container component — 4 variants × 4 padding sizes</p>

		<div class="card-grid">
			<Card variant="default">
				<h4 class="card-title">Default</h4>
				<p class="card-text">Standard panel background with subtle border.</p>
			</Card>
			<Card variant="elevated">
				<h4 class="card-title">Elevated</h4>
				<p class="card-text">Shadow lift for primary content cards.</p>
			</Card>
			<Card variant="outlined">
				<h4 class="card-title">Outlined</h4>
				<p class="card-text">Transparent with prominent border.</p>
			</Card>
			<Card variant="ghost">
				<h4 class="card-title">Ghost</h4>
				<p class="card-text">Minimal hint — barely there.</p>
			</Card>
		</div>
	</section>

	<!-- ─── Progress ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="yorha-timeline" size={20} class="section-icon" />
			<h2>Progress</h2>
			<span class="component-path">ui/Progress.svelte</span>
		</div>
		<p class="section-desc">Progress bar — 7 variants, interactive value control</p>

		<div class="demo-row">
			<div class="progress-control">
				<label>Value: {progressValue}%</label>
				<input type="range" min="0" max="100" bind:value={progressValue} class="range-input" />
			</div>
		</div>

		<div class="progress-stack">
			<div class="progress-item">
				<span class="progress-label">Default</span>
				<Progress value={progressValue} />
			</div>
			<div class="progress-item">
				<span class="progress-label">Success</span>
				<Progress value={progressValue} variant="success" />
			</div>
			<div class="progress-item">
				<span class="progress-label">Warning</span>
				<Progress value={progressValue} variant="warning" />
			</div>
			<div class="progress-item">
				<span class="progress-label">Error</span>
				<Progress value={progressValue} variant="error" />
			</div>
			<div class="progress-item">
				<span class="progress-label">Info</span>
				<Progress value={progressValue} variant="info" />
			</div>
			<div class="progress-item">
				<span class="progress-label">YoRHa</span>
				<Progress value={progressValue} variant="yorha" />
			</div>
			<div class="progress-item">
				<span class="progress-label">Legal</span>
				<Progress value={progressValue} variant="legal" showPercentage />
			</div>
		</div>
	</section>

	<!-- ─── Skeleton ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="loader-circle" size={20} class="section-icon" />
			<h2>Skeleton</h2>
			<span class="component-path">ui/Skeleton.svelte</span>
		</div>
		<p class="section-desc">Loading placeholders — 4 variants with shimmer animation</p>

		<div class="skeleton-demo">
			<div class="skeleton-row">
				<div class="skeleton-label">text</div>
				<div class="skeleton-area">
					<Skeleton variant="text" width="80%" />
					<Skeleton variant="text" width="65%" />
					<Skeleton variant="text" width="45%" />
				</div>
			</div>
			<div class="skeleton-row">
				<div class="skeleton-label">card</div>
				<div class="skeleton-area">
					<Skeleton variant="card" width="100%" height="80px" />
				</div>
			</div>
			<div class="skeleton-row">
				<div class="skeleton-label">circle</div>
				<div class="skeleton-area skel-flex">
					<Skeleton variant="circle" width="40px" height="40px" />
					<Skeleton variant="circle" width="32px" height="32px" />
					<Skeleton variant="circle" width="24px" height="24px" />
				</div>
			</div>
			<div class="skeleton-row">
				<div class="skeleton-label">rect</div>
				<div class="skeleton-area skel-flex">
					<Skeleton variant="rect" width="60px" height="60px" />
					<Skeleton variant="rect" width="120px" height="60px" />
				</div>
			</div>
		</div>
	</section>

	<!-- ─── Kbd ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="keyboard" size={20} class="section-icon" />
			<h2>Kbd</h2>
			<span class="component-path">ui/Kbd.svelte</span>
		</div>
		<p class="section-desc">Keyboard shortcut display — modifier symbols, combo rendering</p>

		<div class="kbd-grid">
			<div class="kbd-item">
				<Kbd keys="Ctrl+K" /> <span class="kbd-action">Command palette</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="Ctrl+Shift+P" /> <span class="kbd-action">Quick actions</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="Cmd+S" /> <span class="kbd-action">Save</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="Esc" /> <span class="kbd-action">Close dialog</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="Tab" /> <span class="kbd-action">Next field</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="?" size="md" /> <span class="kbd-action">Show shortcuts</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="Ctrl+Enter" /> <span class="kbd-action">Submit</span>
			</div>
			<div class="kbd-item">
				<Kbd keys="Alt+Up" /> <span class="kbd-action">Move line up</span>
			</div>
		</div>
	</section>

	<!-- ─── Tooltip ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="message-circle" size={20} class="section-icon" />
			<h2>Tooltip</h2>
			<span class="component-path">ui/Tooltip.svelte</span>
		</div>
		<p class="section-desc">Hover-reveal tooltips with bits-ui — 4 positions, auto-arrow</p>

		<div class="tooltip-row">
			<Tooltip content="Opens above" side="top">
				<button class="tooltip-trigger">Top</button>
			</Tooltip>
			<Tooltip content="Opens right" side="right">
				<button class="tooltip-trigger">Right</button>
			</Tooltip>
			<Tooltip content="Opens below" side="bottom">
				<button class="tooltip-trigger">Bottom</button>
			</Tooltip>
			<Tooltip content="Opens left" side="left">
				<button class="tooltip-trigger">Left</button>
			</Tooltip>
		</div>

		<div class="tooltip-row" style="margin-top: 1rem">
			<Tooltip content="View case details" side="top" delayDuration={200}>
				<button class="tooltip-trigger icon-btn"><Icon name="briefcase" size={16} /></button>
			</Tooltip>
			<Tooltip content="Search evidence" side="top" delayDuration={200}>
				<button class="tooltip-trigger icon-btn"><Icon name="yorha-evidence" size={16} /></button>
			</Tooltip>
			<Tooltip content="AI analysis" side="top" delayDuration={200}>
				<button class="tooltip-trigger icon-btn"><Icon name="yorha-ai-assistant" size={16} /></button>
			</Tooltip>
			<Tooltip content="Legal citations" side="top" delayDuration={200}>
				<button class="tooltip-trigger icon-btn"><Icon name="yorha-citation" size={16} /></button>
			</Tooltip>
		</div>
	</section>

	<!-- ─── ChatFeedback ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="thumbs-up" size={20} class="section-icon" />
			<h2>ChatFeedback</h2>
			<span class="component-path">ai/ChatFeedback.svelte</span>
		</div>
		<p class="section-desc">AI response rating widget — thumbs up/down with state tracking</p>

		<div class="feedback-demo">
			<Card variant="default" padding="md">
				<div class="chat-msg">
					<p class="chat-text">The statute of limitations for fraud under 18 U.S.C. § 1341 is 5 years from the date of the offense.</p>
					<div class="chat-meta">
						<span class="chat-source">gemma4-legal</span>
						<ChatFeedback messageIndex={0} source="demo" onfeedback={handleFeedback} />
					</div>
				</div>
			</Card>
			<Card variant="default" padding="md">
				<div class="chat-msg">
					<p class="chat-text">Based on the evidence timeline, the key events cluster around March 2024 with 3 corroborating witnesses.</p>
					<div class="chat-meta">
						<span class="chat-source">rag-pipeline</span>
						<ChatFeedback messageIndex={1} source="demo" onfeedback={handleFeedback} />
					</div>
				</div>
			</Card>
			{#if feedbackLog.length > 0}
				<div class="feedback-log">
					<span class="log-label">Feedback log:</span>
					{#each feedbackLog as entry}
						<span class="log-entry">{entry}</span>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- ─── BoardMinimap ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="yorha-network" size={20} class="section-icon" />
			<h2>BoardMinimap</h2>
			<span class="component-path">evidence/BoardMinimap.svelte</span>
		</div>
		<p class="section-desc">Evidence board navigator — SVG minimap with viewport tracking. Click to navigate.</p>

		<div class="minimap-demo">
			<div class="minimap-container">
				<BoardMinimap
					nodes={minimapNodes}
					viewport={minimapViewport}
					canvasWidth={800}
					canvasHeight={600}
					{getCategoryColor}
					onNavigate={handleMinimapNavigate}
				/>
			</div>
			<div class="minimap-legend">
				<h4>Legend</h4>
				{#each [['document', 'Document'], ['photo', 'Photo'], ['testimony', 'Testimony'], ['forensic', 'Forensic'], ['financial', 'Financial']] as [type, label]}
					<div class="legend-item">
						<span class="legend-dot" style="background:{getCategoryColor(type)}"></span>
						<span>{label}</span>
					</div>
				{/each}
				<div class="legend-coords">
					Pan: ({Math.round(minimapViewport.panX)}, {Math.round(minimapViewport.panY)})
				</div>
			</div>
		</div>
	</section>

	<!-- ─── Icons Integration ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="sparkles" size={20} class="section-icon" />
			<h2>Unified Icons</h2>
			<span class="component-path">ui/Icon.svelte → yorha/ + lucide</span>
		</div>
		<p class="section-desc">Both icon systems through one component — <code>yorha-*</code> prefix for SVG, everything else via UnoCSS Lucide</p>

		<div class="icons-showcase">
			<div class="icons-group">
				<h4 class="icons-group-title yorha-label">YoRHa Celestial</h4>
				<div class="icons-row">
					{#each ['yorha-law-book', 'yorha-citation', 'yorha-glossary', 'yorha-precedent', 'yorha-regulation', 'yorha-subject'] as name}
						<Tooltip content={name} side="bottom" delayDuration={100}>
							<div class="icon-cell">
								<Icon {name} size={28} />
							</div>
						</Tooltip>
					{/each}
				</div>
				<div class="icons-row">
					{#each ['yorha-evidence', 'yorha-timeline', 'yorha-network', 'yorha-integrity', 'yorha-warning', 'yorha-ai-assistant'] as name}
						<Tooltip content={name} side="bottom" delayDuration={100}>
							<div class="icon-cell">
								<Icon {name} size={28} />
							</div>
						</Tooltip>
					{/each}
				</div>
			</div>
			<div class="icons-group">
				<h4 class="icons-group-title lucide-label">Lucide Legal</h4>
				<div class="icons-row">
					{#each ['gavel', 'scale', 'briefcase', 'shield-check', 'fingerprint', 'landmark', 'scan-face', 'file-search', 'lock', 'brain', 'dna', 'crosshair'] as name}
						<Tooltip content={name} side="bottom" delayDuration={100}>
							<div class="icon-cell">
								<Icon {name} size={20} />
							</div>
						</Tooltip>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- ─── TypewriterPrompt ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="terminal" size={20} class="section-icon" />
			<h2>TypewriterPrompt</h2>
			<span class="component-path">ui/TypewriterPrompt.svelte</span>
		</div>
		<p class="section-desc">AI prompt typewriter effect — blinking cursor, auto-advance</p>

		{#key typewriterKey}
			<TypewriterPrompt
				prompt={typewriterPrompts[activePromptIdx]}
				speed={40}
				onComplete={cyclePrompt}
			/>
		{/key}
		<p class="typewriter-hint">Auto-cycles through 3 legal prompts</p>
	</section>

	<!-- ─── MarkdownSceneViewer ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="file-text" size={20} class="section-icon" />
			<h2>MarkdownSceneViewer</h2>
			<span class="component-path">ui/MarkdownSceneViewer.svelte</span>
		</div>
		<p class="section-desc">AI-generated scene summaries with human-in-the-loop validation — validate, edit, or reject</p>

		<MarkdownSceneViewer
			scene={sceneValidated ? { ...mockScene, validated: true } : mockScene}
			editable
			onValidate={handleSceneValidate}
			onReject={handleSceneReject}
		/>
		{#if sceneAction}
			<div class="scene-action-log">
				<Icon name="check-circle" size={14} />
				<span>{sceneAction}</span>
			</div>
		{/if}
	</section>

	<!-- ─── AdaptiveRenderingEngine ─── -->
	<section class="demo-section">
		<div class="section-head">
			<Icon name="monitor" size={20} class="section-icon" />
			<h2>AdaptiveRenderingEngine</h2>
			<span class="component-path">ui/AdaptiveRenderingEngine.svelte</span>
		</div>
		<p class="section-desc">Canvas-based quality tier renderer — 8-BIT NES / 16-BIT SNES / 64-BIT N64 with live FPS metrics</p>

		<div class="engine-demo">
			<svelte:boundary>
				<AdaptiveRenderingEngine assetType="evidence" />
				{#snippet failed(error)}
					<div class="engine-error">
						<p>AdaptiveRenderingEngine encountered an error (effect cycle). Component isolated to prevent page breakage.</p>
					</div>
				{/snippet}
			</svelte:boundary>
		</div>
	</section>
</div>

<style>
	/* ─── Base ─── */
	.page {
		position: relative;
		min-height: 100vh;
		background: #0a0a12;
		color: #e2e8f0;
		overflow-x: hidden;
		padding: 2rem 1.5rem 4rem;
		font-family: 'Segoe UI', system-ui, sans-serif;
	}

	.star-field { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
	.star {
		position: absolute;
		background: white;
		border-radius: 50%;
		animation: twinkle 3s ease-in-out infinite alternate;
	}
	@keyframes twinkle { 0% { opacity: 0.15; } 100% { opacity: 0.7; } }

	/* ─── Hero ─── */
	.hero { text-align: center; position: relative; z-index: 1; padding: 2rem 0 1rem; }
	.hero-title {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
		background: linear-gradient(135deg, #c4b5fd, #7dd3fc, #6ee7b7);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	.hero-sub { color: #94a3b8; margin: 0.5rem 0 0.25rem; font-size: 0.95rem; }
	.hero-meta { color: #475569; font-size: 0.75rem; margin: 0; }

	/* ─── Sections ─── */
	.demo-section {
		position: relative;
		z-index: 1;
		max-width: 800px;
		margin: 2.5rem auto;
		padding: 1.5rem;
		background: rgba(255,255,255,0.02);
		border: 1px solid rgba(255,255,255,0.05);
		border-radius: 12px;
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}
	.section-head h2 { font-size: 1.15rem; font-weight: 600; margin: 0; }
	.section-icon { color: #c4b5fd; }
	.component-path {
		font-size: 0.65rem;
		color: #475569;
		font-family: monospace;
		margin-left: auto;
		background: rgba(255,255,255,0.04);
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
	}
	.section-desc {
		font-size: 0.8rem;
		color: #64748b;
		margin: 0 0 1rem;
	}
	.section-desc code {
		color: #7dd3fc;
		background: rgba(125,211,252,0.08);
		padding: 0.1em 0.3em;
		border-radius: 3px;
		font-size: 0.85em;
	}

	/* ─── Badge demo ─── */
	.demo-row { margin-bottom: 1rem; }
	.demo-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 0.4rem; }
	.demo-flex { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }

	/* ─── Card demo ─── */
	.card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
	.card-title { margin: 0 0 0.25rem; font-size: 0.85rem; color: #c4b5fd; }
	.card-text { margin: 0; font-size: 0.75rem; color: #94a3b8; line-height: 1.5; }

	/* ─── Progress demo ─── */
	.progress-control { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
	.progress-control label { font-size: 0.8rem; color: #94a3b8; min-width: 80px; }
	.range-input {
		flex: 1;
		accent-color: #7dd3fc;
		background: transparent;
		height: 4px;
	}
	.progress-stack { display: flex; flex-direction: column; gap: 0.75rem; }
	.progress-item { display: flex; align-items: center; gap: 0.75rem; }
	.progress-label { font-size: 0.7rem; color: #64748b; min-width: 55px; text-align: right; }

	/* ─── Skeleton demo ─── */
	.skeleton-demo { display: flex; flex-direction: column; gap: 1rem; }
	.skeleton-row { display: flex; gap: 1rem; align-items: center; }
	.skeleton-label { font-size: 0.7rem; color: #64748b; min-width: 45px; text-align: right; font-family: monospace; }
	.skeleton-area { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
	.skel-flex { flex-direction: row; align-items: center; }

	/* ─── Kbd demo ─── */
	.kbd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
	.kbd-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.35rem 0; }
	.kbd-action { font-size: 0.75rem; color: #94a3b8; }

	/* ─── Tooltip demo ─── */
	.tooltip-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.tooltip-trigger {
		padding: 0.4rem 1rem;
		background: rgba(255,255,255,0.05);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 6px;
		color: #e2e8f0;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.tooltip-trigger:hover { background: rgba(255,255,255,0.1); border-color: rgba(125,211,252,0.3); }
	.icon-btn { padding: 0.5rem; display: flex; align-items: center; justify-content: center; }

	/* ─── ChatFeedback demo ─── */
	.feedback-demo { display: flex; flex-direction: column; gap: 0.75rem; }
	.chat-msg { display: flex; flex-direction: column; gap: 0.35rem; }
	.chat-text { margin: 0; font-size: 0.82rem; color: #cbd5e1; line-height: 1.55; }
	.chat-meta { display: flex; align-items: center; gap: 0.5rem; }
	.chat-source { font-size: 0.65rem; color: #475569; font-family: monospace; }
	.feedback-log {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
		padding: 0.4rem 0.6rem;
		background: rgba(125,211,252,0.06);
		border-radius: 6px;
		font-size: 0.7rem;
	}
	.log-label { color: #64748b; }
	.log-entry { color: #94a3b8; }

	/* ─── Minimap demo ─── */
	.minimap-demo { display: flex; gap: 1.5rem; align-items: flex-start; }
	.minimap-container { position: relative; width: 200px; height: 150px; flex-shrink: 0; }
	.minimap-legend { font-size: 0.75rem; }
	.minimap-legend h4 { margin: 0 0 0.5rem; font-size: 0.8rem; color: #94a3b8; }
	.legend-item { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem; color: #94a3b8; }
	.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.legend-coords { margin-top: 0.5rem; color: #475569; font-family: monospace; font-size: 0.7rem; }

	/* ─── Icons showcase ─── */
	.icons-showcase { display: flex; flex-direction: column; gap: 1.25rem; }
	.icons-group-title { font-size: 0.75rem; margin: 0 0 0.5rem; font-weight: 500; }
	.yorha-label { color: #c4b5fd; }
	.lucide-label { color: #7dd3fc; }
	.icons-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.icon-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 8px;
		transition: all 0.15s;
		cursor: default;
	}
	.icon-cell:hover {
		background: rgba(255,255,255,0.07);
		border-color: rgba(196,181,253,0.3);
		color: #c4b5fd;
	}

	/* ─── TypewriterPrompt demo ─── */
	.typewriter-hint { font-size: 0.7rem; color: #475569; margin: 0.5rem 0 0; font-style: italic; }

	/* ─── MarkdownSceneViewer demo ─── */
	.scene-action-log {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.5rem;
		padding: 0.35rem 0.6rem;
		background: rgba(110,231,183,0.08);
		border-radius: 6px;
		font-size: 0.75rem;
		color: #6ee7b7;
	}

	/* ─── AdaptiveRenderingEngine demo ─── */
	.engine-demo {
		max-width: 400px;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid rgba(255,255,255,0.08);
	}

	@media (max-width: 640px) {
		.card-grid { grid-template-columns: 1fr; }
		.kbd-grid { grid-template-columns: 1fr; }
		.minimap-demo { flex-direction: column; }
	}
</style>
