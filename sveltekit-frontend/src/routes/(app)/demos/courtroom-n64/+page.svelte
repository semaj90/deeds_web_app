<script lang="ts">
  import { onMount } from 'svelte';
  import type { GameHandle } from '$lib/courtroom/n64/scene';
  let canvas: HTMLCanvasElement;
  let status = $state('Initializing...');
  let dialogue = $state('Fictional case: The Missing Docket. Find the jester and speak to them.');
  let clueCount = $state(0);
  let backend = $state<'webgl'|'webgpu'>('webgl');
  let game: GameHandle | undefined;
  let cancelled = false;
  async function start() {
    game?.dispose(); game = undefined;
    status = 'Loading scene...';
    try {
      const { mountCourtroom } = await import('$lib/courtroom/n64/scene');
      if (cancelled) return;
      const mounted = await mountCourtroom(canvas, { backend, onStatus: text => { if (!cancelled) status = text; } });
      if (cancelled) mounted.dispose(); else game = mounted;
    } catch (e) { status = `Scene error: ${e instanceof Error ? e.message : String(e)}`; }
  }
  function keydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key.toLowerCase() === 'e') dialogue = game?.talk() ?? 'No game loaded';
    if (e.key.toLowerCase() === 'f') { clueCount = game?.evidence() ?? 0; dialogue = clueCount ? 'Evidence collected: missing docket.' : 'Search closer to the judge’s bench.'; }
  }
  onMount(() => { cancelled = false; window.addEventListener('keydown', keydown); void start(); return () => { cancelled = true; window.removeEventListener('keydown', keydown); game?.dispose(); }; });
</script>
<svelte:head><title>Courtroom N64 — Fictional Case</title></svelte:head>
<main class="game" aria-label="Courtroom video game">
  <canvas bind:this={canvas} aria-label="3D courtroom" tabindex="0"></canvas>
  <div class="top"><strong>COURTROOM 64</strong><span>CASE 001 · FICTIONAL</span><span>CLUES {clueCount}/1</span></div>
  <div class="settings"><label for="backend">Renderer</label><select id="backend" bind:value={backend}><option value="webgl">WebGL (stable)</option><option value="webgpu">WebGPU (experimental)</option></select><button onclick={() => void start()}>Reload scene</button></div>
  <section class="dialogue" aria-live="polite"><p>{dialogue}</p><small>WASD / ARROWS: MOVE · DRAG: CAMERA · E: TALK · F: INVESTIGATE</small></section>
  <p class="status" role="status">{status}</p>
</main>
<style>
  .game{position:relative;width:100%;height:100dvh;min-height:500px;overflow:hidden;background:#12141d;color:#f3e9d0;font-family:ui-monospace,monospace}
  canvas{width:100%;height:100%;display:block;touch-action:none}
  .top{position:absolute;top:1rem;left:1rem;right:1rem;display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center;padding:.6rem 1rem;background:#161426dd;border:2px solid #c6a16b;text-shadow:1px 1px black}
  .settings{position:absolute;right:1rem;top:5rem;display:flex;align-items:center;gap:.5rem;background:#161426d9;padding:.6rem}
  select,button{color:#fff;background:#343047;border:1px solid #e3c58a;padding:.4rem;cursor:pointer}
  .dialogue{position:absolute;left:5%;right:5%;bottom:3rem;min-height:5rem;background:#161426ed;border:3px double #e1c17d;padding:1rem 1.5rem;box-shadow:0 6px 0 #100e16}
  .dialogue p{font-size:clamp(1rem,2vw,1.4rem);margin:0 0 .6rem}
  .dialogue small{font-size:.75rem;color:#d6c5a4}
  .status{position:absolute;left:1rem;bottom:.5rem;font-size:.7rem;color:#fff;background:#0009}
  @media(max-width:600px){.settings{top:7rem}.dialogue{bottom:2rem;left:2%;right:2%;padding:.7rem}.top{gap:.5rem}}
</style>
