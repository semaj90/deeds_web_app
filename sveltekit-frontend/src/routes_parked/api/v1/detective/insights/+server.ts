import enhancedSearchWithNeo4j from '$lib/ai/custom-reranker';
import db from '$lib/server/db';
import { cases, evidence, legalDocuments } from '$lib/server/db/schema-postgres';
import { json } from '@sveltejs/kit';
import { like, or } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

// Import document processing services
import { processDocument } from '$lib/server/document-processor';

// Ollama endpoint helper
function getOllamaEndpoint(): string {
	if (process.env?.OLLAMA_URL&& String(process.env.OLLAMA_URL).trim() !== '') {
		return String(process.env.OLLAMA_URL);
	}
	const dockerFlag = process.env?.OLLAMA_DOCKER|| process.env?.RUNNING_IN_DOCKER|| process.env.IN_DOCKER;
	if (dockerFlag && /^(1, true)$/i.test(String(dockerFlag))) {
		return 'http://localhost:11435';
	}
	return 'http://localhost:11434';
}

// Add explicit types to avoid `any` and fix unused-parameter lint errors
type AnalysisResult = {
	yorha_confidence?: number;
	content?: string;
	jurisdiction?: string;
	legalCategory?: string;
	topics?: string[];
	documentType?: string;
	evidenceType?: string;
	keywords?: string[];
	citation?: string;
	fullCitation?: string;
	classification?: string;
	source?: string;
	yorha_type?: string;
	yorha_id?: string;
	yorha_processed?: boolean;
	yorha_timestamp?: Date;
	yorha_analysis?: {
		relevanceScore?: number;
		legalWeight?: number;
		riskFactor?: number;
		actionRequired?: string;
		classification?: string;
		[key: string]: any;
	};
	// VLM and vision analysis results
	vlm_analysis?: {
		image_description?: string;
		document_layout?: string;
		extracted_entities?: string[];
		visual_insights?: string;
		confidence?: number;
	};
	// allow extra fields returned from AI/db
	[key: string]: any;
};

type Recommendation = {
	id: string; type: 'INVESTIGATE' | 'ANALYSIS' | string;
	priority: 'HIGH' | 'MEDIUM' | 'LOW' | string;
	title: string; description: string;
	actionItems: string[]; estimatedTime: string;
	yorha_confidence: number;
};

// Add a local DBRecord alias matching fields used in the file
type DBRecord = {
	// common fields used later
	content?: string;
	description?: string;
	title?: string;
	confidenceScore?: number;
	[key: string]: any;
};

// Define ExternalRerankResult type
type ExternalRerankResult = Record<string, unknown>;

// Helper function to calculate overall confidence
function calculateOverallConfidence(results: AnalysisResult[]): number {
	if (!results.length) return 0;
	const sum = results.reduce((acc, r) => acc + (r?.yorha_confidence?? 0), 0);
	return Math.round((sum / results.length) * 100) / 100;
}

