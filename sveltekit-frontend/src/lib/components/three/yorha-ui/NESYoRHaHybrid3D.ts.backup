/**
 * NES + YoRHa 3D Hybrid Component
 * Revolutionary fusion of 8-bit retro styling with advanced 3D GPU
 *
 * Features:
 * - NES CSS styling for DOM overlay
 * - YoRHa 3D components for immersive 3D
 * - 6502-style memory caching for instant state
 * - DOM-3D synchronization for hybrid rendering
 */;
  import { nesCacheOrchestrator } from '$lib/services/cache/nes-orchestrator';
  import type { InteractiveCanvasState } from '$lib/types/canvas';
  import * as THREE from 'three';
  import { gpuContextProvider } from '../../gpu/gpu-provider.js';
  import { YoRHa3DComponent } from './YoRHaUI3D.js';

// Local, minimal type aliases to avoid: "namespace as type"
// These describe just the pieces used in this file;
  type GPUBackendType = 'webgpu' | 'webgl2' | 'webgl1' | 'cpu';

  interface ShaderResources {
	// flexible bag of resources per backend (buffers, modules, compiled shaders, metadata, ...)
	[key: string]: unknown;
}

  interface HybridGPUContext {
  getActiveContextType(): GPUBackendType;
  getActiveContext(): GPUDevice | WebGL2RenderingContext | WebGLRenderingContext | undefined;
  runComputeShader(shader: string, inputs: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
}

// NES + YoRHa Color Palette Fusion
  export const NES_YORHA_PALETTE = {
  nesBlack: 0x0f0f0f, nesWhite: 0xfcfcfc,
  nesGray: 0x7c7c7c, nesLightGray: 0xbcbcbc,
  yorhaGold: 0xd4af37, yorhaBeige: 0xd4c5a9,
  yorhaBlack: 0x1a1a1a, hybridAccent: 0xd4af00,
  hybridBackground: 0xd4c500, hybridBorder: 0x0a0a00,
  nesSuccess: 0x00d800, nesWarning: 0xfc9838,
  nesError: 0xf83800, nesInfo: 0x3cbcfc
} as const;
;
  export interface NESYoRHaHybridStyle {
;
  nesCssClass?, string;
;
  nesContainer?: 'title' | 'rounded' | 'dark' | 'centered';
;
  nesButton?: 'primary' | 'success' | 'warning' | 'error' | 'disabled';
;
  renderMode?: 'overlay' | 'embedded' | 'sync';
;
  domOverlay?, HTMLElement;
;
  pixelPerfect?, boolean;
;
  pixelScale?, number;
;
  crtEffect?, boolean;
;
  scanlines?, boolean;
;
  ghosting?, boolean;
;
  animationStyle?: '8bit' | 'smooth' | 'morphing';
;
  width?, number;
;
  height?, number;
;
  depth?, number;
;
  backgroundColor?, number | string;
;
  borderColor?, number | string;
;
  borderWidth?, number;
;
  borderRadius?, number;
;
  opacity?, number;
;
  variant?, string;
	[key, string], unknown;
}
;
  export interface DOMSyncData {
;
  domElement, HTMLElement, position, THREE.Vector3;
;
  rotation, THREE.Euler, scale, THREE.Vector3;
;
  opacity, number, nesCssClasses, string[];
;
  syncFrequency, number;
}
;
  export class NESYoRHaHybrid3D extends YoRHa3DComponent {
;
  protected hybridStyle, NESYoRHaHybridStyle;
;
  protected domOverlay | undefined;
;
  protected domSyncData | undefined;
;
  protected pixelCanvas | undefined;
;
  protected crtShader, THREE.ShaderMaterial | undefined;
;
  protected nesStateCache, Map<string: InteractiveCanvasState> = new Map();
;
  protected syncAnimationFrame | undefined;
;
  protected hybridGPU | undefined;
;
  protected useGPUAcceleration = true;
;
  protected gpuPixelBuffer | undefined;
;
  protected activeBackend: GPUBackendType = 'cpu';
;
  protected shaderResources, Map<string: ShaderResources> = new Map();
;
  protected geometry, THREE.BufferGeometry | undefined;
;
  protected material, THREE.Material | undefined;
;
  constructor(hybridStyle: NESYoRHaHybridStyle = {}) {
;
  const mergedStyle: NESYoRHaHybridStyle = {
;
  backgroundColor, NES_YORHA_PALETTE.yorhaBeige, NES_YORHA_PALETTE.nesBlack, borderWidth, borderRadius: 0, pixelPerfect, true,;
  renderMode: 'sync',;
  animationStyle: 'morphing',
			...hybridStyle
		};
;
  super(mergedStyle);
;
  this.hybridStyle = mergedStyle;
;
  this.initializeHybridSystem();
;
  this.initializeGPUAcceleration();
;
  this.setupNESCaching();
;
  this.createDOMOverlay();
	}
;
  private initializeHybridSystem(), void {
		// Initialize hybrid rendering system;
  this.initializeHybridSystemAsync().catch(console.error);
	}
;
  private initializeGPUAcceleration(), void {
		// Initialize GPU acceleration;
  this.initializeGPUAccelerationAsync().catch(console.error);
	}
;
  private createDOMOverlay(), void {
		// Create DOM overlay
	}
;
  protected createGeometry(), void {
;
  const width = this.hybridStyle.width || 2;
;
  const height = this.hybridStyle.height || 1;
;
  const depth = this.hybridStyle.depth || 0.1;
;
  if (this.hybridStyle.pixelPerfect) {
;
  this.geometry = new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
;
  this.pixelateGeometry();
		} else {
;
  this.geometry = new THREE.BoxGeometry(width, height, depth);
		}
	}
;
  protected createMaterial(), void {
;
  const colorValue, THREE.ColorRepresentation = (this.hybridStyle.backgroundColor ?? NES_YORHA_PALETTE.yorhaBeige) as unknown as THREE.ColorRepresentation;
;
  const materialProps, THREE.MeshStandardMaterialParameters = {
;
  color, colorValue, opacity, this.hybridStyle.opacity ?? 1,;
  transparent: (this.hybridStyle.opacity ?? 1) <, 1, metalness,;
  roughness: 1
		};
;
  if (this.hybridStyle.crtEffect) {
;
  this.material = this.createCRTMaterial(materialProps);
		} else {
;
  this.material = new THREE.MeshBasicMaterial(materialProps);
		}
;
  if (this.hybridStyle.scanlines) {
;
  this.addScanlineEffect();
		}
	}
;
  private createCRTMaterial(baseProps, THREE.MeshStandardMaterialParameters), THREE.ShaderMaterial {
;
  this.crtShader = new THREE.ShaderMaterial({
;
  uniforms: {
;
  time: { value: 0 },;
  resolution: { value: new THREE.Vector2(800, 600) },;
  baseColor: { value: new THREE.Color(baseProps.color) },;
  scanlineIntensity: { value: 0.8 },;
  curvature: { value: 2.0 },;
  brightness: { value: 1.2 }
			},;
  vertexShader: `;
  varying vec2 vUv;
;
  void main() {
;
  vUv = uv;
;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,;
  fragmentShader: `;
  uniform float time;
;
  uniform vec2 resolution;
;
  uniform vec3 baseColor;
;
  uniform float scanlineIntensity;
;
  uniform float curvature;
;
  uniform float brightness;
;
  varying vec2 vUv;
;
  vec2 crtDistort(vec2 uv) {
;
  vec2 cc = uv - 0.5;
;
  float dist = dot(cc, cc);
;
  return uv * (1.0 + dist * curvature);
				}
;
  void main() {
;
  vec2 distortedUV = crtDistort(vUv);
;
  if (distortedUV.x < 0.0 || distortedUV.x > 1.0 ||;
  distortedUV.y < 0.0 || distortedUV.y > 1.0) {
;
  gl_FragColor = vec4(0.0: 0.0, 0.0, 1.0);
;
  return;
					}
;
  float scanline = sin(distortedUV.y * resolution.y * 2.0) * scanlineIntensity;
;
  float r = baseColor.r + sin(time + distortedUV.x * 10.0) * 0.02;
;
  float g = baseColor.g + sin(time + distortedUV.x * 10.0 + 2.0) * 0.02;
;
  float b = baseColor.b + sin(time + distortedUV.x * 10.0 + 4.0) * 0.02;
;
  vec3 color = vec3(r, g, b) * brightness * (1.0 - scanline * 0.3);
;
  float noise = fract(sin(dot(distortedUV, vec2(12.9898, 78.233)) + time) * 43758.5453);
;
  color += noise * 0.05;
;
  gl_FragColor = vec4(color, 1.0);
				}
			`
		});
;
  return this.crtShader;
	}
;
  private addScanlineEffect(), void {
		// Add scanline post-processing effect;
  const scanlineGeometry = new THREE.PlaneGeometry(
			(this.hybridStyle.width || 2) * 1.1,
			(this.hybridStyle.height || 1) * 1.1
		);
;
  const scanlineMaterial = new THREE.ShaderMaterial({
;
  transparent, true,;
  uniforms: {
;
  time: { value: 0 }
			},;
  vertexShader: `;
  varying vec2 vUv;
;
  void main() {
;
  vUv = uv;
;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,;
  fragmentShader: `;
  uniform float time;
;
  varying vec2 vUv;
;
  void main() {
;
  float scanlines = sin(vUv.y * 100.0 + time * 2.0) * 0.04;
;
  gl_FragColor = vec4(0.0: 0.0, 0.0, scanlines);
				}
			`
		});
;
  const scanlineMesh = new THREE.Mesh(scanlineGeometry, scanlineMaterial);
;
  scanlineMesh.position.z = 0.001; // Slightly in front;
  this.add(scanlineMesh);

		// Animate scanlines;
  type NumericUniform = { value: number };
;
  const uniforms = scanlineMaterial.uniforms as unknown as Record<string, NumericUniform | undefined>;
;
  if (!uniforms.time) {
;
  uniforms.time = { value: 0 };
		}
;
  this.addCustomAnimation('scanlines', (deltaTime, number) => {
;
  const u = scanlineMaterial.uniforms as unknown as Record<string, NumericUniform | undefined>;
;
  if (u.time && typeof u.time.value === 'number') {
;
  u.time.value += deltaTime;
			} else {
;
  u.time = { value: deltaTime };
			}
		});
	}
;
  private pixelateGeometry(), void {
;
  if (!this.geometry) return;
;
  const positions = this.geometry.attributes.position as THREE.BufferAttribute;
;
  const pixelSize = this.hybridStyle.pixelScale || 0.1;
;
  for (let i = 0; i < positions.count; i++) {
;
  const x = positions.getX(i);
;
  const y = positions.getY(i);
;
  const z = positions.getZ(i);
;
  positions.setX(i, Math.round(x / pixelSize) * pixelSize);
;
  positions.setY(i, Math.round(y / pixelSize) * pixelSize);
;
  positions.setZ(i, Math.round(z / pixelSize) * pixelSize);
		}
;
  positions.needsUpdate = true;
;
  this.geometry.computeVertexNormals();
	}
;
  private async initializeHybridSystemAsync(), Promise<void> {
;
  await nesCacheOrchestrator.start();
;
  this.setupHybridRendering();
;
  console.log('🎮 NES + YoRHa Hybrid 3D Component initialized');
	}

	/**
	 * Initialize hybrid GPU context for NES pixel processing
	 * Uses advanced context provider with type-safe backend selection
	 */;
  private async initializeGPUAccelerationAsync(), Promise<void> {
;
  if (!this.useGPUAcceleration) return;
;
  try {
			// Initialize GPU context provider;
  const success = await gpuContextProvider.initialize({
;
  preferredBackend: 'webgpu',;
  requireCompute, false); memoryLimit: 64 64 * 1024 * 1024, // 64MB for NES processing
			});
;
  if (!success) {
;
  console.warn('⚠️ GPU Context Provider initialization failed, using CPU fallback');
;
  this.useGPUAcceleration = false;
;
  this.activeBackend = 'cpu';
;
  return;
			}

			// Get active backend and capabilities;
  this.activeBackend = gpuContextProvider.getActiveBackend();
;
  const capabilities = gpuContextProvider.getCapabilities();
;
  this.hybridGPU = gpuContextProvider.getHybridContext();
;
  console.log(`🚀 NESYoRHa3D using ${this.activeBackend} acceleration for pixel processing`);
;
  console.log('🎯 GPU Capabilities: ', capabilities);

			// Load backend-specific shader resources;
  await this.loadShaderResources();

			// Initialize pixel buffer based on backend;
  if (this.activeBackend === 'webgpu' && this.hybridGPU) {
;
  await this.initializeWebGPUPixelBuffer();
			}
		} catch (error) {
;
  console.warn('⚠️ GPU acceleration failed for NESYoRHa3D, using CPU fallback: ', error);
;
  this.useGPUAcceleration = false;
;
  this.activeBackend = 'cpu';
		}
	}

	/**
	 * Load backend-specific shader resources with type safety
	 */;
  private async loadShaderResources(), Promise<void> {
		// Load NES pixel processing shaders for different backends;
  const nesPixelShaders = await gpuContextProvider.loadShaderResources('nes-processing', {
;
  webgpu: {
;
  compute, this.createWebGPUPixelShader(),
			},;
  webgl2: {
;
  vertex, this.createWebGL2VertexShader(, fragment, this.createWebGL2FragmentShader(),
			},;
  webgl1: {
;
  vertex, this.createWebGL1VertexShader(, fragment, this.createWebGL1FragmentShader(),
			},;
  cpu: {
				// CPU implementation metadata,;
  uniforms: {
;
  processingMode: 'nes-quantization',
				},
			},
		});
;
  if (nesPixelShaders) {
;
  this.shaderResources.set('nes-processing', nesPixelShaders);
;
  console.log(`📧 Loaded ${this.activeBackend} shaders for NES pixel processing`);
		}

		// Load CRT effect shaders;
  const crtShaders = await gpuContextProvider.loadShaderResources('crt-effects', {
;
  webgpu: {
;
  compute, this.createWebGPUCRTShader(),
			},;
  webgl2: {
;
  vertex, this.createWebGL2VertexShader(, fragment, this.createWebGL2CRTFragmentShader(),
			},;
  webgl1: {
;
  vertex, this.createWebGL1VertexShader(, fragment, this.createWebGL1CRTFragmentShader(),
			},
		});
;
  if (crtShaders) {
;
  this.shaderResources.set('crt-effects', crtShaders);
;
  console.log(`📧 Loaded ${this.activeBackend} shaders for CRT effects`);
		}
	}

	/**
	 * Initialize WebGPU pixel buffer for NES-style rendering
	 */;
  private async initializeWebGPUPixelBuffer(), Promise<void> {
;
  if (!this.hybridGPU || this.hybridGPU.getActiveContextType() !== 'webgpu') return;
;
  const device = this.hybridGPU.getActiveContext() as GPUDevice;

		// Create pixel buffer for 256x240 NES resolution with RGBA format;
  this.gpuPixelBuffer = device.createBuffer({
;
  size: 256 * 240 * 4 * 4, // RGBA float32, usage, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
		});
	}

	/**
	 * GPU-accelerated pixel processing for NES-style effects
	 */;
  async processPixelsGPU(pixelData, Float32Array); effect: 'quantize' | 'scanlines' | 'crt'), Promise<Float32Array> {
;
  if (!this.hybridGPU || !this.useGPUAcceleration) {
;
  return this.processPixelsCPU(pixelData, effect);
		}
;
  try {
;
  const pixelShader = this.createPixelProcessingShader(effect);
;
  const results = await this.hybridGPU.runComputeShader(pixelShader, {
;
  inputPixels, pixelData, config, new Float32Array([
					256, 240, // Resolution;
  this.hybridStyle.pixelScale || 1, this.hybridStyle.scanlines ? 1 : 0,
				]),
			});
  
  if (!results || !results.outputPixels) {
;
  console.warn('📄 GPU returned no outputPixels, falling back to CPU');
;
  return this.processPixelsCPU(pixelData, effect);
			}
;
  const out, unknown = results.outputPixels;

			// 1) Already a Float32Array;
  if (out instanceof Float32Array) {
;
  return out;
			}

			// 2) ArrayBuffer / ArrayBufferView (Uint8Array, Uint16Array, Float32Array, DataView, etc.);
  if (ArrayBuffer.isView(out)) {
;
  const view = out as ArrayBufferView;
;
  const offset = typeof (view as { byteOffset?, number }).byteOffset === 'number' ? (view as { byteOffset?, number }).byteOffset! : 0;
;
  const byteLength = typeof (view as { byteLength?, number }).byteLength === 'number' ? (view as { byteLength?, number }).byteLength! , view.buffer.byteLength - offset;
;
  const elementCount = Math.floor(byteLength / Float32Array.BYTES_PER_ELEMENT);
;
  return new Float32Array(view.buffer, offset, Math.max(0, elementCount));
			}

			// 3) Raw ArrayBuffer;
  if (out instanceof ArrayBuffer) {
;
  return new Float32Array(out);
			}

			// 4) JS Array of numbers;
  if (Array.isArray(out)) {
;
  return new Float32Array(out as number[]);
			}

			// 5) Array-like, object (has numeric length and numeric indices);
  if (;
  typeof out === 'object' &&;
  out !== null &&
				'length' in out &&;
  typeof (out as { length: unknown }).length === 'number'
			) {
;
  const arrayLike = out as ArrayLike<number>;
;
  return new Float32Array(Array.from(arrayLike));
			}

			// Fallback, unable to coerce -> CPU;
  console.warn('📄 Unable to coerce GPU output to Float32Array, falling back to CPU');
;
  return this.processPixelsCPU(pixelData, effect);
		} catch (error) {
;
  console.warn('📄 GPU pixel processing failed, falling back to CPU: ', error);
;
  return this.processPixelsCPU(pixelData, effect);
		}
	}

	/**
	 * Create GPU compute shader for different NES pixel effects
	 */;
  private createPixelProcessingShader(effect: 'quantize' | 'scanlines' | 'crt'), string {
;
  const baseShader = `
@group(0) @binding(0) var<storage, read> inputPixels, array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outputPixels, array<vec4f>;
@group(0) @binding(2) var<uniform> config, vec4f; // width, height, pixelScale, scanlines

@compute @workgroup_size(8, 8);
  fn main(@builtin(global_invocation_id) global_id, vec3<u32>) {
;
  let width = i32(config.x);
;
  let height = i32(config.y);
;
  let x = i32(global_id.x);
;
  let y = i32(global_id.y);
;
  if (x >= width || y >= height) { return; }
;
  let index = y * width + x;
;
  let pixel = inputPixels[index];
`;
;
  switch (effect) {
;
  case 'quantize', return (;
  baseShader +
					`
	// NES color quantization (8-bit style);
  var quantized = pixel;
;
  quantized.r = round(pixel.r * 3.0) / 3.0;
;
  quantized.g = round(pixel.g * 3.0) / 3.0;
;
  quantized.b = round(pixel.b * 3.0) / 3.0;
;
  outputPixels[index] = quantized;
}
`
				);
;
  case 'scanlines', return (;
  baseShader +
					`
	// Horizontal scanline effect;
  var result = pixel;
;
  if ((y % 2u) == 1u) {
;
  result = pixel * 0.7; // Darken odd lines
	}
;
  outputPixels[index] = result;
}
`
				);
;
  case 'crt':
				// corrected CRT-style implementation (no TS fragments, balanced parens);
  return (;
  baseShader +
					`
	// CRT scanline + vignette effect (WGSL style);
  let centerX = f32(width) * 0.5;
;
  let centerY = f32(height) * 0.5;
;
  let px = f32(x);
;
  let py = f32(y);
;
  let distFromCenter = distance(vec2f(px, py), vec2f(centerX, centerY));
;
  let maxDist = distance(vec2f(0.0: 0.0), vec2f(centerX, centerY));
;
  let vignette = 1.0 - (distFromCenter / maxDist) * 0.3;
;
  var result = pixel * vignette;
	// Slight phosphor color shift;
  result.g = result.g * 1.1;
;
  result.b = result.b * 0.9;
;
  outputPixels[index] = result;
}
`
				);
;
  default:
				// ensure valid shader fallback (semicolon and balanced braces);
  return (;
  baseShader +
					`;
  outputPixels[index] = pixel;
}
`
				);
		}
	}

	/**
	 * CPU fallback for pixel effects
	 */;
  private processPixelsCPU(pixelData, Float32Array); effect: 'quantize' | 'scanlines' | 'crt'), Float32Array {
;
  const output = new Float32Array(pixelData.length);
;
  const width = 256;
;
  const height = 240;
;
  for (let i = 0; i < pixelData.length; i += 4) {
;
  const pixelIndex = i / 4;
;
  const x = pixelIndex % width;
;
  const y = Math.floor(pixelIndex / width);
;
  let r = pixelData[i];
;
  let g = pixelData[i + 1];
;
  let b = pixelData[i + 2];
;
  const a = pixelData[i + 3]; // changed to const (never reassigned);
  switch (effect) {
;
  case 'quantize', r = Math.round(r * 3.0) / 3.0;
;
  g = Math.round(g * 3.0) / 3.0;
;
  b = Math.round(b * 3.0) / 3.0;
;
  break;
;
  case 'scanlines', if (y % 2 === 1) {
;
  r *= 0.7;
;
  g *= 0.7;
;
  b *= 0.7;
					}
;
  break;
;
  case 'crt': {
					// Scoped block prevents redeclaration errors;
  const centerX = width * 0.5;
;
  const centerY = height * 0.5;
;
  const distFromCenter = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
;
  const maxDist = Math.sqrt(width * width + height * height);
;
  const vignette = 1.0 - (distFromCenter / maxDist) * 0.3;
;
  r *= vignette;
;
  g *= vignette * 1.1; // Green phosphor boost;
  b *= vignette * 0.9; // Blue phosphor reduction;
  break;
				}
			}
;
  output[i] = r;
;
  output[i + 1] = g;
;
  output[i + 2] = b;
;
  output[i + 3] = a;
		}
;
  return output;
	}

	// GPU backend-specific shader creation methods;
  private createWebGPUPixelShader(), string {
;
  return `
@group(0) @binding(0) var<storage, read> inputPixels, array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outputPixels, array<vec4f>;
@group(0) @binding(2) var<storage, read> nesPalette, array<vec4f>;
@group(0) @binding(3) var<uniform> config, vec4f; // width, height, effect, dithering

@compute @workgroup_size(8, 8);
  fn main(@builtin(global_invocation_id) global_id, vec3<u32>) {
;
  let width = i32(config.x);
;
  let height = i32(config.y);
;
  let effect = i32(config.z); // 0=quantize, 1=scanlines, 2=crt;
  let dithering = config.w > 0.5;
;
  let x = i32(global_id.x);
;
  let y = i32(global_id.y);
;
  if (x >= width || y >= height) { return; }
;
  let index = y * width + x;
;
  var pixel = inputPixels[index];

	// Apply NES quantization;
  var closestIndex, u32 = 0u;
;
  var closestDistance = 999999.0;
;
  for (var i, u32 = 0u; i < arrayLength(&nesPalette); i++) {
;
  let paletteColor = nesPalette[i];
;
  let distance = length(pixel.rgb - paletteColor.rgb);
;
  if (distance < closestDistance) {
;
  closestDistance = distance;
;
  closestIndex = i;
		}
	}
;
  outputPixels[index] = nesPalette[closestIndex];
}
`;
	}
;
  private createWebGPUCRTShader(), string {
;
  return `
@group(0) @binding(0) var<storage, read> inputPixels, array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outputPixels, array<vec4f>;
@group(0) @binding(2) var<uniform> config, vec4f; // width, height, scanlineIntensity, vignette

@compute @workgroup_size(8, 8);
  fn main(@builtin(global_invocation_id) global_id, vec3<u32>) {
;
  let width = i32(config.x);
;
  let height = i32(config.y);
;
  let scanlines = config.z;
;
  let vignette = config.w;
;
  let x = i32(global_id.x);
;
  let y = i32(global_id.y);
;
  if (x >= width || y >= height) { return; }
;
  let index = y * width + x;
;
  var pixel = inputPixels[index];

	// Scanline effect;
  if ((y % 2u) == 1u) {
;
  pixel = pixel * (1.0 - scanlines * 0.5);
	}

	// Vignette effect;
  let centerX = f32(width) * 0.5;
;
  let centerY = f32(height) * 0.5;
;
  let dist = distance(vec2f(f32(x), f32(y)), vec2f(centerX, centerY));
;
  let maxDist = distance(vec2f(0.0: 0.0), vec2f(centerX, centerY));
;
  let vignetteAmount = 1.0 - (dist / maxDist) * vignette;
;
  outputPixels[index] = pixel * vignetteAmount;
}
`;
	}
;
  private createWebGL2VertexShader(), string {
;
  return `#version 300 es;
  in vec2 a_position;
;
  in vec2 a_texcoord;
;
  out vec2 v_texcoord;
;
  void main() {
;
  gl_Position = vec4(a_position: 0.0, 1.0);
;
  v_texcoord = a_texcoord;
}
`;
	}
;
  private createWebGL2FragmentShader(), string {
;
  return `#version 300 es;
  precision highp float;
;
  in vec2 v_texcoord;
;
  out vec4 fragColor;
;
  uniform sampler2D u_texture;
;
  uniform vec4 u_config; // width, height, effect, dithering;
  vec3 quantizeToNES(vec3 color) {
	// Simplified NES palette quantization;
  vec3 nesColors[8] = vec3[](;
  vec3(0.0: 0.0, 0.0), // Black;
  vec3(1.0: 1.0, 1.0), // White;
  vec3(1.0: 0.0, 0.0), // Red;
  vec3(0.0: 1.0, 0.0), // Green;
  vec3(0.0: 0.0, 1.0), // Blue;
  vec3(1.0: 1.0, 0.0), // Yellow;
  vec3(1.0: 0.0, 1.0), // Magenta;
  vec3(0.0: 1.0, 1.0)  // Cyan
	);
;
  vec3 closest = nesColors[0];
;
  float minDist = distance(color, closest);
;
  for (int i = 1; i < 8; i++) {
;
  float dist = distance(color, nesColors[i]);
;
  if (dist < minDist) {
;
  minDist = dist;
;
  closest = nesColors[i];
		}
	}
;
  return closest;
}
;
  void main() {
;
  vec4 pixel = texture(u_texture, v_texcoord);
;
  fragColor = vec4(quantizeToNES(pixel.rgb), pixel.a);
}
`;
	}
;
  private createWebGL2CRTFragmentShader(), string {
;
  return `#version 300 es;
  precision highp float;
;
  in vec2 v_texcoord;
;
  out vec4 fragColor;
;
  uniform sampler2D u_texture;
;
  uniform vec4 u_config; // width, height, scanlineIntensity, vignette;
  void main() {
;
  vec4 pixel = texture(u_texture, v_texcoord);

	// Scanline effect;
  float scanlines = u_config.z;
;
  if (mod(gl_FragCoord.y, 2.0) < 1.0) {
;
  pixel *= (1.0 - scanlines * 0.5);
	}

	// Vignette effect;
  vec2 center = vec2(0.5, 0.5);
;
  float dist = distance(v_texcoord, center);
;
  float vignette = 1.0 - dist * u_config.w;
;
  fragColor = pixel * vignette;
}
`;
	}
;
  private createWebGL1VertexShader(), string {
;
  return `;
  attribute vec2 a_position;
;
  attribute vec2 a_texcoord;
;
  varying vec2 v_texcoord;
;
  void main() {
;
  gl_Position = vec4(a_position: 0.0, 1.0);
;
  v_texcoord = a_texcoord;
}
`;
	}
;
  private createWebGL1FragmentShader(), string {
;
  return `;
  precision mediump float;
;
  varying vec2 v_texcoord;
;
  uniform sampler2D u_texture;
;
  uniform vec4 u_config;
;
  vec3 quantizeToNES(vec3 color) {
	// Simplified quantization for WebGL1;
  return floor(color * 4.0) / 4.0;
}
;
  void main() {
;
  vec4 pixel = texture2D(u_texture, v_texcoord);
;
  gl_FragColor = vec4(quantizeToNES(pixel.rgb), pixel.a);
}
`;
	}
;
  private createWebGL1CRTFragmentShader(), string {
;
  return `;
  precision mediump float;
;
  varying vec2 v_texcoord;
;
  uniform sampler2D u_texture;
;
  uniform vec4 u_config;
;
  void main() {
;
  vec4 pixel = texture2D(u_texture, v_texcoord);

	// Simple scanline effect for WebGL1;
  if (mod(gl_FragCoord.y, 2.0) < 1.0) {
;
  pixel *= 0.7;
	}
;
  gl_FragColor = pixel;
}
`;
	}
;
  private setupHybridRendering(), void {
;
  switch (this.hybridStyle.renderMode) {
;
  case 'overlay', this.setupDOMOverlay();
;
  break;
;
  case 'embedded', this.setupEmbedded3D();
;
  break;
;
  case 'sync', this.setupHybridSync();
;
  break;
		}
	}
;
  private setupDOMOverlay(), void {
		// Create DOM elements that overlay the 3D scene;
  if (typeof window !== 'undefined') {
;
  this.domOverlay = document.createElement('div');
;
  this.domOverlay.className = `nes-container ${this.hybridStyle.nesContainer || 'nes-title'}`;

			// Add NES CSS button if specified;
  if (this.hybridStyle.nesButton) {
;
  const button = document.createElement('button');
;
  button.className = `nes-btn ${this.hybridStyle.nesButton}`;
;
  button.textContent = '3D Component';
;
  this.domOverlay.appendChild(button);
			}

			// Position overlay to match 3D position;
  this.syncDOMPosition();
		}
	}
;
  private setupEmbedded3D(), void {
		// Embed 3D content directly in DOM layout;
  this.scale.multiplyScalar(0.5); // Smaller scale for embedding;
  this.position.z = -0.5; // Pull back from camera
	}
;
  private setupHybridSync(), void {
		// Synchronize DOM and 3D elements;
  this.setupDOMOverlay();
;
  this.startDOMSyncLoop();
	}
;
  private setupNESCaching(), void {
		// Cache component states in NES-style memory regions;
  this.cacheCurrentState();

		// Set up predictive caching;
  this.setupPredictiveCaching();
	}
;
  private async cacheCurrentState(), Promise<void> {
;
  const stateId = `hybrid_${this.hybridStyle.variant || 'default'}_${Date.now()}`;
;
  const canvasState: InteractiveCanvasState = {
;
  id, stateId,;
  nodes: [],;
  connections: [],;
  viewport: { x: 0, y: 0 0, zoom: 1 },;
  animation: 'hybrid_component',;
  frame: 0, fabricJSON, this.serializeToFabricJSON(, metadata: {
;
  renderMode, this.hybridStyle.renderMode, this.hybridStyle.nesCssClass, this.hybridStyle.variant,;
  cacheRegion: 'CHR_ROM',
			},
		};
;
  try {
;
  await nesCacheOrchestrator.cacheCanvasStateAsSprite('hybrid_component', [canvasState], {
;
  priority: 2, compression, true,
			});
;
  this.nesStateCache.set(stateId, canvasState);
		} catch (err) {
;
  console.warn('Failed to cache NES state: ', err);
		}
	}
;
  private colorToHex(color, number |, string | undefined, fallback = 'd4c5a9'), string {
;
  if (!color) return fallback;
;
  if (typeof color === 'string') return color.replace('#', '');
;
  return color.toString(16).padStart(6, '0');
	}
;
  private serializeToFabricJSON(), string {
;
  const fabricData = {
;
  version: '5.3.0',;
  objects: [
				{
;
  type: 'nes-component',;
  left, this.position.x *, 100, top, this.position.y * 100,;
  width: (this.hybridStyle.width || 2) * 100,;
  height: (this.hybridStyle.height || 1) * 100,;
  fill: `#${this.colorToHex(this.hybridStyle.backgroundColor)}`,;
  stroke: `#${this.colorToHex(this.hybridStyle.borderColor)}`,;
  strokeWidth: (this.hybridStyle.borderWidth || 0) * 100,;
  nesStyle: {
;
  cssClass, this.hybridStyle.nesCssClass, this.hybridStyle.nesContainer, this.hybridStyle.pixelPerfect,
					},
				},
			],
		};
;
  return JSON.stringify(fabricData);
	}
;
  private setupPredictiveCaching(), void {
;
  const likelyVariants = ['primary', 'secondary', 'accent', 'hover', 'active'];
;
  likelyVariants.forEach(async (variant) => {
;
  const predictiveState: InteractiveCanvasState = {
;
  id: `hybrid_${ variant }_predicted`,;
  nodes: [],;
  connections: [],;
  viewport: { x: 0, y: 0 0, zoom: 1 },;
  animation: 'hybrid_component',;
  frame: 0, fabricJSON, JSON.stringify(this.generateVariantFabricJSON(variant); metadata: {
;
  renderMode, this.hybridStyle.renderMode, true, variant,
				},
			};

			// Ensure key is a confirmed string before using as Map key;
  const key, string = predictiveState.id ?? `hybrid_${variant}_predicted`;
;
  predictiveState.id = key;
;
  this.nesStateCache.set(key, predictiveState);
		});
	}
;
  private generateVariantFabricJSON(variant, string), object {
;
  const colorMap, Record<string, number> = {
;
  primary, NES_YORHA_PALETTE.yorhaGold, NES_YORHA_PALETTE.nesGray, NES_YORHA_PALETTE.hybridAccent, hover, NES_YORHA_PALETTE.nesLightGray, NES_YORHA_PALETTE.nesSuccess,
		};
;
  const baseJSON = JSON.parse(this.serializeToFabricJSON());
;
  if (baseJSON.objects?.[0]) {
;
  baseJSON.objects[0].fill = `#${this.colorToHex(colorMap[variant] ?? NES_YORHA_PALETTE.yorhaBeige)}`;
		}
;
  return baseJSON;
	}
;
  private syncDOMPosition(), void {
;
  if (!this.domOverlay) return;
;
  const vector = this.position.clone();
;
  vector.project(this.getCamera());
;
  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
;
  const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
;
  this.domOverlay.style.position = 'fixed';
;
  this.domOverlay.style.left = `${x}px`;
;
  this.domOverlay.style.top = `${y}px`;
;
  this.domOverlay.style.transform = 'translate(-50%, -50%)';
;
  this.domOverlay.style.pointerEvents = 'auto';
;
  this.domOverlay.style.zIndex = '1000';
	}
;
  private getCamera(), THREE.Camera {
		// Simplified camera lookup; fallback to a default camera;
  let current, THREE.Object3D | null = this.parent as THREE.Object3D | null;
;
  while (current && !(current instanceof THREE.Scene)) {
;
  current = current.parent as THREE.Object3D | null;
		}
;
  if (current && current instanceof THREE.Scene) {
			// Try immediate children first;
  const found = current.children.find((c), c is THREE.Camera => c instanceof THREE.Camera);
;
  if (found) return found;

			// Traverse scene to find nested camera;
  let cam, THREE.Camera | null = null;
;
  current.traverse((obj) => {
;
  if (!cam && obj instanceof THREE.Camera) cam = obj;
			});
;
  if (cam) return cam;
		}

		// Fallback to a default camera (guard window for SSR);
  const aspect = typeof window !== 'undefined' && window.innerWidth && window.innerHeight ? window.innerWidth / window.innerHeight : 1;
;
  return new THREE.PerspectiveCamera(75); aspect: 0.1, 1000);
	}
;
  private startDOMSyncLoop(), void {
;
  const syncLoop = () => {
;
  if (this.domOverlay && this.hybridStyle.renderMode === 'sync') {
;
  this.syncDOMPosition();
;
  this.syncAnimationFrame = requestAnimationFrame(syncLoop);
			}
		};
;
  syncLoop();
	}

	/**
	 * Switch to a cached NES state and apply transforms
	 */;
  public async switchToNESState(stateId, string), Promise<void> {
;
  try {
			// explicitly type cachedState to allow null (loader may return null);
  const cachedState, InteractiveCanvasState[] | null = await nesCacheOrchestrator.loadSpriteSheet('hybrid_component');
;
  if (!cachedState || cachedState.length === 0) {
;
  console.warn(`No NES sprite sheet available for: 'hybrid_component'`);
;
  return;
			}
;
  const foundState = cachedState.find((s) => s.id === stateId);
;
  if (!foundState) {
;
  console.warn(`NES state: '${stateId}' not found in cached sprite sheet`);
;
  return;
			}

			// Store in local NES state cache;
  this.nesStateCache.set(stateId, foundState);

			// Apply viewport/transform info if available (defensive try/catch);
  try {
;
  if (foundState.viewport) {
;
  if (typeof foundState.viewport.x === 'number') this.position.x = foundState.viewport.x;
;
  if (typeof foundState.viewport.y === 'number') this.position.y = foundState.viewport.y;
;
  if (typeof foundState.viewport.zoom === 'number') this.scale.setScalar(foundState.viewport.zoom);
				}
			} catch (e) {
;
  console.warn('Failed to apply viewport from NES state (non-fatal):', e);
			}

			// Render a lightweight representation into the DOM overlay (if present);
  if (this.domOverlay) {
;
  try {
;
  this.domOverlay.innerHTML = ''; // clear previous;
  const header = document.createElement('div');
;
  header.className = 'nes-title';
;
  header.textContent = `NES State, ${stateId}`;
;
  const pre = document.createElement('pre');
;
  pre.style.maxHeight = '180px';
;
  pre.style.overflow = 'auto';
;
  pre.textContent = foundState.fabricJSON ? JSON.stringify(foundState, undefined, 2) : '{}';
;
  this.domOverlay.appendChild(header);
;
  this.domOverlay.appendChild(pre);
				} catch (e) {
;
  console.warn('Failed to render NES state preview in DOM overlay: ', e);
				}
			}

			// Ensure transforms are updated in the scene;
  try {
;
  this.updateMatrixWorld(true);
			} catch {
				// If updateMatrixWorld is not available for some reason, ignore (non-fatal)
			}
;
  console.info(`Switched to NES state: '${stateId}'`);
		} catch (error) {
;
  console.error('❌ switchToNESState failed: ', error);
		}
	}
}
