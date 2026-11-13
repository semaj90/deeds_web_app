const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let event;
try {
  event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
} catch {
  process.exit(0);
}

const prompt = typeof event.prompt === 'string' ? event.prompt : '';
const relevant = /parent\s*atlas|\batlas\b|\btrace\s*mcp\b|\bgan\b|phase\s*85|backfill|embedding|retrieval|cache|provenance|promotion|evidence pipeline|validation gate/i.test(prompt);
if (!relevant) process.exit(0);

const reminders = [
  'Parent Atlas evidence workflow: the existing `atlas-tools` MCP exposes `classify_intent`, `build_agentic_rag_context`, `find_source_refs`, `find_dependencies`, `trace_database`, `trace_tool_chain`, `find_feature`, and `find_route`; use only the relevant read-only lookup/context tools. The existing `trace` MCP allowlist is `trace.system_health`, `trace.explain_retrieval`, and `trace.validate_ace_hit`; use `trace.explain_retrieval` only for a relevant cached retrieval trace. Treat MCP results as discovery evidence, not authority; follow source refs to current code and preserve revisions. Never send raw retrieval hits directly to a model.',
  'GAN proof status must distinguish CREATED, WIRED, PROVEN, and DONE. Record the exact command, exact observed output, report/artifact path, revision, and scope. Run at least one relevant adversarial probe; tests are supporting evidence, not end-to-end proof. Keep replay, cache identity, provenance, and live execution as separate gates when applicable. Use PASS, FAIL, or PARTIAL only for the stated scope; PARTIAL means an environmental limitation.',
  'Embedding backfill admission: do not retry `--apply` while source/workspace revisions, target-column reconciliation, or embedding-model/producer pins are missing. A `BLOCKED_UNQUALIFIED_SOURCE_REVISION` receipt with `writesPerformed:false` is a successful fail-closed guard check, not a successful backfill or proof of produced embeddings.',
  'Do not let retrieval or a passing test mark OpenSpec tasks complete. Do not persist hidden reasoning, KV cache, or tensors. Keep PostgreSQL canonical and Valkey/Qdrant/GPU artifacts as derived or cached representations.'
].join('\n\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: reminders
  }
}));
