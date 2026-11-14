<!-- Courtroom Evidentiary Brief Modal — Fed. R. Evid. 902(11) Self-Authenticating Forensic Brief -->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		open?: boolean;
		docketNumber?: string;
		caseTitle?: string;
		courtName?: string;
		judgeName?: string;
		filedDate?: string;
		sha256Hash?: string;
		timestampAnchor?: string;
		corpusId?: string;
		sealLevel?: string;
		vlmModel?: string;
		docHash?: string;
		onClose?: () => void;
		onPrint?: () => void;
		onDownloadPdf?: () => void;
	}

	let {
		open = true,
		docketNumber = '1:26-CR-00892-RCL',
		caseTitle = 'STATE OF NEW YORK & UNITED STATES v. ARULIAN CORPORATION, and ALEXANDER VANCE',
		courtName = 'UNITED STATES DISTRICT COURT FOR THE DISTRICT OF COLUMBIA',
		judgeName = 'HON. ROYCE C. LAMBERTH',
		filedDate = 'OCTOBER 17, 2026',
		sha256Hash = '7f81a8c9e54d2b09a781fa781e920d31e8471e891b012c8a245d8f619e07d9e3',
		timestampAnchor = 'NIST ACTS',
		corpusId = 'LEX-ORNITH-88398',
		sealLevel = 'UNREDACTED / SEAL LEVEL IV',
		vlmModel = 'ORNITH 1.5 VLM',
		docHash = '4099-B74-CR',
		onClose,
		onPrint,
		onDownloadPdf
	}: Props = $props();

	let activeDockTab = $state<'3d_splat' | 'timeline' | 'document' | 'synthesizer'>('synthesizer');
	let isPrinting = $state(false);

	const shortSha = $derived(
		sha256Hash.length > 16
			? `${sha256Hash.slice(0, 7)}...${sha256Hash.slice(-4)}`
			: sha256Hash
	);

	function handlePrint() {
		isPrinting = true;
		onPrint?.();
		if (typeof window !== 'undefined') {
			window.print();
		}
		setTimeout(() => {
			isPrinting = false;
		}, 500);
	}

	function handleDownload() {
		onDownloadPdf?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose?.();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="brief-modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="brief-title"
	>
		<div class="brief-modal-container">
			<!-- Header Control Bar -->
			<header class="brief-header-bar">
				<div class="brief-badge-group">
					<span class="badge-icon" aria-hidden="true">⚖️</span>
					<span class="badge-vlm">{vlmModel} SYNTHESIS</span>
					<span class="badge-doc-hash">DOC-HASH: {docHash}</span>
					<h2 id="brief-title" class="badge-preview-title">PREVIEW: COURTROOM EVIDENTIARY BRIEF</h2>
				</div>
				<div class="brief-action-group">
					<button
						type="button"
						class="btn-brief-action"
						onclick={handlePrint}
						disabled={isPrinting}
						aria-label="Print Evidentiary Brief"
					>
						<span class="btn-icon">🖨️</span>
						<span>Print Brief</span>
					</button>
					<button
						type="button"
						class="btn-brief-primary"
						onclick={handleDownload}
						aria-label="Download Signed Courtroom PDF"
					>
						<span class="btn-icon">⬇️</span>
						<span>Download Signed PDF</span>
					</button>
					<button
						type="button"
						class="btn-brief-close"
						onclick={() => onClose?.()}
						aria-label="Close Preview"
					>
						✕
					</button>
				</div>
			</header>

			<!-- Self-Authenticating Chain Verification Banner (Fed. R. Evid. 902(11)) -->
			<div class="brief-auth-bar" role="region" aria-label="Rule 902(11) Authentication Metadata">
				<div class="auth-cert">
					<span class="auth-check">✓</span>
					<span class="auth-label">CERTIFIED UNDER FED. R. EVID. 902(11) // SELF-AUTHENTICATING RECORD</span>
				</div>
				<div class="auth-metrics">
					<span class="metric-item">
						<span class="metric-key">SHA-256:</span>
						<code class="metric-val" title={sha256Hash}>{shortSha}</code>
					</span>
					<span class="metric-item">
						<span class="metric-key">HARDWARE TIMESTAMP ANCHOR:</span>
						<span class="metric-val">{timestampAnchor}</span>
					</span>
				</div>
			</div>

			<!-- Evidentiary Document Body -->
			<div class="brief-document-scroll" tabindex="-1" role="region" aria-label="Courtroom Evidentiary Document">
				<article class="courtroom-document-paper">
					<!-- Legal Header -->
					<div class="court-caption-header">
						<p class="court-header-prefix">IN THE</p>
						<h1 class="court-name">{courtName}</h1>
						<div class="court-rule-divider"></div>
					</div>

					<!-- Docket Box / Caption Grid -->
					<div class="caption-grid">
						<div class="parties-col">
							<div class="party-block">
								<p class="party-names"><strong>STATE OF NEW YORK & UNITED STATES,</strong></p>
								<p class="party-role">Plaintiffs,</p>
								<p class="party-vs">v.</p>
								<p class="party-names"><strong>ARULIAN CORPORATION, and<br />ALEXANDER VANCE,</strong></p>
								<p class="party-role">Defendants.</p>
							</div>
						</div>
						<div class="docket-col">
							<div class="docket-meta-box">
								<div class="meta-row">
									<span class="meta-lbl">CASE NO.:</span>
									<span class="meta-txt font-mono">{docketNumber}</span>
								</div>
								<div class="meta-row">
									<span class="meta-lbl">FILED:</span>
									<span class="meta-txt">{filedDate}</span>
								</div>
								<div class="meta-row">
									<span class="meta-lbl">JUDGE:</span>
									<span class="meta-txt">{judgeName}</span>
								</div>
								<div class="meta-row">
									<span class="meta-lbl">CORPUS ID:</span>
									<span class="meta-txt font-mono">{corpusId}</span>
								</div>
								<div class="meta-row">
									<span class="meta-lbl">REDACTION:</span>
									<span class="meta-txt seal-warning">{sealLevel}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Document Title -->
					<div class="document-title-block">
						<h2 class="document-main-title">COMPREHENSIVE FORENSIC SYNTHESES & CONTRADICTION BRIEF</h2>
						<p class="document-subtitle">ADMISSIBILITY EVIDENTIARY SUBMISSION · {vlmModel} MULTIMODAL LEDGER ANALYSIS</p>
					</div>

					<!-- Section 1: Statutory Contradiction & Scienter Findings -->
					<section class="brief-section" aria-labelledby="sec-statutory-contradiction">
						<h3 id="sec-statutory-contradiction" class="section-title">
							<span class="section-num">§1</span>
							<span>STATUTORY CONTRADICTION & SCIENTER FINDINGS</span>
						</h3>
						<p class="brief-prose">
							Pursuant to the multi-modal evidence ingestion pipeline, Ornith 1.5 VLM has identified an
							irreconcilable factual divergence between sworn testimonial depositions given under oath and
							cryptographic hardware access records. These findings substantiate affirmative scienter under
							<strong>18 U.S.C. § 1001</strong> (False Statements) and indicate coordinated evasion in
							furtherance of wire fraud under <strong>18 U.S.C. § 1343</strong>. Statistical confidence across
							combined audio-video and sensor channels satisfies the threshold for self-authenticating
							electronic proof (<em>p &lt; 0.0001</em>; <strong>Bayesian Posterior: 99.84%</strong>).
						</p>
					</section>

					<!-- Section 2: Exhibit A Spatial Stills -->
					<section class="brief-section" aria-labelledby="sec-exhibit-a">
						<div class="section-header-row">
							<h3 id="sec-exhibit-a" class="section-title">
								<span class="section-num">§2</span>
								<span>EXHIBIT A: CCTV NODE 12 HIGH-RESOLUTION SPATIAL STILLS</span>
							</h3>
							<span class="vlm-metric-badge">VLM Precision Conf: 0.998</span>
						</div>

						<div class="exhibit-stills-grid">
							<!-- Spatial Still Frame 1 -->
							<div class="spatial-still-card" data-frame-index="104228">
								<div class="frame-tag-bar">
									<span class="frame-indicator">FRAME: 104,228</span>
									<span class="frame-timestamp">14:02:18.92 UTC</span>
								</div>
								<div class="frame-visual-container">
									<div class="still-fallback-art still-art-1">
										<div class="bounding-box box-1" aria-label="Detected Subject Bounding Box">
											<span class="bbox-label">SUBJECT: VANCE (P=0.994)</span>
										</div>
										<div class="bounding-box box-keycard" aria-label="Detected Keycard Bounding Box">
											<span class="bbox-label">ENCRYPTED RFID KEYCARD (MATCHES SERVER LOG #012)</span>
										</div>
									</div>
								</div>
								<p class="still-caption">
									Subject Vance detected initiating unauthorized badge scan at Node 12 North Corridor.
								</p>
							</div>

							<!-- Spatial Still Frame 2 -->
							<div class="spatial-still-card" data-frame-index="104390">
								<div class="frame-tag-bar">
									<span class="frame-indicator">FRAME: 104,390</span>
									<span class="frame-timestamp">14:02:44.17 UTC</span>
								</div>
								<div class="frame-visual-container">
									<div class="still-fallback-art still-art-2">
										<div class="bounding-box box-console" aria-label="Detected Terminal Console">
											<span class="bbox-label">TERMINAL SESSION ACTIVE · IP: 10.14.0.88</span>
										</div>
									</div>
								</div>
								<p class="still-caption">
									Physical terminal session initiated inside server vault 25.25 seconds after breach.
								</p>
							</div>
						</div>
					</section>
				</article>
			</div>

			<!-- Bottom Status & Dock Viewport -->
			<footer class="brief-footer-dock">
				<div class="sensor-readout-group">
					<span class="sensor-pill">
						<span class="dot-green"></span>
						<span>LiDAR Mesh 1.42 GB</span>
					</span>
					<span class="sensor-pill">
						<span class="dot-green"></span>
						<span>GNSS Accuracy ±1.4cm</span>
					</span>
				</div>

				<nav class="dock-viewport-nav" aria-label="Viewport Navigation">
					<span class="dock-nav-label">DOCK VIEWPORT:</span>
					<button
						type="button"
						class="dock-tab-btn"
						class:active={activeDockTab === '3d_splat'}
						onclick={() => (activeDockTab = '3d_splat')}
					>
						3D Splat View
					</button>
					<button
						type="button"
						class="dock-tab-btn"
						class:active={activeDockTab === 'timeline'}
						onclick={() => (activeDockTab = 'timeline')}
					>
						Evidence Timeline
					</button>
					<button
						type="button"
						class="dock-tab-btn"
						class:active={activeDockTab === 'document'}
						onclick={() => (activeDockTab = 'document')}
					>
						Document Review
					</button>
					<button
						type="button"
						class="dock-tab-btn"
						class:active={activeDockTab === 'synthesizer'}
						onclick={() => (activeDockTab = 'synthesizer')}
					>
						AI Synthesizer
					</button>
				</nav>

				<div class="dock-hardware-group">
					<span class="hardware-pill font-mono">⚙ RTX Tensor 92%</span>
					<button type="button" class="btn-dock-export" onclick={handleDownload}>
						<span>Export Brief</span>
					</button>
				</div>
			</footer>
		</div>
	</div>
{/if}

<style>
	.brief-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(10, 15, 20, 0.88);
		backdrop-filter: blur(8px);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		box-sizing: border-box;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.brief-modal-container {
		width: 100%;
		max-width: 1100px;
		height: 94vh;
		display: flex;
		flex-direction: column;
		background: #0f141c;
		border: 1px solid #233044;
		border-radius: 8px;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
		overflow: hidden;
	}

	/* Header bar */
	.brief-header-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		background: #475525;
		color: #f1f5f9;
		border-bottom: 1px solid #5a6d32;
	}

	.brief-badge-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.badge-vlm {
		background: #2f3a18;
		color: #e2f18e;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.badge-doc-hash {
		color: #cfdb9e;
		font-size: 0.75rem;
		font-family: monospace;
	}

	.badge-preview-title {
		font-size: 0.92rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin: 0;
		color: #ffffff;
	}

	.brief-action-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-brief-action {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: #2b3517;
		color: #e2e8f0;
		border: 1px solid #4a5c27;
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.btn-brief-action:hover {
		background: #39471f;
	}

	.btn-brief-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: #1e3a8a;
		color: #ffffff;
		border: 1px solid #3b82f6;
		padding: 0.35rem 0.85rem;
		font-size: 0.8rem;
		font-weight: 600;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.btn-brief-primary:hover {
		background: #2563eb;
	}

	.btn-brief-close {
		background: transparent;
		color: #cfdb9e;
		border: none;
		font-size: 1.1rem;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		margin-left: 0.5rem;
	}
	.btn-brief-close:hover {
		color: #ffffff;
	}

	/* Authentication bar */
	.brief-auth-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1.25rem;
		background: #141b24;
		border-bottom: 1px solid #1e293b;
		font-size: 0.75rem;
		color: #94a3b8;
	}

	.auth-cert {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: #60a5fa;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.auth-check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid #60a5fa;
		font-size: 0.65rem;
	}

	.auth-metrics {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.metric-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.metric-key {
		color: #64748b;
	}
	.metric-val {
		color: #cbd5e1;
		font-weight: 500;
	}

	/* Scroll container */
	.brief-document-scroll {
		flex: 1;
		overflow-y: auto;
		background: #0d1218;
		padding: 2rem;
		display: flex;
		justify-content: center;
	}

	/* Legal Document Paper */
	.courtroom-document-paper {
		width: 100%;
		max-width: 860px;
		background: #ffffff;
		color: #1e293b;
		padding: 3rem 3.5rem;
		box-sizing: border-box;
		border-radius: 4px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
		font-family: 'Times New Roman', Times, serif;
	}

	.court-caption-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.court-header-prefix {
		font-size: 0.85rem;
		letter-spacing: 0.15em;
		font-family: Arial, sans-serif;
		color: #475569;
		margin: 0 0 0.25rem 0;
	}

	.court-name {
		font-size: 1.2rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		margin: 0 0 1rem 0;
	}

	.court-rule-divider {
		width: 180px;
		height: 1px;
		background: #334155;
		margin: 0 auto;
	}

	.caption-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-bottom: 2rem;
		font-family: Arial, sans-serif;
		font-size: 0.85rem;
	}

	.party-names {
		margin: 0;
		line-height: 1.4;
	}
	.party-role {
		margin: 0.2rem 0 0.8rem 1rem;
		font-style: italic;
		color: #475569;
	}
	.party-vs {
		margin: 0.4rem 0 0.4rem 0.5rem;
		font-style: italic;
	}

	.docket-meta-box {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.meta-lbl {
		color: #475569;
		font-weight: 600;
	}

	.seal-warning {
		color: #b91c1c;
		font-weight: 700;
	}

	.document-title-block {
		text-align: center;
		border-top: 2px solid #0f172a;
		border-bottom: 1px solid #cbd5e1;
		padding: 1.25rem 0;
		margin-bottom: 2rem;
	}

	.document-main-title {
		font-size: 1.05rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		margin: 0 0 0.4rem 0;
		font-family: Arial, sans-serif;
	}

	.document-subtitle {
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		color: #475569;
		margin: 0;
		font-family: Arial, sans-serif;
	}

	/* Brief Sections */
	.brief-section {
		margin-bottom: 2rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		font-weight: 700;
		margin: 0 0 0.75rem 0;
		font-family: Arial, sans-serif;
	}

	.section-num {
		background: #475525;
		color: #ffffff;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		font-size: 0.8rem;
	}

	.section-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.vlm-metric-badge {
		font-size: 0.75rem;
		font-family: Arial, sans-serif;
		color: #1e3a8a;
		background: #dbeafe;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-weight: 600;
	}

	.brief-prose {
		font-size: 0.9rem;
		line-height: 1.6;
		margin: 0;
		text-align: justify;
	}

	/* Exhibit Stills Grid */
	.exhibit-stills-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.spatial-still-card {
		background: #0b1118;
		border: 1px solid #1e293b;
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.frame-tag-bar {
		display: flex;
		justify-content: space-between;
		padding: 0.35rem 0.65rem;
		background: #16202c;
		color: #94a3b8;
		font-size: 0.7rem;
		font-family: monospace;
	}

	.frame-visual-container {
		height: 140px;
		position: relative;
		overflow: hidden;
		background: #020617;
	}

	.still-fallback-art {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.still-art-1 {
		background: radial-gradient(circle at 45% 45%, #1e293b 0%, #020617 80%);
	}

	.still-art-2 {
		background: radial-gradient(circle at 60% 50%, #0f233a 0%, #020617 80%);
	}

	.bounding-box {
		position: absolute;
		border: 2px solid #22c55e;
		border-radius: 2px;
		background: rgba(34, 197, 94, 0.1);
	}

	.box-1 {
		top: 20%;
		left: 30%;
		width: 35%;
		height: 60%;
	}

	.box-keycard {
		top: 55%;
		left: 45%;
		width: 18%;
		height: 20%;
		border-color: #38bdf8;
		background: rgba(56, 189, 248, 0.15);
	}

	.box-console {
		top: 25%;
		left: 20%;
		width: 55%;
		height: 50%;
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.12);
	}

	.bbox-label {
		position: absolute;
		top: -16px;
		left: -2px;
		background: #0f172a;
		color: #4ade80;
		font-size: 0.55rem;
		font-family: monospace;
		padding: 0.1rem 0.25rem;
		border-radius: 2px;
		white-space: nowrap;
	}

	.box-keycard .bbox-label {
		color: #38bdf8;
	}

	.box-console .bbox-label {
		color: #fbbf24;
	}

	.still-caption {
		padding: 0.5rem 0.65rem;
		font-size: 0.72rem;
		color: #94a3b8;
		margin: 0;
		font-family: Arial, sans-serif;
		background: #0f172a;
	}

	/* Footer dock */
	.brief-footer-dock {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1.25rem;
		background: #c8e66a;
		color: #1a2e05;
		font-size: 0.78rem;
		border-top: 1px solid #a3c442;
	}

	.sensor-readout-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sensor-pill {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 600;
	}

	.dot-green {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #15803d;
	}

	.dock-viewport-nav {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.dock-nav-label {
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		margin-right: 0.25rem;
	}

	.dock-tab-btn {
		background: rgba(255, 255, 255, 0.4);
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 4px;
		padding: 0.25rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #1a2e05;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.dock-tab-btn:hover {
		background: rgba(255, 255, 255, 0.7);
	}
	.dock-tab-btn.active {
		background: #ffffff;
		border-color: #1a2e05;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
	}

	.dock-hardware-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.hardware-pill {
		font-size: 0.75rem;
		font-weight: 700;
		background: rgba(0, 0, 0, 0.1);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.btn-dock-export {
		background: #1a2e05;
		color: #ffffff;
		border: none;
		border-radius: 4px;
		padding: 0.3rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-dock-export:hover {
		background: #274508;
	}

	@media print {
		.brief-modal-backdrop {
			position: static;
			background: none;
			padding: 0;
		}
		.brief-header-bar,
		.brief-auth-bar,
		.brief-footer-dock {
			display: none;
		}
		.brief-document-scroll {
			padding: 0;
			overflow: visible;
		}
		.courtroom-document-paper {
			box-shadow: none;
			padding: 0;
			max-width: 100%;
		}
	}
</style>
