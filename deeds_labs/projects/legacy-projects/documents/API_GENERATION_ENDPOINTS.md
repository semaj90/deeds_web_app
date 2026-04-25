# AI Generation Endpoint Contracts

This document defines lightweight response contracts for the frontend worker fetch calls introduced in `nes-rl.js`.

## POST /api/ai/inference
General purpose generation (non-legal specialized) routed by orchestrator.

Request (application/json):
{
  "prompt": string,
  "model": "gemma:legal" | "gemma-270m-fast" | "gemma-270m-context" (optional),
  "temperature": number (optional),
  "maxTokens": number (optional)
}

Successful Response 200:
{
  "text": string,              // generated content
  "model": string,             // resolved model used
  "qualityScore": number,      // 0..1 heuristic quality/confidence
  "latencyMs": number,         // server measured latency
  "tokens": number,            // tokens generated (optional)
  "usage"?: { "prompt": number, "completion": number, "total": number }
}

Error Response 4xx/5xx:
{
  "error": string,
  "message"?: string
}

## POST /api/legal/analysis
Legal-specialized generation & structured reasoning.

Request:
{
  "prompt": string,
  "domain": string,            // e.g. "contracts", "ip", "litigation"
  "documentType": string,      // e.g. "msa", "nda", "brief"
  "model"?: "gemma:legal",
  "temperature"?: number,
  "maxTokens"?: number
}

Successful Response 200:
{
  "text": string,               // legal reasoning / analysis
  "model": string,
  "qualityScore": number,       // confidence estimate
  "citations"?: [{ "source": string, "relevance": number }],
  "issues"?: [{ "label": string, "risk": number, "summary": string }],
  "entities"?: [{ "type": string, "value": string }],
  "latencyMs": number,
  "tokens"?: number
}

Error Response:
{
  "error": string,
  "message"?: string
}

## Notes
- Both endpoints should be idempotent w.r.t identical prompt input if caching layer enabled.
- Frontend worker treats missing fields gracefully (falls back to synthetic fallback text already implemented).
- Consider adding ETag or hash-based caching for /api/ai/inference to speed repeated short prompts.
- Add structured validation (Zod or similar) server-side to ensure consistency.
