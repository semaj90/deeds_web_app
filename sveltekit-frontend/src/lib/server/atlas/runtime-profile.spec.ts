// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
	getParentAtlasRuntimeProfileManifest,
	resolveParentAtlasRuntimeProfile,
	type ParentAtlasRuntimeProfile,
} from '../runtime-profile.js';

describe('parent atlas runtime profile', () => {
	it('resolves engram-only from the legacy ENGRAM_ONLY flag', () => {
		const resolved = resolveParentAtlasRuntimeProfile({ ENGRAM_ONLY: 'true' });
		expect(resolved.profile).toBe('engram_only');
		expect(resolved.source).toBe('legacy_engram_only');
	});

	it('treats engram-only disabled services as policy-disabled', () => {
		const manifest = getParentAtlasRuntimeProfileManifest({
			ENGRAM_ONLY: 'true',
		});

		expect(manifest.profile).toBe('engram_only');
		expect(manifest.services.redis.state).toBe('disabled');
		expect(manifest.services.qdrant.state).toBe('disabled');
		expect(manifest.services.neo4j.state).toBe('disabled');
		expect(manifest.features.graphify_startup.state).toBe('disabled');
		expect(manifest.services.postgres.state).toBe('required');
		expect(manifest.services.engram_embed.state).toBe('required');
	});

	it('keeps the full workstation profile fully online by contract', () => {
		const manifest = getParentAtlasRuntimeProfileManifest({
			PARENT_ATLAS_RUNTIME_PROFILE: 'parent_atlas_full',
		});

		expect(manifest.profile).toBe('parent_atlas_full');
		expect(manifest.services.redis.state).toBe('required');
		expect(manifest.services.qdrant.state).toBe('required');
		expect(manifest.services.neo4j.state).toBe('required');
		expect(manifest.services.ollama.state).toBe('required');
		expect(manifest.services.engram_embed.state).toBe('required');
		expect(manifest.features.graphify_startup.state).toBe('required');
	});

	it('routes fixture runs into the ci_fixture profile', () => {
		const manifest = getParentAtlasRuntimeProfileManifest({
			NODE_ENV: 'test',
		});

		expect(manifest.profile).toBe('ci_fixture');
		expect(manifest.features.graphify_startup.state).toBe('disabled');
		expect(manifest.services.redis.state).toBe('optional');
		expect(manifest.services.qdrant.state).toBe('optional');
		expect(manifest.services.neo4j.state).toBe('optional');
	});

	it('keeps the profile type narrow', () => {
		const profile: ParentAtlasRuntimeProfile = 'development';
		expect(profile).toBe('development');
	});
});
