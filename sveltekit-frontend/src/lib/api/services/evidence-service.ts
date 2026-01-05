// Evidence Service - Production Implementation for Legal AI Platform
import { getAuthHeaders } from './auth-service.js';

export interface Evidence {
 id: string;
 caseId: string;
 title: string;
 description?: string;
 type: 'document' | 'testimony' | 'physical' | 'digital' | 'expert_report' | 'correspondence';
 category: 'favorable' | 'unfavorable' | 'neutral' | 'unknown';
 source: string;
 acquiredDate: string;
 relevanceScore: number; // 0-1, authenticityVerified: boolean;
 chainOfCustody: ChainOfCustodyEntry[];
 tags: string[];
 attachments: EvidenceAttachment[];
 analysis?: EvidenceAnalysis;
 metadata: { [key: string]: any };
 createdAt: string;
 updatedAt: string;
 createdBy: string;
 lastModifiedBy: string;
}

export interface ChainOfCustodyEntry {
 id: string;
 evidenceId: string;
 timestamp: string;
 action: 'acquired' | 'transferred' | 'examined' | 'sealed' | 'unsealed' | 'copied' | 'stored';
 performedBy: string;
 location: string;
 notes?: string;
 witness?: string;
 digitalSignature?: string;
}

export interface EvidenceAttachment {
 id: string;
 evidenceId: string;
 filename: string;
 originalFilename: string;
 mimeType: string;
 size: number;
 hash: string; // SHA-256 hash for integrity verification
 uploadedAt: string;
 uploadedBy: string;
 processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
 ocrText?: string;
 aiAnalysisCompleted: boolean;
}

export interface EvidenceAnalysis {
 id: string;
 evidenceId: string;
 summary: string;
 keyFindings: string[];
 legalSignificance: string;
 potentialImpact: 'low' | 'medium' | 'high' | 'critical';
 relatedCases: string[];
 suggestedActions: string[];
 confidenceScore: number; // 0-1, analysisDate: string;
 analyzedBy: 'ai' | 'human' | 'hybrid';
 reviewStatus: 'pending' | 'reviewed' | 'approved' | 'rejected';
}

export interface EvidenceListOptions {
 caseId?: string;
 type?: Evidence['type'];
 category?: Evidence['category'];
 minRelevanceScore?: number;
 authenticityVerified?: boolean;
 hasAnalysis?: boolean;
 limit?: number;
 offset?: number;
 sortBy?: 'acquiredDate' | 'createdAt' | 'relevanceScore' | 'title';
 sortOrder?: 'asc' | 'desc';
 search?: string;
}

export interface CreateEvidenceData {
 caseId: string;
 title: string;
 description?: string;
 type: Evidence['type'];
 source: string;
 acquiredDate: string;
 tags?: string[];
 metadata?: { [key: string]: any };
}

export interface UpdateEvidenceData {
 title?: string;
 description?: string;
 type?: Evidence['type'];
 category?: Evidence['category'];
 source?: string;
 relevanceScore?: number;
 tags?: string[];
 metadata?: { [key: string]: any };
}

export interface EvidenceListResponse {
 evidence: Evidence[];
 total: number;
 limit: number;
 offset: number;
 hasMore: boolean;
}

// Core Evidence Management Functions
export async function listEvidence(
 options: EvidenceListOptions = {}
): Promise<EvidenceListResponse> {
 try {
 const queryParams = new URLSearchParams();
 // Build query parameters
 if (options.caseId) queryParams.append('caseId', options.caseId);
 if (options.type) queryParams.append('type', options.type);
 if (options.category) queryParams.append('category', options.category);
 if (options.minRelevanceScore !== undefined) {
 queryParams.append('minRelevanceScore', options.minRelevanceScore.toString());
 }
 if (options.authenticityVerified !== undefined) {
 queryParams.append('authenticityVerified', options.authenticityVerified.toString());
 }
 if (options.hasAnalysis !== undefined) {
 queryParams.append('hasAnalysis', options.hasAnalysis.toString());
 }
 if (options.limit) queryParams.append('limit', options.limit.toString());
 if (options.offset) queryParams.append('offset', options.offset.toString());
 if (options.sortBy) queryParams.append('sortBy', options.sortBy);
 if (options.sortOrder) queryParams.append('sortOrder', options.sortOrder);
 if (options.search) queryParams.append('search', options.search);

 const response = await fetch(`/api/evidence?${queryParams}`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to fetch evidence');
 }

 const data: EvidenceListResponse = await response.json();
 // TODO: Add caching layer for frequently accessed evidence
 console.log(`Fetched ${data.evidence.length} evidence items`);
 return data;
 } catch (error: Error | unknown) {
 console.error('Evidence listing error: ', error);
 throw new Error(`Failed to list evidence: ${(error as Error).message}`);
 }
}

