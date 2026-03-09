# Claude.md - Working Patterns for YoRHa Legal AI

## Svelte 5 Runes (WORKING ✅)

### Props vs Internal State
```typescript
// ✅ CORRECT: Separate props from internal state
let { open = false, route = null } = $props<{
  open?: boolean;
  route?: RouteDetail | null;
}>();

// Internal state uses $state
let phase72Status = $state<Phase72Status>({ errorCount: 0 });
let loading = $state(false);
```

### Effects
```typescript
// ✅ CORRECT: $effect for side effects
$effect(() => {
  if (open && route) {
    loadStatuses();
  }
});
```

## bits-ui 2.14.3 (WORKING ✅)

### Dialog Pattern
```svelte
<script>
import { Dialog } from 'bits-ui';

let showDialog = $state(false);
</script>

<Dialog.Root bind:open={showDialog}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content class="content">
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Close class="close-btn">Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Tooltip Pattern
```svelte
<script>
import { Tooltip } from 'bits-ui';

let showTooltip = $state(false);
</script>

<Tooltip.Root open={showTooltip}>
  <Tooltip.Trigger />
  <Tooltip.Content class="tooltip">
    Content here
  </Tooltip.Content>
</Tooltip.Root>
```

## HTML5 Canvas (WORKING ✅)

### NES-Style Rendering
```typescript
function drawNESCircle(x: number, y: number, radius: number) {
  if (!ctx) return;

  // Octagonal shape for NES aesthetic
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
```

### Event Handling
```svelte
<canvas
  bind:this={canvas}
  onclick={handleCanvasClick}
  onmousemove={handleCanvasMove}
  onmouseleave={() => {
    hoveredNode = null;
    renderGraph();
  }}
/>
```

## NES Color Palette (WORKING ✅)

```typescript
const NES_COLORS = {
  bg: '#0f380f',        // Dark green background
  node: '#9bbc0f',      // Light green
  error: '#8b1e3f',     // Red
  cluster: '#306230',   // Medium green
  connection: '#0f380f', // Dark green
  highlight: '#f0f0f0', // White
  border: '#000000'     // Black
};
```

## SvelteKit 2 Patterns (WORKING ✅)

### Page Load Function
```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const route = url.searchParams.get('route');

  const res = await fetch('/api/endpoint');
  const data = res.ok ? await res.json() : { fallback: true };

  return {
    data,
    timestamp: new Date().toISOString()
  };
};
```

### API Endpoint
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const param = url.searchParams.get('param');

  return json({
    result: 'data'
  });
};
```

## Force-Directed Layout (WORKING ✅)

```typescript
export function forceDirectedLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  width: number,
  height: number,
  iterations: number = 100
): LayoutNode[] {
  const k = Math.sqrt((width * height) / nodes.length);
  const c_rep = k * k;
  const c_spring = k;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;

    // Repulsive forces
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = c_rep / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attractive forces along edges
    edges.forEach(edge => {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (!from || !to) return;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const force = (dist * dist) / c_spring;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      from.vx += fx * 0.5;
      from.vy += fy * 0.5;
      to.vx -= fx * 0.5;
      to.vy -= fy * 0.5;
    });

    // Update positions
    const damping = 0.8;
    nodes.forEach(node => {
      node.x += node.vx * damping * temp;
      node.y += node.vy * damping * temp;
      node.vx *= damping;
      node.vy *= damping;

      // Bounds checking
      const padding = 50;
      node.x = Math.max(padding, Math.min(width - padding, node.x));
      node.y = Math.max(padding, Math.min(height - padding, node.y));
    });
  }

  return nodes;
}
```

## Common Pitfalls (AVOID ❌)

### DON'T: Use $state in props
```typescript
// ❌ WRONG
let { open = $state(false) } = $props();
```

### DON'T: Forget to check canvas context
```typescript
// ❌ WRONG
function draw() {
  ctx.fillRect(0, 0, 100, 100); // ctx might be null!
}

// ✅ CORRECT
function draw() {
  if (!ctx) return;
  ctx.fillRect(0, 0, 100, 100);
}
```

### DON'T: Use old Svelte 4 syntax
```svelte
<!-- ❌ WRONG (Svelte 4) -->
<script>
export let data;
let count = 0;
</script>

<!-- ✅ CORRECT (Svelte 5) -->
<script>
let { data } = $props();
let count = $state(0);
</script>
```

## Performance Tips

1. **Canvas Rendering**: Only re-render when necessary
2. **Force Layout**: Use fewer iterations (50-100) for real-time
3. **Event Throttling**: Debounce mousemove events if needed
4. **Lazy Loading**: Load graph data on-demand

## File Structure

```
src/
├── lib/
│   ├── components/
│   │   └── NESGraphRenderer.svelte
│   └── utils/
│       └── nesGraphLayout.ts
├── routes/
│   ├── ast_graph_error_analysis/
│   │   ├── +page.svelte
│   │   └── +page.ts
│   └── api/
│       ├── phase72/
│       │   └── errors/
│       │       └── summary/
│       │           └── +server.ts
│       └── phase78/
│           └── ast/
│               └── graph/
│                   └── +server.ts
```
