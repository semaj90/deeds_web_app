<!--
  N64 HTML5 Canvas Component
  Advanced HTML5 Canvas wrapper with N64-style texture filtering
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';

  interface Props {
    width?: number;
    height?: number;
    contextType?: '2d' | 'webgl' | 'webgl2' | 'auto';
    preserveDrawingBuffer?: boolean;
    alpha?: boolean;
    antialias?: boolean;
    premultipliedAlpha?: boolean;

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    loading?: boolean;
    renderOptions?: Partial<N64RenderingOptions>;
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enablePostProcessing?: boolean;
    enableShaderEffects?: boolean;
    anisotropicLevel?: number;
    textureQuality?: 'draft' | 'standard' | 'high' | 'ultra';
    enableBilinearFiltering?: boolean;
    enableTrilinearFiltering?: boolean;
    perspective?: number;
    enableDepthTesting?: boolean;
    enableWireframe?: boolean;
    enableParticleSystem?: boolean;
    enableBloom?: boolean;
    glowIntensity?: number;
    enableSpatialAudio?: boolean;
    autoQualityAdjustment?: boolean;
    targetFPS?: number;
    maxPixelRatio?: number;
    enableFabricJS?: boolean;
    fabricConfig?: any;
    class?: string;

    // Events
    onCanvasReady?: (canvas: HTMLCanvasElement, context: any) => void;
    onDraw?: (context: any, deltaTime: number) => void;
    onResize?: (width: number, height: number) => void;
  }

  let {
    width = 800,
    height = 600,
    contextType = 'auto',
    preserveDrawingBuffer = false,
    alpha = true,
    antialias = true,
    premultipliedAlpha = true,

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    loading = false,
    renderOptions = {},
    enableTextureFiltering = true,
    enableMipMapping = false,
    enableFog = true,
    enableLighting = true,
    enablePostProcessing = true,
    enableShaderEffects = false,
    anisotropicLevel = 4,
    textureQuality = 'standard',
    enableBilinearFiltering = true,
    enableTrilinearFiltering = false,
    perspective = 1000,
    enableDepthTesting = true,
    enableWireframe = false,
    enableParticleSystem = false,
    enableBloom = false,
    glowIntensity = 0.4,
    enableSpatialAudio = false,
    autoQualityAdjustment = true,
    targetFPS = 60,
    maxPixelRatio = 2,
    enableFabricJS = false,
    fabricConfig = {},
    class: className = '',

    onCanvasReady,
    onDraw,
    onResize
  }: Props = $props();

  let canvasElement = $state<HTMLCanvasElement | null>(null);
  let context = $state<any>(null);
  let animationFrameId: number | null = null;
  let lastTime = 0;

  const effectiveRenderOptions = {
    ...N64_TEXTURE_PRESETS.highQuality,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  };

  // Fixed Shader Source
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform mat3 u_transform;
    uniform float u_perspective;
    varying vec2 v_texCoord;
    varying float v_depth;

    void main() {
        vec3 position = u_transform * vec3(a_position, 1.0);
        float w = 1.0 + position.z / u_perspective;
        gl_Position = vec4(position.xy / w, position.z, w);
        v_texCoord = a_texCoord;
        v_depth = position.z;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_anisotropicLevel;
    uniform float u_glowIntensity;
    uniform bool u_enableFog;
    uniform bool u_enableDither;
    uniform bool u_enableBloom;
    varying vec2 v_texCoord;
    varying float v_depth;

    vec4 n64TextureFilter(sampler2D tex, vec2 coord) {
        return texture2D(tex, coord);
    }

    void main() {
        gl_FragColor = n64TextureFilter(u_texture, v_texCoord);
    }
  `;

  function initializeCanvas() {
      if (!canvasElement) return;

      const pixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);
      canvasElement.width = width * pixelRatio;
      canvasElement.height = height * pixelRatio;

      // Context init logic simplified for stability
      if (contextType === 'auto') {
          context = canvasElement.getContext('webgl2') ||
                    canvasElement.getContext('webgl') ||
                    canvasElement.getContext('2d');
      } else {
          context = canvasElement.getContext(contextType);
      }

      if (context) {
          if (context.scale && pixelRatio !== 1) {
              context.scale(pixelRatio, pixelRatio);
          }
          onCanvasReady?.(canvasElement, context);
          startRenderLoop();
      }
  }

  function renderLoop(time: number) {
      if (!lastTime) lastTime = time;
      const deltaTime = time - lastTime;
      lastTime = time;

      if (context && !loading) {
          onDraw?.(context, deltaTime);
      }

      animationFrameId = requestAnimationFrame(renderLoop);
  }

  function startRenderLoop() {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(renderLoop);
  }

  $effect(() => {
      initializeCanvas();
      return () => {
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
      }
  });

</script>

<div class="n64-canvas-container {className}" style="width: {width}px; height: {height}px;">
  <canvas
    bind:this={canvasElement}
    class="n64-canvas"
    class:loading
    style="width: 100%; height: 100%; aspect-ratio: {width}/{height};"
  ></canvas>

  {#if loading}
    <div class="canvas-loading">
        Loading Canvas...
    </div>
  {/if}

  {#if enablePostProcessing}
    <div class="post-processing-overlay"></div>
  {/if}
</div>

<style>
  .n64-canvas-container {
    position: relative;
    display: inline-block;
    overflow: hidden;
    background: #000;
  }

  .n64-canvas {
      display: block;
  }

  .canvas-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      background: rgba(0,0,0,0.8);
      font-family: 'Rajdhani', sans-serif;
  }

  .post-processing-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(circle, transparent 50%, rgba(0,0,0,0.3) 100%);
      mix-blend-mode: multiply;
  }
</style>
