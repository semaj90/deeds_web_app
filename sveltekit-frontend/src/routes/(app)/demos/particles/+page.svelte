<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Particle {
		id: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		size: number;
		color: string;
		opacity: number;
		life: number;
		maxLife: number;
	}

	const COLORS = [
		'rgba(99, 179, 237, 0.6)',
		'rgba(128, 90, 213, 0.5)',
		'rgba(72, 187, 120, 0.5)',
		'rgba(237, 137, 54, 0.4)',
		'rgba(245, 101, 101, 0.4)',
		'rgba(159, 122, 234, 0.5)',
	];

	const PRESETS: Record<string, {
		label: string;
		count: number;
		speed: number;
		sizeRange: [number, number];
		gravity: number;
		drift: boolean;
		colors: string[];
	}> = {
		ambient: {
			label: 'Ambient Drift',
			count: 30,
			speed: 0.3,
			sizeRange: [2, 5],
			gravity: -0.1,
			drift: true,
			colors: COLORS.slice(0, 3),
		},
		celebration: {
			label: 'Celebration',
			count: 60,
			speed: 2,
			sizeRange: [3, 7],
			gravity: 0.05,
			drift: false,
			colors: COLORS,
		},
		snow: {
			label: 'Snowfall',
			count: 50,
			speed: 0.8,
			sizeRange: [2, 4],
			gravity: 0.3,
			drift: true,
			colors: ['rgba(255,255,255,0.6)', 'rgba(200,220,255,0.4)'],
		},
		fireflies: {
			label: 'Fireflies',
			count: 20,
			speed: 0.4,
			sizeRange: [3, 6],
			gravity: 0,
			drift: true,
			colors: ['rgba(255,230,100,0.7)', 'rgba(255,200,50,0.5)'],
		},
	};

	let activePreset = $state<string>('ambient');
	let particles = $state<Particle[]>([]);
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let isRunning = $state(false);
	let frameId = 0;
	let particleCount = $state(30);
	let speedMultiplier = $state(1);
	let canvasWidth = $state(0);
	let canvasHeight = $state(0);

	function randomBetween(a: number, b: number) {
		return a + Math.random() * (b - a);
	}

	function createParticle(id: number, preset: typeof PRESETS[string], w: number, h: number): Particle {
		return {
			id,
			x: Math.random() * w,
			y: Math.random() * h,
			vx: (Math.random() - 0.5) * preset.speed * 2,
			vy: (Math.random() - 0.5) * preset.speed * 2,
			size: randomBetween(preset.sizeRange[0], preset.sizeRange[1]),
			color: preset.colors[Math.floor(Math.random() * preset.colors.length)],
			opacity: randomBetween(0.3, 0.9),
			life: 0,
			maxLife: randomBetween(120, 360),
		};
	}

	function startSimulation() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const preset = PRESETS[activePreset];
		isRunning = true;
		const w = canvasEl.width;
		const h = canvasEl.height;

		particles = Array.from({ length: particleCount }, (_, i) =>
			createParticle(i, preset, w, h)
		);

		function tick() {
			if (!isRunning || !ctx || !canvasEl) return;

			const currentPreset = PRESETS[activePreset];
			ctx.clearRect(0, 0, w, h);

			for (let i = 0; i < particles.length; i++) {
				const p = particles[i];
				p.life++;

				// Drift effect
				if (currentPreset.drift) {
					p.vx += (Math.random() - 0.5) * 0.05;
					p.vy += (Math.random() - 0.5) * 0.05;
				}

				p.vy += currentPreset.gravity * 0.1;
				p.x += p.vx * speedMultiplier;
				p.y += p.vy * speedMultiplier;

				// Fade in/out based on life
				const lifeRatio = p.life / p.maxLife;
				const fadeOpacity = lifeRatio < 0.1 ? lifeRatio * 10 : lifeRatio > 0.8 ? (1 - lifeRatio) * 5 : 1;

				// Wrap around
				if (p.x < -10) p.x = w + 10;
				if (p.x > w + 10) p.x = -10;
				if (p.y < -10) p.y = h + 10;
				if (p.y > h + 10) p.y = -10;

				// Respawn if dead
				if (p.life >= p.maxLife) {
					const fresh = createParticle(p.id, currentPreset, w, h);
					Object.assign(p, fresh);
				}

				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.opacity * fadeOpacity})`);
				ctx.fill();

				// Glow effect
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
				const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
				glow.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${p.opacity * fadeOpacity * 0.3})`));
				glow.addColorStop(1, 'rgba(0,0,0,0)');
				ctx.fillStyle = glow;
				ctx.fill();
			}

			frameId = requestAnimationFrame(tick);
		}

		tick();
	}

	function stopSimulation() {
		isRunning = false;
		cancelAnimationFrame(frameId);
		if (canvasEl) {
			const ctx = canvasEl.getContext('2d');
			ctx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
		}
		particles = [];
	}

	function switchPreset(key: string) {
		activePreset = key;
		particleCount = PRESETS[key].count;
		speedMultiplier = 1;
		if (isRunning) {
			stopSimulation();
			startSimulation();
		}
	}

	onMount(() => {
		if (!canvasEl) return;
		const container = canvasEl.parentElement;
		if (container) {
			canvasWidth = container.clientWidth;
			canvasHeight = 300;
			canvasEl.width = canvasWidth;
			canvasEl.height = canvasHeight;
		}
		startSimulation();

		return () => {
			isRunning = false;
			cancelAnimationFrame(frameId);
		};
	});
