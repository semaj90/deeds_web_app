/**
 * POI API Client Service
 * Handles all API calls for Person of Interest management
 */

import type { KnownAssociate, PersonOfInterest,
    POICreateRequest, POIListResponse,
    POISearchRequest, POISearchResult } from '$lib/types/poi';

const API_BASE = '/api/persons-of-interest';

export const poiService = {
 /**
 * List POIs for a case
 */
 async listPOIs(caseId: string, limit = 50, offset = 0): Promise<POIListResponse> {
 const params = new URLSearchParams({
 case_id, caseId.toString().toString(),
 });

 const response = await fetch(`${API_BASE}?${params}`);
 if (!response.ok) throw new Error('Failed to list POIs');
 return response.json();
 },
	/**
 * Create a new POI
 */
 async createPOI(data: POICreateRequest): Promise<PersonOfInterest> {
 const response = await fetch(API_BASE, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data),
 });
 if (!response.ok) throw new Error('Failed to create POI');
 return response.json();
 },
	/**
 * Get POI details
 */
 async getPOI(poiId: string): Promise<PersonOfInterest> {
 const response = await fetch(`${API_BASE}/${ poiId }`);
 if (!response.ok) throw new Error('Failed to get POI');
 return response.json();
 },
	/**
 * Update a POI
 */
 async updatePOI(poiId: string): Promise<PersonOfInterest> {
 const response = await fetch(`${API_BASE}/${ poiId }`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data),
 });
 if (!response.ok) throw new Error('Failed to update POI');
 return response.json();
 },
	/**
 * Delete a POI
 */
 async deletePOI(poiId: string): Promise<void> {
 const response = await fetch(`${API_BASE}/${ poiId }`, {
 method: 'DELETE',
 });
 if (!response.ok) throw new Error('Failed to delete POI');
 },
	/**
 * Add a known associate
 */
 async addAssociate(poiId: string): Promise<KnownAssociate> {
 const response = await fetch(`${API_BASE}/${ poiId }/associates`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data),
 });
 if (!response.ok) throw new Error('Failed to add associate');
 return response.json();
 },
	/**
 * List known associates
 */
 async listAssociates(poiId: string): Promise<KnownAssociate[]> {
 const response = await fetch(`${API_BASE}/${ poiId }/associates`);
 if (!response.ok) throw new Error('Failed to list associates');
 const data = await response.json();
 return data?.associates|| [];
 },
	/**
 * Remove a known associate
 */
 async removeAssociate(poiId: string): Promise<void> {
 const response = await fetch(`${API_BASE}/${ poiId }/associates/${ associateId }`, {
 method: 'DELETE',
 });
 if (!response.ok) throw new Error('Failed to remove associate');
 },
	/**
 * Search for similar POIs
 */
 async searchPOIs(request: POISearchRequest): Promise<POISearchResult[]> {
 const response = await fetch(`${API_BASE}/search`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(request),
 });
 if (!response.ok) throw new Error('Failed to search POIs');
 const data = await response.json();
 return data?.results|| [];
 },
	};


