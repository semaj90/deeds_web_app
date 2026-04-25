# Enhanced-Bits Custom Design Integration Guide

## 🎨 Complete Guide to Custom Design Integration with SSR & TypeScript Barrel Stores

**Context:** Legal AI Platform - SvelteKit 2 + Svelte 5 + Enhanced-Bits UI Library
**Generated:** 2025-09-21 | **Status:** ✅ Production Ready

---

## 🏗️ Custom Design Architecture Overview

The Enhanced-Bits library provides multiple layers for custom design integration while maintaining SSR compatibility and TypeScript safety through barrel exports.

### Architecture Layers

```
Custom Design Integration
├── 1. Design System Layer (Theme Tokens)
├── 2. Component Styling Layer (CSS Variables)
├── 3. Barrel Export Layer (TypeScript Safety)
├── 4. SSR Compatibility Layer (Dynamic Imports)
└── 5. Runtime Integration Layer (Theme Context)
```

---

## 🎯 Core Integration Patterns

### 1. Creating Custom Design Systems

```typescript
// src/lib/themes/my-custom-theme.ts
import { createDesignSystem, type CustomDesignTokens } from '$lib/components/ui/enhanced-bits';

export const MyLegalTheme = createDesignSystem('Legal Professional', {
  colors: {
    primary: '#1e40af',      // Professional blue
    secondary: '#7c3aed',    // Purple accent
    evidence: '#f59e0b',     // Amber for evidence
    ai: '#06b6d4',          // Cyan for AI features
    success: '#10b981',     // Green success
    warning: '#f59e0b',     // Orange warning
    error: '#ef4444',       // Red error
  },
  spacing: {
    xs: '0.125rem',
    sm: '0.375rem',
    md: '0.75rem',
    lg: '1.25rem',
    xl: '2.5rem',
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem'
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75'
    }
  },
  nes: {
    pixelSize: '1px',        // Smooth design
    borderWidth: '2px',      // Subtle borders
    shadowDepth: '3px',      // Professional shadows
  }
}, {
  animations: {
    duration: {
      fast: '100ms',
      normal: '250ms',
      slow: '400ms',
    },
    easing: {
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    }
  }
});
```

### 2. SSR-Safe Theme Application

```typescript
// src/lib/stores/theme-store.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
  type DesignSystem,
  applyDesignSystemToDocument,
  NESDesignSystem
} from '$lib/components/ui/enhanced-bits';
import { MyLegalTheme } from '$lib/themes/my-custom-theme';

// Theme store with SSR safety
export const currentTheme = writable<DesignSystem>(NESDesignSystem);
export const isDarkMode = writable(false);

// Theme registry for dynamic switching
const THEME_REGISTRY = {
  'nes': NESDesignSystem,
  'legal': MyLegalTheme,
  'minimal': MinimalDesignSystem,
} as const;

export type ThemeName = keyof typeof THEME_REGISTRY;

// SSR-safe theme application
export function applyTheme(themeName: ThemeName) {
  const theme = THEME_REGISTRY[themeName];
  currentTheme.set(theme);

  if (browser) {
    applyDesignSystemToDocument(theme);
    localStorage.setItem('enhanced-bits-theme', themeName);
  }
}

// Initialize theme on client
export function initializeTheme() {
  if (browser) {
    const savedTheme = localStorage.getItem('enhanced-bits-theme') as ThemeName;
    if (savedTheme && THEME_REGISTRY[savedTheme]) {
      applyTheme(savedTheme);
    }
  }
}
```

### 3. Component-Level Custom Styling

