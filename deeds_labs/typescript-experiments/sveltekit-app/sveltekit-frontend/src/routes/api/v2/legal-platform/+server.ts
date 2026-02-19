import type { RequestHandler } from './$types.js';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/unified-client'; // Changed from default import to named import
import { cases, evidence, criminals, legalDocuments } from '$lib/server/db/schema-postgres';
import { eq, or, desc, ilike, and, SQL, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Go Microservice Configuration
const GO_SERVICES = {
	enhanced_rag: {
		url: 'http://localhost:8094', // Removed space
		endpoints: { health: '/api/health', gpu_compute: '/api/gpu/compute', som_train: '/api/som/train', xstate_event: '/api/xstate/event', websocket: '/ws' }
	},
	upload_service: {
		url: 'http://localhost:8093', // Removed space
		endpoints: { upload: '/upload', status: '/status', health: '/health' }
	},
	vector_service: {
		url: 'http://localhost:8095', // Removed space
		endpoints: { search: '/api/vector/search', similarity: '/api/vector/similarity' }
	},
	grpc_server: {
		url: 'http://localhost:50051', // Removed space
		protocols: ['grpc', 'http']
	},
	load_balancer: {
		url: 'http://localhost:8224', // Removed space
		endpoints: { health: '/health', metrics: '/metrics' }
	}
};

// Request Types
export interface LegalPlatformRequest {
	action: 'create' | 'read' | 'update' | 'delete' | 'search' | 'process' | 'analyze' | 'health'; // Added 'health' action
	entity: 'case' | 'evidence' | 'criminal' | 'document' | 'search' | 'upload' | 'ai';
	data?: any; // Corrected syntax
	id?: string;
	filters?: { [key: string]: any }; // Corrected syntax
	query?: string; // Added for search operations
}

// Utility function to call Go microservices
async function callGoService(
	service: keyof typeof GO_SERVICES, // Corrected parameter syntax
	endpoint: string,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
	data?: unknown
): Promise<any> {
	const serviceConfig = GO_SERVICES[service];
	const url = `${serviceConfig.url}${endpoint}`;
	try {
		const response = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' }, // Corrected syntax
			body: data ? JSON.stringify(data) : undefined
		});
		if (!response.ok) {
			throw new Error(`Service ${service} returned ${response.status}: ${response.statusText}`);
		}
		return await response.json();
	} catch (err: unknown) { // Corrected catch block syntax
		console.error(`Error calling ${service} service: `, err);
		throw new Error(`Failed to communicate with ${service} service`);
	}
}

export const POST: RequestHandler = async ({ request, url: _url }) => { // Renamed 'url' to '_url'
	try {
		const req: LegalPlatformRequest = await request.json();

		// Handle health check
		if (req.action === 'health') { // Removed 'as any'
			let dbHealthy = false;
			try {
				// Simple query to check database connectivity
				await db.execute(sql`SELECT 1`);
				dbHealthy = true;
			} catch (_e) { // Renamed 'e' to '_e'
				console.error('Database health check failed: ', _e);
				dbHealthy = false;
			}

			const healthChecks = await Promise.allSettled([
				callGoService('enhanced_rag', '/api/health'),
				callGoService('upload_service', '/health')
			]);

			const services = {
				enhanced_rag: healthChecks[0].status === 'fulfilled',
				upload_service: healthChecks[1].status === 'fulfilled',
				database: dbHealthy
			};

			return json({ success: true, data: { services }, timestamp: new Date().toISOString(), message: 'Health check completed' }); // Removed extra ''
		}

		// Route based on entity and action
		switch (req.entity) {
			case 'case':
				return await handleCaseOperations(req);
			case 'evidence':
				return await handleEvidenceOperations(req);
			case 'criminal':
				return await handleCriminalOperations(req);
			case 'document':
				return await handleDocumentOperations(req);
			case 'search':
				return await handleSearchOperations(req);
			case 'upload':
				return await handleUploadOperations(req);
			case 'ai':
				return await handleAIOperations(req);
			default:
				throw error(400, `Unknown entity: ${req.entity}`);
		}
	} catch (err: unknown) { // Corrected catch block syntax
		console.error('API Error: ', err);
		throw error(500, err instanceof Error ? err.message : 'Internal server error');
	}
}; // Removed extra '}'

