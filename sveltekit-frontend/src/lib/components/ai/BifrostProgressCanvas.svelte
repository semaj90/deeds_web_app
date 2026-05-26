<script lang="ts">
  import { onMount } from 'svelte';
  import { aiOsState } from '$lib/state/ai-os-state.svelte';

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;

    function draw() {
      frame++;
      
      const w = canvas.width;
      const h = canvas.height;
      const p = Math.max(0, Math.min(1, aiOsState.progress));

      ctx.fillStyle = '#0f172a'; // dark theme background
      ctx.fillRect(0, 0, w, h);

      // Render progress bar background
      ctx.strokeStyle = '#38bdf8'; // light blue border
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      // Render actual progress bar fill
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(8, 8, (w - 16) * p, h - 16);

      // Render text
      ctx.fillStyle = '#f8fafc';
      ctx.font = '12px monospace';
      ctx.fillText(`${aiOsState.phase.toUpperCase()} ${Math.round(p * 100)}%`, 16, h / 2 + 4);

      requestAnimationFrame(draw);
    }

    draw();
  });
</script>

<canvas bind:this={canvas} width="320" height="64" class="rounded border border-slate-700 shadow-lg" />
