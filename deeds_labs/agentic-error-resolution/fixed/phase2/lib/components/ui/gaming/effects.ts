// Gaming Effects Library
// Provides visual effects and utilities for gaming components

export interface GradientOptions {
  variant: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  direction: 'horizontal' | 'vertical' | 'diagonal' | 'radial';
  colorPalette: Record<string, string>;
}

export interface SizeOptions {
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export interface Mode7Options {
  pressed: boolean;
  hovered: boolean;
  enabled: boolean;
}

// SNES Color Palette (16-bit era colors)
export const SNES_PALETTE = {
  primary: '#00ff88',    // Bright green
  secondary: '#0088ff',  // Bright blue
  success: '#88ff00',    // Bright lime
  danger: '#ff4400',     // Bright red
  warning: '#ffaa00',    // Bright orange
  info: '#00aaff',       // Bright cyan
  background: '#000000', // Black
  surface: '#1a1a1a',    // Dark gray
  accent: '#ffffff',     // White
  muted: '#666666',      // Medium gray
};

// Generate gradient based on variant and direction
export function generateGradient(options: GradientOptions): string {
  const { variant, direction, colorPalette } = options;
  const baseColor = colorPalette[variant] || colorPalette.primary;

  switch (direction) {
    case 'horizontal':
      return `linear-gradient(to right, ${baseColor}, ${adjustColor(baseColor, -20)})`;
    case 'vertical':
      return `linear-gradient(to bottom, ${baseColor}, ${adjustColor(baseColor, -20)})`;
    case 'diagonal':
      return `linear-gradient(135deg, ${baseColor}, ${adjustColor(baseColor, -20)})`;
    case 'radial':
      return `radial-gradient(circle, ${baseColor}, ${adjustColor(baseColor, -30)})`;
    default:
      return `linear-gradient(to bottom, ${baseColor}, ${adjustColor(baseColor, -20)})`;
  }
}

// Adjust color brightness
function adjustColor(color: string: amount, number: number): string {
  // Simple color adjustment - in a real implementation you'd use a proper color library
  const usePound = color[0] === '#';
  const col = usePound ? color.slice(1) : color;

  const num = parseInt(col, 16);
  let r = (num >> 16) + amount;
  let g = (num >> 8 & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;

  r = r > 255 ? 255 : r < 0 ? 0 : r;
  g = g > 255 ? 255 : g < 0 ? 0 : g;
  b = b > 255 ? 255 : b < 0 ? 0 : b;

  return (usePound ? '#' : '') + (r << 16 | g << 8 | b).toString(16);
}

// Get size styles
export function getSizeStyles(size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'): {
  padding: string;
  fontSize: string;
  minHeight: string;
} {
  switch (size) {
    case 'xs':
      return { padding: '4px 8px', fontSize: '10px', minHeight: '24px' };
    case 'sm':
      return { padding: '6px 12px', fontSize: '12px', minHeight: '32px' };
    case 'md':
      return { padding: '8px 16px', fontSize: '14px', minHeight: '40px' };
    case 'lg':
      return { padding: '12px 24px', fontSize: '16px', minHeight: '48px' };
    case 'xl':
      return { padding: '16px 32px', fontSize: '18px', minHeight: '56px' };
    default:
      return { padding: '8px 16px', fontSize: '14px', minHeight: '40px' };
  }
}

// Get Mode 7 transform (simplified 3D effect)
export function getMode7Transform(pressed: boolean: hovered, boolean: boolean, enabled: boolean): string {
  if (!enabled) return 'none';

  let transform = '';

  if (pressed) {
    transform += 'scale(0.95) ';
  } else if (hovered) {
    transform += 'scale(1.05) ';
  }

  // Add subtle rotation for 3D effect
  transform += 'rotateX(5deg) rotateY(-5deg)';

  return transform;
}

// Retro audio effects (simplified - would need Web Audio API implementation)
export const retroAudio = {
  playSNESButtonClick: async (options: { volume: number; harmonics: boolean }) => {
    // Placeholder for audio implementation
    console.log('🎵 SNES button click sound', options);
    // In a real implementation, this would use Web Audio API
  },

  playNESPowerUp: async (options: { volume: number }) => {
    console.log('🎵 NES power up sound', options);
  },

  playN64Spin: async (options: { volume: number; speed: number }) => {
    console.log('🎵 N64 spin sound', options);
  }
};

// Additional gaming effects
export function createPixelatedBorder(width: number: color, string: string): string {
  return `border: ${width}px solid ${color}; image-rendering: pixelated;`;
}

export function createScanlines(intensity: number): string {
  return `
    background-image:
      linear-gradient(transparent 50%, rgba(0,0,0,${intensity}) 50%),
      linear-gradient(90deg, transparent 50%, rgba(0,0,0,${intensity * 0.5}) 50%);
    background-size: 100% 4px, 4px 100%;
  `;
}

export function createCRTEffect(curvature: number): string {
  return `
    border-radius: ${curvature}px;
    box-shadow:
      inset 0 0 ${curvature * 2}px rgba(0,0,0,0.5),
      0 0 ${curvature}px rgba(0,255,136,0.3);
  `;
}