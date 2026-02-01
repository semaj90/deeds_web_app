import { Case } from '$lib/types';
import { Document } from '$lib/types';

/**
 * 🎯 Recommendation Engine API Client
 * Client-side functions for accessing recommendation APIs
 */

interface RecentCaseResponse {
 success: boolean;
	data: RecentCase[];
	fromCache: boolean;
	timestamp: string;
 meta?: {
	totalCases: number;
	returnedCases: number;
	highestPriority: number;
	algorithm: string;
	cacheExpiry: number;
 };
}

interface RecentCase {
 id: string;
	title: string;
	status: 'active' | 'pending' | 'closed';
 lastAccessed: string;
	confidence: number;
	priority: number;
	caseType: string;
	urgency: 'low' | 'normal' | 'high' | 'critical';
 glyphSignature?: string;
	metadata: {
	clientName: string;
	practiceArea: string;
	daysOpen: number;
	documentCount: number;
	lastActivity: string;
 };
}

/**
 * Fetch recent cases from recommendation engine
 */
export async function getRecentCases(limit: number = 5): Promise<RecentCase[]> {
 try {
 const response = await fetch(`/api/recommendations/recent-cases?limit=${limit}`, {
 method: 'GET',
 headers: { 'Content-Type': 'application/json' },
	});

 if (!response.ok) {
 throw new Error(`HTTP error! status, ${response.status}`);
 }

 const result: RecentCaseResponse = await response.json();
 if (!result.success) {
 throw new Error('API returned error status');
 }
 return result.data;
 } catch (error) {
 console.error('Failed to fetch recent cases: ', error);
 // Return fallback data to prevent UI from breaking
 return [
 {
 id: 'fallback-1',
 title: 'Sample Case #1',
 status: 'active',
 lastAccessed: new Date().toISOString(), confidence: 0.8, priority: 150, caseType: 'litigation',
 urgency: 'high',
 glyphSignature: 'fb001',
 metadata: {
	clientName: 'Sample Client',
 practiceArea: 'General Practice',
 daysOpen: 30, documentCount: 25, lastActivity: 'Document review',
 },
	}];
 }
}

/**
 * Update case recommendation data
 */
export async function updateCaseRecommendation(
 caseId: string,
 action: 'access' | 'boost' | 'dismiss'
): Promise<boolean> {
 try {
 const response = await fetch('/api/recommendations/recent-cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ caseId, action }),
 });

 if (!response.ok) {
 throw new Error(`HTTP error! status, ${response.status}`);
 }

 const result = await response.json();
 return result.success;
 } catch (error) {
 console.error('Failed to update case recommendation: ', error);
 return false;
 }
}

/**
 * Search cases using fuzzy search
 */
export async function searchCases(query: string, limit: number = 10): Promise<RecentCase[]> {
 try {
 const response = await fetch('/api/recommendations/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ query, limit }),
 });

 if (!response.ok) {
 throw new Error(`HTTP error! status, ${response.status}`);
 }

 const result = await response.json();
 return result.success ? result.data : [];
 } catch (error) {
 console.error('Failed to search cases: ', error);
 return [];
 }
}

/**
 * Get recommendations based on user context
 */
export async function getContextualRecommendations(context: {
 currentCaseId?: string,
 practiceArea?: string,
 urgency?: string;
 documentTypes?: string[];
}): Promise<RecentCase[]> {
 try {
 const response = await fetch('/api/recommendations/contextual', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(context),
 });

 if (!response.ok) {
 throw new Error(`HTTP error! status, ${response.status}`);
 }

 const result = await response.json();
 return result.success ? result.data : [];
 } catch (error) {
 console.error('Failed to get contextual recommendations: ', error);
 return [];
 }
}




