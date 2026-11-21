import { createHash } from 'node:crypto';
import { stableStringifyTupleV1, type SceneLinkedTupleV1 } from '$lib/reconstruction/scene-ontology-bridge-v1.js';

/** Server-side canonical hash. Browser scene validation imports the contract only. */
export function hashSceneLinkedTuplesV1(tuples: readonly SceneLinkedTupleV1[]): string {
	const sorted = [...tuples].sort((a, b) => a.tupleId.localeCompare(b.tupleId));
	const payload = JSON.stringify(sorted.map(stableStringifyTupleV1));
	return createHash('sha256').update(payload, 'utf8').digest('hex');
}
