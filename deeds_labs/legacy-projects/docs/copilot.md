# Copilot.md - Quick Reference for YoRHa Legal AI

## Stack
- **SvelteKit 2** (latest)
- **Svelte 5** (runes API)
- **bits-ui 2.14.3** (headless components)
- **HTML5 Canvas** (custom graph rendering)
- **TypeScript 5.9.3**

## Svelte 5 Runes Cheat Sheet

```typescript
// Props
let { prop1, prop2 = 'default' } = $props<{ prop1: string; prop2?: string }>();

// State
let count = $state(0);
let user = $state<User | null>(null);

// Derived
let doubled = $derived(count * 2);
let fullName = $derived(() => `${user?.first} ${user?.last}`);

// Effects
$effect(() => {
  console.log('count changed:', count);
});
```

## bits-ui Components

### Dialog
```svelte
<Dialog.Root bind:open={showDialog}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Tooltip
```svelte
<Tooltip.Root open={show}>
  <Tooltip.Trigger />
  <Tooltip.Content>Tooltip text</Tooltip.Content>
</Tooltip.Root>
```

## TypeScript Error Fixing - Quick Reference

### TS1005 Error Position Rule

**Critical:** Error position points to NEXT token, fix goes AFTER PREVIOUS token.

```typescript
// Error at 'arg2' → Fix at end of 'arg1'
foo(arg1 arg2) // TS1005 at 'arg2'
foo(arg1, arg2) // Fix: comma at prevArg.end
```

### Cascade Error Detection

```javascript
// Red flags:
const errorDensity = errors / (lines / 100);
if (errorDensity > 50) {
  return 'MANUAL_REVIEW_REQUIRED';
}
```

### Safe Fixing Pattern

```javascript
// 1. Check context
if (!isSafeToFix(node, parent)) return null;

// 2. Use correct position
const pos = prevNode.end; // NOT node.getStart()

// 3. Validate before/after
if (errorsAfter > errorsBefore) rollback();
```

### Node Position API

```typescript
node.pos           // Includes whitespace (WRONG for insert)
node.getStart()    // Start of token (WRONG for comma)
node.end           // End of token (CORRECT for "append after")
```

### Phase 90/91 Commands

```bash
# Test with auto-rollback
node scripts/phase91-test-run.mjs

# Detect cascade errors
node scripts/phase90-detect-cascade-errors.mjs

# Safe fixing (small batch)
node scripts/phase90-enhanced-ast-fixer.mjs --limit 10
```

### Common Root Causes

```typescript
// 1. Wrong delimiter
const obj = { a: 1; b: 2 }; // Semicolon instead of comma

// 2. Missing delimiter
const arr = [1 2 3]; // Missing commas

// 3. Wrong bracket
const obj = { a: 1); // Paren instead of brace

// 4. Unclosed string
const str = "hello
world"; // Missing closing quote
```

## Canvas Patterns

### Setup
```typescript
let canvas = $state<HTMLCanvasElement | null>(null);
let ctx = $state<CanvasRenderingContext2D | null>(null);

onMount(() => {
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 1200;
  canvas.height = 800;
  render();
});
```

### NES Circle
```typescript
function drawCircle(x: number, y: number, r: number, color: string) {
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
```

## SvelteKit Patterns

### Page Load
```typescript
export const load: PageLoad = async ({ fetch }) => {
  const res = await fetch('/api/data');
  const data = await res.json();
  return { data };
};
```

### API Route
```typescript
export const GET: RequestHandler = async ({ url }) => {
  const id = url.searchParams.get('id');
  return json({ result: 'data' });
};
```

## NES Colors
```typescript
const COLORS = {
  bg: '#0f380f',
  node: '#9bbc0f',
  error: '#8b1e3f',
  cluster: '#306230'
};
```

## Force Layout (Simplified)
```typescript
function layout(nodes, edges, width, height) {
  const k = Math.sqrt((width * height) / nodes.length);

  for (let i = 0; i < 100; i++) {
    // Repulsion
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const dx = nodes[b].x - nodes[a].x;
        const dy = nodes[b].y - nodes[a].y;
        const d = Math.sqrt(dx*dx + dy*dy) || 1;
        const f = (k*k) / d;
        nodes[a].vx -= (dx/d) * f;
        nodes[a].vy -= (dy/d) * f;
        nodes[b].vx += (dx/d) * f;
        nodes[b].vy += (dy/d) * f;
      }
    }

    // Attraction
    edges.forEach(e => {
      const from = nodes.find(n => n.id === e.from);
      const to = nodes.find(n => n.id === e.to);
      if (!from || !to) return;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const f = (d*d) / k;
      from.vx += (dx/d) * f * 0.5;
      from.vy += (dy/d) * f * 0.5;
      to.vx -= (dx/d) * f * 0.5;
      to.vy -= (dy/d) * f * 0.5;
    });

    // Update
    nodes.forEach(n => {
      n.x += n.vx * 0.8;
      n.y += n.vy * 0.8;
      n.vx *= 0.8;
      n.vy *= 0.8;
      n.x = Math.max(50, Math.min(width-50, n.x));
      n.y = Math.max(50, Math.min(height-50, n.y));
    });
  }

  return nodes;
}
```

## Common Mistakes

❌ `let { prop = $state(0) } = $props()` - Don't use $state in props
✅ `let { prop = 0 } = $props()` - Use plain defaults

❌ `export let data` - Old Svelte 4 syntax
✅ `let { data } = $props()` - Svelte 5 runes

❌ `ctx.fillRect(...)` - Might be null
✅ `if (!ctx) return; ctx.fillRect(...)` - Check first

## File Locations

- Components: `src/lib/components/`
- Utils: `src/lib/utils/`
- Routes: `src/routes/`
- APIs: `src/routes/api/`
- Docs: `docs/`

## Phase 90: Cascade Error Detection

**Last Run:** January 8, 2026

**Problem:** "Mashed" syntax (missing delimiters) caused massive cascade errors (87k+).
**Diagnosis:** `scripts/phase90-detect-cascade-errors.mjs`
**Fix:** Manual repair of syntax (semicolons, commas) in high-risk files.

**Known Bad Pattern:**
```typescript
// BAD (Mashed)
key: value: key2: value2

// GOOD
key: value,
key2: value2
```
