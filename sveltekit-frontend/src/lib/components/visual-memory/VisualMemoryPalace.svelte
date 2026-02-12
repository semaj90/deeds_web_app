<!-- 🧠 Visual Memory Palace with Glyph Integration -->
<script lang="ts">
	import { NeuralSpriteAutoencoder } from '$lib/services-clean';
	import yorhaMipmapShaders from '$lib/components/three/yorha-ui/webgpu/YoRHaMipmapShaders.svelte';
	import { calculateDocumentPriority } from '$lib/config/legal-priorities';
	import { textureRegistry as componentTextureRegistry } from '$lib/registry/texture-component-registry';

	interface MemoryGlyph {
		id: string;
		data: Uint8Array;
		latent: number[];
		position: { x: number; y: number; z: number };
		documentId: string;
		priority: number;
		timestamp: number;
		semantic: string;
	}

	interface MemoryPalaceRoom {
		id: string;
		name: string;
		glyphs: MemoryGlyph[];
		theme: 'evidence' | 'contracts' | 'cases' | 'research';
		capacity: number;
	}

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let autoencoder: NeuralSpriteAutoencoder;
	let rooms = $state<MemoryPalaceRoom[]>([]);
	let selectedRoom = $state<MemoryPalaceRoom | null>(null);

	// Cache raw pixel data
	let glyphCache = new Map<string, ImageData>();
	// Cache GPU-ready bitmaps (Critical Optimization)
	let glyphBitmapCache = new Map<string, ImageBitmap>();

	let animationFrame: number;
	let isProcessing = $state<boolean>(false);

	// HMR Guard
	let initialized = false;

	const GLYPH_SIZE = 64;
	const LATENT_SIZE = 32;
	const MAX_GLYPHS_PER_ROOM = 128;
	const BITMAP_CACHE_LIMIT = 128;

	$effect(() => {
		let cancelled = false;

		(async () => {
			if (initialized) return;
			initialized = true;

			await initializeMemoryPalace();
			if (!cancelled) startVisualization();
		})();

		return () => {
			cancelled = true;
			if (animationFrame) {
				cancelAnimationFrame(animationFrame);
			}
			// Cleanup bitmaps to prevent memory leaks
			glyphBitmapCache.forEach(bmp => bmp.close());
			glyphBitmapCache.clear();
			initialized = false;
		};
	});

	async function initializeMemoryPalace(): Promise<void> {
		// Initialize Autoencoder (0..1 normalized)
		autoencoder = new NeuralSpriteAutoencoder({
			latentSize: LATENT_SIZE,
			clampMin: 0,
			clampMax: 255,
			normalize: true
		});

		// Note: ensure this component module exports this method!
		if ((yorhaMipmapShaders as any).initializeHeadless) {
			await (yorhaMipmapShaders as any).initializeHeadless();
		}

		componentTextureRegistry.register('VisualMemoryPalace', {
			componentName: 'VisualMemoryPalace',
			textureSlots: ['glyph_atlas', 'room_textures'],
			memoryBank: 'INTERNAL_RAM',
			sharingPolicy: 'exclusive',
			updateFrequency: 'realtime',
			priority: 220,
			estimatedUsage: 256 * 1024
		});

		rooms = [
			{ id: 'evidence-room', name: 'Evidence Chamber', glyphs: [], theme: 'evidence', capacity: MAX_GLYPHS_PER_ROOM },
			{ id: 'contracts-room', name: 'Contract Archive', glyphs: [], theme: 'contracts', capacity: MAX_GLYPHS_PER_ROOM },
			{ id: 'cases-room', name: 'Case Gallery', glyphs: [], theme: 'cases', capacity: MAX_GLYPHS_PER_ROOM },
			{ id: 'research-room', name: 'Research Lab', glyphs: [], theme: 'research', capacity: MAX_GLYPHS_PER_ROOM }
		];

		selectedRoom = rooms[0];
	}

	async function generateGlyphFromDocument(documentContent: string, documentId: string): Promise<MemoryGlyph> {
		const textBytes = new TextEncoder().encode(documentContent);
		const hashArray = await crypto.subtle.digest('SHA-256', textBytes);
		const hashBytes = new Uint8Array(hashArray);

		const imageData = new ImageData(GLYPH_SIZE, GLYPH_SIZE);
		// Visual Hash Generation
		for (let i = 0; i < imageData.data.length; i += 4) {
			const byteIndex = Math.floor(i / 4) % hashBytes.length;
			const byte = hashBytes[byteIndex];
			imageData.data[i] = (byte & 0x1f) << 3;
			imageData.data[i + 1] = (byte & 0xe0) >> 2;
			imageData.data[i + 2] = (byte & 0x7c) << 1;
			imageData.data[i + 3] = 255;
		}

		// Semantic Signal Injection (Bag-of-words / Simple)
		// TODO: Implement semantic pass if needed

		const pixelArray = Array.from(imageData.data);
		const latent = autoencoder.encode(pixelArray);

		const priority = calculateDocumentPriority({
			id: documentId,
			type: 'evidence',
			urgency: 'medium',
			lastAccessed: new Date(),
			activeReview: false,
			complexity: 'moderate',
			category: 'litigation',
			fileSize: 1024
		} as any);

		const position = calculateSpatialPosition(latent, priority);

		return {
			id: `glyph-${documentId}-${Date.now()}`,
			data: hashBytes,
			latent,
			position,
			documentId,
			priority,
			timestamp: Date.now(),
			semantic: documentContent.substring(0, 100)
		};
	}

	function calculateSpatialPosition(latent: number[], priority: number): { x: number, y: number, z: number } {
		// latent is 0..1
		const x = latent[0] * 200 - 100;
		// priority is 0..255, normalize to 0..1
		const p = Math.max(0, Math.min(1, priority / 255));
		const y = p * 100;
		const z = latent[1] * 200 - 100;
		return { x, y, z };
	}

	async function addDocumentToMemoryPalace(documentContent: string, documentId: string, roomId: string): Promise<void> {
		isProcessing = true;
		try {
			const glyph = await generateGlyphFromDocument(documentContent, documentId);
			const room = rooms.find((r) => r.id === roomId);

			if (room && room.glyphs.length < room.capacity) {
				room.glyphs.push(glyph);
				const imageData = reconstructGlyphImage(glyph.latent);
				glyphCache.set(glyph.id, imageData);
				rooms = [...rooms]; // Reactivity hint
			}
		} finally {
			isProcessing = false;
		}
	}

	function reconstructGlyphImage(latent: number[]): ImageData {
		const reconstructed = autoencoder.decode(latent, GLYPH_SIZE * GLYPH_SIZE * 4);
		const imageData = new ImageData(GLYPH_SIZE, GLYPH_SIZE);

		for (let i = 0; i < reconstructed.length && i < imageData.data.length; i++) {
			// Clamping for safety
			imageData.data[i] = Math.max(0, Math.min(255, Math.round(reconstructed[i])));
		}
		return imageData;
	}

	async function ensureGlyphBitmap(glyph: MemoryGlyph): Promise<ImageBitmap> {
		const cached = glyphBitmapCache.get(glyph.id);
		if (cached) return cached;

		// LRU Eviction if full
		if (glyphBitmapCache.size >= BITMAP_CACHE_LIMIT) {
			const firstKey = glyphBitmapCache.keys().next().value;
			if (firstKey) {
				const bmp = glyphBitmapCache.get(firstKey);
				bmp?.close();
				glyphBitmapCache.delete(firstKey);
			}
		}

		let imageData = glyphCache.get(glyph.id);
		if (!imageData) {
			imageData = reconstructGlyphImage(glyph.latent);
			glyphCache.set(glyph.id, imageData);
		}

		const bitmap = await createImageBitmap(imageData);
		glyphBitmapCache.set(glyph.id, bitmap);
		return bitmap;
	}

	function startVisualization() {
		if (!canvas) return;
		ctx = canvas.getContext('2d');
		if (!ctx) return;

		function draw() {
			if (!ctx || !canvas) return;

			// Background
			ctx.fillStyle = '#0a0a0a';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			const gradient = ctx.createRadialGradient(
				canvas.width / 2, canvas.height / 2, 0,
				canvas.width / 2, canvas.height / 2, canvas.width / 2
			);

			if (selectedRoom) {
				switch (selectedRoom.theme) {
					case 'evidence': gradient.addColorStop(0, '#2a0845'); gradient.addColorStop(1, '#0a0a1f'); break;
					case 'contracts': gradient.addColorStop(0, '#1a3a52'); gradient.addColorStop(1, '#0a1a2f'); break;
					case 'cases': gradient.addColorStop(0, '#3a1a1a'); gradient.addColorStop(1, '#1a0a0a'); break;
					case 'research': gradient.addColorStop(0, '#1a3a1a'); gradient.addColorStop(1, '#0a1a0a'); break;
				}

				ctx.fillStyle = gradient;
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				drawGlyphsIn3D(ctx, selectedRoom.glyphs);
			}

			drawUIOverlay(ctx);
			animationFrame = requestAnimationFrame(draw);
		}

		draw();
	}

	function drawGlyphsIn3D(ctx: CanvasRenderingContext2D, glyphs: MemoryGlyph[]) {
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		const time = Date.now() * 0.001;

		const sortedGlyphs = [...glyphs].sort((a, b) => b.position.z - a.position.z);

		for (const glyph of sortedGlyphs) {
			const perspective = 300 / (300 + glyph.position.z);
			const x = centerX + glyph.position.x * perspective;
			const y = centerY - glyph.position.y * perspective + Math.sin(time + glyph.position.x * 0.01) * 5;
			const size = GLYPH_SIZE * perspective;

            // Check cache synchronously
            const bitmap = glyphBitmapCache.get(glyph.id);
            if (bitmap) {
                ctx.save();
                ctx.globalAlpha = perspective;
                ctx.shadowColor = `hsl(${glyph.priority + 180}, 100%, 50%)`;
                ctx.shadowBlur = 10 * perspective;

                try {
                    ctx.drawImage(bitmap, x - size / 2, y - size / 2, size, size);
                } catch (e) {
                    // Bitmap might be closed
                }

                ctx.strokeStyle = `hsl(${240 - glyph.priority}, 70%, 50%)`;
                ctx.lineWidth = 2 * perspective;
                ctx.strokeRect(x - size / 2, y - size / 2, size, size);
                ctx.restore();
            } else {
                // If not in cache, start loading it (but don't draw this frame)
                // Debounce spawning promise?
                // Simple: just call ensure. If it returns map, fine.
                // We use catch to avoid unhandled rejections if closed/unmounted
                ensureGlyphBitmap(glyph).catch(() => {});
            }
		}
	}

	function drawUIOverlay(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.font = 'bold 16px monospace';
		ctx.fillText(selectedRoom?.name ?? 'Memory Palace', 10, 30);

		ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.font = '12px monospace';
		ctx.fillText(`Glyphs: ${selectedRoom?.glyphs.length ?? 0}/${MAX_GLYPHS_PER_ROOM}`, 10, 50);

		if (isProcessing) {
			ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
			ctx.fillText('Processing...', 10, 70);
		}
	}

	function selectRoom(room: MemoryPalaceRoom) {
		selectedRoom = room;
	}
