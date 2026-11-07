import {
  Color,
  FrontSide,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Texture
} from 'three';

/**
 * N64-style material for three.js (WebGL2 / WebGPU-compat via WebGLRenderer).
 *
 * Approximates, not emulates, the console look:
 *  - per-vertex (Gouraud) lighting: lighting is computed in the vertex shader and interpolated
 *  - optional 3-point texture filtering (instead of bilinear)
 *  - 5-bit-per-channel colour quantise with 4x4 ordered dither
 *  - distance fog
 * Pair with a 320x240 render target (see n64-browser-profile-v1.ts).
 */
export interface N64MaterialOptions {
  map?: Texture | null;
  lightDir?: [number, number, number];
  ambient?: number;
  fogColor?: number;
  fogNear?: number;
  fogFar?: number;
  dither?: boolean;
}

const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform float uAmbient;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vec3 n = normalize(normalMatrix * normal);
    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    float light = clamp(uAmbient + (1.0 - uAmbient) * lambert, 0.0, 1.0);
    vColor = color.rgb * light;
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform bool uHasMap;
  uniform vec2 uMapSize;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform bool uDither;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vFogDepth;

  // 3-point filter: the N64 blends the 3 nearest texels (triangle), not 4.
  vec4 sample3(sampler2D t, vec2 uv, vec2 size) {
    vec2 p = uv * size - 0.5;
    vec2 f = fract(p);
    vec2 b = (floor(p) + 0.5) / size;
    vec2 px = 1.0 / size;
    vec4 c00 = texture2D(t, b);
    vec4 c10 = texture2D(t, b + vec2(px.x, 0.0));
    vec4 c01 = texture2D(t, b + vec2(0.0, px.y));
    vec4 c11 = texture2D(t, b + px);
    return (f.x + f.y <= 1.0)
      ? c00 + f.x * (c10 - c00) + f.y * (c01 - c00)
      : c11 + (1.0 - f.x) * (c01 - c11) + (1.0 - f.y) * (c10 - c11);
  }

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
    return m[i] / 16.0;
  }

  void main() {
    vec3 col = vColor;
    if (uHasMap) col *= sample3(uMap, vUv, uMapSize).rgb;
    float fog = clamp((vFogDepth - uFogNear) / max(uFogFar - uFogNear, 0.0001), 0.0, 1.0);
    col = mix(col, uFogColor, fog);
    // 5 bits per channel = 32 levels
    float levels = 31.0;
    float d = uDither ? (bayer4(gl_FragCoord.xy) - 0.5) / levels : 0.0;
    col = floor(clamp(col + d, 0.0, 1.0) * levels + 0.5) / levels;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createN64Material(opts: N64MaterialOptions = {}): ShaderMaterial {
  const map = opts.map ?? null;
  const img = map?.image as { width?: number; height?: number } | undefined;
  const size = img ? [img.width ?? 32, img.height ?? 32] : [32, 32];
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.common,
      {
        uLightDir: { value: opts.lightDir ?? [0.4, 0.8, 0.6] },
        uAmbient: { value: opts.ambient ?? 0.45 },
        uMap: { value: map },
        uHasMap: { value: map !== null },
        uMapSize: { value: size },
        uFogColor: { value: new Color(opts.fogColor ?? 0x20283a) },
        uFogNear: { value: opts.fogNear ?? 6 },
        uFogFar: { value: opts.fogFar ?? 22 },
        uDither: { value: opts.dither ?? true }
      }
    ]),
    vertexShader,
    fragmentShader,
    vertexColors: true,
    side: FrontSide
  });
}

/** Texture must be nearest-filtered so the shader's 3-point filter does the blending. */
export function prepareN64Texture(t: Texture): Texture {
  t.generateMipmaps = false;
  t.minFilter = 1003; // NearestFilter
  t.magFilter = 1003;
  t.needsUpdate = true;
  return t;
}
