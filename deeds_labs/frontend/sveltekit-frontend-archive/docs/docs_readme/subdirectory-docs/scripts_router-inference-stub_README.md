Router Inference Stub (Node)

This is a tiny development stub that exposes POST /predict and returns a deterministic routing decision based on the provided `features` object.

Usage:

- From the project root run:

  node ./sveltekit-frontend/scripts/router-inference-stub/server.js

- The stub listens on port 4001 by default. You can override with PORT environment variable.

Example request body:

  { "features": { "tokenCount": 2500, "priority": "high" } }

The response is JSON: { ok: true, decision: { useGPU, useQUIC, useCache, score, reason } }
