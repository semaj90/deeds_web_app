# NieR: Automata Legal System Theme

A comprehensive design system inspired by NieR: Automata's distinctive visual aesthetics, combined with Harvard Crimson accents for a unique legal tech application.

## 🎨 Design Philosophy

This theme merges the cyberpunk, minimalist aesthetics of NieR: Automata with professional legal system requirements:

- **Monochromatic Base**: Deep blacks and bright whites create stark contrast
- **Digital Accents**: Neon green highlights evoke terminal interfaces
- **Harvard Crimson**: Adds gravitas and authority to legal elements
- **Glitch Effects**: Subtle animations that don't compromise usability

## 🚀 Quick Start

Visit the showcase page to see all components in action:

```bash
npm run dev
# Navigate to http://localhost:5173/nier-showcase
```

## 📦 Installation

The theme is already integrated into the SvelteKit project with:

- **UnoCSS** for utility classes
- **Bits UI** for headless components
- **Melt UI** for advanced interactions
- **Custom CSS** for specialized effects

## 🎯 Core Features

### Color System

#### NieR Palette

- `nier-black`: #0a0a0a
- `nier-dark-gray`: #1a1a1a
- `nier-gray`: #2a2a2a
- `nier-light-gray`: #3a3a3a
- `nier-silver`: #c0c0c0
- `nier-white`: #f5f5f5
- `nier-gold`: #d4af37
- `nier-amber`: #ffb000

#### Digital Accents

- `digital-green`: #00ff41 (Primary digital accent)
- `digital-blue`: #0077be
- `digital-purple`: #9d4edd
- `digital-orange`: #ff6b35

#### Harvard Crimson

- `harvard-crimson`: #a51c30
- `harvard-crimson-dark`: #8b1538
- `harvard-crimson-light`: #c5203b

### Component Classes

#### Buttons

```html
<button class="nier-button-primary">Primary Action</button>
<button class="nier-button-crimson">Important Action</button>
<button class="nier-button-gold">Premium Action</button>
<button class="nier-button-digital">Digital Action</button>
<button class="nier-button-outline">Outline Action</button>
<button class="nier-button-holo">Holographic Action</button>
```

#### Cards

```html
<div class="nier-card">
  <!-- Basic card with hover effects -->
</div>

<div class="case-card priority-critical">
  <!-- Legal case card with priority indicator -->
</div>

<div class="nier-card-interactive">
  <!-- Card with scanning light effect on hover -->
</div>
```

#### Inputs

```html
<input class="nier-input" placeholder="Standard input" />

<div class="nier-terminal">
  <input class="nier-terminal-input" placeholder="Terminal style input" />
</div>
```

#### Badges & Status

```html
<span class="nier-badge-success">Active</span>
<span class="nier-badge-warning">Pending</span>
<span class="nier-badge-error">Critical</span>
<span class="nier-badge-info">Information</span>
```

### Special Effects

#### Glitch Text

```html
<h1 class="nier-glitch" data-text="YoRHa Legal System">YoRHa Legal System</h1>
```

#### Matrix Background

```html
<div class="nier-matrix-bg">
  <!-- Content with matrix rain effect -->
</div>
```

#### Data Stream

```html
<div class="nier-data-stream">
  <!-- Content with streaming data effect -->
</div>
```

#### Loading States

```html
<div class="nier-loading">
  <div class="nier-loading-dot"></div>
  <div class="nier-loading-dot"></div>
  <div class="nier-loading-dot"></div>
</div>
```

### Layout Components

#### Glass Panels

```html
<div class="nier-panel">
  <!-- Glassmorphism panel -->
</div>

<div class="nier-glass">
  <!-- Lighter glass effect -->
</div>
```

#### Navigation

```html
<nav class="nier-nav">
  <!-- Sticky navigation with blur -->
</nav>

<aside class="nier-sidebar">
  <a href="#" class="nier-sidebar-item active">Dashboard</a>
  <a href="#" class="nier-sidebar-item">Cases</a>
</aside>
```

### Utility Classes

#### Animations

- `animate-fade-in`: Fade in animation
- `animate-slide-up`: Slide up animation
- `animate-digital-glow`: Digital glow effect
- `animate-crimson-pulse`: Crimson pulse effect

#### Gradients

