import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, 'state-v-unidentified-participants-e2e-01b.json');
const assetPath = resolve(here, '../../../../../static/demos/morrow-bay-case-scene-e2e-01b/assets/neutral-contour-placeholder.glb');
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const sourceClockSchema = z.object({ clock_id: z.string().min(1), source_type: z.string().min(1), status: z.string().min(1) }).passthrough();
const evidenceSchema = z.object({
	evidence_id: z.string().min(1), type: z.string().min(1), clock_id: z.string().nullable(),
	materialized: z.literal(false), sha256: z.null(), storage_key: z.null(), fixture_note: z.string()
}).passthrough();
const actorSchema = z.object({
	actor_id: z.string().min(1), registry_key: z.string().min(1),
	transform: z.object({ position: vector3, quaternion: z.tuple([z.number(), z.number(), z.number(), z.number()]), scale: vector3 }).passthrough(),
	mesh_asset_ref: z.string().min(1), portrait_artifact: z.null(), is_illustrative: z.literal(true), identity_established: z.literal(false)
}).passthrough();
const eventSchema = z.object({
	event_id: z.string().min(1), source_timestamp: z.string().min(1), clock_id: z.string().min(1),
	proposal: z.string().min(1), evidence_refs: z.array(z.string()), status: z.literal('provisional'),
	aligned_time: z.null(), review_revision: z.null()
}).passthrough();
const sceneSchema = z.object({
	scene_id: z.string().min(1), title: z.string().min(1),
	coordinate_frame: z.object({ grid_id: z.string(), origin: z.tuple([z.literal(0), z.literal(0), z.literal(0)]),
		up_axis: z.string(), forward_axis: z.string(), unit: z.string(), is_real_world_gps: z.literal(false), calibration_status: z.string() }).passthrough(),
	timeline_proposals: z.array(eventSchema), actors: z.array(actorSchema), render_mode: z.literal('illustrative_blockout'),
	scene_revision: z.literal(0), persistence_status: z.literal('fixture_read_only')
}).passthrough();

export const caseSceneE2E01BFixtureSchema = z.object({
	schema: z.literal('parent-atlas.case-scene-demo/v1'), schema_version: z.literal(1),
	case: z.object({ case_id: z.literal('CASE-MB-2026-001'), title: z.literal('State v. Unidentified Participants'),
		jurisdiction: z.string(), provenance: z.literal('SYNTHETIC_FIXTURE'), admission: z.literal('DEMO_ONLY'),
		epistemic_status: z.literal('investigative_hypothesis'), real_case: z.literal(false) }).passthrough(),
	person_registry: z.array(z.object({ registry_key: z.string().min(1), provisional_label: z.string(), status: z.string(),
		default_representation: z.string(), identity_established: z.literal(false) }).passthrough()),
	reviewed_links: z.array(z.object({ link_id: z.string(), subject_a: z.string(), subject_b: z.string(),
		review_status: z.literal('unreviewed_open_question'), supporting_evidence: z.array(z.string()) }).passthrough()),
	evidence_items: z.array(evidenceSchema),
	transcripts: z.array(z.object({ transcript_id: z.string(), derived_from: z.string(), source_clock_id: z.string(),
		is_synthetic: z.literal(true), spans: z.array(z.object({ span_id: z.string(), speaker_label: z.string(),
			start_ms: z.number().int().nonnegative(), end_ms: z.number().int().positive(), time_basis: z.literal('media_relative_ms'), text: z.string(),
			epistemic_tag: z.string() }).passthrough()) }).passthrough()),
	clock_registry: z.array(sourceClockSchema),
	clock_offsets: z.array(z.object({ clock_id: z.string(), reference_clock_id: z.string(), estimated_offset_seconds: z.number(),
		uncertainty_seconds: z.number().nonnegative(), review_status: z.literal('provisional_unverified'), approved_for_use: z.literal(false) }).passthrough()),
	assets: z.array(z.object({ asset_uuid: z.string().uuid(), asset_id_scope: z.literal('DEMO_FIXTURE_LOCAL_NOT_DATABASE_ID'),
		kind: z.string(), source_type: z.string(), path: z.literal('assets/neutral-contour-placeholder.glb'), sha256,
		byte_length: z.number().int().positive(), is_illustrative: z.literal(true), is_evidence: z.literal(false), registry_state: z.literal('fixture_only') }).passthrough()).min(1).max(1),
	scenes: z.array(sceneSchema),
	prosecutor_review_questions: z.array(z.object({ id: z.string(), question: z.string(), status: z.literal('unresolved'), refs: z.array(z.string()) }).passthrough()),
	persistence: z.object({ scene_persistence_enabled_required_for_write: z.literal(true), current_mode: z.literal('fixture_read_only'),
		requires_authorized_case_scope: z.literal(true), writes_performed: z.literal(false) }).passthrough(),
	disclaimer: z.string()
}).passthrough();

