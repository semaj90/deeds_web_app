/**
 * @fileoverview Client-side wrapper for interacting with the Atlas Search API.
 * This module abstracts the network details of calling the /api/atlas/search endpoint.
 */

import type { AtlasSearchRequest, AtlasSearchResponse } from "$lib/server/atlas/atlas-search-contract";

/**
 * Executes a structured, multi-modal search against the Atlas backend.
 * @param {AtlasSearchRequest} request - The structured search parameters.
 * @returns {Promise<AtlasSearchResponse>} The fully ranked and structured search results.
 * @throws {Error} If the API call fails or returns a non-200 status.
 */
export async function searchAtlas(request: AtlasSearchRequest): Promise<AtlasSearchResponse> {
  // Assuming the current base URL is configured for the API route.
  const endpoint = "/api/atlas/search";

  // 1. Construct the request body
  const body = JSON.stringify(request);

  // 2. Execute the fetch call
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // In a real app, we'd pass auth headers here:
      // "Authorization": `Bearer ${userToken}`
    },
    body: body,
  });

  // 3. Handle non-200 responses
  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(`Atlas Search API failed with status ${response.status}: ${errorBody.error || 'Unknown error'}`);
  }

  // 4. Parse and return the structured response
  const data: AtlasSearchResponse = await response.json();
  return data;
}