```svelte
<!-- src/lib/components/custom/MyEvidenceCard.svelte -->
<script lang="ts">
  import { Card, CardHeader, CardTitle, CardContent, Button } from '$lib/components/ui/enhanced-bits';
  import { createComponentVariant } from '$lib/components/ui/enhanced-bits/custom-design-integration';

  interface Props {
    title: string;
    confidence: number;
    variant?: 'default' | 'highlighted' | 'critical';
    customStyles?: Record<string, string>;
  }

  let { title, confidence, variant = 'default', customStyles = {} }: Props = $props();

  // Create dynamic styling based on confidence and variant
  let cardStyles = $derived(() => {
    const baseStyles = {
      border: '2px solid var(--enhanced-bits-evidence)',
      backgroundColor: 'var(--enhanced-bits-background)',
      transition: 'all var(--enhanced-bits-duration-normal)',
    };

    const variantStyles = {
      default: {},
      highlighted: {
        borderColor: 'var(--enhanced-bits-primary)',
        boxShadow: '0 0 20px var(--enhanced-bits-primary)',
      },
      critical: {
        borderColor: 'var(--enhanced-bits-error)',
        backgroundColor: 'color-mix(in srgb, var(--enhanced-bits-error) 10%, transparent)',
      }
    };

    const confidenceStyles = confidence > 0.8 ? {
      borderWidth: '3px',
    } : confidence < 0.5 ? {
      opacity: '0.8',
      filter: 'grayscale(0.2)',
    } : {};\n
    return createComponentVariant(\n      { ...baseStyles, ...confidenceStyles },\n      'custom',\n      { ...variantStyles[variant], ...customStyles }\n    );\n  });\n</script>\n\n<Card style={Object.entries(cardStyles).map(([k, v]) => `${k}: ${v}`).join('; ')}>\n  <CardHeader>\n    <CardTitle class=\"flex items-center justify-between\">\n      {title}\n      <span class=\"text-sm opacity-75\">\n        {Math.round(confidence * 100)}% confidence\n      </span>\n    </CardTitle>\n  </CardHeader>\n  <CardContent>\n    <!-- Evidence content -->\n    <div class=\"evidence-confidence-bar\" \n         style=\"width: {confidence * 100}%; background: var(--enhanced-bits-evidence);\">\n    </div>\n  </CardContent>\n</Card>\n\n<style>\n  .evidence-confidence-bar {\n    height: 4px;\n    border-radius: 2px;\n    transition: width var(--enhanced-bits-duration-normal);\n  }\n</style>\n```

### 4. TypeScript Barrel Store Integration

