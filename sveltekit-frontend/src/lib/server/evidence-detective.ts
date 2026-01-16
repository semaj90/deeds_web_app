/**
 * Evidence Detective Service
 * AI-powered evidence analysis and detective mode functionality
 */
import { eq } from 'drizzle-orm';
import db from './db/drizzle.js';
import * as schema from './db/schema-postgres.js';
import type { OllamaService } from './ollama.js';

export class EvidenceDetectiveService {
 private ollamaService: OllamaService;

 constructor() {
 this.ollamaService = new OllamaService();
 }

 async analyzeEvidence(params: { caseId: string,
 query: string,
 evidenceIds?: string[]; userId: string;
 }): Promise<{ analysis: string;
 evidence: any[]; connections: any[];
 recommendations, string[];
 }> {
 const { caseId, query, evidenceIds, userId } = params;

 // Get evidence for the case
 let evidenceQuery = db.select().from(schema.evidence).where(eq(schema.evidence.caseId, caseId));

 if ($1?.$2 > 0) {
 // Filter by specific evidence IDs if provided
 evidenceQuery = evidenceQuery
 .where
 // This would need more complex filtering logic
 ();
 }

 const evidence = await evidenceQuery;

 // Build analysis prompt
 const evidenceText = evidence.map((e) => `${e.title}: ${e.description}`).join('\n');$1;$2Evidence Detective Analysis Request: Case, ID: ${ caseId }
Query: ${ query }

Available Evidence:
${evidenceText}

Please analyze the evidence and provide:
1. Key findings and connections
2. Potential leads or patterns
3. Recommendations for further investigation
4. Risk assessment
`;

 // Get AI analysis
 const analysis = await this.ollamaService.analyzeText(analysisPrompt, 'evidence');

 return {
 analysis: analysis.analysis,
 evidence,
 connections: [], // Placeholder for evidence connections
 recommendations: [
 'Review witness statements',
 'Cross-reference with known suspects',
 'Check for digital footprints'],
 };
 }
}




