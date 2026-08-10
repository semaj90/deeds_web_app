import { json, error, type RequestHandler } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { requireAdmin } from '$lib/server/auth-utils.js';
import { analyzePdfWithGraniteDocling } from '$lib/server/analysis/granite-docling.js';
import { compareFees, createManifest, parsePublishedFeesFromText, summarize } from '$lib/server/fee-sync/compare.js';
import { queryActiveMasterFees, salesforceConfigured, salesforceWritesEnabled, updateMasterFees, verifyMasterFeeValues } from '$lib/server/fee-sync/salesforce.js';
import type { FeeComparisonRow, FeeSyncManifest } from '$lib/server/fee-sync/types.js';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	return json({
		salesforceConfigured: salesforceConfigured(),
		writesEnabled: salesforceWritesEnabled(),
		mode: salesforceConfigured() ? 'salesforce' : 'offline',
	});
};

export const POST: RequestHandler = async (event) => {
	const user = requireAdmin(event);
	const form = await event.request.formData();
	const action = String(form.get('action') ?? 'analyze');

	if (action === 'analyze') {
		const pdf = form.get('pdf');
		if (!(pdf instanceof File)) throw error(400, 'PDF file is required');
		if (pdf.type !== 'application/pdf' && !pdf.name.toLowerCase().endsWith('.pdf')) throw error(400, 'Only PDF uploads are supported');
		const buffer = Buffer.from(await pdf.arrayBuffer());
		const sourceSha256 = createHash('sha256').update(buffer).digest('hex');
		const doc = await analyzePdfWithGraniteDocling(buffer, Number(process.env.FEE_SYNC_PDF_MAX_PAGES ?? 40));
		const published = parsePublishedFeesFromText(doc.fullText);
		const salesforce = salesforceConfigured() ? await queryActiveMasterFees() : [];
		const rows = salesforce.length ? compareFees(salesforce, published) : [];
		return json({
			sourceName: pdf.name,
			sourceSha256,
			pageCount: doc.pageCount,
			publishedCount: published.length,
			salesforceCount: salesforce.length,
			rows,
			summary: summarize(rows),
			warnings: [
				...(published.length === 0 ? ['No fee rows were extracted automatically; PDF layout requires review or a specialized extractor.'] : []),
				...(!salesforceConfigured() ? ['Salesforce is not configured; comparison is unavailable until server-side OAuth variables are set.'] : []),
			],
		});
	}

	if (action === 'approve') {
		const rowsJson = String(form.get('rows') ?? '[]');
		const rows = JSON.parse(rowsJson) as FeeComparisonRow[];
		if (rows.some((row) => row.status.startsWith('DUPLICATE'))) throw error(409, 'Cannot approve while duplicate identities exist');
		const approvedRows = rows.filter((row) => row.approved && row.changeRequired);
		if (approvedRows.length === 0) throw error(400, 'No changed rows were approved');
		const manifest = createManifest({
			fiscalYear: String(form.get('fiscalYear') ?? ''),
			sourceName: String(form.get('sourceName') ?? ''),
			sourceSha256: String(form.get('sourceSha256') ?? ''),
			createdAt: new Date().toISOString(),
			createdBy: user.email ?? user.id,
			environment: String(form.get('environment') ?? 'DEV'),
			rows: approvedRows,
		});
		return json({ manifest });
	}

	if (action === 'deploy') {
		if (!salesforceWritesEnabled()) throw error(403, 'Salesforce writes are disabled by server configuration');
		const manifest = JSON.parse(String(form.get('manifest') ?? '{}')) as FeeSyncManifest;
		const expectedHash = createManifest({
			fiscalYear: manifest.fiscalYear,
			sourceName: manifest.sourceName,
			sourceSha256: manifest.sourceSha256,
			createdAt: manifest.createdAt,
			createdBy: manifest.createdBy,
			environment: manifest.environment,
			rows: manifest.rows,
		}).hash;
		if (expectedHash !== manifest.hash) throw error(409, 'Manifest hash mismatch');
		if (manifest.environment.toUpperCase() !== 'DEV') throw error(403, 'Initial implementation only allows DEV deployment');

		const fresh = await queryActiveMasterFees();
		const byId = new Map(fresh.map((fee) => [fee.Id, fee]));
		for (const row of manifest.rows) {
			if (!row.salesforceId) throw error(409, `Missing Salesforce ID for ${row.canonicalKey}`);
			const current = byId.get(row.salesforceId);
			if (!current) throw error(409, `Salesforce target disappeared for ${row.canonicalKey}`);
			if (row.lastModifiedDate && current.LastModifiedDate !== row.lastModifiedDate) throw error(409, `SOURCE_DRIFT: ${row.canonicalKey} changed after review`);
		}

		const updates = manifest.rows.map((row) => {
			if (row.status !== 'CHANGED_FLAT' || typeof row.proposedValue !== 'number') {
				throw error(400, `V1 deployment only supports approved flat-fee updates: ${row.canonicalKey}`);
			}
			return { Id: row.salesforceId!, MUSW__Standard_Price__c: row.proposedValue };
		});
		const result = await updateMasterFees(updates);
		const verification = await verifyMasterFeeValues(updates.map((row) => ({ Id: row.Id, standardPrice: row.MUSW__Standard_Price__c })));
		return json({ result, verification, verified: verification.every((row) => row.ok) });
	}

	throw error(400, `Unknown fee-sync action: ${action}`);
};