```typescript\n// src/lib/stores/enhanced-bits-store.ts\nimport { writable, derived } from 'svelte/store';\nimport { \n  type ComponentBarrelConfig,\n  type CustomDesignTokens,\n  COMPONENT_REGISTRY,\n  getSSRSafeComponents,\n  loadComponent\n} from '$lib/components/ui/enhanced-bits';\n\n// Component registry store\nexport const componentRegistry = writable(COMPONENT_REGISTRY);\n\n// Available components (SSR-safe only)\nexport const availableComponents = derived(\n  componentRegistry,\n  ($registry) => getSSRSafeComponents()\n);\n\n// Dynamic component loader with caching\nconst componentCache = new Map<string, any>();\n\nexport async function loadEnhancedComponent(name: string): Promise<any> {\n  if (componentCache.has(name)) {\n    return componentCache.get(name);\n  }\n  \n  const component = await loadComponent(name);\n  if (component) {\n    componentCache.set(name, component);\n  }\n  \n  return component;\n}\n\n// Custom component registration\nexport function registerCustomComponent(config: {\n  name: string;\n  component: any;\n  category: 'evidence' | 'forms' | 'layout' | 'visualization';\n  customTheme?: Partial<CustomDesignTokens>;\n}) {\n  componentRegistry.update(registry => ({\n    ...registry,\n    [config.name]: {\n      name: config.name,\n      component: config.component,\n      priority: 'medium',\n      category: config.category,\n      ssrSafe: true,\n    }\n  }));\n}\n```\n\n---\n\n## 🚀 Advanced Integration Patterns\n\n### 1. Runtime Theme Switching with Animations\n\n```svelte\n<!-- src/lib/components/theme/ThemeSwitcher.svelte -->\n<script lang=\"ts\">\n  import { Button } from '$lib/components/ui/enhanced-bits';\n  import { applyTheme, currentTheme, type ThemeName } from '$lib/stores/theme-store';\n  import { fly } from 'svelte/transition';\n  \n  const themes: { name: ThemeName; label: string; preview: string }[] = [\n    { name: 'nes', label: 'NES Gaming', preview: '#00ff41' },\n    { name: 'legal', label: 'Professional', preview: '#1e40af' },\n    { name: 'minimal', label: 'Clean Minimal', preview: '#6b7280' },\n  ];\n  \n  let isOpen = $state(false);\n  let currentThemeName = $state<ThemeName>('nes');\n  \n  function switchTheme(themeName: ThemeName) {\n    applyTheme(themeName);\n    currentThemeName = themeName;\n    isOpen = false;\n  }\n</script>\n\n<div class=\"theme-switcher\">\n  <Button onclick={() => isOpen = !isOpen} variant=\"outline\">\n    🎨 Theme: {themes.find(t => t.name === currentThemeName)?.label}\n  </Button>\n  \n  {#if isOpen}\n    <div class=\"theme-menu\" transition:fly={{ y: -10, duration: 200 }}>\n      {#each themes as theme}\n        <button \n          class=\"theme-option\"\n          class:active={theme.name === currentThemeName}\n          onclick={() => switchTheme(theme.name)}\n        >\n          <div class=\"theme-preview\" style=\"background: {theme.preview}\"></div>\n          {theme.label}\n        </button>\n      {/each}\n    </div>\n  {/if}\n</div>\n\n<style>\n  .theme-switcher {\n    position: relative;\n  }\n  \n  .theme-menu {\n    position: absolute;\n    top: 100%;\n    left: 0;\n    background: var(--enhanced-bits-background);\n    border: 2px solid var(--enhanced-bits-border);\n    border-radius: var(--enhanced-bits-border-radius, 8px);\n    padding: 0.5rem;\n    box-shadow: var(--enhanced-bits-shadow);\n    z-index: 50;\n  }\n  \n  .theme-option {\n    display: flex;\n    align-items: center;\n    gap: 0.5rem;\n    width: 100%;\n    padding: 0.5rem;\n    border: none;\n    background: transparent;\n    cursor: pointer;\n    border-radius: 4px;\n    transition: background var(--enhanced-bits-duration-fast);\n  }\n  \n  .theme-option:hover {\n    background: var(--enhanced-bits-muted);\n  }\n  \n  .theme-option.active {\n    background: var(--enhanced-bits-primary);\n    color: white;\n  }\n  \n  .theme-preview {\n    width: 16px;\n    height: 16px;\n    border-radius: 50%;\n    border: 1px solid var(--enhanced-bits-border);\n  }\n</style>\n```\n\n### 2. Responsive Design with Custom Breakpoints\n\n```typescript\n// src/lib/utils/responsive-design.ts\nimport { \n  withResponsiveStyles,\n  type BreakpointConfig \n} from '$lib/components/ui/enhanced-bits/custom-design-integration';\n\n// Custom breakpoints for legal application\nconst LEGAL_BREAKPOINTS: BreakpointConfig = {\n  sm: '480px',   // Mobile evidence viewer\n  md: '768px',   // Tablet case management\n  lg: '1200px',  // Desktop dual-pane\n  xl: '1600px',  // Large evidence boards\n  '2xl': '1920px' // Multi-monitor setups\n};\n\n// Responsive evidence card styles\nexport function createResponsiveEvidenceCard() {\n  return withResponsiveStyles(\n    {\n      width: '100%',\n      padding: '1rem',\n      margin: '0.5rem 0',\n    },\n    {\n      md: {\n        width: 'calc(50% - 1rem)',\n        display: 'inline-block',\n        verticalAlign: 'top',\n      },\n      lg: {\n        width: 'calc(33.33% - 1rem)',\n        padding: '1.5rem',\n      },\n      xl: {\n        width: 'calc(25% - 1rem)',\n        padding: '2rem',\n      }\n    },\n    LEGAL_BREAKPOINTS\n  );\n}\n\n// Responsive board layout\nexport function createResponsiveBoardLayout() {\n  return withResponsiveStyles(\n    {\n      display: 'grid',\n      gridTemplateColumns: '1fr',\n      gap: '1rem',\n      padding: '1rem',\n    },\n    {\n      md: {\n        gridTemplateColumns: '250px 1fr',\n        padding: '1.5rem',\n      },\n      lg: {\n        gridTemplateColumns: '300px 1fr 250px',\n        gap: '2rem',\n      },\n      xl: {\n        gridTemplateColumns: '350px 1fr 300px',\n        padding: '2rem',\n      }\n    },\n    LEGAL_BREAKPOINTS\n  );\n}\n```\n\n### 3. Accessibility-First Custom Components\n\n```svelte\n<!-- src/lib/components/custom/AccessibleEvidenceViewer.svelte -->\n<script lang=\"ts\">\n  import { \n    Card, \n    CardHeader, \n    CardTitle, \n    CardContent, \n    Button \n  } from '$lib/components/ui/enhanced-bits';\n  import { \n    createAccessibleColorPalette,\n    validateAccessibility\n  } from '$lib/components/ui/enhanced-bits/custom-design-integration';\n  \n  interface Props {\n    evidence: {\n      id: string;\n      title: string;\n      type: string;\n      confidence: number;\n      priority: 'low' | 'medium' | 'high' | 'critical';\n    };\n  }\n  \n  let { evidence }: Props = $props();\n  \n  // Create accessible color palette based on priority\n  let priorityColors = $derived(() => {\n    const baseColors = {\n      low: '#10b981',\n      medium: '#f59e0b', \n      high: '#ef4444',\n      critical: '#dc2626'\n    };\n    \n    return createAccessibleColorPalette(baseColors[evidence.priority]);\n  });\n  \n  // ARIA attributes for accessibility\n  let ariaLabel = $derived(() => \n    `Evidence ${evidence.title}, type ${evidence.type}, ${evidence.priority} priority, ${Math.round(evidence.confidence * 100)}% confidence`\n  );\n  \n  let confidenceLabel = $derived(() => {\n    const percent = Math.round(evidence.confidence * 100);\n    if (percent >= 90) return 'Very High Confidence';\n    if (percent >= 70) return 'High Confidence';\n    if (percent >= 50) return 'Medium Confidence';\n    return 'Low Confidence';\n  });\n</script>\n\n<Card \n  role=\"article\"\n  aria-label={ariaLabel}\n  tabindex=\"0\"\n  style=\"\n    border-color: {priorityColors[500]};\n    --focus-ring-color: {priorityColors[400]};\n  \"\n  class=\"evidence-card\"\n>\n  <CardHeader>\n    <CardTitle>\n      <span class=\"evidence-title\">{evidence.title}</span>\n      <span \n        class=\"priority-badge\"\n        style=\"background: {priorityColors[100]}; color: {priorityColors[800]};\"\n        aria-label=\"Priority: {evidence.priority}\"\n      >\n        {evidence.priority.toUpperCase()}\n      </span>\n    </CardTitle>\n  </CardHeader>\n  \n  <CardContent>\n    <div class=\"confidence-section\">\n      <label for=\"confidence-{evidence.id}\" class=\"sr-only\">\n        AI Analysis Confidence Level\n      </label>\n      <div \n        id=\"confidence-{evidence.id}\"\n        class=\"confidence-bar\"\n        role=\"progressbar\"\n        aria-valuenow={Math.round(evidence.confidence * 100)}\n        aria-valuemin=\"0\"\n        aria-valuemax=\"100\"\n        aria-label={confidenceLabel}\n        style=\"\n          background: linear-gradient(\n            to right,\n            {priorityColors[500]} {evidence.confidence * 100}%,\n            {priorityColors[200]} {evidence.confidence * 100}%\n          );\n        \"\n      >\n        <span class=\"confidence-text\">\n          {confidenceLabel} ({Math.round(evidence.confidence * 100)}%)\n        </span>\n      </div>\n    </div>\n    \n    <div class=\"evidence-actions\">\n      <Button \n        variant=\"outline\" \n        size=\"sm\"\n        aria-label=\"View detailed analysis for {evidence.title}\"\n      >\n        📊 Analyze\n      </Button>\n      <Button \n        variant=\"outline\" \n        size=\"sm\"\n        aria-label=\"View {evidence.title} in evidence board\"\n      >\n        🔍 View\n      </Button>\n    </div>\n  </CardContent>\n</Card>\n\n<style>\n  .evidence-card {\n    transition: all var(--enhanced-bits-duration-normal);\n  }\n  \n  .evidence-card:focus {\n    outline: 2px solid var(--focus-ring-color);\n    outline-offset: 2px;\n  }\n  \n  .evidence-title {\n    font-weight: 600;\n    margin-right: 0.5rem;\n  }\n  \n  .priority-badge {\n    font-size: 0.75rem;\n    padding: 0.25rem 0.5rem;\n    border-radius: 4px;\n    font-weight: 500;\n  }\n  \n  .confidence-section {\n    margin: 1rem 0;\n  }\n  \n  .confidence-bar {\n    height: 24px;\n    border-radius: 4px;\n    border: 1px solid var(--enhanced-bits-border);\n    display: flex;\n    align-items: center;\n    padding: 0 0.5rem;\n    position: relative;\n    overflow: hidden;\n  }\n  \n  .confidence-text {\n    font-size: 0.875rem;\n    font-weight: 500;\n    color: var(--enhanced-bits-foreground);\n    z-index: 1;\n  }\n  \n  .evidence-actions {\n    display: flex;\n    gap: 0.5rem;\n    margin-top: 1rem;\n  }\n  \n  .sr-only {\n    position: absolute;\n    width: 1px;\n    height: 1px;\n    padding: 0;\n    margin: -1px;\n    overflow: hidden;\n    clip: rect(0, 0, 0, 0);\n    white-space: nowrap;\n    border: 0;\n  }\n</style>\n```\n\n---\n\n## 📋 Implementation Checklist\n\n### ✅ Basic Setup\n- [ ] Install Enhanced-Bits library with TypeScript support\n- [ ] Create custom design system configuration\n- [ ] Set up theme store with SSR safety\n- [ ] Configure barrel exports for component access\n\n### ✅ Custom Styling\n- [ ] Define custom color palette with accessibility validation\n- [ ] Create responsive breakpoint configuration\n- [ ] Implement component-level styling utilities\n- [ ] Set up CSS variable system for runtime theming\n\n### ✅ TypeScript Integration\n- [ ] Configure barrel exports for type safety\n- [ ] Set up dynamic component loading with proper typing\n- [ ] Create custom component registration system\n- [ ] Implement theme validation and error handling\n\n### ✅ SSR Compatibility\n- [ ] Test all components in SSR environment\n- [ ] Verify dynamic imports work correctly\n- [ ] Ensure theme application is browser-safe\n- [ ] Validate component registry loads properly\n\n### ✅ Accessibility\n- [ ] Implement ARIA attributes for custom components\n- [ ] Validate color contrast ratios\n- [ ] Add keyboard navigation support\n- [ ] Test with screen readers\n\n---\n\n## 🎯 Production Deployment Tips\n\n1. **Bundle Optimization**: Use dynamic imports to reduce initial bundle size\n2. **Theme Caching**: Cache theme configurations in localStorage\n3. **Component Registry**: Register only components you actually use\n4. **CSS Variables**: Use CSS custom properties for runtime theme switching\n5. **Accessibility Testing**: Validate all custom themes meet WCAG guidelines\n\n---\n\n**Status**: ✅ Production Ready - Enhanced-Bits custom design system provides enterprise-grade theming with full SSR compatibility and TypeScript safety!