export const GET: RequestHandler = async ({ url }) => { // Corrected function signature
	const action = url.searchParams.get('action');
	const entity = url.searchParams.get('entity');
	const id = url.searchParams.get('id');
	const query = url.searchParams.get('query'); // Added query for GET search

	if (!action || !entity) {
		throw error(400, 'Missing required parameters, action and entity');
	}

	const req: LegalPlatformRequest = {
		action: action as LegalPlatformRequest['action'], // Corrected type assertion
		entity: entity as LegalPlatformRequest['entity'], // Corrected type assertion
		id: id || undefined,
		query: query || undefined // Added query
	};

	// Construct a new Request object to pass to the POST handler
	return await POST({
		request: new Request(url.origin + url.pathname, {
			method: 'POST',
			body: JSON.stringify(req),
			headers: { 'Content-Type': 'application/json' }
		}),
		url
	} as any); // Cast to any to satisfy RequestHandler type, as we're simulating a POST request
};

// Case Management Operations
async function handleCaseOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	switch (req.action) {
		case 'create': {
			const newCase = await db
				.insert(cases)
				.values({
					id: createId(), // Corrected syntax
					caseNumber: `CASE-${Date.now()}`,
					title: req.data.title || req.data.name, // Corrected syntax
					description: req.data.description, // Corrected syntax
					priority: req.data.priority || 'medium', // Corrected syntax
					status: 'open',
					incidentDate: req.data.incidentDate ? new Date(req.data.incidentDate) : undefined, // Corrected syntax
					location: req.data.location, // Corrected syntax
					userId: req.data.userId, // Corrected syntax
					createdBy: req.data.createdBy || req.data.userId, // Corrected syntax
					createdAt: new Date(),
					updatedAt: new Date()
				})
				.returning();
			return json({ success: true, data: newCase[0], message: 'Case created successfully' }); // Removed extra ''
		}
		case 'read': {
			if (req.id) {
				const caseData = await db.select().from(cases).where(eq(cases.id, req.id));
				if (caseData.length === 0) {
					throw error(404, 'Case not found');
				}
				return json({ success: true, data: caseData[0] });
			} else {
				const allCases = await db.select().from(cases).orderBy(desc(cases.createdAt)).limit(50);
				return json({ success: true, data: allCases });
			}
		}
		case 'update': {
			if (!req.id) throw error(400, 'Case ID required for update');
			const updatedCase = await db
				.update(cases)
				.set({ ...req.data, updatedAt: new Date() }) // Corrected syntax
				.where(eq(cases.id, req.id))
				.returning();
			return json({ success: true, data: updatedCase[0], message: 'Case updated successfully' }); // Removed extra ''
		}
		case 'delete': {
			if (!req.id) throw error(400, 'Case ID required for deletion');
			await db.delete(cases).where(eq(cases.id, req.id));
			return json({ success: true, message: 'Case deleted successfully' }); // Removed extra ''
		}
		case 'search': {
			const searchResults = await db
				.select()
				.from(cases)
				.where(
					or(
						ilike(cases.title, `%${req.data.query}%`), // Corrected ilike usage
						ilike(cases.description, `%${req.data.query}%`), // Corrected ilike usage
						ilike(cases.caseNumber, `%${req.data.query}%`) // Corrected ilike usage
					)
				)
				.limit(20);
			return json({ success: true, data: searchResults });
		}
		default:
			throw error(400, `Unknown case action: ${req.action}`);
	}
}

