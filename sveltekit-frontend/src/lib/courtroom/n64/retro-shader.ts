import * as THREE from 'three';

// Three.js ShaderMaterial: keep the source mesh vertex colors / PBR base colors as a palette.
// We use view-space normals and a view-space light vector to avoid mixing coordinate spaces.
const vertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPositionView;
  void main() {
    vec4 posView = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vPositionView = posView.xyz;
    gl_Position = projectionMatrix * posView;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uBaseColor;
  uniform vec3 uLightView;
  uniform float uSteps;
  uniform float uSpecular;
  uniform float uSpecPower;
  uniform float uRim;
  uniform float uDither;
  varying vec3 vNormalView;
  varying vec3 vPositionView;

  // Stable, cheap 4x4 ordered threshold, intended for the retro preset.
  float ordered4(vec2 pixel) {
    vec2 p = mod(floor(pixel), 4.0);
    float a = mod(p.x, 2.0);
    float b = floor(p.x / 2.0);
    float c = mod(p.y, 2.0);
    float d = floor(p.y / 2.0);
    return (8.0 * a + 4.0 * c + 2.0 * b + d) / 15.0;
  }

  void main() {
    vec3 N = normalize(vNormalView);
    vec3 L = normalize(uLightView);
    vec3 V = normalize(-vPositionView);
    float diffuse = max(dot(N, L), 0.0);
    float threshold = (ordered4(gl_FragCoord.xy) - 0.5) * uDither;
    if (uSteps > 1.0) {
      diffuse = floor(clamp(diffuse + threshold, 0.0, 0.999) * uSteps) / (uSteps - 1.0);
    }
    float shade = 0.29 + 0.71 * clamp(diffuse, 0.0, 1.0);
    vec3 reflected = reflect(-L, N);
    float spec = pow(max(dot(reflected, V), 0.0), uSpecPower) * uSpecular;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim;
    vec3 color = uBaseColor * shade + vec3(spec) + vec3(0.22, 0.62, 0.78) * fresnel;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const LOOKS = Object.freeze({
  n64: { steps: 3, specular: 0.02, specPower: 14, rim: 0.01, dither: 0.30, scale: 0.55 },
  toy: { steps: 0, specular: 0.38, specPower: 22, rim: 0.16, dither: 0, scale: 1.0 },
  toon: { steps: 4, specular: 0.12, specPower: 30, rim: 0.38, dither: 0, scale: 1.0 },
});

export function makeRetroMaterial(sourceColor = new THREE.Color('#60e0bb')) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uBaseColor: { value: sourceColor.clone() },
      uLightView: { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() },
      uSteps: { value: 3 },
      uSpecular: { value: 0.02 },
      uSpecPower: { value: 14 },
      uRim: { value: 0.01 },
      uDither: { value: 0.3 },
    },
    toneMapped: true,
  });
}

export function applyLook(root, look) {
  const settings = LOOKS[look] ?? LOOKS.n64;
  root.traverse((object) => {
    if (!object.isMesh || !object.material?.uniforms?.uSteps) return;
    const u = object.material.uniforms;
    u.uSteps.value = settings.steps;
    u.uSpecular.value = settings.specular;
    u.uSpecPower.value = settings.specPower;
    u.uRim.value = settings.rim;
    u.uDither.value = settings.dither;
  });
  return settings;
}
