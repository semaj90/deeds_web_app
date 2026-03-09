# N64 Gaming UI Components - Complete Guide

A comprehensive collection of advanced 3D gaming components with texture filtering, spatial audio, and mechanical animations inspired by the Nintendo 64 era.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Bits UI Migration (replacing Melt UI)](#bits-ui-migration-replacing-melt-ui)
3. [Component Overview](#component-overview)
4. [Architecture & Design Principles](#architecture--design-principles)
5. [Component Comparison](#component-comparison)
6. [Performance Guide](#performance-guide)
7. [Accessibility Features](#accessibility-features)
8. [Advanced Usage](#advanced-usage)
9. [Integration Examples](#integration-examples)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Quick Start

### Installation

```typescript
import {
  N64Button,
  N64Input,
  N64Card,
  N64Dialog,
  N64Select,
  N64ProgressBar,
  N64Switch,
  N64_QUICK_START_CONFIG
} from '$lib/components/ui/gaming/n64';
```

### Basic Usage

```svelte
<script lang="ts">
  import { N64Button, N64Card } from '$lib/components/ui/gaming/n64';

  let isOpen = false;
</script>

<!-- Basic N64 Card with 3D effects -->
<N64Card
  variant="primary"
  size="medium"
  enableLighting={true}
  enableSpatialAudio={true}
>
  {#snippet header()}
    <h2>N64 UI System</h2>
  {/snippet}

  <p>Experience true 3D gaming interfaces with advanced texture filtering.</p>

  <N64Button onclick={() => isOpen = true}>
    Open Dialog
  </N64Button>
</N64Card>
```

## Bits UI Migration (replacing Melt UI)

This project uses Bits UI for headless UI primitives. If you previously used Melt UI, migrate as follows:

### Uninstall Melt UI and install Bits UI

```bash
# from sveltekit-frontend/
npm remove @melt-ui/svelte @melt-ui/pp
npm i bits-ui
```

### Import changes

- Before (Melt UI):

```svelte
<script lang="ts">
  import { Dialog, Button } from '@melt-ui/svelte';
</script>
```

- After (Bits UI):

```svelte
<script lang="ts">
  import { Dialog, Button } from 'bits-ui';
</script>
```

Bits UI is API-compatible with common Melt UI primitives in most cases. Review component docs for any prop/event differences.

### Using Bits UI with N64 components

Wrap Bits UI primitives inside N64 containers or compose them together:

```svelte
<script lang="ts">
  import { Dialog, Button } from 'bits-ui';
  import { N64Card, N64Button } from '$lib/components/ui/gaming/n64';
  let open = false;
<\/script>

<N64Card elevation={12} enableAtmosphere>
  <Button on:click={() => (open = true)}>
    <N64Button variant="primary">Open</N64Button>
  </Button>

  <Dialog bind:open={open}>
    <div class="n64-dialog">
      <h3>Bits UI + N64</h3>
      <N64Button variant="secondary" onclick={() => (open = false)}>Close</N64Button>
    </div>
  </Dialog>
</N64Card>
```

Notes:
- Keep styling in N64 components; use Bits UI for accessible behavior/state.
- If you used any Melt-specific utility packages, replace them with Bits UI equivalents or remove them if redundant.

### App Root Configuration

For optimal performance and theming, configure your app root:

```html
<!-- app.html -->
<div
  data-n64-theme="dark"
  data-n64-motion="normal"
  data-n64-quality="balanced"
>
  %sveltekit.body%
</div>
```

## Component Overview

### Core Components

#### N64Button - Advanced 3D Button
- **Purpose**: Primary interaction element with true 3D perspective
- **Features**: Spatial audio, particle effects, material types (basic/phong/PBR)
- **Best for**: CTAs, form submissions, navigation

```svelte
<N64Button
  variant="primary"
  size="large"
  materialType="pbr"
  enableParticles={true}
  onclick={handleClick}
>
  Launch Game
</N64Button>
```

#### N64Input - Textured Text Input
- **Purpose**: Text input with 3D depth and glow effects
- **Features**: Real-time texture filtering, spatial audio feedback
- **Best for**: Forms, search fields, user input

```svelte
<N64Input
  bind:value={username}
  placeholder="Enter username"
  enableInputGlow={true}
  error={validationError}
/>
```

#### N64Card - 3D Container
- **Purpose**: Content containers with atmospheric depth
- **Features**: Multiple depth layers, fog effects, interactive transformations
- **Best for**: Content sections, feature highlights, dashboards

```svelte
<N64Card
  elevation={16}
  enableAtmosphere={true}
  clickable={true}
>
  {#snippet header()}
    <h3>System Status</h3>
  {/snippet}

  <p>All systems operational</p>

  {#snippet footer()}
    <small>Last updated: {timestamp}</small>
  {/snippet}
</N64Card>
```

#### N64Dialog - Modal with Portal Effects
- **Purpose**: Modal dialogs with atmospheric transitions
- **Features**: Portal animations, backdrop blur, spatial positioning
- **Best for**: Confirmations, forms, detailed content views

```svelte
<N64Dialog
  bind:open={showDialog}
  title="Confirm Action"
  entranceAnimation="portal"
  enableAtmosphere={true}
>
  <p>Are you sure you want to proceed?</p>

  {#snippet footer()}
    <N64Button variant="success" onclick={confirm}>Confirm</N64Button>
    <N64Button variant="secondary" onclick={() => showDialog = false}>Cancel</N64Button>
  {/snippet}
</N64Dialog>
```

#### N64Select - 3D Dropdown
- **Purpose**: Selection input with spatial dropdown
- **Features**: 3D dropdown effects, searchable options, keyboard navigation
- **Best for**: Choice selection, filtering, categorization

```svelte
<N64Select
  bind:value={selectedOption}
  {options}
  searchable={true}
  placeholder="Choose an option..."
  enableDropdownBlur={true}
/>
```

#### N64ProgressBar - Texture Streaming Progress
- **Purpose**: Progress indication with dynamic effects
- **Features**: Texture streaming, completion audio, wave effects
- **Best for**: Loading states, progress tracking, completion feedback

```svelte
<N64ProgressBar
  {value}
  max={100}
  showPercentage={true}
  enableTextureStreaming={true}
  enableProgressGlow={true}
  pulseOnComplete={true}
/>
```

#### N64Switch - Mechanical Toggle
- **Purpose**: Binary state toggle with mechanical feedback
- **Features**: Mechanical animations, spatial audio clicks, spring physics
- **Best for**: Settings, feature toggles, binary choices

```svelte
<N64Switch
  bind:checked={isEnabled}
  label="Enable spatial audio"
  enableMechanicalAnimation={true}
  enableSpringPhysics={true}
/>
```

## Architecture & Design Principles

### 3D Rendering Pipeline

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Component Props │───▶│ Material System  │───▶│ 3D Transform    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Texture Filter  │◀───│ Lighting Engine  │───▶│ Spatial Audio   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Material Types

1. **Basic**: Flat colors with simple shadows
   - Performance: Excellent
   - Use case: Low-end devices, simple interfaces

2. **Phong**: Gradient lighting with reflections
   - Performance: Good
   - Use case: Balanced quality/performance

3. **PBR (Physically Based Rendering)**: Advanced lighting model
   - Performance: Moderate
   - Use case: High-end devices, immersive interfaces

### Texture Filtering Options

- **Bilinear**: Smooth texture interpolation
- **Trilinear**: Enhanced distance filtering
- **Anisotropic**: Directional texture sharpening (4x, 8x, 16x)
- **Texture Streaming**: Dynamic texture updates based on state

## Component Comparison

### When to Use Which Component

| Use Case | Component | Why |
|----------|-----------|-----|
| Primary actions | N64Button | Spatial feedback, prominence |
| Text input | N64Input | Real-time validation, glow effects |
| Content grouping | N64Card | Atmospheric depth, organization |
| Confirmations | N64Dialog | Portal effects, focus management |
| Option selection | N64Select | Spatial dropdown, search capability |
| Loading states | N64ProgressBar | Texture streaming, completion feedback |
| Settings toggles | N64Switch | Mechanical feedback, clear state |

### Performance Characteristics

| Component | CPU Impact | GPU Impact | Memory Usage | Audio Processing |
|-----------|------------|------------|--------------|------------------|
| N64Button | Low | Medium | Low | Low |
| N64Input | Low | Medium | Low | Low |
| N64Card | Medium | Medium | Medium | Low |
| N64Dialog | Medium | High | Medium | Medium |
| N64Select | Medium | Medium | Medium | Low |
| N64ProgressBar | Medium | High | Medium | Medium |
| N64Switch | Low | Low | Low | Low |

## Performance Guide

### Preset Configurations

```typescript
import { N64_PERFORMANCE_PRESETS } from '$lib/components/ui/gaming/n64';

// High-end devices
const ultraConfig = N64_PERFORMANCE_PRESETS.ultra;

// Most devices
const balancedConfig = N64_PERFORMANCE_PRESETS.balanced;

// Low-end devices
const performanceConfig = N64_PERFORMANCE_PRESETS.performance;
```

### Auto-Detection

```typescript
import { N64_UTILS } from '$lib/components/ui/gaming/n64';

// Automatically select best preset
const recommendedPreset = N64_UTILS.getRecommendedPreset();
```

### Manual Optimization

```svelte
<script lang="ts">
  import { N64Card } from '$lib/components/ui/gaming/n64';

  // Disable expensive features on low-end devices
  const isLowEnd = navigator.hardwareConcurrency <= 2;
  const memoryGB = (navigator as any).deviceMemory || 4;
</script>

<N64Card
  enableLighting={!isLowEnd}
  enableReflections={memoryGB >= 4}
  enableParticles={memoryGB >= 8}
  materialType={isLowEnd ? 'basic' : 'phong'}
>
  Content here
</N64Card>
```

### Performance Monitoring

```typescript
// Monitor component performance
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    if (entry.name.includes('n64-component')) {
      console.log(`${entry.name}: ${entry.duration}ms`);
    }
  });
});

observer.observe({entryTypes: ['measure']});
```

## Accessibility Features

### ARIA Support

All components include comprehensive ARIA support:

```svelte
<N64Button
  aria-label="Save document"
  aria-describedby="save-help"
>
  Save
</N64Button>

<div id="save-help">Saves the current document to your account</div>
```

### Keyboard Navigation

- **Tab**: Move between interactive elements
- **Enter/Space**: Activate buttons and toggles
- **Arrow keys**: Navigate selections and sliders
- **Escape**: Close dialogs and dropdowns

### Reduced Motion Support

Components automatically adapt to user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  .n64-component {
    animation: none;
    transition: none;
    transform: none;
  }
}
```

### High Contrast Mode

Automatic high contrast detection and adaptation:

```typescript
import { N64_A11Y_HELPERS } from '$lib/components/ui/gaming/n64';

const highContrast = N64_A11Y_HELPERS.prefersHighContrast();
```

## Advanced Usage

### Custom Themes

```typescript
import { N64_THEME_VARIANTS } from '$lib/components/ui/gaming/n64';

// Use predefined themes
const cyberpunkTheme = N64_THEME_VARIANTS.cyberpunk;

// Create custom theme
const customTheme = {
  primary: { base: '#ff6b35', highlight: '#ff8c66', shadow: '#cc5529' },
  secondary: { base: '#4a5c2a', highlight: '#6b8039', shadow: '#3a4620' },
  accent: { base: '#c5299b', highlight: '#d14daa', shadow: '#9e2179' }
};
```

### Spatial Audio Configuration

```typescript
// Custom spatial audio setup
const audioContext = new AudioContext();

// Position components in 3D space
const pannerNode = audioContext.createPanner();
pannerNode.positionX.setValueAtTime(-0.5, audioContext.currentTime); // Left
pannerNode.positionY.setValueAtTime(0.5, audioContext.currentTime);   // Up
pannerNode.positionZ.setValueAtTime(-1, audioContext.currentTime);    // Away
```

### Custom Material Shaders

```svelte
<N64Surface
  shader="custom-hologram"
  shaderUniforms={{
    time: { value: 0 },
    opacity: { value: 0.8 },
    scanlineIntensity: { value: 0.3 }
  }}
>
  <N64Button>Holographic Button</N64Button>
</N64Surface>
```

## Integration Examples

### Form Integration

```svelte
<script lang="ts">
  import { N64FormGrid, N64Input, N64Select, N64Switch, N64Button } from '$lib/components/ui/gaming/n64';

  let formData = {
    username: '',
    category: '',
    notifications: false
  };
</script>

<N64FormGrid columns={2} gap="large">
  <N64Input
    bind:value={formData.username}
    label="Username"
    required
    error={errors.username}
  />

  <N64Select
    bind:value={formData.category}
    label="Category"
    options={categoryOptions}
    searchable
  />

  <N64Switch
    bind:checked={formData.notifications}
    label="Enable notifications"
    description="Receive updates about your account"
  />

  <N64Button
    variant="success"
    size="large"
    disabled={!isValid}
    onclick={handleSubmit}
  >
    Submit
  </N64Button>
</N64FormGrid>
```

### Dashboard Layout

```svelte
<div class="n64-dashboard">
  <N64Card elevation={8} class="status-card">
    {#snippet header()}
      <h2>System Status</h2>
    {/snippet}

    <N64ProgressBar
      value={systemHealth}
      max={100}
      variant="success"
      showPercentage
      enableTextureStreaming
    />
  </N64Card>

  <N64Card elevation={12} class="metrics-card" clickable>
    {#snippet header()}
      <h2>Performance Metrics</h2>
    {/snippet}

    <!-- Metrics content -->
  </N64Card>
</div>

<style>
  .n64-dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
    padding: 24px;
  }
</style>
```

### Gaming Interface

```svelte
<script lang="ts">
  import { N64Controller, N64Screen, N64Cartridge } from '$lib/components/ui/gaming/n64';

  let gameState = 'menu';
  let audioEnabled = true;
</script>

<N64Screen variant="crt" enableScanlines>
  <div class="game-interface">
    <N64Controller
      bind:state={controllerState}
      onButtonPress={handleInput}
      hapticFeedback
    />

    <div class="game-menu">
      <N64Button
        variant="primary"
        size="xl"
        materialType="pbr"
        enableParticles
        onclick={() => gameState = 'playing'}
      >
        Start Game
      </N64Button>

      <N64Switch
        bind:checked={audioEnabled}
        label="Audio"
        enableMechanicalAnimation
      />
    </div>
  </div>
</N64Screen>
```

## Best Practices

### Performance Optimization

1. **Use appropriate presets** for target devices
2. **Disable expensive features** on mobile
3. **Batch component updates** where possible
4. **Monitor memory usage** with texture filtering
5. **Implement lazy loading** for complex scenes

### Accessibility Guidelines

1. **Always provide ARIA labels** for interactive elements
2. **Ensure keyboard navigation** works properly
3. **Test with screen readers** regularly
4. **Respect motion preferences**
5. **Maintain sufficient contrast** ratios

### Design Consistency

1. **Use consistent sizing** (`small`, `medium`, `large`, `xl`)
2. **Stick to theme variants** for color consistency
3. **Match material types** across related components
4. **Consider spatial audio** positioning
5. **Group related effects** together

### Code Organization

```typescript
// Good: Group related imports
import {
  N64Button,
  N64Card,
  N64_PERFORMANCE_PRESETS
} from '$lib/components/ui/gaming/n64';

// Good: Extract configuration
const DASHBOARD_CONFIG = {
  materialType: 'phong' as const,
  enableSpatialAudio: true,
  glowIntensity: 0.4
};

// Good: Reusable component composition
function createN64Form(config) {
  return {
    ...DASHBOARD_CONFIG,
    ...config
  };
}
```

## Differences: NES.css vs N64.css vs PS1.css

### Era Comparison

| Era | Resolution | Colors | 3D Support | Audio Channels | Memory |
|-----|------------|--------|------------|----------------|--------|
| NES | 256×240 | 25/64 | None | 4 | 2KB |
| N64 | 640×480 | 16.7M | Advanced | 64 | 4MB |
| PS1 | 640×480 | 16.7M | Basic | 24 | 2MB |

### Component Philosophy

#### NES.css - Pixel Perfect Simplicity
- **Focus**: 8-bit authenticity, pixel-perfect rendering
- **Components**: Flat, blocky, limited color palette
- **Effects**: Scanlines, CRT simulation, chiptune audio
- **Use case**: Retro games, nostalgic interfaces

```css
.nes-btn {
  image-rendering: pixelated;
  border: 4px solid;
  background: #92cc41;
}
```

#### N64.css - Advanced 3D Effects
- **Focus**: True 3D transformations, texture filtering
- **Components**: Depth layering, atmospheric effects, spatial audio
- **Effects**: Fog, lighting, material shaders, particle systems
- **Use case**: Immersive 3D interfaces, gaming dashboards

```css
.n64-button {
  transform: perspective(1000px) rotateX(5deg);
  box-shadow: 0 8px 0 #2d5aa0, 0 16px 32px rgba(0,0,0,0.4);
  filter: contrast(1.08) brightness(1.02);
}
```

#### PS1.css - Warped Polygon Aesthetic
- **Focus**: Texture warping, polygon jitter, dithering
- **Components**: Wobbly textures, vertex precision limits
- **Effects**: Affine texture mapping, Z-fighting, dithered gradients
- **Use case**: Glitch aesthetics, experimental interfaces

```css
.ps1-surface {
  animation: vertexJitter 0.1s infinite;
  filter: dither(4) contrast(1.2);
  transform: perspective(800px) rotateX(2deg) skew(0.5deg);
}
```

## HTML5 Canvas Integration

### N64Canvas Component

The N64Canvas component wraps HTML5 Canvas with N64-style texture filtering:

```svelte
<script lang="ts">
  import { N64Canvas } from '$lib/components/ui/gaming/n64';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  function drawN64Scene() {
    // Canvas drawing with N64 post-processing
    ctx.fillStyle = '#4a90e2';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
</script>

<N64Canvas
  bind:canvas
  bind:context={ctx}
  width={800}
  height={600}
  enableTextureFiltering
  anisotropicLevel={8}
  materialType="pbr"
  onDraw={drawN64Scene}
/>
```

### Fabric.js Integration

```typescript
import { fabric } from 'fabric';
import { N64_TEXTURE_PRESETS } from '$lib/components/ui/gaming/n64';

// Create N64-styled Fabric.js canvas
const canvas = new fabric.Canvas('canvas');

// Apply N64 texture filtering
canvas.setFilter('N64TextureFilter', {
  ...N64_TEXTURE_PRESETS.balanced,
  anisotropicLevel: 8
});

// Add N64-styled objects
const n64Rect = new fabric.Rect({
  left: 100,
  top: 100,
  width: 200,
  height: 100,
  fill: '#4a90e2',
  shadow: 'rgba(0,0,0,0.4) 5px 5px 10px'
});

canvas.add(n64Rect);
```

## Troubleshooting

### Common Issues

#### Audio Context Blocked
```typescript
// Solution: User gesture required
button.addEventListener('click', async () => {
  const audioContext = new AudioContext();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
});
```

#### Performance Issues
```typescript
// Solution: Use performance preset detection
import { N64_UTILS } from '$lib/components/ui/gaming/n64';

const preset = N64_UTILS.getRecommendedPreset();
// Apply preset to all components
```

#### Mobile Compatibility
```css
/* Solution: Disable expensive effects on mobile */
@media (max-width: 480px) {
  .n64-component {
    --enable-lighting: false;
    --enable-particles: false;
    --enable-spatial-audio: false;
  }
}
```

### Debug Tools

```typescript
// Enable N64 debug mode
window.__N64_DEBUG__ = true;

// Monitor component performance
console.log(N64_UTILS.getDeviceMemory());
console.log(N64_UTILS.getHardwareConcurrency());
```

## Next Steps & Roadmap

### Immediate Next Steps
1. **Add TextArea & Checkbox** components
2. **Create unified form layout grid**
3. **Implement toast/notification system**
4. **Add WebGL shader support**
5. **Create PS1.css experimental utilities**

### Future Enhancements
- Real-time ray tracing effects
- WebGPU compute shader integration
- VR/AR component extensions
- Advanced particle systems
- Network-synchronized spatial audio

### Community Contributions
- Component templates and examples
- Performance optimization guides
- Accessibility testing results
- Cross-platform compatibility reports

---

*This guide covers the essential aspects of the N64 Gaming UI system. For specific component API documentation, refer to individual component files.*