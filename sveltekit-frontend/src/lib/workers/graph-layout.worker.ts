/**
 * graph-layout.worker — Spring-charge force-directed layout.
 *
 * Runs the expensive O(n²) repulsion + spring iterations off the main thread
 * so GraphifyViewer stays responsive during layout computation.
 *
 * Protocol:
 *   Input  → { type: 'layout', nodes, edges, W, H, iters? }
 *   Output ← { type: 'done', positions }
 *   Output ← { type: 'error', message }
 */

export interface LayoutNode {
  id: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutInput {
  type: 'layout';
  seq?: number;      // caller's sequence number — echoed back for stale-reply guard
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  W: number;
  H: number;
  iters?: number;
  K?: number;        // spring rest length (default 60)
  REPEL?: number;    // repulsion constant (default 1200)
  DAMP?: number;     // velocity damping (default 0.85)
}

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface LayoutOutput {
  type: 'done';
  seq?: number;      // echoed from input for stale-reply guard
  positions: LayoutPosition[];
}

export interface LayoutError {
  type: 'error';
  seq?: number;
  message: string;
}

function runLayout(input: LayoutInput): LayoutPosition[] {
  const { nodes, edges, W, H } = input;
  const iters  = input.iters  ?? 120;
  const K      = input.K      ?? 60;
  const REPEL  = input.REPEL  ?? 1200;
  const DAMP   = input.DAMP   ?? 0.85;
  const n      = nodes.length;
  if (n === 0) return [];

  const idxMap = new Map(nodes.map((nd, i) => [nd.id, i]));

  // Initial positions on a circle
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    px[i] = W / 2 + Math.cos((i / n) * Math.PI * 2) * 120;
    py[i] = H / 2 + Math.sin((i / n) * Math.PI * 2) * 120;
  }

  for (let iter = 0; iter < iters; iter++) {
    // Repulsion — O(n²)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const f  = REPEL / d2;
        vx[i] -= f * dx; vy[i] -= f * dy;
        vx[j] += f * dx; vy[j] += f * dy;
      }
    }
    // Spring attraction along edges
    for (const e of edges) {
      const si = idxMap.get(e.source);
      const ti = idxMap.get(e.target);
      if (si === undefined || ti === undefined) continue;
      const dx = px[ti] - px[si];
      const dy = py[ti] - py[si];
      const d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const f  = (d - K) / d * 0.1;
      vx[si] += f * dx; vy[si] += f * dy;
      vx[ti] -= f * dx; vy[ti] -= f * dy;
    }
    // Center gravity + damping + position update
    for (let i = 0; i < n; i++) {
      vx[i] += (W / 2 - px[i]) * 0.005;
      vy[i] += (H / 2 - py[i]) * 0.005;
      vx[i] *= DAMP; vy[i] *= DAMP;
      px[i] = Math.max(20, Math.min(W - 20, px[i] + vx[i]));
      py[i] = Math.max(20, Math.min(H - 20, py[i] + vy[i]));
    }
  }

  return Array.from({ length: n }, (_, i) => ({ x: px[i], y: py[i] }));
}

self.onmessage = (e: MessageEvent<LayoutInput | { type: string }>) => {
  const msg = e.data;
  if (msg.type !== 'layout') return;

  const input = msg as LayoutInput;
  try {
    const positions = runLayout(input);
    const out: LayoutOutput = { type: 'done', seq: input.seq, positions };
    self.postMessage(out);
  } catch (err) {
    const out: LayoutError = { type: 'error', seq: input.seq, message: (err as Error).message };
    self.postMessage(out);
  }
};
