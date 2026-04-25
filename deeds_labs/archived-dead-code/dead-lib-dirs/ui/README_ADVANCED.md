# Evidence Board & Sentencing Worksheet

**Advanced YoRHa UI Components for Legal Investigation**

---

## 📋 Two New Components

### 1. **Evidence Board** - Drag & Drop Investigation Tool
### 2. **Sentencing Worksheet** - Interactive Guidelines Calculator

---

## 🗂️ Evidence Board

### Features

✅ **Drag-and-Drop Interface**
- Click and drag evidence cards anywhere on the grid
- Smooth pointer tracking (works with mouse, touch, pen)
- Z-index elevation when dragging
- Auto-save positions to localStorage

✅ **Evidence Card Types**
- 🎥 Video (Blue pill)
- 📄 Document (Default/Gray pill)
- 📷 Photo (Green pill)
- 📝 Note (Yellow pill)

✅ **Grid Background**
- Dotted grid pattern for spatial organization
- YoRHa sand color with dark dots
- Border + shadow for terminal aesthetic

✅ **Actions**
- Add new evidence items
- Reset layout to grid
- View connections (placeholder)

### Usage

```svelte
<script>
 import EvidenceBoard from '$lib/ui/EvidenceBoard.svelte';
</script>

<EvidenceBoard />
```

**Route:** `/evidence`

### Data Structure

```typescript
type EvidenceItem = {
 id: string; // EV-001, EV-002, etc.
 title: string; // "Security Camera – Lobby"
 type: 'video' | 'document' | 'photo' | 'note';
 summary: string; // Brief description
 x: number; // Position on board
 y: number;
};
```

### LocalStorage Persistence

Evidence positions are auto-saved to `localStorage` key: `yorha_evidence_board`

To load saved positions on mount:
```typescript
import { onMount } from 'svelte';

onMount(() => {
 const saved = localStorage.getItem('yorha_evidence_board');
 if (saved) {
 items = JSON.parse(saved);
 }
});
```

### Future Enhancements

- [ ] **Connection Lines** - Draw SVG lines between related evidence
- [ ] **Evidence Modal** - Click to view full details
- [ ] **Export to PDF** - Generate case theory diagram
- [ ] **Backend Sync** - Save to database instead of localStorage
- [ ] **Zoom & Pan** - For larger boards
- [ ] **Snap to Grid** - Optional magnetic grid alignment

---

## ⚖️ Sentencing Worksheet

### Features

✅ **Interactive Factor Selection**
- Click to toggle aggravating factors (+points)
- Click to toggle mitigating factors (−points)
- Visual checkboxes with color coding

✅ **Real-Time Calculation**
- Base offense level input
- Criminal history category input
- Automatically adjusts sentence range
- Displays in months and years

✅ **Federal Sentencing Guidelines**
- Simplified §2L2.1 calculations
- Aggravating factors (+2 to +4 levels)
- Mitigating factors (−2 to −4 levels)
- Color-coded adjustments (red for aggravating, green for mitigating)

✅ **Actions**
- Generate sentencing memo (placeholder)
- Compare alternative scenarios
- Export calculations

### Usage

```svelte
<script>
 import SentencingWorksheet from '$lib/ui/SentencingWorksheet.svelte';
</script>

<SentencingWorksheet />
```

**Route:** `/sentencing`

### Built-in Factors

**Aggravating (+):**
- Multiple victims (15+) → +4
- Vulnerable victims → +2
- Extended duration (2+ years) → +3
- Use of coercion → +2
- Leadership role → +4

**Mitigating (−):**
- Acceptance of responsibility → −3
- Minimal role → −4
- Mental health condition → −2
- Cooperation with authorities → −2

### Calculation Formula

```
Adjusted Offense Level = Base Level + Aggravating − Mitigating
Sentence Range (months) = (Level × 4-5) + (History × 6-8)
```

### Extending with Your Schema

To wire to your database:

```typescript
type SentencingCalculation = {
 caseId: string;
 offenseLevel: number;
 criminalHistory: number;
 aggravatingFactorIds: string[];
 mitigatingFactorIds: string[];
 adjustedLevel: number;
 rangeMin: number;
 rangeMax: number;
 createdAt: Date;
};

async function saveCalculation(calc: SentencingCalculation) {
 await fetch('/api/sentencing-calculations', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(calc),
 });
}
```

### Future Enhancements

- [ ] **Guideline §§ Selector** - Support multiple offense types
- [ ] **Supervised Release Calculator** - Post-imprisonment terms
- [ ] **Restitution Calculator** - Financial penalties
- [ ] **Comparative Cases** - Show similar sentences
- [ ] **PDF Export** - Print-ready sentencing memo
- [ ] **AI Recommendations** - ML-based factor suggestions

---

## 📁 Files Created

```
src/lib/ui/
├── EvidenceBoard.svelte # Drag-and-drop evidence organizer
├── SentencingWorksheet.svelte # Interactive guideline calculator
└── README_ADVANCED.md # This file

src/routes/(yorha)/
├── evidence/+page.svelte # Evidence board page
└── sentencing/+page.svelte # Sentencing worksheet page
```

---

## 🎨 Styling Notes

### Evidence Board Grid

