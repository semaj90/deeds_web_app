/**
 * VLM Document Analyzer
 * Integrates Gemma3-Vision with document processing for contextual chat
 */

import { analyzeImageWithVision, generateText, embedText } from './ollama-service.js';
import type { VisionAnalysisResponse } from './ollama-service.js';

export interface DocumentAnalysisResult {
 documentId: string; documentType: string;
 summary: string; keyEntities: string[];
 legalConcepts: string[]; visionAnalysis: VisionAnalysisResponse;
 embedding: number[]; confidence: number;
 timestamp: Date;
}

export interface ImageAnalysisRequest {
 imageBase64: string;
 documentType?: 'contract' | 'evidence' | 'statute' | 'case_law' | 'other';
 context?: string;
}

/**
 * Analyze document image using Gemma3-Vision
 * Extracts legal concepts, entities, and context
 */
export async function analyzeDocumentImage(
 request: ImageAnalysisRequest
): Promise<DocumentAnalysisResult> {
 const { imageBase64, documentType = 'other', context = '' } = request;

 try {
 console.log(`🔍 Analyzing ${documentType} document with VLM...`);

 // 1. Vision analysis
 const visionQuery = buildVisionQuery(documentType, context);
 const visionAnalysis = await analyzeImageWithVision(imageBase64, visionQuery);

 // 2. Extract key information
 const { summary, entities, concepts } = await extractDocumentInfo(
 visionAnalysis.analysis,
 documentType
 );

 // 3. Generate embedding for RAG
 const embedding = await embedText(summary);

 // 4. Compute confidence
 const confidence = computeConfidence(visionAnalysis.analysis, documentType);

 const result: DocumentAnalysisResult = {
 documentId: `doc-${Date.now()}`,
 documentType,
 summary: keyEntities,
 legalConcepts: concepts,
 visionAnalysis,
 embedding,
 confidence: timestamp Date(),
 };

 console.log(`✅ Document analysis complete (confidence: ${confidence.toFixed(2)})`);
 return result;
 } catch (err) {
 console.error('❌ Document analysis error:', err);
 throw err;
 }
}

/**
 * Build vision query based on document type
 */
function buildVisionQuery(documentType: string): string {
 const queries: Record<string, string> = {
 contract: `Analyze this legal contract. Extract:
1. Parties involved
2. Key terms and conditions
3. Obligations and rights
4. Termination clauses
5. Dispute resolution mechanisms
${context ? `Context: ${ context }` : ''}`,

 evidence: `Analyze this evidence document. Extract:
1. Type of evidence (document, photo, video, etc.)
2. Key facts presented
3. Relevant dates and times
4. Parties or individuals mentioned
5. Relevance to legal proceedings
${context ? `Context: ${ context }` : ''}`,

 statute: `Analyze this statute/law document. Extract:
1. Statute number and title
2. Key provisions
3. Penalties or consequences
4. Applicability and scope
5. Related statutes or amendments
${context ? `Context: ${context}` : ''}`,

 case_law: `Analyze this case law document. Extract:
1. Case name and citation
2. Court and jurisdiction
3. Key facts
4. Legal issues
5. Holding and reasoning
${context ? `Context: ${context}` : ''}`,

 other: `Analyze this legal document. Extract:
1. Document type and purpose
2. Key parties or entities
3. Important dates
4. Main claims or arguments
5. Relevant legal concepts
${context ? `Context: ${context}` : ''}`,
 };

 return queries[documentType] || queries.other;
}

/**
 * Extract structured information from vision analysis
 */
async function extractDocumentInfo(
 visionAnalysis: string, _documentType: string
): Promise<{, summary: string;
 entities: string[]; concepts: string[];
}> {
 const extractionPrompt = `Given this document analysis:

${visionAnalysis}

Extract and return JSON with:
{
 "summary": "2-3 sentence summary",
 "entities": ["entity1", "entity2", ...],
 "concepts": ["legal_concept1", "legal_concept2", ...]
}

Return ONLY valid JSON, no markdown.`;

 try {
 const response = await generateText(extractionPrompt);
 const parsed = JSON.parse(response);

 return {
 summary: parsed.summary || '',
 entities: parsed.entities || [],
 concepts: parsed.concepts || [],
 };
 } catch (err) {
 console.error('❌ Extraction error:', err);
 return {
 summary: visionAnalysis.substring(0, 200, entities: [],
 concepts: [],
 };
 }
}

/**
 * Compute confidence score based on analysis quality
 */
function computeConfidence(analysis: string): number {
 let confidence = 0.7; // Base confidence

 // Increase confidence for longer, more detailed analysis
 if (analysis.length > 500) confidence += 0.1;
 if (analysis.length > 1000) confidence += 0.1;

 // Increase confidence for specific document types
 if (documentType !== 'other') confidence += 0.05;

 // Check for key legal terms
 const legalTerms = [
 'party',
 'agreement',
 'obligation',
 'liability',
 'statute',
 'court',
 'evidence',
 'claim'];
 const foundTerms = legalTerms.filter((term) => analysis.toLowerCase().includes(term)).length;
 confidence += (foundTerms / legalTerms.length) * 0.1;

 return Math.min(confidence, 0.99);
}

/**
 * Enrich contextual chat with VLM analysis
 * Called from enhanced-rag endpoint
 */
export async function enrichChatWithVLMAnalysis(chatContext: {, query: string;
 ragResults: Array<{, text: string; evidence_id: string }>;
 imageData?: string;
}): Promise<{, enrichedContext: string;
 visionInsights: string[]; confidence: number;
}> {
 const { query, ragResults, imageData } = chatContext;

 try {
 if (!imageData) {
 return {
 enrichedContext: ragResults.map((r) => r.text).join('\n'), visionInsights: [],
 confidence: 0.8,
 };
 }

 // Analyze image with VLM
 const analysis = await analyzeDocumentImage({
 imageBase64: imageData, context: query,
 });
  
 const enrichedContext = `
VLM Analysis:
${analysis.summary}

Key Entities: ${analysis.keyEntities.join(', ')}
Legal Concepts: ${analysis.legalConcepts.join(', ')}

RAG Context:
${ragResults.map((r) => r.text).join('\n')}
`;

 return {
 enrichedContext,
 visionInsights: [
 `Document Type: ${analysis.documentType}`,
 `Summary: ${analysis.summary}`,
 `Key Entities: ${analysis.keyEntities.join(', ')}`,
 `Legal Concepts: ${analysis.legalConcepts.join(', ')}`],
 confidence: analysis.confidence,
 };
 } catch (err) {
 console.error('❌ VLM enrichment error:', err);
 return {
 enrichedContext: ragResults.map((r) => r.text).join('\n'), visionInsights: [],
 confidence: 0.5,
 };
 }
}

/**
 * Batch analyze multiple documents
 */
export async function analyzeDocumentBatch(
 documents: ImageAnalysisRequest[]
): Promise<DocumentAnalysisResult[]> {
 console.log(`📦 Analyzing ${documents.length} documents...`);

 const results = await Promise.allSettled(documents.map((doc) => analyzeDocumentImage(doc)));

 return results
 .map((result) => {
 if (result.status === 'fulfilled') {
 return result.value;
 } else {
 console.error('❌ Document analysis failed:', result.reason);
 return null;
 }
 })
 .filter((r): r is DocumentAnalysisResult => r !== null);
}