// Evidence Management Operations
async function handleEvidenceOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	switch (req.action) {
		case 'create': {
			const newEvidence = await db
				.insert(evidence)
				.values({
					id: createId(), // Corrected syntax
					caseId: req.data.caseId,
					title: req.data.title, // Corrected syntax
					description: req.data.description, // Corrected syntax
					evidenceType: req.data.evidenceType, // Corrected syntax
					fileUrl: req.data.fileUrl, // Corrected syntax
					fileName: req.data.fileName, // Corrected syntax
					fileSize: req.data.fileSize, // Corrected syntax
					mimeType: req.data.mimeType, // Corrected syntax
					tags: req.data.tags || [], // Corrected syntax
					uploadedBy: req.data.userId, // Corrected syntax
					uploadedAt: new Date(), // Corrected syntax
					updatedAt: new Date()
				})
				.returning();
			return json({ success: true, data: newEvidence[0], message: 'Evidence created successfully' }); // Removed extra ''
		}
		case 'read': {
			if (req.id) {
				const evidenceData = await db.select().from(evidence).where(eq(evidence.id, req.id));
				if (evidenceData.length === 0) {
					throw error(404, 'Evidence not found');
				}
				return json({ success: true, data: evidenceData[0] });
			} else {
				const filters = req.filters || {};
				const whereClauses: SQL[] = [];
				if (filters.caseId) {
					whereClauses.push(eq(evidence.caseId, filters.caseId));
				}
				const allEvidence = await db
					.select()
					.from(evidence)
					.where(whereClauses.length ? and(...whereClauses) : undefined)
					.orderBy(desc(evidence.uploadedAt))
					.limit(50);
				return json({ success: true, data: allEvidence });
			}
		}
		case 'analyze': {
			// Call enhanced RAG service for AI analysis
			const analysisResult = await callGoService('enhanced_rag', '/api/gpu/compute', 'POST', {
				type: 'evidence_analysis',
				evidenceId: req.id, // Corrected syntax
				data: req.data // Corrected syntax
			});
			return json({ success: true, data: analysisResult, message: 'Evidence analysis completed' }); // Removed extra ''
		}
		default:
			throw error(400, `Unknown evidence action: ${req.action}`);
	}
}

// Criminal Records Operations
async function handleCriminalOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	switch (req.action) {
		case 'create': {
			const newCriminal = await db
				.insert(criminals)
				.values({
					id: createId(), // Corrected syntax
					firstName: req.data.firstName,
					lastName: req.data.lastName, // Corrected syntax
					aliases: req.data.aliases || [], // Corrected syntax
					dateOfBirth: req.data.dateOfBirth ? new Date(req.data.dateOfBirth) : undefined, // Corrected syntax
					gender: req.data.gender, // Corrected syntax
					height: req.data.height, // Corrected syntax
					weight: req.data.weight, // Corrected syntax
					eyeColor: req.data.eyeColor, // Corrected syntax
					hairColor: req.data.hairColor, // Corrected syntax
					createdBy: req.data.createdBy || req.data.userId, // Corrected syntax
					createdAt: new Date(), // Corrected syntax
					updatedAt: new Date()
				})
				.returning();
			return json({ success: true, data: newCriminal[0], message: 'Criminal record created successfully' }); // Removed extra ''
		}
		case 'read': {
			if (req.id) {
				const criminalData = await db.select().from(criminals).where(eq(criminals.id, req.id));
				if (criminalData.length === 0) {
					throw error(404, 'Criminal not found');
				}
				return json({ success: true, data: criminalData[0] });
			} else {
				const allCriminals = await db.select().from(criminals).orderBy(desc(criminals.createdAt)).limit(50);
				return json({ success: true, data: allCriminals });
			}
		}
		default:
			throw error(400, `Unknown criminal action: ${req.action}`);
	}
}

// Document Operations
async function handleDocumentOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	switch (req.action) {
		case 'create': {
			const newDocument = await db
				.insert(legalDocuments)
				.values({
					id: createId(), // Corrected syntax
					caseId: req.data.caseId,
					userId: req.data.userId, // Corrected syntax
					title: req.data.title, // Corrected syntax
					content: req.data.content, // Corrected syntax
					documentType: req.data.documentType || 'brief', // Corrected syntax
					status: 'draft',
					version: 1,
					wordCount: req.data.content ? req.data.content.split(' ').length : 0,
					createdAt: new Date(),
					updatedAt: new Date()
				})
				.returning();
			return json({ success: true, data: newDocument[0], message: 'Document created successfully' }); // Removed extra ''
		}
		case 'read': {
			if (req.id) {
				const documentData = await db.select().from(legalDocuments).where(eq(legalDocuments.id, req.id));
				if (documentData.length === 0) {
					throw error(404, 'Document not found');
				}
				return json({ success: true, data: documentData[0] });
			} else {
				const filters = req.filters || {};
				const whereClauses: SQL[] = [];
				if (filters.caseId) {
					whereClauses.push(eq(legalDocuments.caseId, filters.caseId));
				}
				const allDocuments = await db
					.select()
					.from(legalDocuments)
					.where(whereClauses.length ? and(...whereClauses) : undefined)
					.orderBy(desc(legalDocuments.createdAt))
					.limit(50);
				return json({ success: true, data: allDocuments });
			}
		}
		default:
			throw error(400, `Unknown document action: ${req.action}`);
	}
}

