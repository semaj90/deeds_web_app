/**
 * Parent Atlas procedural cartoon avatars, revision 1.
 * Browser-safe Three.js only. Front = +Z; up = +Y; dimensions = meters.
 * DEMONSTRATIVE GENERATED ASSET, never a verified reconstruction of a person.
 *
 * The full avatar uses grouped primitives, NOT skinned deformation.
 * For production animation/garments load a Blender-authored skinned GLB.
 */
import * as THREE from 'three';

export type AvatarStyle = 'male' | 'female' | 'neutral';
export type HairLength = 'short' | 'long' | 'none';
export interface AvatarOptions {
  style?: AvatarStyle;
  hairLength?: HairLength;
  eyeScale?: number; // 1 = already oversized; 1.35 = giant
  earScale?: number;
  skinColor?: number;
  hairColor?: number;
  coatColor?: number;
}
export interface AvatarFaceControls {
  root: THREE.Group;
  setBlink(left: number, right?: number): void;
  setMouthOpen(amount: number): void;
  setSmile(amount: number): void;
  setGaze(x: number, y: number): void;
}
export interface PrimitiveAvatar {
  root: THREE.Group;
  face: AvatarFaceControls;
  headPivot: THREE.Group;
  armPivots: [THREE.Group, THREE.Group];
  legPivots: [THREE.Group, THREE.Group];
  /** Deform the skeleton-like group pivots, not a true skin-bound rig. */
  setWalk(phase: number, amplitude?: number): void;
}

function clamp01(n: number): number { return THREE.MathUtils.clamp(n, 0, 1); }
function ellipsoid(name: string, material: THREE.Material, radii: [number, number, number], segments = 12): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(8, Math.floor(segments * 0.75)));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.scale.set(...radii);
  mesh.castShadow = true;
  return mesh;
}
function meshMat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

const PALETTES: Record<AvatarStyle, { skin: number; hair: number; coat: number; shoulder: number }> = {
  male:    { skin: 0xac795e, hair: 0x332723, coat: 0x26384c, shoulder: 0.32 },
  female:  { skin: 0xd9a789, hair: 0x713c2c, coat: 0x78434b, shoulder: 0.28 },
  neutral: { skin: 0xbba28c, hair: 0x22232c, coat: 0x3c5c55, shoulder: 0.30 }
};

