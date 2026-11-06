import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sceneEventOutbox, sceneEvents, sceneMarkers } from './schema/scene-markers.js';

describe('scene marker schema contract', () => {
	const marker = getTableConfig(sceneMarkers);

	it('declares the source and anchor columns from the additive sidecar', () => {
		expect(marker.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
			'source_revision', 'source_sha256', 'anchor_kind', 'anchor_u', 'anchor_v',
			'mesh_id', 'triangle_index', 'barycentric', 'anchor_status', 'deleted_at'
		]));
	});

	it('keeps anchor kinds and lifecycle values constrained to the SQL contract', () => {
		const checks = marker.checks.map((entry) => entry.name);
		expect(checks).toEqual(expect.arrayContaining([
			'scene_markers_anchor_kind_check', 'scene_markers_image_uv_check',
			'scene_markers_mesh_anchor_check', 'scene_markers_anchor_status_check'
		]));
	});

	it('points event and outbox declarations at the existing table names and idempotency keys', () => {
		const events = getTableConfig(sceneEvents);
		const outbox = getTableConfig(sceneEventOutbox);
		expect(events.name).toBe('scene_events');
		expect(events.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
			'command_id', 'aggregate_revision'
		]));
		expect(outbox.name).toBe('scene_event_outbox');
	});
});
