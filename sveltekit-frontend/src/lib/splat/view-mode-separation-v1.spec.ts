import { describe, expect, it } from 'vitest';
import { resolveViewModeV1 } from './view-mode-separation-v1.js';
import { RETRO_DEMONSTRATIVE_LABEL_V1 } from './retro-framebuffer-config-v1.js';

describe('view mode separation v1 (15.C2)', () => {
	it('evidence mode shows original footage with no retro config and no label', () => {
		const r = resolveViewModeV1({ mode: 'evidence', sourceKind: 'original-footage' });
		expect(r.retro).toBeNull();
		expect(r.label).toBeNull();
	});

	it('evidence mode refuses a retro preset', () => {
		expect(() => resolveViewModeV1({ mode: 'evidence', sourceKind: 'original-footage', preset: 'low' }))
			.toThrow('VIEW_MODE_EVIDENCE_NO_RETRO_PRESET');
	});

	it('evidence mode refuses a reconstruction source', () => {
		expect(() => resolveViewModeV1({ mode: 'evidence', sourceKind: 'reviewed-reconstruction' }))
			.toThrow('VIEW_MODE_EVIDENCE_REQUIRES_ORIGINAL_SOURCE');
	});

	it('retro mode requires a reviewed reconstruction, never original footage', () => {
		expect(() => resolveViewModeV1({ mode: 'retro-reconstruction', sourceKind: 'original-footage' }))
			.toThrow('VIEW_MODE_RETRO_REQUIRES_RECONSTRUCTION_SOURCE');
	});

	it('retro mode always carries the demonstrative label and the default 320x180 config', () => {
		const r = resolveViewModeV1({ mode: 'retro-reconstruction', sourceKind: 'reviewed-reconstruction' });
		expect(r.label).toBe(RETRO_DEMONSTRATIVE_LABEL_V1);
		expect(r.retro).toMatchObject({ preset: 'default', width: 320, height: 180, readbackPerFrame: false });
	});

	it('retro mode honours an explicit preset', () => {
		const r = resolveViewModeV1({ mode: 'retro-reconstruction', sourceKind: 'reviewed-reconstruction', preset: 'high' });
		expect(r.retro).toMatchObject({ width: 640, height: 360 });
	});

	it('rejects an unknown mode', () => {
		expect(() => resolveViewModeV1({ mode: 'poster' as never, sourceKind: 'original-footage' })).toThrow('VIEW_MODE_UNKNOWN');
	});
});
