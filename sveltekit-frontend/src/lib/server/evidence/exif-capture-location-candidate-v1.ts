import { createHash } from 'node:crypto';
import { z } from 'zod';
import { gps } from 'exifr';

const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/tiff',
	'image/webp',
	'image/heic',
	'image/avif',
]);

const inputSchema = z.object({
	caseId: z.string().uuid(),
	evidenceId: z.string().uuid(),
	mimeType: z.string().min(1).max(120),
	bytes: z.instanceof(Buffer),
}).strict();

export type ExifCaptureLocationCandidateV1 = {
	schema: 'atlas.exif-capture-location-candidate.v1';
	status: 'UNREVIEWED_CANDIDATE';
	purpose: 'CAPTURE_LOCATION';
	caseId: string;
	evidenceId: string;
	sourceSha256: string;
	coordinates: {
		latitude: number;
		longitude: number;
		crs: 'EPSG:4326';
	};
	provenance: {
		kind: 'EXIF_GPS';
	parser: 'exifr@7.1.3';
	};
	confirmedCrimeLocation: false;
};

export type ExifCaptureLocationCandidateResultV1 = {
	status: 'CANDIDATE' | 'NO_GPS' | 'UNSUPPORTED_FORMAT' | 'INVALID_INPUT' | 'PARSER_ERROR';
	candidate: ExifCaptureLocationCandidateV1 | null;
};

/** Extracts only GPS coordinates from immutable source image bytes; never writes or confirms them. */
export async function extractExifCaptureLocationCandidateV1(
	input: unknown,
): Promise<ExifCaptureLocationCandidateResultV1> {
	const parsed = inputSchema.safeParse(input);
	if (!parsed.success) return { status: 'INVALID_INPUT', candidate: null };
	const { caseId, evidenceId, mimeType, bytes } = parsed.data;
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
		return { status: 'INVALID_INPUT', candidate: null };
	}
	if (!SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase())) {
		return { status: 'UNSUPPORTED_FORMAT', candidate: null };
	}

	try {
		const coordinates = await gps(bytes);
		if (!coordinates) return { status: 'NO_GPS', candidate: null };
		const { latitude, longitude } = coordinates;
		if (
			!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
			!Number.isFinite(longitude) || longitude < -180 || longitude > 180
		) {
			return { status: 'PARSER_ERROR', candidate: null };
		}

		return {
			status: 'CANDIDATE',
			candidate: {
				schema: 'atlas.exif-capture-location-candidate.v1',
				status: 'UNREVIEWED_CANDIDATE',
				purpose: 'CAPTURE_LOCATION',
				caseId,
				evidenceId,
				sourceSha256: createHash('sha256').update(bytes).digest('hex'),
				coordinates: { latitude, longitude, crs: 'EPSG:4326' },
				provenance: { kind: 'EXIF_GPS', parser: 'exifr@7.1.3' },
				confirmedCrimeLocation: false,
			},
		};
	} catch {
		return { status: 'PARSER_ERROR', candidate: null };
	}
}
