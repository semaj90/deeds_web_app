import type { PageServerLoad } from './$types';
import { readCaseSceneE2E01BFixtureV1 } from '$lib/server/reconstruction/fixtures/case-scene-e2e-01b-v1.js';

export const load: PageServerLoad = async () => {
	const result = await readCaseSceneE2E01BFixtureV1();
	return result;
};
