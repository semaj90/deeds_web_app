<script lang="ts">
  let lodLevel = $state<0 | 1 | 2 | 3>(2);
  let wireframe = $state(false);
  let rotating = $state(true);
  let angle = $state(0);
  let canvas: HTMLCanvasElement | undefined = $state();

  const lodConfigs = [
    { label: "LOD 0 — Full", vertices: 2048, color: "#80ff80", detail: "Full detail mesh" },
    { label: "LOD 1 — High", vertices: 512, color: "#c0ff40", detail: "Reduced mesh" },
    { label: "LOD 2 — Medium", vertices: 128, color: "#ffc040", detail: "Low-poly retro" },
    { label: "LOD 3 — Pixel", vertices: 32, color: "#ff6040", detail: "8-bit sprites" },
  ];

  let currentConfig = $derived(lodConfigs[lodLevel]);

  $effect(() => {
    if (!canvas || !rotating) return;
    let raf: number;
    const draw = () => {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const w = canvas!.width;
      const h = canvas!.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const verts = currentConfig.vertices;
      const sides = Math.max(3, Math.min(verts, 64));
      const radius = Math.min(w, h) * 0.35;

      ctx.strokeStyle = currentConfig.color;
      ctx.lineWidth = wireframe ? 1 : 0;
      ctx.fillStyle = wireframe ? "transparent" : currentConfig.color + "40";

      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = angle + (i / sides) * Math.PI * 2;
        const wobble = 1 + Math.sin(a * 3 + angle) * 0.08;
        const x = cx + Math.cos(a) * radius * wobble;
        const y = cy + Math.sin(a) * radius * wobble * 0.8;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      if (!wireframe) ctx.fill();
      ctx.stroke();

      if (lodLevel >= 2) {
        ctx.fillStyle = currentConfig.color;
        for (let i = 0; i < sides; i++) {
          const a = angle + (i / sides) * Math.PI * 2;
          const x = cx + Math.cos(a) * radius * 0.6;
          const y = cy + Math.sin(a) * radius * 0.48;
          const sz = lodLevel === 3 ? 4 : 2;
          ctx.fillRect(Math.round(x) - sz / 2, Math.round(y) - sz / 2, sz, sz);
        }
      }

      ctx.fillStyle = "#808090";
      ctx.font = "10px monospace";
      ctx.fillText(`V: ${verts}  LOD: ${lodLevel}`, 8, h - 8);

      angle += 0.015;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="lod-processor">
  <div class="lod-header">
    <h3>NES 3D LOD Processor</h3>
    <span class="vertex-count">{currentConfig.vertices} vertices</span>
  </div>

  <div class="canvas-wrap">
    <canvas bind:this={canvas} width={320} height={240}></canvas>
  </div>

  <div class="controls">
    <div class="lod-buttons">
      {#each lodConfigs as cfg, i}
        <button
          class="lod-btn"
          class:active={lodLevel === i}
          style="--lod-color: {cfg.color}"
          onclick={() => (lodLevel = i as 0 | 1 | 2 | 3)}
        >
          {cfg.label}
        </button>
      {/each}
    </div>
    <div class="toggles">
      <label>
        <input type="checkbox" bind:checked={wireframe} />
        Wireframe
      </label>
      <label>
        <input type="checkbox" bind:checked={rotating} />
        Rotate
      </label>
    </div>
  </div>

  <div class="detail-text">{currentConfig.detail}</div>
</div>

<style>
  .lod-processor {
    background: #0a0a1a;
    border: 1px solid #2a2a4a;
    border-radius: 4px;
    padding: 1rem;
    font-family: "Courier New", monospace;
    color: #c0c0e0;
  }
  .lod-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .lod-header h3 { color: #ff8040; font-size: 0.85rem; margin: 0; }
  .vertex-count { font-size: 0.7rem; color: #80ff80; }
  .canvas-wrap {
    border: 1px solid #2a2a4a;
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 0.75rem;
    display: flex;
    justify-content: center;
  }
  canvas { image-rendering: pixelated; display: block; max-width: 100%; }
  .controls { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .lod-buttons { display: flex; gap: 4px; flex-wrap: wrap; }
  .lod-btn {
    background: #1a1a3a;
    color: var(--lod-color, #c0c0e0);
    border: 1px solid #2a2a4a;
    padding: 3px 8px;
    font-family: inherit;
    font-size: 0.65rem;
    cursor: pointer;
    border-radius: 2px;
  }
  .lod-btn.active { background: #2a2a5a; border-color: var(--lod-color); }
  .lod-btn:hover { background: #252550; }
  .toggles { display: flex; gap: 0.75rem; font-size: 0.7rem; color: #a0a0c0; }
  .toggles label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .toggles input { accent-color: #6060c0; }
  .detail-text { margin-top: 0.5rem; font-size: 0.7rem; color: #808090; text-align: center; }
</style>
