import type { SalesforceFee } from './types.js';

const API_VERSION = process.env.SALESFORCE_API_VERSION ?? 'v67.0';

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}`);
	return value;
}

export function salesforceConfigured(): boolean {
	return Boolean(
		process.env.SALESFORCE_CLIENT_ID &&
		process.env.SALESFORCE_CLIENT_SECRET &&
		process.env.SALESFORCE_LOGIN_URL
	);
}

export function salesforceWritesEnabled(): boolean {
	return process.env.FEE_SYNC_SALESFORCE_WRITE_ENABLED === 'true';
}

async function getAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
	const loginUrl = required('SALESFORCE_LOGIN_URL').replace(/\/$/, '');
	const body = new URLSearchParams({
		grant_type: 'client_credentials',
		client_id: required('SALESFORCE_CLIENT_ID'),
		client_secret: required('SALESFORCE_CLIENT_SECRET'),
	});
	const response = await fetch(`${loginUrl}/services/oauth2/token`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body,
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) throw new Error(`Salesforce OAuth failed (${response.status}): ${await response.text()}`);
	const payload = await response.json() as { access_token: string; instance_url: string };
	return { accessToken: payload.access_token, instanceUrl: payload.instance_url };
}

async function sfFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const { accessToken, instanceUrl } = await getAccessToken();
	return fetch(`${instanceUrl}/services/data/${API_VERSION}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${accessToken}`,
			'content-type': 'application/json',
			...(init.headers ?? {}),
		},
		signal: init.signal ?? AbortSignal.timeout(30_000),
	});
}

export async function queryActiveMasterFees(): Promise<SalesforceFee[]> {
	const soql = `SELECT Id,Name,MUSW__Fee_Description__c,MUSW__Template_Key__c,MUSW__Type__c,MUSW__Active__c,MUSW__Standard_Price__c,SSF_Code__c,MUSW__Fee_Calculation_Type__c,MUSW__Fee_Formula__c,clariti__Tier__c,LastModifiedDate FROM MUSW__Master_Fee_List__c WHERE MUSW__Active__c=true ORDER BY MUSW__Template_Key__c`;
	let path = `/query?q=${encodeURIComponent(soql)}`;
	const records: SalesforceFee[] = [];
	while (path) {
		const response = await sfFetch(path);
		if (!response.ok) throw new Error(`Salesforce query failed (${response.status}): ${await response.text()}`);
		const payload = await response.json() as { records: SalesforceFee[]; done: boolean; nextRecordsUrl?: string };
		records.push(...payload.records);
		path = payload.done || !payload.nextRecordsUrl
			? ''
			: payload.nextRecordsUrl.replace(`/services/data/${API_VERSION}`, '');
	}
	return records;
}

export async function updateMasterFees(
	updates: Array<{ Id: string; MUSW__Standard_Price__c?: number; MUSW__Fee_Formula__c?: string }>
): Promise<unknown[]> {
	if (!salesforceWritesEnabled()) {
		throw new Error('Salesforce writes are disabled. Set FEE_SYNC_SALESFORCE_WRITE_ENABLED=true only after approval controls are verified.');
	}
	if (updates.length === 0) return [];
	const results: unknown[] = [];
	for (let i = 0; i < updates.length; i += 200) {
		const batch = updates.slice(i, i + 200).map((record) => ({
			attributes: { type: 'MUSW__Master_Fee_List__c' },
			...record,
		}));
		const response = await sfFetch('/composite/sobjects', {
			method: 'PATCH',
			body: JSON.stringify({ allOrNone: true, records: batch }),
		});
		if (!response.ok) throw new Error(`Salesforce update failed (${response.status}): ${await response.text()}`);
		results.push(...await response.json() as unknown[]);
	}
	return results;
}

export async function verifyMasterFeeValues(
	expected: Array<{ Id: string; standardPrice?: number; formula?: string }>
): Promise<Array<{ Id: string; ok: boolean; actual?: SalesforceFee }>> {
	if (expected.length === 0) return [];
	const ids = expected.map((row) => `'${row.Id.replace(/'/g, "\\'")}'`).join(',');
	const soql = `SELECT Id,Name,MUSW__Template_Key__c,MUSW__Active__c,MUSW__Standard_Price__c,SSF_Code__c,MUSW__Fee_Calculation_Type__c,MUSW__Fee_Formula__c,LastModifiedDate FROM MUSW__Master_Fee_List__c WHERE Id IN (${ids})`;
	const response = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
	if (!response.ok) throw new Error(`Salesforce verification query failed (${response.status}): ${await response.text()}`);
	const payload = await response.json() as { records: SalesforceFee[] };
	const byId = new Map(payload.records.map((record) => [record.Id, record]));
	return expected.map((row) => {
		const actual = byId.get(row.Id);
		const priceOk = row.standardPrice === undefined || actual?.MUSW__Standard_Price__c === row.standardPrice;
		const formulaOk = row.formula === undefined || actual?.MUSW__Fee_Formula__c === row.formula;
		return { Id: row.Id, ok: Boolean(actual && priceOk && formulaOk), actual };
	});
}
