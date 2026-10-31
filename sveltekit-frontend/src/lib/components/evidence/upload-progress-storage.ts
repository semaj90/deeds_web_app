import { del, get, set } from 'idb-keyval';

export interface ActiveEvidenceUploadV1 {
	jobId: string;
	evidenceId: string;
	fileName: string;
	fileSize: number;
	startedAt: number;
}

const keyFor = (userId: string) => `atlas:evidence-upload:active:v1:${userId}`;
const samplesKeyFor = (userId: string, sizeBucket: number) => `atlas:evidence-upload:durations:v1:${userId}:${sizeBucket}`;
const sizeBucketFor = (fileSize: number) => Math.ceil(fileSize / (10 * 1024 * 1024));

export async function getActiveEvidenceUpload(userId: string): Promise<ActiveEvidenceUploadV1 | undefined> {
	return get<ActiveEvidenceUploadV1>(keyFor(userId));
}

export async function saveActiveEvidenceUpload(userId: string, upload: ActiveEvidenceUploadV1): Promise<void> {
	await set(keyFor(userId), upload);
}

export async function clearActiveEvidenceUpload(userId: string, jobId: string): Promise<void> {
	const key = keyFor(userId);
	const active = await get<ActiveEvidenceUploadV1>(key);
	if (active?.jobId === jobId) await del(key);
}

export async function getEvidenceUploadDurationSamples(userId: string, fileSize: number): Promise<number[]> {
	return (await get<number[]>(samplesKeyFor(userId, sizeBucketFor(fileSize)))) ?? [];
}

export async function recordEvidenceUploadDuration(userId: string, fileSize: number, durationMs: number): Promise<void> {
	if (!Number.isFinite(durationMs) || durationMs <= 0) return;
	const key = samplesKeyFor(userId, sizeBucketFor(fileSize));
	const samples = (await get<number[]>(key)) ?? [];
	await set(key, [...samples.slice(-19), Math.round(durationMs)]);
}
