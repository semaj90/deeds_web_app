/**
 * CRT post-processing effect for Babylon.js.
 * Ported from src/lib/gpu/shaders/crt-postprocess.wgsl to GLSL.
 *
 * NOTE: No top-level @babylonjs/core imports — Babylon is passed in
 * from the caller to keep the module lazy-loadable.
 */

const SHADER_NAME = 'crtRetro';

const CRT_FRAGMENT_SHADER = /* glsl */ `
	precision highp float;
	varying vec2 vUV;
	uniform sampler2D textureSampler;
	uniform float time;
	uniform vec2 resolution;
	uniform float scanlineIntensity;
	uniform float curvature;
	uniform float vignetteStrength;
	uniform float noiseAmount;
	uniform float chromaticAberration;

	// Barrel distortion
	vec2 barrelDistort(vec2 uv, float amt) {
		vec2 cc = uv - 0.5;
		float dist = dot(cc, cc);
		return uv + cc * dist * amt;
	}

	// Pseudo-random noise
	float rand(vec2 co) {
		return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
	}

	void main() {
		vec2 uv = barrelDistort(vUV, curvature);

		// Out-of-bounds check (barrel distortion can push UVs outside 0-1)
		if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
			gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
			return;
		}

		// Chromatic aberration
		float caOffset = chromaticAberration * 0.002;
		float r = texture2D(textureSampler, uv + vec2(caOffset, 0.0)).r;
		float g = texture2D(textureSampler, uv).g;
		float b = texture2D(textureSampler, uv - vec2(caOffset, 0.0)).b;
		vec3 color = vec3(r, g, b);

		// Scanlines
		float scanline = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
		color *= 1.0 - scanlineIntensity * (1.0 - scanline);

		// Phosphor glow (horizontal RGB stripes)
		float px = floor(mod(uv.x * resolution.x, 3.0));
		vec3 phosphor = vec3(
			px == 0.0 ? 1.0 : 0.7,
			px == 1.0 ? 1.0 : 0.7,
			px == 2.0 ? 1.0 : 0.7
		);
		color *= mix(vec3(1.0), phosphor, scanlineIntensity * 0.3);

		// Vignette
		vec2 vig = uv * (1.0 - uv);
		float vigFactor = pow(vig.x * vig.y * 15.0, vignetteStrength);
		color *= vigFactor;

		// Static noise
		float noise = rand(uv + vec2(time * 0.1, 0.0)) * noiseAmount;
		color += vec3(noise);

		// Slight flicker
		color *= 0.98 + 0.02 * sin(time * 8.0);

		gl_FragColor = vec4(color, 1.0);
	}
`;

export interface CRTOptions {
	scanlineIntensity?: number;
	curvature?: number;
	vignetteStrength?: number;
	noiseAmount?: number;
	chromaticAberration?: number;
}

/**
 * Create a CRT post-process effect.
 * @param babylonCore - The lazily-imported @babylonjs/core module
 * @param camera - The camera to attach the effect to
 * @param options - CRT visual parameters
 */
export function createCRTPostProcess(
	babylonCore: typeof import('@babylonjs/core'),
	camera: import('@babylonjs/core').Camera,
	options: CRTOptions = {},
): import('@babylonjs/core').PostProcess {
	const { Effect, PostProcess } = babylonCore;

	// Register shader (idempotent — safe to call multiple times)
	Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = CRT_FRAGMENT_SHADER;

	const {
		scanlineIntensity = 0.25,
		curvature = 0.4,
		vignetteStrength = 0.6,
		noiseAmount = 0.03,
		chromaticAberration = 0.8,
	} = options;

	const pp = new PostProcess(
		'crtEffect',
		SHADER_NAME,
		['time', 'resolution', 'scanlineIntensity', 'curvature', 'vignetteStrength', 'noiseAmount', 'chromaticAberration'],
		null,
		1.0,
		camera,
	);

	let startTime = performance.now();

	pp.onApply = (effect) => {
		const elapsed = (performance.now() - startTime) / 1000;
		effect.setFloat('time', elapsed);
		effect.setFloat2('resolution', pp.width, pp.height);
		effect.setFloat('scanlineIntensity', scanlineIntensity);
		effect.setFloat('curvature', curvature);
		effect.setFloat('vignetteStrength', vignetteStrength);
		effect.setFloat('noiseAmount', noiseAmount);
		effect.setFloat('chromaticAberration', chromaticAberration);
	};

	return pp;
}
