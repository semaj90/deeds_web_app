import * as THREE from 'three';
import type { EastQuayPerson } from './case-registry-v1.js';
import { decideSyntheticPortraitPresentationV1 } from './case-registry-v1.js';

export interface EastQuayActorHandleV1 {
	root: THREE.Object3D;
	getJoint(name: string): THREE.Object3D | null;
}

const resources = new WeakMap<THREE.Object3D, { card: THREE.Sprite; material: THREE.SpriteMaterial; texture: THREE.CanvasTexture }>();

/** Resolve known rig joints; for static GLBs derive a presentation-only anchor from mesh bounds. */
export function resolveEastQuayHeadAnchorV1(actor: EastQuayActorHandleV1, preferredName = 'joint.head'): { anchor: THREE.Object3D; fallback: boolean } {
	const exact = actor.getJoint(preferredName);
	if (exact) return { anchor: exact, fallback: false };
	const candidates: THREE.Object3D[] = [];
	actor.root.traverse((object) => { if ((object instanceof THREE.Bone || /^(joint|bone)[._ -]/i.test(object.name)) && /head|neck/i.test(object.name)) candidates.push(object); });
	if (candidates[0]) return { anchor: candidates[0], fallback: false };
	const box = new THREE.Box3().setFromObject(actor.root);
	const anchor = new THREE.Group();
	anchor.name = 'synthetic.head-anchor.fallback';
	if (!box.isEmpty()) {
		actor.root.updateWorldMatrix(true, false);
		const top = new THREE.Vector3(box.getCenter(new THREE.Vector3()).x, box.max.y, box.getCenter(new THREE.Vector3()).z);
		anchor.position.copy(actor.root.worldToLocal(top));
	} else anchor.position.set(0, 1.6, 0);
	actor.root.add(anchor);
	return { anchor, fallback: true };
}

/** Synthetic-only visual card; no caller supplied authorization/review flags are accepted. */
export async function attachSyntheticEastQuayPortraitCardV1(actor: EastQuayActorHandleV1, person: EastQuayPerson, assetUrl: string): Promise<{ fallback: boolean }> {
	const plan = decideSyntheticPortraitPresentationV1(person);
	const expectedUrl = `/demos/east-quay-bank-case-v1/${plan.assetPath}`;
	if (assetUrl !== expectedUrl) throw new Error('EAST_QUAY_PORTRAIT_URL_NOT_REGISTERED');
	const image = new Image(); image.decoding = 'async'; image.src = expectedUrl;
	await image.decode();
	const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 304;
	const context = canvas.getContext('2d'); if (!context) throw new Error('EAST_QUAY_CANVAS_UNAVAILABLE');
	context.fillStyle = '#f7f4ec'; context.fillRect(0, 0, 256, 304);
	context.drawImage(image, 24, 16, 208, 224);
	context.fillStyle = '#7c2d12'; context.fillRect(8, 252, 240, 40);
	context.fillStyle = '#fff'; context.font = 'bold 16px sans-serif'; context.textAlign = 'center';
	context.fillText('SYNTHETIC · NOT ID', 128, 278);
	const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
	const card = new THREE.Sprite(material); card.name = `synthetic-portrait-card:${person.personId}`;
	card.scale.set(0.42, 0.5, 1);
	const { anchor, fallback } = resolveEastQuayHeadAnchorV1(actor, plan.headAnchor);
	anchor.add(card);
	const previous = resources.get(actor.root);
	if (previous) { previous.card.removeFromParent(); previous.material.dispose(); previous.texture.dispose(); }
	resources.set(actor.root, { card, material, texture });
	card.userData = { personId: person.personId, classification: 'synthetic_illustration', identityInferenceAllowed: false, demoOnly: true };
	return { fallback };
}

export function removeSyntheticEastQuayPortraitV1(root: THREE.Object3D): void {
	const resource = resources.get(root);
	if (!resource) return;
	resource.card.removeFromParent(); resource.material.dispose(); resource.texture.dispose(); resources.delete(root);
}
