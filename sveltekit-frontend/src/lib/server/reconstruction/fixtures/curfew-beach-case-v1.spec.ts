import { describe, expect, it } from 'vitest';
import {
	CURFEW_BEACH_CASE_FIXTURE_V1,
	CurfewBeachCaseFixtureV1Schema
} from './curfew-beach-case-v1.js';

describe('synthetic curfew and beach reconstruction fixture', () => {
	it('keeps curfew context, overnight reports, and source clock domains separate', () => {
		const fixture = CURFEW_BEACH_CASE_FIXTURE_V1;
		expect(fixture.curfewContext.localStartMs).toBe(22 * 60 * 60 * 1000);
		expect(fixture.curfewContext.status).toBe('unverified-context');
		expect(fixture.actors).toHaveLength(4);
		expect(fixture.actors.every((actor) => actor.identityLinks.length === 0)).toBe(true);
		expect(new Set(fixture.sources.map((source) => source.clockId)).size).toBe(fixture.sources.length);
		const bonfireReports = fixture.events.filter((event) => event.claimType === 'reported-bonfire');
		expect(bonfireReports).toHaveLength(2);
		expect(bonfireReports.every((event) => event.endMs > 24 * 60 * 60 * 1000)).toBe(true);
		expect(new Set(bonfireReports.map((event) => event.clockId))).toEqual(new Set(['CLK-WITNESS-A', 'CLK-WITNESS-B']));
		const afterCurfewPresenceReports = fixture.events.filter((event) => event.claimType === 'reported-presence');
		expect(afterCurfewPresenceReports).toHaveLength(2);
		expect(afterCurfewPresenceReports.every((event) => event.actorIds.length === 0 && event.targetRefs.length === 0)).toBe(true);
		expect(new Set(afterCurfewPresenceReports.map((event) => event.clockId))).toEqual(new Set(['CLK-WITNESS-A', 'CLK-WITNESS-B']));
		expect(fixture.events.filter((event) => event.claimType === 'possible-alcohol-use').every((event) => event.actorIds.length === 0)).toBe(true);
		expect(fixture.provenance).toMatchObject({ evidenceBytesPresent: false, databaseWritesAllowed: false, visualIdentityLinksAllowed: false });
	});

	it('rejects cross-clock attribution and actor linking in possible-age allegations', () => {
		const fixture = structuredClone(CURFEW_BEACH_CASE_FIXTURE_V1);
		fixture.events[0]!.clockId = 'CLK-WITNESS-C';
		expect(CurfewBeachCaseFixtureV1Schema.safeParse(fixture).success).toBe(false);
		fixture.events[0]!.clockId = 'CLK-WITNESS-A';
		const drinking = fixture.events.find((event) => event.claimType === 'possible-alcohol-use')!;
		drinking.actorIds = ['POI-01'];
		expect(CurfewBeachCaseFixtureV1Schema.safeParse(fixture).success).toBe(false);
	});

	it('rejects duplicate clock domains, invalid interval order, and non-fixture admission flags', () => {
		const duplicateClock = structuredClone(CURFEW_BEACH_CASE_FIXTURE_V1);
		duplicateClock.sources[1]!.clockId = duplicateClock.sources[0]!.clockId;
		expect(CurfewBeachCaseFixtureV1Schema.safeParse(duplicateClock).success).toBe(false);
		const invalidInterval = structuredClone(CURFEW_BEACH_CASE_FIXTURE_V1);
		invalidInterval.events[0]!.endMs = invalidInterval.events[0]!.startMs;
		expect(CurfewBeachCaseFixtureV1Schema.safeParse(invalidInterval).success).toBe(false);
		const writeEnabled = structuredClone(CURFEW_BEACH_CASE_FIXTURE_V1);
		writeEnabled.provenance.databaseWritesAllowed = true;
		expect(CurfewBeachCaseFixtureV1Schema.safeParse(writeEnabled).success).toBe(false);
	});
});
