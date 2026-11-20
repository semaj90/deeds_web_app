/**
 * Parent Atlas cartoon facial primitives for existing Three.js actor heads.
 * Demo-only generated geometry; cannot identify people or establish evidence.
 * Local axes: +Y up, +Z face-forward. No extra RAF/physics/world owner.
 */
import * as THREE from 'three';

export interface AvatarFaceOptions {
  eyeScale?: number;
  earScale?: number;
  hairLength?: 'none' | 'short' | 'long';
  skinColor?: number;
  hairColor?: number;
}
export interface AvatarFaceEnhancement {
  root: THREE.Group;
  setBlink(left: number, right?: number): void;
  setMouthOpen(value: number): void;
  setSmile(value: number): void;
  setGaze(x: number, y: number): void;
  dispose(): void;
}
const clamp = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

/** Share one sphere geometry per face, dispose when detached; no per-frame allocation. */
export function createCartoonFace(options: AvatarFaceOptions = {}): AvatarFaceEnhancement {
  const scale = THREE.MathUtils.clamp(options.eyeScale ?? 1.4, 0.8, 1.8);
  const ears = THREE.MathUtils.clamp(options.earScale ?? 1.1, 0.7, 1.6);
  const sphere = new THREE.SphereGeometry(1, 12, 9);
  const skin = new THREE.MeshStandardMaterial({ color: options.skinColor ?? 0xc79c7c, roughness: 0.9 });
  const sclera = new THREE.MeshStandardMaterial({ color: 0xfffaf3, roughness: 0.4 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x4b8495, roughness: 0.4 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x1b1a25, roughness: 0.4 });
  const hair = new THREE.MeshStandardMaterial({ color: options.hairColor ?? 0x28252c, side: THREE.DoubleSide, roughness: 0.95 });
  const materials = [skin, sclera, iris, pupil, hair];
  const root = new THREE.Group();
  root.name = 'PA_GeneratedCartoonFace';
  root.userData.parentAtlas = { kind: 'GENERATED_DEMONSTRATIVE', reviewed: false, schema: 'pa-face.v1' };

  function oval(name: string, material: THREE.Material, xyz: [number, number, number], pos: [number, number, number]) {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.name = name;
    mesh.scale.set(...xyz);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }
  const lids: THREE.Mesh[] = [];
  const gazes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'Left' : 'Right';
    const x = side * 0.071;
    oval('PA_EyeWhite' + suffix, sclera, [0.057 * scale, 0.062 * scale, 0.03], [x, 0.024, 0.125]);
    const gaze = new THREE.Group();
    gaze.name = 'PA_Gaze' + suffix;
    gaze.position.set(x, 0.024, 0.15);
    const irisMesh = new THREE.Mesh(sphere, iris);
    irisMesh.name = 'PA_Iris' + suffix;
    irisMesh.scale.set(0.025 * scale, 0.030 * scale, 0.008);
    const pupilMesh = new THREE.Mesh(sphere, pupil);
    pupilMesh.name = 'PA_Pupil' + suffix;
    pupilMesh.scale.set(0.012 * scale, 0.017 * scale, 0.006);
    pupilMesh.position.z = 0.009;
    gaze.add(irisMesh, pupilMesh);
    gazes.push(gaze);
    root.add(gaze);
    const lid = oval('PA_UpperLid' + suffix, skin, [0.060 * scale, 0.007, 0.014], [x, 0.081, 0.156]);
    lids.push(lid);
    oval('PA_Brow' + suffix, hair, [0.058, 0.010, 0.012], [x, 0.109, 0.14]);
    oval('PA_Ear' + suffix, skin, [0.036 * ears, 0.063 * ears, 0.025], [side * 0.139, -0.002, 0]);
  }
  oval('PA_Nose', skin, [0.016, 0.021, 0.027], [0, -0.038, 0.157]);
  const mouth = oval('PA_Mouth', pupil, [0.048, 0.008, 0.008], [0, -0.093, 0.139]);
  const length = options.hairLength ?? 'short';
  if (length !== 'none') {
    oval('PA_HairCap', hair, [0.123, 0.055, 0.115], [0, 0.126, -0.007]);
    const n = length === 'long' ? 0.22 : 0.083;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.027, n), hair);
        card.name = 'PA_HairCard_' + side + '_' + i;
        card.position.set(side * (0.112 + i * 0.005), 0.100 - n / 2, -0.063 + i * 0.029);
        card.rotation.y = side * 0.32;
        root.add(card);
      }
    }
  }
  let disposed = false;
  return {
    root,
    setBlink(left: number, right = left) {
      for (let i = 0; i < 2; i++) {
        const value = clamp(i === 0 ? left : right);
        lids[i].scale.y = 0.007 + value * 0.061 * scale;
        lids[i].position.y = 0.081 - value * 0.032;
      }
    },
    setMouthOpen(value: number) { mouth.scale.y = 0.008 + clamp(value) * 0.043; },
    setSmile(value: number) {
      const t = clamp(value);
      mouth.scale.x = 0.048 + t * 0.018;
      mouth.position.y = -0.093 + t * 0.012;
    },
    setGaze(x: number, y: number) {
      const dx = Number.isFinite(x) ? THREE.MathUtils.clamp(x, -1, 1) * 0.012 : 0;
      const dy = Number.isFinite(y) ? THREE.MathUtils.clamp(y, -1, 1) * 0.010 : 0;
      for (const g of gazes) { g.position.x = (g.name.endsWith('Left') ? -0.071 : 0.071) + dx; g.position.y = 0.024 + dy; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      sphere.dispose();
      for (const material of materials) material.dispose();
      root.traverse(object => {
        if (object instanceof THREE.Mesh && object.geometry !== sphere) object.geometry.dispose();
      });
      root.clear();
    }
  };
}

/**
 * Attach below the existing head transform so crouch/head rotation stays correct.
 * Existing actor root, hitbox, scene registration, animations and arena are unchanged.
 */
export function enhanceExistingDetective(actor: THREE.Group, options: AvatarFaceOptions = {}): AvatarFaceEnhancement {
  const head = actor.userData.head;
  if (!(head instanceof THREE.Object3D)) throw new Error('PA_DETECTIVE_HEAD_MISSING');
  const old = actor.userData.paFace as AvatarFaceEnhancement | undefined;
  old?.dispose();
  const face = createCartoonFace(options);
  face.root.rotation.y = Math.PI / 2; // +Z generated face -> +X detective forward
  face.root.position.set(0, 0, 0);
  head.add(face.root);
  actor.userData.paFace = face;
  return face;
}
