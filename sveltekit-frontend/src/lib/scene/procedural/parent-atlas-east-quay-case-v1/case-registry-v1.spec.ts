import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ScenePrimitiveManager } from '$lib/n64-fsm/scene-primitive-sync.js';
import { parseEastQuayCaseFixtureV1, assertEastQuayFixtureReadOnlyV1 } from './case-fixture-v1.js';
import { planIllustrativeEvent, validateAnimationSaveBinding } from './scene-bridge-v1.js';
import { planEastQuaySceneEventV1, registerEastQuayIllustrativeObjectsV1, buildEastQuaySceneIndexV1 } from './scene-adapter-v1.js';
import * as THREE from 'three';

const fixture = parseEastQuayCaseFixtureV1(JSON.parse(readFileSync(resolve(process.cwd(), 'static/demos/east-quay-bank-case-v1/data/case.json'), 'utf8')));

describe('East Quay typed fixture integration', () => {
	it('validates all eight scenes and linked people/events without creating evidence rows', () => {
		expect(fixture.scenes).toHaveLength(8);
		expect(buildEastQuaySceneIndexV1(fixture)).toHaveLength(8);
		expect(fixture.evidence.every((item) => item.requiresAuthorization)).toBe(true);
	});

	it('creates deterministic DEMO_ONLY actor IDs and rejects scope drift', () => {
		const a = planIllustrativeEvent(fixture, 'SC-01', 'EV-001');
		const b = planEastQuaySceneEventV1(fixture, 'SC-01', 'EV-001');
		expect(a.actors.map((actor) => actor.id)).toEqual(b.actors.map((actor) => actor.id));
		expect(a.actors[0]?.id).toContain('PA-DEMO-ROBBERY-001:SC-01:EV-001:actor:');
		expect(() => assertEastQuayFixtureReadOnlyV1({ fixture, caseId: 'another-case', sceneId: 'SC-01', operation: 'READ' })).toThrow('DEMO_FIXTURE_SCOPE_MISMATCH');
		expect(() => assertEastQuayFixtureReadOnlyV1({ fixture, caseId: fixture.caseId, sceneId: 'SC-01', operation: 'WRITE' })).toThrow('DEMO_FIXTURE_WRITE_FORBIDDEN');
	});

	it('registers actor and event objects through ScenePrimitiveManager', () => {
		const plan = planEastQuaySceneEventV1(fixture, 'SC-01', 'EV-001');
		const manager = new ScenePrimitiveManager(new Float32Array(4096));
		const root = new THREE.Group();
		const marker = new THREE.Mesh(new THREE.ConeGeometry(), new THREE.MeshBasicMaterial());
		const ids = registerEastQuayIllustrativeObjectsV1({ fixture, plan, manager, actorRoot: root, marker });
		expect(ids).toHaveLength(2);
		expect(manager.getAll().map((item) => item.id)).toEqual(ids);
	});

	it('requires source, event, revision and interval binding for animation proposals', () => {
		const event = fixture.events.find((item) => item.eventId === 'EV-001')!;
		const evidenceId = event.evidenceIds[0]!;
		const evidence = fixture.evidence.find((item) => item.evidenceId === evidenceId)!;
		const sceneId = event.sceneIds[0]!;
		const scene = fixture.scenes.find((item) => item.sceneId === sceneId)!;
		const binding = validateAnimationSaveBinding(fixture, { caseId: fixture.caseId, sceneId, sceneRevision: scene.sceneRevision, eventId: event.eventId, evidenceId, evidenceSha256: evidence.sha256, start: event.start, end: event.end });
		expect(binding.fixtureScope).toBe('DEMO_ONLY');
		expect(() => validateAnimationSaveBinding(fixture, { caseId: fixture.caseId, sceneId, sceneRevision: 'stale-revision', eventId: event.eventId, evidenceId, evidenceSha256: evidence.sha256, start: event.start, end: event.end })).toThrow('EAST_QUAY_EVENT_EVIDENCE_REVISION_MISMATCH');
	});
});
