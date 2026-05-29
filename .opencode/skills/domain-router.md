# Skill: domain-router

## When to use
- Incoming user query or LLM prompt needs routing to an internal domain (e.g., code, legal, infra, evidence, admin).
- An agent must decide which retrieval lane (Qdrant codebase, legal documents, web search) to use.

## Goal
Return a compact routing decision that downstream steps (subdomain router, feature labeler, tool selector) can consume.

## Inputs
- `query` (string): the user's raw text
- `context` (object, optional): request metadata (route, file_path, case_id, user_id)

## Output
An intent routing object:

```json
{
  "domain": "code|legal|infra|evidence|admin|user-support",
  "subdomain": "search|explain|rewrite|ingest|audit",
  "confidence": 0.0,
  "reasons": ["contains: import", "matches: Stacktrace pattern"],
  "featureHints": ["cluster-card","pathway-synthesis"],
  "sourceRefs": []
}
```

## Process
1. Normalize text: lowercase, trim, remove stack traces (extract separately).
2. Run intent classifier (lightweight gemma/tagger) to produce domain probabilities.
3. Apply heuristic rules (file path present → code; case_id present → legal/evidence).
4. If confidence < 0.6, fallback to `ask-for-clarification` or route to `multi-lane` with ACE packet.
5. Emit `sourceRefs` for any explicit cues (file path, case id, feature tag).

## Signals & rules
- If `query` contains `import`, `function`, `.ts`, `svelte`, prefer `domain: code`.
- If `query` mentions `hearsay`, `statute`, prefer `domain: legal`.
- If `event` or `timeline` + `evidenceId` → `domain: evidence`.

## Notes
- Keep skill purely instructional; the actual classifier implementation is an agent/tool.
- This skill documents when to use the classifier and fallbacks.
