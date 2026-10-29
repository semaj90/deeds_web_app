import * as B from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { Budget } from './budget';

export type Backend = 'webgl' | 'webgpu';
export interface GameOptions { backend?: Backend; onStatus?: (message: string) => void; }
export interface GameHandle { dispose(): void; talk(): string; evidence(): number; backend: Backend; }

/** Standalone proof scene; does not alter the production courtroom owner. */
export async function mountCourtroom(canvas: HTMLCanvasElement, options: GameOptions = {}): Promise<GameHandle> {
  const report = options.onStatus ?? (() => {});
  const budget = new Budget();
  const releaseSimulation = budget.reserve('simulation', 128 * 1024);
  const releaseGeometry = budget.reserve('geometry', 384 * 1024); // tracked design reservation; not Babylon heap accounting
  let engine: B.Engine | B.WebGPUEngine;
  let backend: Backend = 'webgl';
  if (options.backend === 'webgpu' && await B.WebGPUEngine.IsSupportedAsync) {
    const candidate = new B.WebGPUEngine(canvas, { antialias: false });
    try { await candidate.initAsync(); engine = candidate; backend = 'webgpu'; }
    catch (e) { candidate.dispose(); report('WebGPU initialization failed; using WebGL'); engine = new B.Engine(canvas, false); }
  } else { engine = new B.Engine(canvas, false); }

  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(0.12, 0.14, 0.19, 1);
  const camera = new B.ArcRotateCamera('camera', -Math.PI / 2, 1.20, 13, new B.Vector3(0, 1.7, 0), scene);
  camera.lowerRadiusLimit = 6; camera.upperRadiusLimit = 16; // keeps the camera below the ceiling (y = 8)
  camera.attachControl(canvas, true);
  const light = new B.HemisphericLight('ambient', new B.Vector3(0, 1, 0), scene);
  light.intensity = 0.55; // hemi + sun summed past 1.0 and blew the floor and Alice out to white
  const sun = new B.DirectionalLight('sun', new B.Vector3(-0.4, -1, -0.3), scene);
  sun.intensity = 0.4;
  const mat = (name: string, color: string) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.FromHexString(color);
    m.specularColor = B.Color3.Black();
    return m;
  };
  const wood = mat('dark mahogany', '#6f3b21');
  const trim = mat('gold trim', '#c59a4d');
  const marble = mat('marble', '#c4c2b8');
  const plaster = mat('plaster', '#ded4c2');
  const blue = mat('vault blue', '#445f70');
  const aliceMat = mat('alice', '#496ea0');
  const jesterMat = mat('jester', '#a95072');
  function cube(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: B.Material) {
    const mesh = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z); mesh.material = material; return mesh;
  }
  cube('floor', 0, -0.15, 0, 16, 0.3, 24, marble);
  cube('left wall', -8, 4, 0, .3, 8, 24, plaster);
  cube('right wall', 8, 4, 0, .3, 8, 24, plaster);
  cube('back wall', 0, 4, 11.9, 16, 8, .4, plaster);
  // No front wall: the camera sits on that side, so a solid wall would fill the frame (cut-away view).
  cube('ceiling', 0, 8, 0, 16, .25, 24, blue);
  // Bench is at the far end, with witness stand and two counsel tables.
  cube('judge bench', 0, 1.25, 8.6, 7, 2.5, 1.7, wood);
  cube('bench trim', 0, 2.55, 8.6, 7.3, .22, 1.95, trim);
  cube('judge podium', 0, 2.9, 9.5, 2.1, .8, 1.1, wood);
  for (const x of [-4.5, 4.5]) {
    cube('counsel table', x, .8, 1.0, 2.6, .16, 4.4, wood);
    for (const z of [-.9, 2.9]) cube('table leg', x, .4, z, 2.35, .8, .2, wood);
    cube('side gallery', x * 1.35, 1, -4.5, 1.0, 2, 9, wood);
  }
  for (const z of [-9, -7, -5]) {
    cube('spectator pew left', -3.3, .65, z, 4.4, 1.3, .65, wood);
    cube('spectator pew right', 3.3, .65, z, 4.4, 1.3, .65, wood);
  }
  for (const x of [-6.7, 6.7]) for (const z of [7, -2, -10]) {
    const col = B.MeshBuilder.CreateCylinder('column', { diameter: .72, height: 6.6, tessellation: 10 }, scene);
    col.position.set(x, 3.3, z); col.material = plaster;
    cube('capital', x, 6.65, z, 1.1, .32, 1.1, trim);
  }
  const player = B.MeshBuilder.CreateCapsule('Alice placeholder', { radius: .38, height: 1.8, tessellation: 8 }, scene);
  player.material = aliceMat; player.position.set(0, .9, -2.1);
  const jester = B.MeshBuilder.CreateCapsule('Jester placeholder', { radius: .33, height: 1.7, tessellation: 8 }, scene);
  jester.material = jesterMat; jester.position.set(1.5, .85, 5.2);
  let mixer: B.AnimationGroup[] = [];
  try {
    // Optional skinned GLB: no model means visible procedural placeholders.
    const result = await B.SceneLoader.ImportMeshAsync('', '/models/courtroom/', 'character_alice_skinned.glb', scene);
    const root = new B.TransformNode('alice asset root', scene);
    for (const mesh of result.meshes) if (!mesh.parent) mesh.parent = root;
    root.position.copyFrom(player.position);
    root.scaling.setAll(1); // adjust in existing character asset integration if necessary
    player.setEnabled(false);
    mixer = result.animationGroups;
    scene.stopAllAnimations(); // the glTF loader auto-starts every clip on import; run only the idle clip
    mixer.find(a => /idle/i.test(a.name))?.start(true);
    report('Alice GLB loaded; animation and scale require visual verification');
  } catch { report('Alice GLB unavailable; using a procedural placeholder'); }

  const keys = new Set<string>();
  function keydown(e: KeyboardEvent) { if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) { keys.add(e.key.toLowerCase()); e.preventDefault(); } }
  function keyup(e: KeyboardEvent) { keys.delete(e.key.toLowerCase()); }
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);
  let last = performance.now(), acc = 0;
  const FIXED_DT = 1/30; // N64-style fixed 30 Hz simulation, independent of display refresh
  let clueCount = 0;
  function tick(dt: number) {
    const dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const dz = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const length = Math.hypot(dx, dz) || 1;
    const x = B.Scalar.Clamp(player.position.x + dx / length * dt * 3.2, -5.8, 5.8);
    const z = B.Scalar.Clamp(player.position.z + dz / length * dt * 3.2, -10.5, 7);
    player.position.set(x, .9, z);
    const imported = scene.getTransformNodeByName('alice asset root');
    imported?.position.copyFrom(player.position);
    camera.target = B.Vector3.Lerp(camera.target, player.position.add(new B.Vector3(0, 1, 0)), .08);
  }
  engine.runRenderLoop(() => {
    const now = performance.now();
    acc += Math.min((now-last)/1000, .1); last=now;
    let steps=0;
    while (acc >= FIXED_DT && steps++ < 3) { tick(FIXED_DT); acc -= FIXED_DT; }
    scene.render();
  });
  report(`Courtroom initialized (${backend}); press WASD to move and E to interact`);
  let disposed = false;
  return {
    backend,
    talk() { return B.Vector3.Distance(player.position, jester.position) < 4 ? 'Jester: The missing docket is near the judge’s bench.' : 'Move closer to the jester to talk.'; },
    evidence() { if (B.Vector3.Distance(player.position, new B.Vector3(0, .9, 7)) < 4) clueCount = 1; return clueCount; },
    dispose() { if (disposed) return; disposed = true; engine.stopRenderLoop(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('resize', resize); for (const a of mixer) a.stop(); scene.dispose(); engine.dispose(); releaseSimulation(); releaseGeometry(); }
  };
}
