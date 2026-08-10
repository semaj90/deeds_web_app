import { createHash } from 'node:crypto';
import type { FeeComparisonRow, FeeSyncManifest, FeeSyncSummary, PublishedFee, SalesforceFee } from './types.js';

function key(value: string | null | undefined): string {
	return String(value ?? '').trim().toUpperCase();
}

function numberOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(String(value).replace(/[$,]/g, '').trim());
	return Number.isFinite(parsed) ? parsed : null;
}

export function parsePublishedFeesFromText(text: string): PublishedFee[] {
	const rows: PublishedFee[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/\s+/g, ' ').trim();
		if (!line) continue;
		// Conservative fallback parser: a fee code at the beginning and a currency/number at the end.
		// Ambiguous lines are intentionally left for manual review rather than guessed.
		const match = line.match(/^([A-Za-z0-9.-]+)\s+(.+?)\s+\$?([0-9][0-9,]*(?:\.\d{1,4})?)$/);
		if (!match) continue;
		rows.push({
			feeNo: match[1],
			description: match[2],
			publishedAmount: numberOrNull(match[3]),
			sourceText: rawLine,
		});
	}
	return rows;
}

export function compareFees(salesforce: SalesforceFee[], published: PublishedFee[]): FeeComparisonRow[] {
	const sfByCode = new Map<string, SalesforceFee[]>();
	const pdfByCode = new Map<string, PublishedFee[]>();
	for (const fee of salesforce) {
		const code = key(fee.SSF_Code__c);
		if (!code) continue;
		const list = sfByCode.get(code) ?? [];
		list.push(fee);
		sfByCode.set(code, list);
	}
	for (const fee of published) {
		const code = key(fee.feeNo);
		if (!code) continue;
		const list = pdfByCode.get(code) ?? [];
		list.push(fee);
		pdfByCode.set(code, list);
	}

	const rows: FeeComparisonRow[] = [];
	for (const sf of salesforce) {
		const canonicalKey = sf.MUSW__Template_Key__c || sf.Id;
		const code = key(sf.SSF_Code__c);
		const calculationType = sf.MUSW__Fee_Calculation_Type__c ?? 'Unknown';
		if (!code) {
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Standard_Price__c ?? sf.MUSW__Fee_Formula__c ?? null, publishedValue: null, proposedValue: null, status: 'NO_SSF_CODE', changeRequired: false, reason: 'Active Salesforce fee has no SSF code; manual mapping required.', lastModifiedDate: sf.LastModifiedDate });
			continue;
		}
		const sfMatches = sfByCode.get(code) ?? [];
		if (sfMatches.length > 1) {
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Standard_Price__c ?? sf.MUSW__Fee_Formula__c ?? null, publishedValue: null, proposedValue: null, status: 'DUPLICATE_SF_KEY', changeRequired: false, reason: `SSF code ${sf.SSF_Code__c} resolves to ${sfMatches.length} active Salesforce records.`, lastModifiedDate: sf.LastModifiedDate });
			continue;
		}
		const pdfMatches = pdfByCode.get(code) ?? [];
		if (pdfMatches.length === 0) {
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Standard_Price__c ?? sf.MUSW__Fee_Formula__c ?? null, publishedValue: null, proposedValue: null, status: 'MISSING_IN_PDF', changeRequired: false, reason: 'No published fee matched this SSF code.', lastModifiedDate: sf.LastModifiedDate });
			continue;
		}
		if (pdfMatches.length > 1) {
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Standard_Price__c ?? sf.MUSW__Fee_Formula__c ?? null, publishedValue: null, proposedValue: null, status: 'DUPLICATE_PDF_KEY', changeRequired: false, reason: `Published fee code ${sf.SSF_Code__c} appears ${pdfMatches.length} times.`, lastModifiedDate: sf.LastModifiedDate });
			continue;
		}

		const pdf = pdfMatches[0];
		const currentPrice = numberOrNull(sf.MUSW__Standard_Price__c);
		const publishedAmount = numberOrNull(pdf.publishedAmount);
		if (calculationType === 'Flat Fee') {
			const changed = currentPrice !== publishedAmount;
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: currentPrice, publishedValue: publishedAmount, proposedValue: publishedAmount, status: changed ? 'CHANGED_FLAT' : 'UNCHANGED', changeRequired: changed, lastModifiedDate: sf.LastModifiedDate });
			continue;
		}

		if (calculationType === 'Multiplier Fee') {
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Fee_Formula__c ?? null, publishedValue: publishedAmount, proposedValue: null, status: 'CHANGED_MULTIPLIER', changeRequired: false, reason: 'Formula mutation requires explicit literal mapping; never inferred from amount alone.', lastModifiedDate: sf.LastModifiedDate });
			continue;
		}

		if (calculationType === 'Tier Fee') {
			rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Fee_Formula__c ?? null, publishedValue: publishedAmount, proposedValue: null, status: 'CHANGED_TIER', changeRequired: false, reason: 'Tier changes require tier-item export and section-name validation.', lastModifiedDate: sf.LastModifiedDate });
			continue;
		}

		rows.push({ canonicalKey, salesforceId: sf.Id, ssfCode: sf.SSF_Code__c, name: sf.Name, calculationType, currentValue: sf.MUSW__Standard_Price__c ?? null, publishedValue: publishedAmount, proposedValue: null, status: 'MANUAL_REVIEW', changeRequired: false, reason: `Unsupported calculation type: ${calculationType}`, lastModifiedDate: sf.LastModifiedDate });
	}

	return rows;
}

export function summarize(rows: FeeComparisonRow[]): FeeSyncSummary {
	return {
		matched: rows.filter((r) => !['MISSING_IN_PDF', 'MISSING_IN_SALESFORCE', 'NO_SSF_CODE'].includes(r.status)).length,
		changed: rows.filter((r) => r.changeRequired).length,
		review: rows.filter((r) => !['UNCHANGED', 'CHANGED_FLAT'].includes(r.status)).length,
		duplicates: rows.filter((r) => r.status.startsWith('DUPLICATE')).length,
		unchanged: rows.filter((r) => r.status === 'UNCHANGED').length,
	};
}

export function createManifest(input: Omit<FeeSyncManifest, 'manifestVersion' | 'hash'>): FeeSyncManifest {
	const payload = { manifestVersion: 'fee-sync.manifest.v1' as const, ...input };
	const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
	return { ...payload, hash };
}
