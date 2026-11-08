<!--
  ExhibitInspectorPanel.svelte
  YoRHa Law / Lex AI design token aligned 3D primitive inspector panel.
  Directly reads dimensions, 6-DoF coordinates, and FSM state from scene-fsm-cache.

  Verification Contract:
  - Separate HASH_FORMAT_VALID (syntactic 64-char hex) from SERVER_VERIFIED (server receipt + revision).
  - Never marks synthetic scene data or unadmitted demonstratives as verified.
-->
<script lang="ts">
	import { sceneFsmCache } from '$lib/n64-fsm/scene-fsm-cache.js';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		exhibitId?: string;
		label?: string;
		dimensionsMeters?: [number, number, number];
		positionMeters?: [number, number, number];
		rotationDeg?: [number, number, number];
		sourceSha256?: string | null;
		provenanceLabel?: string;
		serverVerified?: boolean;
		verificationStatus?: 'AUTHENTICATED' | 'VERIFIED' | 'CHALLENGED' | 'DEMONSTRATIVE' | 'PENDING';
		sourceRevision?: string | null;
		isSynthetic?: boolean;
		caseId?: string | null;
		onClose?: () => void;
	}

	let {
		exhibitId = 'EXHIBIT E-002',
		label = 'Bloodstain (suspected)',
		dimensionsMeters = [0.42, 0.28, 0.02],
		positionMeters = [4.213, 0.0, -2.197],
		rotationDeg = [0.0, 0.0, 0.0],
		sourceSha256 = null,
		provenanceLabel = '',
		serverVerified = false,
		verificationStatus = 'PENDING',
		sourceRevision = null,
		isSynthetic = false,
		caseId = null,
		onClose
	}: Props = $props();

	let hashCopied = $state(false);

	let isHashFormatValid = $derived(Boolean(sourceSha256 && /^[a-f\d]{64}$/i.test(sourceSha256)));

	let isServerVerified = $derived(Boolean(
		!isSynthetic &&
		isHashFormatValid &&
		sourceRevision &&
		(serverVerified === true || verificationStatus === 'AUTHENTICATED' || verificationStatus === 'VERIFIED')
	));

	let displayedBadgeLabel = $derived.by(() => {
		if (isServerVerified) return provenanceLabel || 'VERIFIED · AUTHENTICATED';
		if (isSynthetic) return 'DEMONSTRATIVE · SYNTHETIC';
		if (!isHashFormatValid) return 'DEMONSTRATIVE · UNCALIBRATED';
		return 'UNVERIFIED · NO RECEIPT';
	});

	async function copyHash() {
		if (!sourceSha256 || !isHashFormatValid) return;
		try {
			await navigator.clipboard.writeText(sourceSha256);
			hashCopied = true;
			setTimeout(() => { hashCopied = false; }, 2000);
		} catch {
			hashCopied = false;
		}
	}
</script>

