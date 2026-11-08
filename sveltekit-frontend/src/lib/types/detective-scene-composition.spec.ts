import { describe, expect, it } from 'vitest';
import {
	detectiveSceneCompositionSchema,
	validateSceneComposition
} from './detective-scene-composition.js';

describe('detective-scene-composition schema contract (atlas.detective-scene-composition.v1)', () => {
	it('validates a reference-based demonstrative scene composition', () => {
		const raw = {
			schema: 'atlas.detective-scene-composition.v1',
			classification: 'DEMONSTRATIVE',
			location: {
				latitude: 37.7749,
				longitude: -122.4194,
				source: 'USER_OPTIONAL',
				verified: false,
				attribution: 'Google Earth (Attributed Context View Only)'
			},
			objects: [
				{
					objectId: 'scene-chair-01',
					catalogKey: 'furniture.chair.standard',
					assetRevision: 'fixture-v1',
					position: [1.2, 0, -2.4],
					rotation: [0, 0, 0, 1],
					scale: [1, 1, 1],
					locked: false
				},
				{
					objectId: 'scene-stairs-01',
					catalogKey: 'architecture.stairs.industrial',
					assetRevision: 'fixture-v1',
					position: [0, 0, 0],
					rotation: [0, 0, 0, 1],
					scale: [1, 1, 1],
					locked: true
				}
			],
			calibration: 'UNVERIFIED',
			admission: 'LOCAL_PREFLIGHT'
		};

		const parsed = validateSceneComposition(raw);
		expect(parsed.schema).toBe('atlas.detective-scene-composition.v1');
		expect(parsed.objects).toHaveLength(2);
		expect(parsed.objects[0].catalogKey).toBe('furniture.chair.standard');
		expect(parsed.location.latitude).toBe(37.7749);
	});

	it('rejects invalid coordinates or missing schema identifier', () => {
		expect(() => {
			validateSceneComposition({
				schema: 'invalid.schema',
				location: { latitude: 95, longitude: 0, source: 'USER_OPTIONAL', verified: false },
				objects: []
			});
		}).toThrow();
	});
});
