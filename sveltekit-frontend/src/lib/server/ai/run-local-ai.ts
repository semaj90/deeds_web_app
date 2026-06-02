import { selectAiLane, type LaneRequest } from './lane-router.js';
import { runVlmLane, type VlmLaneResult } from './vlm-lane.js';
import { checkVlmReadiness } from './vlm-readiness.js';

export type LocalAiResult = {
	lane: 'vlm' | 'text';
	answer: string;
	vlm?: VlmLaneResult;
	skippedReason?: string;
};

/**
 * Single entrypoint for local llama-server inference.
 * Routes to VLM lane when images are present or vision keywords detected,
 * otherwise signals the caller to fall through to routeStreamingInference.
 *
 * Returns null when the VLM lane is not ready or the query should use the
 * standard streaming path (lane === 'text' with no local fallback needed).
 */
export async function runLocalAi(req: LaneRequest): Promise<LocalAiResult | null> {
	const lane = selectAiLane(req);

	if (lane !== 'vlm') {
		return null;
	}

	const readiness = await checkVlmReadiness();
	if (!readiness.vlmReady) {
		return {
			lane: 'vlm',
			answer: '',
			skippedReason: readiness.reason,
		};
	}

	const result = await runVlmLane(req);
	return {
		lane: 'vlm',
		answer: result.answer,
		vlm: result,
	};
}
