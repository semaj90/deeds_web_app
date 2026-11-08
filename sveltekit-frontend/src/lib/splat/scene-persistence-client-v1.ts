import { sceneDocumentV1Schema, stableStringifySceneDocumentV1, type SceneDocumentV1 } from './scene-document-v1.js';
import { sha256Hex } from './spz-loader.js';

/** Stable UUIDv8 namespace identity for the revisioned scene attached to one case exhibit. */
export async function evidenceSceneIdV1(caseId: string, evidenceId: string): Promise<string> {
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuid.test(caseId) || !uuid.test(evidenceId)) throw new Error('CASE_AND_EVIDENCE_IDS_MUST_BE_UUIDS');
	const digest = await sha256Hex(new TextEncoder().encode(`parent-atlas:evidence-scene:v1:${caseId.toLowerCase()}:${evidenceId.toLowerCase()}`));
	const bytes = new Uint8Array(digest.match(/.{2}/g)!.slice(0, 16).map((byte) => Number.parseInt(byte, 16)));
	bytes[6] = (bytes[6] & 0x0f) | 0x80;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SceneAssetReceiptV1 {
	assetId: string;
	format: 'GLB';
	sha256: string;
	bytes: number;
	readonly [key: string]: unknown;
}

export interface SceneRevisionReceiptV1 {
	revision: number;
	manifestSha256: string;
	manifest: SceneDocumentV1;
	replayed: boolean;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	try {
		const value: unknown = await response.json();
		return value && typeof value === 'object' ? value as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

async function verifyRevisionReceiptV1(value: unknown, scope: { caseId: string; sceneId: string; replayed: boolean }): Promise<SceneRevisionReceiptV1> {
	if (!value || typeof value !== 'object') throw new Error('Scene revision response was invalid.');
	const data = value as Record<string, unknown>;
	if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 1 || typeof data.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.manifestSha256)) {
		throw new Error('Scene revision response was invalid.');
	}
	const parsedManifest = sceneDocumentV1Schema.safeParse(data.manifest);
	if (!parsedManifest.success) throw new Error('Scene revision manifest was invalid.');
	const manifest = parsedManifest.data;
	if (manifest.caseId !== scope.caseId || manifest.sceneId !== scope.sceneId || manifest.revision !== data.revision) {
		throw new Error('Scene revision manifest scope did not match its receipt.');
	}
	const { sha256Hex } = await import('./spz-loader.js');
	const computedSha256 = await sha256Hex(new TextEncoder().encode(stableStringifySceneDocumentV1(manifest)));
	if (computedSha256 !== data.manifestSha256.toLowerCase()) throw new Error('SCENE_MANIFEST_SHA256_MISMATCH');
	return {
		revision: data.revision as number,
		manifestSha256: data.manifestSha256.toLowerCase(),
		manifest,
		replayed: scope.replayed
	};
}

export async function saveSceneRevisionV1(input: {
	caseId: string;
	sceneId: string;
	expectedRevision: number;
	commandId: string;
	glb: ArrayBuffer;
	createManifest: (asset: SceneAssetReceiptV1) => unknown;
	fetcher?: typeof fetch;
}): Promise<{ asset: SceneAssetReceiptV1; revision: SceneRevisionReceiptV1 }> {
	const fetcher = input.fetcher ?? fetch;
	const base = `/api/cases/${encodeURIComponent(input.caseId)}/scenes/${encodeURIComponent(input.sceneId)}`;
	const assetResponse = await fetcher(`${base}/assets`, {
		method: 'POST',
		headers: { 'content-type': 'model/gltf-binary' },
		body: input.glb
	});
	const assetEnvelope = await readJson(assetResponse);
	if (!assetResponse.ok || assetEnvelope.success !== true || !assetEnvelope.data || typeof assetEnvelope.data !== 'object') {
		throw new Error(typeof assetEnvelope.message === 'string' ? assetEnvelope.message : `Scene asset upload failed (${assetResponse.status})`);
	}
	const candidate = assetEnvelope.data as Record<string, unknown>;
	if (typeof candidate.assetId !== 'string' || candidate.format !== 'GLB' || typeof candidate.sha256 !== 'string' || !Number.isSafeInteger(candidate.bytes) || candidate.bytes !== input.glb.byteLength) {
		throw new Error('Scene asset upload returned an invalid receipt.');
	}
	const asset = candidate as SceneAssetReceiptV1;
	const revision = await saveSceneManifestRevisionV1({
		caseId: input.caseId,
		sceneId: input.sceneId,
		expectedRevision: input.expectedRevision,
		commandId: input.commandId,
		manifest: input.createManifest(asset),
		fetcher
	});
	return { asset, revision };
}

