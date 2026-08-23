/**
 * @fileoverview API endpoint for performing a structured, multi-modal Atlas Search.
 * This endpoint is the public-facing gateway for the new Atlas retrieval system.
 * It enforces authentication, validates the request, and calls the core service logic.
 */

import { json } from "@sveltejs/kit";
import { fail, redirect } from "sveltekit";
import { validateSchema } from "$lib/utils/schema-validator"; // Assuming a schema validator utility exists
import { executeTricubicSearch } from "$lib/server/atlas/atlas-search-service";
import type { AtlasSearchRequest, AtlasSearchResponse } from "$lib/server/atlas/atlas-search-contract";

/**
 * POST handler for the Atlas Search API.
 * @param {import { RequestEvent } & { request: Request }} event - The SvelteKit request event.
 * @returns {Promise<import { ActionData } | Response>} JSON response with search results.
 */
export async function POST({ event }: { event: import("sveltekit-kit").RequestEvent }) {
  // 1. Authentication and Authorization Check (CRITICAL RULE)
  // In a real application, this would check for a valid session/JWT.
  const user = event.cookies.get("user_session_token");
  if (!user) {
    // Fail fast if no user is authenticated.
    return json({ error: "Authentication required." }, { status: 401 });
  }

  // 2. Request Body Validation
  const body = await event.request.json();
  
  // Assuming a schema validator exists to validate against AtlasSearchRequest
  const validationResult = await validateSchema(body, { schema: "AtlasSearchRequest" });

  if (!validationResult.isValid) {
    return json({ error: "Invalid request payload.", details: validationResult.errors }, { status: 400 });
  }

  const request: AtlasSearchRequest = validationResult.data;

  // 3. Execute Core Service Logic
  try {
    // The service handles the complex, multi-modal orchestration.
    const response: AtlasSearchResponse = await executeTricubicSearch(request);
    
    // 4. Return Success
    return json(response, { status: 200 });

  } catch (error) {
    console.error("Atlas Search Execution Failed:", error);
    // Return a generic failure structure to maintain API contract stability
    return json({ 
      error: "Failed to execute Atlas Search.", 
      details: error instanceof Error ? error.message : "Unknown error." 
    }, { status: 500 });
  }
}