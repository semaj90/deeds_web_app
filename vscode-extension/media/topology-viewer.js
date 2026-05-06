/**
 * topology-viewer.js — WebGPU-accelerated force layout with Canvas 2D render.
 *
 * Architecture:
 *   • Canvas 2D  — authoritative renderer (always works)
 *   • WebGPU compute — optional: runs force simulation on GPU if navigator.gpu exists
 *     Falls back to CPU spring-electrical layout without any error or flash.
 *
 * Canonical topology positions come from the backend (LibTorch/Qdrant).
 * This viewer uses those as stable initial positions and allows interactive
 * drag/zoom without mutating any stored state.
 *
 * Messages from extension host:
 *   { type: 'loadData',     nodes, edges, clusters }
 *   { type: 'highlight',    ids: string[] }
 *   { type: 'requestState' }
 *
 * Messages to extension host (via vscode.postMessage):
 *   { type: 'nodeSelected', id: string }
 *   { type: 'stateUpdate',  state: ViewerState }
 */

'use strict';

(function() {
  const vscode = acquireVsCodeApi();

  // ── State ─────────────────────────────────────────────────────────────────
  let state = vscode.getState() || { zoom: 1, panX: 0, panY: 0, selectedId: null };

  // ── Data ─────────────────────────────────────────────────────────────────
  let nodes    = [];
  let edges    = [];
  let clusters = [];
  let highlighted = new Set();

  // ── Canvas setup ─────────────────────────────────────────────────────────
  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Cluster colour palette (VS Code theme-aware via CSS vars) ────────────
  const PALETTE = [
    '#4e9af1','#f1884e','#56d364','#e879f9','#ffd33d',
    '#f97583','#79c0ff','#56d364','#e3b341','#a371f7',
    '#d2a8ff','#ff7b72','#7ee787','#58a6ff','#ffa657',
  ];
  function clusterColor(cid) {
    const i = ((cid ?? 0) % PALETTE.length + PALETTE.length) % PALETTE.length;
    return PALETTE[i];
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  // Position nodes.  Uses topology_positions from payload when available,
  // otherwise runs a lightweight spring-electrical CPU simulation.

  let simNodes = []; // { x, y, vx, vy, id, cluster }

  function initLayout() {
    if (nodes.length === 0) { simNodes = []; return; }

    const hasPos = nodes[0] && nodes[0].x !== undefined;

    if (hasPos) {
      // Normalise to [-1, 1]
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
      const rx = (maxX - minX) || 1, ry = (maxY - minY) || 1;
      simNodes = nodes.map(n => ({
        id: n.id ?? n.file ?? '', cluster: n.cluster ?? 0,
        label: (n.file ?? n.id ?? '').split('/').pop() ?? '',
        x: ((n.x - minX) / rx * 2 - 1) * 400,
        y: ((n.y - minY) / ry * 2 - 1) * 400,
        vx: 0, vy: 0,
      }));
    } else {
      // Random circle placement, then simulate
      simNodes = nodes.map((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2;
        const r     = 200 + Math.random() * 100;
        return {
          id: n.id ?? n.file ?? '', cluster: n.cluster ?? 0,
          label: (n.file ?? n.id ?? '').split('/').pop() ?? '',
          x: Math.cos(angle) * r, y: Math.sin(angle) * r,
          vx: 0, vy: 0,
        };
      });
      runCpuSimulation(80);
    }
  }

  function runCpuSimulation(steps) {
    const k    = 60;   // spring rest length
    const rep  = 8000; // repulsion strength
    const damp = 0.85;
    const n    = simNodes.length;

    // Build edge adjacency for spring forces
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source).push(e.target);
      adj.get(e.target).push(e.source);
    }
    const idxMap = new Map(simNodes.map((n, i) => [n.id, i]));

    for (let step = 0; step < steps; step++) {
      const temp = 1 - step / steps;
      for (let i = 0; i < n; i++) {
        let fx = 0, fy = 0;
        const a = simNodes[i];

        // Repulsion from all other nodes (O(n²) — capped at 500 nodes)
        for (let j = 0; j < Math.min(n, 500); j++) {
          if (i === j) continue;
          const b = simNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy + 0.001;
          fx += (rep / d2) * dx;
          fy += (rep / d2) * dy;
        }

        // Attraction along edges
        const neighbours = adj.get(a.id) ?? [];
        for (const nid of neighbours) {
          const j = idxMap.get(nid);
          if (j === undefined) continue;
          const b = simNodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d  = Math.sqrt(dx*dx + dy*dy) + 0.001;
          const f  = (d - k) / d * 0.5;
          fx += f * dx; fy += f * dy;
        }

        a.vx = (a.vx + fx * 0.02) * damp * temp + a.vx * (1 - temp);
        a.vy = (a.vy + fy * 0.02) * damp * temp + a.vy * (1 - temp);
      }
      for (const sn of simNodes) { sn.x += sn.vx; sn.y += sn.vy; }
    }
  }

  // ── WebGPU compute (layout boost when available) ─────────────────────────
  // Runs additional force iterations on GPU after CPU pre-layout.
  // Completely optional — Canvas render doesn't depend on this completing.

  async function tryWebGpuBoost() {
    if (!navigator.gpu) return;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return;
      const device  = await adapter.requestDevice();

      const n = simNodes.length;
      if (n < 50) return; // not worth the overhead

      // Pack positions into Float32Array [x0, y0, x1, y1, …]
      const pos = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { pos[i*2] = simNodes[i].x; pos[i*2+1] = simNodes[i].y; }

      const buf = device.createBuffer({ size: pos.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true });
      new Float32Array(buf.getMappedRange()).set(pos);
      buf.unmap();

      const readBuf = device.createBuffer({ size: pos.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

      // Simple repulsion compute shader (WGSL)
      const shader = device.createShaderModule({ code: `
        @group(0) @binding(0) var<storage, read_write> pos: array<f32>;
        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) gid: vec3u) {
          let i = gid.x;
          let n = arrayLength(&pos) / 2u;
          if (i >= n) { return; }
          let ax = pos[i*2u]; let ay = pos[i*2u+1u];
          var fx: f32 = 0.0; var fy: f32 = 0.0;
          for (var j: u32 = 0u; j < min(n, 256u); j++) {
            if (j == i) { continue; }
            let dx = ax - pos[j*2u]; let dy = ay - pos[j*2u+1u];
            let d2 = dx*dx + dy*dy + 0.001;
            fx += 6000.0 / d2 * dx;
            fy += 6000.0 / d2 * dy;
          }
          pos[i*2u]   = ax + fx * 0.01;
          pos[i*2u+1u] = ay + fy * 0.01;
        }
      `});

      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shader, entryPoint: 'main' }
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: buf } }]
      });

      // 5 GPU passes
      for (let pass = 0; pass < 5; pass++) {
        const enc = device.createCommandEncoder();
        const cp  = enc.beginComputePass();
        cp.setPipeline(pipeline);
        cp.setBindGroup(0, bindGroup);
        cp.dispatchWorkgroups(Math.ceil(n / 64));
        cp.end();
        enc.copyBufferToBuffer(buf, 0, readBuf, 0, pos.byteLength);
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
      }

      // Read back
      await readBuf.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(readBuf.getMappedRange());
      for (let i = 0; i < n; i++) { simNodes[i].x = result[i*2]; simNodes[i].y = result[i*2+1]; }
      readBuf.unmap();

      buf.destroy(); readBuf.destroy();
      draw(); // re-render with improved positions
    } catch { /* WebGPU failed — Canvas render already showing CPU layout */ }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const R_NODE = 5;

  function worldToScreen(wx, wy) {
    const cx = canvas.width  / 2 + state.panX;
    const cy = canvas.height / 2 + state.panY;
    return [cx + wx * state.zoom, cy + wy * state.zoom];
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (simNodes.length === 0) {
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground') || '#888';
      ctx.font = '13px var(--vscode-font-family, sans-serif)';
      ctx.textAlign = 'center';
      ctx.fillText('No graph data loaded', canvas.width/2, canvas.height/2);
      return;
    }

    // Edges
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    const idxMap = new Map(simNodes.map((n, i) => [n.id, i]));
    for (const e of edges.slice(0, 2000)) {
      const si = idxMap.get(e.source), ti = idxMap.get(e.target);
      if (si === undefined || ti === undefined) continue;
      const [sx, sy] = worldToScreen(simNodes[si].x, simNodes[si].y);
      const [tx, ty] = worldToScreen(simNodes[ti].x, simNodes[ti].y);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
    }

    // Nodes
    for (const sn of simNodes) {
      const [sx, sy] = worldToScreen(sn.x, sn.y);
      const r = R_NODE * state.zoom;
      if (sx < -r || sx > canvas.width + r || sy < -r || sy > canvas.height + r) continue;

      const isSelected   = sn.id === state.selectedId;
      const isHighlighted = highlighted.has(sn.id);
      const baseR = isSelected ? r * 1.8 : r;

      ctx.beginPath();
      ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
      ctx.fillStyle = isSelected   ? '#fff'
                    : isHighlighted ? '#ffd33d'
                    : clusterColor(sn.cluster);
      ctx.globalAlpha = isHighlighted || isSelected ? 1 : 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isSelected) {
        ctx.strokeStyle = clusterColor(sn.cluster);
        ctx.lineWidth   = 2;
        ctx.stroke();
      }

      // Label when zoomed in
      if (state.zoom > 2.5 && sn.label) {
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc';
        ctx.font      = `${Math.min(11, 9 * state.zoom / 3)}px var(--vscode-font-family, sans-serif)`;
        ctx.textAlign = 'left';
        ctx.fillText(sn.label, sx + baseR + 2, sy + 4);
      }
    }
  }

  // ── Hit-test ─────────────────────────────────────────────────────────────

  function hitNode(px, py) {
    const r2 = (R_NODE * state.zoom + 4) ** 2;
    const cx = canvas.width / 2 + state.panX;
    const cy = canvas.height / 2 + state.panY;
    for (const sn of simNodes) {
      const sx = cx + sn.x * state.zoom;
      const sy = cy + sn.y * state.zoom;
      if ((px-sx)**2 + (py-sy)**2 <= r2) return sn;
    }
    return null;
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  let drag = null; // { startX, startY, startPanX, startPanY }

  canvas.addEventListener('mousedown', e => {
    drag = { startX: e.clientX, startY: e.clientY, startPanX: state.panX, startPanY: state.panY };
  });

  canvas.addEventListener('mousemove', e => {
    if (!drag) return;
    state.panX = drag.startPanX + (e.clientX - drag.startX);
    state.panY = drag.startPanY + (e.clientY - drag.startY);
    draw();
  });

  canvas.addEventListener('mouseup', e => {
    const moved = drag && (Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4);
    drag = null;
    if (!moved) {
      const hit = hitNode(e.clientX, e.clientY);
      if (hit) {
        state.selectedId = hit.id;
        vscode.postMessage({ type: 'nodeSelected', id: hit.id, label: hit.label, cluster: hit.cluster });
        saveState();
      } else {
        state.selectedId = null;
      }
      draw();
    }
    saveState();
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    state.zoom = Math.max(0.2, Math.min(10, state.zoom * factor));
    draw();
    saveState();
  }, { passive: false });

  function saveState() {
    vscode.setState(state);
    vscode.postMessage({ type: 'stateUpdate', state });
  }

  // ── Extension host messages ───────────────────────────────────────────────

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'loadData') {
      nodes    = msg.nodes    ?? [];
      edges    = msg.edges    ?? [];
      clusters = msg.clusters ?? [];
      initLayout();
      draw();
      tryWebGpuBoost(); // non-blocking — updates positions if GPU is available
    } else if (msg.type === 'highlight') {
      highlighted = new Set(msg.ids ?? []);
      draw();
    } else if (msg.type === 'requestState') {
      saveState();
    }
  });

})();
