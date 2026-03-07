// Gaming Component Types
// TypeScript type definitions for gaming UI components

export interface GamingComponentProps {
  // Core component props
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;

  // Gaming-specific props
  retroMode?: boolean;
  pixelated?: boolean;
  scanlines?: boolean;
  crtEffect?: boolean;
  mode7Transform?: boolean;

  // Audio props
  enableSound?: boolean;
  soundVolume?: number;

  // Styling props
  customPalette?: Record<string, string>;
  gradientDirection?: 'horizontal' | 'vertical' | 'diagonal' | 'radial';

  // Event handlers
  onClick?: (event: Event) => void;
  onHover?: (event: Event) => void;
  onPress?: (event: Event) => void;

  // Children and content
  children?: any;
  label?: string;
  icon?: string;

  // Advanced props
  animationDuration?: number;
  hoverScale?: number;
  pressScale?: number;
}

// Button-specific props
export interface GamingButtonProps extends GamingComponentProps {
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  rounded?: boolean;
}

// Card-specific props
export interface GamingCardProps extends GamingComponentProps {
  elevation?: number;
  borderWidth?: number;
  glowEffect?: boolean;
}

// Input-specific props
export interface GamingInputProps extends GamingComponentProps {
  placeholder?: string;
  value?: string;
  type?: 'text' | 'password' | 'email' | 'number';
  required?: boolean;
  readonly?: boolean;
}

// Select-specific props
export interface GamingSelectProps extends GamingComponentProps {
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
  multiple?: boolean;
  placeholder?: string;
}

// Modal/Dialog props
export interface GamingModalProps extends GamingComponentProps {
  open?: boolean;
  title?: string;
  closable?: boolean;
  maskClosable?: boolean;
  width?: string | number;
  height?: string | number;
}

// Notification/Toast props
export interface GamingNotificationProps extends GamingComponentProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  description?: string;
  duration?: number;
  closable?: boolean;
}

// Progress bar props
export interface GamingProgressProps extends GamingComponentProps {
  value?: number;
  max?: number;
  showPercentage?: boolean;
  animated?: boolean;
  striped?: boolean;
}

// Badge/Tag props
export interface GamingBadgeProps extends GamingComponentProps {
  count?: number;
  maxCount?: number;
  dot?: boolean;
  status?: 'success' | 'error' | 'warning' | 'info' | 'default';
}

// Avatar props
export interface GamingAvatarProps extends GamingComponentProps {
  src?: string;
  alt?: string;
  size?: number;
  shape?: 'circle' | 'square' | 'rounded';
  icon?: string;
}

// Tooltip props
export interface GamingTooltipProps extends GamingComponentProps {
  content?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  trigger?: 'hover' | 'click' | 'focus';
  visible?: boolean;
}

// Tab props
export interface GamingTabProps extends GamingComponentProps {
  key?: string;
  tab?: string;
  disabled?: boolean;
}

// Table props
export interface GamingTableProps extends GamingComponentProps {
  columns?: Array<{
    title: string;
    dataIndex: string;
    key?: string;
    width?: string | number;
    sorter?: boolean;
    filters?: Array<{ text: string; value: string }>;
  }>;
  dataSource?: Array<Record<string, any>>;
  pagination?: {
    current?: number;
    pageSize?: number;
    total?: number;
    showSizeChanger?: boolean;
  };
  loading?: boolean;
  bordered?: boolean;
  size?: 'small' | 'middle' | 'large';
}

// Form props
export interface GamingFormProps extends GamingComponentProps {
  layout?: 'horizontal' | 'vertical' | 'inline';
  labelCol?: { span: number };
  wrapperCol?: { span: number };
  onFinish?: (values: Record<string, any>) => void;
  onFinishFailed?: (errorInfo: any) => void;
}

// Utility types
export type GamingVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
export type GamingSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type GamingDirection = 'horizontal' | 'vertical' | 'diagonal' | 'radial';

// Event types
export interface GamingEvent {
  type: string;
  target: any;
  timestamp: number;
  data?: any;
}

// Animation types
export interface GamingAnimation {
  name: string;
  duration: number;
  easing: string;
  delay?: number;
  repeat?: number | 'infinite';
}

// Sound types
export interface GamingSound {
  name: string;
  src: string;
  volume: number;
  loop?: boolean;
  preload?: boolean;
}

// Palette types
export interface GamingPalette {
  primary: string;
  secondary: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
  background: string;
  surface: string;
  accent: string;
  muted: string;
  [key: string]: string;
}

// Theme types
export interface GamingTheme {
  name: string;
  palette: GamingPalette;
  spacing: Record<string, string>;
  typography: Record<string, any>;
  shadows: Record<string, string>;
  animations: Record<string, GamingAnimation>;
  sounds: Record<string, GamingSound>;
}

// Component state types
export type ComponentState = 'idle' | 'hovered' | 'pressed' | 'disabled' | 'loading' | 'error';

// Export default theme
export const DEFAULT_GAMING_THEME: GamingTheme = {
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
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  typography: {
    fontFamily: '"Press Start 2P", monospace',
    fontSize: {
      xs: '10px',
      sm: '12px',
      md: '14px',
      lg: '16px',
      xl: '18px',
    },
  },
  shadows: {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.5)',
    md: '0 4px 8px rgba(0,0,0,0.5)',
    lg: '0 8px 16px rgba(0,0,0,0.5)',
    glow: '0 0 20px rgba(0,255,136,0.5)',
  },
  animations: {
    bounce: {
      name: 'bounce',
      duration: 300,
      easing: 'ease-in-out',
      repeat: 2,
    },
    pulse: {
      name: 'pulse',
      duration: 1000,
      easing: 'ease-in-out',
      repeat: 'infinite',
    },
  },
  sounds: {
    click: {
      name: 'click',
      src: '/sounds/click.wav',
      volume: 0.7,
    },
    hover: {
      name: 'hover',
      src: '/sounds/hover.wav',
      volume: 0.5,
    },
  },
};