- `nier-gradient-dark`: Dark gradient
- `nier-gradient-crimson`: Harvard crimson gradient
- `nier-gradient-gold`: Gold gradient
- `nier-gradient-digital`: Digital multi-color gradient

#### Shadows

- `nier-shadow`: Standard shadow
- `nier-glow`: Digital green glow effect

#### Transitions

- `nier-transition`: Smooth transition for all properties
- `nier-hover-lift`: Lift effect on hover
- `nier-active-press`: Press effect on click

## 🧩 Integration with Libraries

### With Bits UI

```svelte
<script>
  import { Button } from 'bits-ui'
</script>

<Button.Root class="nier-button-primary">
  <Button.Content>Bits UI Button</Button.Content>
</Button.Root>
```

### With Melt UI

```svelte
<script>
  import { createDialog, melt } from '@melt-ui/svelte'

  const dialog = createDialog()
</script>

<button use:melt={$dialog.trigger} class="nier-button-digital">
  Open Dialog
</button>
```

## 🌗 Dark Mode

The theme includes full dark mode support:

```javascript
// Toggle dark mode
const toggleDarkMode = () => {
  const isDark = document.documentElement.classList.contains("dark");

  if (isDark) {
    document.documentElement.classList.remove("dark");
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }
};
```

## 📱 Responsive Design

Built-in responsive utilities:

- `nier-hide-mobile`: Hide on mobile devices
- `nier-hide-desktop`: Hide on desktop
- `nier-stack-mobile`: Stack elements on mobile
- `nier-full-mobile`: Full width on mobile

## ♿ Accessibility

The theme includes accessibility features:

- High contrast ratios meeting WCAG AA standards
- Focus visible states with custom styling
- Skip links for keyboard navigation
- Proper ARIA labels on interactive elements

## 🎮 Legal-Specific Components

### Case Cards

Specialized cards for legal cases with:

- Priority indicators
- Status badges
- Progress tracking
- Evidence counters

### Evidence Chain

Visual representation of evidence verification:

```html
<div class="evidence-chain">
  <div class="evidence-node verified">1</div>
  <div class="evidence-node verified">2</div>
  <div class="evidence-node">3</div>
</div>
```

## 🛠️ Customization

### Adding New Colors

Edit `uno.config.ts`:

```javascript
theme: {
  colors: {
    nier: {
      'custom': '#hexcolor'
    }
  }
}
```

### Creating New Components

Follow the naming convention:

```css
.nier-component-name {
  /* Base styles */
}

.nier-component-name:hover {
  /* Hover states */
}
```

## 📄 File Structure

```
src/
├── app.css                     # Base theme styles
├── app.html                    # HTML template with fonts
├── styles/
│   └── nier-theme.css         # Extended theme styles
├── lib/
│   └── components/
│       ├── NierThemeShowcase.svelte    # Component showcase
│       ├── Header.svelte               # Navigation header
│       ├── cases/
│       │   └── CaseCard.svelte        # Case card component
│       └── ai/
│           └── NierAIAssistant.svelte # AI chat interface
└── routes/
    └── nier-showcase/
        └── +page.svelte       # Demo page
```

## 🚦 Best Practices

1. **Performance**: Use `nier-gpu` class for animated elements
2. **Contrast**: Ensure text has sufficient contrast in both themes
3. **Animation**: Keep animations subtle and purposeful
4. **Consistency**: Use theme variables instead of hardcoded colors
5. **Accessibility**: Always test with keyboard navigation

## 📸 Examples

Visit `/nier-showcase` to see:

- All button variants
- Card components with effects
- Form elements
- AI assistant interface
- Case management layouts
- Animation demonstrations

## 🐛 Troubleshooting

### Fonts not loading

Ensure the Google Fonts links are present in `app.html`

### Dark mode not persisting

Check localStorage implementation in theme toggle

### Animations janky

Add `nier-gpu` class to animated elements

### Colors not applying

Verify UnoCSS is properly configured and running

## 🎯 Future Enhancements

- [ ] Additional glitch effects
- [ ] More complex animations
- [ ] Enhanced accessibility features
- [ ] Mobile-specific components
- [ ] Print style optimizations
- [ ] Theme customizer tool

---

For the glory of mankind! 🤖✨