// Search Operations (Vector + Traditional)
async function handleSearchOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	const { query, type = 'semantic', limit = 10 } = req.data; // Corrected destructuring
	try {
		// Call enhanced RAG service for semantic search
		const searchResults = await callGoService('enhanced_rag', '/api/gpu/compute', 'POST', {
			type: 'vector_similarity',
			query,
			search_type: type,
			limit
		});
		return json({ success: true, data: searchResults, message: 'Search completed successfully' }); // Removed extra ''
	} catch (err: unknown) { // Corrected catch block syntax
		console.error('Vector search failed, falling back to database search:', err); // Log the error
		// Fallback to traditional database search
		const fallbackResults = await db
			.select()
			.from(cases)
			.where(or(ilike(cases.title, `%${query}%`), ilike(cases.description, `%${query}%`)))
			.limit(limit);
		return json({ success: true, data: fallbackResults, message: 'Search completed (database fallback)', fallback: true }); // Removed extra ''
	}
}

// Upload Operations
async function handleUploadOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	try {
		const uploadResult = await callGoService('upload_service', '/upload', 'POST', req.data);
		return json({ success: true, data: uploadResult, message: 'Upload processed successfully' }); // Removed extra ''
	} catch (err: unknown) { // Corrected catch block syntax
		throw error(500, `Upload service error: ${err instanceof Error ? err.message : 'Unknown error'}`); // Corrected template literal and removed extra '`'
	}
} // Removed extra '}'

// AI Operations (Enhanced RAG, GPU Compute, SOM Training)
async function handleAIOperations(req: LegalPlatformRequest): Promise<Response> { // Corrected function signature
	const { operation, data } = req.data;
	try {
		let result: any; // Explicitly typed 'result' as 'any'
		switch (operation) {
			case 'chat':
			case 'analyze':
			case 'summarize':
				result = await callGoService('enhanced_rag', '/api/gpu/compute', 'POST', { type: operation, ...data }); // Corrected syntax
				break;
			case 'train_som':
				result = await callGoService('enhanced_rag', '/api/som/train', 'POST', data);
				break;
			case 'xstate_event':
				result = await callGoService('enhanced_rag', '/api/xstate/event', 'POST', data);
				break;
			default:
				throw error(400, `Unknown AI operation: ${operation}`);
		}
		return json({ success: true, data: result, message: `AI operation ${operation} completed successfully` }); // Corrected template literal and removed extra ''
	} catch (err: unknown) { // Corrected catch block syntax
		throw error(500, `AI service error: ${err instanceof Error ? err.message : 'Unknown error'}`); // Corrected template literal and removed extra '`'
	}
} // Removed extra '}'

// Health Check endpoint
export const OPTIONS: RequestHandler = async () => {
	let dbHealthy = false; // Changed from $state<boolean>(false)
	try {
		// Simple query to check database connectivity
		await db.execute(sql`SELECT 1`);
		dbHealthy = true;
	} catch (_e) { // Renamed 'e' to '_e'
		console.error('Database health check failed: ', _e);
		dbHealthy = false;
	}

	const healthChecks = await Promise.allSettled([
		callGoService('enhanced_rag', '/api/health'),
		callGoService('upload_service', '/health')
	]);

	const services = {
		enhanced_rag: healthChecks[0].status === 'fulfilled',
		upload_service: healthChecks[1].status === 'fulfilled',
		database: dbHealthy
	};

	return json({ success: true, services, timestamp: new Date().toISOString(), message: 'Health check completed' }); // Corrected syntax and removed extra ''
};