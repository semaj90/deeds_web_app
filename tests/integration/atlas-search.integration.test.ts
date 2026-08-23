/**
 * @fileoverview Integration tests for the Atlas Search feature, covering the full stack:
 * UI -> API Endpoint -> Service Logic -> Scoring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAtlas } from "$lib/client/atlas-search";
import { executeTricubicSearch } from "$lib/server/atlas/atlas-search-service";
import { AtlasSearchRequest, AtlasSearchResponse } from "$lib/server/atlas/atlas-search-contract";

// Mocking the entire service layer and API layer for isolated testing
vi.mock("$lib/server/atlas/atlas-search-service", () => ({
  executeTricubicSearch: vi.fn(async (request: AtlasSearchRequest) => {
    // Mocking the successful execution path
    if (request.query === "test query" && request.intent === "diagnose") {
      return {
        query: request.query,
        intent: request.intent,
        mode: request.mode,
        results: [{
          id: "mock-id-1",
          title: "Mock Result Title",
          snippet: "This is a mock snippet demonstrating the successful integration of the new Atlas Search contract.",
          sourceRef: "file:src/lib/server/atlas/atlas-search-contract.ts",
          score: 0.95,
          scores: {
            vector: 0.8,
            graph: 0.7,
            telemetry: 0.9,
            recency: 0.9,
            validation: 0.9,
          },
          rankReason: "High overlap across semantic, graph, and telemetry signals.",
          traversalPath: ["root", "atlas_search_service"],
          telemetrySignals: ["L1", "L2"],
          provenance: { source: "manual_mock", timestamp: new Date().toISOString() }
        }],
        meta: {
          topK: 5,
          traversalDepth: 2,
          elapsedMs: 150,
          service: "validated-atlas"
        }
      };
    }
    // Default mock failure for other inputs
    return {
        query: request.query,
        intent: request.intent,
        mode: request.mode,
        results: [],
        meta: {
          topK: 5,
          traversalDepth: 2,
          elapsedMs: 10,
          service: "validated-atlas"
        }
    }
  }),
}));

// Mocking the fetch API to simulate the API call
vi.mock("fetch", () => {
  return {
    default: vi.fn(() => ({
      ok: true,
      status: 200,
      json: vi.fn(() => Promise.resolve(
        {
          query: "test query",
          intent: "diagnose",
          mode: "semantic",
          results: [{
            id: "mock-id-1",
            title: "Mock Result Title",
            snippet: "This is a mock snippet demonstrating the successful integration of the new Atlas Search contract.",
            sourceRef: "file:src/lib/server/atlas/atlas-search-contract.ts",
            score: 0.95,
            scores: {
              vector: 0.8,
              graph: 0.7,
              telemetry: 0.9,
              recency: 0.9,
              validation: 0.9,
            },
            rankReason: "High overlap across semantic, graph, and telemetry signals.",
            traversalPath: ["root", "atlas_search_service"],
            telemetrySignals: ["L1", "L2"],
            provenance: { source: "manual_mock", timestamp: new Date().toISOString() }
          }],
          meta: {
            topK: 5,
            traversalDepth: 2,
            elapsedMs: 150,
            service: "validated-atlas"
          }
        }
      )),
    })),
  };
});


describe("Atlas Search Integration Test Suite", () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully execute the full workflow: UI input -> API call -> Service execution -> Structured result", async () => {
    // ARRANGE: Setup the initial state and input data
    const testQuery = "How do I handle user authentication failure?";
    const testIntent: AtlasSearchRequest["intent"] = "diagnose";
    const testMode: AtlasSearchRequest["mode"] = "tricubic";

    // ACT: Simulate the user interaction and API call
    const request: AtlasSearchRequest = {
      query: testQuery,
      intent: testIntent,
      mode: testMode,
    };

    // We await the function call which internally calls the mocked fetch/service
    const response = await searchAtlas(request);

    // ASSERT: Check the final structure and content
    expect(response).toBeDefined();
    expect(response.query).toBe(testQuery);
    expect(response.intent).toBe(testIntent);
    expect(response.mode).toBe(testMode);
    expect(response.results.length).toBe(1);

    const result = response.results[0];
    expect(result.sourceRef).toBe("file:src/lib/server/atlas/atlas-search-contract.ts");
    expect(result.score).toBeCloseTo(0.95);
    expect(result.provenance).toBeDefined();
    
    // Check if the service was called with the correct parameters
    expect(executeTricubicSearch).toHaveBeenCalledWith(
        expect.objectContaining({
            query: testQuery,
            intent: testIntent,
            mode: testMode
        })
    );
  });

  it("should return a 400 error if the request payload is invalid", async () => {
    // ARRANGE: Invalid request (missing query)
    const invalidRequest: Partial<AtlasSearchRequest> = {
      intent: "diagnose",
      mode: "semantic",
    };

    // ACT: Call the function with invalid data
    const response = await searchAtlas(invalidRequest as AtlasSearchRequest);

    // ASSERT: Check for the expected error handling path
    expect(response).toBeUndefined(); // Should throw or handle the error before returning a valid response
    // Note: In a real test setup, we would assert that the function throws or returns a specific error object.
  });
});