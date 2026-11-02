import { describe, expect, it } from 'vitest';
import { isSafeEvidenceUploadE2ESetup } from './evidence-upload-e2e-safety-v1.js';

const databaseUrl = 'postgres://scratch:scratch@127.0.0.1:55441/evidence_e2e_disposable';
const storageEndpoint = 'http://127.0.0.1:55442';

describe('evidence upload E2E target safety', () => {
	it('allows only the matching disposable PostgreSQL and object-store targets', () => {
		expect(isSafeEvidenceUploadE2ESetup({
			e2eDatabaseUrl: databaseUrl,
			applicationDatabaseUrl: databaseUrl,
			e2eStorageEndpoint: storageEndpoint,
			applicationStorageEndpoint: '127.0.0.1',
			applicationStoragePort: '55442',
		})).toBe(true);
	});

	it.each([
		{ e2eDatabaseUrl: undefined, applicationDatabaseUrl: databaseUrl },
		{ e2eDatabaseUrl: databaseUrl, applicationDatabaseUrl: 'postgres://app:secret@127.0.0.1:5434/legal_ai_db' },
		{ e2eDatabaseUrl: databaseUrl, applicationDatabaseUrl: databaseUrl, e2eStorageEndpoint: 'http://127.0.0.1:8333' },
		{ e2eDatabaseUrl: databaseUrl, applicationDatabaseUrl: databaseUrl, e2eStorageEndpoint: storageEndpoint, applicationStorageEndpoint: '127.0.0.1', applicationStoragePort: '8333' },
	])('rejects unsafe or mismatched targets', (input) => {
		expect(isSafeEvidenceUploadE2ESetup(input)).toBe(false);
	});
});
