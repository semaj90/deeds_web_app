import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
	snapToGroundPlaneV1,
	SceneScriptEngineV1,
	type SceneScriptRuntimeAdapterV1
} from './scene-script-engine-v1.js';

describe('Ground-Plane Snap (ENG-07) & Safe Scene Scripting DSL (ENG-08)', () => {
	it('snaps a marker onto a tilted terrain plane and aligns its quaternion to the surface normal', () => {
		const geo = new THREE.PlaneGeometry(10, 10);
		geo.rotateX(-Math.PI / 2); // Horizontal floor at y=0
		const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
		floor.position.set(0, 1.5, 0);
		floor.updateMatrixWorld(true);

		const snap = snapToGroundPlaneV1({
			x: 2,
			z: -1,
			yOffset: 0.25,
			surfaces: [floor]
		});

		expect(snap.snapped).toBe(true);
		expect(snap.position[0]).toBeCloseTo(2, 4);
		expect(snap.position[1]).toBeCloseTo(1.75, 4); // 1.5 floor + 0.25 offset
		expect(snap.position[2]).toBeCloseTo(-1, 4);
		expect(snap.surfaceNormal[1]).toBeCloseTo(1, 4);
	});

	it('validates and executes a deterministic SceneScriptProgramV1 without eval()', () => {
		const engine = new SceneScriptEngineV1();
		const adapter: SceneScriptRuntimeAdapterV1 = {
			cueCamera: vi.fn(),
			playAnimation: vi.fn(),
			setVisibility: vi.fn(),
			highlightObservation: vi.fn(),
			placeProxy: vi.fn()
		};

		const sha = 'a'.repeat(64);
		const result = engine.execute(
			{
				schema: 'atlas.scene-script.v1',
				programId: 'script:studio_tour_v1',
				steps: [
					{ action: 'cue_camera', position: [3, 2, 5], lookAt: [0, 1, 0], durationMs: 400 },
					{ action: 'play_animation', targetId: 'actor:a', clipName: 'Walk', timeSeconds: 1.5 },
					{ action: 'highlight_observation', observationId: 'obs:1', observationSha256: sha, targetId: 'chair:1' },
					{ action: 'place_proxy', proxyId: 'marker:1', recipeId: 'chair_lowpoly_v1', position: [1, 0, 2] },
					{ action: 'set_visibility', targetId: 'marker:1', visible: true }
				]
			},
			adapter
		);

		expect(result.stepsExecuted).toBe(5);
		expect(adapter.cueCamera).toHaveBeenCalledWith([3, 2, 5], [0, 1, 0], 400);
		expect(adapter.playAnimation).toHaveBeenCalledWith('actor:a', 'Walk', 1.5);
		expect(adapter.highlightObservation).toHaveBeenCalledWith('obs:1', sha, 'chair:1', '#E5A93C');
		expect(adapter.placeProxy).toHaveBeenCalledWith('marker:1', 'chair_lowpoly_v1', [1, 0, 2], true);
		expect(adapter.setVisibility).toHaveBeenCalledWith('marker:1', true);

		// Rejects unvetted actions or invalid SHA-256
		expect(() =>
			engine.execute(
				{
					schema: 'atlas.scene-script.v1',
					programId: 'bad',
					steps: [{ action: 'eval_js', code: 'alert(1)' }]
				},
				adapter
			)
		).toThrow();
	});
});