/** Add a configurable facial assembly to any object; object-local +Z is front. */
export function createCartoonFace(options: AvatarOptions = {}): AvatarFaceControls {
  const style = options.style ?? 'neutral';
  const p = PALETTES[style];
  const skin = meshMat(options.skinColor ?? p.skin);
  const hair = meshMat(options.hairColor ?? p.hair);
  const white = meshMat(0xfffcf4, 0.35);
  const iris = meshMat(style === 'female' ? 0x668c71 : 0x518caa, 0.30);
  const black = meshMat(0x18151b, 0.28);
  const blush = meshMat(0xb66e6d);
  const root = new THREE.Group();
  root.name = 'PA_FaceRig';
  root.userData.parentAtlas = { generated: true, reviewed: false, variant: style, schema: 'pa-avatar-1' };
  const size = THREE.MathUtils.clamp(options.eyeScale ?? 1.25, 0.75, 1.8);
  const earSize = THREE.MathUtils.clamp(options.earScale ?? 1.0, 0.7, 1.6);

  const lidObjects: THREE.Mesh[] = [];
  const irises: THREE.Group[] = [];
  for (const [idx, side] of [-1, 1].entries()) {
    const suffix = side < 0 ? 'Left' : 'Right';
    const eyeX = side * 0.092;
    const eye = new THREE.Group();
    eye.name = `PA_Eye${suffix}`;
    eye.position.set(eyeX, 0.025, 0.17);
    const sclera = ellipsoid(`PA_Sclera${suffix}`, white, [0.055 * size, 0.067 * size, 0.028]);
    eye.add(sclera);
    const gaze = new THREE.Group();
    gaze.name = `PA_Gaze${suffix}`;
    const irisMesh = ellipsoid(`PA_Iris${suffix}`, iris, [0.028 * size, 0.036 * size, 0.008]);
    irisMesh.position.z = 0.030;
    const pupil = ellipsoid(`PA_Pupil${suffix}`, black, [0.014 * size, 0.024 * size, 0.006]);
    pupil.position.z = 0.039;
    const catchlight = ellipsoid(`PA_EyeHighlight${suffix}`, white, [0.007, 0.009, 0.002], 8);
    catchlight.position.set(-0.010, 0.013, 0.047);
    gaze.add(irisMesh, pupil, catchlight);
    eye.add(gaze);
    irises.push(gaze);
    // Simple occluding eyelid geometry, not a topology-preserving morph.
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.125 * size, 0.014, 0.025), skin);
    lid.name = `PA_UpperLid${suffix}`;
    lid.position.set(0, 0.066 * size, 0.060);
    eye.add(lid);
    lidObjects.push(lid);
    root.add(eye);

    const brow = ellipsoid(`PA_Brow${suffix}`, hair, [0.067, 0.012, 0.016]);
    brow.position.set(eyeX, 0.115 + (size - 1) * 0.025, 0.18);
    root.add(brow);

    const ear = ellipsoid(`PA_Ear${suffix}`, skin, [0.054 * earSize, 0.088 * earSize, 0.036]);
    ear.position.set(side * 0.255, -0.012, -0.004);
    root.add(ear);
    const innerEar = ellipsoid(`PA_InnerEar${suffix}`, blush, [0.027 * earSize, 0.055 * earSize, 0.008], 10);
    innerEar.position.set(side * 0.260, -0.012, 0.030);
    root.add(innerEar);
  }
  const nose = ellipsoid('PA_Nose', skin, [0.026, 0.035, 0.034]);
  nose.position.set(0, -0.071, 0.195);
  root.add(nose);
  const mouth = ellipsoid('PA_Mouth', black, [0.068, 0.011, 0.008]);
  mouth.position.set(0, -0.151, 0.185);
  root.add(mouth);

  const hairLength = options.hairLength ?? (style === 'female' ? 'long' : 'short');
  if (hairLength !== 'none') {
    const cap = ellipsoid('PA_HairCap', hair, [0.242, 0.103, 0.224]);
    cap.position.set(0, 0.224, -0.010);
    root.add(cap);
    const len = hairLength === 'long' ? 0.43 : 0.15;
    // Flat low-poly hair-card strips; no alpha texture required.
    for (const side of [-1, 1]) {
      for (let n = 0; n < 5; n++) {
        const x = side * (0.185 + n * 0.007);
        const z = -0.09 + n * 0.030;
        const vertices = new Float32Array([
          x - 0.030,  0.235, z,
          x + 0.030,  0.235, z,
          x - 0.018,  0.235 - len * 0.54, z + 0.026,
          x + 0.018,  0.235 - len * 0.54, z + 0.026,
          x - 0.006,  0.235 - len, z - 0.008,
          x + 0.006,  0.235 - len, z - 0.008
        ]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
        geo.computeVertexNormals();
        const card = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: options.hairColor ?? p.hair, side: THREE.DoubleSide, roughness: 0.95}));
        card.name = `PA_HairCard_${side}_${n}`;
        root.add(card);
      }
    }
  }

  return {
    root,
    setBlink(left: number, right = left) {
      [left, right].forEach((amount, i) => {
        const t = clamp01(amount);
        lidObjects[i].scale.y = 1 + t * size * 13;
        lidObjects[i].position.y = (0.066 - t * 0.047) * size;
      });
    },
    setMouthOpen(amount: number) {
      const t = clamp01(amount);
      mouth.scale.y = 0.011 * (1 + t * 4.5);
      mouth.position.y = -0.151 - 0.012 * t;
    },
    setSmile(amount: number) {
      const t = clamp01(amount);
      mouth.scale.x = 0.068 * (1 + t * 0.40);
      mouth.position.y = -0.151 + 0.015 * t;
    },
    setGaze(x: number, y: number) {
      for (const irisGroup of irises) {
        irisGroup.position.x = THREE.MathUtils.clamp(x, -1, 1) * 0.014;
        irisGroup.position.y = THREE.MathUtils.clamp(y, -1, 1) * 0.012;
      }
    }
  };
}

