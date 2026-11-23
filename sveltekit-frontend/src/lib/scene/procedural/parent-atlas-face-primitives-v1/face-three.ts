import * as THREE from 'three';
import { generateFaceMesh, type FaceParams } from './face-math.js';

/** Browser-only: do not import this Three.js adapter into SvelteKit SSR server modules. */
export function createFaceGroup(p: FaceParams): THREE.Group {
  const meshData = generateFaceMesh(p, 24, 16);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
  geo.computeBoundingSphere();
  const root = new THREE.Group(); root.name = 'face:generated:v1';
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6b19b, roughness: 0.88, flatShading: true });
  const head = new THREE.Mesh(geo, skin);
  head.name = 'face.head'; root.add(head);
  const rx = p.headWidthM / 2, ry = p.headHeightM / 2, rz = p.headDepthM / 2;
  const earGeo = new THREE.SphereGeometry(1, 8, 6);
  for (const side of ['left', 'right'] as const) {
    const xsign = side === 'left' ? -1 : 1;
    const ear = new THREE.Mesh(earGeo, skin);
    ear.name = `face.ear.${side}`;
    ear.position.set(xsign * rx * 1.02, -ry * 0.09, 0);
    ear.scale.set(rx * 0.23, ry * 0.19, rz * 0.26);
    root.add(ear);
  }
  const eyeGeo = new THREE.SphereGeometry(1, 10, 8);
  const dark = new THREE.MeshStandardMaterial({ color: 0x292626, roughness: 0.4 });
  for (const side of ['left', 'right'] as const) {
    const socket = meshData.landmarks[`eye.${side}`];
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.name = `face.eye.${side}`;
    eye.position.set(socket[0], socket[1], socket[2]);
    eye.scale.set(rx * 0.13, ry * 0.055, rz * 0.026);
    root.add(eye);
  }
  const noseAnchor = new THREE.Object3D(); noseAnchor.name = 'face.nose';
  noseAnchor.position.set(...meshData.landmarks['nose.tip']); root.add(noseAnchor);
  const mouthAnchor = new THREE.Object3D(); mouthAnchor.name = 'face.mouth';
  mouthAnchor.position.set(...meshData.landmarks['mouth.center']); root.add(mouthAnchor);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(rx * 0.50, ry * 0.026, 0.002),
    new THREE.MeshStandardMaterial({ color: 0x6f413c, roughness: 1 }));
  mouth.name = 'face.mouth.mark'; mouthAnchor.add(mouth);
  root.userData.provenance = { kind: 'procedural_generated', sourceSha256: null };
  return root;
}

/** Independent hair-card accessory: never infer hairstyle from the face preset. */
export function createHairCards(p: FaceParams, style: 'short' | 'long', color = 0x352e2b): THREE.Group {
  const hair = new THREE.Group(); hair.name = `face.hair.${style}`;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
  const rx = p.headWidthM / 2, ry = p.headHeightM / 2, rz = p.headDepthM / 2;
  const length = style === 'long' ? ry * 1.45 : ry * 0.44;
  const strips = style === 'long' ? 12 : 8;
  for (let j = 0; j < strips; j++) {
    const phi = 2 * Math.PI * j / strips;
    const width = rx * (style === 'long' ? 0.56 : 0.72);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(width, length, 1, 1), mat);
    card.name = `hair.card.${j.toString().padStart(2, '0')}`;
    // Cards sit around the crown and hang down (not skin/physics simulated).
    card.position.set(rx * 0.86 * Math.cos(phi), ry * 0.66 - length * 0.36,
      rz * 0.86 * Math.sin(phi));
    card.rotation.y = Math.PI / 2 - phi;
    hair.add(card);
  }
  hair.userData.provenance = 'procedural_generated';
  return hair;
}
