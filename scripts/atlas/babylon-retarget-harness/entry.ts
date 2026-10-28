// Babylon retarget harness (tooling evidence, not app code). Bundle from sveltekit-frontend/ so Babylon and the repo modules resolve:
//   cp scripts/atlas/babylon-retarget-harness/entry.ts sveltekit-frontend/harness.entry.tmp.ts && cd sveltekit-frontend && npx esbuild ./harness.entry.tmp.ts --bundle --format=iife --outfile=../.tmp/atlas/babylon-harness/bundle.js && rm harness.entry.tmp.ts
// Run (dev server on :5173; set MSYS_NO_PATHCONV=1 in Git Bash): MSYS_NO_PATHCONV=1 node run.mjs <clip> [/models/courtroom/character_alice_skinned.glb]  (paths in run.mjs are relative to sveltekit-frontend/)
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, SceneLoader, SceneLoaderAnimationGroupLoadingMode, Quaternion } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { retargetPose, qAngleDeg } from './src/lib/courtroom/rest-pose-retarget-v1';
import { CLIP_TO_ALICE_BONE } from './src/lib/courtroom/bone-retarget-v1';

(window as any).runHarness = async (charUrl: string, clipUrl: string) => {
	const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; document.body.appendChild(canvas);
	const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
	const scene = new Scene(engine);
	const cam = new ArcRotateCamera('c', Math.PI / 2, Math.PI / 2.2, 4, new Vector3(0, 1, 0), scene);
	new HemisphericLight('l', new Vector3(0, 1, 0), scene);
	const res: any = {};
	SceneLoader.OnPluginActivatedObservable.add((l: any) => { if ('animationStartMode' in l) l.animationStartMode = 0; }); // NONE: do not auto-play on import
	const ch = await SceneLoader.ImportMeshAsync('', '', charUrl, scene);
	res.meshes = ch.meshes.length; res.skeletons = ch.skeletons.length;
	res.boneCount = ch.skeletons.reduce((n, s) => n + s.bones.length, 0);
	res.charAnimGroups = scene.animationGroups.length;
	const nodeNames = new Set([...scene.transformNodes.map((n) => n.name), ...scene.meshes.map((m) => m.name), ...scene.skeletons.flatMap((s) => s.bones.map((b) => b.name))]);
	const before = scene.animationGroups.length;
	await SceneLoader.ImportAnimationsAsync('', clipUrl, scene, false, SceneLoaderAnimationGroupLoadingMode.NoSync);
	const groups = scene.animationGroups.slice(before);
	res.clipGroups = groups.length;
	let targets = 0, resolvedByName = 0, resolvedByTable = 0; const unresolved = new Set<string>();
	for (const g of groups) for (const ta of g.targetedAnimations) {
		targets++; const n = (ta.target as any)?.name as string;
		if (nodeNames.has(n)) resolvedByName++; else if (CLIP_TO_ALICE_BONE[n as keyof typeof CLIP_TO_ALICE_BONE] && nodeNames.has(CLIP_TO_ALICE_BONE[n as keyof typeof CLIP_TO_ALICE_BONE])) resolvedByTable++; else unresolved.add(n);
	}
	res.targetedAnimations = targets; res.targetsResolvedByName = resolvedByName; res.targetsResolvableViaTable = resolvedByTable; res.unresolvedSample = [...unresolved].slice(0, 6);
	scene.stopAllAnimations();
	res.autoPlaying = scene.animationGroups.filter((g) => g.isPlaying).length;
	const isAlice = (n: any) => n.name.startsWith('J_Bip_');
	const qv = (n: any): [number, number, number, number] => n.rotationQuaternion ? [n.rotationQuaternion.x, n.rotationQuaternion.y, n.rotationQuaternion.z, n.rotationQuaternion.w] : [0, 0, 0, 1];
	const mapped = Object.entries(CLIP_TO_ALICE_BONE);
	const srcSet = new Set(mapped.map(([k]) => k)); const tgtSet = new Set(mapped.map(([, v]) => v));
	const srcLeaf = scene.transformNodes.filter((n: any) => !isAlice(n) && srcSet.has(n.name));
	const tgtLeaf = scene.transformNodes.filter((n: any) => isAlice(n) && tgtSet.has(n.name));
	const withAncestors = (nodes: any[]) => { const all = new Map<any, any>(); const add = (n: any) => { if (!n || all.has(n) || typeof n.rotationQuaternion === 'undefined') return; add(n.parent); all.set(n, n); }; nodes.forEach(add); return [...all.keys()]; };
	const idS = (n: any) => n.name + '#' + n.uniqueId;
	const build = (nodes: any[]) => { const set = new Set(nodes); return nodes.map((n) => ({ name: idS(n), parent: n.parent && set.has(n.parent) ? idS(n.parent) : null, restLocal: qv(n) })); };
	const srcNodes = withAncestors(srcLeaf); const tgtNodes = withAncestors(tgtLeaf);
	const srcRig: any[] = build(srcNodes); const tgtRig = build(tgtNodes);
	res.skinInfo = {
		skeletons: scene.skeletons.map((sk) => ({ name: sk.name, bones: sk.bones.length, linkedToWrittenNodes: sk.bones.filter((b) => tgtLeaf.includes(b.getTransformNode() as any)).length })),
		skinnedMeshes: scene.meshes.filter((m) => m.skeleton).map((m) => ({ name: m.name.slice(0, 22), verts: m.getTotalVertices(), skeletonIndex: scene.skeletons.indexOf(m.skeleton as any) })).sort((a, b) => b.verts - a.verts).slice(0, 8),
		unskinnedDetail: scene.meshes.filter((m) => !m.skeleton && m.getTotalVertices() > 0 && m.name !== '__root__').map((m) => { let p: any = m.parent; const chain: string[] = []; while (p && chain.length < 4) { chain.push(p.name); p = p.parent; } return { name: m.name.slice(0, 24), verts: m.getTotalVertices(), parents: chain }; }),
		unskinnedVisibleMeshes: scene.meshes.filter((m) => !m.skeleton && m.getTotalVertices() > 0 && m.name !== '__root__').length,
		duplicateNames: (() => { const c: Record<string, number> = {}; scene.transformNodes.forEach((n: any) => { if (n.name.startsWith('J_Bip_L_UpperArm') || n.name === 'J_Bip_C_Head') c[n.name] = (c[n.name] || 0) + 1; }); return c; })(),
	};
	// True bind pose of the clip armature: raw node rotations from the clip GLB JSON chunk (the scene shows its frame-0 mocap pose).
	{ const buf = await (await fetch(clipUrl)).arrayBuffer(); const dv = new DataView(buf); const jl = dv.getUint32(12, true); const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
	  const bind = new Map<string, number[]>((json.nodes as any[]).filter((n) => n.name).map((n) => [n.name, n.rotation ?? [0, 0, 0, 1]]));
	  let patched = 0; srcRig.forEach((r) => { const nm = r.name.split('#')[0]; if (bind.has(nm)) { r.restLocal = bind.get(nm); patched++; } }); res.bindPosePatched = patched; }
	const map: any = {}; mapped.forEach(([k, v]) => { const s1 = srcLeaf.find((n: any) => n.name === k); const t1 = tgtLeaf.find((n: any) => n.name === v); if (s1 && t1) map[idS(s1)] = idS(t1); });
	res.rigs = { srcRigSize: srcRig.length, tgtRigSize: tgtRig.length, mappedPairs: Object.keys(map).length, rootNames: [srcNodes[0]?.name, tgtNodes[0]?.name] };
	const tgtById = new Map(tgtNodes.map((n: any) => [idS(n), n])); const restTgt = new Map(tgtNodes.map((n: any) => [idS(n), qv(n)]));
	const apply = () => { const srcLocal: any = {}; srcNodes.forEach((n: any) => { srcLocal[idS(n)] = qv(n); }); const out: any = retargetPose(srcRig as any, tgtRig as any, map, srcLocal); for (const [id, q] of Object.entries(out)) { const n: any = tgtById.get(id); if (n) { n.rotationQuaternion = n.rotationQuaternion ?? new Quaternion(); n.rotationQuaternion.set((q as any)[0], (q as any)[1], (q as any)[2], (q as any)[3]); } } };
	scene.onBeforeRenderObservable.add(apply);
	const ext = scene.getWorldExtends((m) => m.isVisible && m.getTotalVertices() > 0);
	const center = ext.min.add(ext.max).scale(0.5); const size = ext.max.subtract(ext.min);
	cam.setTarget(center); cam.radius = Math.max(size.y * 1.8, 1.8); cam.minZ = 0.01; scene.activeCamera = cam;
	scene.clearColor = new (scene.clearColor.constructor as any)(0.15, 0.2, 0.35, 1);
	for (let i = 0; i < 3; i++) { scene.render(); await new Promise((r) => setTimeout(r, 30)); }
	const dAt = (label: string) => { let maxDeg = 0, moved = 0; const per: any = {}; Object.keys(map).forEach((sid) => { const n: any = tgtById.get(map[sid]); const d = qAngleDeg(qv(n), restTgt.get(map[sid]) as any); if (d > 2) moved++; maxDeg = Math.max(maxDeg, d); per[n.name.replace('J_Bip_', '')] = Math.round(d); }); return { label, aliceBonesMoved: moved, maxDegFromRest: Math.round(maxDeg * 10) / 10, perBone: per }; };
	const wp = (n: any) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
	const pairs: [string, string][] = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['Hips', 'Neck'], ['LeftThigh', 'LeftShin']];
	const vecs = () => { const o: any = {}; for (const [a1, b1] of pairs.slice(0, 4)) { const sa = srcLeaf.find((n: any) => n.name === a1), sb = srcLeaf.find((n: any) => n.name === b1); const ta = tgtLeaf.find((n: any) => n.name === (CLIP_TO_ALICE_BONE as any)[a1]), tb = tgtLeaf.find((n: any) => n.name === (CLIP_TO_ALICE_BONE as any)[b1]); if (!sa || !sb || !ta || !tb) continue; const r3 = (v: any) => [v.x, v.y, v.z].map((x: number) => Math.round(x * 100) / 100); o[a1] = { clip: r3(wp(sb).subtract(wp(sa)).normalize()), alice: r3(wp(tb).subtract(wp(ta)).normalize()) }; } return o; };
	const dirErr = () => { const out: any = {}; for (const [a1, b1] of pairs) { const sa = srcLeaf.find((n: any) => n.name === a1), sb = srcLeaf.find((n: any) => n.name === b1); const ta = tgtLeaf.find((n: any) => n.name === (CLIP_TO_ALICE_BONE as any)[a1]), tb = tgtLeaf.find((n: any) => n.name === (CLIP_TO_ALICE_BONE as any)[b1]); if (!sa || !sb || !ta || !tb) { out[a1] = 'missing'; continue; } const ds = wp(sb).subtract(wp(sa)).normalize(); const dt = wp(tb).subtract(wp(ta)).normalize(); out[a1 + '>' + b1] = Math.round(Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(ds, dt)))) * 180 / Math.PI); } return out; };
	const marks: any[] = []; const shots: string[] = [];
	marks.push({ ...dAt('rest-input'), dirErr: dirErr(), vecs: vecs() }); shots.push(canvas.toDataURL('image/png'));
	scene.animationGroups.slice(before).forEach((g) => g.start(true));
	for (const frame of [60, 600, 1500, 2500]) { groups.forEach((g) => g.goToFrame(frame)); for (let i = 0; i < 4; i++) { scene.render(); await new Promise((r) => setTimeout(r, 30)); } marks.push({ ...dAt('f' + frame), dirErr: dirErr(), vecs: vecs() }); shots.push(canvas.toDataURL('image/png')); }
	res.marks = marks; res.shots = shots;
	return res;
};
