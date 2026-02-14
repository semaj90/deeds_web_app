/**
 * Gaming UI Constants and Color Palettes
 * Authentic retro gaming colors and presets
 */
import type { NESColorPalette, SNESColorPalette, N64RenderingOptions } from '../types/gaming-types';

// NES Color Palette (hardware accurate)
export const NES_COLOR_PALETTE: NESColorPalette & { success: string, warning: string, error: string, info: string } = {
    background: ['#0f0f0f', '#7c7c7c', '#bcbcbc', '#fcfcfc'],
    sprites: ['#f83800', '#3cbcfc', '#92cc41', '#f7d51d'],
    ui: ['#0f0f0f', '#fcfcfc', '#7c7c7c', '#bcbcbc'],
    black: '#0f0f0f',
    white: '#fcfcfc',
    darkGray: '#7c7c7c',
    lightGray: '#bcbcbc',
    red: '#f83800',
    blue: '#3cbcfc',
    green: '#92cc41',
    yellow: '#f7d51d',
    success: '#92cc41',
    warning: '#f7d51d',
    error: '#f83800',
    info: '#3cbcfc'
};

// SNES Color Palette (enhanced 16-bit)
export const SNES_COLOR_PALETTE: SNESColorPalette = {
    background: ['#0f0f0f', '#7c7c7c', '#bcbcbc', '#fcfcfc'],
    sprites: ['#f83800', '#3cbcfc', '#92cc41', '#f7d51d'],
    ui: ['#0f0f0f', '#fcfcfc', '#7c7c7c', '#bcbcbc'],
    effects: ['#8b41fc', '#fc9838', '#38fcfc', '#fc38fc'],
    black: '#0f0f0f',
    white: '#fcfcfc',
    darkGray: '#7c7c7c',
    lightGray: '#bcbcbc',
    red: '#f83800',
    blue: '#3cbcfc',
    green: '#92cc41',
    yellow: '#f7d51d',
    purple: '#8b41fc',
    orange: '#fc9838',
    cyan: '#38fcfc',
    magenta: '#fc38fc',
    pink: '#fc9cfc',
    lime: '#9cfc38',
    primaryGradient: ['#3cbcfc', '#0084ff', '#0050cc'],
    secondaryGradient: ['#f7d51d', '#cc8800', '#996600']
};

// N64 Texture and Rendering Presets (Enhanced)
export const N64_TEXTURE_PRESETS = {
    lowPoly: {
        textureQuality: 'low',
        enableBilinearFiltering: false,
        enableTrilinearFiltering: false,
        anisotropicLevel: 1,
        meshComplexity: 'low',
        materialType: 'basic',
        enableShadows: false,
        enableReflections: false,
        shadowMapSize: 256
    } as N64RenderingOptions,

    balanced: {
        textureQuality: 'medium',
        enableBilinearFiltering: true,
        enableTrilinearFiltering: false,
        anisotropicLevel: 4,
        meshComplexity: 'medium',
        materialType: 'phong',
        enableShadows: true,
        enableReflections: false,
        shadowMapSize: 512,
        enableAntiAliasing: true,
        enableTextureFiltering: true,
        enableMipMapping: false,
        polygonCount: 'medium',
        enableFog: true,
        fogColor: '#202020',
        fogDensity: 0.05,
        enableZBuffer: true,
        depthTesting: true
    } as N64RenderingOptions & {
        enableAntiAliasing: boolean,
        enableTextureFiltering: boolean,
        enableMipMapping: boolean,
        polygonCount: 'medium',
        enableFog: boolean,
        fogColor: string,
        fogDensity: number,
        enableZBuffer: boolean,
        depthTesting: boolean
    },

    highQuality: {
        textureQuality: 'high',
        enableBilinearFiltering: true,
        enableTrilinearFiltering: true,
        anisotropicLevel: 16,
        meshComplexity: 'high',
        materialType: 'pbr',
        enableShadows: true,
        enableReflections: true,
        shadowMapSize: 1024
    } as N64RenderingOptions,

    ultraEnhanced: {
        textureQuality: 'ultra',
        enableBilinearFiltering: true,
        enableTrilinearFiltering: true,
        anisotropicLevel: 16,
        meshComplexity: 'ultra',
        materialType: 'pbr',
        enableShadows: true,
        enableReflections: true,
        shadowMapSize: 2048
    } as N64RenderingOptions
};

// Responsive gaming breakpoints
export const GAMING_BREAKPOINTS = {
    handheld: '(max-width: 320px)',
    nes: '(max-width: 480px)',
    snes: '(max-width: 768px)',
    n64: '(min-width: 769px)',
    lowPerformance: '(max-device-memory: 2)',
    mediumPerformance: '(max-device-memory: 4)',
    highPerformance: '(min-device-memory: 5)'
};