```css
.evidence-grid {
 background-color: #d4c7a3; /* Sand */
 background-image: radial-gradient(
 circle at 1px 1px,
 rgba(0, 0, 0, 0.25) 1px,
 transparent 0
 );
 background-size: 24px 24px;
 border: 1px solid rgba(0, 0, 0, 0.6);
 box-shadow: 0 0 0 2px #000;
}
```

### Factor Checkboxes

```svelte
<!-- Aggravating (Red) -->
<div class="w-4 h-4 rounded border
 {selected ? 'bg-danger ring-2 ring-danger/50' : 'bg-sandDark'}">
 {#if selected}
 <span class="i-heroicons-check text-white" />
 {/if}
</div>

<!-- Mitigating (Green) -->
<div class="w-4 h-4 rounded border
 {selected ? 'bg-accent ring-2 ring-accent/50' : 'bg-sandDark'}">
 {#if selected}
 <span class="i-heroicons-check text-black" />
 {/if}
</div>
```

---

## 🚀 Quick Start

### 1. Install Dependencies (if not already done)

```bash
npm install -D unocss @unocss/preset-uno @unocss/preset-icons
npm install -D @iconify-json/heroicons
```

### 2. Start Dev Server

```bash
npm run dev
```

### 3. Navigate to Pages

- **Evidence Board:** `http://localhost:5173/evidence`
- **Sentencing Worksheet:** `http://localhost:5173/sentencing`

---

## 🎯 Integration Examples

### Connecting Evidence to Cases

```svelte
<script lang="ts">
 import { page } from '$app/stores';
 import EvidenceBoard from '$lib/ui/EvidenceBoard.svelte';

 $: caseId = $page.params.caseId;

 // Load evidence for specific case
 async function loadCaseEvidence(id: string) {
 const res = await fetch(`/api/cases/${id}/evidence`);
 return await res.json();
 }
</script>

{#await loadCaseEvidence(caseId)}
 <p>Loading evidence...</p>
{:then items}
 <EvidenceBoard {items} />
{:catch error}
 <p>Error: {error.message}</p>
{/await}
```

### Generating Sentencing Memo

```typescript
async function generateSentencingMemo() {
 const data = {
 caseId,
 offenseLevel: adjustedOffenseLevel,
 aggravatingFactors: selectedAggravating,
 mitigatingFactors: selectedMitigating,
 sentencingRange,
 };

 const res = await fetch('/api/sentencing/generate-memo', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(data),
 });

 const { memoUrl } = await res.json();
 window.open(memoUrl, '_blank');
}
```

### Adding Evidence Connections

To draw lines between evidence cards:

```svelte
<svg class="absolute inset-0 pointer-events-none">
 {#each connections as conn}
 <line
 x1={items.find(i => i.id === conn.from)?.x + 130}
 y1={items.find(i => i.id === conn.from)?.y + 60}
 x2={items.find(i => i.id === conn.to)?.x + 130}
 y2={items.find(i => i.id === conn.to)?.y + 60}
 stroke="#4ade80"
 stroke-width="2"
 stroke-dasharray="4 4"
 />
 {/each}
</svg>
```

---

## 🔧 Customization

### Change Evidence Card Width

```svelte
<!-- In EvidenceBoard.svelte -->
<div
 class="absolute w-[300px] ..." <!-- Change from 260px -->
 ...
>
```

### Add Custom Evidence Types

```typescript
type EvidenceType =
 | 'video'
 | 'document'
 | 'photo'
 | 'note'
 | 'audio' // New
 | 'forensic' // New
 | 'testimony'; // New
```

### Customize Sentencing Factors

```typescript
// Add your own factors
let customAggravatingFactors: AggravatingFactor[] = [
 { id: 'AG-CUSTOM-1', description: 'Repeat offender', points: 5, selected: false },
 { id: 'AG-CUSTOM-2', description: 'Destruction of evidence', points: 3, selected: false },
];
```

---

## 🎮 YoRHa Design Consistency

Both components follow YoRHa principles:

- ✅ Sand background (`#d4c7a3`)
- ✅ Dark panels (`#24211b`, `#2f2a22`)
- ✅ Monospace fonts (Fira Code)
- ✅ Extra-wide letter spacing
- ✅ NES-style borders & shadows
- ✅ Color-coded status (green = good, red = danger, yellow = caution)
- ✅ Uppercase labels with tracking
- ✅ Custom scrollbars

---

## 📝 Accessibility

### Evidence Board
- Drag works with mouse, touch, and pen
- Keyboard navigation not yet implemented
- Consider adding: arrow key movement, Enter to select

### Sentencing Worksheet
- All factors keyboard accessible (Tab, Space/Enter to toggle)
- Inputs have proper labels
- Color coded + text labels (not color-only)

**TODO:** Add ARIA labels for screen readers

---

## 🚧 Known Limitations

### Evidence Board
- No collision detection (cards can overlap)
- No undo/redo
- No multi-select
- LocalStorage only (no backend sync yet)

### Sentencing Worksheet
- Simplified calculation (real guidelines are more complex)
- Only one guideline section (§2L2.1)
- No fine-grained adjustment levels
- No backend persistence

---

**Built for prosecutors, investigators, and legal professionals. 🎮⚖️**

**Next:** Add SVG connection lines between evidence items? Or build the Person of Interest card component?
