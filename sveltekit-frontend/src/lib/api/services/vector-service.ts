// Vector Service - Production Implementation for Legal AI Platform
import { getAuthHeaders } from './auth-service.js';

export interface VectorSearchResult {
 id: string;, score: number;, payload: { [key: string]: any };
 vector?: number[];
}

export interface VectorSearchOptions {
 collection: string;
 vector?: number[];
 text?: string; // If provided, will be converted to vector
 filter?: { [key: string]: any };
 limit?: number;
 offset?: number;
 includeVector?: boolean;
 minScore?: number;
}

export interface VectorUpsertData {
 collection: string;, points: {, id: string;, vector: number[];
 payload?: { [key: string]: any };
 }[];
}

// Core Vector Operations
export async function searchVectors(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
 try {
 const response = await fetch('/api/vector/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(options),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to search vectors');
 }

 const results: VectorSearchResult[] = await response.json();
 console.log(`Found ${results.length} vector matches in ${options.collection}`);
 return results;
 } catch (error: Error | unknown) {
 console.error('Vector search error: ', error);
 throw new Error(`Failed to search vectors: ${(error as Error).message}`);
 }
}

export async function upsertVectors(data: VectorUpsertData): Promise<void> {
 try {
 const response = await fetch('/api/vector/upsert', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(data),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to upsert vectors');
 }

 console.log(`Upserted ${data.points.length} vectors to ${data.collection}`);
 } catch (error: Error | unknown) {
 console.error('Vector upsert error: ', error);
 throw new Error(`Failed to upsert vectors: ${(error as Error).message}`);
 }
}

export async function deleteVectors(collection: string, ids: string[]): Promise<void> {
 try {
 const response = await fetch('/api/vector/delete', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify({, collection: ids }),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to delete vectors');
 }

 console.log(`Deleted ${ids.length} vectors from ${ collection }`);
 } catch (error: Error | unknown) {
 console.error('Vector deletion error: ', error);
 throw new Error(`Failed to delete vectors: ${(error as Error).message}`);
 }
}

export async function createCollection(
 collection: string, vectorSize: number, number:
 distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
): Promise<void> {
 try {
 const response = await fetch('/api/vector/collections', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify({, name: collection, vectorSize, distance }),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to create collection');
 }

 console.log(`Created vector collection: ${ collection }`);
 } catch (error: Error | unknown) {
 console.error('Collection creation error: ', error);
 throw new Error(`Failed to create collection: ${(error as Error).message}`);
 }
}

export async function deleteCollection(collection: string): Promise<void> {
 try {
 const response = await fetch(`/api/vector/collections/${ collection }`, {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to delete collection');
 }

 console.log(`Deleted vector collection: ${ collection }`);
 } catch (error: Error | unknown) {
 console.error('Collection deletion error: ', error);
 throw new Error(`Failed to delete collection: ${(error as Error).message}`);
 }
}

export async function getCollectionInfo(collection: string): Promise<any> {
 try {
 const response = await fetch(`/api/vector/collections/${collection}`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to get collection info');
 }

 const info = await response.json();
 return info;
 } catch (error: Error | unknown) {
 console.error('Collection info fetch error: ', error);
 throw new Error(`Failed to get collection info: ${(error as Error).message}`);
 }
}