// Gaming era specifications
export const GAMING_ERA_SPECS = {
    '8bit': {
        maxColors: 25,
        totalColors: 64,
        resolution: { width: 256, height: 240 },
        refreshRate: 60,
        audioChannels: 4,
        memoryKB: 2,
        cpuMhz: 1.79
    },
    '16bit': {
        maxColors: 256,
        totalColors: 32768,
        resolution: { width: 512, height: 448 },
        refreshRate: 60,
        audioChannels: 8,
        memoryKB: 128,
        cpuMhz: 3.58
    },
    'n64': {
        maxColors: 16777216,
        totalColors: 16777216,
        resolution: { width: 640, height: 480, maxWidth: 1280, maxHeight: 720 },
        refreshRate: 60,
        audioChannels: 64,
        memoryMB: 4,
        cpuMhz: 93.75
    }
};

// CSS Custom Properties
export const GAMING_CSS_VARS = {
    '--nes-black': NES_COLOR_PALETTE.black,
    '--nes-white': NES_COLOR_PALETTE.white,
    '--nes-dark-gray': NES_COLOR_PALETTE.darkGray,
    '--nes-light-gray': NES_COLOR_PALETTE.lightGray,
    '--nes-red': NES_COLOR_PALETTE.red,
    '--nes-blue': NES_COLOR_PALETTE.blue,
    '--nes-green': NES_COLOR_PALETTE.green,
    '--nes-yellow': NES_COLOR_PALETTE.yellow,
    '--snes-purple': SNES_COLOR_PALETTE.purple,
    '--snes-orange': SNES_COLOR_PALETTE.orange,
    '--snes-cyan': SNES_COLOR_PALETTE.cyan,
    '--snes-magenta': SNES_COLOR_PALETTE.magenta,
    '--snes-pink': SNES_COLOR_PALETTE.pink,
    '--snes-lime': SNES_COLOR_PALETTE.lime,
    '--gaming-unit': '8px',
    '--nes-border-width': '2px',
    '--snes-border-width': '1px',
    '--n64-border-radius': '4px',
    '--gaming-font-8bit': '"Press Start 2P", monospace',
    '--gaming-font-16bit': '"Orbitron", sans-serif',
    '--gaming-font-n64': '"Rajdhani", sans-serif',
    '--gaming-transition-instant': '0ms',
    '--gaming-transition-fast': '100ms',
    '--gaming-transition-normal': '200ms',
    '--gaming-transition-slow': '400ms'
};

export const GAMING_COMPONENT_SIZES = {
    small: { padding: 'calc(var(--gaming-unit) * 1)', fontSize: '10px', minHeight: 'calc(var(--gaming-unit) * 4)' },
    medium: { padding: 'calc(var(--gaming-unit) * 2)', fontSize: '12px', minHeight: 'calc(var(--gaming-unit) * 6)' },
    large: { padding: 'calc(var(--gaming-unit) * 3)', fontSize: '14px', minHeight: 'calc(var(--gaming-unit) * 8)' },
    xl: { padding: 'calc(var(--gaming-unit) * 4)', fontSize: '16px', minHeight: 'calc(var(--gaming-unit) * 10)' }
};

export const RETRO_EFFECTS = {
    scanlines: { name: 'Scanlines', cssFilter: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)', performance: 'low' },
    crt: { name: 'CRT Monitor', cssFilter: 'contrast(1.2) brightness(1.1) saturate(1.3)', borderRadius: '10px', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.3)', performance: 'medium' },
    pixelate: { name: 'Pixel Perfect', imageRendering: 'pixelated', msInterpolationMode: 'nearest-neighbor', performance: 'low' },
    glitch: { name: 'Digital Glitch', animation: 'glitch 2s infinite', performance: 'high' }
};

export const GAMING_SOUND_EFFECTS = {
    '8bit': { buttonPress: '/sounds/8bit/button-press.wav', menuMove: '/sounds/8bit/menu-move.wav', error: '/sounds/8bit/error.wav', success: '/sounds/8bit/success.wav' },
    '16bit': { buttonPress: '/sounds/16bit/button-press.wav', menuMove: '/sounds/16bit/menu-move.wav', error: '/sounds/16bit/error.wav', success: '/sounds/16bit/success.wav' },
    'n64': { buttonPress: '/sounds/n64/button-press.wav', menuMove: '/sounds/n64/menu-move.wav', error: '/sounds/n64/error.wav', success: '/sounds/n64/success.wav' }
};

export const ENHANCED_MEMORY_CACHING = {
    redisCache: { enabled: true, maxMemoryMB: 64 },
    lokiCache: { enabled: true, autoSave: true },
    webgpuCache: { enabled: true, deviceLimits: { maxBufferSize: 268435456 } }
};

export const PREDICTIVE_UI_ANALYTICS = {
    yoloDetection: { enabled: true, modelVersion: 'YOLOv8n' }
};