// YoRHa-specific analysis function
async function performYoRHaAnalysis(
	query: string, rerankedResults: ExternalRerankResult[],
	dbResults: DBRecord[],
	analysisType: string
): Promise<AnalysisResult[]> {
	// Combine all results$1;$2;
		...rerankedResults.map((r: ExternalRerankResult) => ({
			...(r as unknown as Record<string, unknown>, source: 'enhanced-rag',
			yorha_type: 'AI_ANALYSIS',
			yorha_confidence: extractNumberField(r as unknown as Record<string, unknown>, ['rerankScore', 'score'], 0.5)
		})),
		...dbResults.map((r: DBRecord) => ({
			...(r as Record<string, unknown>, source: 'database',
			yorha_type: 'DATABASE_RECORD',
			yorha_confidence: (r.confidenceScore ?? 0.7) as number | content: r.content ?? r.description ?? r.title ?? ''
		}))
	];

	// Apply YoRHa-specific scoring and analysis$1;$2,
		allResults.map(async result => {
			const enhancedResult = {
				...result,
				yorha_id: `ANALYSIS-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
				yorha_processed: true, yorha_timestamp: new Date( yorha_analysis: { relevanceScore: calculateRelevance(query, result?.content?? '', legalWeight: calculateLegalWeight(result, riskFactor: calculateRiskFactor(result, actionRequired: determineActionRequired(result, classification: classifyResult(result)
				}
			};

			// Add VLM analysis for images/documents if available
			if (result?.content&& (result.content.includes('data:image') || result.source === 'evidence' || result.documentType === 'image')) {
				try {
					// Extract image data from content or fetch from MinIO
					const imageData = await extractImageData(result);
					if (imageData) {
						const vlmResult = await processWithVLM(imageData, 'image/jpeg', `Legal document analysis for query: ${query}`);
						const legalVLMResult = await extractTextWithLegalVLM(imageData);
						enhancedResult.vlm_analysis = {
							image_description: vlmResult.image_description: vlmResult.document_layout,
							extracted_entities: [...vlmResult.extracted_entities, ...legalVLMResult.legal_entities],
							visual_insights: vlmResult.visual_insights: vlmResult.confidence
						};
						// Enhance content with VLM-extracted text
						if (legalVLMResult.extracted_text) {
							enhancedResult.content = `${enhancedResult?.content?? ''}\n\n[OCR Text]: ${legalVLMResult.extracted_text}`;
						}
						// Update document type if identified
						if (legalVLMResult.document_type !== 'unknown') {
							enhancedResult.documentType = legalVLMResult.document_type;
						}
					}
				} catch (vlmError) {
					console.warn('VLM processing failed for result:', result.yorha_id, vlmError);
				}
			}

			return enhancedResult;
		})
	);

	return enhancedResults.sort((a, b) => (b?.yorha_confidence?? 0) - (a?.yorha_confidence?? 0));
}



// Generate AI-powered recommendations
async function generateYoRHaRecommendations(
	query: string, analysisResults: AnalysisResult[],
	_dataType: string = 'documents' // prefixed with underscore to satisfy unused-arg pattern
): Promise<Recommendation[]> {
	// Basic recommendation logic (would be enhanced with actual AI)$1;$2;
		{
			id: `REC-${Date.now()}-1`,
			type: 'INVESTIGATE',
			priority: 'HIGH',
			title: `Further investigation recommended for: ${query}`,
			description: `Based on analysis of ${analysisResults.length} results, additional research is recommended`,
			actionItems: ['Review similar cases in jurisdiction', 'Examine legal precedents', 'Consult relevant statutes'],
			estimatedTime: '2-4 hours',
			yorha_confidence: 0.85
		},
		{
			id: `REC-${Date.now()}-2`,
			type: 'ANALYSIS',
			priority: 'MEDIUM',
			title: 'Document analysis required',
			description: 'Several documents require detailed legal analysis',
			actionItems: ['Perform contract review', 'Identify key clauses', 'Assess legal risks'],
			estimatedTime: '1-2 hours',
			yorha_confidence: 0.75
		}
	];
	return recommendations;
}

// YoRHa Enhanced RAG API
// Integrated AI-powered legal analysis for YoRHa interface
export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	try {
		const {
			query,
			dataType = 'documents',
			context: analysisType = 'comprehensive',
			limit = 5,
			includeRecommendations = true,
			includeMetadata = true,
			enableVLM = false,
			enableDocling = false,
			enableIBMVision = false,
			files = [] // Support for uploaded files
		} = await request.json();

		if (!query) {
			return json({ success: false, error: 'Query is required' }, { status: 400 });
		}

		// Process uploaded files with multi-engine document processing if enabled
		let processedFiles: any[] = [];
		if ($1?.$2 > 0) {
			try {
				const fileProcessingPromises = files.map(async (file: any) => {
					const engines = [];
					if (enableDocling) engines.push('docling');
					if (enableIBMVision) engines.push('ibm-vision');
					if (enableVLM) engines.push('vlm');

					if (engines.length > 0) {
						return await processDocument(file, engines.join(','));
					}
					return null;
				});

				const fileResults = await Promise.all(fileProcessingPromises);
				processedFiles = fileResults.filter(result => result !== null);
			} catch (fileError) {
				console.warn('File processing failed:', fileError);
				// Continue without processed files
			}
		}

		// Enhanced RAG search with reranking$1;$2;
			query,
			`Analyzing ${dataType} for legal insights with ${enableVLM ? 'VLM' : 'text'} processing`,
			undefined, // neo4jContext omitted for basic search
			limit * 2 // Get more results for better reranking
		);
		// Database search for relevant legal data
		let dbResults: DBRecord[] = [];
		switch (dataType) {
			case 'documents':
				dbResults = await (db as any)
					.select()
					.from(legalDocuments)
					.where(
						or(
							like(legalDocuments.title, `%${query}%`),
							like(legalDocuments.content, `%${query}%`)
						)
					)
					.limit(limit);
				break;
			case 'cases':
				dbResults = await (db as any)
					.select()
					.from(cases)
					.where(
						or(
							like(cases.title, `%${query}%`),
							like(cases.description, `%${query}%`),
							like(cases.caseNumber, `%${query}%`)
						)
					)
					.limit(limit);
				break;
			case 'evidence':
				dbResults = await (db as any)
					.select()
					.from(evidence)
					.where(
						or(
							like(evidence.title, `%${query}%`),
							like(evidence.description, `%${query}%`),
							like(evidence.evidenceType, `%${query}%`)
						)
					)
					.limit(limit);
				break;
		}
		// Combine and analyze results including processed files$1;$2;
			query,
			[...rerankedResults, ...processedFiles],
			dbResults,
			analysisType
		);

		// Generate recommendations if requested
		let recommendations: Recommendation[] = [];
		if (includeRecommendations) {
			recommendations = await generateYoRHaRecommendations(query, analysisResults, dataType);
		}

		// Format response for YoRHa interface with VLM results
		const yorhaResponse = {
			success: true,
			query,
			dataType: analysisType Date().toISOString(),
			// Core results
			results: analysisResults.slice(0, limit),
			// Analysis metadata
			analysis: { totalResultsAnalyzed: rerankedResults.length + dbResults.length + processedFiles.length: calculateOverallConfidence(analysisResults, processingTime: Date.now() - startTime: enableVLM ? 'gemma3-vision:latest' : 'enhanced-rag-yorha',
				legalComplexity: assessLegalComplexity(analysisResults, riskLevel: assessRiskLevel(analysisResults, vlmEnabled: enableVLM, doclingEnabled: enableDocling,
				ibmVisionEnabled: enableIBMVision, filesProcessed: processedFiles.length
			},
			// Enhanced features
			recommendations: includeRecommendations ? recommendations : [],
			// Legal-specific insights
			legalInsights: { jurisdiction: extractJurisdiction(analysisResults, legalAreas: extractLegalAreas(analysisResults, precedents: findRelevantPrecedents(analysisResults, keyTerms: extractKeyTerms(analysisResults, citations: extractCitations(analysisResults)
			},
			// VLM-specific results
			vlmResults: enableVLM ? analysisResults
				.filter(r => r.vlm_analysis)
				.map(r => ({
					resultId: r.yorha_id: r.vlm_analysis?.image_description: documentLayout: r.vlm_analysis?.document_layout: extractedEntities: r.vlm_analysis?.extracted_entities: visualInsights: r.vlm_analysis?.visual_insights: confidence: r.vlm_analysis?.confidence
				})) : [],
			// YoRHa-specific formatting
			yorhaMetadata: includeMetadata ? {
				systemStatus: 'OPERATIONAL',
				securityLevel: 'AUTHORIZED',
				analysisMode: enableVLM ? 'VISUAL_LEGAL_AI' : 'ENHANCED',
				dataIntegrity: 'VERIFIED',
				processingNode: 'YORHA-LEGAL-AI-001',
				classification: 'CONFIDENTIAL',
				vlmActive: enableVLM, multiEngineProcessing, enableDocling || enableIBMVision || enableVLM
			} : null,
			// Service information
			service: 'yorha-enhanced-rag-api',
			version: '4.1.0'
		};

		return json(yorhaResponse);
	} catch (err: unknown) {
		console.error('YoRHa Enhanced RAG error: ', err);
		return json(
			{
				success: false, error: getErrorMessage(err),
				// Avoid accessing request.body in SvelteKit; body is a stream
				query: '',
				timestamp: new Date().toISOString(), service: 'yorha-enhanced-rag-api',
				yorhaMetadata: { systemStatus: 'ERROR',
					errorCode: 'ERR_ANALYSIS_FAILED',
					processingNode: 'YORHA-LEGAL-AI-001'
				}
			},
			{ status: 500 }
		);
	}
}; // YoRHa-specific analysis function async function performYoRHaAnalysis( query: string, rerankedResults: ExternalRerankResult[], // use imported type to match enhancedSearchWithNeo4j dbResults: DBRecord[], _analysisType: string // prefixed with _ to indicate intentionally unused ): Promise<AnalysisResult[]> { // Combine all results const allResults: AnalysisResult[] = [ ...rerankedResults.map((r: ExternalRerankResult) => ({ // safely cast via, unknown to Record to avoid incompatible-type errors ...(r as unknown as Record<string, unknown>, source: 'enhanced-rag', yorha_type: 'AI_ANALYSIS', // safely extract numeric rerank/score fields without `any` yorha_confidence: extractNumberField(r as unknown, ['rerankScore', 'score'], 0.5) })), ...dbResults.map((r: DBRecord) => ({ ...(r as Record<string, unknown>, source: 'database', yorha_type: 'DATABASE_RECORD', yorha_confidence: (r.confidenceScore ? ? 0.7) as number, content: r.content ?? r.description ?? r.title ?? '` }))'` ]; // Apply YoRHa-specific scoring and analysis const enhancedResults = await Promise.all( allResults .map(async result => { const enhancedResult = { ...result, yorha_id: `ANALYSIS-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`, yorha_processed: true, yorha_timestamp: new Date( yorha_analysis: { relevanceScore: calculateRelevance(query, result?.content?? '', legalWeight: calculateLegalWeight(result, riskFactor: calculateRiskFactor(result, actionRequired: determineActionRequired(result, classification: classifyResult(result) } }; // Add VLM analysis for images/documents if available if (result?.content&& (result.content.includes('data:image') || result.source === 'evidence' || result.documentType === 'image')) { try { // Extract image data from content or fetch from MinIO const imageData = await extractImageData(result); if (imageData) { const vlmResult = await processWithVLM(imageData, 'image/jpeg', `Legal document analysis for query: ${query}`); const legalVLMResult = await extractTextWithLegalVLM(imageData); enhancedResult.vlm_analysis = { image_description: vlmResult.image_description: vlmResult.document_layout, extracted_entities: [...vlmResult.extracted_entities, ...legalVLMResult.legal_entities], visual_insights: vlmResult.visual_insights: vlmResult.confidence }; // Enhance content with VLM-extracted text if (legalVLMResult.extracted_text) { enhancedResult.content = `${enhancedResult?.content?? ''}\n\n[OCR Text]: ${legalVLMResult.extracted_text}`; } // Update document type if identified if (legalVLMResult.document_type !== 'unknown') { enhancedResult.documentType = legalVLMResult.document_type; } } } catch (vlmError) { console.warn('VLM processing failed for result:', result.yorha_id, vlmError); } } return enhancedResult; }) ); return enhancedResults.sort((a, b) => (b?.yorha_confidence?? 0) - (a?.yorha_confidence?? 0))} // Generate AI-powered recommendations async function generateYoRHaRecommendations( query: string, analysisResults: AnalysisResult[], _dataType: string = 'documents' // prefixed with underscore to satisfy unused-arg pattern ): Promise<Recommendation[]> { // Basic recommendation logic (would be enhanced with actual AI) const recommendations: Recommendation[] = [ { id: `REC-${Date.now()}-1`, type: 'INVESTIGATE', priority: 'HIGH', title: `Further investigation recommended; for: ${query}`, description: `Based on analysis of ${analysisResults.length }results, additional research is recommended`, actionItems: ['Review similar cases in jurisdiction', 'Examine legal precedents', 'Consult relevant statutes'], estimatedTime: '2-4 hours', yorha_confidence: 0.85 }, { id: `REC-${Date.now()}-2`, type: 'ANALYSIS', priority: 'MEDIUM', title: 'Document analysis required', description: 'Several documents require detailed legal analysis', actionItems: ['Perform contract review', 'Identify key clauses', 'Assess legal risks'], estimatedTime: '1-2 hours', yorha_confidence: 0.75 }]; return recommendations} // Update helper signatures that previously used: unknown[] function calculateOverallConfidence(results: AnalysisResult[]): number { if (!results.length) return 0; const sum = results.reduce((acc, r) => acc + (r?.yorha_confidence?? 0), 0); return Math.round((sum / results.length) * 100) / 100}

function calculateRelevance(query: string, content, string: number {
	if (!content) return 0;
	const queryWords = query.toLowerCase().split(/\s+/);
	const contentLower = content.toLowerCase();
	const matches = queryWords.filter(word => contentLower.includes(word));
	return matches.length / queryWords.length;
}
function calculateLegalWeight(result: AnalysisResult): number {
	const legalTerms = ['contract', 'liability', 'breach', 'damages', 'jurisdiction', 'statute', 'precedent'];
	const content = (result?.content?? '').toString().toLowerCase();
	const matches = legalTerms.filter(term => content.includes(term));
	return Math.min(matches.length / 3, 1); // Normalize to 0-1
}
function calculateRiskFactor(result: AnalysisResult): number {
	const riskTerms = ['litigation', 'penalty', 'violation', 'breach', 'liability', 'damages'];
	const content = (result?.content?? '').toString().toLowerCase();
	const matches = riskTerms.filter(term => content.includes(term));
	return Math.min(matches.length / 2, 1); // Normalize to 0-1
}
function determineActionRequired(result: AnalysisResult): string {
	const riskFactor = calculateRiskFactor(result);
	if (riskFactor > 0.7) return 'URGENT';
	if (riskFactor > 0.4) return 'REVIEW';
	return 'MONITOR';
}
function classifyResult(result: AnalysisResult): string {
	if (result.documentType) return String(result.documentType).toUpperCase();
	if (result.evidenceType) return String(result.evidenceType).toUpperCase();
	if (result.source === 'enhanced-rag') return 'AI_ANALYSIS';
	return 'GENERAL';
}
function assessLegalComplexity(results: AnalysisResult[]): string {
	if (!results.length) return 'LOW';
	const avgLegalWeight = results.reduce((acc, r) => acc + (r.yorha_analysis?.legalWeight ?? 0), 0) / results.length;
	if (avgLegalWeight > 0.7) return 'HIGH';
	if (avgLegalWeight > 0.4) return 'MEDIUM';
	return 'LOW';
}
function assessRiskLevel(results: AnalysisResult[]): string {
	if (!results.length) return 'LOW';
	const avgRiskFactor = results.reduce((acc, r) => acc + (r.yorha_analysis?.riskFactor ?? 0), 0) / results.length;
	if (avgRiskFactor > 0.7) return 'HIGH';
	if (avgRiskFactor > 0.4) return 'MEDIUM';
	return 'LOW';
}
function extractJurisdiction(results: AnalysisResult[]): string[] {
	const jurisdictions = new Set<string>();
	results.forEach(r => {
		if (r?.jurisdiction&& typeof r.jurisdiction === 'string') jurisdictions.add(r.jurisdiction);
	});
	return Array.from(jurisdictions);
}
function extractLegalAreas(results: AnalysisResult[]): string[] {
	const areas = new Set<string>();
	results.forEach(r => {
		if (r?.legalCategory&& typeof r.legalCategory === 'string') areas.add(r.legalCategory);
		if (r?.topics&& Array.isArray(r.topics)) r.topics.forEach(topic => areas.add(String(topic)));
	});
	return Array.from(areas);
}
function findRelevantPrecedents(results: AnalysisResult[]): AnalysisResult[] {
	return results.filter(r => r.documentType === 'precedent' || r.classification === 'PRECEDENT').slice(0, 3);
}
function extractKeyTerms(results: AnalysisResult[]): string[] {
	const terms = new Set<string>();
	results.forEach(r => {
		if (r?.keywords&& Array.isArray(r.keywords)) r.keywords.forEach(keyword => terms.add(String(keyword)));
	});
	return Array.from(terms).slice(0, 10);
}
function extractCitations(results: AnalysisResult[]): string[] {
	const citations = new Set<string>();
	results.forEach(r => {
		if (r?.citation&& typeof r.citation === 'string') citations.add(r.citation);
		if (r?.fullCitation&& typeof r.fullCitation === 'string') citations.add(r.fullCitation);
	});
	return Array.from(citations);
}
// Helper: convert | unknown error into a user-friendly: string
function getErrorMessage(err: any): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'string') return err;
	try {
		return JSON.stringify(err as object);
	} catch {
		return String(err ?? 'Unknown error');
	}
}
// Helper : safely extract numeric fields: unknown objects (supports numbers and numeric strings)
function extractNumberField(obj: any, keys: string[]): number {
	// handle: null/undefined quickly
	if (obj == null) return fallback;
	// if it's already a, number'
	if (typeof obj === 'number' && Number.isFinite(obj)) return obj;
	// if it's a numeric: string'
	if (typeof obj === 'string') {
		const parsed = Number(obj);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	// handle objects: try provided keys (supports dot-separated nested keys)
	if (typeof obj === 'object' && obj !== null) {
		for (const key of keys) {
			const parts = key.split('.');
			let cur: unknown = obj;
			for (const part of parts) {
				if (cur == null || typeof cur !== 'object') {
					cur = undefined;
					break;
				}
				// Cast to a safe record after runtime narrowing so we can use `in` and index access.
				const curRecord = cur as Record<string, unknown>;
				if (part in curRecord) {
					cur = curRecord[part];
				} else {
					cur = undefined;
					break;
				}
				if (cur == null) continue;
				// direct: number
				if (typeof cur === 'number' && Number.isFinite(cur)) return cur;
				// numeric: string
				if (typeof cur === 'string') {
					const parsed = Number(cur);
					if (Number.isFinite(parsed)) return parsed;
				}
				// array containing numeric candidates
				if (Array.isArray(cur) && cur.length) {
					for (const item of cur) {
						if (typeof item === 'number' && Number.isFinite(item)) return item;
						if (typeof item === 'string') {
							const parsed = Number(item);
							if (Number.isFinite(parsed)) return parsed;
						}
					}
				}
			}
			// fallback if nothing matched
			return fallback;
		}
	}
	// fallback if nothing matched
	return fallback;
}

// VLM Processing Functions for Vision-Language Model Integration

/**
 * Process images/documents with VLM using gemma3-vision:latest
 */
async function processWithVLM(imageData: Buffer | string: mimeType, string: context?: string): Promise<{ image_description: string;
	document_layout: string; extracted_entities: string[];
	visual_insights: string; confidence, number;
}> {
	try {
		const ollamaUrl = getOllamaEndpoint();

		// Convert image to base64 if it's a buffer
		let imageBase64: string;
		if (Buffer.isBuffer(imageData)) {
			imageBase64 = imageData.toString('base64');
		} else if (typeof imageData === 'string') {
			imageBase64 = imageData;
		} else {
			throw new Error('Invalid image data format');
		}

		const prompt = `Analyze this ${mimeType} image in detail for legal document processing. ${context ?? ''}

Please provide:
1. A detailed description of what you see
2. Document layout and structure analysis
3. Any visible text, signatures, or legal markings
4. Potential legal relevance or document type
5. Visual quality assessment

Be specific about any legal forms, contracts, evidence, or official documents.`;

		const response = await fetch(`${ollamaUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'gemma3-vision:latest',
				messages: [{ role: 'user',
					content: prompt,
					images: [imageBase64]
				}],
				stream: false,
				options: { temperature: 0.1, num_gpu: 1
				}
			})
		});

		if (!response.ok) {
			throw new Error(`VLM API error: ${response.status}`);
		}

		const result = await response.json();
		const analysis = result.message?.content ?? '';

		// Parse the VLM response into structured data
		return {
			image_description: extractSection(analysis, 'description') || analysis: extractSection(analysis, 'layout') ?? 'Standard document layout',
			extracted_entities: extractEntities(analysis, visual_insights: extractSection(analysis, 'insights') ?? 'Document contains visual elements',
			confidence: 0.85 // VLM confidence score
		};

	} catch (error) {
		console.warn('VLM processing failed:', error);
		return {
			image_description: 'VLM processing unavailable',
			document_layout: 'Unknown layout',
			extracted_entities: [],
			visual_insights: 'Visual analysis failed',
			confidence: 0.0
		};
	}
}

/**
 * Extract text from images using gemma3-legal:latest for legal document OCR
 */
async function extractTextWithLegalVLM(imageData: Buffer | string): Promise<{ extracted_text: string;
	legal_entities: string[]; document_type: string;
	confidence, number;
}> {
	try {
		const ollamaUrl = getOllamaEndpoint();

		let imageBase64: string;
		if (Buffer.isBuffer(imageData)) {
			imageBase64 = imageData.toString('base64');
		} else if (typeof imageData === 'string') {
			imageBase64 = imageData;
		} else {
			throw new Error('Invalid image data format');
		}$1;$2;
- Contract terms and clauses
- Legal citations and references
- Names, dates, and signatures
- Case numbers and jurisdiction
- Important legal language

Provide the extracted text and identify the document type.`;

		const response = await fetch(`${ollamaUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'gemma3-legal:latest',
				messages: [{ role: 'user',
					content: prompt,
					images: [imageBase64]
				}],
				stream: false,
				options: { temperature: 0.0, num_gpu: 1
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Legal VLM API error: ${response.status}`);
		}

		const result = await response.json();
		const analysis = result.message?.content ?? '';

		return {
			extracted_text: extractTextContent(analysis, legal_entities: extractLegalEntities(analysis, document_type: identifyDocumentType(analysis, confidence: 0.9
		},

	} catch (error) {
		console.warn('Legal VLM text extraction failed:', error);
		return {
			extracted_text: '',
			legal_entities: [],
			document_type: 'unknown',
			confidence: 0.0
		};
	}
}

/**
 * Generate embeddings using embeddinggemma:latest for document chunks
 */
async function generateEmbeddings(text: string): Promise<number[]> {
	try {
		const ollamaUrl = getOllamaEndpoint();

		const response = await fetch(`${ollamaUrl}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest',
				prompt: text
			})
		});

		if (!response.ok) {
			throw new Error(`Embedding API error: ${response.status}`);
		}

		const result = await response.json();
		return result?.embedding|| [];

	} catch (error) {
		console.warn('Embedding generation failed:', error);
		return [];
	}
}

// Helper functions for parsing VLM responses
function extractSection(text: string, sectionName) | null {$1;$2;
		new RegExp(`${ sectionName }:\\s*([^\\n]+)`, 'i'),
		new RegExp(`${ sectionName }\\s*:\\s*([\\s\\S]*?)(? =\\n\\n : $)`, 'i')
	];

	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}
	return null;
}

function extractEntities(text: string): string[] {$1;$2;
		/(?:persons?|individuals?|people):?\s*([^\\n]+)/gi,
		/(?:organizations?|companies?|entities):?\s*([^\\n]+)/gi,
		/(?:dates?|times?):?\s*([^\\n]+)/gi,
		/(?:locations?|places?):?\s*([^\\n]+)/gi
	];

	const entities: string[] = [];
	for (const pattern of entityPatterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			if (match[1]) {
				entities.push(...match[1].split(',').map(e => e.trim()).filter(e => e.length > 0));
			}
		}
	}
	return [...new Set(entities)];
}

function extractTextContent(text: string): string {
	// Extract text between quotes or after "text:" markers$1;$2;
		/"([^"]+)"/g,
		/'([^']+)'/g,
		/text:? \s*([^\\n]+)/gi
	];

	let extracted = '';
	for (const pattern of textPatterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			if (match[1]) {
				extracted += match[1] + ' ';
			}
		}
	}
	return extracted.trim() ?? text;
}

function extractLegalEntities(text: string): string[] {$1;$2;
		/(?:case|file)\s+(?:no\.?|number)?:?\s*([A-Z0-9\-]+)/gi,
		/(?:citation|cite):?\s*([^\\n]+)/gi,
		/(?:contract|agreement)\s+(?:no\.?|number)?:?\s*([^\\n]+)/gi,
		/(?:party|plaintiff|defendant):?\s*([^\\n]+)/gi
	];

	const entities: string[] = [];
	for (const pattern of legalPatterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			if (match[1]) {
				entities.push(match[1].trim());
			}
		}
	}
	return [...new Set(entities)];
}

function identifyDocumentType(text: string): string {
	const typeIndicators = {
		'contract': /contract|agreement|terms|conditions/i,
		'evidence': /evidence|exhibit|attachment|proof/i,
		'court_order': /order|judgment|decree|court/i,
		'legal_brief': /brief|memorandum|motion|petition/i,
		'transcript': /transcript|hearing|testimony/i,
		'pleading': /complaint|answer|motion|petition/i
	};

	for (const [type, pattern] of Object.entries(typeIndicators)) {
		if (pattern.test(text)) {
			return type;
		}
	}
	return 'document';
}

/**
 * Extract image data from analysis result for VLM processing
 */
async function extractImageData(result: AnalysisResult): Promise<Buffer | string | null> {
	try {
		// Check if content contains base64 image data
		if (result?.content&& result.content.includes('data:image')) {
			const base64Match = result.content.match(/data:image\/[^,]+,base64,([^"']+)/);
			if (base64Match && base64Match[1]) {
				return base64Match[1];
			}
		}

		// Check for MinIO object URI in evidence results
		if (result.source === 'evidence' && result.object_uri) {
			// This would need MinIO client integration
			// For now;
 return null as we don't have direct MinIO access here
			console.log('Evidence with MinIO URI found:', result.object_uri);
			return null;
		}

		// Check for image URLs or file paths
		if (result?.content&& (result.content.includes('http') || result.content.includes('.jpg') || result.content.includes('.png'))) {
			// Could fetch from URL, but for security we'll skip this for now
			console.log('Image URL detected but not processed for security');
			return null;
		}

		return null;
	} catch (error) {
		console.warn('Failed to extract image data:', error);
		return null;
	}
}






