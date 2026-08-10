import { describe, expect, it } from 'vitest';
import { compareFees, createManifest, parsePublishedFeesFromText, summarize } from '$lib/server/fee-sync/compare.js';
import type { SalesforceFee } from '$lib/server/fee-sync/types.js';

const sf = (overrides: Partial<SalesforceFee> = {}): SalesforceFee => ({
	Id: 'a01xx0000000001AAA',
	Name: 'Example Permit Fee',
	MUSW__Template_Key__c: 'FT-00001',
	MUSW__Active__c: true,
	MUSW__Standard_Price__c: 473,
	SSF_Code__c: '8.15',
	MUSW__Fee_Calculation_Type__c: 'Flat Fee',
	LastModifiedDate: '2026-07-03T11:16:50.000+0000',
	...overrides,
});

describe('fee sync comparator', () => {
	it('parses fee code and currency from conservative text rows', () => {
		const rows = parsePublishedFeesFromText('8.15 Furnace Replacement $495.00\n8.13 Bath Update 567');
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ feeNo: '8.15', publishedAmount: 495 });
	});

	it('marks changed flat fees by SSF code', () => {
		const rows = compareFees([sf()], [{ feeNo: '8.15', publishedAmount: 495 }]);
		expect(rows[0]).toMatchObject({
			canonicalKey: 'FT-00001',
			status: 'CHANGED_FLAT',
			changeRequired: true,
			currentValue: 473,
			proposedValue: 495,
		});
	});

	it('blocks duplicate Salesforce identities instead of choosing one', () => {
		const rows = compareFees([
			sf(),
			sf({ Id: 'a01xx0000000002AAA', MUSW__Template_Key__c: 'FT-99999' }),
		], [{ feeNo: '8.15', publishedAmount: 495 }]);
		expect(rows.every((row) => row.status === 'DUPLICATE_SF_KEY')).toBe(true);
		expect(summarize(rows).duplicates).toBe(2);
	});

	it('never converts multiplier fees into automatic flat updates', () => {
		const rows = compareFees([
			sf({
				MUSW__Fee_Calculation_Type__c: 'Multiplier Fee',
				MUSW__Standard_Price__c: null,
				MUSW__Fee_Formula__c: 'ROUND(MULT({!MUSW__Permit2__c.MUSW__Valuation__c},0.0018),2)',
			}),
		], [{ feeNo: '8.15', publishedAmount: 0.002 }]);
		expect(rows[0].status).toBe('CHANGED_MULTIPLIER');
		expect(rows[0].changeRequired).toBe(false);
		expect(rows[0].proposedValue).toBeNull();
	});

	it('hashes an approval manifest deterministically', () => {
		const input = {
			fiscalYear: 'FY 2026-27',
			sourceName: 'master.pdf',
			sourceSha256: 'abc',
			createdAt: '2026-08-10T00:00:00.000Z',
			createdBy: 'admin@example.com',
			environment: 'DEV',
			rows: compareFees([sf()], [{ feeNo: '8.15', publishedAmount: 495 }]),
		};
		expect(createManifest(input).hash).toBe(createManifest(input).hash);
	});
});
