export type FeeCalculationType = 'Flat Fee' | 'Multiplier Fee' | 'Tier Fee' | string;

export type FeeSyncStatus =
	| 'UNCHANGED'
	| 'CHANGED_FLAT'
	| 'CHANGED_MULTIPLIER'
	| 'CHANGED_TIER'
	| 'MISSING_IN_PDF'
	| 'MISSING_IN_SALESFORCE'
	| 'AMBIGUOUS_MATCH'
	| 'DUPLICATE_PDF_KEY'
	| 'DUPLICATE_SF_KEY'
	| 'NO_SSF_CODE'
	| 'FORMULA_PARSE_FAILED'
	| 'TIER_SECTION_AMBIGUOUS'
	| 'MANUAL_REVIEW';

export interface SalesforceFee {
	Id: string;
	Name: string;
	MUSW__Template_Key__c: string;
	MUSW__Fee_Description__c?: string | null;
	MUSW__Type__c?: string | null;
	MUSW__Active__c: boolean;
	MUSW__Standard_Price__c?: number | null;
	SSF_Code__c?: string | null;
	MUSW__Fee_Calculation_Type__c?: FeeCalculationType | null;
	MUSW__Fee_Formula__c?: string | null;
	clariti__Tier__c?: string | null;
	LastModifiedDate?: string | null;
}

export interface PublishedFee {
	feeNo: string;
	name?: string;
	description?: string;
	publishedAmount?: number | null;
	base?: number | null;
	rate?: number | null;
	sourcePage?: number | null;
	sourceText?: string;
}

export interface FeeComparisonRow {
	canonicalKey: string;
	salesforceId?: string;
	ssfCode?: string | null;
	name: string;
	calculationType: FeeCalculationType;
	currentValue: string | number | null;
	publishedValue: string | number | null;
	proposedValue: string | number | null;
	status: FeeSyncStatus;
	changeRequired: boolean;
	reason?: string;
	lastModifiedDate?: string | null;
	approved?: boolean;
}

export interface FeeSyncManifest {
	manifestVersion: 'fee-sync.manifest.v1';
	fiscalYear: string;
	sourceName: string;
	sourceSha256: string;
	createdAt: string;
	createdBy: string;
	environment: string;
	rows: FeeComparisonRow[];
	hash: string;
}

export interface FeeSyncSummary {
	matched: number;
	changed: number;
	review: number;
	duplicates: number;
	unchanged: number;
}
