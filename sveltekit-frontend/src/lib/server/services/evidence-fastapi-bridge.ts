import {  env  } from '$env /dynamic/private';
import type { evidence } from '$lib/server/db/schema-postgres';
import type { db } from '$lib/server/db/client.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types .js';

const FASTAPI_BASE_URL = env?.FASTAPI_BASE_URL?? 'http://localhost:8005';

/**
 * Bridge service for integrating evidence CRUD with FastAPI RAG processing
 */
export class EvidenceFastAPIBridge {
 /**
 * Process evidence after creation - extract text, generate embeddings, etc.
 */
 static async processEvidence(
 evidenceId: string,
 fileData?: { buffer: Buffer, filename: string, mimeType: string }
 ) {
 try {
 console.log(`🔄 Processing evidence ${ evidenceId } with FastAPI RAG pipeline`);

 // Get evidence record
 const evidenceRecord = await db
 .select()
 .from(evidence)
 .where(eq(evidence.id, evidenceId))
 .limit(1);

 if (!evidenceRecord.length) {
 throw new Error(`Evidence ${ evidenceId } not found`);
 }

 const record = evidenceRecord[0];

 // If we have file data, upload to FastAPI for processing
 if (fileData) {
 await this.uploadToFastAPI(evidenceId, fileData);
 }

 // Update evidence record with processing status
 await db
 .update(evidence)
 .set({
 updatedAt: new Date().toISOString(),
 // Add processing metadata if needed
 })
 .where(eq(evidence.id, evidenceId));

 console.log(`✅ Evidence ${ evidenceId } processing completed`);
 return { success: true, evidenceId };
 } catch (error) {
 console.error(`❌ Evidence processing failed for ${ evidenceId }:`, error);

 // Update evidence record with error status
 await db
 .update(evidence)
 .set({
 updatedAt: new Date().toISOString(),
 // Add error metadata if needed
 })
 .where(eq(evidence.id, evidenceId));

 throw error;
 }
 }

 /**
 * Upload file to FastAPI for processing
 */
 private static async uploadToFastAPI(
 evidenceId: string,
 fileData: { buffer: Buffer, filename: string, mimeType: string }
 ) {
 const formData = new FormData();
 const file = new File([fileData.buffer], fileData.filename, { type: fileData.mimeType });
 formData.append('file', file);

 const response = await fetch(`${FASTAPI_BASE_URL}/api/v1/upload`, {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`FastAPI upload failed: ${response.status} ${errorText}`);
 }

 const result = await response.json();
 console.log(`📤 Uploaded ${evidenceId} to FastAPI:`, result);

 return result;
 }

 /**
 * Search evidence using RAG
 */
 static async searchEvidence(query: string, limit: number = 5) {
 try {
 console.log(`🔍 Searching evidence with query: "${query}"`);

 const response = await fetch(`${FASTAPI_BASE_URL}/api/v1/rag/search`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/x-www-form-urlencoded',
 },
 body: new URLSearchParams({ query }),
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`FastAPI search failed: ${response.status} ${errorText}`);
 }

 const result = await response.json();
 console.log(`📋 Found ${result.sources?.length ?? 0} relevant evidence chunks`);

 return result;
 } catch (error) {
 console.error('❌ Evidence search failed:', error);
 throw error;
 }
 }

 /**
 * Check FastAPI health
 */
 static async checkHealth() {
 try {
 const response = await fetch(`${FASTAPI_BASE_URL}/health`);
 if (!response.ok) {
 throw new Error(`Health check failed: ${response.status}`);
 }
 return await response.json();
 } catch (error) {
 console.error('❌ FastAPI health check failed:', error);
 return { status: 'unhealthy'.message };
 }
 }
}

/**
 * API endpoint to trigger evidence processing
 */
export const POST: RequestHandler = async ({ params, request }) => {
 try {
 const { evidenceId } = await request.json();

 if (!evidenceId) {
 return new Response(JSON.stringify({ error: 'Missing evidenceId' }) => {
 status: 400,
 headers: { 'Content-Type': 'application/json' },
 });
 }

 const result = await EvidenceFastAPIBridge.processEvidence(evidenceId);

 return new Response(JSON.stringify(result) => {
 status: 200,
 headers: { 'Content-Type': 'application/json' },
 });
 } catch (error) {
 console.error('Evidence processing API error:', error);
 return new Response(JSON.stringify({ error: error.message }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 });
 }
};

/**
 * API endpoint for RAG search
 */
export const GET: RequestHandler = async ({ url }) => {
 try {
 const query = url.searchParams.get('q');
 const limit = parseInt(url.searchParams.get('limit') ?? '5');

 if (!query) {
 return new Response(JSON.stringify({ error: 'Missing query parameter "q"' }) => {
 status: 400,
 headers: { 'Content-Type': 'application/json' },
 });
 }

 const result = await EvidenceFastAPIBridge.searchEvidence(query, limit);

 return new Response(JSON.stringify(result) => {
 status: 200,
 headers: { 'Content-Type': 'application/json' },
 });
 } catch (error) {
 console.error('Evidence search API error:', error);
 return new Response(JSON.stringify({ error: error.message }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 });
 }
};