</script>

<div class="max-w-3xl mx-auto py-8 px-6">
	<!-- Header -->
	<div class="flex items-center gap-3 mb-6">
		<div class="w-10 h-10 rounded-lg bg-orange-500/15 flex items-center justify-center">
			<Icon name="sparkles" size={22} />
		</div>
		<div>
			<h1 class="text-xl font-bold m-0">Particle Animation</h1>
			<p class="text-xs opacity-50 m-0">Canvas-based particle system with configurable presets</p>
		</div>
	</div>

	<!-- Canvas viewport -->
	<div class="mb-6 border border-sand-dark rounded-lg overflow-hidden bg-black/40 relative">
		<canvas bind:this={canvasEl} class="block w-full" style="height: 300px;"></canvas>
		<div class="absolute top-2 right-2 text-[10px] opacity-30 font-mono">
			{particles.length} particles | {isRunning ? 'running' : 'stopped'}
		</div>
	</div>

	<!-- Presets -->
	<section class="mb-6">
		<h2 class="text-sm font-semibold m-0 mb-3">Presets</h2>
		<div class="flex flex-wrap gap-2">
			{#each Object.entries(PRESETS) as [key, preset]}
				<button
					class="px-3 py-1.5 text-xs rounded-md border transition-colors"
					class:border-accent={activePreset === key}
					class:bg-accent={activePreset === key}
					class:text-white={activePreset === key}
					class:border-sand-dark={activePreset !== key}
					onclick={() => switchPreset(key)}
				>{preset.label}</button>
			{/each}
		</div>
	</section>

	<!-- Controls -->
	<section class="mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-3">Controls</h2>
		<div class="grid grid-cols-2 gap-4 mb-4">
			<label class="text-xs">
				<span class="opacity-60">Particle count: {particleCount}</span>
				<input
					type="range" min="5" max="100" bind:value={particleCount}
					class="w-full mt-1"
					oninput={() => { if (isRunning) { stopSimulation(); startSimulation(); } }}
				/>
			</label>
			<label class="text-xs">
				<span class="opacity-60">Speed: {speedMultiplier.toFixed(1)}x</span>
				<input type="range" min="0.1" max="3" step="0.1" bind:value={speedMultiplier} class="w-full mt-1" />
			</label>
		</div>
		<div class="flex gap-2">
			<button
				class="px-3 py-1.5 text-xs rounded-md border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors"
				onclick={startSimulation}
				disabled={isRunning}
			>
				<Icon name="play" size={12} /> Start
			</button>
			<button
				class="px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
				onclick={stopSimulation}
				disabled={!isRunning}
			>
				<Icon name="square" size={12} /> Stop
			</button>
		</div>
	</section>

	<!-- CSS-only alternative -->
	<section class="mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-3 flex items-center gap-2">
			<Icon name="palette" size={14} />
			CSS-Only Particles (Wizard Style)
		</h2>
		<p class="text-xs opacity-60 m-0 mb-3">
			The onboarding wizard uses pure CSS animations for particles — no canvas needed. Lighter weight, SSR safe.
		</p>
		<div class="css-particles-demo">
			{#each Array(12) as _, i}
				<div
					class="css-particle"
					style="
						--delay: {i * 0.3}s;
						--x: {Math.random() * 100}%;
						--y: {Math.random() * 100}%;
						--size: {3 + Math.random() * 4}px;
						--duration: {3 + Math.random() * 4}s;
					"
				></div>
			{/each}
		</div>
	</section>

	<!-- Code -->
	<section class="p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-2 flex items-center gap-2">
			<Icon name="code" size={14} />
			CSS Particle Keyframes
		</h2>
		<pre class="text-[11px] leading-relaxed bg-black/30 p-3 rounded-md overflow-x-auto m-0"><code>{`.particle {
  position: absolute;
  width: var(--size);
  height: var(--size);
  left: var(--x);
  top: var(--y);
  background: radial-gradient(circle,
    rgba(99, 179, 237, 0.6),
    rgba(128, 90, 213, 0.3));
  border-radius: 50%;
  animation: drift var(--duration) ease-in-out
             var(--delay) infinite;
  opacity: 0;
}
@keyframes drift {
  0%   { opacity: 0; transform: translateY(0) scale(0.5); }
  20%  { opacity: 0.8; }
  80%  { opacity: 0.4; }
  100% { opacity: 0; transform: translateY(-60px) scale(1.2); }
}`}</code></pre>
	</section>
</div>

<style>
	.css-particles-demo {
		position: relative;
		height: 120px;
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.3);
		overflow: hidden;
	}

	.css-particle {
		position: absolute;
		width: var(--size);
		height: var(--size);
		left: var(--x);
		top: var(--y);
		background: radial-gradient(circle, rgba(99, 179, 237, 0.6), rgba(128, 90, 213, 0.3));
		border-radius: 50%;
		animation: css-drift var(--duration) ease-in-out var(--delay) infinite;
		opacity: 0;
	}

	@keyframes css-drift {
		0% { opacity: 0; transform: translateY(0) scale(0.5); }
		20% { opacity: 0.8; }
		80% { opacity: 0.4; }
		100% { opacity: 0; transform: translateY(-60px) scale(1.2); }
	}
</style>
