# Gaming Effects Module

Modular, reusable gaming UI effects for retro-styled components.

## Structure

```
effects/
├── index.ts              # Barrel export
├── audio-effects.ts      # Retro audio engine
├── gradient-utils.ts     # Gradient & styling utilities
└── README.md            # This file
```

## Usage

### Audio Effects

```typescript
import { retroAudio } from '$lib/components/ui/gaming/effects';

// SNES-style button click
await retroAudio.playSNESButtonClick({ volume: 0.3, harmonics: true });

// NES-style 8-bit click
await retroAudio.playNESButtonClick({ pitch: 440 });

// Other sounds
await retroAudio.playMenuNav();
await retroAudio.playSuccessSound();
await retroAudio.playErrorSound();
```

### Gradient Utilities

```typescript
import { generateGradient, SNES_PALETTE, NES_PALETTE } from '$lib/components/ui/gaming/effects';

const gradient = generateGradient({
  variant: 'primary',
  direction: 'vertical',
  colorPalette: SNES_PALETTE
});
// Returns: 'linear-gradient(to bottom, #5cb3ff, #3cbcfc, #0084ff)'
```

### Size Utilities

```typescript
import { getSizeStyles } from '$lib/components/ui/gaming/effects';

const styles = getSizeStyles('medium');
// Returns: { padding: '14px 20px', fontSize: '13px', minHeight: '44px' }
```

### Mode 7 Transform

```typescript
import { getMode7Transform } from '$lib/components/ui/gaming/effects';

const transform = getMode7Transform(isPressed, isHovered, true);
// Returns perspective transform for SNES Mode 7 effect
```

## Benefits

- ✅ **Reusable**: Shared across all gaming components
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Modular**: Import only what you need
- ✅ **Consistent**: Centralized palettes and effects
- ✅ **Maintainable**: Single source of truth

## Color Palettes

### SNES (16-bit)
- Primary: Blue gradients
- Success: Green/lime gradients
- Warning: Yellow/orange gradients
- Error: Red gradients
- Info: Cyan/blue gradients

### NES (8-bit)
- Darker, more saturated variants
- Classic retro gaming aesthetics
