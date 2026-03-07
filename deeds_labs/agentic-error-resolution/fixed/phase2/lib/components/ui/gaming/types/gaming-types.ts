// Gaming Component Types (TypeScript)
// Type definitions for gaming UI components

export interface GamingComponentProps {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  retroMode?: boolean;
  pixelated?: boolean;
  scanlines?: boolean;
  crtEffect?: boolean;
  mode7Transform?: boolean;
  enableSound?: boolean;
  soundVolume?: number;
  customPalette?: Record<string, string>;
  gradientDirection?: 'horizontal' | 'vertical' | 'diagonal' | 'radial';
  onClick?: (event: Event) => void;
  onHover?: (event: Event) => void;
  onPress?: (event: Event) => void;
  children?: any;
  label?: string;
  icon?: string;
  animationDuration?: number;
  hoverScale?: number;
  pressScale?: number;
}

export interface GamingButtonProps extends GamingComponentProps {
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  rounded?: boolean;
}

export const DEFAULT_GAMING_THEME = {
  name: 'snes-retro',
  palette: {
    primary: '#00ff88',
    secondary: '#0088ff',
    success: '#88ff00',
    danger: '#ff4400',
    warning: '#ffaa00',
    info: '#00aaff',
    background: '#000000',
    surface: '#1a1a1a',
    accent: '#ffffff',
    muted: '#666666',
  },
};

export type GamingVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
export type GamingSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
