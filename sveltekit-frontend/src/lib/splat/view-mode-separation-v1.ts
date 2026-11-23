/**
 * Phase 15.C2: keeps normal evidence viewing separate from retro reconstruction.
 *
 * Pure policy, no WebGL. Evidence mode shows original footage with no retro target,
 * no preset and no label. Retro mode is only for reviewed reconstructions, and every
 * retro result carries the demonstrative label.
 */
import {
	RETRO_DEMONSTRATIVE_LABEL_V1,
	retroFramebufferConfigV1,
	type RetroFramebufferConfigV1,
	type RetroResolutionPresetV1,
} from './retro-framebuffer-config-v1.js';

export const VIEW_MODE_SEPARATION_REVISION_V1 = 'atlas-view-mode-separation-v1' as const;

export type ViewModeV1 = 'evidence' | 'retro-reconstruction';
export type ViewSourceKindV1 = 'original-footage' | 'reviewed-reconstruction';

export interface ViewModeRequestV1 {
	readonly mode: ViewModeV1;
	readonly sourceKind: ViewSourceKindV1;
	readonly preset?: RetroResolutionPresetV1;
}

export interface ResolvedViewModeV1 {
	readonly revision: typeof VIEW_MODE_SEPARATION_REVISION_V1;
	readonly mode: ViewModeV1;
	readonly sourceKind: ViewSourceKindV1;
	/** Null in evidence mode: original footage is never retro-processed. */
	readonly retro: RetroFramebufferConfigV1 | null;
	/** Null in evidence mode; always present in retro mode. */
	readonly label: typeof RETRO_DEMONSTRATIVE_LABEL_V1 | null;
}

export function resolveViewModeV1(request: ViewModeRequestV1): ResolvedViewModeV1 {
	if (request.mode === 'evidence') {
		if (request.sourceKind !== 'original-footage') throw new RangeError('VIEW_MODE_EVIDENCE_REQUIRES_ORIGINAL_SOURCE');
		if (request.preset !== undefined) throw new RangeError('VIEW_MODE_EVIDENCE_NO_RETRO_PRESET');
		return { revision: VIEW_MODE_SEPARATION_REVISION_V1, mode: 'evidence', sourceKind: 'original-footage', retro: null, label: null };
	}
	if (request.mode === 'retro-reconstruction') {
		if (request.sourceKind !== 'reviewed-reconstruction') throw new RangeError('VIEW_MODE_RETRO_REQUIRES_RECONSTRUCTION_SOURCE');
		return {
			revision: VIEW_MODE_SEPARATION_REVISION_V1,
			mode: 'retro-reconstruction',
			sourceKind: 'reviewed-reconstruction',
			retro: retroFramebufferConfigV1(request.preset ?? 'default'),
			label: RETRO_DEMONSTRATIVE_LABEL_V1,
		};
	}
	throw new RangeError('VIEW_MODE_UNKNOWN');
}
