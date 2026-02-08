<script lang="ts">
	import type { Snippet } from 'svelte';
	// Migrated to $effect
	import { backOut } from 'svelte/easing';
	import { fade, scale } from 'svelte/transition';
	import Portal from './Portal.svelte';

	interface Props {
		open: boolean;
		title?: string;
		size?: 'small' | 'medium' | 'large' | 'fullscreen';
		palette?: 'nes' | 'snes' | 'ps1' | 'n64' | 'ps2';
		glassEffect?: boolean;
		diamondPattern?: boolean;
		children?: Snippet;
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		title = '',
		size = 'medium',
		palette = 'ps1',
		glassEffect = true,
		diamondPattern = true,
		children,
		footer
	}: Props = $props();

	const dispatch = createEventDispatcher<{ close: void }>();

	let modalElement: HTMLDivElement | null = null;
	let canvasElement: HTMLCanvasElement | null = null;
	let animationFrame: number;

	const sizeClasses: Record<string, string> = {
		small: 'max-w-md',
		medium: 'max-w-2xl',
		large: 'max-w-4xl',
		fullscreen: 'max-w-full h-full'
	};

	$effect(() => {

		if (diamondPattern && canvasElement) {
			drawDiamondPattern();
		}
		return () => {
			if (animationFrame) {
				cancelAnimationFrame(animationFrame);
			}
		};
	
});

	function drawDiamondPattern() {
		if (!canvasElement) return;

		const ctx = canvasElement.getContext('2d');
		if (!ctx) return;

		const colors = {
			primary: '#8a2be2',
			secondary: '#4b0082',
			tertiary: '#9932cc',
			accent: ['#ba55d3'],
			error: '#ff6b6b'
		};

		const width = (canvasElement.width = 400);
		const height = (canvasElement.height = 400);

		const diamondSize = 40;
		const rows = Math.ceil(height / diamondSize) + 2;
		const cols = Math.ceil(width / diamondSize) + 2;

		let offset = 0;

		function animate() {
			ctx.clearRect(0, 0, width, height);

			const gradient = ctx.createLinearGradient(0, 0, width, height);
			gradient.addColorStop(0, colors.primary + '20');
			gradient.addColorStop(0.5, colors.secondary + '15');
			gradient.addColorStop(1, colors.tertiary + '10');

			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);

			ctx.strokeStyle = colors.accent[0] + '30';
			ctx.lineWidth = 1;

			for (let row = -1; row < rows; row++) {
				for (let col = -1; col < cols; col++) {
					const x = col * diamondSize + (row % 2 === 0 ? 0 : diamondSize / 2);
					const y = (row * diamondSize) / 2;

					ctx.beginPath();
					ctx.moveTo(x + diamondSize / 2, y + offset);
					ctx.lineTo(x + diamondSize, y + diamondSize / 4 + offset);
					ctx.lineTo(x + diamondSize / 2, y + diamondSize / 2 + offset);
					ctx.lineTo(x, y + diamondSize / 4 + offset);
					ctx.closePath();
					ctx.stroke();

					if (Math.random() > 0.95) {
						ctx.font = '12px serif';
						ctx.fillStyle = colors.error + '40';
						ctx.fillText('♦', x + diamondSize / 2 - 6, y + diamondSize / 4 + offset + 4);
					}
				}
			}

			offset = (offset + 0.5) % diamondSize;
			animationFrame = requestAnimationFrame(animate);
		}

		animate();
	}

	function closeModal() {
		open = false;
		dispatch('close');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

{#if open}
	<Portal>
		<div
			class="modal-overlay"
			transition:fade={{
	duration: 200 }}
			onclick={closeModal}
			onkeydown={handleKeydown}
			role="button"
			tabindex="-1"
		>
			<div
				bind:this={modalElement}
				class="modal-container {sizeClasses[size]}"
				class:glass-effect={glassEffect}
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				transition:scale={{ duration: 300, easing: backOut }}
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title"
				tabindex="-1"
			>
				{#if diamondPattern}
					<canvas bind:this={canvasElement} class="diamond-canvas"></canvas>
				{/if}

				<div class="gradient-overlay"></div>

				<div class="modal-content">
					{#if title}
						<div class="modal-header">
							<div class="card-corner">
								<span class="suit">♦</span>
								<span class="rank">A</span>
							</div>
							<h2 id="modal-title" class="modal-title">{title}</h2>
							<div class="card-corner">
								<span class="suit">♦</span>
								<span class="rank">A</span>
							</div>
						</div>
					{/if}

					<div class="modal-body">
						{@render children?.()}
					</div>

					<div class="modal-footer">
						<div class="card-corner">
							<span class="suit">♦</span>
							<span class="rank">A</span>
						</div>
						{@render footer?.()}
						{#if !footer}
							<button class="close-button" onclick={closeModal}>Close</button>
						{/if}
						<div class="card-corner">
							<span class="suit">♦</span>
							<span class="rank">A</span>
						</div>
					</div>
				</div>

				<button class="modal-close" onclick={closeModal} aria-label="Close modal">✕</button>
			</div>
		</div>
	</Portal>
{/if}

<style>
	.modal-overlay { position: fixed; top: 0;
		left: 0;
	right: 0;
		bottom: 0;
	background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
	display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
	padding: 1rem;
	}

	.modal-container { position: relative; background: linear-gradient(
			135deg,
			rgba(16, 16, 32, 0.95),
			rgba(32, 16, 48, 0.95),
			rgba(16, 16, 32, 0.95)
		);
		border-radius: 16px;
	border: 2px solid rgba(255, 255, 255, 0.2);
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.5),
			0 0 64px rgba(138, 43, 226, 0.2),
			inset 0 0 32px rgba(255, 255, 255, 0.05);
		overflow: hidden;
	width: 100%;
	}

	.glass-effect {
		backdrop-filter: blur(12px) saturate(1.8);
		background: linear-gradient(
			135deg,
			rgba(16, 16, 32, 0.85),
			rgba(32, 16, 48, 0.85),
			rgba(16, 16, 32, 0.85)
		);
	}

	.diamond-canvas { position: absolute; top: 0;
		left: 0;
	width: 100%;
		height: 100%;
	opacity: 0.3;
		pointer-events: none;
	}

	.gradient-overlay { position: absolute; top: 0;
		left: 0;
	right: 0;
		bottom: 0;
	background:
			radial-gradient(ellipse at top left, rgba(138, 43, 226, 0.2), transparent 40%),
			radial-gradient(ellipse at bottom right, rgba(30, 144, 255, 0.2), transparent 40%),
			linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent);
		pointer-events: none;
	}

	.modal-content {
		position: relative;
		z-index: 1;
	display: flex;
		flex-direction: column;
		min-height: 200px;
		max-height: 85vh;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
	}

	.modal-title {
		font-size: 1.5rem;
		font-weight: bold;
	color: #fff;
		text-shadow: 0 0 20px rgba(138, 43, 226, 0.5);
		margin: 0;
	flex: 1;
		text-align: center;
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
	flex: 1;
		color: rgba(255, 255, 255, 0.9);
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	padding: 1rem 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.03), transparent);
	}

	.card-corner {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	width: 30px;
		height: 40px;
	color: rgba(255, 64, 64, 0.8);
		font-family: 'Georgia', serif;
	}

	.suit {
		font-size: 1.2rem;
		line-height: 1;
	}

	.rank {
		font-size: 0.9rem;
		font-weight: bold;
		line-height: 1;
	}

	.modal-close { position: absolute; top: 1rem;
		right: 1rem;
	width: 32px;
		height: 32px;
		border-radius: 50%;
	background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		font-size: 1.2rem;
	display: flex;
		align-items: center;
		justify-content: center;
	cursor: pointer;
		transition:all 0.2s;
		z-index: 2;
	}

	.modal-close:hover {
		background: rgba(255, 64, 64, 0.3);
		border-color: rgba(255, 64, 64, 0.5);
		transform: scale(1.1) rotate(90deg);
	}

	.close-button {
		padding: 0.5rem 1.5rem;
		background: linear-gradient(135deg, rgba(138, 43, 226, 0.3), rgba(30, 144, 255, 0.3));
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 8px;
	color: #fff;
		font-weight: 500;
	cursor: pointer;
		transition:all 0.3s;
	}

	.close-button:hover {
		background: linear-gradient(135deg, rgba(138, 43, 226, 0.5), rgba(30, 144, 255, 0.5));
		transform: translateY(-2px);
		box-shadow: 0 4px 16px rgba(138, 43, 226, 0.3);
	}

	.modal-body::-webkit-scrollbar {
		width: 8px;
	}

	.modal-body::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	.modal-body::-webkit-scrollbar-thumb {
		background: linear-gradient(180deg, rgba(138, 43, 226, 0.5), rgba(30, 144, 255, 0.5));
		border-radius: 4px;
	}

	.modal-body::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(180deg, rgba(138, 43, 226, 0.7), rgba(30, 144, 255, 0.7));
	}
</style>