/** Preserve the existing DetectiveActor meshes, picker, BVH, and arena slot. */
export function enhanceExistingDetective(actor: THREE.Group, options: AvatarOptions = {}): AvatarFaceControls {
  const prior = actor.getObjectByName('PA_FaceAnchor');
  if (prior) { actor.remove(prior); disposeAvatar(prior); }
  const face = createCartoonFace(options);
  const anchor = new THREE.Group();
  anchor.name = 'PA_FaceAnchor';
  // CrimeSceneViewer3D: detector head centre (0.34, 0.88, 0), forward +X.
  // Our procedural face is +Z forward; rotate about Y to face +X.
  anchor.position.set(0.385, 0.88, 0); // slightly forward of the original visor
  anchor.rotation.order = 'ZYX';
  anchor.rotation.z = -0.42;
  anchor.rotation.y = Math.PI / 2;
  anchor.scale.setScalar(0.52); // fit existing 22-cm detective head
  actor.add(anchor);
  anchor.add(face.root);
  return face;
}

/** Independent standing demo avatar; group pivots are deliberately not a GLB skinned rig. */
export function createPrimitiveAvatar(options: AvatarOptions = {}): PrimitiveAvatar {
  const style = options.style ?? 'neutral';
  const p = PALETTES[style];
  const coat = meshMat(options.coatColor ?? p.coat);
  const skin = meshMat(options.skinColor ?? p.skin);
  const dark = meshMat(0x1b2026);
  const root = new THREE.Group();
  root.name = `PA_${style}_GeneratedAvatar`;
  root.userData.parentAtlas = { generated: true, reviewed: false, sourceEvidenceId: null, schema: 'pa-avatar-1' };

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 1.06;
  root.add(torsoPivot);
  const torso = ellipsoid('PA_JacketBodyRigid', coat, [p.shoulder, 0.40, 0.17]);
  torsoPivot.add(torso);
  // Jacket front panels, intentionally rigid and child of torso pivot.
  for (const side of [-1, 1]) {
    const panel = ellipsoid('PA_JacketPanelRigid', coat, [0.13, 0.30, 0.042]);
    panel.position.set(side * 0.12, -0.035, 0.175);
    torsoPivot.add(panel);
  }
  const hips = ellipsoid('PA_Hips', dark, [0.23, 0.15, 0.18]);
  hips.position.y = 0.72;
  root.add(hips);

  const neck = ellipsoid('PA_Neck', skin, [0.073, 0.11, 0.071]);
  neck.position.y = 1.54;
  root.add(neck);
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.78;
  root.add(headPivot);
  headPivot.add(ellipsoid('PA_Head', skin, [0.252, 0.302, 0.205]));
  const face = createCartoonFace(options);
  headPivot.add(face.root);

  const armPivots: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const legPivots: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  for (const [i, side] of [-1, 1].entries()) {
    const arm = armPivots[i];
    arm.name = side < 0 ? 'PA_ShoulderLeft' : 'PA_ShoulderRight';
    arm.position.set(side * p.shoulder, 1.34, 0);
    root.add(arm);
    const sleeve = ellipsoid('PA_SkinnedSleevePlaceholder', coat, [0.105, 0.30, 0.105]);
    sleeve.position.y = -0.24;
    arm.add(sleeve);
    const hand = ellipsoid('PA_Hand', skin, [0.067, 0.105, 0.07]);
    hand.position.y = -0.54;
    arm.add(hand);

    const leg = legPivots[i];
    leg.name = side < 0 ? 'PA_HipLeft' : 'PA_HipRight';
    leg.position.set(side * 0.13, 0.72, 0);
    root.add(leg);
    const pant = ellipsoid('PA_Pant', dark, [0.117, 0.32, 0.12]);
    pant.position.y = -0.31;
    leg.add(pant);
    const boot = ellipsoid('PA_Boot', dark, [0.12, 0.105, 0.17]);
    boot.position.set(0, -0.60, 0.035);
    leg.add(boot);
  }
  return {
    root, face, headPivot, armPivots, legPivots,
    setWalk(phase: number, amplitude = 0.28) {
      for (let i = 0; i < 2; i++) {
        const direction = i === 0 ? -1 : 1;
        armPivots[i].rotation.x = Math.sin(phase) * amplitude * direction;
        legPivots[i].rotation.x = -Math.sin(phase) * amplitude * direction;
      }
    }
  };
}

/** Release geometry/materials owned by an avatar when it leaves the scene. */
export function disposeAvatar(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      geos.add(obj.geometry);
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) mats.add(m);
    }
  });
  for (const geometry of geos) geometry.dispose();
  for (const material of mats) material.dispose();
}