/** Append a manifest revision that references assets already registered for this case/scene. */
export async function saveSceneManifestRevisionV1(input: {
	caseId: string;
	sceneId: string;
	expectedRevision: number;
	commandId: string;
	manifest: unknown;
	fetcher?: typeof fetch;
}): Promise<SceneRevisionReceiptV1> {
	const parsedManifest = sceneDocumentV1Schema.parse(input.manifest);
	if (parsedManifest.caseId !== input.caseId || parsedManifest.sceneId !== input.sceneId || parsedManifest.revision !== input.expectedRevision + 1) {
		throw new Error('Scene revision manifest scope or expected revision did not match.');
	}
	if (parsedManifest.assets.length === 0 && parsedManifest.evidenceSources.length === 0 && (parsedManifest.evidenceBindings?.length ?? 0) === 0) {
		throw new Error('Scene revision must reference a registered asset or a revision-qualified evidence source.');
	}
	const fetcher = input.fetcher ?? fetch;
	const base = `/api/cases/${encodeURIComponent(input.caseId)}/scenes/${encodeURIComponent(input.sceneId)}`;
	const revisionResponse = await fetcher(`${base}/revisions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			commandId: input.commandId,
			expectedRevision: input.expectedRevision,
			manifest: parsedManifest
		})
	});
	const revisionEnvelope = await readJson(revisionResponse);
	if (!revisionResponse.ok || revisionEnvelope.success !== true || !revisionEnvelope.data || typeof revisionEnvelope.data !== 'object') {
		throw new Error(typeof revisionEnvelope.message === 'string' ? revisionEnvelope.message : `Scene revision save failed (${revisionResponse.status})`);
	}
	const revision = revisionEnvelope.data as Record<string, unknown>;
	return verifyRevisionReceiptV1(revision, { caseId: input.caseId, sceneId: input.sceneId, replayed: revision.replayed === true });
}

export async function fetchSceneRevisionV1(input: {
	caseId: string;
	sceneId: string;
	fetcher?: typeof fetch;
}): Promise<SceneRevisionReceiptV1 | null> {
	const fetcher = input.fetcher ?? fetch;
	const response = await fetcher(`/api/cases/${encodeURIComponent(input.caseId)}/scenes/${encodeURIComponent(input.sceneId)}/revisions`, { cache: 'no-store' });
	const envelope = await readJson(response);
	if (!response.ok || envelope.success !== true) {
		throw new Error(typeof envelope.message === 'string' ? envelope.message : `Scene revision read failed (${response.status})`);
	}
	if (envelope.data === null) return null;
	return verifyRevisionReceiptV1(envelope.data, { caseId: input.caseId, sceneId: input.sceneId, replayed: false });
}

export async function fetchSceneAssetV1(input: {
	caseId: string;
	sceneId: string;
	assetId: string;
	expectedSha256: string;
	expectedBytes: number;
	fetcher?: typeof fetch;
}): Promise<ArrayBuffer> {
	const fetcher = input.fetcher ?? fetch;
	const url = `/api/cases/${encodeURIComponent(input.caseId)}/scenes/${encodeURIComponent(input.sceneId)}/assets?assetId=${encodeURIComponent(input.assetId)}`;
	const response = await fetcher(url, { cache: 'no-store' });
	if (!response.ok) {
		const envelope = await readJson(response);
		throw new Error(typeof envelope.message === 'string' ? envelope.message : `Scene asset read failed (${response.status})`);
	}
	if (response.headers.get('content-type')?.split(';')[0] !== 'model/gltf-binary') throw new Error('Scene asset content type was not GLB.');
	const bytes = await response.arrayBuffer();
	if (bytes.byteLength !== input.expectedBytes || bytes.byteLength > 64 * 1024 * 1024) throw new Error('Scene asset byte length did not match its manifest.');
	const { sha256Hex } = await import('./spz-loader.js');
	if (await sha256Hex(new Uint8Array(bytes)) !== input.expectedSha256) throw new Error('Scene asset digest did not match its manifest.');
	return bytes;
}
