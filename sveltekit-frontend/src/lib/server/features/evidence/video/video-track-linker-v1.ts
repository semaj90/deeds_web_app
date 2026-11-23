export const VIDEO_TRACK_LINKER_REVISION_V1 = 'global-greedy-class-and-iou-track-linker-v2' as const;

export interface TrackableVideoDetectionV1 {
	label: string;
	confidence: number;
	bbox: [number, number, number, number];
	[key: string]: unknown;
}

export interface TrackableVideoFrameV1 {
	frameIndex: number;
	timestampMs: number;
	objects: TrackableVideoDetectionV1[];
	[key: string]: unknown;
}

export type LinkedVideoFrameV1<T extends TrackableVideoFrameV1 = TrackableVideoFrameV1> = Omit<T, 'objects'> & {
	trackScopeId: string;
	objects: Array<TrackableVideoDetectionV1 & {
		trackId: string;
		centerPx: [number, number];
		velocityPxPerSecond: [number, number] | null;
		trackState: 'UNREVIEWED_TRACK_HYPOTHESIS';
	}>;
};

interface ActiveTrackV1 {
	id: string;
	label: string;
	bbox: [number, number, number, number];
	centerPx: [number, number];
	frameIndex: number;
	timestampMs: number;
}

function centerOf(bbox: [number, number, number, number]): [number, number] {
	return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

function intersectionOverUnion(a: [number, number, number, number], b: [number, number, number, number]): number {
	const left = Math.max(a[0], b[0]);
	const top = Math.max(a[1], b[1]);
	const right = Math.min(a[2], b[2]);
	const bottom = Math.min(a[3], b[3]);
	const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
	const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
	const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
	const union = areaA + areaB - intersection;
	return union > 0 ? intersection / union : 0;
}

function compareTextOrdinal(a: string, b: string): number {
	return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Link adjacent detector observations into revision/run-scoped track hypotheses.
 * This is deterministic association metadata, not identity recognition.
 */
export function linkVideoFrameTracksV1<T extends TrackableVideoFrameV1>(
	frames: readonly T[],
	trackScopeId: string,
	options: { minIoU?: number; maxFrameGap?: number } = {},
): Array<LinkedVideoFrameV1<T>> {
	const minIoU = options.minIoU ?? 0.1;
	const maxFrameGap = options.maxFrameGap ?? 1;
	if (!trackScopeId.trim() || !Number.isFinite(minIoU) || minIoU < 0 || minIoU > 1 || !Number.isSafeInteger(maxFrameGap) || maxFrameGap < 0) {
		throw new RangeError('Invalid video track-link configuration.');
	}
	const tracks = new Map<string, ActiveTrackV1>();
	let nextTrackNumber = 1;
	let previousTimestampMs = -1;
	let previousFrameIndex = -1;

	return frames.map((frame) => {
		if (!Number.isSafeInteger(frame.frameIndex) || frame.frameIndex <= previousFrameIndex || !Number.isSafeInteger(frame.timestampMs) || frame.timestampMs < previousTimestampMs) {
			throw new RangeError('Frames must have increasing indexes and non-decreasing source timestamps.');
		}
		previousFrameIndex = frame.frameIndex;
		previousTimestampMs = frame.timestampMs;
		const ordered = frame.objects.map((detection, sourceOrder) => ({ detection, sourceOrder, center: centerOf(detection.bbox) }))
			.sort((a, b) => compareTextOrdinal(a.detection.label, b.detection.label) || a.detection.bbox[1] - b.detection.bbox[1] || a.detection.bbox[0] - b.detection.bbox[0] || a.detection.bbox[3] - b.detection.bbox[3] || a.detection.bbox[2] - b.detection.bbox[2] || b.detection.confidence - a.detection.confidence || a.sourceOrder - b.sourceOrder);
		// Build all eligible same-class IoU pairs first, then assign the strongest
		// pairs globally. Per-detection greedy matching can consume a track that is
		// the only viable match for a later detection in this same frame.
		const matchEdges: Array<{ detectionIndex: number; track: ActiveTrackV1; iou: number }> = [];
		for (let detectionIndex = 0; detectionIndex < ordered.length; detectionIndex += 1) {
			const detection = ordered[detectionIndex]!.detection;
			if (!detection.label || !Number.isFinite(detection.confidence) || detection.confidence < 0 || detection.confidence > 1 || detection.bbox.some((value) => !Number.isFinite(value)) || detection.bbox[2] <= detection.bbox[0] || detection.bbox[3] <= detection.bbox[1]) {
				throw new RangeError('Invalid detection geometry for video track linking.');
			}
			for (const track of tracks.values()) {
				if (track.label !== detection.label || frame.frameIndex - track.frameIndex > maxFrameGap + 1) continue;
				const iou = intersectionOverUnion(track.bbox, detection.bbox);
				if (iou >= minIoU) matchEdges.push({ detectionIndex, track, iou });
			}
		}
		matchEdges.sort((a, b) => b.iou - a.iou || compareTextOrdinal(a.track.id, b.track.id) || a.detectionIndex - b.detectionIndex);
		const usedTrackIds = new Set<string>();
		const usedDetectionIndexes = new Set<number>();
		const trackByDetection = new Map<number, ActiveTrackV1>();
		for (const edge of matchEdges) {
			if (usedTrackIds.has(edge.track.id) || usedDetectionIndexes.has(edge.detectionIndex)) continue;
			usedTrackIds.add(edge.track.id);
			usedDetectionIndexes.add(edge.detectionIndex);
			trackByDetection.set(edge.detectionIndex, edge.track);
		}
		const linked: LinkedVideoFrameV1<T>['objects'] = [];
		for (let detectionIndex = 0; detectionIndex < ordered.length; detectionIndex += 1) {
			const { detection, center } = ordered[detectionIndex]!;
			const matched = trackByDetection.get(detectionIndex);
			const trackId = matched?.id ?? `track-${String(nextTrackNumber++).padStart(4, '0')}`;
			const elapsedSeconds = matched ? (frame.timestampMs - matched.timestampMs) / 1000 : 0;
			const velocityPxPerSecond: [number, number] | null = matched && elapsedSeconds > 0
				? [(center[0] - matched.centerPx[0]) / elapsedSeconds, (center[1] - matched.centerPx[1]) / elapsedSeconds]
				: null;
			tracks.set(trackId, { id: trackId, label: detection.label, bbox: [...detection.bbox], centerPx: center, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs });
			linked.push({ ...detection, trackId, centerPx: center, velocityPxPerSecond, trackState: 'UNREVIEWED_TRACK_HYPOTHESIS' });
		}
		return { ...frame, trackScopeId, objects: linked } as LinkedVideoFrameV1<T>;
	});
}
