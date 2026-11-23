export {
	assertEastQuayFixtureReadOnlyV1,
	decideSyntheticPortraitPresentationV1,
	eastQuayCaseFixtureV1Schema,
	parseEastQuayCaseFixtureV1,
	validateCaseFixture,
	type EastQuayCaseFixture,
	type EastQuayCaseFixture as EastQuayCaseFixtureV1
} from './case-registry-v1.js';

import type { EastQuayCaseFixture } from './case-registry-v1.js';

export function summarizeEastQuayCaseFixtureV1(fixture: EastQuayCaseFixture) {
	return {
		caseId: fixture.caseId,
		title: fixture.title,
		classification: fixture.classification,
		people: fixture.people.length,
		scenes: fixture.scenes.length,
		events: fixture.events.length,
		evidence: fixture.evidence.length,
		transcripts: fixture.transcripts.length
	} as const;
}