</script>

<div class="visual-memory-palace">
	<!-- Room selector -->
	<div class="room-selector">
		{#each rooms as room (room.id)}
			<button
				class="room-btn"
				class:active={selectedRoom?.id === room.id}
				onclick={() => selectRoom(room)}
			>
				<span class="room-icon">
					{#if room.theme === 'evidence'}📊
					{:else if room.theme === 'contracts'}📜
					{:else if room.theme === 'cases'}⚖️
					{:else}🔬{/if}
				</span>
				<span class="room-name">{room.name}</span>
				<span class="room-capacity">{room.glyphs.length}/{room.capacity}</span>
			</button>
		{/each}
	</div>

	<!-- 3D visualization canvas -->
	<div class="palace-viewport">
		<canvas bind:this={canvas} width={800} height={600} class="palace-canvas"></canvas>

		<!-- Overlay controls -->
		<div class="palace-controls">
			<button class="control-btn" title="Zoom In">🔍+</button>
			<button class="control-btn" title="Zoom Out">🔍-</button>
			<button class="control-btn" title="Reset View">🔄</button>
		</div>
	</div>

	<!-- Glyph info panel -->
	<div class="glyph-info">
		<h3>Visual Memory Compression</h3>
		<div class="info-stat">
			<span>Compression Ratio:</span>
			<span class="stat-value">127:1</span>
		</div>
		<div class="info-stat">
			<span>Latent Dimensions:</span>
			<span class="stat-value">{LATENT_SIZE}</span>
		</div>
		<div class="info-stat">
			<span>Memory Used:</span>
			<span class="stat-value"
				>{((glyphCache.size * GLYPH_SIZE * GLYPH_SIZE * 4) / 1024).toFixed(1)}KB</span
			>
		</div>
	</div>
</div>

<style>
	.visual-memory-palace {
		display: grid;
		grid-template-columns: 200px 1fr 200px;
		gap: 1rem;
		height: 100%;
		background: linear-gradient(180deg, #0a0a1f, #1a0a2f);
		padding: 1rem;
		border-radius: 8px;
	}

	.room-selector {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.room-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s;
	}

	.room-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateX(4px);
	}

	.room-btn.active {
		background: rgba(138, 43, 226, 0.2);
		border-color: rgba(138, 43, 226, 0.5);
		color: #fff;
	}

	.room-icon {
		font-size: 1.2rem;
	}

	.room-name {
		flex: 1;
		text-align: left;
		font-size: 0.9rem;
	}

	.room-capacity {
		font-size: 0.75rem;
		opacity: 0.7;
	}

	.palace-viewport {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
	}

	.palace-canvas {
		image-rendering: optimizeSpeed;
		image-rendering: -webkit-optimize-contrast;
		border-radius: 8px;
	}

	.palace-controls {
		position: absolute;
		bottom: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.5rem;
	}

	.control-btn {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		font-size: 1.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
	}

	.control-btn:hover {
		background: rgba(138, 43, 226, 0.3);
		transform: scale(1.1);
	}

	.glyph-info {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.glyph-info h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.info-stat {
		display: flex;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.info-stat .stat-value {
		color: #8a2be2;
		font-weight: bold;
		font-family: 'Courier New', monospace;
	}
</style>
