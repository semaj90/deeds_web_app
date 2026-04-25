# Y or

Ha Legal AI Prosecutor UI Kit

**A NES/Terminal-style UI system for SvelteKit 2 + Svelte 5**

Inspired by NieR:Automata's YoRHa aesthetic with sand/beige colors, monospace fonts, and retro button shadows.

---

## 🎨 Design System

### Colors

```typescript
sand: '#d4c7a3' // Main background
sandDark: '#b9aa86' // Sidebar, inputs
panel: '#24211b' // Dark panels
panelSoft: '#2f2a22' // Softer dark panels
accent: '#4ade80' // Primary actions (green)
accentSoft: '#a3e635' // Hover state
danger: '#ef4444' // Destructive actions
warning: '#facc15' // Warnings, pending
info: '#38bdf8' // Info messages
```

### Typography

- **UI Font:** IBM Plex Sans
- **Mono Font:** Fira Code
- **Letter Spacing:** Extra wide tracking for terminal feel

---

## 📦 Components

### Button

```svelte
<Button variant="primary">Submit</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger" disabled>Delete</Button>
```

**Variants:** `primary`, `secondary`, `danger`

### Tag / StatusPill

```svelte
<Tag color="green">Low Risk</Tag>
<Tag color="red">High Priority</Tag>
<StatusPill risk="high" status="active" />
```

**Tag colors:** `default`, `green`, `red`, `yellow`, `blue`
**Risk levels:** `low`, `medium`, `high`
**Status:** `active`, `pending`, `closed`

### Card

```svelte
<Card clickable onclick={() => console.log('clicked')}>
 <h3>Case Title</h3>
 <p>Case details...</p>
</Card>
```

**Props:** `clickable: boolean`, `onclick: () => void`

### Panel

```svelte
<Panel>
 <h2>Section Title</h2>
 <p>Content in a dark panel...</p>
</Panel>
```

### ChatBubble

```svelte
<ChatBubble role="assistant" timestamp="19:03:15">
 Analyzing case evidence...
</ChatBubble>

<ChatBubble role="user" timestamp="19:03:10">
 What are the aggravating factors?
</ChatBubble>
```

**Roles:** `assistant`, `user`

---

## 🏗️ Layout Components

### LayoutShell

Combines Sidebar + TopBar + main content area:

```svelte
<!-- +layout.svelte -->
<script>
 import LayoutShell from '$lib/ui/LayoutShell.svelte';
</script>

<LayoutShell>
 <slot />
</LayoutShell>
```

### Sidebar

Auto-generated navigation from `navItems` array.
Highlights active route using `$page.url.pathname`.

### TopBar

Displays page title, global search, and auth buttons.

---

## 🚀 Demo Pages

### Command Center (`/command`)

Prosecutor dashboard with:
- Case statistics (3 stat cards)
- Active cases list with risk/status pills
- System status feed
- Quick action buttons

**Features:**
- Clickable case cards
- Color-coded risk indicators
- System health monitoring

### Terminal (`/terminal`)

AI chat interface with:
- Message history (assistant + user bubbles)
- Input form with send button
- Terminal-style header with mode toggles

**Features:**
- Scrollable chat history
- Clear/reset actions
- Keyboard-accessible input

---

## 🎮 UnoCSS Shortcuts

Common patterns for quick styling:

```html
<div class="app-bg"> <!-- Sand background + UI font -->
<div class="panel"> <!-- Dark panel with border + shadow -->
<div class="panel-soft"> <!-- Softer dark panel -->
<div class="btn-primary"> <!-- Green accent button -->
<div class="btn-secondary"> <!-- Dark gray button -->
<div class="btn-danger"> <!-- Red destructive button -->
<div class="tag"> <!-- Small pill/badge -->
<div class="pill-green"> <!-- Green status indicator -->
<div class="heading-main"> <!-- Large uppercase heading -->
<div class="heading-sub"> <!-- Small uppercase subheading -->
<div class="scroll-panel"> <!-- Scrollable panel with custom scrollbar -->
```

---

## 📁 File Structure

```
src/
├── app.css # Global styles + UnoCSS
├── lib/ui/
│ ├── Button.svelte
│ ├── Tag.svelte
│ ├── StatusPill.svelte
│ ├── Card.svelte
│ ├── Panel.svelte
│ ├── Sidebar.svelte
│ ├── TopBar.svelte
│ ├── ChatBubble.svelte
│ └── LayoutShell.svelte
├── routes/(yorha)/
│ ├── +layout.svelte # Applies LayoutShell
│ ├── command/+page.svelte # Command Center dashboard
│ └── terminal/+page.svelte # AI Chat interface
└── unocss.config.ts # Theme + shortcuts
```

---

## 🛠️ Installation & Setup

### 1. Install Dependencies

