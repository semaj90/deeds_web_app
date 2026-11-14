<!--
  ExpandedEvidenceViewer.svelte
  Bits UI v2 Dialog & Tabs expandable modal for multi-modal evidence inspection.
  Supports legal documents, CCTV/video frame scrubbing, 24-bit audio waveforms,
  and 3D LiDAR Gaussian splats with chain-of-custody cryptographic verification.
-->
<script lang="ts">
	import { Dialog, Tabs, ScrollArea } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { EvidenceItem } from './evidence-types.js';

	interface Props {
		open?: boolean;
		exhibit?: EvidenceItem | null;
		theme?: 'light' | 'dark';
		onClose?: () => void;
		onPinToCanvas?: (item: EvidenceItem) => void;
		onImpeach?: (item: EvidenceItem) => void;
		onOpenVideoModal?: (evidenceId: string) => void;
	}

	let {
		open = $bindable(false),
		exhibit = null,
		theme = 'light',
		onClose,
		onPinToCanvas,
		onImpeach,
		onOpenVideoModal
	}: Props = $props();

	let activeTab = $state<'preview' | 'ocr' | 'chain' | 'statutes'>('preview');
	let docZoom = $state(100);
	let isPlaying = $state(false);
	let showBiometricBox = $state(true);
	let hashCopied = $state(false);
	let isPinned = $state(false);

	function handleClose() {
		open = false;
		onClose?.();
	}

	async function copyHash() {
		if (!exhibit?.sha256) return;
		const text = exhibit.sha256;
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				await navigator.clipboard.writeText(text);
				hashCopied = true;
			} else {
				throw new Error('Clipboard API unavailable');
			}
		} catch (_err) {
			// Zero-permission fallback for headless Chromium / ungranted clipboard permissions
			try {
				const textArea = document.createElement('textarea');
				textArea.value = text;
				textArea.style.position = 'fixed';
				textArea.style.left = '-9999px';
				textArea.style.top = '0';
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				const successful = document.execCommand('copy');
				document.body.removeChild(textArea);
				hashCopied = successful;
			} catch (_fallbackErr) {
				hashCopied = false;
			}
		}
		setTimeout(() => { hashCopied = false; }, 2000);
	}

	function handlePin() {
		if (!exhibit) return;
		isPinned = true;
		onPinToCanvas?.(exhibit);
		setTimeout(() => { isPinned = false; }, 1800);
	}

	function handleImpeachClick() {
		if (!exhibit) return;
		onImpeach?.(exhibit);
	}

	function zoomIn() { docZoom = Math.min(200, docZoom + 20); }
	function zoomOut() { docZoom = Math.max(60, docZoom - 20); }
	function zoomReset() { docZoom = 100; }
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) handleClose(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="eev-overlay {theme === 'light' ? 'light-overlay' : 'dark-overlay'}" />
		<Dialog.Content class="eev-modal-content {theme === 'light' ? 'light-modal' : 'dark-modal'}" data-testid="expanded-evidence-viewer">
			<!-- YoRHa Tactical Corner Notches -->
			<div class="hud-notch-tl" aria-hidden="true"></div>
			<div class="hud-notch-tr" aria-hidden="true"></div>
			<div class="hud-notch-bl" aria-hidden="true"></div>
			<div class="hud-notch-br" aria-hidden="true"></div>

			<!-- Top Accent Line -->
			<div class="eev-accent-line"></div>

			{#if exhibit}
				<!-- Header Bar -->
				<div class="eev-header">
					<div class="eev-header-left">
						<span class="eev-badge-pill {exhibit.badgeColor || 'default'}">{exhibit.exhibitNumber}</span>
						<Dialog.Title class="eev-title">{exhibit.title}</Dialog.Title>
						<span class="eev-type-tag">{exhibit.categoryBadge}</span>
						<span class="eev-status-pill">
							<span class="status-dot" class:dot-green={exhibit.chainOfCustody?.admissibilityStatus === 'AUTHENTICATED'}></span>
							{exhibit.chainOfCustody?.admissibilityStatus || 'LOCAL PREVIEW'}
						</span>
					</div>
					<div class="eev-header-right">
						<button
							type="button"
							class="eev-action-btn {hashCopied ? 'copied' : ''}"
							onclick={copyHash}
							title="Copy verified SHA-256 digest"
							data-testid="copy-hash-btn"
							data-testid-sha256="copy-sha256-btn"
						>
							<Icon name="shield-check" size={13} />
							<span>{hashCopied ? 'COPIED!' : 'COPY SHA-256'}</span>
						</button>

						<button
							type="button"
							class="eev-action-btn pin-btn {isPinned ? 'pinned' : ''}"
							onclick={handlePin}
							title="Pin this exhibit to Evidence Canvas"
							data-testid="pin-canvas-btn"
						>
							<Icon name="plus-circle" size={13} />
							<span>{isPinned ? 'PINNED!' : 'PIN TO CANVAS'}</span>
						</button>

						<Dialog.Close class="eev-close-btn" onclick={handleClose} aria-label="Close viewer" data-testid="close-viewer-btn">
							<Icon name="x" size={16} />
						</Dialog.Close>
					</div>
				</div>

				<!-- Navigation Tabs (Bits UI v2 Tabs) -->
				<Tabs.Root value={activeTab} onValueChange={(v) => { activeTab = v as any; }} class="eev-tabs-root">
					<Tabs.List class="eev-tabs-list">
						<Tabs.Trigger value="preview" class="eev-tab-trigger">
							<Icon name="eye" size={13} />
							<span>FORENSIC PREVIEW</span>
						</Tabs.Trigger>
						<Tabs.Trigger value="ocr" class="eev-tab-trigger">
							<Icon name="file-text" size={13} />
							<span>OCR & NLP STREAM</span>
						</Tabs.Trigger>
						<Tabs.Trigger value="chain" class="eev-tab-trigger">
							<Icon name="database" size={13} />
							<span>CHAIN OF CUSTODY</span>
						</Tabs.Trigger>
						<Tabs.Trigger value="statutes" class="eev-tab-trigger">
							<Icon name="scale" size={13} />
							<span>STATUTES & IMPEACHMENT</span>
						</Tabs.Trigger>
					</Tabs.List>

					<!-- Tab 1: Forensic Preview -->
					<Tabs.Content value="preview" class="eev-tab-content">
						<div class="eev-preview-layout">
							<!-- Main Media/Document Stage -->
							<div class="eev-media-stage">
								{#if exhibit.previewUrl && /^image\/(png|jpeg|webp|gif)$/i.test(exhibit.mimeType)}
									<div class="asset-preview-stage"><img src={exhibit.previewUrl} alt={`Preview of ${exhibit.title}`} loading="lazy" /></div>
								{:else if exhibit.previewUrl && exhibit.mimeType === 'application/pdf'}
									<div class="asset-preview-stage"><iframe src={exhibit.previewUrl} title={`PDF preview: ${exhibit.title}`} loading="lazy"></iframe></div>
								{:else if exhibit.previewUrl && exhibit.mimeType.startsWith('video/')}
									<div class="asset-preview-stage"><video controls preload="metadata" src={exhibit.previewUrl}><track kind="captions" />Video preview unavailable.</video></div>
								{:else if exhibit.previewUrl && exhibit.mimeType.startsWith('audio/')}
									<div class="asset-preview-stage audio-preview-stage"><audio controls preload="metadata" src={exhibit.previewUrl}>Audio preview unavailable.</audio></div>
								{:else if exhibit.previewUrl}
									<div class="asset-preview-stage unsupported-preview">
										<p>Preview is not available for this file type.</p>
										<a href={exhibit.previewUrl} target="_blank" rel="noopener noreferrer">Open original file</a>
									</div>
								{:else if exhibit.type === 'document'}
									<!-- Document / PDF Inspection Stage -->
									<div class="doc-viewer-container">
										<div class="doc-controls-bar">
											<div class="dcb-left">
												<span class="doc-page-info">PAGE 1 OF {exhibit.metrics?.pages || 4}</span>
												<span class="fre-rule-tag">FRE 1002 (BEST EVIDENCE)</span>
											</div>
											<div class="dcb-right">
												<button class="zoom-btn" onclick={zoomOut} title="Zoom Out">-</button>
												<span class="zoom-level">{docZoom}%</span>
												<button class="zoom-btn" onclick={zoomIn} title="Zoom In">+</button>
												<button class="zoom-btn" onclick={zoomReset} title="Reset Zoom">FIT</button>
											</div>
										</div>
										<ScrollArea.Root type="hover" class="doc-scroll-root">
											<ScrollArea.Viewport class="doc-scroll-viewport">
												<div class="legal-doc-page" style="transform: scale({docZoom / 100}); transform-origin: top center;">
												<h3 class="doc-page-heading">{exhibit.title}</h3>
												{#if exhibit.extractedText}
													<pre class="clause-text">{exhibit.extractedText}</pre>
												{:else}
													<p class="preview-empty">No extracted text is available for this file yet.</p>
												{/if}
												</div>
											</ScrollArea.Viewport>
										</ScrollArea.Root>
									</div>

								{:else if exhibit.type === 'video' || exhibit.type === 'cctv'}
									<!-- CCTV / Video High-Definition Stage -->
									<div class="video-viewer-container">
										<div class="cctv-screen">
											<div class="cctv-hud-header">
												<span>REC ● 02:14:09.124 UTC</span>
												<span>{exhibit.sourceRef || 'CAM-SUB54B-CORRIDOR-NODE12'}</span>
												<span>60 FPS RAW H.265</span>
											</div>
											<!-- Simulated Video Still with Biometric Bounding Box -->
											<div class="video-frame-display">
												<div class="corridor-backdrop">
													{#if showBiometricBox}
														<div class="facial-bbox">
															<span class="bbox-label">A. VANCE (99.1% MATCH)</span>
															<div class="bbox-reticle"></div>
															<span class="bbox-coords">X: 412, Y: 184 [CONF: 0.991]</span>
														</div>
													{/if}
													<div class="terminal-door-indicator">DOOR 4-B // ACCESS OVERRIDE</div>
												</div>
											</div>
											<div class="cctv-playback-controls">
												<button class="cctv-btn" onclick={() => { isPlaying = !isPlaying; }}>
													<Icon name={isPlaying ? 'pause' : 'play'} size={14} />
													<span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
												</button>
												<button class="cctv-btn" onclick={() => { showBiometricBox = !showBiometricBox; }}>
													<Icon name="user-check" size={13} />
													<span>{showBiometricBox ? 'HIDE BIOMETRIC' : 'SHOW BIOMETRIC'}</span>
												</button>
												<button class="cctv-btn video-modal-launch-btn" onclick={() => { open = false; onOpenVideoModal?.(exhibit.id); }}>
													<Icon name="film" size={13} />
													<span>KEYFRAME MODAL</span>
												</button>
												<span class="cctv-timecode">TIMECODE: 02:14:09 / 04:12</span>
												<span class="cctv-format">HARDWARE SIG: ARULIAN-HIK-SEC-9</span>
											</div>
										</div>
									</div>

								{:else if exhibit.type === 'audio'}
									<!-- 24-Bit Audio Waveform Stage -->
									<div class="audio-viewer-container">
										<div class="audio-hud-box">
											<div class="audio-hud-header">
												<span class="ah-badge">INTERCEPT // FLAC 24-BIT 48KHZ</span>
												<span class="ah-source">{exhibit.sourceRef || 'CELL-TOWER-48B'}</span>
											</div>
											<div class="waveform-graphic">
												{#each Array(36) as _, i}
													{@const height = [18, 28, 42, 60, 34, 16, 52, 78, 92, 45, 30, 68, 84, 50, 24, 70, 88, 38, 20, 56, 74, 96, 62, 30, 48, 80, 54, 22, 66, 82, 44, 26, 58, 76, 36, 14][i % 36]}
													<span class="wave-col" style="height: {height}%;"></span>
												{/each}
											</div>
											<div class="audio-controls-row">
												<button class="audio-play-btn" onclick={() => { isPlaying = !isPlaying; }}>
													<Icon name={isPlaying ? 'pause' : 'play'} size={15} />
													<span>{isPlaying ? 'PAUSE INTERCEPT' : 'PLAY INTERCEPT'}</span>
												</button>
												<div class="audio-scrub-track">
													<div class="audio-progress-bar" style="width: 48%;"></div>
												</div>
												<span class="audio-time">00:36 / 01:14</span>
											</div>
											<!-- Synchronized Transcript -->
											<div class="audio-transcript-box">
												<div class="at-line">
													<span class="spk-tag vance">[02:14:38] SPEAKER 1 (A. Vance):</span>
													<span class="spk-text">"Are we alone on the channel?"</span>
												</div>
												<div class="at-line">
													<span class="spk-tag op">[02:14:40] SPEAKER 2 (Operator):</span>
													<span class="spk-text">"Switchboard 4-B link active, sir."</span>
												</div>
												<div class="at-line alert-line">
													<span class="spk-tag vance">[02:14:42] SPEAKER 1 (A. Vance):</span>
													<span class="spk-text highlight">"Release the token now. Override the audit daemon before the board logs in."</span>
												</div>
											</div>
										</div>
									</div>

								{:else if exhibit.type === 'splat'}
									<!-- 3D LiDAR Splat Inspector -->
									<div class="splat-viewer-container">
										<div class="splat-hud-card">
											<div class="splat-hud-header">
												<span>3D GAUSSIAN VOLUMETRIC SCAN // SPZ v4</span>
												<span class="sh-stat">29/29 SPLATS READY</span>
											</div>
											<div class="splat-graphic-box">
												<div class="wireframe-bounding-cube">
													<div class="cube-point p1"></div>
													<div class="cube-point p2"></div>
													<div class="cube-point p3"></div>
													<div class="cube-point p4"></div>
													<span class="ray-intersect-label">RAY INTERSECT: 99.4%</span>
												</div>
											</div>
											<div class="splat-metrics-grid">
												<div class="sm-card">
													<span class="sm-label">POINT DENSITY</span>
													<span class="sm-value cyan">{exhibit.metrics?.splatPoints || '1.48M'} Splats</span>
												</div>
												<div class="sm-card">
													<span class="sm-label">SIMD RMS CALIPER</span>
													<span class="sm-value green">{exhibit.metrics?.caliperRms || '0.003mm'}</span>
												</div>
												<div class="sm-card">
													<span class="sm-label">EMBEDDING ALIGNMENT</span>
													<span class="sm-value">{exhibit.metrics?.vectorSimilarity || '0.9942'}</span>
												</div>
												<div class="sm-card">
													<span class="sm-label">ORIGIN [X, Y, Z]</span>
													<span class="sm-value monospace">[+41.213, 0.030, -2.107]</span>
												</div>
											</div>
										</div>
									</div>

								{:else}
									<!-- Forensic / Biometric Fallback -->
									<div class="generic-viewer-container">
										<div class="forensic-card">
											<h4>FORENSIC PROFILE & GENOTYPING MATRIX</h4>
											<p class="fc-summary">{exhibit.summary}</p>
											<div class="fc-table">
												<div class="fc-row header">
													<span>LOCUS</span><span>ALLELE 1</span><span>ALLELE 2</span><span>FREQUENCY</span>
												</div>
												<div class="fc-row"><span>D3S1358</span><span>15</span><span>18</span><span>0.014</span></div>
												<div class="fc-row"><span>vWA</span><span>16</span><span>19</span><span>0.008</span></div>
												<div class="fc-row"><span>FGA</span><span>21</span><span>24</span><span>0.002</span></div>
												<div class="fc-row"><span>D8S1179</span><span>12</span><span>14</span><span>0.011</span></div>
											</div>
											<span class="fc-match-stat">RANDOM MATCH PROBABILITY: 1 IN 4.8 TRILLION</span>
										</div>
									</div>
								{/if}
							</div>

							<!-- Right Side Telemetry & Evidence Inspector -->
							<div class="eev-sidebar">
								<!-- Card 1: Statutory Summary -->
								<div class="sidebar-box">
									<h4 class="sb-title">
										<Icon name="shield-alert" size={13} />
										STATUTORY ANCHORS
									</h4>
									{#if exhibit.statutes && exhibit.statutes.length > 0}
										<div class="statute-list">
											{#each exhibit.statutes as stat}
												<span class="stat-badge">{stat}</span>
											{/each}
										</div>
									{:else}
										<span class="no-data">No statutory violations linked.</span>
									{/if}
								</div>

								<!-- Card 2: Summary -->
								<div class="sidebar-box">
									<h4 class="sb-title">
										<Icon name="info" size={13} />
										FORENSIC SUMMARY
									</h4>
									<p class="sb-text">{exhibit.summary}</p>
								</div>

								<!-- Card 3: Storage & Database Fabric -->
								<div class="sidebar-box">
									<h4 class="sb-title">
										<Icon name="database" size={13} />
										DATABASE LINCHPIN
									</h4>
									<div class="db-meta-grid">
										<span class="db-lbl">PGVECTOR TABLE:</span>
										<span class="db-val">{exhibit.chainOfCustody?.pgvectorIndexId || 'Not indexed'}</span>
										<span class="db-lbl">INDEX BINDING:</span>
										<span class="db-val">{exhibit.chainOfCustody?.pgvectorIndexId || 'Not linked'}</span>
										<span class="db-lbl">VECTOR DIMENSION:</span>
										<span class="db-val">{exhibit.chainOfCustody?.pgvectorIndexId ? '768-D dense' : 'Not available'}</span>
										<span class="db-lbl">STORAGE BUCKET:</span>
										<span class="db-val mono">{exhibit.chainOfCustody?.storageBucket || 'Private evidence storage'}</span>
										<span class="db-lbl">FILE SIZE:</span>
										<span class="db-val">{exhibit.fileSize || 'N/A'}</span>
									</div>
								</div>

								<!-- Card 4: Action Dispatch -->
								<div class="sidebar-box actions-box">
									<h4 class="sb-title">
										<Icon name="zap" size={13} />
										TACTICAL ACTIONS
									</h4>
									<button
										type="button"
										class="action-pill-btn impeach-btn"
										onclick={handleImpeachClick}
										data-testid="impeach-btn"
									>
										<Icon name="crosshair" size={13} />
										<span>Prepare Impeachment (FRE 613)</span>
									</button>
								</div>
							</div>
						</div>
					</Tabs.Content>

					<!-- Tab 2: OCR & NLP Stream -->
					<Tabs.Content value="ocr" class="eev-tab-content">
						<div class="ocr-tab-container">
							<div class="ocr-header-strip">
									<span>EXTRACTED TEXT</span>
									<span class="ocr-conf">{exhibit.confidence != null ? `CONFIDENCE: ${exhibit.confidence}%` : 'NOT SCORED'}</span>
							</div>
							<ScrollArea.Root type="hover" class="ocr-scroll-root">
								<ScrollArea.Viewport class="ocr-scroll-viewport">
										<pre class="ocr-text-block">{exhibit.extractedText || 'No extracted text is available for this file yet.'}</pre>
								</ScrollArea.Viewport>
							</ScrollArea.Root>
						</div>
					</Tabs.Content>

					<!-- Tab 3: Chain of Custody -->
					<Tabs.Content value="chain" class="eev-tab-content">
						<div class="chain-tab-container">
							<div class="chain-timeline">
								<div class="chain-step">
									<div class="step-dot green"></div>
									<div class="step-content">
										<span class="step-time">{exhibit.timestamp || 'Time not recorded'}</span>
										<span class="step-action">EVIDENCE RECORD</span>
										<span class="step-agent">Source: {exhibit.sourceRef || 'Not provided'}</span>
									</div>
								</div>
								<div class="chain-step">
									<div class="step-dot blue"></div>
									<div class="step-content">
										<span class="step-time">{exhibit.chainOfCustody?.recordedAt || 'No custody receipt linked'}</span>
										<span class="step-action">INGESTION RECORD</span>
										<span class="step-agent">Intake officer: {exhibit.chainOfCustody?.intakeOfficer || 'Not recorded'}</span>
										{#if exhibit.sha256}<span class="step-hash">SHA-256: <code>{exhibit.sha256}</code></span>{/if}
									</div>
								</div>
							</div>
						</div>
					</Tabs.Content>

					<!-- Tab 4: Statutes & Impeachment Strategy -->
					<Tabs.Content value="statutes" class="eev-tab-content">
						<div class="statutes-tab-container">
							<div class="strategy-card">
								<h4>ORAL DEPOSITION CROSS-EXAMINATION STRATEGY</h4>
								<p class="sc-desc">
									Cross-reference Subject Vance's sworn denial of physical presence with CCTV Node 12 biometric match and Terminal 4-B SSH logs.
								</p>
								<div class="sc-questions">
									<div class="q-row">
										<span class="q-num">Q1.</span>
										<p class="q-text">"Mr. Vance, you stated under oath on page 42 that you remained in the executive suite at 500 Arulian Way. How then do you explain your biometric profile being authenticated at Sub-station Door 4-B at 02:14:09?"</p>
									</div>
									<div class="q-row">
										<span class="q-num">Q2.</span>
										<p class="q-text">"Isn't it true that Exhibit E-003 bears your personal PGP signature 0x9BF24A10C883 authorizing wire transfers to Cayman LLC at the exact time you claimed to be offline?"</p>
									</div>
								</div>
							</div>
						</div>
					</Tabs.Content>
				</Tabs.Root>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.eev-overlay) {
		position: fixed;
		inset: 0;
		z-index: 9998;
		backdrop-filter: blur(6px);
		transition: opacity 0.2s ease;
	}

	:global(.eev-overlay.dark-overlay) {
		background: rgba(0, 0, 0, 0.78);
	}

	:global(.eev-overlay.light-overlay) {
		background: rgba(15, 23, 42, 0.45);
	}

	:global(.eev-modal-content) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 90vw;
		max-width: 1040px;
		height: 85vh;
		max-height: 720px;
		border-radius: 8px;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 25px 60px rgba(0, 0, 0, 0.65);
		outline: none;
	}

	:global(.eev-modal-content.dark-modal) {
		background: #090d14;
		border: 1px solid rgba(56, 189, 248, 0.25);
		color: #e2e8f0;
	}

	:global(.eev-modal-content.light-modal) {
		background: #f8f4eb;
		border: 1px solid #d8cbb7;
		color: #29231e;
	}

	/* Top Accent Line */
	.eev-accent-line {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(90deg, #574638 0%, #b89442 54%, #d8cbb7 100%);
	}

	/* Tactical Corner Notches */
	.hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
		position: absolute;
		width: 8px;
		height: 8px;
		pointer-events: none;
		z-index: 10;
	}
	.hud-notch-tl { top: 0; left: 0; border-top: 2px solid #b89442; border-left: 2px solid #b89442; }
	.hud-notch-tr { top: 0; right: 0; border-top: 2px solid #b89442; border-right: 2px solid #b89442; }
	.hud-notch-bl { bottom: 0; left: 0; border-bottom: 2px solid #b89442; border-left: 2px solid #b89442; }
	.hud-notch-br { bottom: 0; right: 0; border-bottom: 2px solid #b89442; border-right: 2px solid #b89442; }

	/* Header */
	.eev-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
	}

	:global(.light-modal) .eev-header {
		border-bottom-color: #e2e8f0;
		background: #f8fafc;
	}

	.eev-header-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.eev-badge-pill {
		font-size: 10px;
		font-family: monospace;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 3px;
	}

	.eev-badge-pill.blue { background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
	.eev-badge-pill.red { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
	.eev-badge-pill.purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
	.eev-badge-pill.amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
	.eev-badge-pill.cyan { background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
	.eev-badge-pill.default { background: rgba(148, 163, 184, 0.2); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); }

	:global(.eev-title) {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.02em;
		margin: 0;
	}

	.eev-type-tag {
		font-size: 9px;
		font-family: monospace;
		padding: 2px 5px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.05);
		color: #94a3b8;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.eev-status-pill {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 9px;
		font-family: monospace;
		font-weight: 600;
		color: #10b981;
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.25);
		padding: 1px 6px;
		border-radius: 10px;
	}

	.dot-green {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #10b981;
	}

	.eev-header-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.eev-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-family: monospace;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(30, 41, 59, 0.5);
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	:global(.light-modal) .eev-action-btn {
		background: #ffffff;
		border-color: #cbd5e1;
		color: #475569;
	}

	.eev-action-btn:hover {
		color: #38bdf8;
		border-color: #38bdf8;
		background: rgba(14, 165, 233, 0.1);
	}

	.eev-action-btn.copied {
		background: #10b981;
		color: #ffffff;
		border-color: #10b981;
	}

	.eev-action-btn.pin-btn.pinned {
		background: #0284c7;
		color: #ffffff;
		border-color: #0284c7;
	}

	.eev-close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: none;
		border: none;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
		border-radius: 4px;
		transition: opacity 0.15s ease;
	}

	.eev-close-btn:hover {
		opacity: 1;
		color: #f87171;
	}

	/* Tabs */
	:global(.eev-tabs-root) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	:global(.eev-tabs-list) {
		display: flex;
		gap: 2px;
		padding: 0 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(15, 22, 34, 0.4);
		flex-shrink: 0;
	}

	:global(.light-modal .eev-tabs-list) {
		background: #f1f5f9;
		border-bottom-color: #e2e8f0;
	}

	:global(.eev-tab-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-family: monospace;
		font-weight: 600;
		padding: 8px 12px;
		border-bottom: 2px solid transparent;
		background: none;
		border-top: none;
		border-left: none;
		border-right: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	:global(.light-modal .eev-tab-trigger) {
		color: #64748b;
	}

	:global(.eev-tab-trigger:hover) {
		color: #38bdf8;
	}

	:global(.eev-tab-trigger[data-state='active']) {
		color: #38bdf8;
		border-bottom-color: #38bdf8;
	}

	:global(.light-modal .eev-tab-trigger[data-state='active']) {
		color: #75591e;
		border-bottom-color: #b89442;
	}

	:global(.eev-tab-content) {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Layout inside preview tab */
	.eev-preview-layout {
		display: grid;
		grid-template-columns: 1fr 310px;
		height: 100%;
		overflow: hidden;
	}

	.asset-preview-stage {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		padding: 18px;
		background: #eee7da;
		border: 1px solid #e4d8c7;
		border-radius: 8px;
		margin: 14px;
		overflow: hidden;
	}
	.asset-preview-stage img,
	.asset-preview-stage video {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 4px;
		box-shadow: 0 8px 24px rgba(41, 35, 30, 0.14);
	}
	.asset-preview-stage iframe {
		width: 100%;
		height: 100%;
		min-height: 340px;
		border: 1px solid #d8cbb7;
		border-radius: 4px;
		background: #fff;
	}
	.audio-preview-stage audio { width: min(560px, 100%); }
	.unsupported-preview { align-content: center; gap: 12px; color: #574638; }
	.unsupported-preview a { color: #75591e; text-decoration: underline; text-underline-offset: 3px; }
	.preview-empty { padding: 28px; color: #74685c; }
	.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #a78b70; }

	.eev-media-stage {
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.2);
	}

	:global(.light-modal) .eev-media-stage {
		border-right-color: #e4d8c7;
		background: #fbf8f2;
	}

	.eev-sidebar {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		overflow-y: auto;
		background: rgba(10, 15, 24, 0.4);
	}

	:global(.light-modal) .eev-sidebar {
		background: #f8f4eb;
	}

	:global(.light-modal) .eev-header,
	:global(.light-modal) .eev-tabs-list,
	:global(.light-modal) .sidebar-box,
	:global(.light-modal) .doc-controls-bar,
	:global(.light-modal) .ocr-header-strip,
	:global(.light-modal) .chain-step { border-color: #e4d8c7; }
	:global(.light-modal) .eev-header { background: #f8f4eb; }
	:global(.light-modal) .eev-tabs-list { background: #f2eadf; }
	:global(.light-modal) .eev-tab-trigger:hover { color: #75591e; }
	:global(.light-modal) .eev-action-btn:hover { color: #574638; border-color: #b89442; background: #f4ecd9; }
	:global(.light-modal) .eev-status-pill { color: #386b54; background: #edf4ec; border-color: #c9dbc7; }
	:global(.light-modal) .sidebar-box { background: #fffdf9; }

	.sidebar-box {
		background: rgba(17, 24, 39, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 6px;
		padding: 10px;
	}

	:global(.light-modal) .sidebar-box {
		background: #f8fafc;
		border-color: #e2e8f0;
	}

	.sb-title {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-weight: 700;
		color: #38bdf8;
		margin: 0 0 6px 0;
		letter-spacing: 0.04em;
	}

	:global(.light-modal) .sb-title {
		color: #0284c7;
	}

	.sb-text {
		font-size: 11px;
		line-height: 1.4;
		color: #94a3b8;
		margin: 0;
	}

	:global(.light-modal) .sb-text {
		color: #334155;
	}

	.statute-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-badge {
		font-size: 9.5px;
		font-family: monospace;
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.25);
		padding: 3px 6px;
		border-radius: 3px;
	}

	.db-meta-grid {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 4px;
		font-size: 9.5px;
	}

	.db-lbl {
		color: #64748b;
		font-family: monospace;
	}

	.db-val {
		font-weight: 600;
		color: #e2e8f0;
	}

	:global(.light-modal) .db-val {
		color: #0f172a;
	}

	.db-val.mono {
		font-family: monospace;
		font-size: 8.5px;
		word-break: break-all;
	}

	.action-pill-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 7px;
		font-size: 10.5px;
		font-weight: 700;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid rgba(239, 68, 68, 0.3);
		background: rgba(239, 68, 68, 0.12);
		color: #f87171;
	}

	.action-pill-btn:hover {
		background: rgba(239, 68, 68, 0.25);
		border-color: #ef4444;
	}

	/* Document Viewer Container */
	.doc-viewer-container {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.doc-controls-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 12px;
		background: rgba(15, 22, 34, 0.6);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	:global(.light-modal) .doc-controls-bar {
		background: #f1f5f9;
		border-bottom-color: #e2e8f0;
	}

	.doc-page-info {
		font-size: 10px;
		font-family: monospace;
		font-weight: 700;
		color: #94a3b8;
	}

	.fre-rule-tag {
		font-size: 9px;
		font-family: monospace;
		background: rgba(56, 189, 248, 0.1);
		color: #38bdf8;
		padding: 1px 5px;
		border-radius: 2px;
		margin-left: 8px;
	}

	.zoom-btn {
		background: rgba(30, 41, 59, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: inherit;
		padding: 2px 6px;
		font-size: 10px;
		border-radius: 3px;
		cursor: pointer;
		margin-left: 3px;
	}

	.zoom-level {
		font-size: 10px;
		font-family: monospace;
		padding: 0 4px;
	}

	:global(.doc-scroll-root) {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	:global(.doc-scroll-viewport) {
		width: 100%;
		height: 100%;
		overflow: auto;
		padding: 16px;
	}

	.legal-doc-page {
		max-width: 580px;
		margin: 0 auto;
		background: #ffffff;
		color: #1e293b;
		padding: 32px 36px;
		border-radius: 4px;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
		font-family: 'Times New Roman', serif;
		position: relative;
	}

	.doc-watermark {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) rotate(-35deg);
		font-size: 28px;
		font-weight: 800;
		color: rgba(239, 68, 68, 0.08);
		white-space: nowrap;
		pointer-events: none;
	}

	.doc-header-stamp {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-family: monospace;
		color: #64748b;
		border-bottom: 1px solid #e2e8f0;
		padding-bottom: 6px;
		margin-bottom: 12px;
	}

	.doc-page-heading {
		font-size: 13px;
		font-weight: bold;
		text-align: center;
		margin: 10px 0;
		letter-spacing: 0.05em;
	}

	.doc-preamble, .doc-body-legal {
		font-size: 11px;
		line-height: 1.5;
		margin: 8px 0;
	}

	.doc-clause-box.discrepancy-highlight {
		background: #fef2f2;
		border-left: 3px solid #ef4444;
		padding: 8px 10px;
		margin: 10px 0;
		border-radius: 0 4px 4px 0;
	}

	.callout-badge {
		font-size: 8px;
		font-family: monospace;
		font-weight: 700;
		color: #dc2626;
		margin-bottom: 4px;
	}

	.clause-text {
		font-size: 10.5px;
		font-family: monospace;
		line-height: 1.4;
		white-space: pre-wrap;
		color: #991b1b;
		margin: 0;
	}

	.doc-signature-row {
		display: flex;
		justify-content: space-between;
		margin-top: 24px;
		border-top: 1px solid #e2e8f0;
		padding-top: 12px;
	}

	.sig-block {
		display: flex;
		flex-direction: column;
	}

	.sig-line {
		font-family: cursive;
		font-size: 15px;
		color: #1e3a8a;
	}

	.sig-label {
		font-size: 9px;
		font-family: sans-serif;
		color: #64748b;
	}

	.sig-stamp {
		display: flex;
		flex-direction: column;
		align-items: center;
		border: 1px solid #10b981;
		color: #059669;
		padding: 3px 8px;
		border-radius: 3px;
		font-size: 8px;
		font-family: monospace;
		font-weight: 700;
	}

	/* CCTV Video Player Container */
	.video-viewer-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 12px;
	}

	.cctv-screen {
		background: #000000;
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.cctv-hud-header {
		display: flex;
		justify-content: space-between;
		padding: 6px 12px;
		font-size: 9px;
		font-family: monospace;
		color: #38bdf8;
		background: rgba(15, 22, 34, 0.85);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.video-frame-display {
		flex: 1;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.corridor-backdrop {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, #1e293b 0%, #090d14 100%);
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.facial-bbox {
		position: absolute;
		top: 25%;
		left: 45%;
		width: 110px;
		height: 140px;
		border: 1.5px solid #10b981;
		box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 4px;
	}

	.bbox-label {
		font-size: 8px;
		font-family: monospace;
		font-weight: 700;
		color: #10b981;
		background: rgba(0, 0, 0, 0.7);
	}

	.bbox-coords {
		font-size: 7px;
		font-family: monospace;
		color: #10b981;
		background: rgba(0, 0, 0, 0.7);
	}

	.terminal-door-indicator {
		position: absolute;
		top: 10px;
		right: 12px;
		font-size: 8px;
		font-family: monospace;
		background: rgba(239, 68, 68, 0.8);
		color: #ffffff;
		padding: 2px 6px;
		border-radius: 2px;
	}

	.cctv-playback-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(15, 22, 34, 0.9);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.cctv-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 9.5px;
		font-family: monospace;
		font-weight: 700;
		padding: 4px 8px;
		background: rgba(56, 189, 248, 0.15);
		border: 1px solid rgba(56, 189, 248, 0.3);
		color: #38bdf8;
		border-radius: 3px;
		cursor: pointer;
	}

	.cctv-timecode {
		font-size: 9.5px;
		font-family: monospace;
		color: #e2e8f0;
		margin-left: auto;
	}

	.cctv-format {
		font-size: 8px;
		font-family: monospace;
		color: #64748b;
	}

	/* Audio Waveform Stage */
	.audio-viewer-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 16px;
	}

	.audio-hud-box {
		width: 100%;
		max-width: 580px;
		background: #0f172a;
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 6px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.audio-hud-header {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-family: monospace;
	}

	.ah-badge { color: #c084fc; font-weight: 700; }
	.ah-source { color: #94a3b8; }

	.waveform-graphic {
		display: flex;
		align-items: center;
		gap: 3px;
		height: 60px;
		padding: 0 8px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
	}

	.wave-col {
		flex: 1;
		background: #c084fc;
		border-radius: 1px;
	}

	.audio-controls-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.audio-play-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-family: monospace;
		font-weight: 700;
		padding: 5px 10px;
		background: rgba(168, 85, 247, 0.2);
		border: 1px solid #a855f7;
		color: #c084fc;
		border-radius: 3px;
		cursor: pointer;
	}

	.audio-scrub-track {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}

	.audio-progress-bar {
		height: 100%;
		background: #a855f7;
	}

	.audio-time {
		font-size: 9.5px;
		font-family: monospace;
		color: #94a3b8;
	}

	.audio-transcript-box {
		background: rgba(0, 0, 0, 0.4);
		border-radius: 4px;
		padding: 10px;
		font-size: 11px;
		line-height: 1.4;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.spk-tag {
		font-weight: 700;
		font-family: monospace;
		font-size: 9.5px;
		margin-right: 4px;
	}

	.spk-tag.vance { color: #f87171; }
	.spk-tag.op { color: #38bdf8; }
	.spk-text.highlight { color: #fbbf24; font-weight: 600; background: rgba(245, 158, 11, 0.12); padding: 0 4px; }

	/* 3D LiDAR Splat Inspector */
	.splat-viewer-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 12px;
	}

	.splat-hud-card {
		flex: 1;
		background: #090d14;
		border: 1px solid rgba(6, 182, 212, 0.3);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		padding: 12px;
	}

	.splat-hud-header {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-family: monospace;
		font-weight: 700;
		color: #22d3ee;
		border-bottom: 1px solid rgba(6, 182, 212, 0.2);
		padding-bottom: 6px;
		margin-bottom: 8px;
	}

	.splat-graphic-box {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		border-radius: 4px;
		position: relative;
	}

	.wireframe-bounding-cube {
		width: 140px;
		height: 140px;
		border: 1.5px dashed #06b6d4;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.cube-point {
		position: absolute;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #38bdf8;
		box-shadow: 0 0 6px #38bdf8;
	}
	.p1 { top: -3px; left: -3px; }
	.p2 { top: -3px; right: -3px; }
	.p3 { bottom: -3px; left: -3px; }
	.p4 { bottom: -3px; right: -3px; }

	.ray-intersect-label {
		font-size: 9px;
		font-family: monospace;
		font-weight: 700;
		color: #22d3ee;
		background: rgba(0, 0, 0, 0.7);
		padding: 2px 5px;
	}

	.splat-metrics-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		margin-top: 10px;
	}

	.sm-card {
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		padding: 6px;
		display: flex;
		flex-direction: column;
	}

	.sm-label {
		font-size: 8px;
		font-family: monospace;
		color: #94a3b8;
	}

	.sm-value {
		font-size: 11px;
		font-weight: 700;
		color: #f1f5f9;
	}

	.sm-value.cyan { color: #22d3ee; }
	.sm-value.green { color: #10b981; }
	.sm-value.monospace { font-family: monospace; font-size: 9px; }

	/* Fallback Forensic Table */
	.generic-viewer-container {
		padding: 16px;
		height: 100%;
		overflow-y: auto;
	}

	.forensic-card {
		background: #0f172a;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 16px;
	}

	.forensic-card h4 {
		font-size: 12px;
		margin: 0 0 8px 0;
		color: #38bdf8;
	}

	.fc-summary {
		font-size: 11px;
		color: #94a3b8;
		margin-bottom: 12px;
	}

	.fc-table {
		display: flex;
		flex-direction: column;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		font-size: 10px;
		font-family: monospace;
	}

	.fc-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		padding: 5px 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.fc-row.header {
		background: rgba(255, 255, 255, 0.05);
		font-weight: 700;
		color: #38bdf8;
	}

	.fc-match-stat {
		display: block;
		margin-top: 10px;
		font-size: 9.5px;
		font-family: monospace;
		font-weight: 700;
		color: #10b981;
	}

	/* Tab 2: OCR */
	.ocr-tab-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 12px;
	}

	.ocr-header-strip {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		font-family: monospace;
		color: #38bdf8;
		margin-bottom: 8px;
	}

	:global(.ocr-scroll-root) {
		flex: 1;
		min-height: 0;
		background: #0f172a;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 4px;
	}

	:global(.ocr-scroll-viewport) {
		width: 100%;
		height: 100%;
		padding: 12px;
	}

	.ocr-text-block {
		font-family: monospace;
		font-size: 11px;
		line-height: 1.5;
		color: #e2e8f0;
		white-space: pre-wrap;
		margin: 0;
	}

	/* Tab 3: Chain */
	.chain-tab-container {
		padding: 20px;
		height: 100%;
		overflow-y: auto;
	}

	.chain-timeline {
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: relative;
		padding-left: 20px;
		border-left: 2px solid rgba(255, 255, 255, 0.1);
	}

	.chain-step {
		position: relative;
	}

	.step-dot {
		position: absolute;
		left: -26px;
		top: 4px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.step-dot.green { background: #10b981; box-shadow: 0 0 6px #10b981; }
	.step-dot.blue { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
	.step-dot.cyan { background: #06b6d4; box-shadow: 0 0 6px #06b6d4; }

	.step-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.step-time {
		font-size: 9px;
		font-family: monospace;
		color: #94a3b8;
	}

	.step-action {
		font-size: 11px;
		font-weight: 700;
		color: #f1f5f9;
	}

	.step-agent {
		font-size: 10px;
		color: #64748b;
	}

	.step-hash {
		font-size: 8.5px;
		font-family: monospace;
		color: #38bdf8;
		word-break: break-all;
	}

	/* Tab 4: Strategy */
	.statutes-tab-container {
		padding: 16px;
		height: 100%;
		overflow-y: auto;
	}

	.strategy-card {
		background: #0f172a;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 16px;
	}

	.strategy-card h4 {
		font-size: 12px;
		color: #fbbf24;
		margin: 0 0 6px 0;
	}

	.sc-desc {
		font-size: 11px;
		color: #94a3b8;
		margin-bottom: 12px;
	}

	.sc-questions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.q-row {
		display: flex;
		gap: 8px;
		background: rgba(0, 0, 0, 0.3);
		padding: 10px;
		border-radius: 4px;
		border-left: 2px solid #fbbf24;
	}

	.q-num {
		font-size: 11px;
		font-weight: 800;
		color: #fbbf24;
		font-family: monospace;
	}

	.q-text {
		font-size: 11px;
		line-height: 1.4;
		color: #e2e8f0;
		margin: 0;
	}
</style>
