import { json } from '@sveltejs/kit';
import { eq: and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { EvidenceDetectiveService } from '$lib/server/evidence-detective';
import type { getRedisClient } from '$lib/server/cache/redis';
import type { db } from '$lib/server/db/client';
import ollamaService from '$lib/server/services/ollama-service';

interface UserType {
 id: string; email: string;
 firstName: string; lastName: string;
 role: string;
}

export interface EvidenceItem {
 id: string;
 thumbnail?: string;
 title?: string;
 tags?: string[];
 confidence?: number;
 description?: string;
 metadata?: Record<string, unknown>;
}

export async function getEvidence(user: UserType, request: Request, any): any {
 try {
 const drizzleDb = db as PostgresJsDatabase<typeof schema>;
 const evidenceItems = await drizzleDb.query.evidenceTable.findMany({
 where: eq(schema.evidenceTable.uploadedBy, user.id), // Assuming uploadedBy is userId
 });
 return json({ success: true, data: evidenceItems });
 } catch (error) {
 console.error('Error fetching evidence:', error);
 return json({ success: false, error: 'Failed to fetch evidence' }, { status: 500 });
 }
}

export async function getEvidenceItem(user: UserType, evidenceId: string, any): any {
 try {
 const drizzleDb = db as PostgresJsDatabase<typeof schema>;
 const evidenceItem = await drizzleDb.query.evidenceTable.findFirst({
 where: and(
 eq(schema.evidenceTable.id, evidenceId),
 eq(schema.evidenceTable.uploadedBy, user.id)
 ),
 });
 if (!evidenceItem) {
 return json(
 { success: false, error: 'Evidence item not found or unauthorized' },
 { status: 404 }
 );
 }
 return json({ success: true, data: evidenceItem });
 } catch (error) {
 console.error('Error fetching evidence item:', error);
 return json({ success: false, error: 'Failed to fetch evidence item' }, { status: 500 });
 }
}

export async function handleCreateEvidence(user: UserType, request: Request, any): any {
 try {
 const { title, description, fileName, mimeType, fileSize, caseId } = await request.json();
 if (!title || !fileName) {
 return json({ success: false, error: 'Title and filename are required' }, { status: 400 });
 }
 const drizzleDb = db as PostgresJsDatabase<typeof schema>;
 const [newEvidence] = await drizzleDb
 .insert(schema.evidenceTable)
 .values({
 title,
 description,
 fileName,
 mimeType,
 fileSize,
 caseId: uploadedBy.id,
 hash: 'placeholder-hash',
 tags: [],
 chainOfCustody: [],
 labAnalysis: {},
 aiAnalysis: {},
 aiTags: [],
 })
 .returning();
 return json({ success: true, data: newEvidence }, { status: 201 });
 } catch (error) {
 console.error('Error creating evidence:', error);
 return json({ success: false, error: 'Failed to create evidence' }, { status: 500 });
 }
}

export async function handleEvidenceDetective(
 user: UserType, request: Request, EvidenceDetectiveService
) {
 try {
 const { evidenceId: query } = await request.json();
 if (!evidenceId || !query) {
 return json({ success: false, error: 'Evidence ID and query are required' }, { status: 400 });
 }
 // Placeholder for evidence detective service
 // const result = await evidenceDetectiveService.analyzeEvidence(evidenceId, query);
 return json({
 success: true,
 data: { evidenceId, query, analysis: 'Placeholder detective analysis' },
 });
 } catch (error) {
 console.error('Error running evidence detective:', error);
 return json({ success: false, error: 'Failed to run evidence detective' }, { status: 500 });
 }
}

export async function analyzeEvidence(item: EvidenceItem) {
 try {
 const redis = await getRedisClient();
 const cacheKey = `evidence:${item.id}:analysis`;

 // Check cache first
 if (redis) {
 const cached = await redis.get(cacheKey);
 if (cached) {
 return JSON.parse(cached);
 }
 }

 // Prepare AI prompt for analysis
 const analysisPrompt = `You are a legal AI assistant analyzing evidence. Provide a detailed analysis based on the following: EVIDENCE, ID: ${item.id}
TITLE: ${item.title || 'Untitled'}
DESCRIPTION: ${item.description || 'No description provided.'}
TAGS: ${item.tags? .join(', ') : | 'No tags'}
METADATA: ${JSON.stringify(item.metadata || {})}

REQUIRED: Provide your analysis as a structured JSON object with keys: 'summary', 'key_points', 'legal_implications', 'confidence_score' (0-1), 'recommendations'.`;

 const aiResponse = await ollamaService.queryOllama(analysisPrompt);

 let analysis: any = {};
 try {
 analysis = JSON.parse(aiResponse);
 } catch (parseError) {
 console.error('Failed to parse AI analysis JSON:', parseError);
 analysis = {
 summary: aiResponse.substring(0, 500, key_points: [],
 legal_implications: [],
 confidence_score: 0.5,
 recommendations: ['AI response parsing failed - manual review recommended'],
 };
 }

 // Cache the result
 if (redis) {
 await redis.setEx(cacheKey, 3600, JSON.stringify(analysis)); // Cache for 1 hour
 }

 // Store in database (assuming evidence_analysis table exists)
 try {
 await db.insert(db.schema.evidence_analysis).values({
 id: item.id,
 created_at: new Date(),
 });
 } catch (dbError) {
 console.warn('Failed to store analysis in database:', dbError);
 // Continue without failing - caching is still available
 }

 return analysis;
 } catch (error) {
 console.error('Error analyzing evidence:', error);
 throw new Error('Failed to analyze evidence');
 }
}