```bash
npm install -D unocss @unocss/preset-uno @unocss/preset-attributify @unocss/preset-icons
npm install -D @iconify-json/heroicons
```

### 2. Add to `vite.config.ts`

```typescript
import UnoCSS from 'unocss/vite'

export default defineConfig({
 plugins: [
 UnoCSS(),
 sveltekit()
 ]
})
```

### 3. Import in `src/app.html`

```html
<head>
 <!-- ... -->
 <link rel="stylesheet" href="/@unocss.css">
</head>
```

### 4. View Demo Pages

```bash
npm run dev
```

Then navigate to:
- `http://localhost:5173/command` - Command Center
- `http://localhost:5173/terminal` - AI Terminal

---

## 🎯 Usage Examples

### Building a Case Detail Page

```svelte
<script>
 import Panel from '$lib/ui/Panel.svelte';
 import Button from '$lib/ui/Button.svelte';
 import StatusPill from '$lib/ui/StatusPill.svelte';
</script>

<div class="grid grid-cols-[2fr_1fr] gap-4">
 <Panel>
 <div class="heading-sub mb-3">Case Overview</div>
 <StatusPill risk="high" status="active" />
 <p class="mt-3 text-sm leading-relaxed">
 Investigation into corporate espionage...
 </p>
 <Button variant="primary" class="mt-4">View Evidence</Button>
 </Panel>

 <Panel>
 <div class="heading-sub mb-3">Related Cases</div>
 <!-- ... -->
 </Panel>
</div>
```

### Evidence Board with Cards

```svelte
<div class="grid grid-cols-3 gap-3">
 {#each evidenceItems as item}
 <Card clickable onclick={() => viewEvidence(item.id)}>
 <div class="text-xs font-mono uppercase text-black/60">{item.type}</div>
 <div class="mt-1 text-sm font-semibold">{item.title}</div>
 <Tag color={item.verified ? 'green' : 'yellow'}>
 {item.verified ? 'Verified' : 'Pending'}
 </Tag>
 </Card>
 {/each}
</div>
```

### AI Sentencing Assistant

```svelte
<Panel>
 <div class="heading-sub mb-3">AI Sentencing Recommendation</div>

 <ChatBubble role="assistant" timestamp={currentTime}>
 Based on Federal Guidelines §2L2.1, recommended range: 15-25 years.

 Aggravating factors:
 - Multiple victims
 - Use of coercion
 - Extended duration
 </ChatBubble>

 <div class="mt-4 flex gap-2">
 <Button variant="primary">Accept Recommendation</Button>
 <Button variant="secondary">Request Analysis</Button>
 </div>
</Panel>
```

---

## 🎨 Customization

### Change Theme Colors

Edit `unocss.config.ts`:

```typescript
theme: {
 colors: {
 sand: '#YOUR_SAND_COLOR',
 panel: '#YOUR_PANEL_COLOR',
 accent: '#YOUR_ACCENT_COLOR',
 }
}
```

### Add New Shortcuts

```typescript
shortcuts: {
 'my-custom-class': 'bg-panel text-sand px-4 py-2 rounded',
}
```

### Extend Components

All components accept `class` prop for additional styling:

```svelte
<Button variant="primary" class="w-full">
 Full Width Button
</Button>
```

---

## 🚧 Next Steps / Roadmap

- [ ] **Sentencing Worksheet Component** - Structured forms for prosecutors
- [ ] **Evidence Board** - Drag-and-drop evidence organization
- [ ] **Timeline Visualizer** - Case chronology chart
- [ ] **Person of Interest Cards** - Suspect/witness profiles
- [ ] **Bits-UI Modal Integration** - For case details, evidence viewer
- [ ] **Dark Mode Toggle** - Switch between sand and dark themes
- [ ] **Accessibility Audit** - Keyboard navigation, ARIA labels
- [ ] **Animation Library** - NES-style transitions and loaders

---

## 📝 Notes

- **Svelte 5 Runes:** Components use `$page` store, can be enhanced with runes
- **TypeScript:** All components have `.ts` types for props
- **UnoCSS:** Just-in-time compilation means zero CSS bundle until used
- **Icons:** Uses Heroicons via `@iconify-json/heroicons`
- **Responsive:** Designed for desktop-first, mobile can be added

---

## 🎮 YoRHa Aesthetic Principles

1. **Monospace Everywhere:** Terminal/retro feel
2. **Wide Letter Spacing:** UPPERCASE tracking for emphasis
3. **NES Button Shadows:** `0_2px_0_0_#000` creates pressed effect
4. **Sand + Black:** Warm beige with dark panels for contrast
5. **Accent Sparingly:** Green for primary actions only
6. **Borders Everywhere:** Define boundaries clearly
7. **Custom Scrollbars:** Match the dark panel aesthetic

---

**Built for prosecutors. Styled like androids. 🤖⚖️**