<aside class="exhibit-inspector-panel" data-testid="exhibit-inspector-panel">
	<!-- Header with verified badge -->
	<div class="eip-header">
		<div>
			<div class="eip-id-row">
				<span class="gold-dot"></span>
				<span class="eip-id">{exhibitId}</span>
			</div>
			<div class="eip-label">{label}</div>
		</div>
		<div class="eip-header-right">
			<span
				class="verified-badge"
				class:is-verified={isServerVerified}
				class:is-unverified={!isServerVerified}
				data-testid="verified-badge"
			>
				{displayedBadgeLabel}
			</span>
			{#if onClose}
				<button class="eip-close-btn" onclick={onClose} aria-label="Close inspector">
					<Icon name="x" size={13} />
				</button>
			{/if}
		</div>
	</div>

	<!-- Bounding Box Dimensions (3D) -->
	<div class="eip-section">
		<div class="eip-section-title">Bounding Box (3D)</div>
		<div class="dim-grid">
			<div class="dim-cell"><span class="ax-x">X</span> {dimensionsMeters[0].toFixed(2)} m</div>
			<div class="dim-cell"><span class="ax-y">Y</span> {dimensionsMeters[1].toFixed(2)} m</div>
			<div class="dim-cell"><span class="ax-z">Z</span> {dimensionsMeters[2].toFixed(2)} m</div>
		</div>
	</div>

	<!-- 6-DoF Transform Coordinates -->
	<div class="eip-section">
		<div class="eip-section-title">Transform (World)</div>
		<div class="transform-card">
			<div class="tc-row">
				<span class="tc-key">Position</span>
				<span class="tc-val">X {positionMeters[0].toFixed(3)} Y {positionMeters[1].toFixed(3)} Z {positionMeters[2].toFixed(3)}</span>
			</div>
			<div class="tc-row">
				<span class="tc-key">Rotation</span>
				<span class="tc-val">X {rotationDeg[0].toFixed(1)}° Y {rotationDeg[1].toFixed(1)}° Z {rotationDeg[2].toFixed(1)}°</span>
			</div>
			<div class="tc-row">
				<span class="tc-key">State FSM</span>
				<span class="tc-val fsm-active">{sceneFsmCache.currentState}</span>
			</div>
		</div>
	</div>

	<!-- Chain of Custody Hash & Server Admission -->
	<div class="eip-section">
		<div class="hash-card">
			<div class="hash-top">
				<span class="hash-label">Source Digest</span>
				<button class="hash-copy-btn" onclick={copyHash} disabled={!isHashFormatValid}>
					{hashCopied ? 'COPIED' : 'COPY'}
				</button>
			</div>
			<code class="hash-value">{isHashFormatValid ? sourceSha256 : 'No valid 64-hex SHA-256 supplied'}</code>
			<div class="hash-meta-row flex items-center justify-between mt-2 pt-2 border-t border-[#27272a] text-[10px] font-mono">
				<span class="text-[#71717a]">Syntax: <strong class={isHashFormatValid ? 'text-[#10b981]' : 'text-[#f59e0b]'}>{isHashFormatValid ? 'VALID 64-HEX' : 'INVALID'}</strong></span>
				<span class="text-[#71717a]">Server: <strong class={isServerVerified ? 'text-[#10b981]' : 'text-[#f59e0b]'}>{isServerVerified ? `ADMITTED (${sourceRevision})` : 'UNAUTHENTICATED'}</strong></span>
			</div>
		</div>
	</div>
</aside>

<style>
	.exhibit-inspector-panel {
		width: 320px;
		background: #121316;
		border-left: 1px solid #27272a;
		padding: 16px;
		color: #e4e4e7;
		font-family: inherit;
		box-sizing: border-box;
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.eip-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		border-bottom: 1px solid #27272a;
		padding-bottom: 12px;
	}

	.eip-header-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.eip-id-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 2px;
	}

	.gold-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #c59e2b;
	}

	.eip-id {
		font-size: 10px;
		font-family: monospace;
		letter-spacing: 0.1em;
		color: #c59e2b;
		text-transform: uppercase;
	}

	.eip-label {
		font-size: 13px;
		font-weight: 600;
		color: #fafafa;
	}

	.verified-badge {
		font-size: 9px;
		font-family: monospace;
		font-weight: 700;
		letter-spacing: 0.08em;
		padding: 2px 7px;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.verified-badge.is-verified {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.4);
	}

	.verified-badge.is-unverified {
		background: rgba(197, 158, 43, 0.15);
		color: #c59e2b;
		border: 1px solid rgba(197, 158, 43, 0.35);
	}

	.eip-close-btn {
		background: none;
		border: none;
		color: #71717a;
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		border-radius: 3px;
	}
	.eip-close-btn:hover {
		color: #fafafa;
		background: #27272a;
	}

	.eip-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.eip-section-title {
		font-size: 10px;
		font-family: monospace;
		letter-spacing: 0.08em;
		color: #71717a;
		text-transform: uppercase;
	}

	.dim-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}

	.dim-cell {
		background: #18191d;
		border: 1px solid #27272a;
		border-radius: 4px;
		padding: 6px 8px;
		font-size: 11px;
		font-family: monospace;
		color: #d4d4d8;
	}

	.ax-x { color: #f87171; font-weight: bold; }
	.ax-y { color: #4ade80; font-weight: bold; }
	.ax-z { color: #60a5fa; font-weight: bold; }

	.transform-card, .hash-card {
		background: #18191d;
		border: 1px solid #27272a;
		border-radius: 4px;
		padding: 8px 10px;
	}

	.tc-row {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		font-family: monospace;
		padding: 3px 0;
		border-bottom: 1px solid #202126;
	}
	.tc-row:last-child {
		border-bottom: none;
	}

	.tc-key { color: #71717a; }
	.tc-val { color: #d4d4d8; }
	.fsm-active { color: #c59e2b; font-weight: 600; }

	.hash-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.hash-label {
		font-size: 10px;
		font-family: monospace;
		color: #71717a;
		text-transform: uppercase;
	}

	.hash-copy-btn {
		background: #27272a;
		border: 1px solid #3f3f46;
		color: #d4d4d8;
		border-radius: 3px;
		padding: 2px 6px;
		font-size: 9px;
		font-family: monospace;
		cursor: pointer;
	}
	.hash-copy-btn:hover:not(:disabled) {
		background: #3f3f46;
		color: #fafafa;
	}
	.hash-copy-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.hash-value {
		display: block;
		font-size: 9px;
		color: #a1a1aa;
		word-break: break-all;
		line-height: 1.3;
	}
</style>
