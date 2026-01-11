/**
 * Gaming UI Constants - Minimal Working Version
 * Essential constants to get the app running
 */

// Basic Gaming CSS Variables
export const GAMING_CSS_VARS = {
  '--gaming-current-era': '8bit',
  '--gaming-pixel-rendering': 'pixelated',
  '--gaming-font-smoothing': 'none',
  '--gaming-border-radius': '0px',
  '--gaming-transition-speed': '0ms',
  '--gaming-transition-instant': '0ms',
  '--gaming-transition-fast': '100ms',
  '--gaming-transition-normal': '300ms',
  '--yorha-secondary': '#ffd700',
  '--yorha-bg-primary': '#0a0a0a',
  '--yorha-text-primary': '#e0e0e0'
};

// Gaming Breakpoints
export const GAMING_BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1440
};

// Gaming Era Specifications
export const GAMING_ERA_SPECS = {
  '8bit': {, maxColors: 64,
    totalColors: 512,
    resolution: {, width: 256,
      height: 240,
      maxWidth: 512,
      maxHeight: 480
    },
    framerate: 60,
    pixelPerfect: true,
    somClustering: {, enabled: true,
      gridSize: [16, 16],
      learningRate: 0.1,
      neighborhoodRadius: 2,
      maxIterations: 100,
      compressionRatio: 4.0
    }
  },
  '16bit': {, maxColors: 256,
    totalColors: 32768,
    resolution: {, width: 320,
      height: 224,
      maxWidth: 640,
      maxHeight: 448
    },
    framerate: 60,
    pixelPerfect: false,
    somClustering: {, enabled: true,
      gridSize: [32, 32],
      learningRate: 0.05,
      neighborhoodRadius: 3,
      maxIterations: 150,
      compressionRatio: 6.0
    }
  },
  'n64': {, maxColors: 16777216,
    totalColors: 16777216,
    resolution: {, width: 640,
      height: 480,
      maxWidth: 1280,
      maxHeight: 720
    },
    framerate: 30,
    pixelPerfect: false,
    somClustering: {, enabled: true,
      gridSize: [64, 64],
      learningRate: 0.01,
      neighborhoodRadius: 4,
      maxIterations: 200,
      compressionRatio: 8.0,
      realTimeOptimization: true,
      dynamicLOD: true
    }
  }
};

// N64 Texture Presets
export const N64_TEXTURE_PRESETS = {
  lowPoly: {, textureQuality: 'low' as const,
    enableBilinearFiltering: false,
    enableTrilinearFiltering: false,
    anisotropicLevel: 1 as const,
    meshComplexity: 'low' as const,
    materialType: 'basic' as const,
    enableShadows: false,
    maxTextureSize: 256 as const
  },
  balanced: {, textureQuality: 'medium' as const,
    enableBilinearFiltering: true,
    enableTrilinearFiltering: false,
    anisotropicLevel: 4 as const,
    meshComplexity: 'medium' as const,
    materialType: 'phong' as const,
    enableShadows: true,
    maxTextureSize: 512 as const
  },
  highQuality: {, textureQuality: 'high' as const,
    enableBilinearFiltering: true,
    enableTrilinearFiltering: true,
    anisotropicLevel: 16 as const,
    meshComplexity: 'high' as const,
    materialType: 'pbr' as const,
    enableShadows: true,
    maxTextureSize: 1024 as const
  }
};

// Export a working constants object
export const GAMING_CONSTANTS = {
  CSS_VARS: GAMING_CSS_VARS,
  BREAKPOINTS: GAMING_BREAKPOINTS,
  ERA_SPECS: GAMING_ERA_SPECS,
  N64_PRESETS: N64_TEXTURE_PRESETS
};




