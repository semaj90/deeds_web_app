import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
	validateSceneCatalog,
	validateTupleGraph,
	createSceneConceptLut,
	chooseIllustrativeGeometry,
	mixAdditiveLights,
	orderSceneDag,
	type SceneCatalog,
	type TupleGraph
} from './scene-ontology-linked-tuples-v1.js';
import { createLinkedTuplesFromPromptScene } from './scene-plan-ontology-bridge-v1.js';
import { createImageDetectionProposalsV1 } from './image-detection-tuple-bridge-v1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const catalog: SceneCatalog = JSON.parse(readFileSync(join(__dirname, 'scene-ontology-catalog-v1.json'), 'utf8'));
const indoor: TupleGraph = JSON.parse(readFileSync(join(__dirname, 'examples/dinner-house-tuples.json'), 'utf8'));
const beach: TupleGraph = JSON.parse(readFileSync(join(__dirname, 'examples/beach-image-tuples.json'), 'utf8'));
const urban: TupleGraph = JSON.parse(readFileSync(join(__dirname, 'examples/urban-blockout-tuples.json'), 'utf8'));

const a64 = 'a'.repeat(64);
const b64 = 'b'.repeat(64);
const binding = {
	sourceKind: 'EVIDENCE' as const,
	sourceId: 'evidence:photo-1',
	evidenceId: '11111111-2222-4333-8444-555555555555',
	sourceRevision: `sha256:${a64}`,
	contentSha256: b64
};

