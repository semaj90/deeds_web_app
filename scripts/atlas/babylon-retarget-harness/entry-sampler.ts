import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, SceneLoader, Quaternion } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { parseGlb, sampleClip, toRig } from './src/lib/courtroom/glb-clip-sampler-v1';
import { aliceBoneForAnyClipNode } from './src/lib/courtroom/bone-retarget-v1';
import { retargetPose } from './src/lib/courtroom/rest-pose-retarget-v1';

(window as any).runSampler = async (charUrl: string, clipUrl: string, times: number[]) => {
	const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; document.body.appendChild(canvas);
	const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
	const scene = new Scene(engine);
	const cam = new ArcRotateCamera('c', Math.PI / 2, Math.PI / 2.2, 3, new Vector3(0, 0.7, 0), scene);
	new HemisphericLight('l', new Vector3(0, 1, 0), scene);
	SceneLoader.OnPluginActivatedObservable.add((l: any) => { if ('animationStartMode' in l) l.animationStartMode = 0; });
	await SceneLoader.ImportMeshAsync('', '', charUrl, scene);
	scene.stopAllAnimations();
	const fetchParsed = async (u: string) => parseGlb(new Uint8Array(await (await fetch(u)).arrayBuffer()));
	const [clip, alice] = [await fetchParsed(clipUrl), await fetchParsed(charUrl)];
	const srcRig = toRig(clip); const tgtRig = toRig(alice);
	const tgtNames = new Set(tgtRig.map((b) => b.name)); const map: Record<string, string> = {};
	for (const b of srcRig) { const t = aliceBoneForAnyClipNode(b.name); if (t && tgtNames.has(t)) map[b.name] = t; }
	const ext = scene.getWorldExtends((m: any) => m.isVisible && m.getTotalVertices() > 0);
	const center = ext.min.add(ext.max).scale(0.5); const size = ext.max.subtract(ext.min);
	cam.setTarget(center); cam.radius = Math.max(size.y * 1.8, 1.8); cam.minZ = 0.01;
	scene.clearColor = new (scene.clearColor.constructor as any)(0.15, 0.2, 0.35, 1);
	const shots: string[] = []; const stats: any[] = [];
	for (const t of times) {
		const srcLocal: any = {}; sampleClip(clip, 0, t).forEach((q, node) => { srcLocal[clip.bones[node].name] = q; });
		const out: any = retargetPose(srcRig, tgtRig, map, srcLocal);
		let applied = 0;
		for (const [name, q] of Object.entries(out)) { const n: any = scene.getTransformNodeByName(name); if (n) { n.rotationQuaternion = n.rotationQuaternion ?? new Quaternion(); n.rotationQuaternion.set((q as any)[0], (q as any)[1], (q as any)[2], (q as any)[3]); applied++; } }
		for (let i = 0; i < 3; i++) { scene.render(); await new Promise((r) => setTimeout(r, 30)); }
		shots.push(canvas.toDataURL('image/png')); stats.push({ t, mapped: Object.keys(map).length, applied });
	}
	return { stats, shots, animations: clip.animations.length, duration: Math.round(clip.animations[0].duration * 10) / 10 };
};
