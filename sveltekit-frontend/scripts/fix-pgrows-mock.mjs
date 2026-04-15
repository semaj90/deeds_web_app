import { readFileSync, writeFileSync } from 'fs';

const files = [
  'tests/ace-pipeline-wiring.spec.ts',
  'tests/ace-status-route.spec.ts',
  'tests/ai-canon-routes.spec.ts',
  'tests/analytics-tags-nlp-prefs-routes.spec.ts',
  'tests/cache-recommendations-ml-sys-routes.spec.ts',
  'tests/cases-sub-routes.spec.ts',
  'tests/chat-session-attachment-handoff.spec.ts',
  'tests/contextual-knowledge-web-routes.spec.ts',
  'tests/docs-sync-cartridge-system-routes.spec.ts',
  'tests/error-brain-routes.spec.ts',
  'tests/errors-feedback-fictional-routes.spec.ts',
  'tests/glossary-health-routes.spec.ts',
  'tests/graph-detective-search-routes.spec.ts',
  'tests/infra-ollama-cache-routes.spec.ts',
  'tests/poi-citations-conversations-routes.spec.ts',
  'tests/reports-embed-chat-routes.spec.ts',
  'tests/retrieval-path-wiring.spec.ts',
  'tests/sse-chat-attachment-metadata.spec.ts',
  'tests/sse-chat-glossary-metadata.spec.ts',
  'tests/vision-gpu-tools-topology-routes.spec.ts',
];

// Fix 1: Add request to GET/PATCH/DELETE calls that don't have one
// Match patterns like: await GET({ url: ..., locals: ... })
// or: await GET({ params: ..., locals: ... })
// but NOT if 'request' is already present
let totalFixes = 0;
for (const f of files) {
  let c = readFileSync(f, 'utf8');
  let fileFixed = 0;

  // Pattern: await VERB({ ... locals: ... }) where VERB is GET, PATCH, DELETE
  // Add request if missing. We look for the closing }) of the call.
  // Match calls like:
  //   await GET({ url: mkUrl(...), locals: authedLocals })
  //   GET({ params: { id: '...' }, locals: { user: {...} } } as never)

  // Strategy: find all "await GET({" or "GET({" calls and check if they have request
  const verbs = ['GET', 'PATCH', 'DELETE'];
  for (const verb of verbs) {
    // Use a simple heuristic: find "verb({" and then check the next ~200 chars for "request"
    let searchFrom = 0;
    while (true) {
      const verbCall = `${verb}({`;
      const idx = c.indexOf(verbCall, searchFrom);
      if (idx === -1) break;

      // Find the matching closing })
      let depth = 0;
      let endIdx = idx + verb.length; // start from the (
      for (let i = endIdx; i < c.length && i < idx + 500; i++) {
        if (c[i] === '(') depth++;
        if (c[i] === ')') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }

      const callBody = c.substring(idx, endIdx + 1);

      // Skip if already has request
      if (callBody.includes('request')) {
        searchFrom = endIdx;
        continue;
      }

      // Skip if it's not an event object (e.g., it's GET({}) with no properties that look like event)
      if (!callBody.includes('locals') && !callBody.includes('params') && !callBody.includes('url')) {
        searchFrom = endIdx;
        continue;
      }

      // Add request before locals
      const localsIdx = callBody.indexOf('locals');
      if (localsIdx === -1) {
        searchFrom = endIdx;
        continue;
      }

      // Insert "request: new Request('http://localhost'), " before "locals"
      const insertAt = idx + localsIdx;
      c = c.slice(0, insertAt) + "request: new Request('http://localhost'), " + c.slice(insertAt);
      fileFixed++;
      searchFrom = insertAt + 80; // skip past what we just inserted
    }
  }

  if (fileFixed > 0) {
    writeFileSync(f, c);
    console.log(`FIXED ${f}: ${fileFixed} calls patched`);
    totalFixes += fileFixed;
  } else {
    console.log(`SKIP ${f}: no unpatched calls found`);
  }
}
console.log(`Total fixes: ${totalFixes}`);
