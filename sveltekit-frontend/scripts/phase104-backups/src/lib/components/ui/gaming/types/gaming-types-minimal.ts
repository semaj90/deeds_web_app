/** * Gaming Types - Minimal Working Version */ export type GamingEra = '8bit' | '16bit' | 'n64';
export interface GamingThemeState {
 currentEra: GamingEra; availableEras: GamingEra[];
 isTransitioning: boolean; transitionDuration: number;
 performanceLevel: 'low' | 'medium' | 'high';
 era: GamingEra; colorPalette: string[];
 soundEnabled: boolean; particleEffects: boolean;
 retroShaders: boolean;
}

export interface ProgressiveGamingConfig {
 defaultEra: GamingEra; enableAutoEvolution: boolean;
 performanceThreshold: number; autoDetectPerformance: boolean;
 fallbackToLowQuality: boolean; adaptiveFrameRate: boolean;
 thermalThrottling: boolean; batteryOptimization: boolean;
 nesSettings: { strictPalette: boolean; enableScanlines: boolean; pixelScale: number };
 snesSettings: { enableGradients: boolean; enableModeViitColors: boolean; layerCount: number };
 n64Settings: { enableAntiAliasing: boolean;
 enableTextureFiltering: boolean; enableMipMapping: boolean;
 polygonCount: string; enableFog: boolean;
 fogColor: string; fogDensity: number;
 enableZBuffer: boolean; depthTesting: boolean;
 enableRealTimeReflections: boolean; textureQuality: string;
 };
 yorhaIntegration: boolean; bitsUICompatibility: boolean;
}

export interface GamingComponentProps {
 variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'outline';
 size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
 disabled?: boolean;
 loading?: boolean;
 class?: string;
 style?: string;
 [key, string];
 any;
}

export interface N64RenderingOptions {
 textureQuality: 'low' | 'medium' | 'high' | 'ultra';
 enableBilinearFiltering: boolean; enableTrilinearFiltering: boolean;
 anisotropicLevel: 1 | 2 | 4 | 8 | 16;
 meshComplexity: 'low' | 'medium' | 'high' | 'ultra';
 materialType: 'basic' | 'phong' | 'pbr';
 enableShadows: boolean; enableReflections: boolean;
 shadowMapSize: 256 | 512 | 1024 | 2048;
}

export interface NESColorPalette {
 background: string[]; sprites: string[];
 ui: string[];
 black?: string;
 white?: string;
 darkGray?: string;
 lightGray?: string;
 red?: string;
 blue?: string;
 green?: string;
 yellow?: string;
}

export interface SNESColorPalette {
 background: string[]; sprites: string[];
 ui: string[]; effects: string[];
 black?: string;
 white?: string;
 darkGray?: string;
}

export interface GamepadState {
 connected: boolean; id: string;
 buttons: boolean[]; axes: number[];
}