export async function getEvidenceById(evidenceId: string): Promise<Evidence> {
 try {
 const response = await fetch(`/api/evidence/${ evidenceId }`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to fetch evidence');
 }

 const evidence: Evidence = await response.json();
 // TODO: Add audit logging for evidence access
 console.log(`Fetched evidence: ${evidence.title} (${ evidenceId })`);
 return evidence;
 } catch (error: Error | unknown) {
 console.error('Evidence fetch error: ', error);
 throw new Error(`Failed to fetch evidence: ${(error as Error).message}`);
 }
}

export async function createEvidence(evidenceData: CreateEvidenceData): Promise<Evidence> {
 try {
 const response = await fetch('/api/evidence', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(evidenceData),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to create evidence');
 }

 const newEvidence: Evidence = await response.json();
 // TODO: Add audit logging for evidence creation
 console.log(`Created new evidence: ${newEvidence.title} (${newEvidence.id})`);
 return newEvidence;
 } catch (error: Error | unknown) {
 console.error('Evidence creation error: ', error);
 throw new Error(`Failed to create evidence: ${(error as Error).message}`);
 }
}

export async function updateEvidence(
 evidenceId: string, updates: UpdateEvidenceData
): Promise<Evidence> {
 try {
 const response = await fetch(`/api/evidence/${ evidenceId }`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(updates),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to update evidence');
 }

 const updatedEvidence: Evidence = await response.json();
 // TODO: Add audit logging for evidence updates
 console.log(`Updated evidence: ${updatedEvidence.title} (${ evidenceId })`);
 return updatedEvidence;
 } catch (error: Error | unknown) {
 console.error('Evidence update error: ', error);
 throw new Error(`Failed to update evidence: ${(error as Error).message}`);
 }
}