export type CaseSceneE2E01BFixture = z.infer<typeof caseSceneE2E01BFixtureSchema>;

export async function readCaseSceneE2E01BFixtureV1() {
	const raw = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
	const fixture = caseSceneE2E01BFixtureSchema.parse(raw);
	const problems: string[] = [];
	const clocks = new Set(fixture.clock_registry.map((clock) => clock.clock_id));
	const people = new Set(fixture.person_registry.map((person) => person.registry_key));
	const evidence = new Map(fixture.evidence_items.map((item) => [item.evidence_id, item]));
	const assets = new Map(fixture.assets.map((asset) => [asset.asset_uuid, asset]));
	if (fixture.scenes.length !== 5 || fixture.person_registry.length !== 6 || fixture.evidence_items.length !== 8) problems.push('Fixture cardinality mismatch');
	if (clocks.size !== fixture.clock_registry.length || !clocks.has('CLK-BANK-CAM') || !clocks.has('CLK-BANK-SYS')) problems.push('Bank camera and system clocks must be distinct registered sources');
	if (fixture.scenes.reduce((sum, scene) => sum + scene.timeline_proposals.length, 0) !== 7) problems.push('Expected seven provisional source events');
	if (fixture.assets.length !== 1) problems.push('Expected exactly one fixture-local GLB');
	for (const scene of fixture.scenes) {
		for (const actor of scene.actors) {
			if (!people.has(actor.registry_key) || !assets.has(actor.mesh_asset_ref)) problems.push(`Unknown actor registry or mesh reference in ${scene.scene_id}`);
		}
		for (const event of scene.timeline_proposals) {
			if (!clocks.has(event.clock_id)) problems.push(`Unknown source clock on ${event.event_id}`);
			for (const evidenceId of event.evidence_refs) {
				const source = evidence.get(evidenceId);
				if (!source || (source.clock_id !== null && source.clock_id !== event.clock_id)) problems.push(`Evidence/clock mismatch on ${event.event_id}`);
			}
		}
	}
	for (const link of fixture.reviewed_links) {
		if (link.review_status !== 'unreviewed_open_question' || !people.has(link.subject_a) || !people.has(link.subject_b)) problems.push(`Invalid unresolved link ${link.link_id}`);
	}
	if (fixture.clock_offsets.some((offset) => offset.approved_for_use || offset.review_status !== 'provisional_unverified')) problems.push('A provisional offset was applied');
	for (const reference of fixture.prosecutor_review_questions.flatMap((question) => question.refs)) {
		if (!evidence.has(reference)) problems.push(`Unknown evidence reference ${reference}`);
	}
	if (problems.length) throw new Error(`CASE_SCENE_E2E_01B_INVALID: ${problems.join('; ')}`);

	const asset = fixture.assets[0];
	if (!asset) throw new Error('CASE_SCENE_E2E_01B_ASSET_MISSING');
	const bytes = await readFile(assetPath);
	const actualHash = createHash('sha256').update(bytes).digest('hex');
	if (bytes.byteLength !== asset.byte_length || actualHash !== asset.sha256 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(8) !== bytes.byteLength) {
		throw new Error('CASE_SCENE_E2E_01B_ASSET_READBACK_MISMATCH');
	}
	return {
		fixture,
		asset: {
			assetUuid: asset.asset_uuid,
			assetIdScope: asset.asset_id_scope,
			sha256: actualHash,
			byteLength: bytes.byteLength,
			url: `/demos/morrow-bay-case-scene-e2e-01b/${asset.path}`
		}
	} as const;
}