describe('Parent Atlas Scene Ontology (v1)', () => {
	it('catalog defines >400 concepts across separate scene roots', () => {
		expect(validateSceneCatalog(catalog)).toEqual([]);
		expect(catalog.concepts.length).toBeGreaterThanOrEqual(400);
		expect(catalog.concepts.filter((x) => x.tier === 0).length).toBeGreaterThanOrEqual(10);
		expect(catalog.relations.length).toBeGreaterThanOrEqual(20);
	});

	it('validates indoor, beach, and urban linked tuple graphs', () => {
		for (const [name, g] of [['indoor', indoor], ['beach', beach], ['urban', urban]] as const) {
			const v = validateTupleGraph(g, catalog);
			expect(v.valid, `${name} errors: ${v.errors.join(', ')}`).toBe(true);
		}
	});

	it('case and scene scope rejects cross-scope join', () => {
		const g = structuredClone(indoor);
		const actor = g.nodes.find((n) => n.id === 'entity:actor2');
		expect(actor).toBeDefined();
		if (actor) actor.caseId = 'different-case';
		const v = validateTupleGraph(g, catalog);
		expect(v.errors.some((e) => e.includes('CROSS_SCOPE'))).toBe(true);
	});

	it('requires exactly one independent source per cue', () => {
		const g = structuredClone(indoor);
		g.tuples = g.tuples.filter((t) => t.predicate !== 'CUE_SOURCE');
		expect(validateTupleGraph(g, catalog).errors.some((e) => e.includes('CUE_EXACTLY_ONE_SOURCE'))).toBe(true);
	});

	it('rejects a forged evidence revision and does not automatically authorize source IDs', () => {
		const g = structuredClone(beach);
		const src = g.nodes.find((n) => n.kind === 'source');
		expect(src?.source).toBeDefined();
		if (src?.source) src.source.sourceRevision = 'invalid';
		expect(validateTupleGraph(g, catalog).errors.some((e) => e.includes('SOURCE_REVISION_INVALID'))).toBe(true);

		const valid = validateTupleGraph(beach, catalog, {
			caseId: 'synthetic-demo',
			sceneId: 'scene:beach-image',
			authorizedEvidenceIds: new Set()
		});
		expect(valid.errors.some((e) => e.includes('EVIDENCE_NOT_AUTHORIZED'))).toBe(true);
	});

	it('pixel regions use bounded ORIGINAL pixel coordinates', () => {
		const g = structuredClone(beach);
		const region = g.nodes.find((n) => n.kind === 'region');
		expect(region?.region).toBeDefined();
		if (region?.region) region.region.box = [100, 100, 3000, 200];
		expect(validateTupleGraph(g, catalog).errors.some((e) => e.includes('PIXEL_REGION_INVALID'))).toBe(true);
	});

	it('LUT is deterministic uint16 with unresolved ordinal 0, independent of code domains', () => {
		const a = createSceneConceptLut(catalog);
		const b = createSceneConceptLut(catalog);
		const id = 'pa:space.room.bedroom';
		expect(a.ordinal(id)).toBe(b.ordinal(id));
		expect(a.concept(a.ordinal(id))).toBe(id);
		expect(a.ordinal('pa:unknown.domain')).toBe(0);
		expect(a.concept(0)).toBeNull();
		expect(a.entries).toBeGreaterThan(255);
		expect(a.pack([id, 'bad'])).toBeInstanceOf(Uint16Array);
	});

	it('source-pinned YOLO-style detection resolves illustrative recipe but no metric world position', () => {
		const d = { label: 'person', score: 0.84, source: binding, pixel: { width: 1920, height: 1080, box: [10, 20, 100, 400] as [number, number, number, number] } };
		const r = chooseIllustrativeGeometry(d, catalog);
		expect(r.status).toBe('ILLUSTRATIVE_ONLY');
		if (r.status === 'ILLUSTRATIVE_ONLY') {
			expect(r.worldPosition).toBeNull();
			expect(r.depthMeters).toBeNull();
		}
	});

	it('unmatched or low confidence detection yields explicit unresolved', () => {
		const base = { label: 'meteor', score: 0.99, source: binding, pixel: { width: 100, height: 100, box: [0, 0, 50, 50] as [number, number, number, number] } };
		expect(chooseIllustrativeGeometry(base, catalog).status).toBe('UNRESOLVED');
		expect(chooseIllustrativeGeometry({ ...base, label: 'person', score: 0.1 }, catalog).status).toBe('UNRESOLVED');
	});

	it('additive LIGHT mixing: red+blue is magenta; blue+green cyan; red+green yellow', () => {
		expect(mixAdditiveLights([1, 0, 0], [0, 0, 1])).toEqual([1, 0, 1]);
		expect(mixAdditiveLights([0, 0, 1], [0, 1, 0])).toEqual([0, 1, 1]);
		expect(mixAdditiveLights([1, 0, 0], [0, 1, 0])).toEqual([1, 1, 0]);
	});

	it('DAG is topologically ordered and rejects cycles', () => {
		const dag: { id: string; stage: 'SOURCE' | 'DETECT' | 'CONCEPT' | 'LAYOUT' | 'RECIPE' | 'RENDER' | 'REVIEW' | 'SAVE'; after: string[] }[] =
			JSON.parse(readFileSync(join(__dirname, 'examples/prefill-dag.json'), 'utf8')).tasks;
		const o = orderSceneDag([...dag].reverse());
		expect(o.map((x) => x.id)).toEqual(dag.map((x) => x.id));
		expect(() =>
			orderSceneDag([
				{ id: 'a', stage: 'SOURCE', after: ['b'] },
				{ id: 'b', stage: 'REVIEW', after: ['a'] }
			])
		).toThrow(/DAG_CYCLE/);
	});

	it('maps rooms, props, static actors to SHARED geometry recipes', () => {
		const plan = {
			schema: 'parent-atlas.prompt-scene-plan.v1' as const,
			preset: 'studio' as const,
			provenance: 'GENERATED_ILLUSTRATIVE_UNCALIBRATED' as const,
			floors: [{ index: 0, rooms: [{ id: 'k', kind: 'kitchen', x: 0, z: 0, width: 8, depth: 7 }] }],
			props: [
				{ id: 'p1', kind: 'chair', roomId: 'k', floor: 0 },
				{ id: 'p2', kind: 'chair', roomId: 'k', floor: 0 }
			],
			actors: [{ id: 'a1', floor: 0, x: 1, z: 1, presentation: 'NEUTRAL_GENERATED_STATIC' as const }],
			cues: [{ id: 'c1', actorIds: ['a1'], status: 'UNREVIEWED_STORY_PROPOSAL' as const, actions: [] as [] }]
		};
		const g = createLinkedTuplesFromPromptScene(plan, {
			caseId: 'synthetic-demo',
			sceneId: 'scene:test',
			promptSource: { sourceKind: 'PROMPT', sourceId: 'prompt.test' }
		});
		const v = validateTupleGraph(g, catalog);
		expect(v.valid).toBe(true);
		expect(g.tuples.filter((t) => t.predicate === 'HAS_GEOMETRY').length).toBe(2);
		expect(g.nodes.filter((n) => n.id === 'recipe:box').length).toBe(1);
		expect(g.tuples.filter((t) => t.predicate === 'CUE_SOURCE').length).toBe(1);
		expect(g.nodes.find((n) => n.kind === 'cue')?.origin).toBe('PROMPT_PROPOSAL');
	});

	it('prevents prompt planner from minting evidence-backed source bindings', () => {
		expect(() =>
			createLinkedTuplesFromPromptScene(
				{
					schema: 'parent-atlas.prompt-scene-plan.v1',
					preset: 'studio',
					provenance: 'GENERATED_ILLUSTRATIVE_UNCALIBRATED',
					floors: [{ index: 0, rooms: [] }],
					props: [],
					actors: [],
					cues: []
				},
				{ caseId: 'synthetic-demo', sceneId: 'scene:test', promptSource: binding }
			)
		).toThrow(/PROMPT_SCENE_SOURCE/);
	});

	it('image detection ingress yields 2D source-bound, not metric placement', () => {
		const source = {
			...binding,
			modelId: 'pinned-detector-v1',
			modelArtifactSha256: 'a'.repeat(64),
			runId: 'run:fixture1'
		};
		const p = createImageDetectionProposalsV1(
			{
				caseId: 'synthetic-demo',
				sceneId: 'scene:image',
				source,
				width: 640,
				height: 480,
				detections: [
					{ label: 'chair', score: 0.84, box: [20, 40, 100, 200] },
					{ label: 'unrecognized-sky-castle', score: 0.99, box: [2, 2, 50, 50] }
				]
			},
			catalog
		);
		expect(p.unresolved).toBe(1);
		expect(p.labelIndex.get('chair')).toEqual(['entity:proxy-evidence:photo-1:aaaaaaaaaaaa:run:fixture1:0']);
		expect(p.graph.nodes.some((n) => n.kind === 'cue')).toBe(false);
		expect(p.graph.nodes.some((n) => n.id === 'entity:proxy-0' && (n as any).region !== undefined)).toBe(false);

		const v = validateTupleGraph(p.graph, catalog, {
			caseId: 'synthetic-demo',
			sceneId: 'scene:image',
			authorizedEvidenceIds: new Set([source.evidenceId])
		});
		expect(v.valid).toBe(true);
	});

	it('image input rejects detector receipt without pinned model SHA', () => {
		expect(() =>
			createImageDetectionProposalsV1(
				{
					caseId: 'synthetic-demo',
					sceneId: 'scene:image',
					source: binding,
					width: 100,
					height: 100,
					detections: []
				},
				catalog
			)
		).toThrow(/IMAGE_SOURCE_AND_MODEL_RECEIPTS_REQUIRED/);
	});

	it('timed cue keeps scene clock and exact source clock distinct', () => {
		const g = structuredClone(indoor);
		const cue = g.nodes.find((n) => n.kind === 'cue');
		expect(cue).toBeDefined();
		if (cue) cue.sceneIntervalMs = [9000, 12000];

		const link = g.tuples.find((t) => t.predicate === 'CUE_SOURCE');
		expect(link).toBeDefined();
		if (link) link.sourceIntervalMs = [2000, 5000];
		expect(validateTupleGraph(g, catalog).valid).toBe(true);

		if (link) link.sourceIntervalMs = [9000, 2000];
		expect(validateTupleGraph(g, catalog).errors.some((e) => e.includes('SOURCE_INTERVAL_INVALID'))).toBe(true);
	});
});