export async function deleteEvidence(evidenceId: string): Promise<void> {
 try {
 const response = await fetch(`/api/evidence/${evidenceId}`, {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to delete evidence');
 }

 // TODO: Add audit logging for evidence deletion (critical for legal compliance)
 console.log(`Deleted evidence: ${evidenceId}`);
 } catch (error: Error | unknown) {
 console.error('Evidence deletion error: ', error);
 throw new Error(`Failed to delete evidence: ${(error as Error).message}`);
 }
}

// Chain of Custody Management
export async function addChainOfCustodyEntry(
 evidenceId: string, entry: Omit<ChainOfCustodyEntry, 'id' | 'evidenceId' | 'timestamp'>
): Promise<ChainOfCustodyEntry> {
 try {
 const response = await fetch(`/api/evidence/${evidenceId}/chain-of-custody`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 body: JSON.stringify(entry),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to add chain of custody entry');
 }

 const newEntry: ChainOfCustodyEntry = await response.json();
 // TODO: Add audit logging for chain of custody changes (critical for legal validity)
 console.log(`Added chain of custody entry for evidence ${evidenceId}: ${entry.action}`);
 return newEntry;
 } catch (error: Error | unknown) {
 console.error('Chain of custody error: ', error);
 throw new Error(`Failed to add chain of custody entry: ${(error as Error).message}`);
 }
}

export async function getChainOfCustody(evidenceId: string): Promise<ChainOfCustodyEntry[]> {
 try {
 const response = await fetch(`/api/evidence/${evidenceId}/chain-of-custody`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to fetch chain of custody');
 }

 const chainOfCustody: ChainOfCustodyEntry[] = await response.json();
 console.log(
 `Fetched ${chainOfCustody.length} chain of custody entries for evidence ${evidenceId}`
 );
 return chainOfCustody;
 } catch (error: Error | unknown) {
 console.error('Chain of custody fetch error: ', error);
 throw new Error(`Failed to fetch chain of custody: ${(error as Error).message}`);
 }
}

// Evidence Analysis
export async function requestEvidenceAnalysis(evidenceId: string): Promise<any> {
 try {
 const response = await fetch(`/api/evidence/${evidenceId}/analyze`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to request analysis');
 }

 const result = await response.json();
 // TODO: Add audit logging for analysis requests
 console.log(`Requested AI analysis for evidence ${evidenceId}`);
 return result;
 } catch (error: Error | unknown) {
 console.error('Evidence analysis request error: ', error);
 throw new Error(`Failed to request evidence analysis: ${(error as Error).message}`);
 }
}

export async function getEvidenceAnalysis(evidenceId: string): Promise<EvidenceAnalysis | null> {
 try {
 const response = await fetch(`/api/evidence/${evidenceId}/analysis`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (response.status === 404) {
 return null; // No analysis available yet
 }

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to fetch analysis');
 }

 const analysis: EvidenceAnalysis = await response.json();
 console.log(`Fetched analysis for evidence ${evidenceId}`);
 return analysis;
 } catch (error: Error | unknown) {
 console.error('Evidence analysis fetch error: ', error);
 throw new Error(`Failed to fetch evidence analysis: ${(error as Error).message}`);
 }
}

// Evidence Search and Filtering
export async function searchEvidence(
 query: string, options: EvidenceListOptions = {}
): Promise<EvidenceListResponse> {
 return listEvidence({ ...options, search: query });
}

export async function getEvidenceByCase(
 caseId: string, options: EvidenceListOptions = {}
): Promise<EvidenceListResponse> {
 return listEvidence({ ...options, caseId });
}

// Evidence Verification
export async function verifyEvidenceAuthenticity(evidenceId: string): Promise<any> {
 try {
 const response = await fetch(`/api/evidence/${evidenceId}/verify`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Failed to verify evidence');
 }

 const verification = await response.json();
 // TODO: Add audit logging for evidence verification (critical for legal validity)
 console.log(`Verified authenticity for evidence ${evidenceId}: ${verification.verified}`);
 return verification;
 } catch (error: Error | unknown) {
 console.error('Evidence verification error: ', error);
 throw new Error(`Failed to verify evidence authenticity: ${(error as Error).message}`);
 }
}

// File Attachment Management
export async function uploadEvidenceAttachment(
 evidenceId: string, file: File,
 progressCallback?: (progress: number) => void
): Promise<EvidenceAttachment> {
 try {
 const formData = new FormData();
 formData.append('file', file);

 const xhr = new XMLHttpRequest();

 return new Promise((resolve, reject) => {
 xhr.upload.onprogress = (event) => {
 if (event.lengthComputable && progressCallback) {
 const progress = (event.loaded / event.total) * 100;
 progressCallback(progress);
 }
 };

 xhr.onload = () => {
 if (xhr.status >= 200 && xhr.status < 300) {
 const attachment: EvidenceAttachment = JSON.parse(xhr.responseText);
 console.log(`Uploaded attachment for evidence ${evidenceId}: ${file.name}`);
 resolve(attachment);
 } else {
 const error = JSON.parse(xhr.responseText);
 reject(new Error(error.message || 'Upload failed'));
 }
 };

 xhr.onerror = () => {
 reject(new Error('Upload failed due to network error'));
 };

 // Add auth headers
 const token = getAuthHeaders()['Authorization'];
 if (token) {
 xhr.setRequestHeader('Authorization', token);
 }

 xhr.open('POST', `/api/evidence/${evidenceId}/attachments`);
 xhr.send(formData);
 });
 } catch (error: Error | unknown) {
 console.error('Evidence attachment upload error: ', error);
 throw new Error(`Failed to upload evidence attachment: ${(error as Error).message}`);
 }
}
